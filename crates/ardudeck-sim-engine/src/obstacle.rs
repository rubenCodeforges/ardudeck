//! Obstacle-induced turbulence (spec 1.c): the disturbance a building/tree
//! imposes on the local air, as an inviscid potential-flow deflection plus an
//! empirical bluff-body wake (mean deficit + elevated turbulence). Horizontal
//! plane only in phase 3; vertical downwash is a later refinement.
//!
//! All positions are local NED metres relative to home. Nothing is added where
//! there is no obstacle, no wind, or the vehicle is above the rooftop band, so
//! the no-obstacle case is a pure no-op (no RNG draw, spec regression).

use crate::math::Vec3;
use crate::rng::Rng;
use crate::wind::{update_wind, WindConfig, WindState};

/// Linear wake spreading rate (half-width growth per metre downwind).
const K_W: f64 = 0.25;
/// Wake turbulence-intensity multiplier vs ambient (building wakes ~20-30%).
const I_WAKE: f64 = 1.5;
/// Wake gust correlation time (short: buffeting is broadband), seconds.
const WAKE_TAU: f64 = 0.3;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ObstacleShape {
    Cylinder,
    Box,
}

/// One authored obstacle in local NED. `radius` is a cylinder radius or a box
/// half-extent; `height` is the top, metres above the home datum (+up).
#[derive(Debug, Clone)]
pub struct Obstacle {
    pub north: f64,
    pub east: f64,
    pub shape: ObstacleShape,
    pub radius: f64,
    pub height: f64,
}

impl Obstacle {
    /// Effective cylinder radius `a` for the potential term. A box uses its
    /// circumscribed radius so the corner speed-up starts at the box edge.
    fn a(&self) -> f64 {
        match self.shape {
            ObstacleShape::Cylinder => self.radius,
            ObstacleShape::Box => self.radius * std::f64::consts::SQRT_2,
        }
    }

    /// Wake half-width at the downwind face (`b(0)`): the cylinder radius, or the
    /// box half-extent (a box sheds a wider wake from a flat face).
    fn wake_b0(&self) -> f64 {
        match self.shape {
            ObstacleShape::Cylinder => self.radius,
            ObstacleShape::Box => self.radius,
        }
    }

    /// Wake drag coefficient (box wakes are wider/stronger than cylinders).
    fn cd_eff(&self) -> f64 {
        match self.shape {
            ObstacleShape::Cylinder => 0.6,
            ObstacleShape::Box => 0.9,
        }
    }

    /// Air-velocity perturbation (world NED, horizontal) this obstacle adds at the
    /// query point, plus a turbulence-scale contribution for telemetry. `u_ambient`
    /// is the ambient (mean + gust) wind; `ambient_intensity` seeds the wake gust.
    ///
    /// Returns `(du, turb_extra)`. `du` is zero (and no RNG is drawn) when the
    /// vehicle is above the rooftop band, inside the body, or the air is calm.
    #[allow(clippy::too_many_arguments)]
    pub fn perturbation(
        &self,
        qn: f64,
        qe: f64,
        veh_height_above_datum: f64,
        u_ambient: Vec3,
        ambient_intensity: f64,
        wake_state: &mut WindState,
        dt: f64,
        rng: &mut Rng,
    ) -> (Vec3, f64) {
        let a = self.a();
        // Rooftop gate: above the top plus a half-radius transition band the
        // obstacle no longer disturbs the vehicle (it is flying over).
        if veh_height_above_datum >= self.height + 0.5 * a {
            return (Vec3::zero(), 0.0);
        }
        let u_h = Vec3::new(u_ambient.x, u_ambient.y, 0.0);
        let umag = u_h.length();
        if umag < 1e-9 {
            // No freestream direction: potential flow and wake are undefined.
            return (Vec3::zero(), 0.0);
        }
        let uhat = u_h.scale(1.0 / umag);
        // Perpendicular in the horizontal plane (rotate +90 about the down axis).
        let uperp = Vec3::new(-uhat.y, uhat.x, 0.0);
        let dr = Vec3::new(qn - self.north, qe - self.east, 0.0);
        let x_along = dr.dot(uhat); // downwind-positive distance from the centre
        let y_perp = dr.dot(uperp); // cross-wind offset from the wind axis
        let r = (x_along * x_along + y_perp * y_perp).sqrt();
        if r <= a {
            // Inside the structure (a fence exclusion anyway): no perturbation.
            return (Vec3::zero(), 0.0);
        }

        // 1. Inviscid deflection (2-D potential flow past a cylinder).
        let theta = y_perp.atan2(x_along);
        let a2r2 = (a * a) / (r * r);
        let u_r = umag * (1.0 - a2r2) * theta.cos();
        let u_theta = -umag * (1.0 + a2r2) * theta.sin();
        let v_local_x = u_r * theta.cos() - u_theta * theta.sin();
        let v_local_y = u_r * theta.sin() + u_theta * theta.cos();
        let v_ned = uhat.scale(v_local_x).add(uperp.scale(v_local_y));
        let du_pot = v_ned.sub(u_h);

        // 2. Bluff-body wake downwind of the downwind face (x measured from it).
        let x = x_along - a;
        let mut du = du_pot;
        let mut turb_extra = 0.0;
        if x > 0.0 {
            let bx = self.wake_b0() + K_W * x;
            let env_shape = (a / (a + x)) * (-(y_perp / bx).powi(2)).exp();
            let deficit = self.cd_eff() * env_shape;
            // Mean deficit slows the flow along the wind direction.
            du = du.add(uhat.scale(-deficit * umag));
            // Elevated turbulence: an independent OU gust scaled by the wake shape,
            // present only in the lee. Its own short-tau state, deterministic RNG.
            let wake_intensity = I_WAKE * ambient_intensity * env_shape;
            let cfg = WindConfig { steady: Vec3::zero(), intensity: wake_intensity, time_constant: WAKE_TAU };
            let (ns, gust) = update_wind(&cfg, wake_state, dt, rng);
            *wake_state = ns;
            du = du.add(gust);
            turb_extra = I_WAKE * env_shape;
        }
        (du, turb_extra)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wind::init_wind;

    fn cyl() -> Obstacle {
        Obstacle { north: 0.0, east: 0.0, shape: ObstacleShape::Cylinder, radius: 5.0, height: 30.0 }
    }

    /// Sample the potential-only field (below the wake gate, no RNG) at a point,
    /// returning the total local wind vector `u_ambient + du`.
    fn wind_at(o: &Obstacle, qn: f64, qe: f64, u: Vec3) -> Vec3 {
        let mut st = init_wind();
        let mut rng = Rng::new(1);
        let (du, _) = o.perturbation(qn, qe, 1.0, u, 0.0, &mut st, 0.01, &mut rng);
        Vec3::new(u.x, u.y, 0.0).add(du)
    }

    #[test]
    fn shoulder_speed_up_is_about_twice_freestream() {
        let o = cyl();
        let u = Vec3::new(6.0, 0.0, 0.0); // wind toward +North
        // Shoulder: cross-wind, just outside the body (theta = 90 deg, r = a+eps).
        let v = wind_at(&o, 0.0, o.radius + 1e-3, u);
        assert!((v.length() / 6.0 - 2.0).abs() < 0.02, "shoulder speed {} vs ~12", v.length());
    }

    #[test]
    fn upwind_face_is_near_stagnation() {
        let o = cyl();
        let u = Vec3::new(6.0, 0.0, 0.0);
        // Upwind face (theta = 180): -North side, just outside the body.
        let v = wind_at(&o, -(o.radius + 1e-3), 0.0, u);
        assert!(v.length() < 0.05 * 6.0, "upwind should be near stagnation, got {}", v.length());
    }

    #[test]
    fn perturbation_decays_and_vanishes_far_away() {
        let o = cyl();
        let u = Vec3::new(6.0, 0.0, 0.0);
        // Cross-wind at r = 10a: perturbation is ~ a^2/r^2 of freestream (~1%).
        let far = wind_at(&o, 0.0, 10.0 * o.radius, u);
        let du_mag = far.sub(Vec3::new(6.0, 0.0, 0.0)).length();
        assert!(du_mag < 0.02 * 6.0, "far perturbation should vanish, got {du_mag}");
    }

    #[test]
    fn field_is_symmetric_about_the_wind_axis() {
        let o = cyl();
        let u = Vec3::new(6.0, 0.0, 0.0);
        let plus = wind_at(&o, 3.0, 7.0, u);
        let minus = wind_at(&o, 3.0, -7.0, u);
        // Along-wind (North) components equal; cross-wind (East) components mirror.
        assert!((plus.x - minus.x).abs() < 1e-9);
        assert!((plus.y + minus.y).abs() < 1e-9);
    }

    #[test]
    fn wake_reduces_centreline_speed_and_recovers_with_distance() {
        let o = cyl();
        let u = Vec3::new(6.0, 0.0, 0.0);
        // Downwind centreline (y=0), increasing x past the downwind face.
        let near = wind_at(&o, o.radius + 2.0, 0.0, u);
        let far = wind_at(&o, o.radius + 40.0, 0.0, u);
        assert!(near.length() < 6.0, "near lee should be slowed: {}", near.length());
        assert!(far.length() > near.length(), "wake recovers with distance");
        assert!(far.length() <= 6.0 + 1e-9);
    }

    #[test]
    fn wake_deficit_is_gaussian_in_crosswind() {
        let o = cyl();
        let u = Vec3::new(6.0, 0.0, 0.0);
        let x = o.radius + 10.0;
        let on_axis = 6.0 - wind_at(&o, x, 0.0, u).length();
        let off_axis = 6.0 - wind_at(&o, x, 8.0, u).length();
        assert!(on_axis > 0.0, "there is a deficit on the wake axis");
        assert!(off_axis < on_axis, "deficit falls off cross-wind (Gaussian)");
    }

    #[test]
    fn turbulence_present_only_in_the_wake() {
        let o = cyl();
        let u = Vec3::new(6.0, 0.0, 0.0);
        let mut st = init_wind();
        let mut rng = Rng::new(7);
        // Downwind: turbulence elevated.
        let (_d, t_lee) = o.perturbation(o.radius + 5.0, 0.0, 1.0, u, 1.0, &mut st, 0.01, &mut rng);
        assert!(t_lee > 0.0, "lee should have elevated turbulence");
        // Upwind: no wake, no turbulence.
        let (_d2, t_up) = o.perturbation(-(o.radius + 5.0), 0.0, 1.0, u, 1.0, &mut st, 0.01, &mut rng);
        assert_eq!(t_up, 0.0, "no turbulence upwind of the obstacle");
    }

    #[test]
    fn above_rooftop_band_is_inert_no_rng_draw() {
        let o = cyl();
        let u = Vec3::new(6.0, 0.0, 0.0);
        let mut st = init_wind();
        // Two RNGs at the same seed: the inert call must not advance the stream.
        let mut rng = Rng::new(3);
        let mut probe = Rng::new(3);
        // Well above the top + 0.5a band, in what would be the wake footprint.
        let (du, turb) = o.perturbation(o.radius + 5.0, 0.0, 100.0, u, 1.0, &mut st, 0.01, &mut rng);
        assert_eq!(du, Vec3::zero());
        assert_eq!(turb, 0.0);
        assert_eq!(rng.next().to_bits(), probe.next().to_bits(), "no RNG draw when inert");
    }

    #[test]
    fn box_uses_circumscribed_radius_and_stronger_wake() {
        let b = Obstacle { north: 0.0, east: 0.0, shape: ObstacleShape::Box, radius: 5.0, height: 30.0 };
        assert!((b.a() - 5.0 * std::f64::consts::SQRT_2).abs() < 1e-9);
        assert!(b.cd_eff() > Obstacle { north: 0.0, east: 0.0, shape: ObstacleShape::Cylinder, radius: 5.0, height: 30.0 }.cd_eff());
    }
}
