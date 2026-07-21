//! Vehicle-vehicle collision detection and contact response (spec 1.5). Each
//! vehicle is a bounding sphere (arm span + a prop radius). Contact is a stable
//! penalty spring plus a closing-velocity damper, resolved centrally so the two
//! sides get exactly equal-and-opposite forces (Newton's third law, momentum
//! conserved). Contact acts on translation only; angular impulse from off-centre
//! hits is a tier-C follow-up.

use crate::math::Vec3;

/// Contact tunables. `k_contact` is sized so a deep overlap produces a few g of
/// separating acceleration on a heavy vehicle; `c_contact` gives near-critical
/// damping at the physics substep so contact does not ring. `separation_hysteresis`
/// (m) keeps a sustained contact from spamming enter/exit events.
#[derive(Debug, Clone, Copy)]
pub struct ContactParams {
    pub k_contact: f64,
    pub c_contact: f64,
    pub separation_hysteresis: f64,
}

impl Default for ContactParams {
    fn default() -> Self {
        ContactParams { k_contact: 8000.0, c_contact: 400.0, separation_hysteresis: 0.25 }
    }
}

/// A rigid body for the broad/narrow phase: world position, world velocity and
/// bounding radius.
#[derive(Debug, Clone, Copy)]
pub struct ContactBody {
    pub position: Vec3,
    pub velocity: Vec3,
    pub r_bound: f64,
}

/// A vehicle-vehicle contact event for the WS stream (proximity-ring flash, fleet
/// alert). Indices are into the body slice; the caller maps them to vehicle ids.
#[derive(Debug, Clone, Copy)]
pub struct Contact {
    pub a: usize,
    pub b: usize,
    /// Closing speed along the contact normal at detection (m/s, >= 0).
    pub closing_speed: f64,
    /// Penetration depth (m).
    pub depth: f64,
    /// Contact point, world NED (midway along the overlap).
    pub position: Vec3,
}

/// Narrow-phase test for one ordered pair `(a, b)`. `None` when the spheres do
/// not overlap (or are coincident). Returns the force to apply to `b` (a gets the
/// negation), the contact and the unit normal a->b.
fn pair(a: &ContactBody, b: &ContactBody, params: &ContactParams, ia: usize, ib: usize) -> Option<(Vec3, Contact)> {
    let d = b.position.sub(a.position);
    let dist = d.length();
    let sum = a.r_bound + b.r_bound;
    if dist >= sum || dist < 1e-9 {
        return None;
    }
    let n = d.scale(1.0 / dist); // unit normal a -> b
    let depth = sum - dist;
    // Relative normal velocity: >0 separating, <0 closing.
    let v_rel_n = b.velocity.sub(a.velocity).dot(n);
    // Spring pushes apart; the damper removes approach velocity but only while
    // closing (min(v_rel_n, 0)), so it never sucks a separating pair back.
    let f_mag = params.k_contact * depth - params.c_contact * v_rel_n.min(0.0);
    let f_on_b = n.scale(f_mag);
    // Contact point: from a's surface toward b, midway through the overlap.
    let position = a.position.add(n.scale(a.r_bound - 0.5 * depth));
    let contact = Contact {
        a: ia,
        b: ib,
        closing_speed: (-v_rel_n).max(0.0),
        depth,
        position,
    };
    Some((f_on_b, contact))
}

/// All-pairs contact resolution over `bodies`. Returns per-body accumulated world
/// contact force (index-aligned with `bodies`) and the list of overlapping pairs.
/// Forces are equal-and-opposite per pair, so total linear momentum is conserved.
pub fn resolve(bodies: &[ContactBody], params: &ContactParams) -> (Vec<Vec3>, Vec<Contact>) {
    let mut forces = vec![Vec3::zero(); bodies.len()];
    let mut contacts = Vec::new();
    for i in 0..bodies.len() {
        for j in (i + 1)..bodies.len() {
            if let Some((f_on_b, contact)) = pair(&bodies[i], &bodies[j], params, i, j) {
                forces[i] = forces[i].sub(f_on_b); // -F on a
                forces[j] = forces[j].add(f_on_b); // +F on b
                contacts.push(contact);
            }
        }
    }
    (forces, contacts)
}

/// Whether a pair whose centres are `dist` apart with bounds `ra + rb` should be
/// considered "still in contact" for edge-triggering. Uses the separation
/// hysteresis so a resting/sustained contact does not spam enter/exit events.
pub fn still_in_contact(dist: f64, sum_bounds: f64, params: &ContactParams) -> bool {
    dist < sum_bounds + params.separation_hysteresis
}

#[cfg(test)]
mod tests {
    use super::*;

    fn body(pos: Vec3, vel: Vec3, r: f64) -> ContactBody {
        ContactBody { position: pos, velocity: vel, r_bound: r }
    }

    #[test]
    fn no_contact_when_apart() {
        let bodies = [
            body(Vec3::zero(), Vec3::zero(), 1.0),
            body(Vec3::new(5.0, 0.0, 0.0), Vec3::zero(), 1.0),
        ];
        let (forces, contacts) = resolve(&bodies, &ContactParams::default());
        assert!(contacts.is_empty());
        assert_eq!(forces[0], Vec3::zero());
        assert_eq!(forces[1], Vec3::zero());
    }

    #[test]
    fn overlap_fires_event_with_normal_a_to_b() {
        // Two r=1 spheres 1.5 apart along +x overlap by 0.5; normal points a->b.
        let bodies = [
            body(Vec3::zero(), Vec3::new(1.0, 0.0, 0.0), 1.0),
            body(Vec3::new(1.5, 0.0, 0.0), Vec3::new(-1.0, 0.0, 0.0), 1.0),
        ];
        let (forces, contacts) = resolve(&bodies, &ContactParams::default());
        assert_eq!(contacts.len(), 1);
        let c = contacts[0];
        assert!((c.depth - 0.5).abs() < 1e-9, "depth {}", c.depth);
        // Closing at 2 m/s (1 toward each other).
        assert!((c.closing_speed - 2.0).abs() < 1e-9, "closing {}", c.closing_speed);
        // Force on b is +x (pushed away from a); on a it is -x.
        assert!(forces[1].x > 0.0 && forces[0].x < 0.0);
        // Equal and opposite.
        assert!((forces[0].x + forces[1].x).abs() < 1e-9);
        assert!(c.position.x > 0.0 && c.position.x < 1.5, "contact point between centres");
    }

    #[test]
    fn forces_are_equal_and_opposite_for_every_pair() {
        // Three overlapping bodies: the net contact force over all bodies is zero
        // (internal forces cancel), so total momentum is conserved.
        let bodies = [
            body(Vec3::new(0.0, 0.0, 0.0), Vec3::zero(), 1.0),
            body(Vec3::new(1.2, 0.0, 0.0), Vec3::zero(), 1.0),
            body(Vec3::new(0.6, 1.0, 0.0), Vec3::zero(), 1.0),
        ];
        let (forces, _c) = resolve(&bodies, &ContactParams::default());
        let mut net = Vec3::zero();
        for f in &forces {
            net = net.add(*f);
        }
        assert!(net.length() < 1e-9, "internal contact forces must sum to zero, got {:?}", net);
    }

    #[test]
    fn damper_only_acts_while_closing() {
        let params = ContactParams::default();
        // Same geometry, once closing and once separating at the same speed.
        let closing = [
            body(Vec3::zero(), Vec3::zero(), 1.0),
            body(Vec3::new(1.5, 0.0, 0.0), Vec3::new(-2.0, 0.0, 0.0), 1.0),
        ];
        let separating = [
            body(Vec3::zero(), Vec3::zero(), 1.0),
            body(Vec3::new(1.5, 0.0, 0.0), Vec3::new(2.0, 0.0, 0.0), 1.0),
        ];
        let fc = resolve(&closing, &params).0[1].x;
        let fs = resolve(&separating, &params).0[1].x;
        // Closing adds the damper push; separating is spring-only (smaller), never
        // an attractive pull.
        assert!(fc > fs, "closing force {fc} must exceed separating {fs}");
        assert!(fs > 0.0, "separating pair is still pushed apart by the spring, not pulled");
    }

    #[test]
    fn head_on_pair_conserves_momentum_and_does_not_tunnel() {
        // Two unequal masses close head-on; integrating the contact force must
        // conserve total linear momentum (equal-and-opposite impulses) and never
        // let them pass through each other (spec 3.1 cases 6/7). Gravity is out of
        // this 1-D test, so it is pure contact dynamics.
        let params = ContactParams::default();
        let (ma, mb) = (2.0, 3.0);
        let (ra, rb) = (1.2, 1.2);
        let dt = 1.0 / 2000.0;
        let mut pa = Vec3::new(-1.5, 0.0, 0.0);
        let mut pb = Vec3::new(1.5, 0.0, 0.0);
        let mut va = Vec3::new(1.0, 0.0, 0.0);
        let mut vb = Vec3::new(-1.0, 0.0, 0.0);
        let p0 = ma * va.x + mb * vb.x;
        let mut min_dist = f64::MAX;
        for _ in 0..8000 {
            let bodies = [body(pa, va, ra), body(pb, vb, rb)];
            let (f, _c) = resolve(&bodies, &params);
            va = va.add(f[0].scale(dt / ma));
            vb = vb.add(f[1].scale(dt / mb));
            pa = pa.add(va.scale(dt));
            pb = pb.add(vb.scale(dt));
            min_dist = min_dist.min(pb.sub(pa).length());
        }
        let p1 = ma * va.x + mb * vb.x;
        assert!((p1 - p0).abs() < 1e-6, "momentum must be conserved: {p0} -> {p1}");
        assert!(min_dist > 0.0, "vehicles must not tunnel through each other, min {min_dist}");
        // No runaway ringing: they end up no longer closing (v_rel_n >= ~0).
        let d = pb.sub(pa);
        let n = d.scale(1.0 / d.length());
        let v_rel_n = vb.sub(va).dot(n);
        assert!(v_rel_n > -1e-3, "pair should stop closing after contact, v_rel_n {v_rel_n}");
    }

    #[test]
    fn hysteresis_keeps_a_resting_contact_latched() {
        let params = ContactParams::default();
        let sum = 2.0;
        // Just separated past the bound but within the hysteresis band: latched.
        assert!(still_in_contact(sum + 0.1, sum, &params));
        // Well clear: released.
        assert!(!still_in_contact(sum + 1.0, sum, &params));
    }
}
