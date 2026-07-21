use serde::Deserialize;

use crate::math::Vec3;

/// Standard gravity, matching ArduPilot's GRAVITY_MSS.
pub const GRAVITY_MSS: f64 = 9.80665;

/// Suspended-payload physics parameters (a point mass on a compliant cable from a
/// hardpoint offset from the vehicle CG). `Copy` so `MultirotorParams` can stay
/// value-passed. Absent (`None`) => no load, unchanged physics.
#[derive(Debug, Clone, Copy)]
pub struct SlungLoadParams {
    /// Load point mass m_L (kg).
    pub load_mass: f64,
    /// Natural (unstretched) cable length L0 (m).
    pub cable_length: f64,
    /// Hardpoint offset r_h from the CG, body frame (m). Belly hook: +z (down).
    pub hardpoint: Vec3,
    /// Axial cable stiffness k (N/m).
    pub stiffness: f64,
    /// Axial cable damping c (N.s/m).
    pub damping: f64,
    /// Load aero drag Cd*A (m^2).
    pub load_drag_cda: f64,
    /// Minimum winch length (m).
    pub winch_min: f64,
    /// Maximum winch length (m).
    pub winch_max: f64,
}

/// Optional slung-load object on the custom-frame JSON. Absent => no load. The
/// `winchChannel` / `releaseChannel` (1-based servo channels) drive the winch
/// rate and release edge at runtime; omit for a fixed-length, never-released load.
#[derive(Debug, Clone, Deserialize)]
pub struct SlungLoadFrame {
    #[serde(rename = "loadMass")]
    pub load_mass: f64,
    #[serde(rename = "cableLength")]
    pub cable_length: f64,
    pub hardpoint: [f64; 3],
    pub stiffness: f64,
    pub damping: f64,
    #[serde(rename = "loadDragCda")]
    pub load_drag_cda: f64,
    #[serde(rename = "winchMin", default)]
    pub winch_min: f64,
    #[serde(rename = "winchMax", default)]
    pub winch_max: f64,
    #[serde(rename = "winchChannel", default)]
    pub winch_channel: Option<u8>,
    #[serde(rename = "releaseChannel", default)]
    pub release_channel: Option<u8>,
}

impl From<&SlungLoadFrame> for SlungLoadParams {
    fn from(f: &SlungLoadFrame) -> Self {
        // A missing/zero winch_max still needs a sane clamp band; default to the
        // natural length so a fixed load never clamps to zero.
        let winch_max = if f.winch_max > 0.0 { f.winch_max } else { f.cable_length };
        SlungLoadParams {
            load_mass: f.load_mass,
            cable_length: f.cable_length,
            hardpoint: Vec3::new(f.hardpoint[0], f.hardpoint[1], f.hardpoint[2]),
            stiffness: f.stiffness,
            damping: f.damping,
            load_drag_cda: f.load_drag_cda,
            winch_min: f.winch_min,
            winch_max,
        }
    }
}

/// Custom-frame JSON as authored by the user. All 22 numeric fields.
#[derive(Debug, Clone, Deserialize)]
pub struct SitlCustomFrame {
    pub mass: f64,
    pub diagonal_size: f64,
    #[serde(rename = "refSpd")]
    pub ref_spd: f64,
    #[serde(rename = "refAngle")]
    pub ref_angle: f64,
    #[serde(rename = "refVoltage")]
    pub ref_voltage: f64,
    #[serde(rename = "refCurrent")]
    pub ref_current: f64,
    #[serde(rename = "refAlt")]
    pub ref_alt: f64,
    #[serde(rename = "refTempC")]
    pub ref_temp_c: f64,
    #[serde(rename = "refBatRes")]
    pub ref_bat_res: f64,
    #[serde(rename = "maxVoltage")]
    pub max_voltage: f64,
    #[serde(rename = "battCapacityAh")]
    pub batt_capacity_ah: f64,
    #[serde(rename = "propExpo")]
    pub prop_expo: f64,
    #[serde(rename = "refRotRate")]
    pub ref_rot_rate: f64,
    #[serde(rename = "hoverThrOut")]
    pub hover_thr_out: f64,
    #[serde(rename = "pwmMin")]
    pub pwm_min: f64,
    #[serde(rename = "pwmMax")]
    pub pwm_max: f64,
    pub spin_min: f64,
    pub spin_max: f64,
    pub slew_max: f64,
    pub disc_area: f64,
    pub mdrag_coef: f64,
    pub num_motors: f64,
    /// Optional suspended payload. Absent => no load (back-compatible).
    #[serde(rename = "slungLoad", default)]
    pub slung_load: Option<SlungLoadFrame>,
}

/// Raw multicopter model, the direct analogue of ArduPilot's `Frame::Model`
/// (SIM_Frame.h). `Default` reproduces ArduPilot's built-in `default_model`
/// (the small 3 kg quad), so a no-frame run flies like stock SITL.
#[derive(Debug, Clone)]
pub struct FrameModel {
    pub mass: f64,
    pub diagonal_size: f64,
    pub ref_spd: f64,
    pub ref_angle: f64,
    pub ref_voltage: f64,
    pub ref_current: f64,
    pub ref_alt: f64,
    pub max_voltage: f64,
    pub hover_thr_out: f64,
    pub prop_expo: f64,
    pub ref_rot_rate: f64,
    pub pwm_min: f64,
    pub pwm_max: f64,
    pub spin_min: f64,
    pub spin_max: f64,
    pub disc_area: f64,
    pub mdrag_coef: f64,
    pub num_motors: f64,
}

impl Default for FrameModel {
    fn default() -> Self {
        // Verbatim from ArduPilot SIM_Frame.h default_model.
        FrameModel {
            mass: 3.0,
            diagonal_size: 0.35,
            ref_spd: 15.08,
            ref_angle: 45.0,
            ref_voltage: 12.09,
            ref_current: 29.3,
            ref_alt: 593.0,
            max_voltage: 4.2 * 3.0,
            hover_thr_out: 0.39,
            prop_expo: 0.65,
            ref_rot_rate: 120.0,
            pwm_min: 1000.0,
            pwm_max: 2000.0,
            spin_min: 0.15,
            spin_max: 0.95,
            disc_area: 0.385,
            mdrag_coef: 0.2,
            num_motors: 4.0,
        }
    }
}

impl From<&SitlCustomFrame> for FrameModel {
    fn from(f: &SitlCustomFrame) -> Self {
        FrameModel {
            mass: f.mass,
            diagonal_size: f.diagonal_size,
            ref_spd: f.ref_spd,
            ref_angle: f.ref_angle,
            ref_voltage: f.ref_voltage,
            ref_current: f.ref_current,
            ref_alt: f.ref_alt,
            max_voltage: f.max_voltage,
            hover_thr_out: f.hover_thr_out,
            prop_expo: f.prop_expo,
            ref_rot_rate: f.ref_rot_rate,
            pwm_min: f.pwm_min,
            pwm_max: f.pwm_max,
            spin_min: f.spin_min,
            spin_max: f.spin_max,
            disc_area: f.disc_area,
            mdrag_coef: f.mdrag_coef,
            num_motors: f.num_motors,
        }
    }
}

/// Physics parameters for the multirotor, all derived from a `FrameModel` by
/// `multirotor_params` following ArduPilot's `Frame::init` calibration. The
/// calibrated fields (effective_prop_area .. momentum_drag_coefficient) feed the
/// ArduPilot motor and drag models ported in motor.rs / copter.rs.
#[derive(Debug, Clone)]
pub struct MultirotorParams {
    pub mass: f64,
    pub diagonal_size: f64,
    pub num_motors: u32,
    pub hover_thr_out: f64,
    pub prop_expo: f64,
    pub pwm_min: f64,
    pub pwm_max: f64,
    pub spin_min: f64,
    pub spin_max: f64,
    /// Reference rotation rate (deg/s), used raw as ArduPilot's rotational
    /// damping scale: rot_accel -= gyro * radians(400)/ref_rot_rate.
    pub ref_rot_rate: f64,

    // Calibrated fields (ArduPilot Frame::init, SIM_Frame.cpp ~605-644).
    /// Per-motor effective disc area used by calc_thrust (m^2).
    pub effective_prop_area: f64,
    /// Per-motor true disc area (disc_area / num_motors) used by momentum drag.
    pub true_prop_area: f64,
    /// Max prop outflow velocity at voltage_scale=1, command=1 (m/s).
    pub max_outflow_velocity: f64,
    /// Power (W) consumed per newton of thrust; drives per-motor current.
    pub power_factor: f64,
    /// Exposed area times drag coefficient for the airframe body drag (m^2).
    pub area_cd: f64,
    /// Full-pack voltage; voltage_scale = voltage / voltage_max.
    pub voltage_max: f64,
    /// Momentum drag coefficient (possibly rescaled by Frame::init).
    pub momentum_drag_coefficient: f64,
    /// Optional suspended payload physics. `None` => no load, unchanged physics.
    pub slung_load: Option<SlungLoadParams>,
}

#[derive(Debug, Clone)]
pub struct BatteryConfig {
    pub max_voltage: f64,
    pub ref_voltage: f64,
    pub capacity_ah: f64,
    pub internal_resistance: f64,
    pub hover_current: f64,
    pub hover_thrust: f64,
}

/// Air density in kg/m^3 at an AMSL altitude, ISA troposphere model (Wikipedia
/// "Density of air: variation with altitude"), matching ArduPilot's
/// AP_Baro::get_air_density_for_alt_amsl. Sea level -> ~1.225.
pub fn get_air_density(alt_amsl: f64) -> f64 {
    const P0: f64 = 101325.0; // sea-level standard pressure, Pa
    const T0: f64 = 288.15; // sea-level standard temperature, K
    const L: f64 = 0.0065; // temperature lapse rate, K/m
    const R: f64 = 8.31446; // universal gas constant, J/(mol*K)
    const M: f64 = 0.0289644; // molar mass of dry air, kg/mol
    let temp = T0 - L * alt_amsl;
    if temp <= 0.0 {
        return 0.0;
    }
    let pressure = P0 * (1.0 - (L * alt_amsl) / T0).powf((GRAVITY_MSS * M) / (R * L));
    (pressure * M) / (R * temp)
}

/// Port of ArduPilot `Frame::init` (SIM_Frame.cpp ~605-644): calibrate the
/// motor/drag model from the reference bench test and hover point.
pub fn multirotor_params(m: &FrameModel) -> MultirotorParams {
    let g = GRAVITY_MSS;
    let num_motors = m.num_motors;

    let ref_air_density = get_air_density(m.ref_alt);

    let drag_force = m.mass * g * m.ref_angle.to_radians().tan();
    let cos_tilt = m.ref_angle.to_radians().cos();
    let airspeed_bf = m.ref_spd * cos_tilt;
    let ref_thrust = m.mass * g / cos_tilt;
    let momentum_drag =
        cos_tilt * m.mdrag_coef * airspeed_bf * (ref_thrust * ref_air_density * m.disc_area).sqrt();

    let mut mdrag_coef = m.mdrag_coef;
    let area_cd;
    if momentum_drag > drag_force {
        mdrag_coef *= drag_force / momentum_drag;
        area_cd = 0.0;
    } else {
        area_cd = (drag_force - momentum_drag) / (0.5 * ref_air_density * m.ref_spd * m.ref_spd);
    }

    let hover_thrust = m.mass * g;
    let hover_power = m.ref_current * m.ref_voltage;
    let hover_velocity_out = 2.0 * hover_power / hover_thrust;
    let effective_disc_area =
        hover_thrust / (0.5 * ref_air_density * hover_velocity_out * hover_velocity_out);
    let velocity_max = hover_velocity_out / m.hover_thr_out.sqrt();
    let effective_prop_area = effective_disc_area / num_motors;
    let true_prop_area = m.disc_area / num_motors;
    let power_factor = hover_power / hover_thrust;

    MultirotorParams {
        mass: m.mass,
        diagonal_size: m.diagonal_size,
        num_motors: num_motors as u32,
        hover_thr_out: m.hover_thr_out,
        prop_expo: m.prop_expo,
        pwm_min: m.pwm_min,
        pwm_max: m.pwm_max,
        spin_min: m.spin_min,
        spin_max: m.spin_max,
        ref_rot_rate: m.ref_rot_rate,
        effective_prop_area,
        true_prop_area,
        max_outflow_velocity: velocity_max,
        power_factor,
        area_cd,
        voltage_max: m.max_voltage,
        momentum_drag_coefficient: mdrag_coef,
        // Slung load is not part of the calibration model; attached from the
        // frame JSON by `multirotor_params_from_frame`. Bare model => none.
        slung_load: None,
    }
}

pub fn multirotor_params_from_frame(f: &SitlCustomFrame) -> MultirotorParams {
    let mut p = multirotor_params(&FrameModel::from(f));
    p.slung_load = f.slung_load.as_ref().map(SlungLoadParams::from);
    p
}

pub fn battery_from_frame(f: &SitlCustomFrame, hover_thrust: f64) -> BatteryConfig {
    BatteryConfig {
        max_voltage: f.max_voltage,
        ref_voltage: f.ref_voltage,
        capacity_ah: f.batt_capacity_ah,
        internal_resistance: f.ref_bat_res,
        hover_current: f.ref_current,
        hover_thrust,
    }
}

/// No-frame defaults: ArduPilot's built-in small-quad `default_model`.
pub fn default_params() -> MultirotorParams {
    multirotor_params(&FrameModel::default())
}

#[cfg(test)]
mod tests {
    use super::*;
    const HEAVY_OCTA: &str = r#"{
      "mass":32.5,"diagonal_size":1.325,"refSpd":25,"refAngle":30,"refVoltage":46.9,
      "refCurrent":65.36,"refAlt":26,"refTempC":25,"refBatRes":0.024,"maxVoltage":50.4,
      "battCapacityAh":44,"propExpo":0.5,"refRotRate":120,"hoverThrOut":0.36,
      "pwmMin":1000,"pwmMax":1940,"spin_min":0.2,"spin_max":0.975,"slew_max":75,
      "disc_area":1.82,"mdrag_coef":0.10,"num_motors":8
    }"#;

    #[test]
    fn air_density_sea_level_is_isa() {
        assert!((get_air_density(0.0) - 1.225).abs() < 2e-3);
        // Density decreases with altitude.
        assert!(get_air_density(2000.0) < get_air_density(0.0));
    }

    #[test]
    fn parses_heavy_octa_and_maps_params() {
        let f: SitlCustomFrame = serde_json::from_str(HEAVY_OCTA).unwrap();
        assert_eq!(f.num_motors, 8.0);
        let p = multirotor_params_from_frame(&f);
        assert_eq!(p.num_motors, 8);
        assert!((p.voltage_max - 50.4).abs() < 1e-9);
        // true_prop_area = disc_area / num_motors.
        assert!((p.true_prop_area - 1.82 / 8.0).abs() < 1e-9);
        // power_factor = hover_power / hover_thrust = refCurrent*refVoltage/(mass*g).
        let expect_pf = (65.36 * 46.9) / (32.5 * GRAVITY_MSS);
        assert!((p.power_factor - expect_pf).abs() < 1e-6);
        assert!(p.effective_prop_area > 0.0 && p.effective_prop_area.is_finite());
        assert!(p.max_outflow_velocity > 0.0 && p.max_outflow_velocity.is_finite());
        assert!(p.area_cd >= 0.0 && p.area_cd.is_finite());

        let b = battery_from_frame(&f, 32.5 * GRAVITY_MSS);
        assert!((b.ref_voltage - 46.9).abs() < 1e-9);
        assert!((b.internal_resistance - 0.024).abs() < 1e-9);
        assert!((b.hover_current - 65.36).abs() < 1e-9);
    }

    #[test]
    fn default_params_are_stock_quad() {
        let p = default_params();
        assert_eq!(p.num_motors, 4);
        assert!((p.mass - 3.0).abs() < 1e-9);
        assert!((p.voltage_max - 12.6).abs() < 1e-9);
        assert!(p.effective_prop_area > 0.0);
        assert!(p.power_factor > 0.0);
        // Bare model carries no slung load.
        assert!(p.slung_load.is_none());
    }

    const HEAVY_OCTA_SLUNG: &str = r#"{
      "mass":32.5,"diagonal_size":1.325,"refSpd":25,"refAngle":30,"refVoltage":46.9,
      "refCurrent":65.36,"refAlt":26,"refTempC":25,"refBatRes":0.024,"maxVoltage":50.4,
      "battCapacityAh":44,"propExpo":0.5,"refRotRate":120,"hoverThrOut":0.36,
      "pwmMin":1000,"pwmMax":1940,"spin_min":0.2,"spin_max":0.975,"slew_max":75,
      "disc_area":1.82,"mdrag_coef":0.10,"num_motors":8,
      "slungLoad":{"loadMass":8.0,"cableLength":3.0,"hardpoint":[0.0,0.0,0.15],
        "stiffness":4000,"damping":40,"loadDragCda":0.08,"winchMin":0.3,"winchMax":15.0,
        "winchChannel":9,"releaseChannel":10}
    }"#;

    #[test]
    fn heavy_octa_without_slung_load_is_none() {
        let f: SitlCustomFrame = serde_json::from_str(HEAVY_OCTA).unwrap();
        assert!(f.slung_load.is_none());
        assert!(multirotor_params_from_frame(&f).slung_load.is_none());
    }

    #[test]
    fn parses_slung_load_and_maps_params() {
        let f: SitlCustomFrame = serde_json::from_str(HEAVY_OCTA_SLUNG).unwrap();
        let sl = f.slung_load.as_ref().unwrap();
        assert_eq!(sl.winch_channel, Some(9));
        assert_eq!(sl.release_channel, Some(10));
        let p = multirotor_params_from_frame(&f);
        let slp = p.slung_load.expect("slung params present");
        assert!((slp.load_mass - 8.0).abs() < 1e-9);
        assert!((slp.cable_length - 3.0).abs() < 1e-9);
        assert!((slp.hardpoint.z - 0.15).abs() < 1e-9);
        assert!((slp.stiffness - 4000.0).abs() < 1e-9);
        assert!((slp.winch_max - 15.0).abs() < 1e-9);
        assert!((slp.winch_min - 0.3).abs() < 1e-9);
    }
}
