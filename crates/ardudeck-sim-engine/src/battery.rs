use crate::frame::BatteryConfig;

#[derive(Debug, Clone, Copy)]
pub struct BatteryState {
    pub remaining_ah: f64,
    pub voltage: f64,
}

pub fn init_battery(cfg: &BatteryConfig) -> BatteryState {
    BatteryState {
        remaining_ah: cfg.capacity_ah,
        voltage: cfg.max_voltage,
    }
}

/// Initialise a battery at a given state of charge (0..1) for batch scenarios: the
/// remaining capacity scales with SoC and the open-circuit voltage follows the same
/// resting-voltage SoC curve `update_battery` uses, so a run started at partial SoC
/// begins with a physically consistent pack (lower headroom, earlier sag). SoC = 1
/// reproduces `init_battery` exactly.
pub fn init_battery_soc(cfg: &BatteryConfig, soc: f64) -> BatteryState {
    let soc = soc.clamp(0.0, 1.0);
    let remaining_ah = cfg.capacity_ah * soc;
    BatteryState {
        remaining_ah,
        voltage: resting_voltage(cfg, remaining_ah),
    }
}

#[derive(Debug, Clone, Copy)]
pub struct BatteryUpdate {
    pub state: BatteryState,
    pub voltage: f64,
    /// Pack current draw (A) this step (echoed from the physics load).
    pub current: f64,
}

fn resting_voltage(cfg: &BatteryConfig, remaining_ah: f64) -> f64 {
    if cfg.capacity_ah <= 0.0 {
        cfg.max_voltage
    } else {
        let soc = (remaining_ah / cfg.capacity_ah).clamp(0.0, 1.0);
        cfg.max_voltage * (0.8 + 0.2 * soc)
    }
}

/// Advance the pack by one step given the real load `current` (A), summed from
/// the per-motor power_factor model in the physics step. Loaded voltage sags by
/// current * internal_resistance below the open-circuit (SoC) voltage; this
/// loaded voltage is fed back into the motor model next step (one-step lag).
pub fn update_battery(
    cfg: &BatteryConfig,
    state: &BatteryState,
    current: f64,
    dt: f64,
) -> BatteryUpdate {
    let current = current.max(0.0);
    let ocv = resting_voltage(cfg, state.remaining_ah);
    let loaded = (ocv - current * cfg.internal_resistance).max(0.0);
    let mut remaining = state.remaining_ah;
    if cfg.capacity_ah > 0.0 {
        remaining = (remaining - current * dt / 3600.0).max(0.0);
    }
    BatteryUpdate {
        state: BatteryState {
            remaining_ah: remaining,
            voltage: loaded,
        },
        voltage: loaded,
        current,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::frame::BatteryConfig;
    fn cfg() -> BatteryConfig {
        BatteryConfig {
            max_voltage: 50.4,
            ref_voltage: 46.9,
            capacity_ah: 44.0,
            internal_resistance: 0.024,
            hover_current: 65.0,
            hover_thrust: 32.5 * 9.80665,
        }
    }
    #[test]
    fn sags_under_load() {
        let c = cfg();
        // 65 A load: loaded = 50.4 - 65*0.024 = 48.84 V.
        let u = update_battery(&c, &init_battery(&c), 65.0, 0.01);
        assert!(u.voltage < 50.4 && u.voltage > 40.0);
        assert!((u.voltage - 48.84).abs() < 1e-6);
    }
    #[test]
    fn drains_soc() {
        let c = cfg();
        let mut s = init_battery(&c);
        for _ in 0..1000 {
            s = update_battery(&c, &s, 65.0, 0.1).state;
        }
        assert!(s.remaining_ah < 44.0);
    }
    #[test]
    fn infinite_pack_never_drains() {
        let mut c = cfg();
        c.capacity_ah = 0.0;
        let mut s = init_battery(&c);
        let mut v = 0.0;
        for _ in 0..100 {
            let u = update_battery(&c, &s, 65.0, 1.0);
            s = u.state;
            v = u.voltage;
        }
        assert!((v - 48.84).abs() < 1e-3); // 50.4 - 65*0.024
    }
}
