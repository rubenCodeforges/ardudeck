//! The world environment (spec 2.1): one object owning terrain, the wind field
//! and obstacles, with a single `sample` call returning everything the physics
//! needs at a point. Ground-effect factor is NOT here (it needs rotor radius and
//! per-motor geometry, which `copter.rs` owns); `sample` supplies `ground_height`.
//!
//! Determinism: `sample` mutates the gust/wake OU state and draws RNG in a fixed
//! order (ambient gust, then each obstacle wake). The calm/flat/no-obstacle case
//! draws exactly the ambient gust and reduces byte-for-byte to the legacy wind.

use crate::copter::Environment;
use crate::math::Vec3;
use crate::obstacle::Obstacle;
use crate::rng::Rng;
use crate::terrain::Terrain;
use crate::wind::{init_wind, WindConfig, WindField, WindState};

/// Everything the physics reads at the vehicle position for one frame.
#[derive(Debug, Clone, Copy)]
pub struct LocalConditions {
    /// World NED mean + gust + obstacle wind at the point.
    pub wind: Vec3,
    /// Terrain height h(n,e), metres above datum (+up).
    pub ground_height: f64,
    /// Height above ground level: `-position.z - ground_height`.
    pub agl: f64,
    /// Air density (datum density in phase 1; not altitude-scaled, to keep the
    /// calm case bit-identical).
    pub air_density: f64,
    /// Local gust-intensity multiplier (>= 1) from obstacle wakes, for telemetry.
    pub turbulence_scale: f64,
}

/// Mutable per-frame gust state: the ambient OU gust plus one wake OU state per
/// obstacle. Threaded through `sample`; deterministic given seed + call order.
#[derive(Debug, Clone)]
pub struct WindGustState {
    pub ambient: WindState,
    pub wakes: Vec<WindState>,
}

impl WindGustState {
    pub fn new(num_obstacles: usize) -> WindGustState {
        WindGustState {
            ambient: init_wind(),
            wakes: vec![init_wind(); num_obstacles],
        }
    }
}

/// Owns the terrain, wind field and obstacles for a vehicle's world.
#[derive(Debug, Clone)]
pub struct WorldEnvironment {
    /// Gravity + datum air density (the wind field is separate).
    pub base: Environment,
    pub terrain: Terrain,
    pub wind_field: WindField,
    /// Obstacles in local NED (projected from lat/lon at load).
    pub obstacles: Vec<Obstacle>,
}

impl WorldEnvironment {
    /// Build a world with flat terrain and a legacy uniform wind: the calm/flat
    /// default that reproduces the pre-change engine byte-for-byte.
    pub fn uniform(base: Environment, wind_cfg: WindConfig) -> WorldEnvironment {
        WorldEnvironment {
            base,
            terrain: Terrain::Flat,
            wind_field: WindField::from_uniform(wind_cfg),
            obstacles: Vec::new(),
        }
    }

    /// Fresh gust state sized for this world's obstacle count.
    pub fn new_gust_state(&self) -> WindGustState {
        WindGustState::new(self.obstacles.len())
    }

    /// Sample the environment at `pos` (world NED). Composition order per spec:
    /// terrain height -> AGL -> shear/veer mean -> horizontal grid -> ambient OU
    /// gust (height-scaled) -> obstacle potential + wake (+ wake OU) -> clamp.
    ///
    /// `extra_gust_intensity` (m/s) is the proximity-turbulence bump a vehicle
    /// immersed in a NEIGHBOUR's rotor wake feels (spec 1.4, `k_turb * |wake_cg|`),
    /// superposed onto the ambient gust sigma. It is 0.0 for a stand-alone vehicle,
    /// so the single-vehicle path draws the same RNG and is byte-identical.
    pub fn sample(
        &self,
        pos: Vec3,
        gust: &mut WindGustState,
        dt: f64,
        rng: &mut Rng,
        extra_gust_intensity: f64,
    ) -> LocalConditions {
        let ground_height = self.terrain.height(pos.x, pos.y);
        let agl = -pos.z - ground_height;

        // Mean wind + ambient gust (the ambient gust reuses update_wind, so the
        // legacy uniform path draws the same RNG and matches the old wind). The
        // proximity-turbulence bump raises the gust sigma while immersed in a wake.
        let mean = self.wind_field.mean(pos, agl);
        let (ambient_state, ambient_gust) =
            self.wind_field.ambient_gust_boost(&gust.ambient, agl, dt, rng, extra_gust_intensity);
        gust.ambient = ambient_state;
        let u_ambient = mean.add(ambient_gust);

        // Obstacle perturbations superposed on the ambient wind.
        let ambient_intensity = self.wind_field.ambient_intensity(agl);
        let veh_height_above_datum = -pos.z;
        let mut du = Vec3::zero();
        let mut turbulence_scale = 1.0;
        for (i, obs) in self.obstacles.iter().enumerate() {
            // Keep the wake state vector in step even if it was sized before an
            // obstacle edit; fall back to a scratch state if missing.
            let mut scratch = init_wind();
            let wake = gust.wakes.get_mut(i).unwrap_or(&mut scratch);
            let (d, turb) = obs.perturbation(
                pos.x, pos.y, veh_height_above_datum, u_ambient, ambient_intensity, wake, dt, rng,
            );
            du = du.add(d);
            turbulence_scale += turb;
        }
        // Superposition clamp so overlapping wakes cannot blow up (spec 1.c).
        let umag = u_ambient.length();
        let cap = 1.5 * umag + 3.0;
        let du_mag = du.length();
        if du_mag > cap && du_mag > 0.0 {
            du = du.scale(cap / du_mag);
        }

        LocalConditions {
            wind: u_ambient.add(du),
            ground_height,
            agl,
            air_density: self.base.air_density,
            turbulence_scale,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::copter::DEFAULT_ENVIRONMENT;
    use crate::obstacle::{Obstacle, ObstacleShape};
    use crate::terrain::{HeightGrid, Terrain};
    use crate::wind::{update_wind, ShearProfile};

    fn calm_cfg() -> WindConfig {
        WindConfig { steady: Vec3::zero(), intensity: 0.0, time_constant: 1.0 }
    }

    #[test]
    fn calm_flat_sample_is_a_no_op() {
        let w = WorldEnvironment::uniform(DEFAULT_ENVIRONMENT, calm_cfg());
        let mut g = w.new_gust_state();
        let mut rng = Rng::new(5);
        let lc = w.sample(Vec3::new(10.0, -3.0, -20.0), &mut g, 0.01, &mut rng, 0.0);
        assert_eq!(lc.wind, Vec3::zero());
        assert_eq!(lc.ground_height, 0.0);
        assert!((lc.agl - 20.0).abs() < 1e-12);
        assert_eq!(lc.turbulence_scale, 1.0);
        // No RNG drawn in the calm case: the stream is untouched.
        assert_eq!(rng.next().to_bits(), Rng::new(5).next().to_bits());
    }

    #[test]
    fn uniform_wind_sample_matches_update_wind_bit_for_bit() {
        // The legacy path through WorldEnvironment must reproduce the old
        // update_wind vector exactly (same RNG order, same arithmetic).
        let cfg = WindConfig { steady: Vec3::new(7.0, -1.0, 0.0), intensity: 1.2, time_constant: 0.6 };
        let w = WorldEnvironment::uniform(DEFAULT_ENVIRONMENT, cfg);
        let mut g = w.new_gust_state();
        let mut rng_w = Rng::new(31);
        let (mut ws, mut rng_ref) = (init_wind(), Rng::new(31));
        for _ in 0..300 {
            let lc = w.sample(Vec3::new(0.0, 0.0, -25.0), &mut g, 0.01, &mut rng_w, 0.0);
            let (ns, wind_ref) = update_wind(&cfg, &ws, 0.01, &mut rng_ref);
            ws = ns;
            assert_eq!(lc.wind.x.to_bits(), wind_ref.x.to_bits());
            assert_eq!(lc.wind.y.to_bits(), wind_ref.y.to_bits());
            assert_eq!(lc.wind.z.to_bits(), wind_ref.z.to_bits());
        }
    }

    #[test]
    fn terrain_grid_sets_ground_height_and_agl() {
        let heights = vec![100.0; 4];
        let terrain = Terrain::Grid(HeightGrid { north0: 0.0, east0: 0.0, spacing: 50.0, rows: 2, cols: 2, heights });
        let w = WorldEnvironment {
            base: DEFAULT_ENVIRONMENT,
            terrain,
            wind_field: WindField::from_uniform(calm_cfg()),
            obstacles: Vec::new(),
        };
        let mut g = w.new_gust_state();
        let mut rng = Rng::new(1);
        // Vehicle at 120 m above datum over 100 m ground -> 20 m AGL.
        let lc = w.sample(Vec3::new(25.0, 25.0, -120.0), &mut g, 0.01, &mut rng, 0.0);
        assert!((lc.ground_height - 100.0).abs() < 1e-9);
        assert!((lc.agl - 20.0).abs() < 1e-9);
    }

    #[test]
    fn shear_makes_wind_grow_with_altitude() {
        let shear = ShearProfile { ref_speed: 8.0, ref_dir_deg: 0.0, ref_height: 10.0, alpha: 0.2, veer_deg_per_m: 0.0, z_min: 0.3 };
        let wf = WindField { steady: Vec3::zero(), shear: Some(shear), grid: None, gust_intensity: 0.0, gust_tau: 1.0, turb_height_scale: 0.0 };
        let w = WorldEnvironment { base: DEFAULT_ENVIRONMENT, terrain: Terrain::Flat, wind_field: wf, obstacles: Vec::new() };
        let mut g = w.new_gust_state();
        let mut rng = Rng::new(1);
        let low = w.sample(Vec3::new(0.0, 0.0, -5.0), &mut g, 0.01, &mut rng, 0.0).wind.length();
        let high = w.sample(Vec3::new(0.0, 0.0, -80.0), &mut g, 0.01, &mut rng, 0.0).wind.length();
        assert!(high > low, "sheared wind must be stronger higher up: {high} vs {low}");
    }

    #[test]
    fn overlapping_wake_perturbation_respects_the_clamp() {
        // Two obstacles stacked so their deficits pile up; the total perturbation
        // must stay within 1.5|U| + 3 of the ambient wind.
        let obstacles = vec![
            Obstacle { north: 0.0, east: 0.0, shape: ObstacleShape::Box, radius: 8.0, height: 40.0 },
            Obstacle { north: 3.0, east: 0.0, shape: ObstacleShape::Box, radius: 8.0, height: 40.0 },
        ];
        let cfg = WindConfig { steady: Vec3::new(6.0, 0.0, 0.0), intensity: 0.5, time_constant: 0.5 };
        let w = WorldEnvironment {
            base: DEFAULT_ENVIRONMENT,
            terrain: Terrain::Flat,
            wind_field: WindField::from_uniform(cfg),
            obstacles,
        };
        let mut g = w.new_gust_state();
        let mut rng = Rng::new(2);
        for _ in 0..50 {
            let lc = w.sample(Vec3::new(20.0, 0.0, -10.0), &mut g, 0.01, &mut rng, 0.0);
            let du = lc.wind.sub(Vec3::new(6.0, 0.0, 0.0));
            // Allow a little slack for the ambient gust that is part of `wind`.
            assert!(du.length() <= 1.5 * 6.0 + 3.0 + 2.0, "perturbation exceeded clamp: {}", du.length());
        }
    }
}
