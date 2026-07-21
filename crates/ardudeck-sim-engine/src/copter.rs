use crate::frame::{MultirotorParams, SlungLoadParams};
use crate::frame_geometry::frame_geometry;
use crate::math::{Quat, Vec3};
use crate::motor::{motor_forces_faulted, MotorFault, MotorOutput};
use crate::wake::{wake_at, RotorWake, WakeParams};

const GROUND_FRICTION: f64 = 0.6;
const GROUND_CONTACT_EPS: f64 = 1e-3;
/// Upper bound on the in-ground-effect thrust boost (spec 1.a): caps the boost a
/// vehicle sitting on the deck sees, well inside the Cheeseman-Bennett singularity.
const GE_MAX_FACTOR: f64 = 2.5;

/// Suspended payload sub-state, integrated in lock-step with the vehicle. `Copy`
/// so `VehicleState` stays `Copy`; `None` on `VehicleState.load` means no slung
/// load and byte-identical legacy behavior. All world-frame NED.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LoadState {
    /// Load (point-mass) position, world NED.
    pub position: Vec3,
    /// Load velocity, world NED.
    pub velocity: Vec3,
    /// Current natural (unstretched) cable length L (winch state), m.
    pub cable_length: f64,
    /// Last tension magnitude (telemetry / WS only), N.
    pub tension: f64,
    /// False after release; latched (never re-attaches).
    pub attached: bool,
}

#[derive(Debug, Clone, Copy)]
pub struct VehicleState {
    pub position: Vec3,
    pub velocity: Vec3,
    pub attitude: Quat,
    pub angular_velocity: Vec3,
    pub accel_body: Vec3,
    /// Total pack current (A) drawn by all motors this step. Internal only: it is
    /// not part of the SIM_JSON wire (that current comes from the battery model).
    /// Lets the FDM server drive battery sag from the real per-motor load.
    pub current: f64,
    pub timestamp: f64,
    /// Suspended payload sub-state. `None` => no slung load, unchanged physics.
    pub load: Option<LoadState>,
}

#[derive(Debug, Clone, Copy)]
pub struct Environment {
    pub gravity: f64,
    pub air_density: f64,
    pub wind: Vec3,
}

pub const DEFAULT_ENVIRONMENT: Environment = Environment {
    gravity: 9.80665,
    air_density: 1.225,
    wind: Vec3 { x: 0.0, y: 0.0, z: 0.0 },
};

#[derive(Debug, Clone, Copy)]
pub struct StepOptions {
    /// Actual battery voltage fed to the motor model (voltage_scale = voltage /
    /// voltage_max is computed per-motor). `None` means a full pack (voltage =
    /// voltage_max, so voltage_scale = 1).
    pub voltage: Option<f64>,
    pub ground_effect: bool,
    /// Terrain height under the vehicle, metres above the home datum (+up). AGL is
    /// `-position.z - ground_height`. Default 0.0 = flat datum plane, so contact,
    /// clamp, friction and ground effect key on z=0 exactly as before.
    pub ground_height: f64,
    /// Slung-load winch payout rate L_dot (m/s), positive = paying out / lowering.
    /// Default 0.0 (fixed cable length).
    pub winch_rate: f64,
    /// Slung-load release: rising edge latches `attached = false` this step and
    /// forever after. Default false.
    pub release_load: bool,
    /// External world-frame force (N) added in step 7 alongside gravity and ground
    /// contact: the vehicle-vehicle contact force from the collision pass (spec
    /// 1.5). Default zero is a byte-identical no-op (added only when non-zero).
    pub external_force_world: Vec3,
}

impl Default for StepOptions {
    fn default() -> Self {
        StepOptions {
            voltage: None,
            ground_effect: false,
            ground_height: 0.0,
            winch_rate: 0.0,
            release_load: false,
            external_force_world: Vec3::zero(),
        }
    }
}

/// Per-motor observability snapshot for one step, in MOT_1..N order. Pure
/// diagnostics: computing it never alters the trajectory (see the golden-
/// trajectory test). All quantities body-frame FRD unless noted.
#[derive(Debug, Clone, Copy, Default)]
pub struct MotorDiag {
    /// Mount (arm) vector from CG, body frame.
    pub position: Vec3,
    /// Thrust this rotor puts into the airframe (incl. momentum drag).
    pub thrust_bf: Vec3,
    /// Normalised throttle 0..1 after the spin band.
    pub command: f64,
    /// Scalar rotor lift before momentum drag (N).
    pub thrust_mag: f64,
    /// Motor current (A).
    pub current: f64,
    /// Induced inflow into the disc (m/s).
    pub velocity_in: f64,
    /// Bending moment on the arm: |position| * |thrust_bf| (N*m).
    pub arm_moment: f64,
    /// arm_moment / max_arm_moment, 0..1 (0 when nothing is lifting).
    pub arm_load_ratio: f64,
}

/// The force/torque budget that drove one step, surfaced for the 3D world and
/// analytics. Rides the WS state stream only; never touches the SITL wire and
/// never changes physics.
#[derive(Debug, Clone, Default)]
pub struct StepDiagnostics {
    /// One entry per motor, MOT_1..N order.
    pub motors: Vec<MotorDiag>,
    /// Sum of per-rotor thrusts, pre ground-effect and airframe drag (body).
    pub net_thrust_bf: Vec3,
    /// `net_thrust_bf` rotated body->world (NED).
    pub net_thrust_world: Vec3,
    /// Net body torque about CG that fed the rotational integrator.
    pub torque_bf: Vec3,
    /// Airframe (fuselage) parasitic drag, body frame.
    pub airframe_drag_bf: Vec3,
    /// Sum of per-rotor momentum drag already folded into each thrust (body).
    pub momentum_drag_bf: Vec3,
    /// Specific (non-gravity) force magnitude over g. 1.0 in level hover.
    pub load_factor: f64,
    /// Vehicle CG, body frame (origin in v1: symmetric point mass).
    pub cg_body: Vec3,
    /// CG shift from the empty CG (zero in v1).
    pub cg_shift: Vec3,
    /// Thrust-weighted centroid of the motor positions: where lift is centred.
    pub cg_hover_est: Vec3,
    /// Largest per-arm bending moment, for HUD + colour normalisation.
    pub max_arm_moment: f64,
    /// Vehicle weight (m*g), N. World direction is +Z (down). Lets the X-ray draw
    /// the gravity vector without the client needing the mass.
    pub weight: f64,
    /// Net world force accelerating the airframe this step (thrust + drag +
    /// gravity + any tension/contact), NED. The bold resultant in the X-ray.
    pub net_force_world: Vec3,
}

pub fn initial_state() -> VehicleState {
    VehicleState {
        position: Vec3::zero(),
        velocity: Vec3::zero(),
        attitude: Quat::identity(),
        angular_velocity: Vec3::zero(),
        accel_body: Vec3::zero(),
        current: 0.0,
        timestamp: 0.0,
        load: None,
    }
}

/// Seed a slung load at its hanging equilibrium below the hardpoint, so the sim
/// starts with no tension impulse. Straight down at `p_h + (0,0,L0)` (NED z down),
/// zero velocity, cable at natural length, attached.
pub fn seed_load(slp: &SlungLoadParams, state: &VehicleState) -> LoadState {
    let lever_world = state.attitude.rotate_body_to_world(slp.hardpoint);
    let p_h = state.position.add(lever_world);
    LoadState {
        position: p_h.add(Vec3::new(0.0, 0.0, slp.cable_length)),
        velocity: Vec3::zero(),
        cable_length: slp.cable_length,
        tension: 0.0,
        attached: true,
    }
}

impl VehicleState {
    /// Zeroed state (identity attitude). Alias of `initial_state()` for tests.
    pub fn default_zero() -> VehicleState {
        initial_state()
    }
}

fn inertia(p: &MultirotorParams) -> (f64, f64, f64) {
    let r = p.diagonal_size / 2.0;
    let base = p.mass * r * r;
    let ixx = f64::max(1e-4, 0.25 * base);
    let iyy = ixx;
    let izz = f64::max(1e-4, 0.5 * base);
    (ixx, iyy, izz)
}

/// Cheeseman & Bennett (1955) rotor-in-ground-effect thrust ratio T_IGE/T_OGE at
/// constant rotor command: `1 / (1 - (R/(4 z))^2)`, where `R` is the rotor radius
/// and `z` is the rotor-plane height above the ground. Out of ground effect
/// (`z >= 2R`) it is forced to exactly 1.0 (no residual in free air). Near the
/// deck it is clamped: `z/R >= 0.30` bounds the singularity and `GE_MAX_FACTOR`
/// caps the boost. Reduces to no boost far from the ground.
fn ground_effect_factor(z: f64, r: f64) -> f64 {
    if z >= 2.0 * r {
        return 1.0;
    }
    let ratio = r / (4.0 * z.max(0.30 * r));
    let k = 1.0 / (1.0 - ratio * ratio);
    k.min(GE_MAX_FACTOR)
}

/// Per-rotor radius from the calibrated per-motor disc area (spec 1.a): the
/// physical length scale for ground effect, NOT the motor-arm diagonal.
fn rotor_radius(p: &MultirotorParams) -> f64 {
    (p.true_prop_area / std::f64::consts::PI).sqrt()
}

/// Vehicle-average (level) ground-effect factor at a given AGL, for telemetry /
/// the WS env block. Uses the vehicle AGL directly (per-motor asymmetry from
/// attitude is a step-time detail, not needed for the readout).
pub fn vehicle_ground_effect(p: &MultirotorParams, agl: f64) -> f64 {
    ground_effect_factor(agl, rotor_radius(p))
}

/// Match JS Math.sign: 0 -> 0, positive -> 1, negative -> -1.
fn sign(x: f64) -> f64 {
    if x > 0.0 {
        1.0
    } else if x < 0.0 {
        -1.0
    } else {
        0.0
    }
}

/// Thin wrapper: advance the vehicle one step, discarding diagnostics. The hot
/// path used by SITL and the physics tests goes through here, byte-for-byte the
/// same trajectory as before diagnostics existed.
pub fn step_copter(
    pwms: &[f64],
    state: &VehicleState,
    p: &MultirotorParams,
    env: &Environment,
    dt: f64,
    opts: StepOptions,
) -> VehicleState {
    step_copter_diag(pwms, state, p, env, dt, opts).0
}

/// Advance the vehicle one step and also return the force-budget diagnostics for
/// this step. The returned `VehicleState` is identical to `step_copter`'s; the
/// `StepDiagnostics` is read-only observability computed from values the step
/// already produces. Healthy path: no faults, no per-motor sink.
pub fn step_copter_diag(
    pwms: &[f64],
    state: &VehicleState,
    p: &MultirotorParams,
    env: &Environment,
    dt: f64,
    opts: StepOptions,
) -> (VehicleState, StepDiagnostics) {
    step_copter_core(pwms, state, p, env, dt, opts, &[], &[], &[], &WakeParams::default(), None, None)
}

/// Advance the vehicle one step with per-motor FAULTS and rotor PHASES injected,
/// optionally filling `motor_out` with each motor's `MotorOutput` (WS telemetry
/// sink; never touches the SITL wire). `faults`/`phases` shorter than the motor
/// count fall back to healthy / zero-phase per motor, so empty slices reproduce
/// `step_copter_diag` byte-for-byte.
#[allow(clippy::too_many_arguments)]
pub fn step_copter_faults(
    pwms: &[f64],
    state: &VehicleState,
    p: &MultirotorParams,
    env: &Environment,
    dt: f64,
    opts: StepOptions,
    faults: &[MotorFault],
    phases: &[f64],
    motor_out: Option<&mut Vec<MotorOutput>>,
) -> (VehicleState, StepDiagnostics) {
    step_copter_core(pwms, state, p, env, dt, opts, faults, phases, &[], &WakeParams::default(), motor_out, None)
}

/// Advance the vehicle one step inside a shared multi-vehicle world (spec 2.3):
/// `neighbor_wake` are OTHER vehicles' shed-rotor wake sources this vehicle
/// samples per-rotor (a rotor never sees its own wake), and `opts.external_force_world`
/// is the contact force from the collision pass. When both are inert (empty wake,
/// zero contact force) this is byte-identical to `step_copter_faults`. `shed_wake`,
/// if provided, is filled with THIS vehicle's per-rotor wake sources (world frame)
/// for publishing back into the shared field. Pure observability; never physics.
#[allow(clippy::too_many_arguments)]
pub fn step_copter_world(
    pwms: &[f64],
    state: &VehicleState,
    p: &MultirotorParams,
    env: &Environment,
    dt: f64,
    opts: StepOptions,
    faults: &[MotorFault],
    phases: &[f64],
    neighbor_wake: &[RotorWake],
    wake_params: &WakeParams,
    motor_out: Option<&mut Vec<MotorOutput>>,
    shed_wake: Option<&mut Vec<RotorWake>>,
) -> (VehicleState, StepDiagnostics) {
    step_copter_core(
        pwms, state, p, env, dt, opts, faults, phases, neighbor_wake, wake_params, motor_out, shed_wake,
    )
}

#[allow(clippy::too_many_arguments)]
fn step_copter_core(
    pwms: &[f64],
    state: &VehicleState,
    p: &MultirotorParams,
    env: &Environment,
    dt: f64,
    opts: StepOptions,
    faults: &[MotorFault],
    phases: &[f64],
    neighbor_wake: &[RotorWake],
    wake_params: &WakeParams,
    mut motor_out: Option<&mut Vec<MotorOutput>>,
    mut shed_wake: Option<&mut Vec<RotorWake>>,
) -> (VehicleState, StepDiagnostics) {
    // Air velocity of the vehicle in the body frame, and body rates.
    let air_world = state.velocity.sub(env.wind);
    let vel_air_bf = state.attitude.rotate_world_to_body(air_world);
    let gyro = state.angular_velocity;
    let air_density = env.air_density;

    // This vehicle's shed-wake axis (body +Z = down, world) and disc radius,
    // reused for every rotor when publishing wake sources (spec 2.5). The wake's
    // spatial width is the PHYSICAL rotor radius (from true_prop_area), the same
    // length scale the ground-effect model uses; the calibrated effective_prop_area
    // is a momentum-theory equivalent (unphysically small) that would make the jet
    // a needle. The far-wake SPEED w_r (slipstream_velocity) carries the energy and
    // is unchanged, so the shed wake stays energetically consistent with thrust.
    let shed_axis = state.attitude.rotate_body_to_world(Vec3::new(0.0, 0.0, 1.0));
    let shed_radius = (p.true_prop_area / std::f64::consts::PI).sqrt();
    if let Some(sink) = shed_wake.as_mut() {
        sink.clear();
    }

    // Actual battery voltage for the motor model (full pack when unspecified).
    let voltage = opts.voltage.unwrap_or(p.voltage_max);

    // 1-5. Sum per-motor thrust, torque and current (SIM_Motor / SIM_Frame).
    let mounts = frame_geometry(p.num_motors, p.diagonal_size);
    let mut force_body = Vec3::zero(); // body-frame thrust, Newtons (Z down)
    let mut torque = Vec3::zero(); // body-frame torque, N*m
    let mut total_current = 0.0;
    // Observability accumulators (do not feed physics).
    let mut motor_diags: Vec<MotorDiag> = Vec::with_capacity(mounts.len());
    let mut momentum_drag_bf = Vec3::zero();
    let mut hover_num = Vec3::zero(); // Σ pos_i * thrust_mag_i
    let mut hover_den = 0.0; // Σ thrust_mag_i
    // Ground effect (Cheeseman-Bennett, spec 1.a) is applied per motor via the
    // motor thrust, keyed on each rotor plane's height above the REAL ground
    // (AGL = -z - terrain height). A vehicle rolled/pitched near the deck gets
    // asymmetric lift; over flat datum ground this is the vehicle AGL.
    let r_rotor = rotor_radius(p);
    let vehicle_agl = -state.position.z - opts.ground_height;
    for (i, mount) in mounts.iter().enumerate() {
        let pwm = pwms.get(i).copied().unwrap_or(p.pwm_min);
        let fault = faults.get(i).copied().unwrap_or_default();
        let phase = phases.get(i).copied().unwrap_or(0.0);
        let offset_world = state.attitude.rotate_body_to_world(mount.position);
        let ge = if opts.ground_effect {
            // Motor world offset from CG; its +Z (down) component lowers this
            // rotor's height below the vehicle AGL.
            ground_effect_factor(vehicle_agl - offset_world.z, r_rotor)
        } else {
            1.0
        };
        // Per-rotor local air: the uniform ambient (env.wind, from world_env) plus
        // every OTHER vehicle's rotor wake sampled at THIS rotor's world position.
        // Downwash is strongly non-uniform across the disc, so it must be sampled
        // per rotor (spec 1.3). Empty neighbour set => vel_air_bf verbatim, so the
        // single-vehicle path is byte-identical (no extra term, no recompute).
        let vel_air_bf_r = if neighbor_wake.is_empty() {
            vel_air_bf
        } else {
            let o_r = state.position.add(offset_world);
            let mut wake_world = Vec3::zero();
            for src in neighbor_wake {
                wake_world = wake_world.add(wake_at(src, o_r, wake_params));
            }
            // U_air adds the wake; relative air velocity subtracts it.
            state.attitude.rotate_world_to_body(air_world.sub(wake_world))
        };
        let m = motor_forces_faulted(
            pwm, mount, p, air_density, voltage, vel_air_bf_r, gyro, true, ge, &fault, phase,
        );
        if let Some(sink) = motor_out.as_mut() {
            sink.push(m);
        }
        // Publish this rotor's shed wake source (world frame) for neighbours to
        // sample next frame. Energetically consistent: w_r is the exact slipstream
        // speed this rotor's thrust made this step.
        if let Some(sink) = shed_wake.as_mut() {
            sink.push(RotorWake {
                origin: state.position.add(offset_world),
                axis: shed_axis,
                w: m.slipstream_velocity,
                radius: shed_radius,
            });
        }
        force_body = force_body.add(m.thrust_bf);
        torque = torque.add(m.torque_bf);
        total_current += m.current;
        momentum_drag_bf = momentum_drag_bf.add(m.momentum_drag);
        hover_num = hover_num.add(mount.position.scale(m.thrust_mag));
        hover_den += m.thrust_mag;
        motor_diags.push(MotorDiag {
            position: mount.position,
            thrust_bf: m.thrust_bf,
            command: m.command,
            thrust_mag: m.thrust_mag,
            current: m.current,
            velocity_in: m.velocity_in,
            // arm_moment / ratio filled in a second pass below.
            arm_moment: mount.position.length() * m.thrust_bf.length(),
            arm_load_ratio: 0.0,
        });
    }
    // Net rotor thrust before ground effect / airframe drag (spec item 6/7).
    let net_thrust_bf = force_body;
    let net_thrust_world = state.attitude.rotate_body_to_world(net_thrust_bf);
    // Torque the rotational integrator will use (captured before any mutation).
    let diag_torque_bf = torque;
    // Second pass: normalise arm loads against the worst arm.
    let max_arm_moment = motor_diags
        .iter()
        .map(|m| m.arm_moment)
        .fold(0.0_f64, f64::max);
    if max_arm_moment > 0.0 {
        for m in motor_diags.iter_mut() {
            m.arm_load_ratio = m.arm_moment / max_arm_moment;
        }
    }
    // Thrust-weighted centroid (where lift is centred right now).
    let cg_hover_est = if hover_den > 0.0 {
        hover_num.scale(1.0 / hover_den)
    } else {
        Vec3::zero()
    };

    // 6. Airframe body drag (SIM_Frame.cpp 718-737): per-axis, signed by velocity.
    let dfac = p.area_cd * 0.5 * air_density;
    let drag_bf = Vec3::new(
        dfac * vel_air_bf.x * vel_air_bf.x * sign(vel_air_bf.x),
        dfac * vel_air_bf.y * vel_air_bf.y * sign(vel_air_bf.y),
        dfac * vel_air_bf.z * vel_air_bf.z * sign(vel_air_bf.z),
    );
    force_body = force_body.sub(drag_bf);

    // 6b. Slung-load reaction into the assembly (before the world-force step).
    // The load pulls the vehicle at the hardpoint along +u (toward the load) with
    // magnitude T (Newton's third law). Skipped entirely when no load is
    // configured, so the trajectory is byte-identical without one. The load's
    // weight is NOT added directly; it reaches the airframe only through T.
    let load_pending: Option<(SlungLoadParams, LoadState, Vec3, f64)> =
        match (p.slung_load, state.load) {
            (Some(slp), Some(ld)) => {
                // Hardpoint kinematics from pre-step state (as thrust uses pre-step
                // attitude). d = p_L - p_h, u points hardpoint -> load.
                let lever_world = state.attitude.rotate_body_to_world(slp.hardpoint);
                let p_h = state.position.add(lever_world);
                let omega_world = state.attitude.rotate_body_to_world(gyro);
                let v_h = state.velocity.add(omega_world.cross(lever_world));
                let d = ld.position.sub(p_h);
                let len = d.length();
                let u = if len < 1e-9 { Vec3::zero() } else { d.scale(1.0 / len) };
                // Release takes effect immediately this step (balloon-up on drop).
                let attached_now = ld.attached && !opts.release_load;
                // Unilateral spring-damper: tension only, and only when taut. The
                // max(0,.) enforces the tension-only constraint even under a large
                // negative damper term during rapid shortening (a cable cannot push).
                let tension = if attached_now && len > ld.cable_length {
                    let len_dot = ld.velocity.sub(v_h).dot(u);
                    (slp.stiffness * (len - ld.cable_length)
                        + slp.damping * (len_dot - opts.winch_rate))
                        .max(0.0)
                } else {
                    0.0
                };
                // Reaction at the hardpoint: +u (toward the load), magnitude T.
                let f_h_body = state.attitude.rotate_world_to_body(u.scale(tension));
                force_body = force_body.add(f_h_body);
                torque = torque.add(slp.hardpoint.cross(f_h_body));
                Some((slp, LoadState { attached: attached_now, ..ld }, u, tension))
            }
            _ => None,
        };

    // 7. provisional world force. force_body is the body-frame specific force
    // times mass (no gravity yet); rotate to world, add the external contact force
    // (spec 1.5), then gravity. A zero contact force is added conditionally so the
    // single-vehicle path stays byte-identical (no +0.0 rewrite of the vector).
    let non_grav_world = {
        let rotor = state.attitude.rotate_body_to_world(force_body);
        if opts.external_force_world == Vec3::zero() {
            rotor
        } else {
            rotor.add(opts.external_force_world)
        }
    };
    let gravity_world = Vec3::new(0.0, 0.0, p.mass * env.gravity);
    let provisional = non_grav_world.add(gravity_world);

    // 8. ground contact. The ground is the terrain surface at NED z = -ground_height
    // (flat datum plane when ground_height = 0, unchanged from before).
    let on_ground = state.position.z >= -opts.ground_height - GROUND_CONTACT_EPS;
    let nf = if on_ground {
        let mut nf = if provisional.z > 0.0 {
            Vec3::new(0.0, 0.0, -provisional.z)
        } else {
            Vec3::zero()
        };
        let weight = p.mass * env.gravity;
        let fx = -sign(state.velocity.x) * (state.velocity.x.abs() * p.mass).min(GROUND_FRICTION * weight);
        let fy = -sign(state.velocity.y) * (state.velocity.y.abs() * p.mass).min(GROUND_FRICTION * weight);
        nf = nf.add(Vec3::new(fx, fy, 0.0));
        nf
    } else {
        Vec3::zero()
    };

    // 9. world acceleration.
    let total_world = provisional.add(nf);
    let accel_world = total_world.scale(1.0 / p.mass);

    // 10. body acceleration (specific force, no gravity).
    let non_grav_total = non_grav_world.add(nf);
    let accel_body = state
        .attitude
        .rotate_world_to_body(non_grav_total.scale(1.0 / p.mass));

    // 11. semi-implicit Euler translation (position uses NEW velocity).
    let velocity = state.velocity.add(accel_world.scale(dt));
    let mut position = state.position.add(velocity.scale(dt));

    // 12. rotational dynamics (attitude uses NEW angular velocity). Follows
    // SIM_Frame::calculate_forces (706-716): rot_accel = torque / inertia, then
    // linear rotational air resistance. No Euler gyroscopic (w x Iw) term, to
    // match stock SITL exactly.
    let (ixx, iyy, izz) = inertia(p);
    let mut rot_accel = Vec3::new(torque.x / ixx, torque.y / iyy, torque.z / izz);
    // Rotational damping, verbatim from ArduPilot SIM_Frame:
    //   rot_accel -= gyro * radians(400) / terminal_rotation_rate
    // where terminal_rotation_rate = refRotRate (used raw, deg/s). Guarded like
    // ArduPilot so a zero rate leaves the response undamped (test frames).
    if p.ref_rot_rate > 0.0 {
        let damp = 400.0_f64.to_radians() / p.ref_rot_rate;
        rot_accel = rot_accel.sub(gyro.scale(damp));
    }
    let angular_velocity = gyro.add(rot_accel.scale(dt));
    let attitude = state.attitude.integrate(angular_velocity, dt);

    // 13. ground clamp: only when the vehicle is at or below ground level. The
    // downward-velocity clamp is scoped to ground contact so the vehicle can
    // descend normally in the air (an unconditional clamp would pin any sink
    // rate to zero and make descent/landing impossible).
    let mut velocity = velocity;
    let ground_z = -opts.ground_height;
    if position.z > ground_z {
        position.z = ground_z;
        if velocity.z > 0.0 {
            velocity.z = 0.0;
        }
    }

    // 13b. Integrate the load (world frame) with the SAME tension/direction the
    // vehicle felt, then advance winch length and ground-clamp it. Release is
    // already latched into `attached` above. A settled load on the ground goes
    // slack and stops loading the vehicle (correct "set the load down").
    let new_load = if let Some((slp, ld, u, tension)) = load_pending {
        let f_grav = Vec3::new(0.0, 0.0, slp.load_mass * env.gravity);
        let f_tens = u.scale(-tension); // tension pulls the load toward the hardpoint
        let v_rel = ld.velocity.sub(env.wind);
        let speed = v_rel.length();
        let f_drag = v_rel.scale(-0.5 * env.air_density * slp.load_drag_cda * speed);
        let a_l = f_grav.add(f_tens).add(f_drag).scale(1.0 / slp.load_mass);
        // Semi-implicit Euler (matches the vehicle integrator).
        let mut v_l = ld.velocity.add(a_l.scale(dt));
        let mut p_l = ld.position.add(v_l.scale(dt));
        if p_l.z > 0.0 {
            p_l.z = 0.0;
            if v_l.z > 0.0 {
                v_l.z = 0.0;
            }
        }
        let cable_length =
            (ld.cable_length + opts.winch_rate * dt).clamp(slp.winch_min, slp.winch_max);
        Some(LoadState {
            position: p_l,
            velocity: v_l,
            cable_length,
            tension,
            attached: ld.attached,
        })
    } else {
        state.load
    };

    // 14. advance time.
    let new_state = VehicleState {
        position,
        velocity,
        attitude,
        angular_velocity,
        accel_body,
        current: total_current,
        timestamp: state.timestamp + dt,
        load: new_load,
    };

    // Assemble diagnostics from values the step already produced. `accel_body`
    // is the gravity-free specific force, so its magnitude over g is the load
    // factor by definition. CG is the origin in v1 (symmetric point mass).
    let g = env.gravity;
    let load_factor = if g > 0.0 { accel_body.length() / g } else { 0.0 };
    let diag = StepDiagnostics {
        motors: motor_diags,
        net_thrust_bf,
        net_thrust_world,
        torque_bf: diag_torque_bf,
        airframe_drag_bf: drag_bf,
        momentum_drag_bf,
        load_factor,
        cg_body: Vec3::zero(),
        cg_shift: Vec3::zero(),
        cg_hover_est,
        max_arm_moment,
        weight: p.mass * env.gravity,
        net_force_world: total_world,
    };

    (new_state, diag)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame::{multirotor_params, FrameModel, MultirotorParams};
    const G: f64 = 9.80665;
    const DT: f64 = 1.0 / 400.0;
    fn params() -> MultirotorParams {
        // Calibrated like stock SITL for a light quad (ArduPilot reference bench
        // values, our mass/size). The calibrated model no longer hovers at a
        // hand-picked PWM, so hover-dependent tests derive the hover PWM below.
        multirotor_params(&FrameModel {
            mass: 1.5,
            diagonal_size: 0.4,
            ..Default::default()
        })
    }
    fn env() -> Environment {
        DEFAULT_ENVIRONMENT
    }
    fn run(pwms: &[f64], mut s: VehicleState, steps: usize) -> VehicleState {
        let (p, e) = (params(), env());
        for _ in 0..steps {
            s = step_copter(pwms, &s, &p, &e, DT, StepOptions::default());
        }
        s
    }
    /// One-step vertical velocity from rest at altitude, level, for a uniform PWM.
    /// Positive (NED down) means sinking, negative means climbing.
    fn one_step_vz(pwm: f64) -> f64 {
        let (p, e) = (params(), env());
        let mut s = initial_state();
        s.position.z = -20.0;
        step_copter(&[pwm; 4], &s, &p, &e, DT, StepOptions::default())
            .velocity
            .z
    }
    /// Bisect the uniform PWM at which the calibrated model holds altitude
    /// (net vertical thrust equals weight) at runtime air density.
    fn hover_pwm() -> f64 {
        let (mut lo, mut hi) = (1150.0_f64, 1950.0_f64);
        for _ in 0..60 {
            let mid = 0.5 * (lo + hi);
            // vz > 0 => sinking => not enough thrust => raise PWM.
            if one_step_vz(mid) > 0.0 {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        0.5 * (lo + hi)
    }
    #[test]
    fn rests_on_ground_at_idle() {
        let s = run(&[1000.0; 4], initial_state(), 400);
        assert!(s.position.z.abs() < 5e-4);
        assert!(s.velocity.z.abs() < 5e-4);
        assert!((s.accel_body.z - (-G)).abs() < 5e-2);
    }
    #[test]
    fn holds_altitude_at_hover() {
        // The calibrated model hovers near command = hoverThrOut; the exact PWM
        // is model-derived rather than a fixed 1390 (old approximation).
        let hp = hover_pwm();
        assert!(hp > 1150.0 && hp < 1950.0, "hover pwm out of band: {hp}");
        let mut start = initial_state();
        start.position.z = -10.0;
        let s = run(&[hp; 4], start, 2000);
        // Roughly holds altitude over 5 s.
        assert!((s.position.z - (-10.0)).abs() < 0.5, "drifted to {}", s.position.z);
        assert!(s.velocity.z.abs() < 0.1);
    }
    #[test]
    fn climbs_above_hover() {
        // Well above the hover PWM must climb (NED down decreasing).
        let pwm = (hover_pwm() + 150.0).min(1950.0);
        let s = run(&[pwm; 4], initial_state(), 300);
        assert!(s.position.z < -0.5 && s.velocity.z < 0.0);
    }
    #[test]
    fn yaws_nose_right() {
        let (p, e) = (params(), env());
        let s = step_copter(
            &[1450.0, 1450.0, 1330.0, 1330.0],
            &initial_state(),
            &p,
            &e,
            DT,
            StepOptions::default(),
        );
        assert!(s.angular_velocity.z > 0.0);
        assert!(s.angular_velocity.x.abs() < 1e-6 && s.angular_velocity.y.abs() < 1e-6);
    }
    #[test]
    fn rolls_right() {
        let (p, e) = (params(), env());
        let s = step_copter(
            &[1330.0, 1450.0, 1450.0, 1330.0],
            &initial_state(),
            &p,
            &e,
            DT,
            StepOptions::default(),
        );
        assert!(s.angular_velocity.x > 0.0 && s.angular_velocity.y.abs() < 1e-6);
    }
    #[test]
    fn stays_finite_over_long_hover() {
        let mut start = initial_state();
        start.position.z = -50.0;
        let s = run(&[hover_pwm(); 4], start, 5000);
        for v in [
            s.position.x,
            s.position.y,
            s.position.z,
            s.velocity.z,
            s.angular_velocity.z,
            s.accel_body.z,
        ] {
            assert!(v.is_finite());
        }
    }
    #[test]
    fn steady_wind_pushes_vehicle_downwind() {
        // A steady 8 m/s North wind on a level vehicle held at hover must produce a
        // horizontal aerodynamic reaction (body drag + per-motor momentum drag) and
        // drift the vehicle downwind (+North), while calm air produces no drift.
        // This locks the env.wind -> air_world (velocity - wind) -> vel_air_bf ->
        // drag/momentum-drag coupling the SIM_Frame port must preserve.
        let hp = hover_pwm();
        let p = params();
        let mut start = initial_state();
        start.position.z = -50.0;

        let calm = Environment { wind: Vec3::zero(), ..DEFAULT_ENVIRONMENT };
        let windy = Environment { wind: Vec3::new(8.0, 0.0, 0.0), ..DEFAULT_ENVIRONMENT };

        // One-step horizontal aero reaction: nonzero with wind, zero in calm.
        let (_sw, dw) = step_copter_diag(&[hp; 4], &start, &p, &windy, DT, StepOptions::default());
        let (_sc, dc) = step_copter_diag(&[hp; 4], &start, &p, &calm, DT, StepOptions::default());
        assert!(dc.airframe_drag_bf.x.abs() < 1e-12 && dc.momentum_drag_bf.length() < 1e-12,
            "calm air must carry no horizontal aero force");
        let windy_horiz = dw.airframe_drag_bf.x.abs() + dw.momentum_drag_bf.length();
        assert!(windy_horiz > 1e-6, "wind must produce a horizontal aero force, got {windy_horiz}");

        // Integrated: drift downwind over 3 s versus no drift in calm.
        let mut sc = start;
        let mut sw = start;
        for _ in 0..1200 {
            sc = step_copter(&[hp; 4], &sc, &p, &calm, DT, StepOptions::default());
            sw = step_copter(&[hp; 4], &sw, &p, &windy, DT, StepOptions::default());
        }
        assert!(sc.position.x.abs() < 1e-3, "calm: no drift, got {}", sc.position.x);
        assert!(sw.position.x > 0.2, "wind: should drift +North (downwind), got {}", sw.position.x);
        assert!(sw.velocity.x > 0.0, "downwind velocity should be positive, got {}", sw.velocity.x);
    }

    #[test]
    fn ground_effect_adds_lift() {
        let (p, e) = (params(), env());
        let mut low = initial_state();
        low.position.z = -0.1;
        let with_ge = step_copter(
            &[1600.0; 4],
            &low,
            &p,
            &e,
            0.01,
            StepOptions {
                voltage: None,
                ground_effect: true,
                ..StepOptions::default()
            },
        );
        let without = step_copter(
            &[1600.0; 4],
            &low,
            &p,
            &e,
            0.01,
            StepOptions {
                voltage: None,
                ground_effect: false,
                ..StepOptions::default()
            },
        );
        assert!(with_ge.velocity.z < without.velocity.z);
    }

    #[test]
    fn ground_effect_curve_matches_cheeseman_bennett() {
        // For z/R in {0.5,1,1.5}, the factor equals 1/(1-(R/4z)^2) exactly; for
        // z/R >= 2 it is exactly 1.0 (no residual in free air); the near-deck
        // clamp holds at z/R = 0.30 (factor <= GE_MAX_FACTOR).
        let r = 0.27_f64; // heavy-octa rotor radius, m
        for ratio in [0.5, 1.0, 1.5] {
            let z = ratio * r;
            let expect = 1.0 / (1.0 - (r / (4.0 * z)).powi(2));
            assert!((ground_effect_factor(z, r) - expect).abs() < 1e-9, "z/R={ratio}");
        }
        // z/R = 2 and beyond: forced to exactly 1.0.
        assert_eq!(ground_effect_factor(2.0 * r, r), 1.0);
        assert_eq!(ground_effect_factor(3.0 * r, r), 1.0);
        assert_eq!(ground_effect_factor(100.0, r), 1.0);
        // Below the clamp (z/R < 0.30) the factor is capped at GE_MAX_FACTOR.
        assert!(ground_effect_factor(0.05 * r, r) <= GE_MAX_FACTOR + 1e-12);
        assert!((ground_effect_factor(0.30 * r, r) - (1.0 / (1.0 - (1.0 / 1.2f64).powi(2))).min(GE_MAX_FACTOR)).abs() < 1e-9);
        // Known table values from the spec.
        assert!((ground_effect_factor(r, r) - 16.0 / 15.0).abs() < 1e-9); // z=R -> 1.0667
    }

    #[test]
    fn ground_effect_thrust_boost_tracks_curve() {
        // At a fixed PWM, from rest and level in calm air over flat ground, the
        // summed rotor thrust with GE on vs off equals the Cheeseman-Bennett factor
        // at that AGL, and is ~1 at 2R and above.
        let (p, e) = (params(), env());
        let r = rotor_radius(&p);
        for ratio in [0.3, 0.5, 1.0, 2.0, 5.0] {
            let agl = ratio * r;
            let mut s = initial_state();
            s.position.z = -agl;
            let on = step_copter_diag(&[1600.0; 4], &s, &p, &e, DT, StepOptions { ground_effect: true, ..StepOptions::default() }).1;
            let off = step_copter_diag(&[1600.0; 4], &s, &p, &e, DT, StepOptions { ground_effect: false, ..StepOptions::default() }).1;
            let measured = on.net_thrust_bf.z / off.net_thrust_bf.z; // both negative (up)
            let expect = ground_effect_factor(agl, r);
            assert!((measured - expect).abs() < 1e-6, "z/R={ratio}: measured {measured} vs {expect}");
            if ratio >= 2.0 {
                assert!((measured - 1.0).abs() < 1e-9, "no boost at z/R={ratio}");
            }
        }
    }

    #[test]
    fn ground_effect_off_flat_is_bit_identical_golden() {
        // Regression lock: with ground effect OFF and flat ground (ground_height 0),
        // a hover+climb+yaw trajectory must be unchanged. StepOptions::default()
        // (the calm case) and an explicit no-effect option produce byte-identical
        // states, and the trajectory matches a captured golden.
        let (p, e) = (params(), env());
        let mut a = initial_state();
        a.position.z = -25.0;
        let mut b = a;
        let pwms = [1550.0, 1450.0, 1500.0, 1480.0];
        let explicit = StepOptions { ground_effect: false, ground_height: 0.0, ..StepOptions::default() };
        for _ in 0..600 {
            a = step_copter(&pwms, &a, &p, &e, DT, StepOptions::default());
            b = step_copter(&pwms, &b, &p, &e, DT, explicit);
            assert_eq!(a.position, b.position);
            assert_eq!(a.velocity, b.velocity);
            assert_eq!(a.attitude, b.attitude);
        }
        // Golden values captured from the pre-change engine's no-effect path.
        assert!((a.position.x - GOLDEN_POS_X).abs() < 1e-12, "pos.x {} vs {}", a.position.x, GOLDEN_POS_X);
        assert!((a.position.z - GOLDEN_POS_Z).abs() < 1e-12, "pos.z {} vs {}", a.position.z, GOLDEN_POS_Z);
        assert!((a.angular_velocity.z - GOLDEN_WZ).abs() < 1e-12, "wz {} vs {}", a.angular_velocity.z, GOLDEN_WZ);
    }

    #[test]
    fn lands_on_sloped_terrain_at_surface_height() {
        // A vehicle descending over terrain of height h settles at datum altitude h
        // (position.z = -h) with the sink rate zeroed, not at z=0.
        let (p, e) = (params(), env());
        let h = 12.0; // terrain 12 m above datum
        let mut s = initial_state();
        s.position.z = -30.0; // 30 m above datum, ~18 m AGL
        s.velocity.z = 2.0; // descending
        let opts = StepOptions { ground_height: h, ..StepOptions::default() };
        for _ in 0..4000 {
            s = step_copter(&[1000.0; 4], &s, &p, &e, DT, opts); // idle: it falls
        }
        assert!((s.position.z - (-h)).abs() < 1e-3, "should rest on the surface z=-h, got {}", s.position.z);
        assert!(s.velocity.z.abs() < 1e-3, "sink rate should be zeroed at the surface, got {}", s.velocity.z);
    }

    #[test]
    fn friction_engages_at_terrain_surface() {
        // On the terrain surface (not z=0), a horizontal velocity is opposed by
        // ground friction, so it decays toward zero.
        let (p, e) = (params(), env());
        let h = 8.0;
        let mut s = initial_state();
        s.position.z = -h; // sitting on the surface
        s.velocity = Vec3::new(3.0, 0.0, 0.0);
        let opts = StepOptions { ground_height: h, ..StepOptions::default() };
        let v0 = s.velocity.x;
        for _ in 0..200 {
            s = step_copter(&[1000.0; 4], &s, &p, &e, DT, opts);
        }
        assert!(s.velocity.x < v0, "friction at the surface must slow horizontal motion: {} -> {}", v0, s.velocity.x);
        assert!(s.position.z <= -h + 1e-3, "stays on the surface");
    }

    // ─── Multi-vehicle wake coupling (spec 3.1) ──────────────────────────────

    /// Capture a hovering vehicle's shed rotor wake at altitude `z`.
    fn shed_wake_at_hover(z: f64) -> (Vec<RotorWake>, f64) {
        let (p, e) = (params(), env());
        let hp = hover_pwm();
        let mut a = initial_state();
        a.position.z = z;
        let mut wake: Vec<RotorWake> = Vec::new();
        let wp = WakeParams::default();
        step_copter_world(&[hp; 4], &a, &p, &e, DT, StepOptions::default(), &[], &[], &[], &wp, None, Some(&mut wake));
        (wake, hp)
    }

    /// One-step vertical accel (NED down, +=sink) of a vehicle at `pos`, at hover
    /// command, immersed in `neighbor` wake.
    fn a_sink_in_wake(pos: Vec3, hp: f64, neighbor: &[RotorWake]) -> f64 {
        let (p, e) = (params(), env());
        let mut b = initial_state();
        b.position = pos;
        let wp = WakeParams::default();
        let (b1, _d) = step_copter_world(
            &[hp; 4], &b, &p, &e, DT, StepOptions::default(), &[], &[], neighbor, &wp, None, None,
        );
        b1.velocity.z / DT
    }

    #[test]
    fn isolated_hover_unaffected_by_empty_neighbor_wake() {
        // The whole capability must be inert for a lone vehicle: an EMPTY neighbour
        // set produces a trajectory bit-identical to the plain step (invariant 2).
        let (p, e) = (params(), env());
        let hp = hover_pwm();
        let wp = WakeParams::default();
        let mut a = initial_state();
        a.position.z = -20.0;
        let mut b = a;
        for _ in 0..500 {
            let plain = step_copter(&[hp; 4], &a, &p, &e, DT, StepOptions::default());
            let (world, _d) = step_copter_world(
                &[hp; 4], &b, &p, &e, DT, StepOptions::default(), &[], &[], &[], &wp, None, None,
            );
            a = plain;
            b = world;
            assert_eq!(a.position, b.position);
            assert_eq!(a.velocity, b.velocity);
            assert_eq!(a.attitude, b.attitude);
        }
    }

    #[test]
    fn lower_vehicle_sinks_strongly_directly_below() {
        // A wingman dropping into the leader's downwash column sinks: B directly
        // under A's disc, at A's hover command, is pushed down (spec 3.1 case 2).
        // The exact g/4 thrust-reduction relation is validated in motor.rs
        // (`inflow_half_outflow_gives_three_quarter_thrust`); at the vehicle level
        // momentum drag through the fast slipstream adds to it, so the sink is a
        // strong, order-g effect. Here we lock the sign, finiteness and that being
        // in the column matters a lot versus free air.
        let (wake, hp) = shed_wake_at_hover(-20.0);
        assert_eq!(wake.len(), 4);
        let below = Vec3::new(0.0, 0.0, -20.0 + 0.05); // 5 cm under A, aligned
        let a_sink = a_sink_in_wake(below, hp, &wake);
        let free = a_sink_in_wake(Vec3::new(0.0, 0.0, -20.0 + 0.05), hp, &[]);
        assert!(a_sink.is_finite());
        assert!(free.abs() < 1e-6, "free-air hover holds altitude, got {free}");
        assert!(a_sink > 0.2 * G, "downwash must produce a strong sink, got {a_sink}");
    }

    #[test]
    fn beside_the_column_is_unaffected() {
        // B well to the side of A's wake tubes (rho >> r_w): no downwash, so it
        // holds altitude as if alone (spec 3.1 case 5).
        let (wake, hp) = shed_wake_at_hover(-20.0);
        let aside = Vec3::new(20.0, 0.0, -20.0 + 0.02); // 20 m north, just below alt
        let a_sink = a_sink_in_wake(aside, hp, &wake);
        let alone = a_sink_in_wake(Vec3::new(20.0, 0.0, -20.0 + 0.02), hp, &[]);
        assert!((a_sink - alone).abs() < 1e-6, "beside the column must match free air: {a_sink} vs {alone}");
    }

    #[test]
    fn above_the_disc_is_unaffected() {
        // B ABOVE A (s < 0): the wake never reaches up, so B is unaffected. Guards
        // against spurious lift/sink above a neighbour (spec 3.1 case 5).
        let (wake, hp) = shed_wake_at_hover(-20.0);
        let above = Vec3::new(0.0, 0.0, -20.0 - 5.0); // 5 m above A, aligned
        let a_sink = a_sink_in_wake(above, hp, &wake);
        let alone = a_sink_in_wake(Vec3::new(0.0, 0.0, -20.0 - 5.0), hp, &[]);
        assert!((a_sink - alone).abs() < 1e-6, "above the disc must match free air: {a_sink} vs {alone}");
    }

    #[test]
    fn deeper_in_the_column_sinks_harder_than_near_the_disc() {
        // Monotonic dose-response: further into the developed column (larger s,
        // within the coherent range) the induced sink grows toward ~g (spec 3.1
        // cases 3/4), so it exceeds the near-disc g/4.
        let (wake, hp) = shed_wake_at_hover(-20.0);
        let near = a_sink_in_wake(Vec3::new(0.0, 0.0, -20.0 + 0.05), hp, &wake);
        let deep = a_sink_in_wake(Vec3::new(0.0, 0.0, -20.0 + 0.9), hp, &wake);
        assert!(deep > near, "deeper in the column must sink harder: deep {deep} vs near {near}");
    }

    // Golden constants for `ground_effect_off_flat_is_bit_identical_golden`,
    // captured from the no-effect path (unchanged by the environmental coupling).
    const GOLDEN_POS_X: f64 = -1.0536557671553581;
    const GOLDEN_POS_Z: f64 = -17.215682162418364;
    const GOLDEN_WZ: f64 = 0.061583280308519804;

    // ─── Observability (step_copter_diag) ────────────────────────────────────
    use crate::motor::motor_forces;
    use crate::frame_geometry::frame_geometry;

    fn diag_at(pwms: &[f64], mut s: VehicleState) -> (VehicleState, StepDiagnostics) {
        let (p, e) = (params(), env());
        s.position.z = s.position.z.min(-20.0);
        step_copter_diag(pwms, &s, &p, &e, DT, StepOptions::default())
    }

    #[test]
    fn thrust_sum_closes_force_budget() {
        // Level, from rest at altitude, calm air (drag_bf = 0, ge off): the whole
        // body force is the rotor sum, so the resulting acceleration is exactly
        // (net_thrust + gravity)/mass.
        let hp = hover_pwm();
        let (p, e) = (params(), env());
        let mut start = initial_state();
        start.position.z = -30.0;
        let (s, d) = step_copter_diag(&[hp; 4], &start, &p, &e, DT, StepOptions::default());
        // Σ per-motor thrust == net_thrust_bf, exactly (same summation).
        let mut sum = Vec3::zero();
        for m in &d.motors {
            sum = sum.add(m.thrust_bf);
        }
        assert!((sum.x - d.net_thrust_bf.x).abs() < 1e-12);
        assert!((sum.y - d.net_thrust_bf.y).abs() < 1e-12);
        assert!((sum.z - d.net_thrust_bf.z).abs() < 1e-12);
        // Drag is zero at rest, so the body force is net_thrust_bf and the
        // one-step velocity closes the budget with gravity.
        assert!(d.airframe_drag_bf.length() < 1e-12);
        let expect_vz = (d.net_thrust_bf.z + p.mass * e.gravity) / p.mass * DT;
        assert!((s.velocity.z - expect_vz).abs() < 1e-9, "{} vs {}", s.velocity.z, expect_vz);
    }

    #[test]
    fn torque_diag_is_the_integrator_torque() {
        // A yaw-biased mix produces non-zero torque; diag.torque_bf must equal an
        // independent sum of the per-motor torques the integrator used.
        let pwms = [1500.0, 1500.0, 1350.0, 1350.0];
        let (p, e) = (params(), env());
        let (_s, d) = step_copter_diag(&pwms, &initial_state(), &p, &e, DT, StepOptions::default());
        let mounts = frame_geometry(p.num_motors, p.diagonal_size);
        let mut torque = Vec3::zero();
        for (i, mount) in mounts.iter().enumerate() {
            let m = motor_forces(pwms[i], mount, &p, e.air_density, p.voltage_max, Vec3::zero(), Vec3::zero(), true);
            torque = torque.add(m.torque_bf);
        }
        assert!(d.torque_bf.z.abs() > 1e-6, "yaw torque should be non-zero");
        assert!((d.torque_bf.x - torque.x).abs() < 1e-9);
        assert!((d.torque_bf.y - torque.y).abs() < 1e-9);
        assert!((d.torque_bf.z - torque.z).abs() < 1e-9);
    }

    #[test]
    fn load_factor_is_one_g_in_hover() {
        let hp = hover_pwm();
        let (_s, d) = diag_at(&[hp; 4], initial_state());
        assert!((d.load_factor - 1.0).abs() < 2e-2, "hover load factor {}", d.load_factor);
        // Idle on the ground: weight on the gear, specific force ~ g -> n ~ 1.
        let (p, e) = (params(), env());
        let (_g, dg) = step_copter_diag(&[1000.0; 4], &initial_state(), &p, &e, DT, StepOptions::default());
        assert!((dg.load_factor - 1.0).abs() < 1e-1, "ground load factor {}", dg.load_factor);
        // Full throttle from altitude pulls more than 1 g.
        let (_f, df) = diag_at(&[2000.0; 4], initial_state());
        assert!(df.load_factor > 1.0, "full-throttle load factor {}", df.load_factor);
    }

    #[test]
    fn hover_cg_matches_geometry_and_tracks_dead_motor() {
        let hp = hover_pwm();
        let (_s, d) = diag_at(&[hp; 4], initial_state());
        // Balanced hover: thrust-weighted centroid ~ origin.
        assert!(d.cg_hover_est.length() < 1e-6, "balanced cg_hover {:?}", d.cg_hover_est);
        // Kill MOT_1 (front-right, +x/+y quadrant): centroid swings away from it.
        let mounts = frame_geometry(4, params().diagonal_size);
        let dead = mounts[0].position;
        let (_s2, d2) = diag_at(&[1000.0, hp, hp, hp], initial_state());
        // Moves opposite the dead motor: dot(shift, dead_dir) < 0.
        assert!(d2.cg_hover_est.dot(dead) < -1e-6, "cg should shift off dead motor: {:?}", d2.cg_hover_est);
    }

    #[test]
    fn per_arm_moment_sanity() {
        // Only MOT_2 spins; its arm carries the whole (max) load, ratio 1.0.
        let hp = hover_pwm();
        let (_s, d) = diag_at(&[1000.0, hp, 1000.0, 1000.0], initial_state());
        let live = &d.motors[1];
        assert!(live.arm_moment > 0.0);
        let expect = live.position.length() * live.thrust_bf.length();
        assert!((live.arm_moment - expect).abs() < 1e-9);
        assert!((live.arm_load_ratio - 1.0).abs() < 1e-12);
        assert!((d.max_arm_moment - live.arm_moment).abs() < 1e-12);
        for (i, m) in d.motors.iter().enumerate() {
            if i == 1 {
                continue;
            }
            assert!(m.arm_moment < live.arm_moment);
            assert!(m.arm_load_ratio < 1.0);
        }
    }

    #[test]
    fn momentum_drag_is_faithful_attribution() {
        // Sideways airspeed makes momentum drag non-zero; net_thrust + Σmd must
        // reproduce the pure (no-drag) rotor sum, so md is not double-counted.
        let hp = hover_pwm();
        let (p, e) = (params(), env());
        let mut start = initial_state();
        start.position.z = -30.0;
        start.velocity = Vec3::new(8.0, 0.0, 0.0);
        let (_s, d) = step_copter_diag(&[hp; 4], &start, &p, &e, DT, StepOptions::default());
        assert!(d.momentum_drag_bf.length() > 0.0, "momentum drag should be non-zero");
        // Independent no-drag sum with the same inflow.
        let vel_air_bf = start.attitude.rotate_world_to_body(start.velocity);
        let mounts = frame_geometry(p.num_motors, p.diagonal_size);
        let mut pure = Vec3::zero();
        for (i, mount) in mounts.iter().enumerate() {
            let m = motor_forces([hp; 4][i], mount, &p, e.air_density, p.voltage_max, vel_air_bf, start.angular_velocity, false);
            pure = pure.add(m.thrust_bf);
        }
        let recon = d.net_thrust_bf.add(d.momentum_drag_bf);
        assert!((recon.x - pure.x).abs() < 1e-9);
        assert!((recon.y - pure.y).abs() < 1e-9);
        assert!((recon.z - pure.z).abs() < 1e-9);
    }

    #[test]
    fn diagnostics_never_move_the_vehicle() {
        // Golden trajectory: step_copter and step_copter_diag(..).0 must produce a
        // bit-identical VehicleState stream for the same seed/inputs.
        let (p, e) = (params(), env());
        let mut a = initial_state();
        a.position.z = -25.0;
        let mut b = a;
        let pwms = [1550.0, 1450.0, 1500.0, 1480.0];
        for _ in 0..500 {
            a = step_copter(&pwms, &a, &p, &e, DT, StepOptions::default());
            b = step_copter_diag(&pwms, &b, &p, &e, DT, StepOptions::default()).0;
            assert_eq!(a.position, b.position);
            assert_eq!(a.velocity, b.velocity);
            assert_eq!(a.attitude, b.attitude);
            assert_eq!(a.angular_velocity, b.angular_velocity);
            assert_eq!(a.accel_body, b.accel_body);
            assert_eq!(a.current, b.current);
        }
    }

    #[test]
    fn dead_battery_diagnostics_are_zero() {
        let (p, e) = (params(), env());
        let mut start = initial_state();
        start.position.z = -30.0;
        let (_s, d) = step_copter_diag(
            &[1800.0; 4],
            &start,
            &p,
            &e,
            DT,
            StepOptions { voltage: Some(0.05 * p.voltage_max), ground_effect: false, ..StepOptions::default() },
        );
        for m in &d.motors {
            assert_eq!(m.thrust_bf, Vec3::zero());
            assert_eq!(m.command, 0.0);
            assert_eq!(m.thrust_mag, 0.0);
            assert_eq!(m.current, 0.0);
            assert_eq!(m.velocity_in, 0.0);
            assert_eq!(m.arm_moment, 0.0);
            assert_eq!(m.arm_load_ratio, 0.0);
        }
        assert_eq!(d.net_thrust_bf, Vec3::zero());
        assert_eq!(d.momentum_drag_bf, Vec3::zero());
        assert_eq!(d.max_arm_moment, 0.0);
    }

    // ─── Slung load (point-mass, compliant cable) ────────────────────────────
    use std::f64::consts::PI;

    fn slung(m_l: f64, len: f64, hardpoint: Vec3, k: f64, c: f64, cda: f64) -> MultirotorParams {
        let mut p = params();
        p.slung_load = Some(SlungLoadParams {
            load_mass: m_l,
            cable_length: len,
            hardpoint,
            stiffness: k,
            damping: c,
            load_drag_cda: cda,
            winch_min: 0.0,
            winch_max: 100.0,
        });
        p
    }

    /// Altitude the pinned-hardpoint pendulum tests fly at, so the load hangs in
    /// the air (a hardpoint at ground level would sink the load underground and it
    /// would be ground-clamped).
    const PIN_ALT: f64 = 50.0;

    /// Run the load while pinning the vehicle at `pin_pos` (hardpoint fixed), so we
    /// exercise the pure pendulum dynamics. Returns the final LoadState.
    fn run_pinned(p: &MultirotorParams, e: &Environment, pin_pos: Vec3, load0: LoadState, opts: StepOptions, steps: usize) -> LoadState {
        let mut s = initial_state();
        s.position = pin_pos;
        s.load = Some(load0);
        let pwm = [1000.0; 4];
        let mut load = load0;
        for _ in 0..steps {
            let ns = step_copter(&pwm, &s, p, e, DT, opts);
            load = ns.load.unwrap();
            s = initial_state();
            s.position = pin_pos;
            s.load = Some(load);
        }
        load
    }

    #[test]
    fn pendulum_small_angle_period() {
        // Pinned hardpoint at the origin, 5 deg displacement, undamped. The swing
        // period must match the ideal pendulum 2*pi*sqrt(L/g) (the compliant cable
        // sag adds only ~0.3%).
        let (l, m, k) = (3.0, 8.0, 4000.0);
        let p = slung(m, l, Vec3::zero(), k, 0.0, 0.0);
        let e = env();
        let pin = Vec3::new(0.0, 0.0, -PIN_ALT); // hardpoint (body origin) at altitude
        let theta = 5.0_f64.to_radians();
        // Displaced 5 deg about the world hardpoint (pin), staying above ground.
        let load0 = LoadState {
            position: pin.add(Vec3::new(l * theta.sin(), 0.0, l * theta.cos())),
            velocity: Vec3::zero(),
            cable_length: l,
            tension: 0.0,
            attached: true,
        };
        let mut s = initial_state();
        s.position = pin;
        s.load = Some(load0);
        let pwm = [1000.0; 4];
        let mut prev_x = load0.position.x;
        let mut t = 0.0;
        let mut crossings: Vec<f64> = Vec::new();
        for _ in 0..8000 {
            let ns = step_copter(&pwm, &s, &p, &e, DT, StepOptions::default());
            let load = ns.load.unwrap();
            s = initial_state();
            s.position = pin;
            s.load = Some(load);
            t += DT;
            if prev_x.signum() != load.position.x.signum() {
                crossings.push(t);
            }
            prev_x = load.position.x;
        }
        assert!(crossings.len() >= 3, "expected zero crossings, got {}", crossings.len());
        let period = crossings[2] - crossings[0]; // two half-swings = one period
        let expect = 2.0 * PI * (l / G).sqrt();
        assert!((period - expect).abs() / expect < 0.02, "period {} vs {}", period, expect);
    }

    #[test]
    fn undamped_swing_conserves_energy() {
        // Total mechanical energy (KE + PE + spring) stays bounded over many
        // periods (symplectic Euler does not conserve exactly but does not drift).
        let (l, m, k) = (3.0, 8.0, 4000.0);
        let p = slung(m, l, Vec3::zero(), k, 0.0, 0.0);
        let e = env();
        let pin = Vec3::new(0.0, 0.0, -PIN_ALT);
        let theta = 20.0_f64.to_radians();
        let load0 = LoadState {
            position: pin.add(Vec3::new(l * theta.sin(), 0.0, l * theta.cos())),
            velocity: Vec3::zero(),
            cable_length: l,
            tension: 0.0,
            attached: true,
        };
        // Energy about the (fixed) world hardpoint `pin`.
        let energy = |ld: &LoadState| {
            let ke = 0.5 * m * ld.velocity.dot(ld.velocity);
            let pe = m * G * (-ld.position.z); // up positive
            let eps = (ld.position.sub(pin).length() - l).max(0.0);
            ke + pe + 0.5 * k * eps * eps
        };
        let e0 = energy(&load0);
        let denom = e0.abs();
        let mut s = initial_state();
        s.position = pin;
        s.load = Some(load0);
        let pwm = [1000.0; 4];
        let (mut emin, mut emax) = (e0, e0);
        for _ in 0..14000 {
            let ns = step_copter(&pwm, &s, &p, &e, DT, StepOptions::default());
            let load = ns.load.unwrap();
            s = initial_state();
            s.position = pin;
            s.load = Some(load);
            let en = energy(&load);
            emin = emin.min(en);
            emax = emax.max(en);
        }
        assert!((emax - emin) / denom < 0.02, "energy drift: min {} max {} e0 {}", emin, emax, e0);
    }

    #[test]
    fn tension_settles_to_load_weight_and_cable_vertical() {
        // From the seeded hanging equilibrium the load sags by m*g/k and tension
        // settles to the load weight; the cable stays vertical (no lateral force).
        let (l, m) = (3.0, 6.0);
        let hp = Vec3::new(0.0, 0.0, 0.15);
        let p = slung(m, l, hp, 4000.0, 200.0, 0.0);
        let e = env();
        let pin = Vec3::new(0.0, 0.0, -PIN_ALT);
        let mut s0 = initial_state();
        s0.position = pin;
        let seeded = seed_load(&p.slung_load.unwrap(), &s0);
        let load = run_pinned(&p, &e, pin, seeded, StepOptions::default(), 8000);
        assert!((load.tension - m * G).abs() / (m * G) < 0.02, "tension {} vs {}", load.tension, m * G);
        // Cable vertical: load's horizontal offset from the world hardpoint ~ 0.
        let hp_world = pin.add(hp);
        let horiz = ((load.position.x - hp_world.x).powi(2) + (load.position.y - hp_world.y).powi(2)).sqrt();
        assert!(horiz < 1e-3, "cable not vertical, horiz {}", horiz);
    }

    #[test]
    fn release_makes_load_ballistic_and_unloads_vehicle() {
        // From a taut, loaded state, releasing zeros the tension immediately: the
        // load free-falls and the vehicle's downward pull vanishes (balloon-up).
        let (l, m, k) = (3.0, 6.0, 4000.0);
        let hp = Vec3::new(0.0, 0.0, 0.15);
        let p = slung(m, l, hp, k, 200.0, 0.0);
        let e = env();
        let mut s = initial_state();
        s.position.z = -30.0;
        let sag = m * G / k;
        s.load = Some(LoadState {
            position: s.position.add(hp).add(Vec3::new(0.0, 0.0, l + sag)),
            velocity: Vec3::zero(),
            cable_length: l,
            tension: 0.0,
            attached: true,
        });
        let pwm = [1000.0; 4];
        let attached = step_copter(&pwm, &s, &p, &e, DT, StepOptions::default());
        let released = step_copter(&pwm, &s, &p, &e, DT, StepOptions { release_load: true, ..StepOptions::default() });
        let rl = released.load.unwrap();
        assert!(!rl.attached, "load must latch detached");
        assert_eq!(rl.tension, 0.0);
        // Load becomes ballistic: falls at ~g (was held near zero when attached).
        assert!((rl.velocity.z - G * DT).abs() < 1e-6, "released load vz {}", rl.velocity.z);
        assert!(attached.load.unwrap().velocity.z.abs() < G * DT * 0.5, "attached load should hang");
        // Vehicle: tension pulled it down (+z); removing it makes vz less positive
        // by ~ (m*g/m_v)*dt.
        let dvz = attached.velocity.z - released.velocity.z;
        let expect = (m * G / p.mass) * DT;
        assert!((dvz - expect).abs() / expect < 0.05, "balloon-up dvz {} vs {}", dvz, expect);
    }

    #[test]
    fn reaction_torque_rolls_toward_load() {
        // A load offset to +y (then -y) rolls the vehicle with the sign of
        // r_h x F_h_body, and the sense flips with the load side.
        let (l, m) = (3.0, 6.0);
        let hp = Vec3::new(0.0, 0.0, 0.2);
        let p = slung(m, l, hp, 4000.0, 50.0, 0.0);
        let e = env();
        let roll_for = |dy: f64| {
            let mut s = initial_state();
            s.position.z = -30.0;
            let base = s.position.add(hp);
            s.load = Some(LoadState {
                position: base.add(Vec3::new(0.0, dy, l + 0.05)),
                velocity: Vec3::zero(),
                cable_length: l,
                tension: 0.0,
                attached: true,
            });
            step_copter(&[1000.0; 4], &s, &p, &e, DT, StepOptions::default()).angular_velocity.x
        };
        let right = roll_for(0.5);
        let left = roll_for(-0.5);
        assert!(right < 0.0 && left > 0.0, "roll sign must flip with load side: +y {} -y {}", right, left);
        assert!(right.abs() > 1e-6);
    }

    #[test]
    fn winch_pays_out_and_reels_in_with_clamps() {
        let mut p = slung(6.0, 3.0, Vec3::new(0.0, 0.0, 0.15), 4000.0, 100.0, 0.0);
        p.slung_load = Some(SlungLoadParams { winch_min: 1.0, winch_max: 5.0, ..p.slung_load.unwrap() });
        let e = env();
        let pin = Vec3::new(0.0, 0.0, -PIN_ALT);
        let mut s0 = initial_state();
        s0.position = pin;
        let seeded = seed_load(&p.slung_load.unwrap(), &s0);
        // Pay out fast for 10 s: cable grows and clamps at winch_max.
        let out = run_pinned(&p, &e, pin, seeded, StepOptions { winch_rate: 1.0, ..StepOptions::default() }, 4000);
        assert!((out.cable_length - 5.0).abs() < 1e-6, "payout clamp {}", out.cable_length);
        // Reel in fast: cable shrinks and clamps at winch_min.
        let inn = run_pinned(&p, &e, pin, out, StepOptions { winch_rate: -1.0, ..StepOptions::default() }, 4000);
        assert!((inn.cable_length - 1.0).abs() < 1e-6, "reel-in clamp {}", inn.cable_length);
    }

    // ─── Failure physics validation (§3) ─────────────────────────────────────
    use crate::motor::{pwm_to_command, MotorFault};

    /// Analytic hover command c_h for a per-motor thrust `t_h`, and the thrust
    /// derivative dT/dc at that point (both from calc_thrust, inflow=0).
    fn hover_command_and_dtdc(p: &MultirotorParams, rho: f64, t_h: f64) -> (f64, f64) {
        let a = p.effective_prop_area;
        let vmax = p.max_outflow_velocity;
        let e = p.prop_expo;
        let thrust = |c: f64| 0.5 * rho * a * (vmax * vmax) * ((1.0 - e) * c + e * c * c);
        // Bisect c in [0,1] for thrust(c) = t_h.
        let (mut lo, mut hi) = (0.0_f64, 1.0_f64);
        for _ in 0..80 {
            let mid = 0.5 * (lo + hi);
            if thrust(mid) < t_h { lo = mid; } else { hi = mid; }
        }
        let c_h = 0.5 * (lo + hi);
        let dtdc = 0.5 * rho * a * vmax * vmax * ((1.0 - e) + 2.0 * e * c_h);
        (c_h, dtdc)
    }

    /// Per-motor effectiveness rows [F_z, M_roll, M_pitch, M_yaw] per unit command
    /// at hover, from the exact motor.rs formulas. Dead motor's row is zeroed.
    fn effectiveness(p: &MultirotorParams, rho: f64, dead: usize) -> (Vec<[f64; 4]>, f64) {
        let g = 9.80665;
        let w = p.mass * g;
        let n = p.num_motors as usize;
        let t_h = w / n as f64;
        let (c_h, dtdc) = hover_command_and_dtdc(p, rho, t_h);
        let mounts = frame_geometry(p.num_motors, p.diagonal_size);
        let rows = mounts
            .iter()
            .enumerate()
            .map(|(i, m)| {
                if i == dead {
                    return [0.0; 4];
                }
                let (rx, ry) = (m.position.x, m.position.y);
                // d(yaw torque)/dc = yaw_factor * 0.05 * D * (T_h + c_h * dT/dc).
                let kyaw = m.yaw_factor * 0.05 * p.diagonal_size * (t_h + c_h * dtdc);
                [-dtdc, -ry * dtdc, rx * dtdc, kyaw]
            })
            .collect();
        (rows, w)
    }

    fn solve4(mut a: [[f64; 4]; 4], mut b: [f64; 4]) -> Option<[f64; 4]> {
        for i in 0..4 {
            let mut piv = i;
            for r in i + 1..4 {
                if a[r][i].abs() > a[piv][i].abs() { piv = r; }
            }
            if a[piv][i].abs() < 1e-15 { return None; }
            a.swap(i, piv);
            b.swap(i, piv);
            for r in 0..4 {
                if r != i {
                    let f = a[r][i] / a[i][i];
                    for c in 0..4 { a[r][c] -= f * a[i][c]; }
                    b[r] -= f * b[i];
                }
            }
        }
        let mut x = [0.0; 4];
        for i in 0..4 { x[i] = b[i] / a[i][i]; }
        Some(x)
    }

    /// Min-norm least-squares commands x solving B^T x = [-W, 0, 0, 0] (hold
    /// weight, zero net moment) with the dead motor's column removed. Returns the
    /// live-motor commands and the net yaw residual.
    fn motor_out_solution(p: &MultirotorParams, rho: f64, dead: usize) -> (Vec<f64>, f64) {
        let (rows, w) = effectiveness(p, rho, dead);
        let mut gg = [[0.0; 4]; 4];
        for r in &rows {
            for a in 0..4 {
                for b in 0..4 { gg[a][b] += r[a] * r[b]; }
            }
        }
        let t = [-w, 0.0, 0.0, 0.0];
        let y = solve4(gg, t).expect("effectiveness Gram must be rank 4 (all axes controllable)");
        let x: Vec<f64> = rows.iter().map(|r| (0..4).map(|a| r[a] * y[a]).sum()).collect();
        // Net yaw residual.
        let mut net = [0.0; 4];
        for (i, r) in rows.iter().enumerate() {
            for a in 0..4 { net[a] += r[a] * x[i]; }
        }
        (x, (net[3] - t[3]).abs())
    }

    fn octa_params() -> MultirotorParams {
        multirotor_params(&FrameModel { mass: 32.5, diagonal_size: 1.325, disc_area: 1.82, num_motors: 8.0, ..Default::default() })
    }
    fn hexa_params() -> MultirotorParams {
        multirotor_params(&FrameModel { mass: 12.0, diagonal_size: 0.65, disc_area: 0.9, num_motors: 6.0, ..Default::default() })
    }

    #[test]
    fn octa_survives_motor_out_hexa_does_not() {
        // §3a. After a single motor-out, the octa holds all four axes with every
        // live motor at a comfortable INTERIOR throttle (margin on both band edges)
        // and zero yaw residual: controllable. The hexa reaches the same [W,0,0,0]
        // only by driving a second motor to its idle floor (command ~ 0) - it
        // collapses to an effective quad with no remaining yaw margin. This is the
        // physical reason motor-out is survivable on an octa and marginal on a hexa.
        let rho = 1.225;

        let (xo, yaw_res_o) = motor_out_solution(&octa_params(), rho, 0);
        let live_o: Vec<f64> = xo.iter().copied().enumerate().filter(|(i, _)| *i != 0).map(|(_, v)| v).collect();
        let omin = live_o.iter().cloned().fold(f64::INFINITY, f64::min);
        let omax = live_o.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        assert!(yaw_res_o < 1e-6, "octa yaw residual must be ~0, got {yaw_res_o}");
        assert!(omin > 0.15, "octa keeps interior throttle margin, min {omin}");
        assert!(omax < 0.95, "octa stays below saturation, max {omax}");

        let (xh, _yaw_res_h) = motor_out_solution(&hexa_params(), rho, 0);
        let live_h: Vec<f64> = xh.iter().copied().enumerate().filter(|(i, _)| *i != 0).map(|(_, v)| v).collect();
        let hmin = live_h.iter().cloned().fold(f64::INFINITY, f64::min);
        assert!(hmin < 0.05, "hexa must rail a second motor to idle (lost yaw margin), min {hmin}");
        // The discriminator: octa retains real throttle margin the hexa does not.
        assert!(omin - hmin > 0.1, "octa margin ({omin}) must exceed hexa ({hmin})");
    }

    #[test]
    fn motor_out_stays_finite_and_asymmetric() {
        // §3a integration: an octa with MOT_1 dead, run open-loop from hover, stays
        // finite and shows the roll/pitch asymmetry (net horizontal thrust and a
        // body torque toward the dead corner) the flight controller must answer.
        let p = octa_params();
        let e = env();
        let rho = e.air_density;
        let t_h = p.mass * G / p.num_motors as f64;
        let (c_h, _) = hover_command_and_dtdc(&p, rho, t_h);
        // PWM that yields command c_h (invert pwm_to_command's linear band).
        let span = p.pwm_max - p.pwm_min;
        let pwm_min_band = p.pwm_min + p.spin_min * span;
        let pwm_max_band = p.pwm_min + p.spin_max * span;
        let pwm_h = pwm_min_band + c_h * (pwm_max_band - pwm_min_band);
        assert!((pwm_to_command(pwm_h, &p) - c_h).abs() < 1e-9);

        let pwms = vec![pwm_h; 8];
        let mut faults = vec![MotorFault::default(); 8];
        faults[0].dead = true;
        let phases = vec![0.0; 8];

        let mut start = initial_state();
        start.position.z = -100.0;
        let (s1, d1) = step_copter_faults(&pwms, &start, &p, &e, DT, StepOptions::default(), &faults, &phases, None);
        // A dead MOT_1 removes lift at its corner: net torque is non-zero and the
        // vehicle is pulled off level (roll/pitch develop).
        assert!(d1.torque_bf.length() > 1e-3, "motor-out must create a body torque");
        // Run a couple seconds open-loop; state must remain finite (no NaN blow-up).
        let mut s = start;
        for _ in 0..800 {
            s = step_copter_faults(&pwms, &s, &p, &e, DT, StepOptions::default(), &faults, &phases, None).0;
        }
        for v in [s.position.x, s.position.y, s.position.z, s.velocity.z, s.angular_velocity.x, s.accel_body.z] {
            assert!(v.is_finite(), "motor-out state went non-finite");
        }
        let _ = s1;
    }

    #[test]
    fn thrust_loss_needs_compensating_throttle() {
        // §3b. A motor losing thrust fraction f leaves a deficit f*T_h; holding
        // weight, the mean command across N motors rises by ~ f*T_h/(N*dT/dc). We
        // verify the physical thrust deficit matches f*T_h so the firmware's real
        // compensating-throttle rise follows the derivative, not a hand-set number.
        let p = octa_params();
        let rho = 1.225;
        let n = p.num_motors as usize;
        let t_h = p.mass * G / n as f64;
        let (c_h, dtdc) = hover_command_and_dtdc(&p, rho, t_h);
        let span = p.pwm_max - p.pwm_min;
        let pwm_band = p.pwm_min + p.spin_min * span;
        let pwm_h = pwm_band + c_h * ((p.pwm_min + p.spin_max * span) - pwm_band);

        let f = 0.30_f64;
        let healthy = MotorFault::default();
        let lossy = MotorFault { prop_area_scale: 1.0 - f, ..MotorFault::default() };
        let mount = &frame_geometry(p.num_motors, p.diagonal_size)[0];
        let h = crate::motor::motor_forces_faulted(pwm_h, mount, &p, rho, p.voltage_max, Vec3::zero(), Vec3::zero(), false, 1.0, &healthy, 0.0);
        let l = crate::motor::motor_forces_faulted(pwm_h, mount, &p, rho, p.voltage_max, Vec3::zero(), Vec3::zero(), false, 1.0, &lossy, 0.0);
        let deficit = h.thrust_mag - l.thrust_mag;
        assert!((deficit - f * t_h).abs() / (f * t_h) < 0.05, "deficit {deficit} vs {}", f * t_h);
        // Predicted mean compensating command rise across N motors.
        let dc = f * t_h / (n as f64 * dtdc);
        assert!(dc > 0.0 && dc < 0.2, "compensating command rise {dc} out of expected range");
    }

    /// Naive DFT magnitude at frequency `f` (Hz) over a uniformly-sampled signal.
    fn dft_mag(signal: &[f64], sample_dt: f64, f: f64) -> f64 {
        let (mut re, mut im) = (0.0, 0.0);
        for (n, &s) in signal.iter().enumerate() {
            let ang = -2.0 * PI * f * (n as f64) * sample_dt;
            re += s * ang.cos();
            im += s * ang.sin();
        }
        (re * re + im * im).sqrt() / signal.len() as f64
    }

    #[test]
    fn vibration_frequency_tracks_rotor_speed() {
        // §3c. A single imbalanced motor at fixed hover injects a planar force that
        // rotates at the rotor speed Omega. The body accel must show its dominant
        // spectral peak at Omega/(2*pi) - a REAL frequency that tracks command and
        // voltage (unlike a fixed SIM_VIB_FREQ) - and the peak amplitude must scale
        // linearly with the imbalance severity.
        let p = octa_params();
        let e = env();
        let rho = e.air_density;
        let t_h = p.mass * G / p.num_motors as f64;
        let (c_h, _) = hover_command_and_dtdc(&p, rho, t_h);
        let span = p.pwm_max - p.pwm_min;
        let pwm_band = p.pwm_min + p.spin_min * span;
        let pwm_h = pwm_band + c_h * ((p.pwm_min + p.spin_max * span) - pwm_band);
        let pwms = vec![pwm_h; 8];

        let omega = crate::motor::rotor_omega(pwm_h, &p, p.voltage_max, &MotorFault::default());
        let f_rotor = omega / (2.0 * PI);
        assert!(f_rotor > 1.0, "rotor frequency should be a real audible-ish tone, got {f_rotor} Hz");

        // Capture body-x accel over a window with MOT_1 imbalanced; advance that
        // motor's rotor phase by Omega*dt each step (pure integral, deterministic).
        let capture = |imbalance: f64| -> Vec<f64> {
            let mut faults = vec![MotorFault::default(); 8];
            faults[0].imbalance = imbalance;
            let mut phases = vec![0.0; 8];
            let mut s = initial_state();
            s.position.z = -200.0;
            let mut sig = Vec::with_capacity(1600);
            for _ in 0..1600 {
                phases[0] += omega * DT;
                let (ns, _d) = step_copter_faults(&pwms, &s, &p, &e, DT, StepOptions::default(), &faults, &phases, None);
                s = ns;
                sig.push(s.accel_body.x);
            }
            sig
        };

        let sig = capture(0.15);
        // Scan a band around the rotor frequency; the peak must sit on f_rotor.
        let mut best_f = 0.0;
        let mut best_mag = 0.0;
        let mut f = 1.0;
        while f < 4.0 * f_rotor {
            let m = dft_mag(&sig, DT, f);
            if m > best_mag { best_mag = m; best_f = f; }
            f += 0.1;
        }
        assert!((best_f - f_rotor).abs() / f_rotor < 0.05, "vibration peak {best_f} Hz vs rotor {f_rotor} Hz");

        // Amplitude scales linearly with imbalance: doubling severity ~doubles the
        // peak magnitude at the rotor frequency.
        let m1 = dft_mag(&capture(0.10), DT, f_rotor);
        let m2 = dft_mag(&capture(0.20), DT, f_rotor);
        assert!((m2 / m1 - 2.0).abs() < 0.15, "peak amplitude should scale ~linearly: {m1} -> {m2}");
    }

    #[test]
    fn no_load_path_is_inert() {
        // Without slung params, the load stays None and the vehicle is untouched.
        let (p, e) = (params(), env());
        let mut s = initial_state();
        s.position.z = -20.0;
        let ns = step_copter(&[1500.0; 4], &s, &p, &e, DT, StepOptions::default());
        assert!(ns.load.is_none());
    }

    #[test]
    fn stays_finite_over_long_hover_with_load() {
        let p = slung(6.0, 3.0, Vec3::new(0.0, 0.0, 0.15), 4000.0, 200.0, 0.05);
        let e = env();
        let mut s = initial_state();
        s.position.z = -50.0;
        s.load = Some(seed_load(&p.slung_load.unwrap(), &s));
        for _ in 0..5000 {
            s = step_copter(&[1500.0; 4], &s, &p, &e, DT, StepOptions::default());
        }
        let l = s.load.unwrap();
        for v in [s.position.z, s.velocity.z, l.position.x, l.position.z, l.velocity.z, l.tension] {
            assert!(v.is_finite(), "non-finite state after long slung hover");
        }
    }
}
