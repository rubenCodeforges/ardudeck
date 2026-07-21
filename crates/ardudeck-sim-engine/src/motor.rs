//! Port of ArduPilot SITL SIM_Motor.cpp (Motor::calculate_forces, calc_thrust,
//! pwm_to_command). One `motor_forces` call reproduces the per-motor thrust,
//! torque and current of stock SITL. Variable-pitch rotors, tilt servos and the
//! command slew limiter are omitted (see notes); ArduDeck models fixed-pitch
//! multirotors only.

use crate::frame::MultirotorParams;
use crate::frame_geometry::MotorMount;
use crate::math::Vec3;
use std::f64::consts::PI;

/// Per-motor fault state. Every field's identity value leaves `motor_forces`
/// output bit-identical to the healthy path (see `motor_forces` delegation and
/// the `healthy_fault_is_byte_identical` test). Faults are PHYSICAL modifications
/// to the momentum-theory motor calc, so the resulting force/torque/current
/// asymmetry is what the firmware then reacts to (docs/superpowers/specs/
/// 2026-07-20-failure-physics-design.md).
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct MotorFault {
    /// Effective disc-area multiplier (prop damage / erosion). 1.0 = intact.
    /// Scales `effective_prop_area` LINEARLY, so thrust scales linearly.
    pub prop_area_scale: f64,
    /// Max-outflow-velocity multiplier (tip loss, pitch change). 1.0 = nominal.
    /// Scales `velocity_out`, so thrust scales with its SQUARE.
    pub outflow_scale: f64,
    /// Fraction 0..1 of pack voltage this ESC actually delivers (brownout).
    /// 1.0 = healthy. Effective voltage_scale < 0.1 hits the dead-motor early
    /// return and zeroes the motor.
    pub voltage_avail: f64,
    /// Per-motor momentum-drag multiplier (asymmetric drag). 1.0 = nominal.
    pub drag_scale: f64,
    /// Extra current (A) at full command from bearing friction, added on top of
    /// the power_factor current and coupled back into battery sag.
    pub bearing_drag_current: f64,
    /// Fraction 0..1 of thrust lost to bearing friction (shaft power robbed).
    pub bearing_thrust_loss: f64,
    /// Rotating-unbalance amplitude as a fraction of motor_thrust. 0 = balanced.
    pub imbalance: f64,
    /// Hard kill (wire break / seizure): zero thrust, torque and current.
    pub dead: bool,
}

impl Default for MotorFault {
    fn default() -> Self {
        MotorFault {
            prop_area_scale: 1.0,
            outflow_scale: 1.0,
            voltage_avail: 1.0,
            drag_scale: 1.0,
            bearing_drag_current: 0.0,
            bearing_thrust_loss: 0.0,
            imbalance: 0.0,
            dead: false,
        }
    }
}

impl MotorFault {
    /// True when this fault is fully healthy (a no-op in `motor_forces`).
    pub fn is_healthy(&self) -> bool {
        *self == MotorFault::default()
    }

    /// Active sub-faults as `(kind, severity)` for the WS `faults` report. Empty
    /// when healthy. Severities are the "how bad" 0..1 view of each field.
    pub fn active(&self) -> Vec<(&'static str, f64)> {
        let mut v = Vec::new();
        if self.dead {
            v.push(("motor_out", 1.0));
        }
        if self.prop_area_scale < 1.0 {
            v.push(("thrust_loss", 1.0 - self.prop_area_scale));
        }
        if self.outflow_scale < 1.0 {
            v.push(("outflow_loss", 1.0 - self.outflow_scale));
        }
        if self.voltage_avail < 1.0 {
            v.push(("brownout", 1.0 - self.voltage_avail));
        }
        if self.drag_scale > 1.0 {
            v.push(("asym_drag", self.drag_scale - 1.0));
        }
        if self.bearing_thrust_loss > 0.0 || self.bearing_drag_current > 0.0 {
            v.push(("bearing_drag", self.bearing_thrust_loss));
        }
        if self.imbalance > 0.0 {
            v.push(("imbalance", self.imbalance));
        }
        v
    }
}

/// Per-motor result in the body frame (FRD, Z down). `thrust_bf` in newtons,
/// `torque_bf` in newton-metres, `current` in amps.
///
/// The fields after `current` are pure observability outputs: they are values
/// `motor_forces` already computes internally and previously discarded. They do
/// not alter any physics; existing callers read `thrust_bf`/`torque_bf`/`current`
/// exactly as before. See docs/superpowers/specs/2026-07-20-engine-observability.
#[derive(Debug, Clone, Copy)]
pub struct MotorOutput {
    pub thrust_bf: Vec3,
    pub torque_bf: Vec3,
    pub current: f64,
    /// Normalised throttle 0..1 after the MOT_SPIN_MIN/MAX band (pwm_to_command).
    pub command: f64,
    /// Scalar rotor lift before per-motor momentum drag (calc_thrust result, N).
    pub thrust_mag: f64,
    /// Induced inflow velocity into the disc along the thrust axis (m/s).
    pub velocity_in: f64,
    /// Per-motor momentum drag vector already folded into `thrust_bf`
    /// (`thrust_bf = pure_thrust - momentum_drag`). Zero when `use_drag` is false.
    pub momentum_drag: Vec3,
    /// Far-wake slipstream speed `velocity_out` this step (m/s): the fully
    /// developed axial column speed the thrust model already computed. This is the
    /// wake source `w_r` a neighbour vehicle samples (spec 2.5); pure observability,
    /// it changes no physics. Zero for a dead / browned-out motor.
    pub slipstream_velocity: f64,
}

/// Convert a PWM value to a 0..1 command, using MOT_SPIN_MIN/MAX to define the
/// active PWM band (SIM_Motor.cpp pwm_to_command, lines 224-230).
pub fn pwm_to_command(pwm: f64, p: &MultirotorParams) -> f64 {
    let span = p.pwm_max - p.pwm_min;
    let pwm_thrust_max = p.pwm_min + p.spin_max * span;
    let pwm_thrust_min = p.pwm_min + p.spin_min * span;
    let range = pwm_thrust_max - pwm_thrust_min;
    if range <= 0.0 {
        return 0.0;
    }
    ((pwm - pwm_thrust_min) / range).clamp(0.0, 1.0)
}

/// Thrust of one motor given its command (SIM_Motor.cpp calc_thrust, 235-247).
/// `voltage_scale` = voltage / voltage_max; `velocity_in` is the inflow velocity.
/// `effective_prop_area` and `max_outflow_velocity` are passed in (rather than
/// read from `p`) so a fault can scale them per-motor; the healthy path passes
/// `p.effective_prop_area` / `p.max_outflow_velocity` and is bit-identical.
fn calc_thrust(
    command: f64,
    air_density: f64,
    velocity_in: f64,
    voltage_scale: f64,
    prop_expo: f64,
    effective_prop_area: f64,
    max_outflow_velocity: f64,
) -> (f64, f64) {
    // (1-expo)*command + expo*command^2, guarded against a negative radicand for
    // out-of-range expo (ArduPilot leaves it unguarded; command is 0..1 so with
    // expo in [0,1] the argument is already non-negative).
    let curve = ((1.0 - prop_expo) * command + prop_expo * command * command).max(0.0);
    let velocity_out = voltage_scale * max_outflow_velocity * curve.sqrt();
    // Return the far-wake speed alongside the thrust; it is the wake source w_r a
    // neighbour samples. The thrust arithmetic is unchanged (byte-identical).
    let thrust =
        0.5 * air_density * effective_prop_area * (velocity_out * velocity_out - velocity_in * velocity_in);
    (thrust, velocity_out)
}

/// Rotor mechanical angular speed Omega (rad/s) for phase integration (§1b): the
/// prop outflow velocity over the rotor radius. Tracks command AND voltage (and
/// any outflow/voltage fault), so a vibration harmonic built from it responds to
/// the firmware's RPM/ESC harmonic notch. Zero for a dead / browned-out motor.
pub fn rotor_omega(pwm: f64, p: &MultirotorParams, voltage: f64, fault: &MotorFault) -> f64 {
    if fault.dead {
        return 0.0;
    }
    let command = pwm_to_command(pwm, p);
    let voltage_scale = voltage * fault.voltage_avail / p.voltage_max;
    if voltage_scale < 0.1 {
        return 0.0;
    }
    let curve = ((1.0 - p.prop_expo) * command + p.prop_expo * command * command).max(0.0);
    let velocity_out = voltage_scale * (p.max_outflow_velocity * fault.outflow_scale) * curve.sqrt();
    let rotor_radius = (p.true_prop_area / PI).sqrt();
    if rotor_radius <= 0.0 {
        return 0.0;
    }
    velocity_out / rotor_radius
}

/// Port of Motor::calculate_forces (SIM_Motor.cpp 25-150) for a fixed-pitch,
/// non-tilting HEALTHY motor. Delegates to `motor_forces_faulted` with an
/// identity fault and zero rotor phase, so this path is bit-identical to the
/// pre-fault code and every existing caller is unchanged.
#[allow(clippy::too_many_arguments)]
pub fn motor_forces(
    pwm: f64,
    mount: &MotorMount,
    p: &MultirotorParams,
    air_density: f64,
    voltage: f64,
    velocity_air_bf: Vec3,
    gyro: Vec3,
    use_drag: bool,
) -> MotorOutput {
    motor_forces_faulted(
        pwm,
        mount,
        p,
        air_density,
        voltage,
        velocity_air_bf,
        gyro,
        use_drag,
        1.0,
        &MotorFault::default(),
        0.0,
    )
}

/// Port of Motor::calculate_forces with an injected per-motor `fault` and the
/// caller-integrated `rotor_phase` (radians) for the rotating-unbalance term. A
/// `MotorFault::default()` fault with any `rotor_phase` where `imbalance == 0`
/// (and `ground_effect_factor == 1.0`) reproduces the healthy output exactly
/// (identity multipliers, `+= 0.0`).
///
/// `ground_effect_factor` is the Cheeseman-Bennett in-ground-effect thrust boost
/// for this rotor's height (>= 1.0, 1.0 out of ground effect). It multiplies the
/// disc thrust the command yields, so yaw reaction torque and the imbalance force
/// scale with the boosted thrust too (all physically consistent). 1.0 is a no-op.
#[allow(clippy::too_many_arguments)]
pub fn motor_forces_faulted(
    pwm: f64,
    mount: &MotorMount,
    p: &MultirotorParams,
    air_density: f64,
    voltage: f64,
    velocity_air_bf: Vec3,
    gyro: Vec3,
    use_drag: bool,
    ground_effect_factor: f64,
    fault: &MotorFault,
    rotor_phase: f64,
) -> MotorOutput {
    // §1f full motor-out: a seized / open-phase motor makes no thrust, no rotor
    // drag torque and draws no current.
    if fault.dead {
        return zeroed_output();
    }

    let command = pwm_to_command(pwm, p);
    // §1c ESC brownout: the ESC only delivers a fraction of the pack voltage.
    let motor_voltage = voltage * fault.voltage_avail;
    let voltage_scale = motor_voltage / p.voltage_max;
    if voltage_scale < 0.1 {
        // Battery is dead / ESC browned out: no thrust, torque or current.
        return zeroed_output();
    }

    // NOTE: the command slew limiter (SIM_Motor.cpp 65-73) is intentionally
    // skipped; at our integration rates the per-step command change is small and
    // the limiter needs per-motor state we do not carry.

    let thrust_vector = Vec3::new(0.0, 0.0, -1.0); // straight up in body FRD

    // Velocity of the motor through the air, including the component from vehicle
    // rotation: motor_vel = velocity_air_bf + -(position % gyro).
    let motor_vel = velocity_air_bf.add(mount.position.cross(gyro).scale(-1.0));

    // Inflow velocity into the prop, clipped at zero:
    //   velocity_in = MAX(0, -motor_vel.projected(thrust_vector).z)
    // With thrust_vector = (0,0,-1) this reduces to MAX(0, -motor_vel.z), but we
    // keep the projection so it stays faithful to the source.
    let tt = thrust_vector.dot(thrust_vector);
    let projected = thrust_vector.scale(motor_vel.dot(thrust_vector) / tt);
    let velocity_in = (-projected.z).max(0.0);

    // §1a prop damage / erosion: scale disc area (linear) and outflow (squared).
    let effective_prop_area = p.effective_prop_area * fault.prop_area_scale;
    let max_outflow_velocity = p.max_outflow_velocity * fault.outflow_scale;
    let (thrust_pre_ge, slipstream_velocity) = calc_thrust(
        command,
        air_density,
        velocity_in,
        voltage_scale,
        p.prop_expo,
        effective_prop_area,
        max_outflow_velocity,
    );
    let mut motor_thrust = thrust_pre_ge * ground_effect_factor;
    // §1d bearing drag robs a fraction of shaft power that would become thrust.
    motor_thrust *= 1.0 - fault.bearing_thrust_loss;

    // Yaw torque of the motor. thrust_sign is +1 for fixed-pitch rotors.
    let yaw_scale = 0.05 * p.diagonal_size * motor_thrust;
    let rotor_torque = thrust_vector.scale(mount.yaw_factor * command * yaw_scale * -1.0);

    // Thrust in body frame (Z down).
    let mut thrust = thrust_vector.scale(motor_thrust);

    // §1b rotating unbalance: a planar body-frame force of magnitude
    // imbalance*motor_thrust rotating at the rotor phase. F_u ~ motor_thrust gives
    // the correct Omega^2 scaling for free (momentum thrust is also ~ Omega^2).
    let f_u = fault.imbalance * motor_thrust;
    thrust.x += f_u * rotor_phase.cos();
    thrust.y += f_u * rotor_phase.sin();

    let mut momentum_drag = Vec3::zero();
    if use_drag {
        // Per-motor momentum drag (SIM_Motor.cpp 129-141). §1e asymmetric drag
        // scales this motor's factor.
        let factor =
            p.momentum_drag_coefficient * fault.drag_scale * (air_density * p.true_prop_area).sqrt();
        let md = Vec3::new(
            factor * motor_vel.x * (thrust.y.abs().sqrt() + thrust.z.abs().sqrt()),
            factor * motor_vel.y * (thrust.x.abs().sqrt() + thrust.z.abs().sqrt()),
            factor
                * motor_vel.z
                * (thrust.x.abs().sqrt() + thrust.y.abs().sqrt() + thrust.z.abs().sqrt()),
        );
        thrust = thrust.sub(md);
        momentum_drag = md;
    }

    // Total torque in newton-metres: (position % thrust) + rotor_torque.
    let torque_bf = mount.position.cross(thrust).add(rotor_torque);

    // Current: power_factor * |motor_thrust| / max(voltage, 0.1), plus §1d bearing
    // friction current (rises with command, our proxy for Omega). Uses the loaded
    // pack voltage so a browned-out ESC still reports the physically right draw.
    let current =
        p.power_factor * motor_thrust.abs() / voltage.max(0.1) + fault.bearing_drag_current * command;

    MotorOutput {
        thrust_bf: thrust,
        torque_bf,
        current,
        command,
        thrust_mag: motor_thrust,
        velocity_in,
        momentum_drag,
        slipstream_velocity,
    }
}

/// The all-zero motor output used by the dead-motor / dead-battery early returns.
fn zeroed_output() -> MotorOutput {
    MotorOutput {
        thrust_bf: Vec3::zero(),
        torque_bf: Vec3::zero(),
        current: 0.0,
        command: 0.0,
        thrust_mag: 0.0,
        velocity_in: 0.0,
        momentum_drag: Vec3::zero(),
        slipstream_velocity: 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame::{multirotor_params, FrameModel};

    fn params() -> MultirotorParams {
        multirotor_params(&FrameModel {
            mass: 1.5,
            diagonal_size: 0.4,
            ..Default::default()
        })
    }

    fn mount() -> MotorMount {
        MotorMount {
            position: Vec3::new(0.2, 0.0, 0.0),
            yaw_factor: 1.0,
        }
    }

    #[test]
    fn pwm_to_command_band() {
        let p = params();
        // Below the spin_min PWM -> 0; above spin_max PWM -> 1.
        assert_eq!(pwm_to_command(1000.0, &p), 0.0);
        assert_eq!(pwm_to_command(2000.0, &p), 1.0);
        // pwm_thrust_min = 1000 + 0.15*1000 = 1150 -> command 0.
        assert!((pwm_to_command(1150.0, &p) - 0.0).abs() < 1e-9);
        // Midway between 1150 and 1950 (1550) -> 0.5.
        assert!((pwm_to_command(1550.0, &p) - 0.5).abs() < 1e-9);
    }

    #[test]
    fn idle_makes_no_thrust() {
        let p = params();
        let o = motor_forces(
            1000.0,
            &mount(),
            &p,
            1.225,
            p.voltage_max,
            Vec3::zero(),
            Vec3::zero(),
            true,
        );
        assert!(o.thrust_bf.length() < 1e-9);
        assert!(o.current < 1e-9);
    }

    #[test]
    fn thrust_is_up_and_current_positive() {
        let p = params();
        let o = motor_forces(
            1600.0,
            &mount(),
            &p,
            1.225,
            p.voltage_max,
            Vec3::zero(),
            Vec3::zero(),
            true,
        );
        // Body FRD: up is -Z.
        assert!(o.thrust_bf.z < 0.0);
        assert!(o.current > 0.0);
    }

    #[test]
    fn climbing_inflow_reduces_thrust() {
        // Positive inflow (climbing: air moving up through the disc, body -Z
        // velocity) reduces thrust versus static.
        let p = params();
        let static_o = motor_forces(
            1600.0,
            &mount(),
            &p,
            1.225,
            p.voltage_max,
            Vec3::zero(),
            Vec3::zero(),
            false,
        );
        let climbing = motor_forces(
            1600.0,
            &mount(),
            &p,
            1.225,
            p.voltage_max,
            Vec3::new(0.0, 0.0, -5.0), // moving up in body FRD
            Vec3::zero(),
            false,
        );
        assert!(climbing.thrust_bf.z.abs() < static_o.thrust_bf.z.abs());
    }

    #[test]
    fn dead_battery_zeroes_everything() {
        let p = params();
        let o = motor_forces(
            1800.0,
            &mount(),
            &p,
            1.225,
            0.05 * p.voltage_max, // voltage_scale = 0.05 < 0.1
            Vec3::zero(),
            Vec3::zero(),
            true,
        );
        assert_eq!(o.thrust_bf, Vec3::zero());
        assert_eq!(o.torque_bf, Vec3::zero());
        assert_eq!(o.current, 0.0);
        // Observability fields are zeroed too in the dead-battery branch.
        assert_eq!(o.command, 0.0);
        assert_eq!(o.thrust_mag, 0.0);
        assert_eq!(o.velocity_in, 0.0);
        assert_eq!(o.momentum_drag, Vec3::zero());
    }

    #[test]
    fn exposes_command_and_thrust_mag() {
        let p = params();
        let o = motor_forces(
            1600.0,
            &mount(),
            &p,
            1.225,
            p.voltage_max,
            Vec3::zero(),
            Vec3::zero(),
            false,
        );
        // command is the normalised throttle for 1600 us; thrust_mag is the scalar
        // rotor lift, equal to |thrust_bf| when momentum drag is off.
        assert!((o.command - pwm_to_command(1600.0, &p)).abs() < 1e-12);
        assert!(o.thrust_mag > 0.0);
        assert!((o.thrust_mag - o.thrust_bf.length()).abs() < 1e-9);
        assert_eq!(o.momentum_drag, Vec3::zero());
    }

    // ─── Fault physics (motor_forces_faulted) ────────────────────────────────

    fn faulted(pwm: f64, air: Vec3, fault: &MotorFault, phase: f64) -> MotorOutput {
        let p = params();
        motor_forces_faulted(pwm, &mount(), &p, 1.225, p.voltage_max, air, Vec3::zero(), true, 1.0, fault, phase)
    }

    #[test]
    fn healthy_fault_is_byte_identical() {
        // A default fault (any rotor phase) must reproduce motor_forces bit-for-bit
        // across throttle and airspeed: this is the backward-compat guard.
        let p = params();
        for pwm in [1000.0, 1200.0, 1550.0, 1800.0, 2000.0] {
            for air in [Vec3::zero(), Vec3::new(6.0, -2.0, 1.0), Vec3::new(0.0, 0.0, -4.0)] {
                let base = motor_forces(pwm, &mount(), &p, 1.225, p.voltage_max, air, Vec3::zero(), true);
                let faul = motor_forces_faulted(pwm, &mount(), &p, 1.225, p.voltage_max, air, Vec3::zero(), true, 1.0, &MotorFault::default(), 1.23);
                assert_eq!(base.thrust_bf, faul.thrust_bf);
                assert_eq!(base.torque_bf, faul.torque_bf);
                assert_eq!(base.current, faul.current);
                assert_eq!(base.thrust_mag, faul.thrust_mag);
                assert_eq!(base.momentum_drag, faul.momentum_drag);
            }
        }
    }

    #[test]
    fn dead_motor_zeroes_thrust_torque_current() {
        let dead = MotorFault { dead: true, ..MotorFault::default() };
        let o = faulted(1800.0, Vec3::zero(), &dead, 0.0);
        assert_eq!(o.thrust_bf, Vec3::zero());
        assert_eq!(o.torque_bf, Vec3::zero());
        assert_eq!(o.current, 0.0);
        assert_eq!(o.thrust_mag, 0.0);
    }

    #[test]
    fn prop_area_scale_reduces_thrust_linearly() {
        // A 30% disc-area loss with no inflow reduces thrust by ~30%.
        let healthy = faulted(1700.0, Vec3::zero(), &MotorFault::default(), 0.0);
        let f = MotorFault { prop_area_scale: 0.7, ..MotorFault::default() };
        let lossy = faulted(1700.0, Vec3::zero(), &f, 0.0);
        assert!((lossy.thrust_mag / healthy.thrust_mag - 0.7).abs() < 1e-9);
        // Yaw torque shrinks with thrust too (secondary yaw bias).
        assert!(lossy.torque_bf.z.abs() < healthy.torque_bf.z.abs());
    }

    #[test]
    fn bearing_drag_raises_current_and_lowers_thrust() {
        let healthy = faulted(1700.0, Vec3::zero(), &MotorFault::default(), 0.0);
        let f = MotorFault { bearing_thrust_loss: 0.1, bearing_drag_current: 8.0, ..MotorFault::default() };
        let worn = faulted(1700.0, Vec3::zero(), &f, 0.0);
        assert!(worn.thrust_mag < healthy.thrust_mag, "friction robs thrust");
        assert!(worn.current > healthy.current, "hot motor draws more current");
        // power_factor current scales with the reduced thrust (0.9x) plus the
        // bearing friction current (bearing_drag_current * command).
        let expect = 0.9 * healthy.current + f.bearing_drag_current * worn.command;
        assert!((worn.current - expect).abs() < 1e-6, "{} vs {}", worn.current, expect);
    }

    #[test]
    fn brownout_below_threshold_kills_motor() {
        // voltage_avail 0.05 -> voltage_scale ~ 0.05 < 0.1 -> dead-motor early return.
        let f = MotorFault { voltage_avail: 0.05, ..MotorFault::default() };
        let o = faulted(1800.0, Vec3::zero(), &f, 0.0);
        assert_eq!(o.thrust_bf, Vec3::zero());
        assert_eq!(o.current, 0.0);
        // A partial brownout (0.6) still runs but makes less thrust than healthy.
        let partial = MotorFault { voltage_avail: 0.6, ..MotorFault::default() };
        let po = faulted(1800.0, Vec3::zero(), &partial, 0.0);
        let healthy = faulted(1800.0, Vec3::zero(), &MotorFault::default(), 0.0);
        assert!(po.thrust_mag > 0.0 && po.thrust_mag < healthy.thrust_mag);
    }

    #[test]
    fn imbalance_adds_rotating_planar_force() {
        // At phase 0 the unbalance force is +x, at PI it is -x; magnitude tracks
        // imbalance * motor_thrust and vanishes when balanced.
        let f = MotorFault { imbalance: 0.2, ..MotorFault::default() };
        let base = faulted(1700.0, Vec3::zero(), &MotorFault::default(), 0.0);
        let at0 = faulted(1700.0, Vec3::zero(), &f, 0.0);
        let at_pi = faulted(1700.0, Vec3::zero(), &f, std::f64::consts::PI);
        // Balanced has no planar thrust.
        assert!(base.thrust_bf.x.abs() < 1e-12 && base.thrust_bf.y.abs() < 1e-12);
        let expect = 0.2 * base.thrust_mag;
        assert!((at0.thrust_bf.x - expect).abs() < 1e-6, "phase0 +x {}", at0.thrust_bf.x);
        assert!((at_pi.thrust_bf.x + expect).abs() < 1e-6, "phasePI -x {}", at_pi.thrust_bf.x);
    }

    #[test]
    fn rotor_omega_tracks_throttle_and_voltage() {
        let p = params();
        let hi = rotor_omega(1800.0, &p, p.voltage_max, &MotorFault::default());
        let lo = rotor_omega(1300.0, &p, p.voltage_max, &MotorFault::default());
        assert!(hi > lo && lo > 0.0, "omega rises with throttle");
        // A dead or browned-out motor has zero speed.
        assert_eq!(rotor_omega(1800.0, &p, p.voltage_max, &MotorFault { dead: true, ..MotorFault::default() }), 0.0);
        let sag = rotor_omega(1800.0, &p, 0.5 * p.voltage_max, &MotorFault::default());
        assert!(sag < hi, "omega drops with pack sag");
    }

    #[test]
    fn ground_effect_factor_boosts_thrust_and_torque() {
        // A GE factor > 1 raises the disc thrust the command yields; the yaw
        // reaction torque scales with the boosted thrust too. A factor of exactly
        // 1.0 is a byte-identical no-op (the out-of-ground-effect / calm case).
        let p = params();
        let base = motor_forces_faulted(1700.0, &mount(), &p, 1.225, p.voltage_max, Vec3::zero(), Vec3::zero(), true, 1.0, &MotorFault::default(), 0.0);
        let plain = motor_forces(1700.0, &mount(), &p, 1.225, p.voltage_max, Vec3::zero(), Vec3::zero(), true);
        assert_eq!(base.thrust_mag, plain.thrust_mag, "ge=1.0 must be identity");
        assert_eq!(base.torque_bf, plain.torque_bf);

        let boosted = motor_forces_faulted(1700.0, &mount(), &p, 1.225, p.voltage_max, Vec3::zero(), Vec3::zero(), true, 1.5, &MotorFault::default(), 0.0);
        assert!((boosted.thrust_mag / base.thrust_mag - 1.5).abs() < 1e-9, "thrust scales with GE factor");
        assert!((boosted.torque_bf.z / base.torque_bf.z - 1.5).abs() < 1e-9, "yaw torque scales with boosted thrust");
    }

    #[test]
    fn exposes_slipstream_velocity_equal_to_velocity_out() {
        // slipstream_velocity must equal the hand-computed velocity_out the thrust
        // model uses: voltage_scale * max_outflow_velocity * sqrt(curve).
        let p = params();
        let o = motor_forces(1700.0, &mount(), &p, 1.225, p.voltage_max, Vec3::zero(), Vec3::zero(), false);
        let command = pwm_to_command(1700.0, &p);
        let curve = ((1.0 - p.prop_expo) * command + p.prop_expo * command * command).max(0.0);
        let expect = 1.0 * p.max_outflow_velocity * curve.sqrt();
        assert!((o.slipstream_velocity - expect).abs() < 1e-12, "{} vs {}", o.slipstream_velocity, expect);
        assert!(o.slipstream_velocity > 0.0);
        // A dead motor sheds no wake.
        let dead = MotorFault { dead: true, ..MotorFault::default() };
        let od = faulted(1700.0, Vec3::zero(), &dead, 0.0);
        assert_eq!(od.slipstream_velocity, 0.0);
    }

    #[test]
    fn inflow_half_outflow_gives_three_quarter_thrust() {
        // The closed-form core of the downwash coupling (spec 3.1): an imposed axial
        // inflow of velocity_out/2 (a neighbour's near-field wake, v_wake = w/2)
        // cuts thrust to exactly 0.75 of hover, since 0.5*rho*A*(w^2 - (w/2)^2) =
        // 0.75 * 0.5*rho*A*w^2. This is the dT = 0.25 T => a_sink = g/4 mechanism,
        // isolated from momentum drag (use_drag = false).
        let p = params();
        let hover = motor_forces(1600.0, &mount(), &p, 1.225, p.voltage_max, Vec3::zero(), Vec3::zero(), false);
        let w = hover.slipstream_velocity;
        assert!(w > 0.0);
        // Body FRD: air moving DOWN through the disc is -Z relative air (inflow).
        let inflow_air = Vec3::new(0.0, 0.0, -0.5 * w);
        let immersed = motor_forces(1600.0, &mount(), &p, 1.225, p.voltage_max, inflow_air, Vec3::zero(), false);
        assert!((immersed.velocity_in - 0.5 * w).abs() < 1e-9, "inflow should be w/2");
        assert!((immersed.thrust_mag / hover.thrust_mag - 0.75).abs() < 1e-9,
            "inflow w/2 must give 0.75 thrust, got {}", immersed.thrust_mag / hover.thrust_mag);
    }

    #[test]
    fn momentum_drag_is_folded_into_thrust() {
        // With sideways airspeed, momentum drag is non-zero and exactly the amount
        // subtracted from the pure thrust: pure - drag == thrust_bf.
        let p = params();
        let air = Vec3::new(6.0, 0.0, 0.0);
        let with_drag = motor_forces(1600.0, &mount(), &p, 1.225, p.voltage_max, air, Vec3::zero(), true);
        let no_drag = motor_forces(1600.0, &mount(), &p, 1.225, p.voltage_max, air, Vec3::zero(), false);
        assert!(with_drag.momentum_drag.length() > 0.0);
        let reconstructed = no_drag.thrust_bf.sub(with_drag.momentum_drag);
        assert!((reconstructed.x - with_drag.thrust_bf.x).abs() < 1e-9);
        assert!((reconstructed.y - with_drag.thrust_bf.y).abs() < 1e-9);
        assert!((reconstructed.z - with_drag.thrust_bf.z).abs() < 1e-9);
    }
}
