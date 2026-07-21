//! SIM_JSON FDM wire protocol: servo-packet parse + state serialize.
//!
//! SITL is the UDP client: it sends a 40-byte little-endian `servo_packet` each
//! physics frame and expects a newline-terminated JSON line of vehicle state in
//! return. Reference: ArduPilot/libraries/SITL/SIM_JSON.cpp.

use crate::copter::VehicleState;
use serde::Serialize;

/// Magic value at the head of every servo packet.
pub const SERVO_PACKET_MAGIC: u16 = 18458;
/// Number of PWM channels in a servo packet.
pub const NUM_CHANNELS: usize = 16;
/// Bytes: magic(2) + frame_rate(2) + frame_count(4) + pwm[16](32) = 40.
pub const SERVO_PACKET_BYTES: usize = 2 + 2 + 4 + NUM_CHANNELS * 2;

#[derive(Debug, Clone, Copy)]
pub struct ServoPacket {
    pub magic: u16,
    pub frame_rate: u16,
    pub frame_count: u32,
    pub pwm: [u16; NUM_CHANNELS],
}

/// Parse a servo packet. Returns None if the buffer is malformed.
pub fn parse_servo_packet(buf: &[u8]) -> Option<ServoPacket> {
    if buf.len() < SERVO_PACKET_BYTES {
        return None;
    }
    let magic = u16::from_le_bytes([buf[0], buf[1]]);
    if magic != SERVO_PACKET_MAGIC {
        return None;
    }
    let frame_rate = u16::from_le_bytes([buf[2], buf[3]]);
    let frame_count = u32::from_le_bytes([buf[4], buf[5], buf[6], buf[7]]);
    let mut pwm = [0u16; NUM_CHANNELS];
    for (i, slot) in pwm.iter_mut().enumerate() {
        let o = 8 + i * 2;
        *slot = u16::from_le_bytes([buf[o], buf[o + 1]]);
    }
    Some(ServoPacket {
        magic,
        frame_rate,
        frame_count,
        pwm,
    })
}

/// Build a servo packet buffer (used by tests and any local SITL stand-in).
pub fn encode_servo_packet(frame_rate: u16, frame_count: u32, pwm: &[u16]) -> Vec<u8> {
    let mut buf = vec![0u8; SERVO_PACKET_BYTES];
    buf[0..2].copy_from_slice(&SERVO_PACKET_MAGIC.to_le_bytes());
    buf[2..4].copy_from_slice(&frame_rate.to_le_bytes());
    buf[4..8].copy_from_slice(&frame_count.to_le_bytes());
    for i in 0..NUM_CHANNELS {
        let v = pwm.get(i).copied().unwrap_or(0);
        let o = 8 + i * 2;
        buf[o..o + 2].copy_from_slice(&v.to_le_bytes());
    }
    buf
}

/// Coerce a non-finite number to 0 (matches the TS `Number.isFinite` guard).
fn f(n: f64) -> f64 {
    if n.is_finite() {
        n
    } else {
        0.0
    }
}

#[derive(Serialize)]
struct Imu {
    gyro: [f64; 3],
    accel_body: [f64; 3],
}

/// Optional battery telemetry SITL's SIM_JSON backend accepts. When present,
/// the firmware's battery monitor reads these instead of SITL's internal model,
/// so the reported voltage reflects the engine's real pack (e.g. a 14S sag).
#[derive(Serialize)]
struct Battery {
    voltage: f64,
    current: f64,
}

/// SIM_JSON parses by key name, so field order is not significant, but we keep
/// the core fields first for readability. `battery` is omitted when absent.
#[derive(Serialize)]
struct StatePayload {
    timestamp: f64,
    imu: Imu,
    position: [f64; 3],
    quaternion: [f64; 4],
    velocity: [f64; 3],
    #[serde(skip_serializing_if = "Option::is_none")]
    battery: Option<Battery>,
}

/// Serialize vehicle state into the JSON line SITL parses: a leading newline,
/// the compact JSON object, and a trailing newline. Non-finite -> 0.
/// `battery` is `Some((voltage, current))` when the vehicle models a pack.
pub fn serialize_state(state: &VehicleState, battery: Option<(f64, f64)>) -> String {
    let payload = StatePayload {
        battery: battery.map(|(v, c)| Battery {
            voltage: f(v),
            current: f(c),
        }),
        timestamp: f(state.timestamp),
        imu: Imu {
            gyro: [
                f(state.angular_velocity.x),
                f(state.angular_velocity.y),
                f(state.angular_velocity.z),
            ],
            accel_body: [
                f(state.accel_body.x),
                f(state.accel_body.y),
                f(state.accel_body.z),
            ],
        },
        position: [f(state.position.x), f(state.position.y), f(state.position.z)],
        quaternion: [
            f(state.attitude.w),
            f(state.attitude.x),
            f(state.attitude.y),
            f(state.attitude.z),
        ],
        velocity: [f(state.velocity.x), f(state.velocity.y), f(state.velocity.z)],
    };
    format!("\n{}\n", serde_json::to_string(&payload).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::copter::VehicleState;
    use crate::math::{Quat, Vec3};

    #[test]
    fn round_trips_servo_packet() {
        let pwm: Vec<u16> = (0..16).map(|i| 1000 + i * 10).collect();
        let buf = encode_servo_packet(1000, 42, &pwm);
        assert_eq!(buf.len(), 40);
        let p = parse_servo_packet(&buf).unwrap();
        assert_eq!(p.magic, 18458);
        assert_eq!(p.frame_rate, 1000);
        assert_eq!(p.frame_count, 42);
        assert_eq!(&p.pwm[..], &pwm[..]);
    }

    #[test]
    fn rejects_wrong_magic() {
        let mut buf = encode_servo_packet(400, 1, &[1500u16; 16]);
        buf[0..2].copy_from_slice(&1234u16.to_le_bytes());
        assert!(parse_servo_packet(&buf).is_none());
    }

    #[test]
    fn rejects_too_short() {
        assert!(parse_servo_packet(&[0u8; 10]).is_none());
    }

    #[test]
    fn serializes_state_with_required_keys() {
        let mut s = VehicleState::default_zero();
        s.position = Vec3::new(1.0, 2.0, -3.0);
        s.velocity = Vec3::new(0.1, 0.2, -0.3);
        s.angular_velocity = Vec3::new(0.01, 0.02, 0.03);
        s.accel_body = Vec3::new(0.0, 0.0, -9.8);
        s.attitude = Quat::identity();
        s.timestamp = 1.5;
        let json = serialize_state(&s, None);
        assert!(json.starts_with('\n') && json.ends_with('\n'));
        let v: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(v["timestamp"], 1.5);
        assert_eq!(v["imu"]["gyro"], serde_json::json!([0.01, 0.02, 0.03]));
        assert_eq!(v["imu"]["accel_body"], serde_json::json!([0.0, 0.0, -9.8]));
        assert_eq!(v["position"], serde_json::json!([1.0, 2.0, -3.0]));
        assert_eq!(v["velocity"], serde_json::json!([0.1, 0.2, -0.3]));
        assert_eq!(v["quaternion"], serde_json::json!([1.0, 0.0, 0.0, 0.0]));
        // No battery key when the vehicle models no pack.
        assert!(v.get("battery").is_none());
    }

    #[test]
    fn sim_json_reply_never_carries_fault_fields() {
        // Hard constraint: the SITL SIM_JSON wire must stay byte-identical and the
        // firmware must never see a fault field. It only ever gets motion, IMU and
        // (optional) battery. Faults reach it purely through disturbed motion +
        // battery voltage/current, exactly as a real failure would.
        let mut s = VehicleState::default_zero();
        s.position = Vec3::new(1.0, 2.0, -3.0);
        let json = serialize_state(&s, Some((48.0, 90.0)));
        let v: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        let keys: Vec<&str> = v.as_object().unwrap().keys().map(|k| k.as_str()).collect();
        // Exactly the legacy key set: no motorThrust / motorCurrent / faults leak.
        for forbidden in ["faults", "motorThrust", "motorCurrent", "diagnostics"] {
            assert!(!keys.contains(&forbidden), "SIM_JSON reply leaked '{forbidden}'");
        }
        // The expected keys are all present.
        for expected in ["timestamp", "imu", "position", "quaternion", "velocity", "battery"] {
            assert!(keys.contains(&expected), "SIM_JSON reply missing '{expected}'");
        }
    }

    #[test]
    fn includes_battery_when_present() {
        let s = VehicleState::default_zero();
        let v: serde_json::Value =
            serde_json::from_str(serialize_state(&s, Some((51.8, 120.0))).trim()).unwrap();
        assert_eq!(v["battery"]["voltage"], 51.8);
        assert_eq!(v["battery"]["current"], 120.0);
    }

    #[test]
    fn sanitizes_non_finite() {
        let mut s = VehicleState::default_zero();
        s.timestamp = f64::NAN;
        s.position = Vec3::new(f64::INFINITY, 0.0, 0.0);
        // Non-finite battery values coerce to 0 too.
        let json = serialize_state(&s, Some((f64::NAN, f64::INFINITY)));
        let v: serde_json::Value = serde_json::from_str(json.trim()).unwrap();
        assert_eq!(v["timestamp"], 0.0);
        assert_eq!(v["position"][0], 0.0);
        assert_eq!(v["battery"]["voltage"], 0.0);
        assert_eq!(v["battery"]["current"], 0.0);
    }
}
