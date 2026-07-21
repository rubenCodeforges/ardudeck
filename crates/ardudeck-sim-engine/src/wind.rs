use crate::math::Vec3;
use crate::rng::Rng;

#[derive(Debug, Clone, Copy)]
pub struct WindConfig {
    pub steady: Vec3,
    pub intensity: f64,
    pub time_constant: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct WindState {
    pub gust: Vec3,
}

pub fn init_wind() -> WindState {
    WindState { gust: Vec3::zero() }
}

pub fn update_wind(cfg: &WindConfig, state: &WindState, dt: f64, rng: &mut Rng) -> (WindState, Vec3) {
    if cfg.intensity <= 0.0 {
        return (WindState { gust: Vec3::zero() }, cfg.steady);
    }
    let tau = cfg.time_constant.max(1e-3);
    let alpha = (-dt / tau).exp();
    let beta = (1.0 - alpha * alpha).sqrt() * cfg.intensity;
    let gust = Vec3::new(
        alpha * state.gust.x + beta * rng.gaussian(),
        alpha * state.gust.y + beta * rng.gaussian(),
        alpha * state.gust.z + beta * rng.gaussian(),
    );
    let wind = cfg.steady.add(gust);
    (WindState { gust }, wind)
}

/// Power-law boundary-layer shear profile (spec 1.d). The dominant spatial wind
/// effect: mean speed grows with height above the real ground.
#[derive(Debug, Clone, Copy)]
pub struct ShearProfile {
    /// Reference wind speed at `ref_height` (m/s).
    pub ref_speed: f64,
    /// Bearing the wind blows TOWARD at the reference height (0 = +North, 90 = +East), degrees.
    pub ref_dir_deg: f64,
    /// Reference height above ground for `ref_speed` (m).
    pub ref_height: f64,
    /// Shear exponent alpha (~0.14 open, 0.20-0.30 suburban/built-up).
    pub alpha: f64,
    /// Optional Ekman veer: rotate direction by this many degrees per metre of
    /// height above `ref_height`. 0 disables veer.
    pub veer_deg_per_m: f64,
    /// Roughness clamp z_min (~z0, a few tenths of a metre): below it the profile
    /// holds its floor value (a vehicle on the deck feels little wind).
    pub z_min: f64,
}

impl ShearProfile {
    /// Mean wind vector (world NED, horizontal) at height `agl` above the ground.
    pub fn mean(&self, agl: f64) -> Vec3 {
        let z = agl.max(self.z_min);
        let mag = if self.ref_height > 0.0 {
            self.ref_speed * (z / self.ref_height).powf(self.alpha)
        } else {
            self.ref_speed
        };
        let dir = (self.ref_dir_deg + self.veer_deg_per_m * (agl - self.ref_height)).to_radians();
        Vec3::new(mag * dir.cos(), mag * dir.sin(), 0.0)
    }
}

/// A coarse low-resolution grid of horizontal wind offsets, bilinearly
/// interpolated (spec 1.d horizontal-gradient stretch). Optional; default none.
#[derive(Debug, Clone)]
pub struct WindGrid {
    pub north0: f64,
    pub east0: f64,
    pub spacing: f64,
    pub rows: usize,
    pub cols: usize,
    /// Row-major `[row*cols + col]` horizontal wind offset (world NED) per cell.
    pub vectors: Vec<Vec3>,
}

impl WindGrid {
    fn at(&self, row: usize, col: usize) -> Vec3 {
        let r = row.min(self.rows.saturating_sub(1));
        let c = col.min(self.cols.saturating_sub(1));
        self.vectors.get(r * self.cols + c).copied().unwrap_or(Vec3::zero())
    }

    /// Bilinear horizontal wind offset at world NED (north, east). Edge-clamped.
    pub fn sample(&self, north: f64, east: f64) -> Vec3 {
        if self.rows == 0 || self.cols == 0 || self.spacing <= 0.0 {
            return Vec3::zero();
        }
        let fr = ((north - self.north0) / self.spacing).clamp(0.0, (self.rows - 1) as f64);
        let fc = ((east - self.east0) / self.spacing).clamp(0.0, (self.cols - 1) as f64);
        let r0 = fr.floor() as usize;
        let c0 = fc.floor() as usize;
        let r1 = (r0 + 1).min(self.rows - 1);
        let c1 = (c0 + 1).min(self.cols - 1);
        let tr = fr - r0 as f64;
        let tc = fc - c0 as f64;
        let top = self.at(r0, c0).scale(1.0 - tc).add(self.at(r0, c1).scale(tc));
        let bot = self.at(r1, c0).scale(1.0 - tc).add(self.at(r1, c1).scale(tc));
        top.scale(1.0 - tr).add(bot.scale(tr))
    }
}

/// A spatially varying wind field: a shear-profile (or legacy uniform) mean, an
/// optional horizontal gradient grid, and the ambient Gauss-Markov gust on top.
///
/// The calm/legacy case (`from_uniform` with a legacy `WindConfig`) reduces
/// EXACTLY to the previous single global vector: `mean = steady`, the ambient
/// gust reuses `update_wind` with the same intensity/tau/RNG draws, and no
/// height scaling. See `world_env::WorldEnvironment::sample`.
#[derive(Debug, Clone)]
pub struct WindField {
    /// Legacy uniform mean (world NED), used when `shear` is None.
    pub steady: Vec3,
    pub shear: Option<ShearProfile>,
    pub grid: Option<WindGrid>,
    /// Base ambient gust intensity (Gauss-Markov sigma), m/s.
    pub gust_intensity: f64,
    /// Gust correlation time constant tau (s).
    pub gust_tau: f64,
    /// Near-canopy turbulence boost k_turb (spec 1.d): gust intensity is scaled by
    /// `1 + k_turb * (z_ref / z_agl)`, clamped. 0 = no height scaling (legacy).
    pub turb_height_scale: f64,
}

impl WindField {
    /// Legacy uniform field from a `WindConfig` (the `--wind n,e,d,intensity,tau`
    /// path). No shear, no grid, no height scaling: byte-identical to the old
    /// single global wind vector.
    pub fn from_uniform(cfg: WindConfig) -> WindField {
        WindField {
            steady: cfg.steady,
            shear: None,
            grid: None,
            gust_intensity: cfg.intensity,
            gust_tau: cfg.time_constant,
            turb_height_scale: 0.0,
        }
    }

    /// Mean wind (world NED) at a point: shear-or-uniform base plus the optional
    /// horizontal grid term. No gust.
    pub fn mean(&self, pos: Vec3, agl: f64) -> Vec3 {
        let base = match &self.shear {
            Some(s) => s.mean(agl),
            None => self.steady,
        };
        let grid = self
            .grid
            .as_ref()
            .map(|g| g.sample(pos.x, pos.y))
            .unwrap_or(Vec3::zero());
        base.add(grid)
    }

    /// Height-scaled ambient gust intensity at `agl` (spec 1.d). Reduces to the
    /// base intensity when `turb_height_scale == 0` (legacy, bit-identical).
    pub fn ambient_intensity(&self, agl: f64) -> f64 {
        if self.turb_height_scale <= 0.0 {
            return self.gust_intensity;
        }
        let zref = self.shear.as_ref().map(|s| s.ref_height).unwrap_or(10.0);
        let zmin = self.shear.as_ref().map(|s| s.z_min).unwrap_or(0.3);
        let z = agl.max(zmin);
        (self.gust_intensity * (1.0 + self.turb_height_scale * (zref / z)))
            .min(self.gust_intensity * 5.0)
    }

    /// Advance the ambient Gauss-Markov gust and return the gust vector. Reuses
    /// `update_wind` with a zero steady, so the legacy path draws the same RNG in
    /// the same order and produces the identical gust it did before.
    pub fn ambient_gust(&self, state: &WindState, agl: f64, dt: f64, rng: &mut Rng) -> (WindState, Vec3) {
        self.ambient_gust_boost(state, agl, dt, rng, 0.0)
    }

    /// As `ambient_gust`, but with an added gust-intensity `extra` (m/s) on top of
    /// the height-scaled ambient sigma. This is the proximity-turbulence bump a
    /// vehicle immersed in a neighbour's wake feels (spec 1.4). `extra == 0.0`
    /// reduces byte-for-byte to `ambient_gust` (same intensity, same RNG draws),
    /// so the single-vehicle path is unchanged.
    pub fn ambient_gust_boost(&self, state: &WindState, agl: f64, dt: f64, rng: &mut Rng, extra: f64) -> (WindState, Vec3) {
        let cfg = WindConfig {
            steady: Vec3::zero(),
            intensity: (self.ambient_intensity(agl) + extra).max(0.0),
            time_constant: self.gust_tau,
        };
        update_wind(&cfg, state, dt, rng)
    }
}

#[cfg(test)]
mod wind_tests {
    use super::*;
    use crate::math::Vec3;
    use crate::rng::Rng;
    #[test]
    fn steady_when_turbulence_off() {
        let cfg = WindConfig {
            steady: Vec3::new(5.0, -2.0, 0.0),
            intensity: 0.0,
            time_constant: 1.0,
        };
        let (_s, w) = update_wind(&cfg, &init_wind(), 0.01, &mut Rng::new(1));
        assert_eq!((w.x, w.y, w.z), (5.0, -2.0, 0.0));
    }
    #[test]
    fn gust_zero_mean_stddev_near_intensity() {
        let cfg = WindConfig {
            steady: Vec3::zero(),
            intensity: 2.0,
            time_constant: 0.5,
        };
        let mut r = Rng::new(123);
        let mut s = init_wind();
        let (mut sum, mut sumsq, n) = (0.0, 0.0, 50000);
        for _ in 0..n {
            let (ns, w) = update_wind(&cfg, &s, 0.02, &mut r);
            s = ns;
            sum += w.x;
            sumsq += w.x * w.x;
        }
        let mean = sum / n as f64;
        let var = sumsq / n as f64 - mean * mean;
        assert!(mean.abs() < 0.1);
        assert!(var.sqrt() > 1.5 && var.sqrt() < 2.5);
    }

    fn shear() -> ShearProfile {
        ShearProfile { ref_speed: 8.0, ref_dir_deg: 0.0, ref_height: 10.0, alpha: 0.2, veer_deg_per_m: 0.0, z_min: 0.3 }
    }

    #[test]
    fn shear_matches_power_law_and_is_monotonic() {
        let s = shear();
        // At the reference height the speed is exactly ref_speed.
        assert!((s.mean(10.0).length() - 8.0).abs() < 1e-9);
        // Power law: |U|(z) = ref_speed * (z/ref_height)^alpha.
        let z = 40.0;
        let expect = 8.0 * (z / 10.0f64).powf(0.2);
        assert!((s.mean(z).length() - expect).abs() < 1e-9);
        // Monotonic increasing with height.
        let mut prev = 0.0;
        for z in [1.0, 2.0, 5.0, 10.0, 20.0, 50.0, 120.0] {
            let m = s.mean(z).length();
            assert!(m >= prev, "shear must be monotonic in height: {m} < {prev}");
            prev = m;
        }
    }

    #[test]
    fn shear_clamps_below_z_min_and_stays_small_near_ground() {
        let s = shear();
        // Below z_min the profile holds its floor (clamped), so agl=0 == agl=z_min.
        assert!((s.mean(0.0).length() - s.mean(0.3).length()).abs() < 1e-12);
        // Near-ground wind is a small fraction of the reference (no-slip feel).
        assert!(s.mean(0.0).length() < 0.5 * 8.0, "near-ground wind should be well below ref");
    }

    #[test]
    fn veer_rotates_direction_with_height() {
        let mut s = shear();
        s.veer_deg_per_m = 0.1; // 0.1 deg per metre
        // At ref height, direction is the reference bearing (+North).
        let at_ref = s.mean(10.0);
        assert!(at_ref.y.abs() < 1e-6 && at_ref.x > 0.0);
        // 100 m above ref: veered by ~9 deg, so an East (+y) component appears.
        let high = s.mean(110.0);
        assert!(high.y > 0.0, "veer should rotate the wind toward East with height: {:?}", high);
    }

    #[test]
    fn uniform_field_reproduces_windconfig_gust_bit_for_bit() {
        // The legacy path: WindField::from_uniform must draw the same RNG and
        // produce the identical wind vector update_wind produced directly.
        let cfg = WindConfig { steady: Vec3::new(5.0, -2.0, 0.5), intensity: 1.5, time_constant: 0.7 };
        let wf = WindField::from_uniform(cfg);
        let (mut sa, mut sb) = (init_wind(), init_wind());
        let mut ra = Rng::new(99);
        let mut rb = Rng::new(99);
        for _ in 0..500 {
            let (ns_a, wind_a) = update_wind(&cfg, &sa, 0.01, &mut ra);
            sa = ns_a;
            // WindField: mean (=steady, agl irrelevant with no shear) + ambient gust.
            let mean = wf.mean(Vec3::zero(), 20.0);
            let (ns_b, gust) = wf.ambient_gust(&sb, 20.0, 0.01, &mut rb);
            sb = ns_b;
            let wind_b = mean.add(gust);
            assert_eq!(wind_a.x.to_bits(), wind_b.x.to_bits());
            assert_eq!(wind_a.y.to_bits(), wind_b.y.to_bits());
            assert_eq!(wind_a.z.to_bits(), wind_b.z.to_bits());
        }
    }

    #[test]
    fn wind_grid_bilinear_interpolates() {
        let g = WindGrid {
            north0: 0.0, east0: 0.0, spacing: 100.0, rows: 2, cols: 2,
            vectors: vec![Vec3::zero(), Vec3::zero(), Vec3::new(4.0, 0.0, 0.0), Vec3::new(4.0, 0.0, 0.0)],
        };
        // Halfway north between row0 (0) and row1 (4) -> 2.
        assert!((g.sample(50.0, 50.0).x - 2.0).abs() < 1e-9);
        // Edge clamp far south -> row0 value (0).
        assert!(g.sample(-100.0, 0.0).length() < 1e-9);
    }
}
