use std::f64::consts::FRAC_PI_2;

const EPS: f64 = 1e-12;

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub fn new(x: f64, y: f64, z: f64) -> Vec3 {
        Vec3 { x, y, z }
    }

    pub fn zero() -> Vec3 {
        Vec3 { x: 0.0, y: 0.0, z: 0.0 }
    }

    pub fn add(self, b: Vec3) -> Vec3 {
        Vec3::new(self.x + b.x, self.y + b.y, self.z + b.z)
    }

    pub fn sub(self, b: Vec3) -> Vec3 {
        Vec3::new(self.x - b.x, self.y - b.y, self.z - b.z)
    }

    pub fn scale(self, s: f64) -> Vec3 {
        Vec3::new(self.x * s, self.y * s, self.z * s)
    }

    pub fn dot(self, b: Vec3) -> f64 {
        self.x * b.x + self.y * b.y + self.z * b.z
    }

    pub fn cross(self, b: Vec3) -> Vec3 {
        Vec3::new(
            self.y * b.z - self.z * b.y,
            self.z * b.x - self.x * b.z,
            self.x * b.y - self.y * b.x,
        )
    }

    pub fn length(self) -> f64 {
        self.dot(self).sqrt()
    }

    pub fn normalize(self) -> Vec3 {
        let len = self.length();
        if len < EPS {
            Vec3::zero()
        } else {
            self.scale(1.0 / len)
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Quat {
    pub w: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Quat {
    pub fn identity() -> Quat {
        Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 }
    }

    pub fn conjugate(self) -> Quat {
        Quat { w: self.w, x: -self.x, y: -self.y, z: -self.z }
    }

    pub fn multiply(self, b: Quat) -> Quat {
        let a = self;
        Quat {
            w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
            x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
            y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
            z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
        }
    }

    pub fn normalize(self) -> Quat {
        let n = (self.w * self.w + self.x * self.x + self.y * self.y + self.z * self.z).sqrt();
        if n < EPS {
            Quat::identity()
        } else {
            Quat { w: self.w / n, x: self.x / n, y: self.y / n, z: self.z / n }
        }
    }

    pub fn rotate_body_to_world(self, v: Vec3) -> Vec3 {
        let q = self;
        let tx = 2.0 * (q.y * v.z - q.z * v.y);
        let ty = 2.0 * (q.z * v.x - q.x * v.z);
        let tz = 2.0 * (q.x * v.y - q.y * v.x);
        Vec3::new(
            v.x + q.w * tx + (q.y * tz - q.z * ty),
            v.y + q.w * ty + (q.z * tx - q.x * tz),
            v.z + q.w * tz + (q.x * ty - q.y * tx),
        )
    }

    pub fn rotate_world_to_body(self, v: Vec3) -> Vec3 {
        self.conjugate().rotate_body_to_world(v)
    }

    pub fn integrate(self, omega: Vec3, dt: f64) -> Quat {
        let q = self;
        let wq = Quat { w: 0.0, x: omega.x, y: omega.y, z: omega.z };
        let qd = q.multiply(wq);
        let next = Quat {
            w: q.w + 0.5 * qd.w * dt,
            x: q.x + 0.5 * qd.x * dt,
            y: q.y + 0.5 * qd.y * dt,
            z: q.z + 0.5 * qd.z * dt,
        };
        next.normalize()
    }

    pub fn to_euler(self) -> (f64, f64, f64) {
        let q = self;
        let sinr = 2.0 * (q.w * q.x + q.y * q.z);
        let cosr = 1.0 - 2.0 * (q.x * q.x + q.y * q.y);
        let roll = sinr.atan2(cosr);
        let sinp = 2.0 * (q.w * q.y - q.z * q.x);
        let pitch = if sinp.abs() >= 1.0 {
            sinp.signum() * FRAC_PI_2
        } else {
            sinp.asin()
        };
        let siny = 2.0 * (q.w * q.z + q.x * q.y);
        let cosy = 1.0 - 2.0 * (q.y * q.y + q.z * q.z);
        let yaw = siny.atan2(cosy);
        (roll, pitch, yaw)
    }

    pub fn from_euler(roll: f64, pitch: f64, yaw: f64) -> Quat {
        let cr = (roll * 0.5).cos();
        let sr = (roll * 0.5).sin();
        let cp = (pitch * 0.5).cos();
        let sp = (pitch * 0.5).sin();
        let cy = (yaw * 0.5).cos();
        let sy = (yaw * 0.5).sin();
        Quat {
            w: cr * cp * cy + sr * sp * sy,
            x: sr * cp * cy - cr * sp * sy,
            y: cr * sp * cy + sr * cp * sy,
            z: cr * cp * sy - sr * sp * cy,
        }
        .normalize()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn close(a: f64, b: f64, eps: f64) {
        assert!((a - b).abs() < eps, "{} vs {}", a, b);
    }

    #[test]
    fn identity_rotation_unchanged() {
        let r = Quat::identity().rotate_body_to_world(Vec3::new(1.0, 2.0, 3.0));
        close(r.x, 1.0, 1e-6);
        close(r.y, 2.0, 1e-6);
        close(r.z, 3.0, 1e-6);
    }
    #[test]
    fn yaw90_maps_x_to_y() {
        let q = Quat::from_euler(0.0, 0.0, std::f64::consts::FRAC_PI_2);
        let r = q.rotate_body_to_world(Vec3::new(1.0, 0.0, 0.0));
        close(r.x, 0.0, 1e-6);
        close(r.y, 1.0, 1e-6);
        close(r.z, 0.0, 1e-6);
    }
    #[test]
    fn euler_round_trips() {
        let (roll, pitch, yaw) = Quat::from_euler(0.3, -0.2, 1.1).to_euler();
        close(roll, 0.3, 1e-6);
        close(pitch, -0.2, 1e-6);
        close(yaw, 1.1, 1e-6);
    }
    #[test]
    fn integration_stays_normalized() {
        let mut q = Quat::identity();
        for _ in 0..1000 {
            q = q.integrate(Vec3::new(0.5, -0.3, 0.8), 0.0025);
        }
        let n = (q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z).sqrt();
        close(n, 1.0, 1e-9);
    }
    #[test]
    fn normalize_zero_is_identity() {
        let q = Quat { w: 0.0, x: 0.0, y: 0.0, z: 0.0 }.normalize();
        assert_eq!((q.w, q.x, q.y, q.z), (1.0, 0.0, 0.0, 0.0));
    }
}
