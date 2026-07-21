//! State WebSocket server. The desktop renderer connects here to drive the 3D
//! world, decoupled from the high-rate physics loop: we keep only the latest
//! state per vehicle and push it out at a fixed render-friendly rate (60 Hz).
//!
//! The `StateMessage` wire shape MUST byte-match the renderer's `SimStateMessage`
//! (`apps/desktop/src/renderer/stores/sim-state-store.ts`) or `parseStateMessage`
//! drops the frame.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::accept_async;
use tokio_tungstenite::tungstenite::Message;

use crate::copter::{StepDiagnostics, VehicleState};
use crate::fault::{parse_fault_command, FaultCommand};
use crate::fdm_server::HomeLocation;

/// Shared inbound-command queue: the WS read half pushes parsed fault commands,
/// the FDM step drains them under the vehicle mutex (§2 path 2).
pub type FaultSink = Arc<Mutex<Vec<FaultCommand>>>;

#[derive(Serialize, Clone)]
pub struct HomeMsg {
    pub lat: f64,
    pub lng: f64,
    pub alt: f64,
    pub heading: f64,
}

/// Per-motor observability block for the WS stream. camelCase on the wire so the
/// renderer's `SimMotorDiag` matches. Additive and optional (see `DiagnosticsMsg`).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MotorDiagMsg {
    pub position: [f64; 3],
    pub thrust: [f64; 3],
    pub command: f64,
    pub thrust_mag: f64,
    pub current: f64,
    pub velocity_in: f64,
    pub arm_moment: f64,
    pub arm_load_ratio: f64,
}

/// The force-budget "physics X-ray" for one frame. Rides the WS state stream
/// ONLY; the SITL SIM_JSON reply never carries it. Optional on `StateMessage`
/// (`skip_serializing_if`), so a diagnostics-off frame is byte-identical to the
/// legacy wire and an older renderer simply ignores it.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticsMsg {
    pub motors: Vec<MotorDiagMsg>,
    pub net_thrust_body: [f64; 3],
    pub net_thrust_world: [f64; 3],
    pub torque_body: [f64; 3],
    pub airframe_drag_body: [f64; 3],
    pub momentum_drag_body: [f64; 3],
    pub load_factor: f64,
    pub cg_body: [f64; 3],
    pub cg_shift: [f64; 3],
    pub cg_hover_est: [f64; 3],
    pub max_arm_moment: f64,
    /// Vehicle weight (m*g), N. World direction is +Z (down).
    pub weight: f64,
    /// Net world force accelerating the airframe (NED): the X-ray resultant.
    pub net_force_world: [f64; 3],
}

/// One motor's static layout for the WS `motors` block: body-frame position and
/// spin, MOT_1..N order (index 0 = MOT_1). Lets the UI draw a top-down motor
/// schematic with correct numbering + spin. Fields are already camelCase-safe
/// (x/y/spin are lowercase). WS-only; the SITL wire never carries it.
#[derive(Serialize, Clone)]
pub struct MotorInfo {
    /// Body-forward position of the motor from the CG (m, FRD x = forward).
    pub x: f64,
    /// Body-right position of the motor from the CG (m, FRD y = right).
    pub y: f64,
    /// Propeller spin direction: "cw" or "ccw".
    pub spin: &'static str,
}

/// One active per-motor fault for the analytics panel. `kind` is the sub-fault
/// name (motor_out / thrust_loss / imbalance / brownout / bearing_drag /
/// asym_drag / outflow_loss); `severity` is the 0..1 "how bad" view. WS-only and
/// optional; the SITL wire never carries a fault field.
#[derive(Serialize, Clone)]
pub struct FaultReport {
    pub motor: usize,
    pub kind: &'static str,
    pub severity: f64,
}

/// Suspended-load block for the WS renderer (cable line + load mesh). Additive
/// and optional; the SITL SIM_JSON reply never carries it (the load reaches SITL
/// only through the disturbed vehicle position/velocity/quaternion/IMU).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LoadMsg {
    /// Load position, world NED.
    pub position: [f64; 3],
    /// Hardpoint world NED, so the renderer draws the cable end on the airframe.
    pub hardpoint: [f64; 3],
    pub velocity: [f64; 3],
    pub cable_length: f64,
    pub tension: f64,
    pub attached: bool,
}

impl From<&StepDiagnostics> for DiagnosticsMsg {
    fn from(d: &StepDiagnostics) -> Self {
        DiagnosticsMsg {
            motors: d
                .motors
                .iter()
                .map(|m| MotorDiagMsg {
                    position: [m.position.x, m.position.y, m.position.z],
                    thrust: [m.thrust_bf.x, m.thrust_bf.y, m.thrust_bf.z],
                    command: m.command,
                    thrust_mag: m.thrust_mag,
                    current: m.current,
                    velocity_in: m.velocity_in,
                    arm_moment: m.arm_moment,
                    arm_load_ratio: m.arm_load_ratio,
                })
                .collect(),
            net_thrust_body: [d.net_thrust_bf.x, d.net_thrust_bf.y, d.net_thrust_bf.z],
            net_thrust_world: [d.net_thrust_world.x, d.net_thrust_world.y, d.net_thrust_world.z],
            torque_body: [d.torque_bf.x, d.torque_bf.y, d.torque_bf.z],
            airframe_drag_body: [d.airframe_drag_bf.x, d.airframe_drag_bf.y, d.airframe_drag_bf.z],
            momentum_drag_body: [d.momentum_drag_bf.x, d.momentum_drag_bf.y, d.momentum_drag_bf.z],
            load_factor: d.load_factor,
            cg_body: [d.cg_body.x, d.cg_body.y, d.cg_body.z],
            cg_shift: [d.cg_shift.x, d.cg_shift.y, d.cg_shift.z],
            cg_hover_est: [d.cg_hover_est.x, d.cg_hover_est.y, d.cg_hover_est.z],
            max_arm_moment: d.max_arm_moment,
            weight: d.weight,
            net_force_world: [d.net_force_world.x, d.net_force_world.y, d.net_force_world.z],
        }
    }
}

#[derive(Serialize, Clone)]
pub struct EulerMsg {
    pub roll: f64,
    pub pitch: f64,
    pub yaw: f64,
}

/// Local environment conditions at the aircraft for the 3D world / HUD (a wind
/// barb, an AGL readout, a ground-effect / wake indicator). camelCase, additive
/// and optional; the SITL SIM_JSON reply never carries it (WS-only). Absent =
/// legacy wire (an older renderer simply ignores it).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EnvMsg {
    /// Local wind vector at the aircraft, world NED [n, e, d] (m/s).
    pub wind: [f64; 3],
    /// Height above ground level (m).
    pub agl: f64,
    /// Terrain height under the vehicle, metres above datum (+up).
    pub ground_height: f64,
    /// Vehicle-average ground-effect thrust factor (>= 1, 1 = out of ground effect).
    pub ground_effect: f64,
    /// Local gust-intensity multiplier (>= 1) from obstacle wakes.
    pub turbulence: f64,
}

/// A vehicle-vehicle contact event (spec 1.5) for the WS stream: proximity-ring
/// flash / fleet alert. Broadcast as its own `type: "collision"` frame; the
/// per-vehicle `state` message shape is unchanged. camelCase on the wire.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CollisionMsg {
    #[serde(rename = "type")]
    pub kind: &'static str,
    /// The two vehicle ids in contact.
    pub a: String,
    pub b: String,
    /// Closing speed along the contact normal (m/s, >= 0).
    pub closing_speed: f64,
    /// Penetration depth (m).
    pub depth: f64,
    /// Contact point, world NED [n, e, d].
    pub position: [f64; 3],
    /// Sim time of the detecting vehicle's step (s).
    pub timestamp: f64,
}

#[derive(Serialize, Clone)]
pub struct StateMessage {
    #[serde(rename = "type")]
    pub kind: &'static str,
    pub id: String,
    pub home: HomeMsg,
    pub timestamp: f64,
    pub position: [f64; 3],
    pub velocity: [f64; 3],
    /// Body -> world, [w, x, y, z].
    pub quaternion: [f64; 4],
    /// Radians.
    pub euler: EulerMsg,
    /// Normalized average motor output 0..1, so the 3D world can spin the props.
    pub throttle: f64,
    #[serde(rename = "batteryVoltage", skip_serializing_if = "Option::is_none")]
    pub battery_voltage: Option<f64>,
    /// Force-budget X-ray, WS-only + optional. Absent = byte-identical legacy wire.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diagnostics: Option<DiagnosticsMsg>,
    /// Suspended-load state, WS-only + optional. Absent = no load (legacy wire).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub load: Option<LoadMsg>,
    /// Per-motor rotor lift (N), MOT_1..N order. WS-only; lets the 3D world dim a
    /// dead prop. Absent when no fault plumbing supplied it (legacy wire).
    #[serde(rename = "motorThrust", skip_serializing_if = "Option::is_none")]
    pub motor_thrust: Option<Vec<f64>>,
    /// Per-motor current (A), MOT_1..N order. WS-only; drives the hot-motor tint.
    #[serde(rename = "motorCurrent", skip_serializing_if = "Option::is_none")]
    pub motor_current: Option<Vec<f64>>,
    /// Active faults, WS-only + optional. Absent = no faults / healthy.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub faults: Option<Vec<FaultReport>>,
    /// Local environment (AGL, local wind, ground effect, turbulence). WS-only +
    /// optional. Absent = no environment sampled (legacy wire).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<EnvMsg>,
    /// Static per-motor layout (position + spin, MOT_1..N) for the UI schematic.
    /// WS-only + optional; set by `update`. Absent = no layout supplied (legacy
    /// wire). Emitted on every state frame so late-joining WS clients receive it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub motors: Option<Vec<MotorInfo>>,
}

impl StateMessage {
    /// Build a message from raw vehicle state (euler derived from attitude).
    #[allow(clippy::too_many_arguments)]
    pub fn from_state(
        id: &str,
        state: &VehicleState,
        home: HomeLocation,
        throttle: f64,
        battery_voltage: Option<f64>,
        diagnostics: Option<DiagnosticsMsg>,
        load: Option<LoadMsg>,
        motor_thrust: Option<Vec<f64>>,
        motor_current: Option<Vec<f64>>,
        faults: Option<Vec<FaultReport>>,
        env: Option<EnvMsg>,
    ) -> StateMessage {
        let (roll, pitch, yaw) = state.attitude.to_euler();
        StateMessage {
            kind: "state",
            id: id.to_string(),
            home: HomeMsg {
                lat: home.lat,
                lng: home.lng,
                alt: home.alt,
                heading: home.heading,
            },
            timestamp: state.timestamp,
            position: [state.position.x, state.position.y, state.position.z],
            velocity: [state.velocity.x, state.velocity.y, state.velocity.z],
            quaternion: [
                state.attitude.w,
                state.attitude.x,
                state.attitude.y,
                state.attitude.z,
            ],
            euler: EulerMsg { roll, pitch, yaw },
            throttle,
            battery_voltage,
            diagnostics,
            load,
            motor_thrust,
            motor_current,
            faults,
            env,
            // Set by `update` (kept out of the from_state signature so the many
            // existing call sites are unchanged); a bare from_state carries none.
            motors: None,
        }
    }
}

type LatestMap = Arc<Mutex<HashMap<String, StateMessage>>>;

pub struct StateWsServer {
    port: u16,
    latest: LatestMap,
    tx: broadcast::Sender<String>,
    broadcast_hz: u64,
    /// Emit the diagnostics X-ray block at all. When false the block is stripped
    /// on the wire (bandwidth save in headless CI). Motion is unaffected.
    diagnostics_enabled: bool,
    /// Send diagnostics only every Nth flush (motion stays 60 Hz, overlay ~15 Hz).
    diag_decimation: u64,
    /// Optional inbound fault-command queue. When set, the WS read half parses
    /// `fault` / `clear_faults` frames onto it for the FDM step to apply.
    fault_sink: Option<FaultSink>,
}

impl StateWsServer {
    pub fn new(port: u16) -> StateWsServer {
        let (tx, _rx) = broadcast::channel(256);
        StateWsServer {
            port,
            latest: Arc::new(Mutex::new(HashMap::new())),
            tx,
            broadcast_hz: 60,
            diagnostics_enabled: true,
            diag_decimation: 4,
            fault_sink: None,
        }
    }

    /// Enable/disable the diagnostics X-ray on the wire (default enabled).
    pub fn set_diagnostics_enabled(&mut self, on: bool) {
        self.diagnostics_enabled = on;
    }

    /// Route inbound WS `fault` / `clear_faults` control frames onto `sink` (the
    /// live mid-flight injection path). Without this the read half stays inert.
    pub fn set_fault_sink(&mut self, sink: FaultSink) {
        self.fault_sink = Some(sink);
    }

    /// Bind the WS port and start the accept + 60 Hz flush loops. Returns once
    /// the listener is bound (so callers can rely on the port being open).
    pub async fn start(&self) -> anyhow::Result<()> {
        let listener = TcpListener::bind(("127.0.0.1", self.port)).await?;

        // Accept loop: each client gets a snapshot then a broadcast subscription.
        let accept_latest = self.latest.clone();
        let accept_tx = self.tx.clone();
        let accept_fault = self.fault_sink.clone();
        tokio::spawn(async move {
            loop {
                let (stream, _) = match listener.accept().await {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                let rx = accept_tx.subscribe();
                let latest = accept_latest.clone();
                tokio::spawn(handle_client(stream, latest, rx, accept_fault.clone()));
            }
        });

        // Flush loop: broadcast every latest message to all clients at N Hz.
        let flush_latest = self.latest.clone();
        let flush_tx = self.tx.clone();
        let interval_ms = (1000 / self.broadcast_hz).max(1);
        let diag_enabled = self.diagnostics_enabled;
        let decimation = self.diag_decimation.max(1);
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_millis(interval_ms));
            let mut tick: u64 = 0;
            loop {
                interval.tick().await;
                tick = tick.wrapping_add(1);
                if flush_tx.receiver_count() == 0 {
                    continue;
                }
                // Motion streams every tick; the heavy diagnostics block rides only
                // every Nth tick (or never, when disabled). The renderer keeps the
                // last non-null diagnostics per vehicle so the overlay stays smooth.
                let attach_diag = diag_enabled && tick % decimation == 0;
                let payloads: Vec<String> = {
                    let map = flush_latest.lock().unwrap();
                    map.values()
                        .map(|m| {
                            if attach_diag || m.diagnostics.is_none() {
                                serde_json::to_string(m).unwrap()
                            } else {
                                let mut stripped = m.clone();
                                stripped.diagnostics = None;
                                serde_json::to_string(&stripped).unwrap()
                            }
                        })
                        .collect()
                };
                for p in payloads {
                    let _ = flush_tx.send(p);
                }
            }
        });

        Ok(())
    }

    /// Replace the latest state for `id`. Synchronous so it can be called from
    /// the FDM server's `on_state` callback.
    #[allow(clippy::too_many_arguments)]
    pub fn update(
        &self,
        id: &str,
        state: &VehicleState,
        home: HomeLocation,
        throttle: f64,
        battery_voltage: Option<f64>,
        diagnostics: Option<DiagnosticsMsg>,
        load: Option<LoadMsg>,
        motor_thrust: Option<Vec<f64>>,
        motor_current: Option<Vec<f64>>,
        faults: Option<Vec<FaultReport>>,
        env: Option<EnvMsg>,
        motors: Option<Vec<MotorInfo>>,
    ) {
        let mut msg = StateMessage::from_state(
            id, state, home, throttle, battery_voltage, diagnostics, load, motor_thrust,
            motor_current, faults, env,
        );
        // Additive, outbound-only block; does not affect physics.
        msg.motors = motors;
        self.latest.lock().unwrap().insert(id.to_string(), msg);
    }

    /// Broadcast a vehicle-vehicle collision event immediately (not rate-limited
    /// like the state flush). Additive: it is a separate `type: "collision"` frame,
    /// so the `state` message shape is untouched. No-op when no client is attached.
    pub fn emit_collision(&self, msg: CollisionMsg) {
        if self.tx.receiver_count() == 0 {
            return;
        }
        if let Ok(payload) = serde_json::to_string(&msg) {
            let _ = self.tx.send(payload);
        }
    }
}

async fn handle_client(
    stream: TcpStream,
    latest: LatestMap,
    mut rx: broadcast::Receiver<String>,
    fault_sink: Option<FaultSink>,
) {
    let ws = match accept_async(stream).await {
        Ok(w) => w,
        Err(_) => return,
    };
    let (mut sink, mut read) = ws.split();

    // Send a snapshot immediately so a fresh client isn't blank until the next tick.
    {
        let snapshot: Vec<String> = {
            let map = latest.lock().unwrap();
            map.values()
                .map(|m| serde_json::to_string(m).unwrap())
                .collect()
        };
        for s in snapshot {
            if sink.send(Message::Text(s)).await.is_err() {
                return;
            }
        }
    }

    loop {
        tokio::select! {
            r = rx.recv() => match r {
                Ok(payload) => {
                    if sink.send(Message::Text(payload)).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            },
            msg = read.next() => match msg {
                Some(Ok(Message::Close(_))) | None => break,
                Some(Err(_)) => break,
                Some(Ok(Message::Text(t))) => {
                    // Live control channel: queue a fault command if this is one.
                    if let (Some(sink), Some(cmd)) = (&fault_sink, parse_fault_command(&t)) {
                        sink.lock().unwrap().push(cmd);
                    }
                }
                _ => {}
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn home() -> HomeLocation {
        HomeLocation {
            lat: -35.363261,
            lng: 149.16523,
            alt: 584.0,
            heading: 353.0,
        }
    }

    #[test]
    fn message_shape_matches_renderer_contract() {
        let s = VehicleState::default_zero();
        let msg = StateMessage::from_state("v1", &s, home(), 0.5, None, None, None, None, None, None, None);
        let v: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        assert_eq!(v["type"], "state");
        assert_eq!(v["id"], "v1");
        assert!(v["home"]["lat"].is_number() && v["home"]["heading"].is_number());
        assert!(v["home"]["lng"].is_number() && v["home"]["alt"].is_number());
        assert_eq!(v["position"].as_array().unwrap().len(), 3);
        assert_eq!(v["velocity"].as_array().unwrap().len(), 3);
        assert_eq!(v["quaternion"].as_array().unwrap().len(), 4);
        assert!(v["euler"]["roll"].is_number());
        assert!(v["euler"]["pitch"].is_number());
        assert!(v["euler"]["yaw"].is_number());
        assert!(v["timestamp"].is_number());
        // batteryVoltage ABSENT when None.
        assert!(v.get("batteryVoltage").is_none());
        // diagnostics + load ABSENT when None (legacy wire is byte-identical).
        assert!(v.get("diagnostics").is_none());
        assert!(v.get("load").is_none());
        // Fault fields ABSENT when None (healthy wire is byte-identical).
        assert!(v.get("motorThrust").is_none());
        assert!(v.get("motorCurrent").is_none());
        assert!(v.get("faults").is_none());
        // env ABSENT when None (legacy wire is byte-identical).
        assert!(v.get("env").is_none());
        // motors ABSENT on a bare from_state (set only by `update`).
        assert!(v.get("motors").is_none());
    }

    #[test]
    fn motors_block_is_additive_and_outbound() {
        // The motors layout rides on the wire as a top-level `motors` array with
        // x/y/spin per entry, MOT_1..N order. Additive: core state is unmoved.
        let s = VehicleState::default_zero();
        let mut msg = StateMessage::from_state("v1", &s, home(), 0.5, None, None, None, None, None, None, None);
        msg.motors = Some(vec![
            MotorInfo { x: 1.325, y: 0.0, spin: "cw" },
            MotorInfo { x: -1.325, y: 0.0, spin: "cw" },
            MotorInfo { x: 0.937, y: 0.937, spin: "ccw" },
        ]);
        let v: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        let m = v["motors"].as_array().unwrap();
        assert_eq!(m.len(), 3);
        assert_eq!(m[0]["x"], 1.325);
        assert_eq!(m[0]["y"], 0.0);
        assert_eq!(m[0]["spin"], "cw");
        assert_eq!(m[2]["spin"], "ccw");
        // Core state fields are unmoved by the additive block.
        assert_eq!(v["type"], "state");
        assert_eq!(v["position"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn env_block_is_additive_and_camelcase() {
        let s = VehicleState::default_zero();
        let env = EnvMsg {
            wind: [3.0, -1.0, 0.0],
            agl: 18.5,
            ground_height: 12.0,
            ground_effect: 1.07,
            turbulence: 1.4,
        };
        let msg = StateMessage::from_state("v1", &s, home(), 0.5, None, None, None, None, None, None, Some(env));
        let v: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        let e = &v["env"];
        assert_eq!(e["wind"].as_array().unwrap().len(), 3);
        assert_eq!(e["agl"], 18.5);
        assert_eq!(e["groundHeight"], 12.0);
        assert_eq!(e["groundEffect"], 1.07);
        assert_eq!(e["turbulence"], 1.4);
        // Core state fields are unmoved by the additive block.
        assert_eq!(v["type"], "state");
        assert_eq!(v["position"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn fault_fields_are_additive_and_camelcase() {
        let s = VehicleState::default_zero();
        let faults = vec![
            FaultReport { motor: 0, kind: "motor_out", severity: 1.0 },
            FaultReport { motor: 2, kind: "imbalance", severity: 0.3 },
        ];
        let msg = StateMessage::from_state(
            "v1", &s, home(), 0.5, None, None, None,
            Some(vec![0.0, 5.1, 4.8, 5.0]),
            Some(vec![0.0, 12.0, 20.0, 12.0]),
            Some(faults),
            None,
        );
        let v: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        assert_eq!(v["motorThrust"].as_array().unwrap().len(), 4);
        assert_eq!(v["motorThrust"][0], 0.0);
        assert_eq!(v["motorCurrent"][2], 20.0);
        let f = &v["faults"];
        assert_eq!(f[0]["motor"], 0);
        assert_eq!(f[0]["kind"], "motor_out");
        assert_eq!(f[1]["kind"], "imbalance");
        assert_eq!(f[1]["severity"], 0.3);
        // Core state is unmoved by the additive blocks.
        assert_eq!(v["type"], "state");
        assert_eq!(v["position"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn collision_message_is_camelcase_and_typed() {
        let msg = CollisionMsg {
            kind: "collision",
            a: "v1".to_string(),
            b: "v2".to_string(),
            closing_speed: 3.2,
            depth: 0.4,
            position: [10.0, -2.0, -20.0],
            timestamp: 12.5,
        };
        let v: serde_json::Value = serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        assert_eq!(v["type"], "collision");
        assert_eq!(v["a"], "v1");
        assert_eq!(v["b"], "v2");
        assert_eq!(v["closingSpeed"], 3.2);
        assert_eq!(v["depth"], 0.4);
        assert_eq!(v["position"].as_array().unwrap().len(), 3);
        assert_eq!(v["timestamp"], 12.5);
    }

    #[test]
    fn includes_battery_voltage_when_present() {
        let s = VehicleState::default_zero();
        let msg = StateMessage::from_state("v1", &s, home(), 0.5, Some(48.84), None, None, None, None, None, None);
        let v: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        assert_eq!(v["batteryVoltage"], 48.84);
    }

    #[test]
    fn diagnostics_block_is_additive_and_camelcase() {
        use crate::copter::{MotorDiag, StepDiagnostics};
        use crate::math::Vec3;
        let s = VehicleState::default_zero();
        let diag = StepDiagnostics {
            motors: vec![
                MotorDiag { position: Vec3::new(0.2, 0.1, 0.0), thrust_bf: Vec3::new(0.0, 0.0, -5.0), command: 0.4, thrust_mag: 5.0, current: 2.0, velocity_in: 1.0, arm_moment: 1.12, arm_load_ratio: 1.0 },
                MotorDiag { position: Vec3::new(-0.2, -0.1, 0.0), thrust_bf: Vec3::new(0.0, 0.0, -4.0), command: 0.3, thrust_mag: 4.0, current: 1.6, velocity_in: 0.9, arm_moment: 0.9, arm_load_ratio: 0.8 },
            ],
            net_thrust_bf: Vec3::new(0.0, 0.0, -9.0),
            net_thrust_world: Vec3::new(0.0, 0.0, -9.0),
            torque_bf: Vec3::new(0.01, 0.02, 0.03),
            airframe_drag_bf: Vec3::new(0.1, 0.0, 0.0),
            momentum_drag_bf: Vec3::new(0.05, 0.0, 0.0),
            load_factor: 1.0,
            cg_body: Vec3::zero(),
            cg_shift: Vec3::zero(),
            cg_hover_est: Vec3::new(0.001, 0.0, 0.0),
            max_arm_moment: 1.12,
            weight: 9.0,
            net_force_world: Vec3::new(0.1, 0.0, 0.0),
        };
        let msg = StateMessage::from_state("v1", &s, home(), 0.5, None, Some((&diag).into()), None, None, None, None, None);
        let v: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        let d = &v["diagnostics"];
        assert_eq!(d["motors"].as_array().unwrap().len(), 2);
        assert!(d["motors"][0]["thrustMag"].is_number());
        assert!(d["motors"][0]["armLoadRatio"].is_number());
        assert_eq!(d["netThrustBody"].as_array().unwrap().len(), 3);
        assert_eq!(d["netThrustWorld"].as_array().unwrap().len(), 3);
        assert_eq!(d["cgHoverEst"].as_array().unwrap().len(), 3);
        assert!(d["loadFactor"].is_number());
        assert!(d["maxArmMoment"].is_number());
        // Core state fields are unmoved by the additive block.
        assert_eq!(v["type"], "state");
        assert_eq!(v["position"].as_array().unwrap().len(), 3);
    }

    #[test]
    fn load_block_is_additive_and_camelcase() {
        let s = VehicleState::default_zero();
        let load = LoadMsg {
            position: [0.0, 0.0, 3.15],
            hardpoint: [0.0, 0.0, 0.15],
            velocity: [0.0, 0.0, 0.0],
            cable_length: 3.0,
            tension: 78.5,
            attached: true,
        };
        let msg = StateMessage::from_state("v1", &s, home(), 0.5, None, None, Some(load), None, None, None, None);
        let v: serde_json::Value =
            serde_json::from_str(&serde_json::to_string(&msg).unwrap()).unwrap();
        assert_eq!(v["load"]["cableLength"], 3.0);
        assert_eq!(v["load"]["tension"], 78.5);
        assert_eq!(v["load"]["attached"], true);
        assert_eq!(v["load"]["hardpoint"].as_array().unwrap().len(), 3);
        // Diagnostics still absent (independent optional block).
        assert!(v.get("diagnostics").is_none());
    }
}
