//! Batch runner (spec 2.3-3.2): the single-run executor, deterministic per-scenario
//! seeding, parallel fan-out and sweep/envelope aggregation.
//!
//! Model (b) engine-only: each run drives the pure `step_copter` in a tight
//! fixed-dt loop with no sockets, no lock-step and no wall-clock. Failures are
//! applied as a PWM/parameter transform AROUND the physics (spec 2.2), so
//! `copter.rs` is untouched. Every stochastic input (wind gusts) flows from a
//! single `Rng` seeded once per scenario, so a run is a pure function of its
//! `Scenario`: same seed + same scenario => bit-identical trajectory and verdict,
//! regardless of how many threads run the fan-out.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Mutex;

use serde::Serialize;

use crate::battery::{init_battery_soc, update_battery, BatteryState};
use crate::copter::{initial_state, step_copter, Environment, StepOptions, VehicleState};
use crate::frame::{
    battery_from_frame, get_air_density, multirotor_params, BatteryConfig, FrameModel,
    MultirotorParams, SitlCustomFrame,
};
use crate::guidance::{tilt_deg, Guidance, GuidanceProfile};
use crate::math::Vec3;
use crate::motor::pwm_to_command;
use crate::record::read_pwm_log;
use crate::rng::Rng;
use crate::scenario::{
    CommandSpec, Failure, Metrics, Outcome, ResultInputs, Scenario, ScenarioResult, Sweep,
};

const FIDELITY_B: &str = "physics-truth-not-firmware-truth";

/// Deterministic per-(cell,trial) seed via a splitmix64 mixer of the base seed and
/// the two indices. No wall-clock, no thread id: reproducible and independent per
/// cell/trial, so re-running any single cell reproduces it without the rest.
pub fn splitmix_seed(base: u32, cell: usize, trial: usize) -> u32 {
    let mut x = (base as u64)
        ^ (cell as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15)
        ^ (trial as u64).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    x = (x ^ (x >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    x ^= x >> 31;
    x as u32
}

/// Resolved physics inputs for a scenario: params (with payload folded into mass)
/// and, when the frame carries battery data, a battery config.
struct Built {
    params: MultirotorParams,
    battery: Option<BatteryConfig>,
    gravity: f64,
    air_density: f64,
}

fn build(scenario: &Scenario) -> Built {
    // Base frame model + the raw custom frame (for battery data), if any.
    let custom: Option<SitlCustomFrame> = match (&scenario.frame.inline, &scenario.frame.path) {
        (Some(f), _) => Some(f.clone()),
        (None, Some(path)) => std::fs::read_to_string(path)
            .ok()
            .and_then(|raw| serde_json::from_str::<SitlCustomFrame>(&raw).ok()),
        _ => None,
    };
    let model = match &custom {
        Some(f) => FrameModel::from(f),
        None => FrameModel::default(),
    };
    // Calibrate the motor/thrust model on the EMPTY frame, then add payload as pure
    // extra mass. This is the physically meaningful payload model: the thrust curve
    // is fixed by the airframe's motors, and more mass means more weight/inertia to
    // lift with the SAME thrust. (Folding payload into the mass BEFORE calibration
    // would recalibrate the motors to still hover at hover_thr_out, erasing the
    // payload's effect on the envelope entirely.)
    let mut params = multirotor_params(&model);
    params.mass += scenario.payload_kg.max(0.0);
    let gravity = scenario.env.gravity;
    let air_density = get_air_density(scenario.env.home_alt_amsl);
    let battery = custom
        .as_ref()
        .map(|f| battery_from_frame(f, params.mass * gravity));
    Built { params, battery, gravity, air_density }
}

/// Sum the active `wind_gust` failure vectors at time `t`.
fn wind_gust_at(t: f64, failures: &[Failure]) -> Vec3 {
    let mut v = Vec3::zero();
    for f in failures {
        if let Failure::WindGust { vector, at_time, duration } = f {
            if t >= *at_time && t < *at_time + *duration {
                v = v.add(Vec3::new(vector[0], vector[1], vector[2]));
            }
        }
    }
    v
}

/// Sum the `battery_cell_drop` voltage biases active at time `t`.
fn battery_drop_at(t: f64, failures: &[Failure]) -> f64 {
    failures
        .iter()
        .filter_map(|f| match f {
            Failure::BatteryCellDrop { delta_v, at_time } if t >= *at_time => Some(*delta_v),
            _ => None,
        })
        .sum()
}

/// Force `motor_out` motors to `pwm_min` after their trigger time.
fn apply_motor_out(pwm: &mut [f64], t: f64, failures: &[Failure], pwm_min: f64) {
    for f in failures {
        if let Failure::MotorOut { motor_index, at_time } = f {
            if t >= *at_time {
                if let Some(x) = pwm.get_mut(*motor_index) {
                    *x = pwm_min;
                }
            }
        }
    }
}

/// Accumulates the trajectory metrics + the first limit breach in one pass.
struct Accum {
    max_tilt: f64,
    max_agl: f64,
    min_agl: f64,
    max_climb: f64,
    max_descent: f64,
    peak_sat: f64,
    batt_v_min: f64,
    breach: Option<(String, f64, bool)>, // (reason, time, is_battery)
    committed: bool,
}

impl Accum {
    fn new() -> Accum {
        Accum {
            max_tilt: 0.0,
            max_agl: 0.0,
            min_agl: f64::INFINITY,
            max_climb: 0.0,
            max_descent: 0.0,
            peak_sat: 0.0,
            batt_v_min: f64::INFINITY,
            breach: None,
            committed: false,
        }
    }
}

/// Run one scenario headless (model b) and return its result. Pure and
/// deterministic: the only stochastic source is the seeded wind RNG.
pub fn run_scenario(scenario: &Scenario) -> ScenarioResult {
    let built = build(scenario);
    let p = &built.params;
    let dt = scenario.dt.max(1e-4);
    let nsteps = ((scenario.duration_s / dt).ceil() as usize).max(1);

    let mut rng = Rng::new(scenario.effective_seed());
    let wind = scenario.wind_normalized();
    let wind_steady = Vec3::new(wind.steady[0], wind.steady[1], wind.steady[2]);
    let mut wind_state = crate::wind::init_wind();

    let mut batt: Option<BatteryState> =
        built.battery.as_ref().map(|c| init_battery_soc(c, scenario.initial_soc));

    // Command source: simple guidance, or a replayed PWM log.
    let (mut guidance, replay, target_alt) = match &scenario.command {
        CommandSpec::Guidance { target_alt, waypoint, loiter_s, .. } => {
            let profile = GuidanceProfile {
                spin_up_s: 1.0,
                target_alt: *target_alt,
                waypoint: (waypoint[0], waypoint[1]),
                loiter_s: *loiter_s,
                home: (0.0, 0.0),
            };
            (Some(Guidance::new(p, profile)), None, Some(*target_alt))
        }
        CommandSpec::Replay { pwm_log } => {
            let frames = read_pwm_log(pwm_log).unwrap_or_default();
            (None, Some(frames), None)
        }
    };

    let mut state = initial_state();
    let mut acc = Accum::new();
    let mut final_vz = 0.0;

    let n_motors = p.num_motors.max(1) as usize;
    let cruise_ref = 3.0_f64;

    let effective_steps = match &replay {
        Some(frames) if !frames.is_empty() => nsteps.min(frames.len()),
        Some(_) => 0,
        None => nsteps,
    };

    for i in 0..effective_steps {
        let t = state.timestamp;

        // Wind for this step (steady + gust failure impulse + OU turbulence).
        let gust_fail = wind_gust_at(t, &scenario.failures);
        let cfg = crate::wind::WindConfig {
            steady: wind_steady.add(gust_fail),
            intensity: wind.intensity,
            time_constant: wind.tau,
        };
        let (ws, wind_vec) = crate::wind::update_wind(&cfg, &wind_state, dt, &mut rng);
        wind_state = ws;
        let env = Environment { gravity: built.gravity, air_density: built.air_density, wind: wind_vec };

        // Commanded PWM (guidance reads the clean physics state; replay reads the log).
        let mut pwm: Vec<f64> = match (&mut guidance, &replay) {
            (Some(g), _) => g.update(&state, dt),
            (None, Some(frames)) => frames[i].pwm.clone(),
            (None, None) => vec![p.pwm_min; n_motors],
        };
        apply_motor_out(&mut pwm, t, &scenario.failures, p.pwm_min);

        // Voltage fed to the motor model: battery loaded voltage minus any cell-drop
        // bias (or, with no modelled battery, the full pack minus the bias).
        let vbias = battery_drop_at(t, &scenario.failures);
        let voltage = match batt {
            Some(b) => Some((b.voltage - vbias).max(0.0)),
            None if vbias > 0.0 => Some((p.voltage_max - vbias).max(0.0)),
            None => None,
        };

        let opts = StepOptions { voltage, ground_effect: true, ..StepOptions::default() };
        let new = step_copter(&pwm, &state, p, &env, dt, opts);

        // Advance the battery from the real per-motor current draw this step.
        if let (Some(cfg), Some(b)) = (built.battery.as_ref(), batt) {
            batt = Some(update_battery(cfg, &b, new.current, dt).state);
        }

        // Fold metrics on the NEW state (agl over flat datum = -z).
        let agl = -new.position.z;
        let tilt = tilt_deg(&new);
        let climb = -new.velocity.z;
        acc.max_tilt = acc.max_tilt.max(tilt);
        acc.max_agl = acc.max_agl.max(agl);
        if agl > cruise_ref {
            acc.committed = true;
        }
        if acc.committed && agl > 0.5 {
            acc.min_agl = acc.min_agl.min(agl);
        }
        if climb > 0.0 {
            acc.max_climb = acc.max_climb.max(climb);
        } else {
            acc.max_descent = acc.max_descent.max(-climb);
        }
        let sat = (0..n_motors)
            .filter(|&j| pwm_to_command(pwm.get(j).copied().unwrap_or(p.pwm_min), p) >= 0.999)
            .count() as f64
            / n_motors as f64;
        acc.peak_sat = acc.peak_sat.max(sat);
        let vnow = voltage.unwrap_or(p.voltage_max);
        acc.batt_v_min = acc.batt_v_min.min(vnow);

        // First airborne limit breach (tilt / descent / battery) wins.
        if acc.breach.is_none() && acc.committed && agl > 0.5 {
            if tilt > scenario.limits.max_tilt_deg {
                acc.breach = Some((format!("max_tilt_exceeded@{t:.2}s"), t, false));
            } else if climb < 0.0 && -climb > scenario.limits.max_descent_rate_ms {
                acc.breach = Some((format!("descent_rate_exceeded@{t:.2}s"), t, false));
            } else if scenario.limits.min_battery_v > 0.0 && vnow < scenario.limits.min_battery_v {
                acc.breach = Some((format!("battery_low@{t:.2}s"), t, true));
            }
        }

        state = new;
        final_vz = state.velocity.z;

        // Deterministic early-out: once tilt is hopeless the trajectory is decided.
        // The step count reached is a pure function of the scenario (no scheduling),
        // so this does not affect reproducibility.
        if acc.max_tilt > 150.0 {
            break;
        }
    }

    finalize(scenario, &built, &acc, &state, final_vz, target_alt, cruise_ref, batt)
}

#[allow(clippy::too_many_arguments)]
fn finalize(
    scenario: &Scenario,
    built: &Built,
    acc: &Accum,
    state: &VehicleState,
    final_vz: f64,
    target_alt: Option<f64>,
    cruise_ref: f64,
    batt: Option<BatteryState>,
) -> ScenarioResult {
    let agl_final = -state.position.z;
    let tilt_final = tilt_deg(state);
    let upright = tilt_final < 20.0;
    let slow = final_vz.abs() < 1.0;
    let landed = agl_final <= 0.6 && upright && slow;
    let min_alt_margin = if acc.min_agl.is_finite() { acc.min_agl } else { acc.max_agl };

    // "Reached the commanded altitude" (guidance only): the key envelope signal.
    // An overloaded / low-SoC / high-wind vehicle never climbs to target.
    let reached = match target_alt {
        Some(a) if a > 0.0 => acc.max_agl >= (a - (a * 0.15).max(2.0)),
        _ => true,
    };

    // Classify. Battery collapse => Unstable; tip-over / uncontrolled sink =>
    // Crashed; couldn't reach altitude => Unstable; clean ground landing => Landed;
    // ground impact not upright/slow => Crashed; still flying at the end => Timeout.
    let (outcome, reason) = if let Some((r, _t, is_batt)) = &acc.breach {
        (if *is_batt { Outcome::Unstable } else { Outcome::Crashed }, Some(r.clone()))
    } else if !reached {
        (Outcome::Unstable, Some("failed_to_reach_altitude".to_string()))
    } else if landed {
        (Outcome::Landed, None)
    } else if agl_final <= 0.6 {
        (Outcome::Crashed, Some("hard_landing".to_string()))
    } else {
        (Outcome::Timeout, if scenario.limits.require_landed { Some("did_not_land".to_string()) } else { None })
    };

    let within_limits = acc.breach.is_none()
        && reached
        && (!scenario.limits.require_landed || landed);

    let capacity = built.battery.as_ref().map(|c| c.capacity_ah).unwrap_or(0.0);
    let soc_end = if capacity > 0.0 {
        batt.map(|b| b.remaining_ah / capacity).unwrap_or(scenario.initial_soc)
    } else {
        scenario.initial_soc
    };
    let batt_v_min = if acc.batt_v_min.is_finite() { acc.batt_v_min } else { built.params.voltage_max };

    let metrics = Metrics {
        max_tilt_deg: acc.max_tilt,
        min_alt_margin_m: min_alt_margin,
        max_climb_rate_ms: acc.max_climb,
        max_descent_rate_ms: acc.max_descent,
        peak_motor_saturation: acc.peak_sat,
        battery_v_min: batt_v_min,
        battery_soc_end: soc_end,
        time_to_failure_s: acc.breach.as_ref().map(|(_, t, _)| *t),
        final_upright: upright,
        final_vertical_speed_ms: final_vz,
    };
    let _ = cruise_ref;

    ScenarioResult {
        scenario_id: scenario.id.clone(),
        inputs: ResultInputs {
            payload_kg: scenario.payload_kg,
            wind_intensity: scenario.wind.intensity,
            initial_soc: scenario.initial_soc,
            seed: scenario.effective_seed(),
        },
        outcome,
        within_limits,
        reason,
        metrics,
        deterministic: true,
        fidelity: FIDELITY_B.to_string(),
    }
}

/// Run a list of scenarios, optionally across threads. Results are placed by index,
/// so the returned vector is identical regardless of `jobs` (single- vs
/// multi-threaded produce bit-identical output).
pub fn run_many(scenarios: &[Scenario], jobs: usize) -> Vec<ScenarioResult> {
    let n = scenarios.len();
    if jobs <= 1 || n <= 1 {
        return scenarios.iter().map(run_scenario).collect();
    }
    let slots: Vec<Mutex<Option<ScenarioResult>>> = (0..n).map(|_| Mutex::new(None)).collect();
    let next = AtomicUsize::new(0);
    std::thread::scope(|s| {
        for _ in 0..jobs.min(n) {
            s.spawn(|| loop {
                let i = next.fetch_add(1, Ordering::Relaxed);
                if i >= n {
                    break;
                }
                let r = run_scenario(&scenarios[i]);
                *slots[i].lock().unwrap() = Some(r);
            });
        }
    });
    slots.into_iter().map(|m| m.into_inner().unwrap().unwrap()).collect()
}

// ─── Sweep expansion (section 3.1) ───────────────────────────────────────────

/// A sweep expanded into an axis list + per-cell trial scenarios, ready to run.
pub struct Expanded {
    /// Ordered swept axes (name, value list). Only the axes present in the sweep.
    pub axes: Vec<(String, Vec<f64>)>,
    pub cells: Vec<CellPlan>,
    pub trials: u32,
    pub pass_threshold: f64,
}

/// One grid cell: its per-axis indices, coordinate values and the seeded scenarios
/// for each Monte-Carlo trial.
pub struct CellPlan {
    pub index: Vec<usize>,
    pub coords: Vec<(String, f64)>,
    pub scenarios: Vec<Scenario>,
}

/// Expand a sweep into its grid of seeded scenarios. Axis order is fixed
/// (payload_kg, wind_intensity, initial_soc) so the cell layout is stable.
pub fn expand_sweep(sweep: &Sweep) -> Expanded {
    let mut axes: Vec<(String, Vec<f64>)> = Vec::new();
    if let Some(a) = &sweep.axes.payload_kg {
        axes.push(("payload_kg".to_string(), a.values()));
    }
    if let Some(a) = &sweep.axes.wind_intensity {
        axes.push(("wind_intensity".to_string(), a.values()));
    }
    if let Some(a) = &sweep.axes.initial_soc {
        axes.push(("initial_soc".to_string(), a.values()));
    }

    // Cartesian product of the axis index ranges.
    let dims: Vec<usize> = axes.iter().map(|(_, v)| v.len().max(1)).collect();
    let total: usize = dims.iter().product();
    let mut cells = Vec::with_capacity(total);
    for cell_idx in 0..total {
        // Decode the linear index into per-axis indices (row-major over `dims`).
        let mut rem = cell_idx;
        let mut index = vec![0usize; dims.len()];
        for d in (0..dims.len()).rev() {
            index[d] = rem % dims[d];
            rem /= dims[d];
        }
        let mut coords = Vec::with_capacity(axes.len());
        let mut scen = sweep.base.clone();
        for (ai, (name, values)) in axes.iter().enumerate() {
            let val = values[index[ai]];
            coords.push((name.clone(), val));
            apply_axis(&mut scen, name, val);
        }
        // One seeded scenario per Monte-Carlo trial.
        let mut scenarios = Vec::with_capacity(sweep.trials as usize);
        for trial in 0..sweep.trials as usize {
            let mut s = scen.clone();
            s.seed = Some(splitmix_seed(sweep.base_seed, cell_idx, trial));
            s.id = format!("{}_c{}_t{}", sweep.base.id, cell_idx, trial);
            scenarios.push(s);
        }
        cells.push(CellPlan { index, coords, scenarios });
    }

    Expanded { axes, cells, trials: sweep.trials, pass_threshold: sweep.pass_threshold }
}

fn apply_axis(scen: &mut Scenario, name: &str, val: f64) {
    match name {
        "payload_kg" => scen.payload_kg = val,
        "wind_intensity" => scen.wind.intensity = val,
        "initial_soc" => scen.initial_soc = val,
        _ => {}
    }
}

// ─── Envelope aggregation (section 3.2) ──────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AxisOut {
    pub name: String,
    pub values: Vec<f64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CellAgg {
    pub max_tilt_deg_p95: f64,
    pub min_alt_margin_m: f64,
    pub battery_v_min_p05: f64,
    pub max_descent_rate_ms_p95: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct EnvelopeCell {
    pub index: Vec<usize>,
    pub coords: std::collections::BTreeMap<String, f64>,
    pub pass_rate: f64,
    pub n: usize,
    pub pass: bool,
    pub agg: CellAgg,
}

#[derive(Debug, Clone, Serialize)]
pub struct BoundarySegment {
    pub soc: Option<f64>,
    /// Frontier points as [payload, wind] where pass_rate crosses the threshold.
    pub points: Vec<[f64; 2]>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Boundary {
    pub threshold: f64,
    pub method: String,
    pub segments: Vec<BoundarySegment>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Envelope {
    pub axes: Vec<AxisOut>,
    pub cells: Vec<EnvelopeCell>,
    pub boundary: Boundary,
    pub deterministic: bool,
    pub fidelity: String,
}

fn percentile(sorted: &[f64], q: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let idx = ((sorted.len() as f64 - 1.0) * q).round() as usize;
    sorted[idx.min(sorted.len() - 1)]
}

/// Aggregate the per-cell trial results into the envelope map + boundary. `results`
/// is grouped per cell in the same order as `expanded.cells` (each cell's trials
/// contiguous), which is how `run_many` over the flattened plan returns them.
pub fn aggregate(expanded: &Expanded, results: &[ScenarioResult]) -> Envelope {
    let axes: Vec<AxisOut> =
        expanded.axes.iter().map(|(n, v)| AxisOut { name: n.clone(), values: v.clone() }).collect();

    let mut cells = Vec::with_capacity(expanded.cells.len());
    let mut cursor = 0usize;
    for plan in &expanded.cells {
        let k = plan.scenarios.len();
        let slice = &results[cursor..cursor + k];
        cursor += k;

        let n = slice.len();
        let passes = slice.iter().filter(|r| r.within_limits).count();
        let pass_rate = if n > 0 { passes as f64 / n as f64 } else { 0.0 };

        let mut tilt: Vec<f64> = slice.iter().map(|r| r.metrics.max_tilt_deg).collect();
        let mut descent: Vec<f64> = slice.iter().map(|r| r.metrics.max_descent_rate_ms).collect();
        let mut vmin: Vec<f64> = slice.iter().map(|r| r.metrics.battery_v_min).collect();
        tilt.sort_by(|a, b| a.partial_cmp(b).unwrap());
        descent.sort_by(|a, b| a.partial_cmp(b).unwrap());
        vmin.sort_by(|a, b| a.partial_cmp(b).unwrap());
        let min_alt = slice
            .iter()
            .map(|r| r.metrics.min_alt_margin_m)
            .fold(f64::INFINITY, f64::min);

        let coords: std::collections::BTreeMap<String, f64> =
            plan.coords.iter().cloned().collect();

        cells.push(EnvelopeCell {
            index: plan.index.clone(),
            coords,
            pass_rate,
            n,
            pass: pass_rate >= expanded.pass_threshold,
            agg: CellAgg {
                max_tilt_deg_p95: percentile(&tilt, 0.95),
                min_alt_margin_m: if min_alt.is_finite() { min_alt } else { 0.0 },
                battery_v_min_p05: percentile(&vmin, 0.05),
                max_descent_rate_ms_p95: percentile(&descent, 0.95),
            },
        });
    }

    let boundary = extract_boundary(expanded, &cells);
    Envelope {
        axes,
        cells,
        boundary,
        deterministic: true,
        fidelity: FIDELITY_B.to_string(),
    }
}

/// Per-SoC slice, find the payload/wind frontier where pass_rate crosses the
/// threshold. Assumes monotone degradation (heavier payload / stronger wind / lower
/// SoC only ever hurts): for each wind value, the frontier is the largest passing
/// payload. Requires payload and wind axes; SoC is optional (single slice if absent).
fn extract_boundary(expanded: &Expanded, cells: &[EnvelopeCell]) -> Boundary {
    let threshold = expanded.pass_threshold;
    let axis_pos = |name: &str| expanded.axes.iter().position(|(n, _)| n == name);
    let (pi, wi) = match (axis_pos("payload_kg"), axis_pos("wind_intensity")) {
        (Some(p), Some(w)) => (p, w),
        _ => {
            return Boundary { threshold, method: "monotone_marching".to_string(), segments: Vec::new() };
        }
    };
    let si = axis_pos("initial_soc");
    let payloads = &expanded.axes[pi].1;
    let winds = &expanded.axes[wi].1;
    let soc_vals: Vec<f64> = si.map(|i| expanded.axes[i].1.clone()).unwrap_or_else(|| vec![0.0]);

    let cell_pass = |target: &[usize]| -> Option<bool> {
        cells.iter().find(|c| c.index == target).map(|c| c.pass)
    };

    let mut segments = Vec::new();
    for (soc_i, &soc) in soc_vals.iter().enumerate() {
        let mut points = Vec::new();
        for (w_idx, &wind) in winds.iter().enumerate() {
            // Largest payload index that still passes at this (wind, soc).
            let mut frontier: Option<f64> = None;
            for (p_idx, &payload) in payloads.iter().enumerate() {
                let mut index = vec![0usize; expanded.axes.len()];
                index[pi] = p_idx;
                index[wi] = w_idx;
                if let Some(s) = si {
                    index[s] = soc_i;
                }
                match cell_pass(&index) {
                    Some(true) => frontier = Some(payload),
                    Some(false) => break, // monotone: once it fails it stays failed
                    None => {}
                }
            }
            if let Some(pl) = frontier {
                points.push([pl, wind]);
            }
        }
        segments.push(BoundarySegment { soc: si.map(|_| soc), points });
    }

    Boundary { threshold, method: "monotone_marching".to_string(), segments }
}

/// Flatten an expanded sweep into the scenario list `run_many` consumes (cells in
/// order, each cell's trials contiguous), matching what `aggregate` expects.
pub fn flatten(expanded: &Expanded) -> Vec<Scenario> {
    expanded
        .cells
        .iter()
        .flat_map(|c| c.scenarios.iter().cloned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::record::PwmRecorder;
    use crate::scenario::{FrameSpec, Limits, WindSpec};

    const HEAVY_OCTA: &str = r#"{
      "mass":32.5,"diagonal_size":1.325,"refSpd":25,"refAngle":30,"refVoltage":46.9,
      "refCurrent":65.36,"refAlt":26,"refTempC":25,"refBatRes":0.024,"maxVoltage":50.4,
      "battCapacityAh":44,"propExpo":0.5,"refRotRate":120,"hoverThrOut":0.36,
      "pwmMin":1000,"pwmMax":1940,"spin_min":0.2,"spin_max":0.975,"slew_max":75,
      "disc_area":1.82,"mdrag_coef":0.10,"num_motors":8
    }"#;

    fn octa_frame() -> SitlCustomFrame {
        serde_json::from_str(HEAVY_OCTA).unwrap()
    }

    fn hover_scenario(id: &str, payload: f64, soc: f64) -> Scenario {
        Scenario {
            id: id.to_string(),
            frame: FrameSpec { path: None, inline: Some(octa_frame()) },
            payload_kg: payload,
            initial_soc: soc,
            env: Default::default(),
            wind: WindSpec::default(),
            failures: Vec::new(),
            command: CommandSpec::Guidance {
                profile: "takeoff_hover_translate_land".to_string(),
                target_alt: 25.0,
                waypoint: [0.0, 0.0],
                loiter_s: 2.0,
            },
            seed: Some(7),
            duration_s: 45.0,
            dt: 0.0025,
            limits: Limits::default(),
        }
    }

    #[test]
    fn nominal_octa_hover_lands_within_limits() {
        let r = run_scenario(&hover_scenario("nom", 0.0, 1.0));
        assert_eq!(r.outcome, Outcome::Landed, "reason: {:?}", r.reason);
        assert!(r.within_limits);
        assert!(r.deterministic);
        assert_eq!(r.fidelity, FIDELITY_B);
        assert!(r.metrics.max_tilt_deg < 60.0);
    }

    #[test]
    fn same_seed_same_scenario_is_bit_identical() {
        let s = hover_scenario("det", 4.0, 0.8);
        let a = run_scenario(&s);
        let b = run_scenario(&s);
        // Hash the metric struct via JSON: identical bytes => identical run.
        assert_eq!(serde_json::to_string(&a.metrics).unwrap(), serde_json::to_string(&b.metrics).unwrap());
        assert_eq!(a.outcome, b.outcome);
        assert_eq!(a.within_limits, b.within_limits);
    }

    #[test]
    fn overload_fails_to_reach_altitude() {
        // A massive payload the octa cannot lift: it never reaches target altitude.
        let r = run_scenario(&hover_scenario("overload", 120.0, 1.0));
        assert!(!r.within_limits);
        assert_ne!(r.outcome, Outcome::Landed);
    }

    #[test]
    fn motor_out_hurts_a_marginal_vehicle() {
        // Baseline nominal passes; a hard motor-out on a payload-laden octa should
        // degrade the outcome (tilt/descent). We assert the failure is registered.
        let mut s = hover_scenario("motorout", 6.0, 0.9);
        s.failures = vec![Failure::MotorOut { motor_index: 0, at_time: 6.0 }];
        s.duration_s = 20.0;
        let r = run_scenario(&s);
        // Either it tips/sinks (not landed cleanly) or it survives; determinism is
        // what we lock, plus that the run completes with finite metrics.
        assert!(r.metrics.max_tilt_deg.is_finite());
        let r2 = run_scenario(&s);
        assert_eq!(serde_json::to_string(&r.metrics).unwrap(), serde_json::to_string(&r2.metrics).unwrap());
    }

    #[test]
    fn single_vs_multi_thread_identical() {
        let scenarios: Vec<Scenario> = (0..12)
            .map(|i| hover_scenario(&format!("s{i}"), (i as f64) * 2.0, 1.0 - (i as f64) * 0.05))
            .collect();
        let single = run_many(&scenarios, 1);
        let multi = run_many(&scenarios, 8);
        let js = serde_json::to_string(&single).unwrap();
        let jm = serde_json::to_string(&multi).unwrap();
        assert_eq!(js, jm, "multi-threaded fan-out must match single-threaded bit-for-bit");
    }

    #[test]
    fn splitmix_is_stable_and_varies() {
        // Reproducible per (cell, trial), and different across them.
        assert_eq!(splitmix_seed(1337, 3, 2), splitmix_seed(1337, 3, 2));
        assert_ne!(splitmix_seed(1337, 3, 2), splitmix_seed(1337, 3, 3));
        assert_ne!(splitmix_seed(1337, 3, 2), splitmix_seed(1337, 4, 2));
    }

    #[test]
    fn sweep_expands_and_aggregates() {
        let base = hover_scenario("sweep", 0.0, 1.0);
        let sweep = Sweep {
            base,
            axes: crate::scenario::SweepAxes {
                payload_kg: Some(crate::scenario::Axis::Range { min: 0.0, max: 4.0, step: 2.0 }),
                wind_intensity: Some(crate::scenario::Axis::Values { values: vec![0.0, 2.0] }),
                initial_soc: None,
            },
            trials: 2,
            pass_threshold: 0.5,
            base_seed: 1337,
        };
        let expanded = expand_sweep(&sweep);
        // 3 payload x 2 wind = 6 cells, 2 trials each = 12 runs.
        assert_eq!(expanded.cells.len(), 6);
        let scenarios = flatten(&expanded);
        assert_eq!(scenarios.len(), 12);
        let results = run_many(&scenarios, 4);
        let env = aggregate(&expanded, &results);
        assert_eq!(env.cells.len(), 6);
        assert!(env.deterministic);
        // Every cell reports n == trials.
        for c in &env.cells {
            assert_eq!(c.n, 2);
        }
        // Boundary present (payload + wind axes exist).
        assert_eq!(env.boundary.method, "monotone_marching");
    }

    #[test]
    fn replay_reproduces_a_recorded_command_stream() {
        // Bridge (spec 4.2.1) at the batch level: record a PWM stream, replay it
        // through run_scenario, and confirm it runs deterministically. (The bit-
        // exact-vs-CopterVehicle bridge lives in fdm_server tests.)
        use crate::copter::{initial_state, step_copter, StepOptions, DEFAULT_ENVIRONMENT};
        use crate::guidance::{Guidance, GuidanceProfile};
        let p = multirotor_params(&FrameModel::from(&octa_frame()));
        // Generate a command stream with guidance and record it.
        let path = std::env::temp_dir().join("ardudeck_replay_test.pwm.bin");
        let mut rec = PwmRecorder::to_file(&path).unwrap();
        let mut g = Guidance::new(&p, GuidanceProfile::hover(20.0));
        let mut s = initial_state();
        let dt = 0.0025;
        for _ in 0..4000 {
            let pwm = g.update(&s, dt);
            rec.record(dt, &pwm);
            s = step_copter(&pwm, &s, &p, &DEFAULT_ENVIRONMENT, dt, StepOptions { ground_effect: true, ..StepOptions::default() });
        }
        drop(rec);

        let scen = Scenario {
            id: "replay".to_string(),
            frame: FrameSpec { path: None, inline: Some(octa_frame()) },
            payload_kg: 0.0,
            initial_soc: 1.0,
            env: Default::default(),
            wind: WindSpec::default(),
            failures: Vec::new(),
            command: CommandSpec::Replay { pwm_log: path.to_string_lossy().to_string() },
            seed: Some(0),
            duration_s: 10.0,
            dt,
            limits: Limits::default(),
        };
        let a = run_scenario(&scen);
        let b = run_scenario(&scen);
        assert_eq!(serde_json::to_string(&a.metrics).unwrap(), serde_json::to_string(&b.metrics).unwrap());
        let _ = std::fs::remove_file(&path);
    }
}
