use crate::math::Vec3;

#[derive(Debug, Clone, Copy)]
pub struct MotorMount {
    pub position: Vec3,
    pub yaw_factor: f64,
}

fn spec_to_mount(angle_deg: f64, yaw_factor: f64, radius: f64) -> MotorMount {
    let rad = angle_deg.to_radians();
    MotorMount {
        position: Vec3::new(radius * rad.cos(), radius * rad.sin(), 0.0),
        yaw_factor,
    }
}

pub fn frame_geometry(num_motors: u32, diagonal_size: f64) -> Vec<MotorMount> {
    // ArduPilot SIM_Motor::setup_params (lines 208-210) places each motor at
    // position = (cos(angle), sin(angle)) * diagonal_size (the FULL value, not
    // half). Our previous diagonal_size/2 halved every moment arm, so roll/pitch
    // authority was 2x too low versus stock SITL. Use the full diagonal_size.
    let radius = diagonal_size;
    // (angle_deg, yaw_factor) in ArduPilot motor-output order (MOT_1..MOT_N),
    // copied verbatim from ArduPilot SITL SIM_Frame.cpp so the engine's physical
    // motor layout matches the one ArduPilot's mixer commands. yaw_factor: CCW=+1,
    // CW=-1 (ArduPilot's AP_MOTORS_MATRIX_YAW_FACTOR_CCW/CW). Any mismatch here
    // sends ArduPilot's per-motor commands to the wrong physical motors and the
    // attitude controller diverges. Do not "simplify" these tables.
    let specs: Vec<(f64, f64)> = match num_motors {
        // Quad X: MOT_1(45,CCW) MOT_2(-135,CCW) MOT_3(-45,CW) MOT_4(135,CW)
        4 => vec![(45.0, 1.0), (-135.0, 1.0), (-45.0, -1.0), (135.0, -1.0)],
        // Hexa X: 0/CW 180/CCW -120/CW 60/CCW -60/CCW 120/CW
        6 => vec![
            (0.0, -1.0),
            (180.0, 1.0),
            (-120.0, -1.0),
            (60.0, 1.0),
            (-60.0, 1.0),
            (120.0, -1.0),
        ],
        // Octa: 0/CW 180/CW 45/CCW 135/CCW -45/CCW -135/CCW -90/CW 90/CW
        8 => vec![
            (0.0, -1.0),
            (180.0, -1.0),
            (45.0, 1.0),
            (135.0, 1.0),
            (-45.0, 1.0),
            (-135.0, 1.0),
            (-90.0, -1.0),
            (90.0, -1.0),
        ],
        n => (0..n)
            .map(|i| {
                let angle_deg = (360.0 / n as f64) * i as f64 + 360.0 / (2.0 * n as f64);
                let yaw_factor = if i % 2 == 0 { 1.0 } else { -1.0 };
                (angle_deg, yaw_factor)
            })
            .collect(),
    };
    specs
        .into_iter()
        .map(|(a, y)| spec_to_mount(a, y, radius))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn motors_on_arm_radius_circle() {
        for (n, diag) in [(4u32, 0.4f64), (6, 0.65), (8, 1.325)] {
            let m = frame_geometry(n, diag);
            assert_eq!(m.len() as u32, n);
            for mount in &m {
                let r = (mount.position.x.powi(2) + mount.position.y.powi(2)).sqrt();
                // Motor arm radius equals the full diagonal_size (ArduPilot).
                assert!((r - diag).abs() < 1e-6);
                assert_eq!(mount.position.z, 0.0);
            }
        }
    }
    #[test]
    fn balanced_yaw_factors() {
        for n in [4u32, 6, 8] {
            let sum: f64 = frame_geometry(n, 1.0).iter().map(|m| m.yaw_factor).sum();
            assert_eq!(sum, 0.0);
        }
    }
    #[test]
    fn geometrically_centered() {
        for n in [4u32, 6, 8] {
            let m = frame_geometry(n, 1.0);
            let sx: f64 = m.iter().map(|x| x.position.x).sum();
            let sy: f64 = m.iter().map(|x| x.position.y).sum();
            assert!(sx.abs() < 1e-9 && sy.abs() < 1e-9);
        }
    }
}
