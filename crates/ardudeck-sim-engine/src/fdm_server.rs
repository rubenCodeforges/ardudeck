//! Lock-step SIM_JSON UDP FDM server + a copter vehicle.
//!
//! Binds the FDM port; on each servo packet from SITL it steps the vehicle
//! physics and replies with the serialized state. SITL paces itself to our
//! replies (lock-step). Retransmits are answered from a cached reply WITHOUT
//! stepping or resetting (resetting there was the bug that kept EKF/GPS
//! perpetually re-initialising).

use std::sync::{Arc, Mutex};

use tokio::net::UdpSocket;

use std::f64::consts::PI;

use crate::battery::{init_battery, update_battery, BatteryState};
use crate::copter::{
    initial_state, seed_load, step_copter_world, Environment, LoadState, StepDiagnostics,
    StepOptions, VehicleState,
};
use crate::fault::{apply_kind, ControlCommand, ScheduledFault};
use crate::frame::{BatteryConfig, MultirotorParams, SlungLoadParams};
use crate::math::Vec3;
use crate::motor::{rotor_omega, MotorFault, MotorOutput};
use crate::protocol::{parse_servo_packet, serialize_state};
use crate::obstacle::Obstacle;
use crate::rng::Rng;
use crate::sensors::{apply_sensor_noise, SensorNoiseConfig};
use crate::state_stream::{EnvMsg, FaultReport, FaultSink, MotorInfo};
use crate::terrain::Terrain;
use crate::wake::{RotorWake, WakeParams};
use crate::wind::{WindConfig, WindField};
use crate::world_env::{LocalConditions, WindGustState, WorldEnvironment};

/// If a frame count drops by more than this, treat it as a genuine SITL restart
/// (frame_count resets to ~0) rather than a retransmit or minor reorder.
const RESTART_BACKWARD_MARGIN: i64 = 1000;

/// Internal sub-stepping cap for stability when SITL requests a large interval.
const MAX_SUBSTEP: f64 = 0.0025;

#[derive(Debug, Clone, Copy)]
pub struct HomeLocation {
    pub lat: f64,
    pub lng: f64,
    pub alt: f64,
    pub heading: f64,
}

/// 1-based servo channels + max reel speed that drive a slung load's winch and
/// release at runtime (MAVLink DO_WINCH / DO_GRIPPER map to these servo outputs).
#[derive(Debug, Clone, Copy)]
pub struct SlungChannels {
    pub winch_channel: Option<u8>,
    pub release_channel: Option<u8>,
    /// Full-stick reel speed (m/s) mapped from the winch channel deflection.
    pub max_reel_speed: f64,
}

/// Winch servo PWM (1000..2000 us, 1500 neutral) -> payout rate (m/s), positive =
/// pay out / lower the load. A small deadband around neutral holds the length.
pub fn winch_rate_from_pwm(pwm: f64, max_reel: f64) -> f64 {
    let dev = pwm - 1500.0;
    if dev.abs() < 25.0 {
        return 0.0;
    }
    (dev / 500.0).clamp(-1.0, 1.0) * max_reel
}

/// Release channel PWM above a threshold triggers the load release edge.
pub fn release_from_pwm(pwm: f64) -> bool {
    pwm > 1700.0
}

/// Latest slung-load snapshot for the WS renderer: the load sub-state plus the
/// hardpoint world position (so the renderer draws the cable to the right point).
#[derive(Debug, Clone, Copy)]
pub struct LoadReport {
    pub load: LoadState,
    pub hardpoint_world: Vec3,
}

/// A steppable simulated vehicle. Copter-only in v1; the trait leaves room for
/// plane/rover later without coupling the FDM server to a concrete type.
pub trait SimVehicle {
    fn id(&self) -> &str;
    fn step(&mut self, pwm: &[f64], dt: f64) -> VehicleState;
    fn reset(&mut self);
    fn home(&self) -> HomeLocation;
    fn battery_voltage(&self) -> Option<f64>;
    /// Pack (voltage, current) for the SIM_JSON reply's `battery` field, or None
    /// when the vehicle models no battery. Default: derive from `battery_voltage`
    /// with zero current.
    fn battery_reading(&self) -> Option<(f64, f64)> {
        self.battery_voltage().map(|v| (v, 0.0))
    }
    /// Normalized average motor output 0..1 from the last commanded PWMs, for the
    /// 3D world's prop animation. Default 0 (no visible spin).
    fn throttle(&self) -> f64 {
        0.0
    }
    /// Latest per-step force-budget diagnostics (physics X-ray), if the vehicle
    /// computes them. WS-only; never reaches SITL. Default: none.
    fn diagnostics(&self) -> Option<StepDiagnostics> {
        None
    }
    /// Latest suspended-load snapshot (load + hardpoint world) for the WS
    /// renderer, if the vehicle carries a load. WS-only. Default: none.
    fn load_report(&self) -> Option<LoadReport> {
        None
    }
    /// Per-motor (thrust N, current A) from the last step, MOT_1..N order, for the
    /// WS `motorThrust`/`motorCurrent` overlay. WS-only. Default: none.
    fn motor_telemetry(&self) -> Option<(Vec<f64>, Vec<f64>)> {
        None
    }
    /// Active per-motor faults for the WS `faults` report. WS-only. Default: empty.
    fn active_faults(&self) -> Vec<FaultReport> {
        Vec::new()
    }
    /// Shared inbound fault-command queue for the WS live control channel, if this
    /// vehicle accepts mid-flight injection. Default: none.
    fn fault_sink(&self) -> Option<FaultSink> {
        None
    }
    /// Latest local environment conditions (AGL, local wind, ground effect,
    /// turbulence) for the WS `env` block. WS-only; never reaches SITL. Default: none.
    fn env_report(&self) -> Option<EnvMsg> {
        None
    }
    /// Static per-motor layout (body-frame position + spin, MOT_1..N order) for the
    /// WS `motors` block, so the UI can draw an accurate motor schematic. WS-only;
    /// never reaches SITL. Default: none.
    fn motor_layout(&self) -> Option<Vec<MotorInfo>> {
        None
    }

    // ─── Shared multi-vehicle world coupling (spec 2.3) ──────────────────────
    // All default to inert, so a stand-alone single-vehicle run is unchanged.

    /// Set the OTHER vehicles' shed-rotor wake sources this vehicle samples this
    /// frame (spec 1.1). Default: ignored (no coupling).
    fn set_neighbor_wake(&mut self, _sources: Vec<RotorWake>) {}

    /// Set the external world-frame contact force this vehicle feels this frame,
    /// from the central collision pass (spec 1.5). Default: ignored.
    fn set_contact_force(&mut self, _force: Vec3) {}

    /// This vehicle's shed-rotor wake sources (world frame) from the last step, to
    /// publish into the shared field. Default: empty (sheds no sampled wake).
    fn rotor_wakes(&self) -> Vec<RotorWake> {
        Vec::new()
    }

    /// Clean rigid state (world position, world velocity, bounding radius) for the
    /// shared snapshot: physics truth, not the noise-injected output. Default: none.
    fn rigid_state(&self) -> Option<(Vec3, Vec3, f64)> {
        None
    }
}

/// A multirotor vehicle: holds physics params, fidelity state (battery, wind
/// gust, RNG) and current state, and advances the dynamics with internal
/// sub-stepping. Mirrors `apps/sim-engine/src/vehicle.ts` evaluation order.
pub struct CopterVehicle {
    id: String,
    params: MultirotorParams,
    /// Terrain + wind field + obstacles (spec 2.1). Sampled once per frame.
    world: WorldEnvironment,
    /// Ambient + per-obstacle wake gust OU state, threaded through `world.sample`.
    gust: WindGustState,
    home: HomeLocation,
    state: VehicleState,
    /// Local conditions from the last frame's sample (WS `env` block).
    last_local: Option<LocalConditions>,
    /// Vehicle-average ground-effect factor from the last frame (WS `env` block).
    last_ground_effect: f64,
    noise: SensorNoiseConfig,
    battery_cfg: Option<BatteryConfig>,
    battery_state: Option<BatteryState>,
    /// Most recent pack current draw (A), reported to SITL alongside voltage.
    last_battery_current: f64,
    /// Most recent normalized average motor output 0..1, for prop animation.
    last_throttle: f64,
    /// Force-budget diagnostics from the final sub-step, for the WS X-ray overlay.
    last_diag: Option<StepDiagnostics>,
    /// Slung-load runtime channels (winch / release). None => fixed, never released.
    slung_channels: Option<SlungChannels>,
    /// Winch payout rate (m/s) derived from the winch channel this frame.
    winch_rate: f64,
    /// Live winch-rate override from a WS `winch` command, decoupled from the
    /// servo channels. `Some` wins over the servo-derived rate for every frame
    /// until the next `winch` command changes it (0 = hold). `None` = servo path.
    winch_override: Option<f64>,
    /// Release edge derived from the release channel this frame.
    release_pending: bool,
    /// Hardpoint world position from the final sub-step, for the WS cable draw.
    last_hardpoint_world: Option<Vec3>,
    ground_effect: bool,
    rng: Rng,
    /// Effective per-motor fault this frame (len == num_motors), recomputed each
    /// step from `live_faults` + the scheduled list. Healthy => byte-identical.
    faults: Vec<MotorFault>,
    /// Persistent WS-driven faults (live control channel), reset by clear_faults.
    live_faults: Vec<MotorFault>,
    /// Time-triggered faults from the CLI / tests, evaluated against sim time.
    scheduled: Vec<ScheduledFault>,
    /// Per-motor rotor phase accumulator (radians) for the imbalance vibration.
    rotor_phase: Vec<f64>,
    /// Per-motor output from the final sub-step, for the WS thrust/current overlay.
    last_motor_out: Vec<MotorOutput>,
    /// Inbound WS fault-command queue, drained under the vehicle lock each step.
    fault_sink: FaultSink,
    /// ESC brownout threshold (V): a marginal ESC that sees a loaded pack below
    /// this can drop out (§1c battery-coupled). 0 disables the coupled path.
    esc_brownout_v: f64,
    /// Shared-world wake/proximity tunables (spec 1.2).
    wake_params: WakeParams,
    /// OTHER vehicles' shed-rotor wake sources for this frame (set by the shared
    /// world before each step). Empty => no downwash coupling (byte-identical).
    neighbor_wake: Vec<RotorWake>,
    /// External world-frame contact force this frame, from the collision pass.
    contact_force: Vec3,
    /// This vehicle's shed-rotor wake sources (world frame) from the last step.
    last_rotor_wake: Vec<RotorWake>,
    /// Collision bounding radius (arm span + a prop radius, spec 1.5), metres.
    r_bound: f64,
    /// Spawn position in the shared world frame (world NED). Applied at construction
    /// and re-applied on SITL restart so vehicles stay separated. Zero (default)
    /// leaves the single-vehicle path byte-identical.
    spawn_offset: Vec3,
    /// Optional PWM-stream recorder (batch replay bridge, Phase 1). `None` by
    /// default; when `None` the step path is byte-identical to before (a single
    /// `Option` check that does nothing).
    recorder: Option<crate::record::PwmRecorder>,
}

impl CopterVehicle {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        id: impl Into<String>,
        params: MultirotorParams,
        env: Environment,
        home: HomeLocation,
        wind_cfg: WindConfig,
        noise: SensorNoiseConfig,
        battery_cfg: Option<BatteryConfig>,
        ground_effect: bool,
        seed: u32,
    ) -> CopterVehicle {
        let battery_state = battery_cfg.as_ref().map(init_battery);
        let mut state = initial_state();
        // Seed a declared slung load at its hanging equilibrium (no startup snap).
        if let Some(slp) = params.slung_load {
            state.load = Some(seed_load(&slp, &state));
        }
        let n = params.num_motors as usize;
        // Bounding sphere = motor-arm radius (diagonal_size) + one prop radius
        // (tip-to-centre), so contact means "props are about to touch" (spec 1.5).
        let prop_radius = (params.true_prop_area / std::f64::consts::PI).sqrt();
        let r_bound = params.diagonal_size + prop_radius;
        // Flat terrain + legacy uniform wind + no obstacles: the calm/flat default
        // that reduces byte-for-byte to the pre-change engine.
        let world = WorldEnvironment::uniform(env, wind_cfg);
        let gust = world.new_gust_state();
        CopterVehicle {
            id: id.into(),
            params,
            world,
            gust,
            home,
            state,
            last_local: None,
            last_ground_effect: 1.0,
            noise,
            battery_cfg,
            battery_state,
            last_battery_current: 0.0,
            last_throttle: 0.0,
            last_diag: None,
            slung_channels: None,
            winch_rate: 0.0,
            winch_override: None,
            release_pending: false,
            last_hardpoint_world: None,
            ground_effect,
            rng: Rng::new(seed),
            faults: vec![MotorFault::default(); n],
            live_faults: vec![MotorFault::default(); n],
            scheduled: Vec::new(),
            rotor_phase: vec![0.0; n],
            last_motor_out: Vec::new(),
            fault_sink: Arc::new(Mutex::new(Vec::new())),
            esc_brownout_v: 0.0,
            wake_params: WakeParams::default(),
            neighbor_wake: Vec::new(),
            contact_force: Vec3::zero(),
            last_rotor_wake: Vec::new(),
            r_bound,
            spawn_offset: Vec3::zero(),
            recorder: None,
        }
    }

    /// Attach a PWM-stream recorder (batch replay bridge). Off by default; setting
    /// it only adds a per-frame record of the commanded PWMs and never alters the
    /// stepping, so the recorded run stays byte-identical to an unrecorded one.
    pub fn set_pwm_recorder(&mut self, recorder: crate::record::PwmRecorder) {
        self.recorder = Some(recorder);
    }

    /// Clean internal physics state (no sensor noise), for the batch harness and
    /// tests. The real-time path does not read this.
    pub fn state(&self) -> VehicleState {
        self.state
    }

    /// Place this vehicle in the shared world frame (world NED). Applied now and on
    /// every SITL restart so vehicles in a fleet stay spatially separated.
    pub fn set_spawn_offset(&mut self, offset: Vec3) {
        self.spawn_offset = offset;
        self.state.position = offset;
    }

    /// Register a time-triggered fault (CLI `--fault` / deterministic tests).
    pub fn add_scheduled_fault(&mut self, f: ScheduledFault) {
        self.scheduled.push(f);
    }

    /// Enable battery-coupled ESC brownout: a motor commanded hard enough that the
    /// loaded pack sags below `threshold_v` may cut out (§1c). 0 disables it.
    pub fn set_esc_brownout_threshold(&mut self, threshold_v: f64) {
        self.esc_brownout_v = threshold_v;
    }

    /// Replace the terrain heightfield (spec 1.b). Flat is the calm default.
    pub fn set_terrain(&mut self, terrain: Terrain) {
        self.world.terrain = terrain;
    }

    /// Replace the wind field (spec 1.d): shear profile / veer / grid / gusts.
    pub fn set_wind_field(&mut self, wind_field: WindField) {
        self.world.wind_field = wind_field;
    }

    /// Replace the obstacle set (spec 1.c) and resize the per-obstacle wake state.
    pub fn set_obstacles(&mut self, obstacles: Vec<Obstacle>) {
        self.world.obstacles = obstacles;
        self.gust = self.world.new_gust_state();
    }

    /// Drain the live WS control channel and apply every queued command to this
    /// vehicle: faults into the persistent live set, and the general live-control
    /// commands (attach/release a load, set the winch rate, change the wind) onto
    /// the matching runtime state. An empty queue is a pure no-op (draws no RNG,
    /// changes no value), so the calm/no-command path stays bit-identical.
    fn apply_control(&mut self) {
        let cmds: Vec<ControlCommand> = {
            let mut q = self.fault_sink.lock().unwrap();
            if q.is_empty() {
                return;
            }
            q.drain(..).collect()
        };
        for cmd in cmds {
            match cmd {
                ControlCommand::Set { motor, kind, severity } => {
                    if let Some(f) = self.live_faults.get_mut(motor) {
                        apply_kind(f, kind, severity);
                    }
                }
                ControlCommand::Clear => {
                    for f in self.live_faults.iter_mut() {
                        *f = MotorFault::default();
                    }
                }
                ControlCommand::AttachLoad {
                    load_mass, cable_length, hardpoint, load_drag_cda, stiffness, damping, winch_min, winch_max,
                } => {
                    // Build the payload params and hang the load at its current
                    // equilibrium (straight below the hardpoint, zero velocity, no
                    // tension impulse). Re-attaching REPLACES the params and re-seeds
                    // to equilibrium (does not preserve a swinging load's position).
                    let slp = SlungLoadParams {
                        load_mass,
                        cable_length,
                        hardpoint: Vec3::new(hardpoint[0], hardpoint[1], hardpoint[2]),
                        stiffness,
                        damping,
                        load_drag_cda,
                        winch_min,
                        winch_max,
                    };
                    self.params.slung_load = Some(slp);
                    self.state.load = Some(seed_load(&slp, &self.state));
                }
                ControlCommand::ReleaseLoad => {
                    // Latch the release edge for this frame's integrate; the load
                    // detaches and goes ballistic (same path the servo release uses).
                    self.release_pending = true;
                }
                ControlCommand::Winch { rate } => {
                    // Persistent override that wins over the servo-derived rate until
                    // the next winch command (rate 0 holds the length).
                    self.winch_override = Some(rate);
                }
                ControlCommand::SetWind { steady, intensity, tau } => {
                    // Keep any field the command omits; replace the field(s) it sets.
                    let mut wf = self.world.wind_field.clone();
                    if let Some(s) = steady {
                        wf.steady = Vec3::new(s[0], s[1], s[2]);
                    }
                    if let Some(i) = intensity {
                        wf.gust_intensity = i;
                    }
                    if let Some(t) = tau {
                        wf.gust_tau = t;
                    }
                    self.set_wind_field(wf);
                }
            }
        }
    }

    /// Recompute the effective per-motor faults for the current sim time: layer the
    /// scheduled list and battery-coupled brownout on top of the persistent live
    /// faults. All-healthy inputs leave `faults` all-default (no-op physics). The
    /// live WS commands are drained separately by `apply_control` before this runs.
    fn refresh_faults(&mut self, t: f64) {
        // Effective = live faults + scheduled (by sim time).
        let mut eff = self.live_faults.clone();
        for sf in &self.scheduled {
            let sev = sf.effective(t);
            if let Some(f) = eff.get_mut(sf.motor) {
                apply_kind(f, sf.kind, sev);
            }
        }
        // 3. Battery-coupled ESC brownout (§1c): a marginal ESC on a sagging pack
        // cuts out with a probability that grows with the sag depth. Reproducible
        // via the shared RNG; only active when a threshold and a battery are set.
        if self.esc_brownout_v > 0.0 {
            if let Some(v) = self.battery_state.map(|b| b.voltage) {
                if v < self.esc_brownout_v {
                    let sag = ((self.esc_brownout_v - v) / self.esc_brownout_v).clamp(0.0, 1.0);
                    for f in eff.iter_mut() {
                        if self.rng.next() < sag {
                            f.voltage_avail = 0.0;
                        }
                    }
                }
            }
        }
        self.faults = eff;
    }

    /// Configure the runtime servo channels that drive this vehicle's slung-load
    /// winch and release. No-op physics until a load is also configured.
    pub fn set_slung_channels(&mut self, channels: SlungChannels) {
        self.slung_channels = Some(channels);
    }

    /// One integration sub-step. The motor model runs against the previous step's
    /// loaded battery voltage (one-step lag); the summed per-motor current it
    /// draws then advances the battery for the next step. With no battery the
    /// pack is full (voltage = voltage_max, voltage_scale = 1).
    fn integrate(&mut self, pwm: &[f64], env: &Environment, ground_height: f64, dt: f64) -> VehicleState {
        let voltage = self.battery_state.map(|b| b.voltage);
        let vsupply = voltage.unwrap_or(self.params.voltage_max);
        // Advance each rotor's phase by Omega*dt (pure integral, deterministic). A
        // dead / browned-out motor has Omega 0 and its phase holds.
        for (i, phase) in self.rotor_phase.iter_mut().enumerate() {
            let fault = self.faults.get(i).copied().unwrap_or_default();
            let pwm_i = pwm.get(i).copied().unwrap_or(self.params.pwm_min);
            let om = rotor_omega(pwm_i, &self.params, vsupply, &fault);
            *phase = (*phase + om * dt).rem_euclid(2.0 * PI);
        }
        let mut sink: Vec<MotorOutput> = Vec::with_capacity(self.faults.len());
        // Capture this vehicle's shed wake this sub-step so the shared world can
        // publish it for neighbours (spec 2.5). Empty neighbour set => the coupling
        // term is exactly zero and the trajectory is byte-identical to before.
        let mut shed: Vec<RotorWake> = Vec::with_capacity(self.faults.len());
        let (new_state, diag) = step_copter_world(
            pwm,
            &self.state,
            &self.params,
            env,
            dt,
            StepOptions {
                voltage,
                ground_effect: self.ground_effect,
                ground_height,
                winch_rate: self.winch_rate,
                release_load: self.release_pending,
                external_force_world: self.contact_force,
            },
            &self.faults,
            &self.rotor_phase,
            &self.neighbor_wake,
            &self.wake_params,
            Some(&mut sink),
            Some(&mut shed),
        );
        self.last_motor_out = sink;
        self.last_rotor_wake = shed;
        // Keep the diagnostics from the (final) sub-step, matching how `state` is
        // the final sub-step's state. Nearly free; never touches the SITL wire.
        self.last_diag = Some(diag);
        if let (Some(cfg), Some(bstate)) = (self.battery_cfg.clone(), self.battery_state) {
            let r = update_battery(&cfg, &bstate, new_state.current, dt);
            self.battery_state = Some(r.state);
            self.last_battery_current = new_state.current;
        }
        new_state
    }
}

impl SimVehicle for CopterVehicle {
    fn id(&self) -> &str {
        &self.id
    }

    fn step(&mut self, pwm: &[f64], dt: f64) -> VehicleState {
        // Batch replay bridge (Phase 1): record the commanded frame BEFORE any
        // stepping. Off by default (recorder is None); when set it only observes,
        // so the trajectory is unchanged whether or not recording is on.
        if let Some(rec) = self.recorder.as_mut() {
            rec.record(dt, pwm);
        }
        // Average normalized motor output over the frame's motors, for the 3D
        // world's prop spin. Uses the same PWM range the thrust model does.
        let n = self.params.num_motors.max(1) as usize;
        let sum: f64 = (0..n)
            .map(|i| {
                crate::motor::pwm_to_command(
                    pwm.get(i).copied().unwrap_or(self.params.pwm_min),
                    &self.params,
                )
            })
            .sum();
        self.last_throttle = (sum / n as f64).clamp(0.0, 1.0);

        // Release is a per-frame edge: clear it, then let the servo channel or a
        // live release_load command re-latch it for this frame only.
        self.release_pending = false;
        // Derive the slung-load winch rate + release edge from the servo channels
        // (held for the whole frame; the load rides each sub-step in lock-step).
        if let Some(ch) = self.slung_channels {
            self.winch_rate = ch
                .winch_channel
                .and_then(|c| pwm.get((c as usize).saturating_sub(1)).copied())
                .map(|p| winch_rate_from_pwm(p, ch.max_reel_speed))
                .unwrap_or(0.0);
            self.release_pending = ch
                .release_channel
                .and_then(|c| pwm.get((c as usize).saturating_sub(1)).copied())
                .map(release_from_pwm)
                .unwrap_or(false);
        }

        // Live WS control channel: drain and apply this frame's commands (faults,
        // attach/release a load, set the winch rate, change the wind). An empty
        // queue is a no-op, so the calm/no-command path is bit-identical.
        self.apply_control();
        // A live winch command overrides the servo-derived rate for this frame.
        if let Some(rate) = self.winch_override {
            self.winch_rate = rate;
        }

        // Recompute effective faults for this frame (scheduled + battery-coupled
        // brownout on top of the live faults) against the current sim time.
        self.refresh_faults(self.state.timestamp);

        let clamped = dt.clamp(1e-4, 0.05);
        let substeps = ((clamped / MAX_SUBSTEP).ceil() as i64).max(1) as usize;
        let sub = clamped / substeps as f64;

        // Sample the world once per frame at the current vehicle position (mirrors
        // how wind was evolved once per frame before). Sub-steps then use the fixed
        // local conditions. The RNG draw order (ambient gust, then obstacle wakes)
        // is deterministic; the calm/flat/no-obstacle case draws nothing and
        // reproduces the legacy trajectory byte-for-byte.
        // Proximity turbulence (spec 1.4): a vehicle immersed in a neighbour's
        // wake feels extra buffet. Sample the neighbour wake at the CG and bump the
        // ambient gust sigma by k_turb * |wake_cg|. No neighbours => 0 => the calm
        // path is byte-identical (no extra RNG magnitude, same draw order).
        let extra_gust = if self.neighbor_wake.is_empty() {
            0.0
        } else {
            let mut wake_cg = Vec3::zero();
            for src in &self.neighbor_wake {
                wake_cg = wake_cg.add(crate::wake::wake_at(src, self.state.position, &self.wake_params));
            }
            self.wake_params.k_turb * wake_cg.length()
        };
        let local = self
            .world
            .sample(self.state.position, &mut self.gust, clamped, &mut self.rng, extra_gust);
        let env = Environment {
            gravity: self.world.base.gravity,
            air_density: local.air_density,
            wind: local.wind,
        };
        self.last_local = Some(local);
        // Vehicle-average (level) ground-effect factor for the WS env block.
        self.last_ground_effect = if self.ground_effect {
            crate::copter::vehicle_ground_effect(&self.params, local.agl)
        } else {
            1.0
        };

        for _ in 0..substeps {
            self.state = self.integrate(pwm, &env, local.ground_height, sub);
        }

        // Cache the hardpoint world (post-step pose) so the WS can draw the cable.
        self.last_hardpoint_world = self.params.slung_load.map(|slp| {
            let lever = self.state.attitude.rotate_body_to_world(slp.hardpoint);
            self.state.position.add(lever)
        });

        // Sensor noise is applied to the OUTPUT only; the internal state stays clean.
        apply_sensor_noise(&self.state, &self.noise, &mut self.rng)
    }

    fn reset(&mut self) {
        let mut state = initial_state();
        state.position = self.spawn_offset;
        if let Some(slp) = self.params.slung_load {
            state.load = Some(seed_load(&slp, &state));
        }
        self.state = state;
        self.gust = self.world.new_gust_state();
        self.last_local = None;
        self.last_ground_effect = 1.0;
        self.battery_state = self.battery_cfg.as_ref().map(init_battery);
        self.last_hardpoint_world = None;
        // Faults reset to healthy on a SITL restart; scheduled list re-triggers by
        // sim time and rotor phase re-integrates from zero (determinism).
        let n = self.params.num_motors as usize;
        self.faults = vec![MotorFault::default(); n];
        self.live_faults = vec![MotorFault::default(); n];
        self.rotor_phase = vec![0.0; n];
        self.last_motor_out.clear();
        // Drop any stale shared-world coupling on a SITL restart.
        self.neighbor_wake.clear();
        self.contact_force = Vec3::zero();
        self.last_rotor_wake.clear();
    }

    fn home(&self) -> HomeLocation {
        self.home
    }

    fn battery_voltage(&self) -> Option<f64> {
        self.battery_state.map(|b| b.voltage)
    }

    fn battery_reading(&self) -> Option<(f64, f64)> {
        self.battery_state
            .map(|b| (b.voltage, self.last_battery_current))
    }

    fn throttle(&self) -> f64 {
        self.last_throttle
    }

    fn diagnostics(&self) -> Option<StepDiagnostics> {
        self.last_diag.clone()
    }

    fn load_report(&self) -> Option<LoadReport> {
        match (self.state.load, self.last_hardpoint_world) {
            (Some(load), Some(hardpoint_world)) => Some(LoadReport { load, hardpoint_world }),
            _ => None,
        }
    }

    fn motor_telemetry(&self) -> Option<(Vec<f64>, Vec<f64>)> {
        if self.last_motor_out.is_empty() {
            return None;
        }
        let thrust = self.last_motor_out.iter().map(|m| m.thrust_mag).collect();
        let current = self.last_motor_out.iter().map(|m| m.current).collect();
        Some((thrust, current))
    }

    fn active_faults(&self) -> Vec<FaultReport> {
        let mut out = Vec::new();
        for (motor, f) in self.faults.iter().enumerate() {
            for (kind, severity) in f.active() {
                out.push(FaultReport { motor, kind, severity });
            }
        }
        out
    }

    fn fault_sink(&self) -> Option<FaultSink> {
        Some(self.fault_sink.clone())
    }

    fn env_report(&self) -> Option<EnvMsg> {
        self.last_local.map(|l| EnvMsg {
            wind: [l.wind.x, l.wind.y, l.wind.z],
            agl: l.agl,
            ground_height: l.ground_height,
            ground_effect: self.last_ground_effect,
            turbulence: l.turbulence_scale,
        })
    }

    fn motor_layout(&self) -> Option<Vec<MotorInfo>> {
        // Authoritative per-motor geometry (same table the mixer/FC uses): body
        // FRD position (x forward, y right) and spin. yaw_factor: CCW = +1, CW = -1.
        let mounts = crate::frame_geometry::frame_geometry(self.params.num_motors, self.params.diagonal_size);
        Some(
            mounts
                .iter()
                .map(|m| MotorInfo {
                    x: m.position.x,
                    y: m.position.y,
                    spin: if m.yaw_factor > 0.0 { "ccw" } else { "cw" },
                })
                .collect(),
        )
    }

    fn set_neighbor_wake(&mut self, sources: Vec<RotorWake>) {
        self.neighbor_wake = sources;
    }

    fn set_contact_force(&mut self, force: Vec3) {
        self.contact_force = force;
    }

    fn rotor_wakes(&self) -> Vec<RotorWake> {
        self.last_rotor_wake.clone()
    }

    fn rigid_state(&self) -> Option<(Vec3, Vec3, f64)> {
        Some((self.state.position, self.state.velocity, self.r_bound))
    }
}

/// Run the lock-step FDM UDP server on `port`. Steps `vehicle` on each new frame
/// and replies to the datagram's source address. Calls `on_state` after every
/// forward step so consumers (the state WS server) can mirror the latest state.
///
/// Single-vehicle path: no shared world, so no wake/contact coupling and no
/// collision events (byte-identical to before the multi-vehicle work).
pub async fn run_fdm_server<F>(
    port: u16,
    vehicle: Arc<Mutex<dyn SimVehicle + Send>>,
    on_state: F,
) -> anyhow::Result<()>
where
    F: Fn(&str, &VehicleState) + Send + 'static,
{
    run_fdm_server_inner(port, vehicle, None, on_state, |_| {}).await
}

/// As `run_fdm_server`, but wired into a shared multi-vehicle world (spec 2.3):
/// before each forward step the vehicle is given the OTHER vehicles' shed wake and
/// its pending contact force from `snapshot`; after the step its new rigid state +
/// shed rotor wake are published back and any new collision events are forwarded
/// to `on_collision`. The SITL reply and lock-step / retransmit logic are unchanged.
pub async fn run_fdm_server_coupled<F, C>(
    port: u16,
    vehicle: Arc<Mutex<dyn SimVehicle + Send>>,
    snapshot: Arc<crate::world::WorldSnapshot>,
    on_state: F,
    on_collision: C,
) -> anyhow::Result<()>
where
    F: Fn(&str, &VehicleState) + Send + 'static,
    C: Fn(crate::state_stream::CollisionMsg) + Send + 'static,
{
    run_fdm_server_inner(port, vehicle, Some(snapshot), on_state, on_collision).await
}

async fn run_fdm_server_inner<F, C>(
    port: u16,
    vehicle: Arc<Mutex<dyn SimVehicle + Send>>,
    snapshot: Option<Arc<crate::world::WorldSnapshot>>,
    on_state: F,
    on_collision: C,
) -> anyhow::Result<()>
where
    F: Fn(&str, &VehicleState) + Send + 'static,
    C: Fn(crate::state_stream::CollisionMsg) + Send + 'static,
{
    let socket = UdpSocket::bind(("127.0.0.1", port)).await?;
    let id = vehicle.lock().unwrap().id().to_string();

    let mut last_frame_count: i64 = -1;
    let mut sim_time: f64 = 0.0;
    let mut last_reply: Option<Vec<u8>> = None;
    let mut buf = [0u8; 4096];

    loop {
        let (n, src) = socket.recv_from(&mut buf).await?;
        let pkt = match parse_servo_packet(&buf[..n]) {
            Some(p) => p,
            None => continue,
        };
        let fc = pkt.frame_count as i64;

        // Retransmit of the current frame: resend cached reply, no step/reset.
        if fc == last_frame_count {
            if let Some(r) = &last_reply {
                socket.send_to(r, src).await?;
            }
            continue;
        }

        if fc < last_frame_count - RESTART_BACKWARD_MARGIN {
            // Large backward jump: SITL actually restarted.
            vehicle.lock().unwrap().reset();
            sim_time = 0.0;
        } else if fc < last_frame_count {
            // Minor out-of-order/old packet: ignore (don't step backwards).
            if let Some(r) = &last_reply {
                socket.send_to(r, src).await?;
            }
            continue;
        }
        last_frame_count = fc;

        let dt = if pkt.frame_rate > 0 {
            1.0 / pkt.frame_rate as f64
        } else {
            1.0 / 1200.0
        };
        sim_time += dt;

        let pwms: Vec<f64> = pkt.pwm.iter().map(|&p| p as f64).collect();
        let (state, battery, rigid, wakes) = {
            // Hold the std Mutex only for the (synchronous) step; never across await.
            let mut v = vehicle.lock().unwrap();
            // Explicit (Jacobi) coupling: read the OTHER vehicles' last published
            // wake + this vehicle's pending contact force before stepping.
            if let Some(snap) = &snapshot {
                v.set_neighbor_wake(snap.neighbor_wake(&id));
                v.set_contact_force(snap.contact_force(&id));
            }
            let mut s = v.step(&pwms, dt);
            s.timestamp = sim_time;
            // Read the pack right after stepping so SITL's battery monitor sees
            // the engine's real voltage/current instead of its internal model.
            let battery = v.battery_reading();
            let rigid = snapshot.as_ref().and(v.rigid_state());
            let wakes = if snapshot.is_some() { v.rotor_wakes() } else { Vec::new() };
            (s, battery, rigid, wakes)
        };

        let reply = serialize_state(&state, battery).into_bytes();
        last_reply = Some(reply.clone());
        socket.send_to(&reply, src).await?;

        // Publish this vehicle's fresh rigid state + shed wake, resolve contacts,
        // and forward any new collision events (edge-triggered) to the WS.
        if let (Some(snap), Some((position, velocity, r_bound))) = (&snapshot, rigid) {
            let events = snap.publish(&id, position, velocity, r_bound, wakes, sim_time);
            for ev in events {
                on_collision(ev);
            }
        }

        on_state(&id, &state);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::copter::DEFAULT_ENVIRONMENT;
    use crate::frame::default_params;
    use crate::protocol::encode_servo_packet;
    use crate::sensors::NO_SENSOR_NOISE;
    use crate::wind::WindConfig;
    use std::time::Duration;
    use tokio::net::UdpSocket;

    fn calm_wind() -> WindConfig {
        WindConfig {
            steady: crate::math::Vec3::zero(),
            intensity: 0.0,
            time_constant: 1.0,
        }
    }

    fn home() -> HomeLocation {
        HomeLocation {
            lat: 0.0,
            lng: 0.0,
            alt: 0.0,
            heading: 0.0,
        }
    }

    fn copter(id: &str) -> CopterVehicle {
        CopterVehicle::new(
            id,
            default_params(),
            DEFAULT_ENVIRONMENT,
            home(),
            calm_wind(),
            NO_SENSOR_NOISE,
            None,
            false,
            1,
        )
    }

    fn battery_copter(id: &str) -> CopterVehicle {
        // A pack that visibly sags: high internal resistance, modest capacity.
        let cfg = crate::frame::BatteryConfig {
            max_voltage: 50.4,
            ref_voltage: 46.9,
            capacity_ah: 5.0,
            internal_resistance: 0.05,
            hover_current: 65.0,
            hover_thrust: 3.0 * 9.80665,
        };
        CopterVehicle::new(
            id, default_params(), DEFAULT_ENVIRONMENT, home(), calm_wind(),
            NO_SENSOR_NOISE, Some(cfg), false, 1,
        )
    }

    #[test]
    fn recording_does_not_change_stepping_and_replays_bit_for_bit() {
        // Batch replay bridge (spec 4.2.1). Three vehicles, identically built:
        //  A records every commanded PWM frame while flying a scripted profile,
        //  E flies the SAME script with NO recorder,
        //  B replays A's recorded stream.
        // A == E proves the recorder never alters stepping (invariant 1/2, off by
        // default). B == A proves the harness replay reproduces the physics bit-for-
        // bit, because both call the identical CopterVehicle::step.
        use crate::record::{read_pwm_log, PwmRecorder};
        let path = std::env::temp_dir().join("ardudeck_bridge_test.pwm.bin");
        let dt = 1.0 / 400.0;
        // Scripted asymmetric PWM: climb bias + a slow roll/yaw wobble on 16 chans.
        let script = |i: usize| -> Vec<f64> {
            let base = 1550.0 + 60.0 * ((i as f64) * 0.02).sin();
            let mut v = vec![base + 25.0, base - 18.0, base + 7.0, base - 12.0];
            v.extend(std::iter::repeat(1500.0).take(12));
            v
        };

        let mut a = copter("A");
        a.set_pwm_recorder(PwmRecorder::to_file(&path).unwrap());
        let mut e = copter("E");
        let mut a_states = Vec::new();
        for i in 0..800 {
            let pwm = script(i);
            let sa = a.step(&pwm, dt);
            let se = e.step(&pwm, dt);
            // Recording must not perturb the trajectory (bit-for-bit).
            assert_eq!(sa.position.z.to_bits(), se.position.z.to_bits());
            assert_eq!(sa.attitude.w.to_bits(), se.attitude.w.to_bits());
            a_states.push(sa);
        }
        drop(a); // flush + close the recorder file

        let frames = read_pwm_log(&path).unwrap();
        assert_eq!(frames.len(), 800);
        let mut b = copter("B");
        for (i, fr) in frames.iter().enumerate() {
            let sb = b.step(&fr.pwm, fr.dt);
            let sa = a_states[i];
            assert_eq!(sb.position.x.to_bits(), sa.position.x.to_bits(), "pos.x frame {i}");
            assert_eq!(sb.position.y.to_bits(), sa.position.y.to_bits(), "pos.y frame {i}");
            assert_eq!(sb.position.z.to_bits(), sa.position.z.to_bits(), "pos.z frame {i}");
            assert_eq!(sb.velocity.z.to_bits(), sa.velocity.z.to_bits(), "vel.z frame {i}");
            assert_eq!(sb.attitude.w.to_bits(), sa.attitude.w.to_bits(), "att.w frame {i}");
            assert_eq!(sb.angular_velocity.z.to_bits(), sa.angular_velocity.z.to_bits(), "wz frame {i}");
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn scheduled_motor_out_triggers_at_sim_time() {
        use crate::fault::{FaultKind, ScheduledFault};
        let mut v = copter("s");
        v.state.position.z = -80.0;
        v.add_scheduled_fault(ScheduledFault { motor: 0, kind: FaultKind::MotorOut, severity: 1.0, at: 0.1, ramp: 0.0 });
        // Before the trigger (t ~ 0.05 s) MOT_1 is alive.
        for _ in 0..20 {
            v.step(&[1500.0; 16], 1.0 / 400.0);
        }
        let (thrust_before, _) = v.motor_telemetry().unwrap();
        assert!(thrust_before[0] > 0.0, "motor 0 alive before trigger");
        assert!(v.active_faults().is_empty(), "no faults reported before trigger");
        // After t crosses 0.1 s, MOT_1 is dead and reported.
        for _ in 0..60 {
            v.step(&[1500.0; 16], 1.0 / 400.0);
        }
        let (thrust_after, _) = v.motor_telemetry().unwrap();
        assert_eq!(thrust_after[0], 0.0, "motor 0 dead after trigger");
        assert!(v.active_faults().iter().any(|f| f.motor == 0 && f.kind == "motor_out"));
    }

    #[test]
    fn ramped_thrust_loss_deepens_over_time() {
        use crate::fault::{FaultKind, ScheduledFault};
        let mut v = copter("r");
        v.state.position.z = -80.0;
        v.add_scheduled_fault(ScheduledFault { motor: 1, kind: FaultKind::ThrustLoss, severity: 0.5, at: 0.05, ramp: 0.5 });
        // Sample thrust on MOT_2 partway through the ramp, then after it completes.
        for _ in 0..120 { v.step(&[1500.0; 16], 1.0 / 400.0); } // t ~ 0.3 (mid-ramp)
        let (mid, _) = v.motor_telemetry().unwrap();
        for _ in 0..200 { v.step(&[1500.0; 16], 1.0 / 400.0); } // t ~ 0.8 (ramp done)
        let (done, _) = v.motor_telemetry().unwrap();
        assert!(done[1] < mid[1], "thrust loss deepens as the ramp progresses: {} -> {}", mid[1], done[1]);
        let sev = v.active_faults().iter().find(|f| f.motor == 1 && f.kind == "thrust_loss").map(|f| f.severity).unwrap();
        assert!((sev - 0.5).abs() < 1e-6, "ramp settles at full severity, got {sev}");
    }

    #[test]
    fn bearing_drag_raises_current_deepens_sag_and_drains_faster() {
        use crate::fault::{FaultKind, ScheduledFault};
        let run = |bearing: bool| -> (f64, f64, f64) {
            let mut v = battery_copter("b");
            v.state.position.z = -80.0;
            if bearing {
                v.add_scheduled_fault(ScheduledFault { motor: 0, kind: FaultKind::BearingDrag, severity: 1.0, at: 0.0, ramp: 0.0 });
            }
            for _ in 0..400 {
                v.step(&[1650.0; 16], 1.0 / 400.0);
            }
            let (_, cur) = v.motor_telemetry().unwrap();
            let bstate = v.battery_state.unwrap();
            (cur[0], bstate.voltage, bstate.remaining_ah)
        };
        let (cur_h, volt_h, ah_h) = run(false);
        let (cur_b, volt_b, ah_b) = run(true);
        assert!(cur_b > cur_h, "bearing motor draws more current: {cur_b} vs {cur_h}");
        assert!(volt_b < volt_h, "extra load deepens pack sag: {volt_b} vs {volt_h}");
        assert!(ah_b < ah_h, "faster SoC drain: {ah_b} vs {ah_h}");
    }

    #[test]
    fn esc_brownout_cuts_motor_only_when_pack_sags_below_threshold() {
        let mut v = battery_copter("e");
        v.state.position.z = -80.0;
        // Threshold just under the full-pack voltage so heavy throttle sag crosses
        // it; brownout is deterministic through the shared seeded RNG.
        v.set_esc_brownout_threshold(49.0);
        // Light throttle: pack stays above threshold, no motor cuts out.
        for _ in 0..50 {
            v.step(&[1150.0; 16], 1.0 / 400.0);
        }
        assert!(v.active_faults().iter().all(|f| f.kind != "brownout"), "no brownout above threshold");
        // Hard throttle sags the pack under 49 V; at least one ESC browns out.
        let mut browned = false;
        for _ in 0..200 {
            v.step(&[1900.0; 16], 1.0 / 400.0);
            if v.active_faults().iter().any(|f| f.kind == "brownout") {
                browned = true;
                break;
            }
        }
        assert!(browned, "a sagging pack must brown out a marginal ESC");
    }

    /// Lock-step exchange: send a frame, wait for the reply; on loss/startup
    /// race, resend the SAME frame count (exactly like real SITL).
    async fn exchange(
        client: &UdpSocket,
        addr: &str,
        pwm: &[u16],
        fc: u32,
    ) -> serde_json::Value {
        let pkt = encode_servo_packet(400, fc, pwm);
        let mut buf = [0u8; 8192];
        loop {
            client.send_to(&pkt, addr).await.unwrap();
            match tokio::time::timeout(Duration::from_millis(200), client.recv_from(&mut buf))
                .await
            {
                Ok(Ok((n, _))) => {
                    let s = std::str::from_utf8(&buf[..n]).unwrap().trim();
                    return serde_json::from_str(s).unwrap();
                }
                _ => continue,
            }
        }
    }

    #[tokio::test]
    async fn replies_with_state_that_climbs_under_full_throttle() {
        let port = 19002u16;
        let vehicle: Arc<Mutex<dyn SimVehicle + Send>> = Arc::new(Mutex::new(copter("v1")));
        tokio::spawn(run_fdm_server(port, vehicle, |_, _| {}));

        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let addr = format!("127.0.0.1:{port}");
        let full = [2000u16; 16];

        let mut last = serde_json::Value::Null;
        for fc in 1..=200u32 {
            last = exchange(&client, &addr, &full, fc).await;
        }
        let pos = last["position"].as_array().unwrap();
        assert!(pos[2].as_f64().unwrap() < -0.5, "should climb (NED down < 0)");
        let ab = last["imu"]["accel_body"][2].as_f64().unwrap();
        assert!(ab.is_finite());
        // Invariant 1: the SIM_JSON reply (protocol.rs) never carries the WS-only
        // blocks. The firmware must not see motor-layout / load / control fields.
        assert!(last.get("motors").is_none(), "SIM_JSON must not carry the motor layout");
        assert!(last.get("load").is_none(), "SIM_JSON must not carry the load block");
        assert!(last.get("faults").is_none(), "SIM_JSON must not carry faults");
    }

    #[tokio::test]
    async fn steady_wind_config_drifts_the_vehicle_downwind() {
        // Proves a WindConfig steady wind (the CLI `--wind n,e,d,intensity,tau`
        // path lands here as `wind_cfg`) reaches env.wind inside `step` and drifts
        // the vehicle. intensity 0 -> update_wind returns the steady vector.
        use crate::math::Vec3;
        let steady = WindConfig { steady: Vec3::new(8.0, 0.0, 0.0), intensity: 0.0, time_constant: 1.0 };
        let mut windy = CopterVehicle::new(
            "w", default_params(), DEFAULT_ENVIRONMENT, home(), steady,
            NO_SENSOR_NOISE, None, false, 1,
        );
        let mut calm = copter("c");
        // Bisect hover PWM is overkill here; a mid throttle keeps it aloft long
        // enough to expose the horizontal push. Start aloft so it does not sit on
        // the ground (where friction would mask the drift).
        windy.state.position.z = -50.0;
        calm.state.position.z = -50.0;
        let hover = [1500.0; 16];
        for _ in 0..1500 {
            windy.step(&hover, 1.0 / 400.0);
            calm.step(&hover, 1.0 / 400.0);
        }
        assert!(calm.state.position.x.abs() < 1e-3, "calm drift {}", calm.state.position.x);
        assert!(windy.state.position.x > 0.2, "wind should drift +North, got {}", windy.state.position.x);
    }

    #[test]
    fn calm_flat_vehicle_has_no_horizontal_drift_and_reports_env() {
        // The WorldEnvironment plumbing is a no-op for the calm/flat/no-obstacle
        // case: a hovering vehicle does not drift horizontally, and the WS env
        // block reports flat ground (agl = -z, ground_height 0, no turbulence).
        let mut v = copter("c");
        v.state.position.z = -40.0;
        for _ in 0..800 {
            v.step(&[1500.0; 16], 1.0 / 400.0);
        }
        assert!(v.state.position.x.abs() < 1e-9, "calm: no N drift, got {}", v.state.position.x);
        assert!(v.state.position.y.abs() < 1e-9, "calm: no E drift, got {}", v.state.position.y);
        // env is sampled at the frame-start position, so agl tracks -z closely
        // (flat datum ground: ground_height 0, agl = -z).
        let env = v.env_report().unwrap();
        assert_eq!(env.ground_height, 0.0);
        assert!((env.agl - (-v.state.position.z)).abs() < 0.5);
        assert_eq!(env.turbulence, 1.0);
    }

    #[test]
    fn terrain_lands_the_vehicle_on_the_surface() {
        // With a 20 m terrain under it, an idle vehicle settles on the surface
        // (datum altitude -20), not at z=0. Exercises set_terrain end to end.
        use crate::terrain::{HeightGrid, Terrain};
        let mut v = copter("t");
        v.set_terrain(Terrain::Grid(HeightGrid {
            north0: -1000.0, east0: -1000.0, spacing: 2000.0, rows: 2, cols: 2, heights: vec![20.0; 4],
        }));
        v.state.position.z = -35.0;
        for _ in 0..4000 {
            v.step(&[1000.0; 16], 1.0 / 400.0);
        }
        assert!((v.state.position.z - (-20.0)).abs() < 1e-2, "should rest on the 20 m surface, got {}", v.state.position.z);
        let env = v.env_report().unwrap();
        assert!((env.ground_height - 20.0).abs() < 1e-6);
        assert!(env.agl.abs() < 1e-2, "AGL ~ 0 on the surface, got {}", env.agl);
    }

    #[test]
    fn obstacle_wake_perturbs_the_trajectory_vs_open_air() {
        // In wind, a vehicle sitting in the lee of an obstacle drifts differently
        // from the same vehicle in open air. Exercises set_obstacles + wind field.
        use crate::obstacle::{Obstacle, ObstacleShape};
        use crate::math::Vec3;
        let steady = WindConfig { steady: Vec3::new(8.0, 0.0, 0.0), intensity: 0.0, time_constant: 1.0 };
        let make = |obstacles: bool| -> CopterVehicle {
            let mut v = CopterVehicle::new(
                "o", default_params(), DEFAULT_ENVIRONMENT, home(), steady,
                NO_SENSOR_NOISE, None, false, 1,
            );
            if obstacles {
                // A building upwind (-North) of the vehicle so the vehicle is in its lee.
                v.set_obstacles(vec![Obstacle { north: -20.0, east: 0.0, shape: ObstacleShape::Box, radius: 10.0, height: 60.0 }]);
            }
            v.state.position.z = -30.0;
            v
        };
        let mut open = make(false);
        let mut lee = make(true);
        for _ in 0..1500 {
            open.step(&[1500.0; 16], 1.0 / 400.0);
            lee.step(&[1500.0; 16], 1.0 / 400.0);
        }
        // The lee vehicle sees a reduced (wake-deficit) mean wind, so it drifts
        // downwind less than the open-air vehicle.
        assert!(open.state.position.x > 0.0, "open air drifts downwind");
        assert!(lee.state.position.x < open.state.position.x, "lee drifts less than open air: lee {} open {}", lee.state.position.x, open.state.position.x);
        // The wake raises the reported turbulence in the lee.
        assert!(lee.env_report().unwrap().turbulence > 1.0, "lee should report elevated turbulence");
    }

    #[test]
    fn neighbor_wake_makes_the_lower_vehicle_sink() {
        // End-to-end trait wiring: feeding the upper vehicle's shed rotor wake into
        // the lower vehicle (set_neighbor_wake) must make the lower one lose
        // altitude versus the identical no-neighbour run. Both aligned, same command.
        let hp = 1500.0;
        let run = |coupled: bool| -> f64 {
            let mut upper = copter("u");
            let mut lower = copter("l");
            upper.state.position.z = -20.0;
            lower.state.position.z = -20.0 + 0.1; // 10 cm under the upper disc
            for _ in 0..80 {
                upper.step(&[hp; 16], 1.0 / 400.0);
                if coupled {
                    // Explicit coupling: lower samples the upper's just-shed wake.
                    lower.set_neighbor_wake(upper.rotor_wakes());
                }
                lower.step(&[hp; 16], 1.0 / 400.0);
            }
            lower.state.position.z
        };
        let free = run(false);
        let washed = run(true);
        assert!(washed > free + 1e-3, "downwash must sink the lower vehicle: washed {washed} vs free {free}");
    }

    // ─── Live control channel (attach/release/winch/wind) ────────────────────

    fn push_cmd(v: &CopterVehicle, cmd: crate::fault::ControlCommand) {
        v.fault_sink().unwrap().lock().unwrap().push(cmd);
    }

    #[test]
    fn attach_load_command_hangs_a_load_that_supports_its_weight() {
        use crate::fault::ControlCommand;
        const G: f64 = crate::frame::GRAVITY_MSS;
        let mut v = copter("a");
        v.state.position.z = -300.0; // high, so the near-hover run never lands
        // No load before the command.
        assert!(v.state().load.is_none());
        let m_l = 1.0_f64;
        push_cmd(&v, ControlCommand::AttachLoad {
            load_mass: m_l,
            cable_length: 2.0,
            hardpoint: [0.0, 0.0, 0.15],
            load_drag_cda: 0.1,
            stiffness: 4000.0,
            damping: 40.0,
            winch_min: 0.5,
            winch_max: 8.0,
        });
        // One step applies the command: the load appears, attached, hanging below.
        v.step(&[1650.0; 16], 1.0 / 400.0);
        let ld = v.state().load.expect("load attached by command");
        assert!(ld.attached);
        assert!((ld.cable_length - 2.0).abs() < 1e-9);
        assert!(ld.position.z > v.state().position.z, "load hangs below the vehicle");
        // Settle near hover (this loaded quad hovers around pwm 1650), then the taut
        // cable tension supports the load weight (quasi-static hang: T ~ m_L * g).
        let mut tens_sum = 0.0;
        let mut tens_n = 0;
        for i in 0..4000 {
            v.step(&[1650.0; 16], 1.0 / 400.0);
            if i >= 3500 {
                tens_sum += v.state().load.unwrap().tension;
                tens_n += 1;
            }
        }
        let tens = tens_sum / tens_n as f64;
        let weight = m_l * G;
        assert!((tens - weight).abs() < 0.2 * weight, "settled tension {tens} vs weight {weight}");
        assert!(v.state().load.unwrap().attached, "load stays attached");
    }

    #[test]
    fn release_load_command_detaches_the_load() {
        use crate::fault::ControlCommand;
        let mut v = copter("r");
        v.state.position.z = -100.0;
        push_cmd(&v, ControlCommand::AttachLoad {
            load_mass: 1.0, cable_length: 2.0, hardpoint: [0.0, 0.0, 0.15],
            load_drag_cda: 0.1, stiffness: 4000.0, damping: 40.0, winch_min: 0.5, winch_max: 8.0,
        });
        for _ in 0..200 { v.step(&[1390.0; 16], 1.0 / 400.0); }
        assert!(v.state().load.unwrap().attached, "attached before release");
        // Release: the load detaches and goes ballistic (tension zero, latched off).
        push_cmd(&v, ControlCommand::ReleaseLoad);
        v.step(&[1390.0; 16], 1.0 / 400.0);
        let ld = v.state().load.unwrap();
        assert!(!ld.attached, "load detached after release_load");
        assert_eq!(ld.tension, 0.0, "a released load carries no tension");
        // Stays detached on subsequent frames (latched).
        for _ in 0..50 { v.step(&[1390.0; 16], 1.0 / 400.0); }
        assert!(!v.state().load.unwrap().attached);
    }

    #[test]
    fn winch_command_pays_out_and_reels_in_cable() {
        use crate::fault::ControlCommand;
        let mut v = copter("w");
        v.state.position.z = -100.0;
        push_cmd(&v, ControlCommand::AttachLoad {
            load_mass: 1.0, cable_length: 2.0, hardpoint: [0.0, 0.0, 0.15],
            load_drag_cda: 0.1, stiffness: 4000.0, damping: 40.0, winch_min: 0.5, winch_max: 8.0,
        });
        v.step(&[1390.0; 16], 1.0 / 400.0);
        let l0 = v.state().load.unwrap().cable_length;
        // Pay out at 0.5 m/s for 1 s: cable lengthens toward winch_max.
        push_cmd(&v, ControlCommand::Winch { rate: 0.5 });
        for _ in 0..400 { v.step(&[1390.0; 16], 1.0 / 400.0); }
        let l1 = v.state().load.unwrap().cable_length;
        assert!(l1 > l0 + 0.4, "winch pay-out lengthens the cable: {l0} -> {l1}");
        // Reel in at -1.0 m/s: the cable shortens again, clamped at winch_min.
        push_cmd(&v, ControlCommand::Winch { rate: -1.0 });
        for _ in 0..2000 { v.step(&[1390.0; 16], 1.0 / 400.0); }
        let l2 = v.state().load.unwrap().cable_length;
        assert!(l2 < l1, "winch reel-in shortens the cable: {l1} -> {l2}");
        assert!(l2 >= 0.5 - 1e-9, "cable clamps at winch_min: {l2}");
        // Hold: rate 0 keeps the length steady.
        push_cmd(&v, ControlCommand::Winch { rate: 0.0 });
        for _ in 0..400 { v.step(&[1390.0; 16], 1.0 / 400.0); }
        let l3 = v.state().load.unwrap().cable_length;
        assert!((l3 - l2).abs() < 1e-9, "winch rate 0 holds the length: {l2} -> {l3}");
    }

    #[test]
    fn set_wind_command_changes_the_sampled_wind() {
        use crate::fault::ControlCommand;
        let mut v = copter("wind");
        v.state.position.z = -50.0;
        // Calm to start: the sampled local wind is zero.
        v.step(&[1390.0; 16], 1.0 / 400.0);
        let w0 = v.env_report().unwrap().wind;
        assert!(w0[0].abs() < 1e-9 && w0[1].abs() < 1e-9, "calm before set_wind: {w0:?}");
        // Set a steady 6 m/s North wind, no gust.
        push_cmd(&v, ControlCommand::SetWind { steady: Some([6.0, 0.0, 0.0]), intensity: Some(0.0), tau: None });
        v.step(&[1390.0; 16], 1.0 / 400.0);
        let w1 = v.env_report().unwrap().wind;
        assert!((w1[0] - 6.0).abs() < 1e-9, "steady wind reaches the sample: {w1:?}");
        assert!(w1[1].abs() < 1e-9 && w1[2].abs() < 1e-9);
    }

    #[test]
    fn motor_layout_matches_frame_geometry_for_octa() {
        use crate::frame::{multirotor_params, FrameModel};
        use crate::frame_geometry::frame_geometry;
        let p = multirotor_params(&FrameModel { num_motors: 8.0, diagonal_size: 1.325, ..Default::default() });
        let diag = p.diagonal_size;
        let v = CopterVehicle::new(
            "octa", p, DEFAULT_ENVIRONMENT, home(), calm_wind(), NO_SENSOR_NOISE, None, false, 1,
        );
        let layout = v.motor_layout().expect("octa layout");
        assert_eq!(layout.len(), 8, "octa emits 8 motors");
        // Octa spin order (ArduPilot SIM_Frame): 0/CW 180/CW 45/CCW 135/CCW
        // -45/CCW -135/CCW -90/CW 90/CW.
        let expect_spin = ["cw", "cw", "ccw", "ccw", "ccw", "ccw", "cw", "cw"];
        let mounts = frame_geometry(8, diag);
        for (i, m) in layout.iter().enumerate() {
            assert_eq!(m.spin, expect_spin[i], "MOT_{} spin", i + 1);
            assert!((m.x - mounts[i].position.x).abs() < 1e-12, "MOT_{} x", i + 1);
            assert!((m.y - mounts[i].position.y).abs() < 1e-12, "MOT_{} y", i + 1);
            // yaw_factor sign must agree with the emitted spin string.
            let spin_from_yaw = if mounts[i].yaw_factor > 0.0 { "ccw" } else { "cw" };
            assert_eq!(m.spin, spin_from_yaw, "MOT_{} spin agrees with yaw_factor", i + 1);
        }
    }

    // Golden final-state values for the calm/no-command CopterVehicle::step path,
    // captured from the engine (locks the live-control drain as a no-op).
    const GOLDEN_CALM_POS_X: f64 = -0.9835422576500131;
    const GOLDEN_CALM_POS_Z: f64 = -17.004641100181487;
    const GOLDEN_CALM_WZ: f64 = 0.06501985381620896;

    #[test]
    fn calm_no_command_step_is_bit_identical_golden() {
        // Invariant 2: with NO control command and no load, the live-control drain
        // is a pure no-op. A scripted hover+climb+yaw run through CopterVehicle::step
        // (which now drains the empty control queue every frame) must reproduce a
        // captured golden bit-for-bit, proving the channel changes no value.
        let mut v = copter("calm");
        v.state.position.z = -25.0;
        let pwms = [1550.0, 1450.0, 1500.0, 1480.0, 1500.0, 1500.0, 1500.0, 1500.0,
                    1500.0, 1500.0, 1500.0, 1500.0, 1500.0, 1500.0, 1500.0, 1500.0];
        for _ in 0..600 {
            v.step(&pwms, 1.0 / 400.0);
        }
        let s = v.state();
        assert_eq!(s.position.x.to_bits(), GOLDEN_CALM_POS_X.to_bits(), "pos.x {}", s.position.x);
        assert_eq!(s.position.z.to_bits(), GOLDEN_CALM_POS_Z.to_bits(), "pos.z {}", s.position.z);
        assert_eq!(s.angular_velocity.z.to_bits(), GOLDEN_CALM_WZ.to_bits(), "wz {}", s.angular_velocity.z);
    }

    #[test]
    fn winch_rate_pwm_mapping() {
        // Neutral + deadband hold the length; full stick reaches +/- max reel.
        assert_eq!(winch_rate_from_pwm(1500.0, 2.0), 0.0);
        assert_eq!(winch_rate_from_pwm(1515.0, 2.0), 0.0);
        assert!((winch_rate_from_pwm(2000.0, 2.0) - 2.0).abs() < 1e-9);
        assert!((winch_rate_from_pwm(1000.0, 2.0) + 2.0).abs() < 1e-9);
        // Half deflection -> half reel speed.
        assert!((winch_rate_from_pwm(1750.0, 2.0) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn release_pwm_mapping() {
        assert!(!release_from_pwm(1500.0));
        assert!(!release_from_pwm(1700.0));
        assert!(release_from_pwm(1701.0));
        assert!(release_from_pwm(2000.0));
    }

    #[tokio::test]
    async fn does_not_reset_on_retransmit() {
        let port = 19004u16;
        let vehicle: Arc<Mutex<dyn SimVehicle + Send>> = Arc::new(Mutex::new(copter("v1")));
        tokio::spawn(run_fdm_server(port, vehicle, |_, _| {}));

        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let addr = format!("127.0.0.1:{port}");
        let full = [2000u16; 16];

        let mut last = serde_json::Value::Null;
        for fc in 1..=60u32 {
            last = exchange(&client, &addr, &full, fc).await;
        }
        let climbed = last["position"][2].as_f64().unwrap();
        assert!(climbed < -0.1, "has climbed off the ground");

        // Retransmit frame 60: must return the SAME state (cached), not a reset.
        let retx = exchange(&client, &addr, &full, 60).await;
        assert!((retx["position"][2].as_f64().unwrap() - climbed).abs() < 1e-6);

        // Forward frame keeps climbing from where we were: proves no reset.
        let next = exchange(&client, &addr, &full, 61).await;
        assert!(next["position"][2].as_f64().unwrap() < climbed);
    }
}
