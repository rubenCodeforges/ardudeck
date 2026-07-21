use std::f64::consts::PI;

/// mulberry32 PRNG with exact 32-bit semantics matching the TS implementation.
pub struct Rng {
    state: i32,
}

impl Rng {
    pub fn new(seed: u32) -> Rng {
        // seed >>> 0 then reinterpreted as i32.
        Rng { state: seed as i32 }
    }

    pub fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b79f5u32 as i32);
        let a = self.state as u32;
        // Math.imul(a ^ a >>> 15, 1 | a)
        let mut t = ((a ^ (a >> 15)) as i32).wrapping_mul((1 | a) as i32) as u32;
        // t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
        let inner = ((t ^ (t >> 7)) as i32).wrapping_mul((61 | t) as i32) as u32;
        t = t.wrapping_add(inner) ^ t;
        (t ^ (t >> 14)) as f64 / 4_294_967_296.0
    }

    pub fn gaussian(&mut self) -> f64 {
        let u1 = f64::max(1e-12, self.next());
        let u2 = self.next();
        (-2.0 * u1.ln()).sqrt() * (2.0 * PI * u2).cos()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deterministic() {
        let (mut a, mut b) = (Rng::new(42), Rng::new(42));
        for _ in 0..100 {
            assert_eq!(a.next().to_bits(), b.next().to_bits());
        }
    }
    #[test]
    fn gaussian_zero_mean() {
        let mut r = Rng::new(7);
        let n = 20000;
        let mut sum = 0.0;
        for _ in 0..n {
            sum += r.gaussian();
        }
        assert!((sum / n as f64).abs() < 0.05);
    }
    #[test]
    fn uniform_in_range() {
        let mut r = Rng::new(1);
        for _ in 0..10000 {
            let v = r.next();
            assert!(v >= 0.0 && v < 1.0);
        }
    }
}
