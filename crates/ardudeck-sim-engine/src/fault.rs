//! Fault injection plumbing: the three convergent paths (CLI/scheduled, WS live
//! control channel, and the deterministic scheduled list used by tests) all
//! reduce to "set fields of `faults[motor]`" via `apply_kind`, so there is one
//! source of truth. See docs/superpowers/specs/2026-07-20-failure-physics-design.

use crate::motor::MotorFault;

/// Reference bearing-friction current (A) at full command and severity 1.0. A
/// mapping choice (the spec leaves the severity->amps scale open): a badly worn
/// bearing adds up to this much draw on top of the power_factor current.
pub const BEARING_CURRENT_AT_FULL: f64 = 15.0;
/// Max fraction of thrust a fully-seized-but-turning bearing robs (severity 1.0).
pub const BEARING_THRUST_LOSS_AT_FULL: f64 = 0.3;

/// The named fault kinds a CLI flag or WS command can request. Each maps onto one
/// or more `MotorFault` fields through `apply_kind`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FaultKind {
    /// §1f hard motor-out (dead).
    MotorOut,
    /// §1a partial thrust loss (prop_area_scale).
    ThrustLoss,
    /// §1b rotating unbalance -> vibration (imbalance).
    Imbalance,
    /// §1c ESC brownout (voltage_avail).
    Brownout,
    /// §1d motor bearing drag (bearing_thrust_loss + bearing_drag_current).
    BearingDrag,
    /// §1e asymmetric drag (drag_scale).
    AsymDrag,
}

impl FaultKind {
    pub fn parse(s: &str) -> Option<FaultKind> {
        match s.trim() {
            "motor_out" | "dead" | "motorout" => Some(FaultKind::MotorOut),
            "thrust_loss" | "thrustloss" | "mul" => Some(FaultKind::ThrustLoss),
            "imbalance" | "vibration" | "vib" => Some(FaultKind::Imbalance),
            "brownout" | "esc" => Some(FaultKind::Brownout),
            "bearing_drag" | "bearing" => Some(FaultKind::BearingDrag),
            "asym_drag" | "drag" => Some(FaultKind::AsymDrag),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            FaultKind::MotorOut => "motor_out",
            FaultKind::ThrustLoss => "thrust_loss",
            FaultKind::Imbalance => "imbalance",
            FaultKind::Brownout => "brownout",
            FaultKind::BearingDrag => "bearing_drag",
            FaultKind::AsymDrag => "asym_drag",
        }
    }
}

/// Compose a fault of `kind` at effective (already ramped) `severity` in 0..1 onto
/// a motor's `MotorFault`. Composition takes the WORSE of any existing value so
/// stacking two sources never heals a motor. Severity 0 is a no-op.
pub fn apply_kind(f: &mut MotorFault, kind: FaultKind, severity: f64) {
    let s = severity.clamp(0.0, 1.0);
    if s <= 0.0 {
        return;
    }
    match kind {
        FaultKind::MotorOut => f.dead = true,
        FaultKind::ThrustLoss => f.prop_area_scale = f.prop_area_scale.min(1.0 - s),
        FaultKind::Imbalance => f.imbalance = f.imbalance.max(s),
        FaultKind::Brownout => f.voltage_avail = f.voltage_avail.min(1.0 - s),
        FaultKind::BearingDrag => {
            f.bearing_thrust_loss = f.bearing_thrust_loss.max(s * BEARING_THRUST_LOSS_AT_FULL);
            f.bearing_drag_current = f.bearing_drag_current.max(s * BEARING_CURRENT_AT_FULL);
        }
        FaultKind::AsymDrag => f.drag_scale = f.drag_scale.max(1.0 + s),
    }
}

/// A time-triggered fault for the CLI (`--fault`) and deterministic tests. Applied
/// against `sim_time`, so it is wall-clock-free and reproducible.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ScheduledFault {
    pub motor: usize,
    pub kind: FaultKind,
    pub severity: f64,
    /// Sim time (s) at which the fault begins.
    pub at: f64,
    /// Seconds over which severity ramps 0 -> full (erosion / bearing wear). 0 =
    /// step change at `at`.
    pub ramp: f64,
}

impl ScheduledFault {
    /// Effective severity at sim time `t`: 0 before `at`, ramps linearly to the
    /// full severity over `ramp` seconds, then holds.
    pub fn effective(&self, t: f64) -> f64 {
        if t < self.at {
            0.0
        } else if self.ramp <= 0.0 {
            self.severity
        } else {
            self.severity * ((t - self.at) / self.ramp).clamp(0.0, 1.0)
        }
    }

    /// Parse `motor=3,kind=thrust_loss,severity=0.4,at=30,ramp=5`. `severity`
    /// defaults to 1.0, `at`/`ramp` to 0.0. Returns None on a missing motor/kind.
    pub fn parse(spec: &str) -> Option<ScheduledFault> {
        let (mut motor, mut kind, mut severity, mut at, mut ramp) =
            (None, None, 1.0_f64, 0.0_f64, 0.0_f64);
        for kv in spec.split(',') {
            let mut it = kv.splitn(2, '=');
            let k = it.next()?.trim();
            let v = it.next()?.trim();
            match k {
                "motor" | "m" => motor = v.parse::<usize>().ok(),
                "kind" | "k" => kind = FaultKind::parse(v),
                "severity" | "sev" | "s" => severity = v.parse().ok()?,
                "at" | "t" => at = v.parse().ok()?,
                "ramp" | "r" => ramp = v.parse().ok()?,
                _ => {}
            }
        }
        Some(ScheduledFault {
            motor: motor?,
            kind: kind?,
            severity,
            at,
            ramp,
        })
    }
}

/// Default slung-load parameters for a live `attach_load` command when the
/// optional fields are omitted. Mirror the heavy-octa template so a bare
/// `{"type":"attach_load","loadMass":..,"cableLength":..}` hangs sensibly.
pub const ATTACH_DEFAULT_STIFFNESS: f64 = 4000.0;
pub const ATTACH_DEFAULT_DAMPING: f64 = 40.0;
pub const ATTACH_DEFAULT_DRAG_CDA: f64 = 0.1;
pub const ATTACH_DEFAULT_WINCH_MIN: f64 = 0.5;
/// Default belly-hook hardpoint offset (body FRD): a little below the CG.
pub const ATTACH_DEFAULT_HARDPOINT: [f64; 3] = [0.0, 0.0, 0.15];

/// A live command from the WS control channel (§2 path 2). The two fault
/// variants (`Set` / `Clear`) reduce to the same `apply_kind` / reset used
/// everywhere else; the rest reconfigure the world mid-flight with no restart.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ControlCommand {
    /// Inject / deepen a per-motor fault (was the only live command).
    Set {
        motor: usize,
        kind: FaultKind,
        severity: f64,
    },
    /// Clear all live per-motor faults (heal the vehicle).
    Clear,
    /// Live-attach or reconfigure a slung load; all optional fields resolved to
    /// defaults at parse time, so this carries a complete parameter set.
    AttachLoad {
        load_mass: f64,
        cable_length: f64,
        hardpoint: [f64; 3],
        load_drag_cda: f64,
        stiffness: f64,
        damping: f64,
        winch_min: f64,
        winch_max: f64,
    },
    /// Detach the current load (it goes ballistic).
    ReleaseLoad,
    /// Directly set the winch payout rate (m/s, + = pay out), decoupled from the
    /// servo channels. Holds until the next `Winch` command (0 = hold length).
    Winch { rate: f64 },
    /// Live wind change. Any omitted field keeps the field's current value.
    SetWind {
        steady: Option<[f64; 3]>,
        intensity: Option<f64>,
        tau: Option<f64>,
    },
}

/// Back-compat alias: the sink and older call sites still name this `FaultCommand`,
/// but it now carries the whole live-control command set.
pub type FaultCommand = ControlCommand;

/// Read an optional numeric field. `Ok(None)` when absent/null, `Ok(Some(x))`
/// when a valid number, `Err(())` when present but not a number (malformed).
fn opt_num(v: &serde_json::Value, key: &str) -> Result<Option<f64>, ()> {
    match v.get(key) {
        None => Ok(None),
        Some(x) if x.is_null() => Ok(None),
        Some(x) => x.as_f64().map(Some).ok_or(()),
    }
}

/// Read an optional `[f64; 3]` field. `Ok(None)` when absent/null, `Err(())` when
/// present but not a 3-element numeric array.
fn opt_vec3(v: &serde_json::Value, key: &str) -> Result<Option<[f64; 3]>, ()> {
    match v.get(key) {
        None => Ok(None),
        Some(x) if x.is_null() => Ok(None),
        Some(x) => {
            let arr = x.as_array().ok_or(())?;
            if arr.len() != 3 {
                return Err(());
            }
            Ok(Some([
                arr[0].as_f64().ok_or(())?,
                arr[1].as_f64().ok_or(())?,
                arr[2].as_f64().ok_or(())?,
            ]))
        }
    }
}

/// Parse an inbound WS live-control frame. Accepts:
///   {"type":"fault","motor":3,"kind":"motor_out"}
///   {"type":"fault","motor":1,"kind":"imbalance","severity":0.3}
///   {"type":"clear_faults"}
///   {"type":"attach_load","loadMass":8,"cableLength":3,...}
///   {"type":"release_load"}
///   {"type":"winch","rate":0.5}
///   {"type":"set_wind","steady":[3,0,0],"intensity":1.5,"tau":1.0}
/// Tolerant: an unknown `type`, a missing required field, or a malformed numeric
/// returns None (ignored) and never panics. A normal state consumer sends nothing.
pub fn parse_control_command(text: &str) -> Option<ControlCommand> {
    let v: serde_json::Value = serde_json::from_str(text).ok()?;
    match v.get("type").and_then(|t| t.as_str())? {
        "clear_faults" => Some(ControlCommand::Clear),
        "fault" => {
            let motor = v.get("motor").and_then(|m| m.as_u64())? as usize;
            let kind = FaultKind::parse(v.get("kind").and_then(|k| k.as_str())?)?;
            let severity = v.get("severity").and_then(|s| s.as_f64()).unwrap_or(1.0);
            Some(ControlCommand::Set { motor, kind, severity })
        }
        "attach_load" => {
            let load_mass = v.get("loadMass").and_then(|m| m.as_f64())?;
            let cable_length = v.get("cableLength").and_then(|m| m.as_f64())?;
            let hardpoint = opt_vec3(&v, "hardpoint").ok()?.unwrap_or(ATTACH_DEFAULT_HARDPOINT);
            let load_drag_cda = opt_num(&v, "loadDragCda").ok()?.unwrap_or(ATTACH_DEFAULT_DRAG_CDA);
            let stiffness = opt_num(&v, "stiffness").ok()?.unwrap_or(ATTACH_DEFAULT_STIFFNESS);
            let damping = opt_num(&v, "damping").ok()?.unwrap_or(ATTACH_DEFAULT_DAMPING);
            let winch_min = opt_num(&v, "winchMin").ok()?.unwrap_or(ATTACH_DEFAULT_WINCH_MIN);
            // Default winch travel: twice the natural length, but at least 8 m so a
            // short cable still has room to pay out.
            let winch_max = opt_num(&v, "winchMax")
                .ok()?
                .unwrap_or_else(|| (cable_length * 2.0).max(8.0));
            Some(ControlCommand::AttachLoad {
                load_mass,
                cable_length,
                hardpoint,
                load_drag_cda,
                stiffness,
                damping,
                winch_min,
                winch_max,
            })
        }
        "release_load" => Some(ControlCommand::ReleaseLoad),
        "winch" => {
            let rate = v.get("rate").and_then(|r| r.as_f64())?;
            Some(ControlCommand::Winch { rate })
        }
        "set_wind" => {
            let steady = opt_vec3(&v, "steady").ok()?;
            let intensity = opt_num(&v, "intensity").ok()?;
            let tau = opt_num(&v, "tau").ok()?;
            Some(ControlCommand::SetWind { steady, intensity, tau })
        }
        _ => None,
    }
}

/// Thin back-compat alias for the WS read half and older tests.
pub fn parse_fault_command(text: &str) -> Option<ControlCommand> {
    parse_control_command(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_scheduled_fault_spec() {
        let s = ScheduledFault::parse("motor=3,kind=thrust_loss,severity=0.4,at=30,ramp=5").unwrap();
        assert_eq!(s.motor, 3);
        assert_eq!(s.kind, FaultKind::ThrustLoss);
        assert!((s.severity - 0.4).abs() < 1e-9);
        assert_eq!(s.at, 30.0);
        assert_eq!(s.ramp, 5.0);
        // Missing motor or kind -> None.
        assert!(ScheduledFault::parse("kind=motor_out").is_none());
        assert!(ScheduledFault::parse("motor=1,kind=nonsense").is_none());
    }

    #[test]
    fn effective_severity_ramps() {
        let s = ScheduledFault { motor: 0, kind: FaultKind::ThrustLoss, severity: 0.6, at: 10.0, ramp: 4.0 };
        assert_eq!(s.effective(9.9), 0.0);
        assert_eq!(s.effective(10.0), 0.0);
        assert!((s.effective(12.0) - 0.3).abs() < 1e-9); // half-way through ramp
        assert!((s.effective(14.0) - 0.6).abs() < 1e-9); // ramp complete
        assert!((s.effective(100.0) - 0.6).abs() < 1e-9); // holds
        // Step change (no ramp).
        let step = ScheduledFault { ramp: 0.0, ..s };
        assert_eq!(step.effective(9.9), 0.0);
        assert!((step.effective(10.0) - 0.6).abs() < 1e-9);
    }

    #[test]
    fn apply_kind_composes_worst_case() {
        let mut f = MotorFault::default();
        apply_kind(&mut f, FaultKind::ThrustLoss, 0.3);
        assert!((f.prop_area_scale - 0.7).abs() < 1e-9);
        // A worse thrust loss deepens it; a milder one does not heal it.
        apply_kind(&mut f, FaultKind::ThrustLoss, 0.5);
        assert!((f.prop_area_scale - 0.5).abs() < 1e-9);
        apply_kind(&mut f, FaultKind::ThrustLoss, 0.1);
        assert!((f.prop_area_scale - 0.5).abs() < 1e-9);
        // motor_out latches dead; severity 0 is a no-op.
        apply_kind(&mut f, FaultKind::MotorOut, 1.0);
        assert!(f.dead);
        let mut g = MotorFault::default();
        apply_kind(&mut g, FaultKind::MotorOut, 0.0);
        assert!(!g.dead);
    }

    #[test]
    fn parses_ws_fault_commands() {
        assert_eq!(
            parse_fault_command(r#"{"type":"fault","motor":3,"kind":"motor_out"}"#),
            Some(FaultCommand::Set { motor: 3, kind: FaultKind::MotorOut, severity: 1.0 })
        );
        assert_eq!(
            parse_fault_command(r#"{"type":"fault","motor":1,"kind":"imbalance","severity":0.3}"#),
            Some(FaultCommand::Set { motor: 1, kind: FaultKind::Imbalance, severity: 0.3 })
        );
        assert_eq!(parse_fault_command(r#"{"type":"clear_faults"}"#), Some(FaultCommand::Clear));
        // A plain state frame or garbage is not a command.
        assert_eq!(parse_fault_command(r#"{"type":"state"}"#), None);
        assert_eq!(parse_fault_command("not json"), None);
    }

    #[test]
    fn parses_attach_load_with_defaults() {
        // Only the two required fields: the rest fall back to the heavy-octa
        // template defaults, with winch_max = max(cable*2, 8).
        let c = parse_control_command(r#"{"type":"attach_load","loadMass":8,"cableLength":3}"#).unwrap();
        match c {
            ControlCommand::AttachLoad {
                load_mass, cable_length, hardpoint, load_drag_cda, stiffness, damping, winch_min, winch_max,
            } => {
                assert_eq!(load_mass, 8.0);
                assert_eq!(cable_length, 3.0);
                assert_eq!(hardpoint, [0.0, 0.0, 0.15]);
                assert_eq!(load_drag_cda, 0.1);
                assert_eq!(stiffness, 4000.0);
                assert_eq!(damping, 40.0);
                assert_eq!(winch_min, 0.5);
                assert_eq!(winch_max, 8.0); // max(3*2, 8)
            }
            _ => panic!("expected AttachLoad, got {c:?}"),
        }
        // A long cable pays the winch_max out to twice its length.
        let c = parse_control_command(r#"{"type":"attach_load","loadMass":2,"cableLength":6,"winchMin":1,"stiffness":100}"#).unwrap();
        match c {
            ControlCommand::AttachLoad { winch_max, winch_min, stiffness, .. } => {
                assert_eq!(winch_max, 12.0);
                assert_eq!(winch_min, 1.0);
                assert_eq!(stiffness, 100.0);
            }
            _ => panic!("expected AttachLoad"),
        }
        // Missing a required field or a malformed numeric -> None (tolerant).
        assert_eq!(parse_control_command(r#"{"type":"attach_load","loadMass":8}"#), None);
        assert_eq!(parse_control_command(r#"{"type":"attach_load","loadMass":"x","cableLength":3}"#), None);
        assert_eq!(parse_control_command(r#"{"type":"attach_load","loadMass":8,"cableLength":3,"stiffness":"nope"}"#), None);
        assert_eq!(parse_control_command(r#"{"type":"attach_load","loadMass":8,"cableLength":3,"hardpoint":[0,1]}"#), None);
    }

    #[test]
    fn parses_release_winch_and_wind() {
        assert_eq!(parse_control_command(r#"{"type":"release_load"}"#), Some(ControlCommand::ReleaseLoad));
        assert_eq!(parse_control_command(r#"{"type":"winch","rate":0.5}"#), Some(ControlCommand::Winch { rate: 0.5 }));
        assert_eq!(parse_control_command(r#"{"type":"winch","rate":0}"#), Some(ControlCommand::Winch { rate: 0.0 }));
        // winch needs a numeric rate.
        assert_eq!(parse_control_command(r#"{"type":"winch"}"#), None);
        assert_eq!(parse_control_command(r#"{"type":"winch","rate":"fast"}"#), None);

        assert_eq!(
            parse_control_command(r#"{"type":"set_wind","steady":[3,0,0],"intensity":1.5}"#),
            Some(ControlCommand::SetWind { steady: Some([3.0, 0.0, 0.0]), intensity: Some(1.5), tau: None })
        );
        // All fields optional: an empty set_wind is a (harmless) no-op command.
        assert_eq!(
            parse_control_command(r#"{"type":"set_wind"}"#),
            Some(ControlCommand::SetWind { steady: None, intensity: None, tau: None })
        );
        // Malformed steady / intensity -> None.
        assert_eq!(parse_control_command(r#"{"type":"set_wind","steady":[1,2]}"#), None);
        assert_eq!(parse_control_command(r#"{"type":"set_wind","intensity":"gusty"}"#), None);

        // Unknown type is ignored.
        assert_eq!(parse_control_command(r#"{"type":"teleport"}"#), None);
    }
}
