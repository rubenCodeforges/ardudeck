//! Deterministic simple guidance for the engine-only batch model (spec 1.b).
//!
//! A minimal cascaded-PID flight controller good enough to fly a canonical
//! profile: spin up, climb to altitude, hold hover, translate to a waypoint,
//! loiter, then descend and land. It is a PHYSICS PROBE, not a firmware emulator:
//! it answers "can this airframe physically hold/return inside its envelope at
//! this mass / wind / battery" and deliberately does NOT model ArduPilot's EKF,
//! mode logic or failsafes. It reads the clean physics state directly (no sensor
//! model) and is a pure function of that state, so a run is fully reproducible.
//!
//! Frames: world NED (x=north, y=east, z=down), body FRD. "Altitude"/height is
//! `-position.z` (up). Yaw is held at zero, so body x aligns with north and body
//! y with east; that keeps the attitude/mixer sign derivation simple. Output is a
//! per-motor PWM vector in MOT_1..N order, ready for `step_copter`.

use crate::frame::MultirotorParams;
use crate::frame_geometry::{frame_geometry, MotorMount};
use crate::math::Vec3;

/// Canonical mission the guidance flies (`takeoff_hover_translate_land`).
#[derive(Debug, Clone)]
pub struct GuidanceProfile {
    /// Seconds held on the ground spooling up before the climb starts.
    pub spin_up_s: f64,
    /// Target height above the ground/datum (m, +up). Flat ground => AGL.
    pub target_alt: f64,
    /// Translate destination in the horizontal plane (north, east) metres.
    pub waypoint: (f64, f64),
    /// Seconds to loiter over the waypoint before descending.
    pub loiter_s: f64,
    /// Launch point (north, east); the spawn position of the vehicle.
    pub home: (f64, f64),
}

impl GuidanceProfile {
    /// A straight-up hover-and-hold at `alt` with no translation (climb probe). The
    /// loiter never ends within a test window, so the vehicle holds altitude rather
    /// than proceeding to land.
    pub fn hover(alt: f64) -> GuidanceProfile {
        GuidanceProfile { spin_up_s: 1.0, target_alt: alt, waypoint: (0.0, 0.0), loiter_s: 1.0e9, home: (0.0, 0.0) }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase {
    SpinUp,
    Climb,
    Translate,
    Loiter,
    Land,
    Done,
}

// ─── Gains. Tuned to fly both the light quad and the heavy octa closed-loop
// (angular authority per unit mix command is ~g/arm, roughly frame-independent,
// so one conservative set holds). Deliberately gentle: a stable probe, not an
// aggressive tracker. ────────────────────────────────────────────────────────
const KP_ALT_POS: f64 = 1.0; // altitude error (m) -> desired climb rate (m/s)
const KP_ALT_VEL: f64 = 0.18; // climb-rate error (m/s) -> throttle
const KI_ALT: f64 = 0.20; // climb-rate error integral -> throttle
const ALT_I_LIMIT: f64 = 0.35; // anti-windup clamp on the altitude integrator
const MAX_CLIMB_RATE: f64 = 3.0; // m/s up
const MAX_DESCENT_RATE: f64 = 1.5; // m/s down (gentle landing)

const KP_POS: f64 = 0.5; // horizontal position error (m) -> desired velocity (m/s)
const KP_VEL: f64 = 0.5; // horizontal velocity error (m/s) -> desired accel (m/s^2)
const MAX_HORIZ_SPEED: f64 = 6.0; // m/s translate speed
const MAX_LEAN_RAD: f64 = 25.0 * std::f64::consts::PI / 180.0;

const KP_ATT: f64 = 0.9; // attitude error (rad) -> mix command
const KD_ATT: f64 = 0.25; // body rate (rad/s) -> mix command (damping)
const KP_YAW: f64 = 0.4; // yaw error (rad) -> yaw mix command
const KD_YAW: f64 = 0.15; // yaw rate (rad/s) -> yaw mix command

const G: f64 = 9.80665;

/// The guidance controller. Holds the mixer geometry, the mission profile, the
/// phase state machine, a rate-limited 3D setpoint and the integrator states.
pub struct Guidance {
    mounts: Vec<MotorMount>,
    arm: f64,
    pwm_min: f64,
    pwm_max: f64,
    hover_ff: f64,
    profile: GuidanceProfile,

    phase: Phase,
    // Rate-limited setpoint chased by the controllers (north, east, up).
    sp_n: f64,
    sp_e: f64,
    sp_h: f64,
    alt_i: f64,
    t: f64,
    loiter_started: f64,
}

impl Guidance {
    pub fn new(p: &MultirotorParams, profile: GuidanceProfile) -> Guidance {
        Guidance {
            mounts: frame_geometry(p.num_motors, p.diagonal_size),
            arm: p.diagonal_size.max(1e-3),
            pwm_min: p.pwm_min,
            pwm_max: p.pwm_max,
            hover_ff: p.hover_thr_out.clamp(0.05, 0.9),
            sp_n: profile.home.0,
            sp_e: profile.home.1,
            sp_h: 0.0,
            profile,
            phase: Phase::SpinUp,
            alt_i: 0.0,
            t: 0.0,
            loiter_started: 0.0,
        }
    }

    /// Current mission phase as a short label (for result metadata / debugging).
    pub fn phase_label(&self) -> &'static str {
        match self.phase {
            Phase::SpinUp => "spin_up",
            Phase::Climb => "climb",
            Phase::Translate => "translate",
            Phase::Loiter => "loiter",
            Phase::Land => "land",
            Phase::Done => "done",
        }
    }

    /// Advance the mission state machine, then compute the per-motor PWM for this
    /// step from the current vehicle state. `dt` advances the internal mission
    /// clock and rate-limited setpoint.
    pub fn update(&mut self, state: &crate::copter::VehicleState, dt: f64) -> Vec<f64> {
        self.t += dt;
        let n = state.position.x;
        let e = state.position.y;
        let h = -state.position.z;
        let horiz_dist = ((self.profile.waypoint.0 - n).powi(2) + (self.profile.waypoint.1 - e).powi(2)).sqrt();

        self.advance_phase(h, horiz_dist);

        // Phase target the rate-limited setpoint chases.
        let (tgt_n, tgt_e, tgt_h) = self.phase_target();
        self.sp_n = rate_limit(self.sp_n, tgt_n, MAX_HORIZ_SPEED, dt);
        self.sp_e = rate_limit(self.sp_e, tgt_e, MAX_HORIZ_SPEED, dt);
        let up_rate = if tgt_h >= self.sp_h { MAX_CLIMB_RATE } else { MAX_DESCENT_RATE };
        self.sp_h = rate_limit(self.sp_h, tgt_h, up_rate, dt);

        self.mix(state, dt)
    }

    fn phase_target(&self) -> (f64, f64, f64) {
        let (wn, we) = self.profile.waypoint;
        let (hn, he) = self.profile.home;
        let alt = self.profile.target_alt;
        match self.phase {
            Phase::SpinUp => (hn, he, 0.0),
            Phase::Climb => (hn, he, alt),
            Phase::Translate | Phase::Loiter => (wn, we, alt),
            Phase::Land | Phase::Done => (wn, we, 0.0),
        }
    }

    fn advance_phase(&mut self, h: f64, horiz_dist: f64) {
        match self.phase {
            Phase::SpinUp => {
                if self.t >= self.profile.spin_up_s {
                    self.phase = Phase::Climb;
                }
            }
            Phase::Climb => {
                // Reached altitude band: begin translating (or straight to loiter
                // when the waypoint is the launch point).
                if h >= self.profile.target_alt - 0.5 {
                    self.phase = Phase::Translate;
                }
            }
            Phase::Translate => {
                let at_wp = (self.sp_n - self.profile.waypoint.0).abs() < 0.1
                    && (self.sp_e - self.profile.waypoint.1).abs() < 0.1;
                if at_wp && horiz_dist < 1.5 {
                    self.phase = Phase::Loiter;
                    self.loiter_started = self.t;
                }
            }
            Phase::Loiter => {
                if self.t - self.loiter_started >= self.profile.loiter_s {
                    self.phase = Phase::Land;
                }
            }
            Phase::Land => {
                if h <= 0.3 {
                    self.phase = Phase::Done;
                }
            }
            Phase::Done => {}
        }
    }

    /// Cascaded controller + motor mix. Outer position/altitude loops produce a
    /// desired lean and collective; the inner attitude loop turns lean error into
    /// per-axis mix commands; the mixer distributes them over the motors.
    fn mix(&mut self, state: &crate::copter::VehicleState, dt: f64) -> Vec<f64> {
        let (roll, pitch, yaw) = state.attitude.to_euler();
        let gyro = state.angular_velocity;
        let n = state.position.x;
        let e = state.position.y;
        let h = -state.position.z;
        let vn = state.velocity.x;
        let ve = state.velocity.y;
        let climb = -state.velocity.z;

        // Altitude: outer P (error -> desired climb rate), inner PI (rate -> throttle).
        let des_climb = (KP_ALT_POS * (self.sp_h - h)).clamp(-MAX_DESCENT_RATE, MAX_CLIMB_RATE);
        let climb_err = des_climb - climb;
        self.alt_i = (self.alt_i + KI_ALT * climb_err * dt).clamp(-ALT_I_LIMIT, ALT_I_LIMIT);
        let collective = (self.hover_ff + KP_ALT_VEL * climb_err + self.alt_i).clamp(0.05, 1.0);

        // Horizontal: per-axis P (position -> velocity) then P (velocity -> accel),
        // capped at the lean-limited horizontal acceleration.
        let amax = G * MAX_LEAN_RAD.tan();
        let des_vn = (KP_POS * (self.sp_n - n)).clamp(-MAX_HORIZ_SPEED, MAX_HORIZ_SPEED);
        let des_ve = (KP_POS * (self.sp_e - e)).clamp(-MAX_HORIZ_SPEED, MAX_HORIZ_SPEED);
        let a_n = (KP_VEL * (des_vn - vn)).clamp(-amax, amax);
        let a_e = (KP_VEL * (des_ve - ve)).clamp(-amax, amax);

        // Desired lean (yaw held 0): +north accel needs nose-down (negative pitch);
        // +east accel needs positive roll. Small-angle inversion of the thrust tilt.
        let des_pitch = (-a_n / G).clamp(-MAX_LEAN_RAD, MAX_LEAN_RAD);
        let des_roll = (a_e / G).clamp(-MAX_LEAN_RAD, MAX_LEAN_RAD);

        // Inner attitude loop: PD (error and body-rate damping) -> mix commands.
        let roll_cmd = KP_ATT * (des_roll - roll) - KD_ATT * gyro.x;
        let pitch_cmd = KP_ATT * (des_pitch - pitch) - KD_ATT * gyro.y;
        let yaw_cmd = KP_YAW * wrap_pi(0.0 - yaw) - KD_YAW * gyro.z;

        // Mix. A motor at body (x,y) making upward thrust makes roll moment -T*y and
        // pitch moment +T*x, so raise thrust on -y motors for +roll and +x motors
        // for +pitch; yaw follows the motor's spin (yaw_factor). Arm-normalised.
        let mut out = Vec::with_capacity(self.mounts.len());
        for m in &self.mounts {
            let cmd = collective
                + roll_cmd * (-m.position.y / self.arm)
                + pitch_cmd * (m.position.x / self.arm)
                + yaw_cmd * m.yaw_factor;
            out.push(self.pwm_min + cmd.clamp(0.0, 1.0) * (self.pwm_max - self.pwm_min));
        }
        out
    }
}

/// Move `cur` toward `tgt` by at most `rate * dt`.
fn rate_limit(cur: f64, tgt: f64, rate: f64, dt: f64) -> f64 {
    let step = rate * dt;
    let d = tgt - cur;
    if d.abs() <= step {
        tgt
    } else {
        cur + step * d.signum()
    }
}

/// Wrap an angle to (-pi, pi].
fn wrap_pi(a: f64) -> f64 {
    let two_pi = 2.0 * std::f64::consts::PI;
    let mut x = a % two_pi;
    if x > std::f64::consts::PI {
        x -= two_pi;
    } else if x <= -std::f64::consts::PI {
        x += two_pi;
    }
    x
}

/// Tilt (angle of the body-up axis from world-up), degrees. Shared by the runner.
pub fn tilt_deg(state: &crate::copter::VehicleState) -> f64 {
    // Body up is -z (FRD): rotate it to world and measure the angle from world up.
    let up_world = state.attitude.rotate_body_to_world(Vec3::new(0.0, 0.0, -1.0));
    // world up is (0,0,-1); cos(tilt) = up_world . (0,0,-1) = -up_world.z.
    (-up_world.z).clamp(-1.0, 1.0).acos().to_degrees()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::copter::{initial_state, step_copter, Environment, StepOptions, VehicleState, DEFAULT_ENVIRONMENT};
    use crate::frame::{multirotor_params, FrameModel};

    const DT: f64 = 1.0 / 400.0;

    fn light_quad() -> MultirotorParams {
        multirotor_params(&FrameModel { mass: 1.5, diagonal_size: 0.4, ..Default::default() })
    }

    fn heavy_octa() -> MultirotorParams {
        multirotor_params(&FrameModel {
            mass: 32.5,
            diagonal_size: 1.325,
            ref_spd: 25.0,
            ref_angle: 30.0,
            ref_voltage: 46.9,
            ref_current: 65.36,
            ref_alt: 26.0,
            max_voltage: 50.4,
            hover_thr_out: 0.36,
            prop_expo: 0.5,
            ref_rot_rate: 120.0,
            pwm_min: 1000.0,
            pwm_max: 1940.0,
            spin_min: 0.2,
            spin_max: 0.975,
            disc_area: 1.82,
            mdrag_coef: 0.10,
            num_motors: 8.0,
        })
    }

    /// Fly the guidance closed-loop through step_copter for `secs` and return the
    /// full final state plus the highest phase reached.
    fn fly(p: &MultirotorParams, profile: GuidanceProfile, env: &Environment, secs: f64) -> (VehicleState, String) {
        let mut g = Guidance::new(p, profile);
        let mut s = initial_state();
        let steps = (secs / DT) as usize;
        for _ in 0..steps {
            let pwm = g.update(&s, DT);
            s = step_copter(&pwm, &s, p, env, DT, StepOptions { ground_effect: true, ..StepOptions::default() });
        }
        (s, g.phase_label().to_string())
    }

    #[test]
    fn quad_climbs_to_and_holds_hover() {
        let p = light_quad();
        let (s, _) = fly(&p, GuidanceProfile::hover(20.0), &DEFAULT_ENVIRONMENT, 25.0);
        let h = -s.position.z;
        assert!((h - 20.0).abs() < 1.5, "quad should hold 20 m, got {h}");
        assert!(s.velocity.z.abs() < 0.6, "should be near-stationary vertically, vz={}", s.velocity.z);
        assert!(tilt_deg(&s) < 10.0, "should be roughly level, tilt {}", tilt_deg(&s));
    }

    #[test]
    fn octa_climbs_to_and_holds_hover() {
        let p = heavy_octa();
        let (s, _) = fly(&p, GuidanceProfile::hover(30.0), &DEFAULT_ENVIRONMENT, 30.0);
        let h = -s.position.z;
        assert!((h - 30.0).abs() < 2.0, "octa should hold 30 m, got {h}");
        assert!(s.velocity.z.abs() < 0.8, "vz={}", s.velocity.z);
        assert!(tilt_deg(&s) < 12.0, "tilt {}", tilt_deg(&s));
    }

    #[test]
    fn translates_to_waypoint_and_lands() {
        let p = heavy_octa();
        let profile = GuidanceProfile {
            spin_up_s: 1.0,
            target_alt: 25.0,
            waypoint: (40.0, 0.0),
            loiter_s: 3.0,
            home: (0.0, 0.0),
        };
        let (s, phase) = fly(&p, profile, &DEFAULT_ENVIRONMENT, 60.0);
        // Reached the waypoint horizontally.
        assert!((s.position.x - 40.0).abs() < 4.0, "north should reach ~40, got {}", s.position.x);
        assert!(s.position.y.abs() < 4.0, "east should stay ~0, got {}", s.position.y);
        // And came back down (landed / near ground).
        assert!(-s.position.z < 1.0, "should have descended, height {}", -s.position.z);
        assert_eq!(phase, "done", "should have completed the mission");
    }

    #[test]
    fn holds_hover_in_wind() {
        // A steady crosswind must not blow the probe out of a loose position box:
        // the horizontal loop leans into it and holds station within a few metres.
        let p = heavy_octa();
        let env = Environment { wind: Vec3::new(6.0, 0.0, 0.0), ..DEFAULT_ENVIRONMENT };
        let (s, _) = fly(&p, GuidanceProfile::hover(30.0), &env, 40.0);
        let h = -s.position.z;
        assert!((h - 30.0).abs() < 3.0, "should hold altitude in wind, got {h}");
        assert!(s.position.x.abs() < 8.0, "should hold station against wind, north drift {}", s.position.x);
    }

    #[test]
    fn deterministic_same_output_each_run() {
        let p = heavy_octa();
        let mk = || {
            let mut g = Guidance::new(&p, GuidanceProfile::hover(20.0));
            let mut s = initial_state();
            let mut last = vec![];
            for _ in 0..2000 {
                last = g.update(&s, DT);
                s = step_copter(&last, &s, &p, &DEFAULT_ENVIRONMENT, DT, StepOptions::default());
            }
            (s, last)
        };
        let (s1, p1) = mk();
        let (s2, p2) = mk();
        assert_eq!(s1.position, s2.position);
        for (a, b) in p1.iter().zip(p2.iter()) {
            assert_eq!(a.to_bits(), b.to_bits());
        }
    }
}
