//! Rotor-wake induced-velocity field (spec 1.2) for multi-vehicle shared-world
//! coupling. Each rotor sheds a momentum-theory slipstream column; a vehicle
//! flying below or behind another samples that column as added local air
//! velocity, which raises the affected rotors' `velocity_in` and cuts thrust, so
//! the lower vehicle sinks. This is analytic (tier C): no RNG, no state. A rotor
//! NEVER samples its own wake (self-inclusion double-counts; the engine's own
//! `velocity_in` already carries momentum theory's induced velocity).

use crate::math::Vec3;

/// Wake / proximity tunables. Start values from spec 1.2 (refined against logs in
/// the phase-4 harness). `k_spread` ~ a 6 deg half-angle jet spread; `c_break` ~
/// wake coherent for about 12 rotor diameters; `k_turb` feeds the proximity
/// turbulence bump (spec 1.4). Kept in a struct so they are logged and sweepable.
#[derive(Debug, Clone, Copy)]
pub struct WakeParams {
    pub k_spread: f64,
    pub c_break: f64,
    pub k_turb: f64,
}

impl Default for WakeParams {
    fn default() -> Self {
        WakeParams { k_spread: 0.1, c_break: 12.0, k_turb: 0.15 }
    }
}

/// One rotor's shed-wake source, all world NED. `axis` is the unit wake direction
/// (body +Z rotated to world = down = thrust-reaction direction). `w` is the
/// far-wake slipstream speed (that rotor's `velocity_out` this step). `radius` is
/// the effective disc radius sqrt(effective_prop_area / pi).
#[derive(Debug, Clone, Copy)]
pub struct RotorWake {
    pub origin: Vec3,
    pub axis: Vec3,
    pub w: f64,
    pub radius: f64,
}

/// Axial slipstream speed on the wake axis at downstream distance `s` (spec 1.2):
/// w/2 at the disc (momentum theory's induced velocity v_i) growing to the full
/// far-wake `w`.
fn axial_speed(w: f64, r: f64, s: f64) -> f64 {
    0.5 * w * (1.0 + s / (s * s + r * r).sqrt())
}

/// Momentum-conserving core radius at `s` (contraction R -> R/sqrt(2)) plus the
/// empirical turbulent widening `k_spread * s`.
fn core_radius(w: f64, r: f64, s: f64, k_spread: f64) -> f64 {
    r * (0.5 * w / axial_speed(w, r, s)).sqrt() + k_spread * s
}

/// Induced velocity contributed by one rotor at world point `p` (spec 1.2). World
/// NED. Exactly zero at or above the disc (`s <= 0`) and far outside the tube.
pub fn wake_at(rotor: &RotorWake, p: Vec3, params: &WakeParams) -> Vec3 {
    if rotor.w <= 0.0 || rotor.radius <= 0.0 {
        return Vec3::zero();
    }
    let delta = p.sub(rotor.origin);
    // Axial distance downstream (below the disc, along the wake axis).
    let s = delta.dot(rotor.axis);
    if s <= 0.0 {
        // At or above the disc plane: no downwash here.
        return Vec3::zero();
    }
    let p_perp = delta.sub(rotor.axis.scale(s));
    let rho = p_perp.length(); // radial distance from the wake axis
    let r = rotor.radius;
    let w = rotor.w;

    let axial = axial_speed(w, r, s);
    let r_w = core_radius(w, r, s, params.k_spread);
    // Smooth tube profile: full on the axis, falling off past the core radius.
    let radial = (-(rho / r_w).powi(2)).exp();
    // Wake mixes out after ~c_break rotor diameters.
    let breakup = (-s / (params.c_break * 2.0 * r)).exp();
    rotor.axis.scale(axial * radial * breakup)
}

/// A superposed wake field over a set of rotor sources (spec 1.1). Empty sources
/// => the zero field, so the single-vehicle path is untouched.
#[derive(Debug, Clone)]
pub struct SuperposedWake {
    pub sources: Vec<RotorWake>,
    pub params: WakeParams,
}

impl SuperposedWake {
    pub fn new(sources: Vec<RotorWake>, params: WakeParams) -> SuperposedWake {
        SuperposedWake { sources, params }
    }

    pub fn is_empty(&self) -> bool {
        self.sources.is_empty()
    }

    /// World-NED wake velocity at `p`, summed over every source rotor.
    pub fn sample(&self, p: Vec3) -> Vec3 {
        let mut v = Vec3::zero();
        for r in &self.sources {
            v = v.add(wake_at(r, p, &self.params));
        }
        v
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    fn rotor(w: f64, r: f64) -> RotorWake {
        // Level rotor at the origin, wake pointing straight down (world +Z).
        RotorWake { origin: Vec3::zero(), axis: Vec3::new(0.0, 0.0, 1.0), w, radius: r }
    }

    #[test]
    fn near_field_axial_is_half_w() {
        // At the disc (s -> 0+) the on-axis induced velocity is w/2 = v_i.
        let (w, r) = (12.0, 0.3);
        let rk = rotor(w, r);
        let p = Vec3::new(0.0, 0.0, 1e-4); // just below the disc, on axis
        let v = wake_at(&rk, p, &WakeParams::default());
        assert!((v.z - 0.5 * w).abs() < 1e-2, "near-field axial {} vs {}", v.z, 0.5 * w);
        assert!(v.x.abs() < 1e-12 && v.y.abs() < 1e-12, "on-axis wake is purely axial");
    }

    #[test]
    fn far_field_axial_law_approaches_w() {
        // The axial slipstream LAW is w/2 at the disc and grows to the fully
        // developed far-wake w (this is the term before turbulent breakup).
        let (w, r) = (12.0, 0.3);
        assert!((axial_speed(w, r, 0.0) - 0.5 * w).abs() < 1e-9, "disc value is w/2");
        assert!(axial_speed(w, r, 100.0 * r) > 0.98 * w, "law approaches w far downstream");
        // The SAMPLED column (axial law times turbulent breakup) peaks at a strong
        // fraction of w a fraction of a radius below the disc, then mixes out.
        let rk = rotor(w, r);
        let peak = (1..60)
            .map(|i| wake_at(&rk, Vec3::new(0.0, 0.0, 0.1 * i as f64), &WakeParams::default()).z)
            .fold(0.0_f64, f64::max);
        assert!(peak > 0.8 * w, "peak downwash {peak} should be a strong fraction of w={w}");
    }

    #[test]
    fn contraction_is_momentum_conserving_in_the_core() {
        // With k_spread = 0 (ideal core) axial(s) * area(core_radius(s)) is
        // constant: the slipstream contracts as it speeds up. This is the R ->
        // R/sqrt(2) momentum-conservation law before turbulent decay.
        let (w, r) = (10.0, 0.27);
        let flux = |s: f64| {
            let a = axial_speed(w, r, s);
            let rw = core_radius(w, r, s, 0.0);
            a * PI * rw * rw
        };
        let ref_flux = flux(1e-6);
        for s in [0.05, 0.2, 0.6, 1.5, 3.0] {
            let f = flux(s);
            assert!((f / ref_flux - 1.0).abs() < 1e-6, "core flux drifted at s={s}: {f} vs {ref_flux}");
        }
    }

    #[test]
    fn no_action_above_the_disc() {
        // A point above the disc (s < 0) feels nothing: no spurious lift.
        let rk = rotor(12.0, 0.3);
        let above = wake_at(&rk, Vec3::new(0.0, 0.0, -1.0), &WakeParams::default());
        assert_eq!(above, Vec3::zero());
    }

    #[test]
    fn no_action_outside_the_tube() {
        // Beside the column (rho >> r_w) the wake is negligible.
        let rk = rotor(12.0, 0.3);
        let beside = wake_at(&rk, Vec3::new(5.0, 0.0, 0.5), &WakeParams::default());
        assert!(beside.length() < 1e-6, "outside the tube must be ~0, got {}", beside.length());
    }

    #[test]
    fn breakup_decays_far_downstream() {
        // Past ~c_break diameters the coherent jet has mixed out: the far-far
        // field is weaker than the mid field.
        let (w, r) = (12.0, 0.3);
        let rk = rotor(w, r);
        let mid = wake_at(&rk, Vec3::new(0.0, 0.0, 3.0), &WakeParams::default()).z;
        let far = wake_at(&rk, Vec3::new(0.0, 0.0, 40.0), &WakeParams::default()).z;
        assert!(far < mid, "wake should mix out downstream: far {far} vs mid {mid}");
        assert!(far < 0.2 * w, "far past breakup should be well below w");
    }

    #[test]
    fn superposition_is_linear() {
        // Two identical rotors over the same point give exactly twice one rotor.
        let (w, r) = (11.0, 0.28);
        let one = SuperposedWake::new(vec![rotor(w, r)], WakeParams::default());
        let two = SuperposedWake::new(vec![rotor(w, r), rotor(w, r)], WakeParams::default());
        let p = Vec3::new(0.0, 0.0, 0.8);
        let a = one.sample(p);
        let b = two.sample(p);
        assert!((b.z - 2.0 * a.z).abs() < 1e-12, "superposition must be linear: {} vs {}", b.z, 2.0 * a.z);
    }

    #[test]
    fn empty_field_is_zero() {
        let f = SuperposedWake::new(Vec::new(), WakeParams::default());
        assert!(f.is_empty());
        assert_eq!(f.sample(Vec3::new(1.0, 2.0, 3.0)), Vec3::zero());
    }

    #[test]
    fn monotonic_dose_response_over_the_near_field() {
        // On-axis sampled downwash rises from ~w/2 at the disc across the near
        // field (before turbulent breakup takes over and mixes it out downstream).
        let (w, r) = (12.0, 0.3);
        let rk = rotor(w, r);
        let mut prev = 0.0;
        for s in [0.01, 0.1, 0.3, 0.5] {
            let v = wake_at(&rk, Vec3::new(0.0, 0.0, s), &WakeParams::default()).z;
            assert!(v >= prev - 1e-9, "downwash should rise over the near field: {v} < {prev} at s={s}");
            prev = v;
        }
        // Near the disc it starts at ~w/2 (momentum theory's induced velocity).
        let disc = wake_at(&rk, Vec3::new(0.0, 0.0, 0.01), &WakeParams::default()).z;
        assert!((disc - 0.5 * w).abs() < 0.5, "near-disc value ~ w/2, got {disc}");
    }
}
