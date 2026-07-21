use crate::copter::VehicleState;
use crate::math::Vec3;
use crate::rng::Rng;

#[derive(Debug, Clone, Copy)]
pub struct SensorNoiseConfig {
    pub gyro_noise: f64,
    pub accel_noise: f64,
    pub gyro_bias: Vec3,
    pub accel_bias: Vec3,
}

pub const NO_SENSOR_NOISE: SensorNoiseConfig = SensorNoiseConfig {
    gyro_noise: 0.0,
    accel_noise: 0.0,
    gyro_bias: Vec3 { x: 0.0, y: 0.0, z: 0.0 },
    accel_bias: Vec3 { x: 0.0, y: 0.0, z: 0.0 },
};

fn noisy(v: Vec3, stddev: f64, bias: Vec3, rng: &mut Rng) -> Vec3 {
    let base = v.add(bias);
    if stddev > 0.0 {
        base.add(Vec3::new(
            stddev * rng.gaussian(),
            stddev * rng.gaussian(),
            stddev * rng.gaussian(),
        ))
    } else {
        base
    }
}

pub fn apply_sensor_noise(
    state: &VehicleState,
    cfg: &SensorNoiseConfig,
    rng: &mut Rng,
) -> VehicleState {
    let mut out = *state;
    out.angular_velocity = noisy(state.angular_velocity, cfg.gyro_noise, cfg.gyro_bias, rng);
    out.accel_body = noisy(state.accel_body, cfg.accel_noise, cfg.accel_bias, rng);
    out
}

#[cfg(test)]
mod sensor_tests {
    use super::*;
    use crate::copter::initial_state;
    use crate::math::Vec3;
    use crate::rng::Rng;

    #[test]
    fn applied_bias_exactly() {
        let cfg = SensorNoiseConfig {
            gyro_noise: 0.0,
            accel_noise: 0.0,
            gyro_bias: Vec3::new(0.1, 0.0, 0.0),
            accel_bias: Vec3::zero(),
        };
        let out = apply_sensor_noise(&initial_state(), &cfg, &mut Rng::new(1));
        assert!((out.angular_velocity.x - 0.1).abs() < 1e-12);
        assert_eq!(out.angular_velocity.y, 0.0);
        assert_eq!(out.angular_velocity.z, 0.0);
    }

    #[test]
    fn no_noise_untouched() {
        let mut s = initial_state();
        s.angular_velocity = Vec3::new(0.2, -0.3, 0.4);
        s.accel_body = Vec3::new(0.0, 0.0, -9.8);
        let out = apply_sensor_noise(&s, &NO_SENSOR_NOISE, &mut Rng::new(9));
        assert_eq!(out.angular_velocity, s.angular_velocity);
        assert_eq!(out.accel_body, s.accel_body);
    }
}
