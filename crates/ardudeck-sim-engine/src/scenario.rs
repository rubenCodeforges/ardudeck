//! Batch scenario + sweep definitions and result types (spec sections 2.2-3.1).
//!
//! A `Scenario` is fully declarative and self-contained: frame, payload, battery
//! SoC, environment, wind, failures, the command source (simple guidance or a
//! replayed PWM log), the mission duration/dt and the pass/fail limits. The runner
//! turns it into a `ScenarioResult`. A `Sweep` is a base scenario plus swept axes
//! that the runner expands into a grid of scenarios with Monte-Carlo repeats.

use serde::{Deserialize, Serialize};

use crate::frame::SitlCustomFrame;

// ─── Scenario ────────────────────────────────────────────────────────────────

/// Where the frame comes from: an inline `SitlCustomFrame`, a path to one, or
/// (both absent) the built-in default model.
#[derive(Debug, Clone, Deserialize, Default)]
pub struct FrameSpec {
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub inline: Option<SitlCustomFrame>,
}

/// Environment scalars. Air density is derived from `home_alt_amsl` in the runner.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct EnvSpec {
    #[serde(default)]
    pub home_alt_amsl: f64,
    #[serde(default = "default_gravity")]
    pub gravity: f64,
}

impl Default for EnvSpec {
    fn default() -> Self {
        EnvSpec { home_alt_amsl: 0.0, gravity: default_gravity() }
    }
}

/// Wind: a steady NED vector plus turbulence intensity and time constant, fed to
/// the existing Ornstein-Uhlenbeck `update_wind`.
#[derive(Debug, Clone, Copy, Deserialize, Default)]
pub struct WindSpec {
    #[serde(default)]
    pub steady: [f64; 3],
    #[serde(default)]
    pub intensity: f64,
    #[serde(default = "default_tau")]
    pub tau: f64,
}

impl WindSpec {
    fn default_tau_if_zero(self) -> WindSpec {
        WindSpec { tau: if self.tau > 0.0 { self.tau } else { default_tau() }, ..self }
    }
}

/// A time-triggered failure. Applied by the runner as a PWM/parameter transform
/// AROUND the pure physics (spec 2.2), so `copter.rs` needs no changes.
#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Failure {
    /// After `at_time`, force `pwm[motor_index] = pwm_min` (commanded to ~zero
    /// thrust); the asymmetric torque falls out of the physics.
    MotorOut { motor_index: usize, at_time: f64 },
    /// After `at_time`, subtract `delta_v` from the pack voltage fed to the motors.
    BatteryCellDrop { delta_v: f64, at_time: f64 },
    /// For `duration` seconds from `at_time`, add `vector` (NED, m/s) to the wind.
    WindGust { vector: [f64; 3], at_time: f64, duration: f64 },
}

/// The PWM source for a run.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CommandSpec {
    /// Fly the canonical profile with the simple guidance controller.
    Guidance {
        #[serde(default = "default_profile")]
        profile: String,
        #[serde(default)]
        target_alt: f64,
        #[serde(default)]
        waypoint: [f64; 2],
        #[serde(default)]
        loiter_s: f64,
    },
    /// Replay a recorded `.pwm.bin` stream (the bit-exact validation bridge).
    Replay { pwm_log: String },
}

/// Pass/fail thresholds folded over the trajectory.
#[derive(Debug, Clone, Copy, Deserialize)]
pub struct Limits {
    #[serde(default = "default_max_tilt")]
    pub max_tilt_deg: f64,
    #[serde(default = "default_min_alt_margin")]
    pub min_alt_margin_m: f64,
    #[serde(default = "default_max_descent")]
    pub max_descent_rate_ms: f64,
    #[serde(default)]
    pub min_battery_v: f64,
    #[serde(default = "default_true")]
    pub require_landed: bool,
}

impl Default for Limits {
    fn default() -> Self {
        Limits {
            max_tilt_deg: default_max_tilt(),
            min_alt_margin_m: default_min_alt_margin(),
            max_descent_rate_ms: default_max_descent(),
            min_battery_v: 0.0,
            require_landed: true,
        }
    }
}

/// One fully specified mission.
#[derive(Debug, Clone, Deserialize)]
pub struct Scenario {
    pub id: String,
    #[serde(default)]
    pub frame: FrameSpec,
    /// Payload added to the frame mass (kg). CG unchanged (documented non-model).
    #[serde(default)]
    pub payload_kg: f64,
    /// Initial state of charge, 0..1. Seeds the battery remaining_ah + open-circuit V.
    #[serde(default = "default_soc")]
    pub initial_soc: f64,
    #[serde(default)]
    pub env: EnvSpec,
    #[serde(default)]
    pub wind: WindSpec,
    #[serde(default)]
    pub failures: Vec<Failure>,
    pub command: CommandSpec,
    /// Explicit seed for a single-scenario run; sweeps derive it per (cell, trial).
    #[serde(default)]
    pub seed: Option<u32>,
    pub duration_s: f64,
    #[serde(default = "default_dt")]
    pub dt: f64,
    #[serde(default)]
    pub limits: Limits,
}

impl Scenario {
    /// The seed to use: the explicit field when set, else 0.
    pub fn effective_seed(&self) -> u32 {
        self.seed.unwrap_or(0)
    }

    /// Wind with a defaulted time constant (guards a zero tau in `update_wind`).
    pub fn wind_normalized(&self) -> WindSpec {
        self.wind.default_tau_if_zero()
    }
}

// ─── Results ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "PascalCase")]
pub enum Outcome {
    Landed,
    Crashed,
    Unstable,
    Timeout,
}

/// The swept inputs echoed onto each result row (for the CSV / envelope).
#[derive(Debug, Clone, Copy, Serialize)]
pub struct ResultInputs {
    pub payload_kg: f64,
    pub wind_intensity: f64,
    pub initial_soc: f64,
    pub seed: u32,
}

/// Folded trajectory metrics.
#[derive(Debug, Clone, Copy, Serialize)]
pub struct Metrics {
    pub max_tilt_deg: f64,
    pub min_alt_margin_m: f64,
    pub max_climb_rate_ms: f64,
    pub max_descent_rate_ms: f64,
    /// Fraction of motors at command == 1 at the worst step, 0..1.
    pub peak_motor_saturation: f64,
    pub battery_v_min: f64,
    pub battery_soc_end: f64,
    pub time_to_failure_s: Option<f64>,
    pub final_upright: bool,
    pub final_vertical_speed_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScenarioResult {
    pub scenario_id: String,
    pub inputs: ResultInputs,
    pub outcome: Outcome,
    pub within_limits: bool,
    pub reason: Option<String>,
    pub metrics: Metrics,
    /// True for model (b) engine-only (bit-exact reproducible); false for model (a).
    pub deterministic: bool,
    /// What the result speaks to. Model (b) is physics-truth, not firmware-truth.
    pub fidelity: String,
}

// ─── Sweep (section 3.1) ─────────────────────────────────────────────────────

/// One swept axis: either an explicit value list or an inclusive min/max/step range.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Axis {
    Values { values: Vec<f64> },
    Range { min: f64, max: f64, step: f64 },
}

impl Axis {
    /// Materialise the axis into its value list.
    pub fn values(&self) -> Vec<f64> {
        match self {
            Axis::Values { values } => values.clone(),
            Axis::Range { min, max, step } => {
                let mut v = Vec::new();
                if *step <= 0.0 {
                    return vec![*min];
                }
                // Count-based iteration avoids floating-point drift accumulating.
                let n = ((*max - *min) / *step).floor() as i64;
                for i in 0..=n.max(0) {
                    v.push(*min + *step * i as f64);
                }
                v
            }
        }
    }
}

/// The recognised sweep axes (the canonical payload x wind x SoC study).
#[derive(Debug, Clone, Deserialize, Default)]
pub struct SweepAxes {
    #[serde(default)]
    pub payload_kg: Option<Axis>,
    #[serde(default)]
    pub wind_intensity: Option<Axis>,
    #[serde(default)]
    pub initial_soc: Option<Axis>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Sweep {
    pub base: Scenario,
    pub axes: SweepAxes,
    #[serde(default = "default_trials")]
    pub trials: u32,
    #[serde(default = "default_pass_threshold")]
    pub pass_threshold: f64,
    /// Base seed for per-(cell,trial) splitmix derivation.
    #[serde(default = "default_base_seed")]
    pub base_seed: u32,
}

// ─── serde defaults ──────────────────────────────────────────────────────────

fn default_gravity() -> f64 {
    9.80665
}
fn default_tau() -> f64 {
    1.0
}
fn default_soc() -> f64 {
    1.0
}
fn default_dt() -> f64 {
    0.0025
}
fn default_profile() -> String {
    "takeoff_hover_translate_land".to_string()
}
fn default_max_tilt() -> f64 {
    60.0
}
fn default_min_alt_margin() -> f64 {
    2.0
}
fn default_max_descent() -> f64 {
    8.0
}
fn default_true() -> bool {
    true
}
fn default_trials() -> u32 {
    1
}
fn default_pass_threshold() -> f64 {
    0.95
}
fn default_base_seed() -> u32 {
    1337
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_full_scenario() {
        let json = r#"{
          "id":"octa-hi-wind-lowsoc-01",
          "frame":{"path":"frames/heavy-octa.json"},
          "payload_kg":8.0,
          "initial_soc":0.55,
          "env":{"home_alt_amsl":26.0,"gravity":9.80665},
          "wind":{"steady":[6.0,0.0,0.0],"intensity":3.0,"tau":0.5},
          "failures":[
            {"kind":"motor_out","motor_index":2,"at_time":8.0},
            {"kind":"battery_cell_drop","delta_v":3.7,"at_time":12.0},
            {"kind":"wind_gust","vector":[0,10,0],"at_time":10.0,"duration":1.5}
          ],
          "command":{"kind":"guidance","profile":"takeoff_hover_translate_land",
                     "target_alt":30.0,"waypoint":[50,0],"loiter_s":5.0},
          "seed":1337,
          "duration_s":40.0,
          "dt":0.0025,
          "limits":{"max_tilt_deg":60.0,"min_alt_margin_m":2.0,"max_descent_rate_ms":8.0,
                    "min_battery_v":42.0,"require_landed":true}
        }"#;
        let s: Scenario = serde_json::from_str(json).unwrap();
        assert_eq!(s.id, "octa-hi-wind-lowsoc-01");
        assert_eq!(s.payload_kg, 8.0);
        assert_eq!(s.initial_soc, 0.55);
        assert_eq!(s.failures.len(), 3);
        assert_eq!(s.effective_seed(), 1337);
        assert!(matches!(s.command, CommandSpec::Guidance { .. }));
        assert!(matches!(s.failures[0], Failure::MotorOut { motor_index: 2, .. }));
    }

    #[test]
    fn minimal_scenario_uses_defaults() {
        let json = r#"{"id":"m","command":{"kind":"guidance","target_alt":20.0},"duration_s":10.0}"#;
        let s: Scenario = serde_json::from_str(json).unwrap();
        assert_eq!(s.initial_soc, 1.0);
        assert_eq!(s.dt, 0.0025);
        assert_eq!(s.payload_kg, 0.0);
        assert_eq!(s.effective_seed(), 0);
        assert_eq!(s.limits.max_tilt_deg, 60.0);
        assert!(s.limits.require_landed);
    }

    #[test]
    fn axis_range_and_values_expand() {
        let r = Axis::Range { min: 0.0, max: 12.0, step: 1.0 };
        assert_eq!(r.values().len(), 13);
        assert_eq!(r.values()[0], 0.0);
        assert_eq!(*r.values().last().unwrap(), 12.0);
        let v = Axis::Values { values: vec![1.0, 0.75, 0.5, 0.35] };
        assert_eq!(v.values(), vec![1.0, 0.75, 0.5, 0.35]);
    }

    #[test]
    fn parses_sweep() {
        let json = r#"{
          "base":{"id":"b","command":{"kind":"guidance","target_alt":25.0},"duration_s":30.0},
          "axes":{
            "payload_kg":{"min":0,"max":12,"step":1.0},
            "wind_intensity":{"min":0,"max":10,"step":1.0},
            "initial_soc":{"values":[1.0,0.75,0.5,0.35]}
          },
          "trials":8,
          "pass_threshold":0.95
        }"#;
        let s: Sweep = serde_json::from_str(json).unwrap();
        assert_eq!(s.trials, 8);
        assert_eq!(s.axes.payload_kg.as_ref().unwrap().values().len(), 13);
        assert_eq!(s.axes.initial_soc.as_ref().unwrap().values().len(), 4);
    }
}
