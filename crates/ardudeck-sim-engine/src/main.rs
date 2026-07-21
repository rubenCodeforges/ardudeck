#![allow(dead_code)]

use std::sync::{Arc, Mutex};

use clap::Parser;
use serde::Deserialize;

// The physics modules live in the library crate (src/lib.rs) so the batch
// harness (src/bin/batch.rs) can share them; this binary is a thin real-time
// front end over the same modules, with unchanged behavior.
use ardudeck_sim_engine::{fault, fdm_server, frame};
use ardudeck_sim_engine::collision::ContactParams;
use ardudeck_sim_engine::copter::DEFAULT_ENVIRONMENT;
use ardudeck_sim_engine::fdm_server::{CopterVehicle, HomeLocation, SlungChannels};
use ardudeck_sim_engine::frame::{
    battery_from_frame, default_params, multirotor_params_from_frame, BatteryConfig,
    MultirotorParams, SitlCustomFrame,
};
use ardudeck_sim_engine::math::Vec3;
use ardudeck_sim_engine::obstacle::{Obstacle, ObstacleShape};
use ardudeck_sim_engine::record::PwmRecorder;
use ardudeck_sim_engine::sensors::{SensorNoiseConfig, NO_SENSOR_NOISE};
use ardudeck_sim_engine::terrain::{HeightGrid, Terrain};
use ardudeck_sim_engine::wind::{ShearProfile, WindConfig, WindField};
use ardudeck_sim_engine::world::{SharedWorld, SimWorld};

/// ArduDeck SITL physics engine (SIM_JSON FDM backend).
#[derive(Parser, Debug)]
#[command(name = "ardudeck-sim-engine")]
struct Args {
    /// UDP port for the SIM_JSON FDM backend (SITL connects here).
    #[arg(long, default_value_t = 9002)]
    fdm_port: u16,
    /// WebSocket port the engine streams state on (the 3D world connects here).
    #[arg(long, default_value_t = 9020)]
    ws_port: u16,
    /// Vehicle kind. v1 supports copter only.
    #[arg(long, default_value = "copter")]
    kind: String,
    /// Base vehicle id.
    #[arg(long, default_value = "v")]
    id: String,
    /// Home as lat,lng,alt,heading.
    #[arg(long, default_value = "-35.363261,149.165230,584,353")]
    home: String,
    /// Path to a custom-frame JSON (copter only).
    #[arg(long)]
    frame: Option<String>,
    /// Model battery voltage sag under load.
    #[arg(long, default_value_t = false)]
    battery: bool,
    /// Inject IMU sensor noise.
    #[arg(long, default_value_t = false)]
    noise: bool,
    /// Steady + turbulent wind as n,e,d,intensity,tau.
    #[arg(long)]
    wind: Option<String>,
    /// Path to a terrain heightfield JSON (geographic; projected to NED via home).
    /// Absent => flat datum plane (byte-identical to before).
    #[arg(long)]
    terrain: Option<String>,
    /// Path to an obstacles JSON (array of AuthoredObstacle: lat/lon/shape/radius/
    /// height). Projected to local NED at load. Absent => no obstacles.
    #[arg(long)]
    obstacles: Option<String>,
    /// Path to a wind-profile JSON (shear + veer + gusts). Wins over --wind when
    /// both are given. Absent => the --wind uniform profile.
    #[arg(long = "wind-profile")]
    wind_profile: Option<String>,
    /// Inject a physical motor fault (repeatable). Spec:
    /// `motor=<i>,kind=<motor_out|thrust_loss|imbalance|brownout|bearing_drag|asym_drag>,severity=<0..1>,at=<s>,ramp=<s>`.
    /// Example: --fault "motor=3,kind=thrust_loss,severity=0.4,at=30,ramp=5".
    #[arg(long = "fault")]
    faults: Vec<String>,
    /// ESC brownout threshold (V): with --battery, a marginal ESC on a loaded pack
    /// below this may cut out (battery-coupled §1c). 0 (default) disables it.
    #[arg(long, default_value_t = 0.0)]
    esc_brownout_v: f64,
    /// Number of vehicles to simulate in ONE shared world (spec 2). N > 1 spawns N
    /// copies of the frame on a small grid, sharing the air field so they feel each
    /// other's downwash and can collide. Default 1 = the single-vehicle path.
    #[arg(long, default_value_t = 1)]
    vehicles: u16,
    /// Base FDM UDP port for a shared world: vehicle i binds `fdm_base_port + i`
    /// (matches the swarm launcher's SITL `-I<i>` port assignment). Single-vehicle
    /// runs still use --fdm-port.
    #[arg(long, default_value_t = 9002)]
    fdm_base_port: u16,
    /// Grid spacing (m) between spawned vehicles in a shared world.
    #[arg(long, default_value_t = 12.0)]
    fleet_spacing: f64,
    /// Record every commanded PWM frame to this .pwm.bin file (single-vehicle
    /// only), for the batch harness's bit-exact replay bridge. Off by default:
    /// when unset the real-time stepping is byte-identical to before.
    #[arg(long = "record-pwm")]
    record_pwm: Option<String>,
}

/// Default home (ArduPilot CMAC / Canberra).
const DEFAULT_HOME: HomeLocation = HomeLocation {
    lat: -35.363261,
    lng: 149.165230,
    alt: 584.0,
    heading: 353.0,
};

fn parse_field(parts: &[f64], idx: usize, fallback: f64) -> f64 {
    match parts.get(idx) {
        Some(v) if v.is_finite() => *v,
        _ => fallback,
    }
}

fn parse_home(s: &str) -> HomeLocation {
    let parts: Vec<f64> = s
        .split(',')
        .map(|x| x.trim().parse::<f64>().unwrap_or(f64::NAN))
        .collect();
    HomeLocation {
        lat: parse_field(&parts, 0, DEFAULT_HOME.lat),
        lng: parse_field(&parts, 1, DEFAULT_HOME.lng),
        alt: parse_field(&parts, 2, DEFAULT_HOME.alt),
        heading: parse_field(&parts, 3, DEFAULT_HOME.heading),
    }
}

fn parse_wind(s: Option<&str>) -> WindConfig {
    match s {
        None => WindConfig {
            steady: Vec3::zero(),
            intensity: 0.0,
            time_constant: 1.0,
        },
        Some(s) => {
            let p: Vec<f64> = s
                .split(',')
                .map(|x| x.trim().parse::<f64>().unwrap_or(0.0))
                .collect();
            WindConfig {
                steady: Vec3::new(
                    p.first().copied().unwrap_or(0.0),
                    p.get(1).copied().unwrap_or(0.0),
                    p.get(2).copied().unwrap_or(0.0),
                ),
                intensity: p.get(3).copied().unwrap_or(0.0),
                time_constant: p.get(4).copied().unwrap_or(1.0),
            }
        }
    }
}

/// WGS84 equatorial radius, for the equirectangular geo->NED projection.
const EARTH_RADIUS_M: f64 = 6378137.0;

/// Project a geographic point to local NED metres relative to `home`
/// (equirectangular: exact enough over a test-site tile). North = +lat, East = +lon.
fn geo_to_ned(lat: f64, lon: f64, home: &HomeLocation) -> (f64, f64) {
    let dlat = (lat - home.lat).to_radians();
    let dlon = (lon - home.lng).to_radians();
    let north = dlat * EARTH_RADIUS_M;
    let east = dlon * EARTH_RADIUS_M * home.lat.to_radians().cos();
    (north, east)
}

#[derive(Debug, Deserialize)]
struct GeoOrigin {
    lat: f64,
    lon: f64,
}

/// Terrain heightfield file (spec 2.3): geographic origin + AMSL heights. The
/// engine subtracts `datum_alt` so stored heights become metres above datum (+up).
#[derive(Debug, Deserialize)]
struct TerrainFile {
    origin: GeoOrigin,
    spacing_m: f64,
    rows: usize,
    cols: usize,
    datum_alt: f64,
    heights_amsl: Vec<f64>,
}

/// One authored obstacle (mirrors the app's `AuthoredObstacle`). `radius` is a
/// cylinder radius or a box half-extent; `height` is metres above datum.
#[derive(Debug, Deserialize)]
struct ObstacleFile {
    lat: f64,
    lon: f64,
    shape: String,
    radius: f64,
    height: f64,
}

/// Wind-profile file (spec 2.3): boundary-layer shear + veer + gust config.
#[derive(Debug, Deserialize)]
struct WindProfileFile {
    ref_speed: f64,
    ref_dir_deg: f64,
    ref_height: f64,
    alpha: f64,
    #[serde(default)]
    veer_deg_per_m: f64,
    #[serde(default = "default_z0")]
    z0: f64,
    #[serde(default)]
    gust_intensity: f64,
    #[serde(default = "default_gust_tau")]
    gust_tau: f64,
    #[serde(default)]
    turb_height_scale: f64,
}

fn default_z0() -> f64 {
    0.3
}
fn default_gust_tau() -> f64 {
    1.0
}

/// Load the terrain heightfield, projecting the origin to NED via `home` and
/// converting AMSL heights to metres above datum. On any error => flat.
fn load_terrain(path: Option<&str>, home: &HomeLocation) -> Terrain {
    let Some(path) = path else { return Terrain::Flat };
    match std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<TerrainFile>(&raw).ok())
    {
        Some(t) if t.rows > 0 && t.cols > 0 && t.heights_amsl.len() == t.rows * t.cols => {
            let (north0, east0) = geo_to_ned(t.origin.lat, t.origin.lon, home);
            let heights = t.heights_amsl.iter().map(|h| h - t.datum_alt).collect();
            Terrain::Grid(HeightGrid {
                north0,
                east0,
                spacing: t.spacing_m,
                rows: t.rows,
                cols: t.cols,
                heights,
            })
        }
        _ => {
            eprintln!("[sim-engine] failed to load terrain {path}, using flat ground");
            Terrain::Flat
        }
    }
}

/// Load obstacles, projecting each to local NED via `home`. On error => none.
fn load_obstacles(path: Option<&str>, home: &HomeLocation) -> Vec<Obstacle> {
    let Some(path) = path else { return Vec::new() };
    match std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Vec<ObstacleFile>>(&raw).ok())
    {
        Some(list) => list
            .into_iter()
            .map(|o| {
                let (north, east) = geo_to_ned(o.lat, o.lon, home);
                let shape = if o.shape.eq_ignore_ascii_case("box") {
                    ObstacleShape::Box
                } else {
                    ObstacleShape::Cylinder
                };
                Obstacle { north, east, shape, radius: o.radius, height: o.height }
            })
            .collect(),
        None => {
            eprintln!("[sim-engine] failed to load obstacles {path}, using none");
            Vec::new()
        }
    }
}

/// Load a wind-profile file into a `WindField` (shear + veer + gusts). On error
/// => fall back to the uniform `cfg` (the legacy --wind path).
fn load_wind_profile(path: Option<&str>, cfg: WindConfig) -> WindField {
    let Some(path) = path else { return WindField::from_uniform(cfg) };
    match std::fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<WindProfileFile>(&raw).ok())
    {
        Some(w) => WindField {
            steady: Vec3::zero(),
            shear: Some(ShearProfile {
                ref_speed: w.ref_speed,
                ref_dir_deg: w.ref_dir_deg,
                ref_height: w.ref_height,
                alpha: w.alpha,
                veer_deg_per_m: w.veer_deg_per_m,
                z_min: w.z0,
            }),
            grid: None,
            gust_intensity: w.gust_intensity,
            gust_tau: w.gust_tau,
            turb_height_scale: w.turb_height_scale,
        },
        None => {
            eprintln!("[sim-engine] failed to load wind profile {path}, using --wind");
            WindField::from_uniform(cfg)
        }
    }
}

struct LoadedCopter {
    params: MultirotorParams,
    battery: Option<frame::BatteryConfig>,
    /// Slung-load runtime servo channels, if the frame declares a load with them.
    slung_channels: Option<fdm_server::SlungChannels>,
}

/// Load the frame (copter). On any error, fall back to default params.
/// Battery is built only when requested AND a frame is supplied.
fn load_copter(frame_path: Option<&str>, want_battery: bool) -> LoadedCopter {
    let Some(path) = frame_path else {
        return LoadedCopter {
            params: default_params(),
            battery: None,
            slung_channels: None,
        };
    };
    match std::fs::read_to_string(path).and_then(|raw| {
        serde_json::from_str::<SitlCustomFrame>(&raw)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))
    }) {
        Ok(frame) => {
            let params = multirotor_params_from_frame(&frame);
            let battery = if want_battery {
                Some(battery_from_frame(
                    &frame,
                    params.mass * DEFAULT_ENVIRONMENT.gravity,
                ))
            } else {
                None
            };
            // Wire the winch/release servo channels when the frame declares them.
            let slung_channels = frame.slung_load.as_ref().and_then(|sl| {
                if sl.winch_channel.is_some() || sl.release_channel.is_some() {
                    Some(fdm_server::SlungChannels {
                        winch_channel: sl.winch_channel,
                        release_channel: sl.release_channel,
                        max_reel_speed: 1.0, // m/s at full stick
                    })
                } else {
                    None
                }
            });
            LoadedCopter { params, battery, slung_channels }
        }
        Err(e) => {
            eprintln!("[sim-engine] failed to load frame {path}, using defaults: {e}");
            LoadedCopter {
                params: default_params(),
                battery: None,
                slung_channels: None,
            }
        }
    }
}

/// Build a fully configured copter: frame, battery, wind, sensor noise, terrain,
/// obstacles, wind profile, scheduled faults, ESC brownout and a shared-world
/// spawn offset. Shared by the single- and multi-vehicle paths.
#[allow(clippy::too_many_arguments)]
fn make_vehicle(
    id: String,
    seed: u32,
    spawn: Vec3,
    params: MultirotorParams,
    battery: Option<BatteryConfig>,
    home: HomeLocation,
    wind: WindConfig,
    noise: SensorNoiseConfig,
    slung: Option<SlungChannels>,
    terrain: &Terrain,
    obstacles: &[Obstacle],
    wind_field: Option<&WindField>,
    fault_specs: &[String],
    esc_brownout_v: f64,
) -> CopterVehicle {
    let mut v = CopterVehicle::new(
        id, params, DEFAULT_ENVIRONMENT, home, wind, noise, battery, true, seed,
    );
    if let Some(ch) = slung {
        v.set_slung_channels(ch);
    }
    if !matches!(terrain, Terrain::Flat) {
        v.set_terrain(terrain.clone());
    }
    if !obstacles.is_empty() {
        v.set_obstacles(obstacles.to_vec());
    }
    if let Some(wf) = wind_field {
        v.set_wind_field(wf.clone());
    }
    for spec in fault_specs {
        if let Some(f) = fault::ScheduledFault::parse(spec) {
            v.add_scheduled_fault(f);
        }
    }
    if esc_brownout_v > 0.0 {
        v.set_esc_brownout_threshold(esc_brownout_v);
    }
    if spawn != Vec3::zero() {
        v.set_spawn_offset(spawn);
    }
    v
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    if args.kind != "copter" {
        eprintln!(
            "[sim-engine] kind '{}' not supported in v1, using copter",
            args.kind
        );
    }

    let home = parse_home(&args.home);
    let wind = parse_wind(args.wind.as_deref());
    let noise: SensorNoiseConfig = if args.noise {
        SensorNoiseConfig {
            gyro_noise: 0.01,
            accel_noise: 0.05,
            gyro_bias: Vec3::zero(),
            accel_bias: Vec3::zero(),
        }
    } else {
        NO_SENSOR_NOISE
    };

    let loaded = load_copter(args.frame.as_deref(), args.battery);

    // Environmental coupling inputs (spec 2.3), loaded once and shared by every
    // vehicle. Each defaults to the calm/flat no-op when its flag is absent.
    let terrain = load_terrain(args.terrain.as_deref(), &home);
    let obstacles = load_obstacles(args.obstacles.as_deref(), &home);
    if !obstacles.is_empty() {
        println!("[sim-engine] obstacles: {}", obstacles.len());
    }
    let wind_field = if args.wind_profile.is_some() {
        println!("[sim-engine] wind profile (shear) enabled");
        Some(load_wind_profile(args.wind_profile.as_deref(), wind))
    } else {
        None
    };
    for spec in &args.faults {
        match fault::ScheduledFault::parse(spec) {
            Some(f) => println!(
                "[sim-engine] fault: motor {} kind {} severity {} at {}s ramp {}s",
                f.motor, f.kind.as_str(), f.severity, f.at, f.ramp
            ),
            None => eprintln!("[sim-engine] ignoring malformed --fault '{spec}'"),
        }
    }

    println!(
        "[sim-engine] wind={} noise={} battery={}",
        if wind.intensity > 0.0 {
            format!("{}m/s turb", wind.intensity)
        } else {
            "calm".to_string()
        },
        args.noise,
        args.battery
    );
    println!("[sim-engine] launch SITL with:  --model JSON:127.0.0.1");

    if args.vehicles <= 1 {
        // Single-vehicle path (unchanged): one FDM port, one WS, no shared world.
        let mut vehicle = make_vehicle(
            format!("{}1", args.id), 1, Vec3::zero(), loaded.params, loaded.battery, home, wind,
            noise, loaded.slung_channels, &terrain, &obstacles, wind_field.as_ref(), &args.faults,
            args.esc_brownout_v,
        );
        // Optional PWM recording for the batch replay bridge. Off unless requested,
        // so stepping is unchanged in the default case.
        if let Some(path) = args.record_pwm.as_deref() {
            match PwmRecorder::to_file(path) {
                Ok(rec) => {
                    println!("[sim-engine] recording PWM stream to {path}");
                    vehicle.set_pwm_recorder(rec);
                }
                Err(e) => eprintln!("[sim-engine] cannot record PWM to {path}: {e}"),
            }
        }
        println!(
            "[sim-engine] copter, FDM port {}, state WS ws:{}",
            args.fdm_port, args.ws_port
        );
        let world = SimWorld {
            fdm_port: args.fdm_port,
            ws_port: args.ws_port,
            home,
            vehicle: Arc::new(Mutex::new(vehicle)),
        };
        return world.run().await;
    }

    // Shared multi-vehicle world (spec 2): N copies on a grid, one WS, one FDM port
    // per vehicle (fdm_base_port + i), sharing the air field for wake + collisions.
    let n = args.vehicles;
    let cols = (n as f64).sqrt().ceil() as u16;
    let mut world = SharedWorld::new(args.ws_port, ContactParams::default());
    for i in 0..n {
        let (row, col) = (i / cols, i % cols);
        let spawn = Vec3::new(col as f64 * args.fleet_spacing, row as f64 * args.fleet_spacing, 0.0);
        let vehicle = make_vehicle(
            format!("{}{}", args.id, i + 1),
            (i + 1) as u32,
            spawn,
            loaded.params.clone(),
            loaded.battery.clone(),
            home,
            wind,
            noise,
            loaded.slung_channels,
            &terrain,
            &obstacles,
            wind_field.as_ref(),
            &args.faults,
            args.esc_brownout_v,
        );
        let fdm_port = args.fdm_base_port + i;
        println!("[sim-engine] vehicle {}{} on FDM port {fdm_port} (SITL -I{i})", args.id, i + 1);
        world.add_vehicle(Arc::new(Mutex::new(vehicle)), fdm_port, home);
    }
    println!(
        "[sim-engine] shared world: {n} copters, state WS ws:{}, grid spacing {} m",
        args.ws_port, args.fleet_spacing
    );
    world.run().await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_wind_maps_all_fields() {
        // `--wind n,e,d,intensity,tau` -> WindConfig.steady (NED) + intensity + tau.
        let w = parse_wind(Some("8,-3,0.5,2,1.5"));
        assert_eq!((w.steady.x, w.steady.y, w.steady.z), (8.0, -3.0, 0.5));
        assert_eq!(w.intensity, 2.0);
        assert_eq!(w.time_constant, 1.5);
    }

    #[test]
    fn parse_wind_steady_only_has_zero_intensity() {
        // A steady-only "--wind 8,0,0" is calm-turbulence but still a real steady
        // wind: update_wind returns the steady vector when intensity <= 0.
        let w = parse_wind(Some("8,0,0"));
        assert_eq!((w.steady.x, w.steady.y, w.steady.z), (8.0, 0.0, 0.0));
        assert_eq!(w.intensity, 0.0);
    }

    #[test]
    fn parse_wind_none_is_calm() {
        let w = parse_wind(None);
        assert_eq!((w.steady.x, w.steady.y, w.steady.z), (0.0, 0.0, 0.0));
        assert_eq!(w.intensity, 0.0);
    }

    #[test]
    fn geo_to_ned_is_zero_at_home_and_signed_correctly() {
        let home = DEFAULT_HOME;
        let (n, e) = geo_to_ned(home.lat, home.lng, &home);
        assert!(n.abs() < 1e-6 && e.abs() < 1e-6);
        // A point slightly north/east of home projects to +north / +east.
        let (n2, e2) = geo_to_ned(home.lat + 0.001, home.lng + 0.001, &home);
        assert!(n2 > 0.0 && e2 > 0.0);
        // ~0.001 deg latitude is ~111 m.
        assert!((n2 - 111.0).abs() < 5.0, "north {n2}");
    }

    #[test]
    fn absent_inputs_are_calm_flat_no_op() {
        let home = DEFAULT_HOME;
        assert!(matches!(load_terrain(None, &home), Terrain::Flat));
        assert!(load_obstacles(None, &home).is_empty());
        let wf = load_wind_profile(None, WindConfig { steady: Vec3::new(3.0, 0.0, 0.0), intensity: 0.0, time_constant: 1.0 });
        assert!(wf.shear.is_none());
        assert_eq!((wf.steady.x, wf.steady.y, wf.steady.z), (3.0, 0.0, 0.0));
    }

    #[test]
    fn terrain_file_projects_and_subtracts_datum() {
        let home = DEFAULT_HOME;
        let path = std::env::temp_dir().join("ardudeck_terrain_test.json");
        let json = format!(
            r#"{{"origin":{{"lat":{},"lon":{}}},"spacing_m":30,"rows":2,"cols":2,"datum_alt":500,"heights_amsl":[510,520,530,540]}}"#,
            home.lat, home.lng
        );
        std::fs::write(&path, json).unwrap();
        let t = load_terrain(path.to_str(), &home);
        match t {
            Terrain::Grid(g) => {
                assert_eq!((g.rows, g.cols), (2, 2));
                // Heights above datum (AMSL - 500).
                assert_eq!(g.heights, vec![10.0, 20.0, 30.0, 40.0]);
                // Origin at home projects to ~(0,0).
                assert!(g.north0.abs() < 1e-6 && g.east0.abs() < 1e-6);
            }
            _ => panic!("expected a grid"),
        }
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn obstacles_file_projects_shapes() {
        let home = DEFAULT_HOME;
        let path = std::env::temp_dir().join("ardudeck_obstacles_test.json");
        let json = format!(
            r#"[{{"id":"a","lat":{},"lon":{},"shape":"box","radius":8,"height":40}},
                {{"id":"b","lat":{},"lon":{},"shape":"cylinder","radius":5,"height":30}}]"#,
            home.lat, home.lng, home.lat, home.lng
        );
        std::fs::write(&path, json).unwrap();
        let obs = load_obstacles(path.to_str(), &home);
        assert_eq!(obs.len(), 2);
        assert_eq!(obs[0].shape, ObstacleShape::Box);
        assert_eq!(obs[1].shape, ObstacleShape::Cylinder);
        assert!((obs[0].radius - 8.0).abs() < 1e-9);
        let _ = std::fs::remove_file(&path);
    }

    #[test]
    fn wind_profile_file_builds_shear() {
        let path = std::env::temp_dir().join("ardudeck_wind_test.json");
        std::fs::write(&path, r#"{"ref_speed":9,"ref_dir_deg":45,"ref_height":10,"alpha":0.2,"gust_intensity":1.5}"#).unwrap();
        let wf = load_wind_profile(path.to_str(), parse_wind(None));
        let s = wf.shear.expect("shear present");
        assert!((s.ref_speed - 9.0).abs() < 1e-9);
        assert!((s.alpha - 0.2).abs() < 1e-9);
        assert!((wf.gust_intensity - 1.5).abs() < 1e-9);
        assert!((s.z_min - 0.3).abs() < 1e-9); // z0 default
        let _ = std::fs::remove_file(&path);
    }
}
