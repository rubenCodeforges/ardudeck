//! SimWorld ties the FDM UDP server and the state WebSocket server together.
//! v1 runs a single copter: one FDM port for SITL, one WS port for the 3D world.
//!
//! SharedWorld (spec 2) runs M copters in ONE process against a common air field:
//! one WS server (already multi-id) and one FDM port per vehicle, all sharing a
//! WorldSnapshot so each vehicle feels the others' rotor wake and can collide.

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex, RwLock};

use crate::collision::{resolve, still_in_contact, ContactBody, ContactParams};
use crate::copter::VehicleState;
use crate::fdm_server::{run_fdm_server, run_fdm_server_coupled, HomeLocation, SimVehicle};
use crate::math::Vec3;
use crate::state_stream::{CollisionMsg, DiagnosticsMsg, LoadMsg, StateWsServer};
use crate::wake::RotorWake;

/// One vehicle's latest published rigid state + shed wake in the shared world
/// (spec 2.2). Read by the OTHER vehicles' air-field sampling; written after each
/// of this vehicle's steps. `contact_force` is written by the central contact pass
/// and consumed by this vehicle on its next step.
#[derive(Debug, Clone)]
struct RigidPublish {
    position: Vec3,
    velocity: Vec3,
    r_bound: f64,
    rotors: Vec<RotorWake>,
    contact_force: Vec3,
}

/// The shared explicit-coupling snapshot (spec 2.2). Reads (M-1 vehicles sampling
/// neighbours) dominate and never block each other; one vehicle writes at a time.
pub struct WorldSnapshot {
    slots: RwLock<HashMap<String, RigidPublish>>,
    /// Currently-overlapping id pairs (canonical a<b), for edge-triggered events.
    active_contacts: Mutex<HashSet<(String, String)>>,
    contact: ContactParams,
}

/// Canonical unordered pair key (sorted) so (a,b) and (b,a) collapse.
fn pair_key(a: &str, b: &str) -> (String, String) {
    if a <= b {
        (a.to_string(), b.to_string())
    } else {
        (b.to_string(), a.to_string())
    }
}

impl WorldSnapshot {
    pub fn new(contact: ContactParams) -> WorldSnapshot {
        WorldSnapshot {
            slots: RwLock::new(HashMap::new()),
            active_contacts: Mutex::new(HashSet::new()),
            contact,
        }
    }

    /// Every OTHER vehicle's shed-rotor wake sources (spec 1.1: a rotor never
    /// samples its own wake). Copied out under a short read lock.
    pub fn neighbor_wake(&self, id: &str) -> Vec<RotorWake> {
        let slots = self.slots.read().unwrap();
        let mut out = Vec::new();
        for (sid, slot) in slots.iter() {
            if sid != id {
                out.extend_from_slice(&slot.rotors);
            }
        }
        out
    }

    /// This vehicle's pending external contact force (world N), or zero.
    pub fn contact_force(&self, id: &str) -> Vec3 {
        self.slots
            .read()
            .unwrap()
            .get(id)
            .map(|s| s.contact_force)
            .unwrap_or(Vec3::zero())
    }

    /// Publish `id`'s fresh rigid state + shed wake, then run the central all-pairs
    /// contact pass over the whole world, writing each slot's `contact_force` and
    /// returning any NEW (edge-triggered, hysteresis-gated) collision events.
    pub fn publish(
        &self,
        id: &str,
        position: Vec3,
        velocity: Vec3,
        r_bound: f64,
        rotors: Vec<RotorWake>,
        timestamp: f64,
    ) -> Vec<CollisionMsg> {
        let mut slots = self.slots.write().unwrap();
        slots.insert(
            id.to_string(),
            RigidPublish { position, velocity, r_bound, rotors, contact_force: Vec3::zero() },
        );

        // Stable id order so the resolve indexing is deterministic (Jacobi order
        // independence, spec 3.1 case 6).
        let mut ids: Vec<String> = slots.keys().cloned().collect();
        ids.sort();
        let bodies: Vec<ContactBody> = ids
            .iter()
            .map(|k| {
                let s = &slots[k];
                ContactBody { position: s.position, velocity: s.velocity, r_bound: s.r_bound }
            })
            .collect();

        let (forces, contacts) = resolve(&bodies, &self.contact);
        // Reset then write the freshly computed contact force into each slot.
        for (k, f) in ids.iter().zip(forces.iter()) {
            if let Some(slot) = slots.get_mut(k) {
                slot.contact_force = *f;
            }
        }

        // Edge-trigger: emit only on a pair NEWLY entering contact; keep a sustained
        // contact latched (with hysteresis) so it does not spam.
        let mut active = self.active_contacts.lock().unwrap();
        let mut events = Vec::new();
        let mut still: HashSet<(String, String)> = HashSet::new();
        for c in &contacts {
            let (ka, kb) = (ids[c.a].clone(), ids[c.b].clone());
            let key = pair_key(&ka, &kb);
            still.insert(key.clone());
            if !active.contains(&key) {
                events.push(CollisionMsg {
                    kind: "collision",
                    a: ka,
                    b: kb,
                    closing_speed: c.closing_speed,
                    depth: c.depth,
                    position: [c.position.x, c.position.y, c.position.z],
                    timestamp,
                });
            }
        }
        // Retain previously-active pairs that are still within the hysteresis band
        // (so a resting contact is not re-fired); drop those clearly separated.
        active.retain(|key| {
            if still.contains(key) {
                return true;
            }
            match (slots.get(&key.0), slots.get(&key.1)) {
                (Some(a), Some(b)) => {
                    let dist = b.position.sub(a.position).length();
                    still_in_contact(dist, a.r_bound + b.r_bound, &self.contact)
                }
                _ => false,
            }
        });
        for key in still {
            active.insert(key);
        }
        events
    }
}

pub struct SimWorld {
    pub fdm_port: u16,
    pub ws_port: u16,
    pub home: HomeLocation,
    pub vehicle: Arc<Mutex<dyn SimVehicle + Send>>,
}

impl SimWorld {
    /// Start the WS server, then run the FDM server. The FDM `on_state` mirrors
    /// each new state (with live battery voltage) into the WS server. This future
    /// resolves only if the FDM server errors out.
    pub async fn run(self) -> anyhow::Result<()> {
        let mut ws_server = StateWsServer::new(self.ws_port);
        // Wire the live fault control channel so inbound `fault` / `clear_faults`
        // WS frames reach the vehicle (§2 path 2).
        if let Some(sink) = self.vehicle.lock().unwrap().fault_sink() {
            ws_server.set_fault_sink(sink);
        }
        let ws = Arc::new(ws_server);
        ws.start().await?;

        let ws_cb = ws.clone();
        let vehicle_cb = self.vehicle.clone();
        let home = self.home;
        let on_state = move |id: &str, state: &VehicleState| {
            // The FDM server is not holding the vehicle lock when it calls us.
            let (thr, bv, diag, load, motor_thrust, motor_current, faults, env, motors) = {
                let v = vehicle_cb.lock().unwrap();
                let diag = v.diagnostics().as_ref().map(DiagnosticsMsg::from);
                let load = v.load_report().map(|r| LoadMsg {
                    position: [r.load.position.x, r.load.position.y, r.load.position.z],
                    hardpoint: [r.hardpoint_world.x, r.hardpoint_world.y, r.hardpoint_world.z],
                    velocity: [r.load.velocity.x, r.load.velocity.y, r.load.velocity.z],
                    cable_length: r.load.cable_length,
                    tension: r.load.tension,
                    attached: r.load.attached,
                });
                let (motor_thrust, motor_current) = match v.motor_telemetry() {
                    Some((t, c)) => (Some(t), Some(c)),
                    None => (None, None),
                };
                let faults = v.active_faults();
                let faults = if faults.is_empty() { None } else { Some(faults) };
                let env = v.env_report();
                (v.throttle(), v.battery_voltage(), diag, load, motor_thrust, motor_current, faults, env, v.motor_layout())
            };
            ws_cb.update(id, state, home, thr, bv, diag, load, motor_thrust, motor_current, faults, env, motors);
        };

        run_fdm_server(self.fdm_port, self.vehicle, on_state).await
    }
}

/// One vehicle in the shared world: its FDM UDP port (SITL `-I<i>` connects here)
/// and its home.
pub struct VehicleSlot {
    pub vehicle: Arc<Mutex<dyn SimVehicle + Send>>,
    pub fdm_port: u16,
    pub home: HomeLocation,
}

/// M interacting copters in one process (spec 2.1): one shared WS stream, one FDM
/// port per vehicle, one shared air field (`WorldSnapshot`). A single-vehicle
/// SharedWorld behaves exactly like `SimWorld` (empty neighbour set, no contacts).
pub struct SharedWorld {
    pub ws_port: u16,
    pub vehicles: Vec<VehicleSlot>,
    pub snapshot: Arc<WorldSnapshot>,
}

impl SharedWorld {
    pub fn new(ws_port: u16, contact: ContactParams) -> SharedWorld {
        SharedWorld {
            ws_port,
            vehicles: Vec::new(),
            snapshot: Arc::new(WorldSnapshot::new(contact)),
        }
    }

    pub fn add_vehicle(&mut self, vehicle: Arc<Mutex<dyn SimVehicle + Send>>, fdm_port: u16, home: HomeLocation) {
        self.vehicles.push(VehicleSlot { vehicle, fdm_port, home });
    }

    /// Start the one WS server, then spawn one coupled FDM task per vehicle. All
    /// share `snapshot`. Resolves only if a task errors out.
    pub async fn run(self) -> anyhow::Result<()> {
        let ws = Arc::new(StateWsServer::new(self.ws_port));
        ws.start().await?;

        let mut handles = Vec::new();
        for slot in self.vehicles {
            let ws_state = ws.clone();
            let ws_collision = ws.clone();
            let vehicle_cb = slot.vehicle.clone();
            let home = slot.home;
            // Mirror each new state (with live battery/diagnostics/env) into the
            // shared WS server, exactly like SimWorld does per vehicle.
            let on_state = move |id: &str, state: &VehicleState| {
                let (thr, bv, diag, load, mt, mc, faults, env, motors) = {
                    let v = vehicle_cb.lock().unwrap();
                    let diag = v.diagnostics().as_ref().map(DiagnosticsMsg::from);
                    let load = v.load_report().map(|r| LoadMsg {
                        position: [r.load.position.x, r.load.position.y, r.load.position.z],
                        hardpoint: [r.hardpoint_world.x, r.hardpoint_world.y, r.hardpoint_world.z],
                        velocity: [r.load.velocity.x, r.load.velocity.y, r.load.velocity.z],
                        cable_length: r.load.cable_length,
                        tension: r.load.tension,
                        attached: r.load.attached,
                    });
                    let (mt, mc) = match v.motor_telemetry() {
                        Some((t, c)) => (Some(t), Some(c)),
                        None => (None, None),
                    };
                    let faults = v.active_faults();
                    let faults = if faults.is_empty() { None } else { Some(faults) };
                    (v.throttle(), v.battery_voltage(), diag, load, mt, mc, faults, v.env_report(), v.motor_layout())
                };
                ws_state.update(id, state, home, thr, bv, diag, load, mt, mc, faults, env, motors);
            };
            let on_collision = move |msg: CollisionMsg| ws_collision.emit_collision(msg);
            let snapshot = self.snapshot.clone();
            handles.push(tokio::spawn(run_fdm_server_coupled(
                slot.fdm_port,
                slot.vehicle,
                snapshot,
                on_state,
                on_collision,
            )));
        }

        // Run until any vehicle's FDM task returns (an error or shutdown).
        for h in handles {
            match h.await {
                Ok(r) => r?,
                Err(e) => return Err(anyhow::anyhow!("fdm task panicked: {e}")),
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::copter::DEFAULT_ENVIRONMENT;
    use crate::fdm_server::CopterVehicle;
    use crate::frame::default_params;
    use crate::math::Vec3;
    use crate::protocol::encode_servo_packet;
    use crate::sensors::NO_SENSOR_NOISE;
    use crate::wind::WindConfig;
    use futures_util::{SinkExt, StreamExt};
    use std::time::Duration;
    use tokio::net::UdpSocket;
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    use crate::collision::ContactParams;
    use crate::wake::RotorWake;

    fn calm_wind() -> WindConfig {
        WindConfig {
            steady: Vec3::zero(),
            intensity: 0.0,
            time_constant: 1.0,
        }
    }

    fn wake_src(w: f64) -> RotorWake {
        RotorWake { origin: Vec3::zero(), axis: Vec3::new(0.0, 0.0, 1.0), w, radius: 0.2 }
    }

    #[test]
    fn snapshot_neighbor_wake_excludes_self() {
        // A rotor never samples its own wake: b sees a's sources, a sees none.
        let snap = WorldSnapshot::new(ContactParams::default());
        snap.publish("a", Vec3::zero(), Vec3::zero(), 1.0, vec![wake_src(10.0), wake_src(11.0)], 0.0);
        snap.publish("b", Vec3::new(50.0, 0.0, 0.0), Vec3::zero(), 1.0, vec![wake_src(9.0)], 0.0);
        assert_eq!(snap.neighbor_wake("b").len(), 2, "b samples a's two rotors");
        assert_eq!(snap.neighbor_wake("a").len(), 1, "a samples b's one rotor, not its own");
    }

    #[test]
    fn snapshot_resolves_contact_and_edge_triggers_events() {
        let snap = WorldSnapshot::new(ContactParams::default());
        // A alone: no contact.
        assert!(snap.publish("a", Vec3::zero(), Vec3::zero(), 1.0, vec![], 0.0).is_empty());
        // B overlaps A (centres 1.5 < 2.0): one event, normal a->b, equal-opposite
        // contact forces stored on both slots.
        let e = snap.publish("b", Vec3::new(1.5, 0.0, 0.0), Vec3::new(-1.0, 0.0, 0.0), 1.0, vec![], 0.1);
        assert_eq!(e.len(), 1);
        assert_eq!((e[0].a.as_str(), e[0].b.as_str()), ("a", "b"));
        assert!((e[0].depth - 0.5).abs() < 1e-9);
        let (fa, fb) = (snap.contact_force("a"), snap.contact_force("b"));
        assert!(fb.x > 0.0 && fa.x < 0.0 && (fa.x + fb.x).abs() < 1e-9);
        // Sustained contact must NOT re-fire (edge-triggered).
        let e2 = snap.publish("b", Vec3::new(1.5, 0.0, 0.0), Vec3::new(-1.0, 0.0, 0.0), 1.0, vec![], 0.2);
        assert!(e2.is_empty(), "sustained contact re-fired");
        // Separate B well clear: its force clears; a fresh approach fires again.
        snap.publish("b", Vec3::new(10.0, 0.0, 0.0), Vec3::zero(), 1.0, vec![], 0.3);
        assert_eq!(snap.contact_force("a"), Vec3::zero());
        let e3 = snap.publish("b", Vec3::new(1.5, 0.0, 0.0), Vec3::new(-1.0, 0.0, 0.0), 1.0, vec![], 0.4);
        assert_eq!(e3.len(), 1, "re-entry after separation fires a fresh event");
    }

    async fn exchange(client: &UdpSocket, addr: &str, pwm: &[u16], fc: u32) -> serde_json::Value {
        let pkt = encode_servo_packet(400, fc, pwm);
        let mut buf = [0u8; 8192];
        loop {
            client.send_to(&pkt, addr).await.unwrap();
            match tokio::time::timeout(Duration::from_millis(200), client.recv_from(&mut buf)).await
            {
                Ok(Ok((n, _))) => {
                    let s = std::str::from_utf8(&buf[..n]).unwrap().trim();
                    return serde_json::from_str(s).unwrap();
                }
                _ => continue,
            }
        }
    }

    #[tokio::test]
    async fn world_smoke_fdm_replies_and_ws_streams_state() {
        let fdm_port = 19210u16;
        let ws_port = 19220u16;
        let home = HomeLocation {
            lat: -35.363261,
            lng: 149.16523,
            alt: 584.0,
            heading: 353.0,
        };
        let vehicle = CopterVehicle::new(
            "v1",
            default_params(),
            DEFAULT_ENVIRONMENT,
            home,
            calm_wind(),
            NO_SENSOR_NOISE,
            None,
            true,
            1,
        );
        let world = SimWorld {
            fdm_port,
            ws_port,
            home,
            vehicle: Arc::new(Mutex::new(vehicle)),
        };
        tokio::spawn(async move {
            let _ = world.run().await;
        });

        // Connect a WS client (retry until the server is bound).
        let ws_url = format!("ws://127.0.0.1:{ws_port}");
        let mut ws = loop {
            match connect_async(&ws_url).await {
                Ok((s, _)) => break s,
                Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
            }
        };

        // Drive the FDM server as SITL at hover PWM for 400 frames.
        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let addr = format!("127.0.0.1:{fdm_port}");
        let hover = [1390u16; 16];
        for fc in 1..=400u32 {
            let reply = exchange(&client, &addr, &hover, fc).await;
            let pos = reply["position"].as_array().unwrap();
            for v in pos {
                assert!(v.as_f64().unwrap().is_finite());
            }
        }

        // The WS stream must emit a `state` message for the vehicle id.
        let got = tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if let Some(Ok(Message::Text(t))) = ws.next().await {
                    let v: serde_json::Value = serde_json::from_str(&t).unwrap();
                    if v["type"] == "state" {
                        return v;
                    }
                }
            }
        })
        .await
        .expect("expected a state message on the WS stream");

        assert_eq!(got["type"], "state");
        assert_eq!(got["id"], "v1");
        assert_eq!(got["position"].as_array().unwrap().len(), 3);
    }

    #[tokio::test]
    async fn shared_world_runs_two_vehicles_on_one_ws() {
        // Spec phase 1: two vehicles, two FDM ports, one shared WS stream. Both
        // reply and climb under throttle; both ids appear on the single WS stream.
        let (fdm_a, fdm_b, ws_port) = (19310u16, 19311u16, 19320u16);
        let home = HomeLocation { lat: -35.363261, lng: 149.16523, alt: 584.0, heading: 353.0 };
        let mk = |id: &str| -> Arc<Mutex<dyn SimVehicle + Send>> {
            Arc::new(Mutex::new(CopterVehicle::new(
                id, default_params(), DEFAULT_ENVIRONMENT, home, calm_wind(),
                NO_SENSOR_NOISE, None, true, 1,
            )))
        };
        let mut world = SharedWorld::new(ws_port, ContactParams::default());
        // Home the two vehicles 200 m apart so their wakes do not interact here.
        world.add_vehicle(mk("va"), fdm_a, home);
        world.add_vehicle(mk("vb"), fdm_b, home);
        tokio::spawn(async move { let _ = world.run().await; });

        let ws_url = format!("ws://127.0.0.1:{ws_port}");
        let mut ws = loop {
            match connect_async(&ws_url).await {
                Ok((s, _)) => break s,
                Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
            }
        };

        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let (addr_a, addr_b) = (format!("127.0.0.1:{fdm_a}"), format!("127.0.0.1:{fdm_b}"));
        let full = [2000u16; 16];
        let mut last_a = serde_json::Value::Null;
        for fc in 1..=200u32 {
            last_a = exchange(&client, &addr_a, &full, fc).await;
            let _ = exchange(&client, &addr_b, &full, fc).await;
        }
        // Both FDM ports reply with a climbing state.
        assert!(last_a["position"][2].as_f64().unwrap() < -0.5, "va should climb");

        // The one WS stream carries both ids.
        let mut seen = std::collections::HashSet::new();
        let _ = tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if let Some(Ok(Message::Text(t))) = ws.next().await {
                    let v: serde_json::Value = serde_json::from_str(&t).unwrap();
                    if v["type"] == "state" {
                        seen.insert(v["id"].as_str().unwrap().to_string());
                        if seen.contains("va") && seen.contains("vb") {
                            return;
                        }
                    }
                }
            }
        })
        .await;
        assert!(seen.contains("va") && seen.contains("vb"), "both ids must stream on the one WS, saw {seen:?}");
    }

    #[tokio::test]
    async fn shared_world_emits_a_collision_event_for_overlapping_vehicles() {
        // Spec phase 3: two vehicles spawned within contact range must emit a
        // `type: "collision"` frame naming both ids on the shared WS stream.
        let (fdm_a, fdm_b, ws_port) = (19510u16, 19511u16, 19520u16);
        let home = HomeLocation { lat: -35.363261, lng: 149.16523, alt: 584.0, heading: 353.0 };
        let mk = |id: &str, offset: Vec3| -> Arc<Mutex<dyn SimVehicle + Send>> {
            let mut v = CopterVehicle::new(
                id, default_params(), DEFAULT_ENVIRONMENT, home, calm_wind(),
                NO_SENSOR_NOISE, None, true, 1,
            );
            v.set_spawn_offset(offset);
            Arc::new(Mutex::new(v))
        };
        let mut world = SharedWorld::new(ws_port, ContactParams::default());
        // 0.5 m apart aloft: well inside the bounding-sphere sum (~1.15 m), so they
        // overlap from the first shared frame.
        world.add_vehicle(mk("va", Vec3::new(0.0, 0.0, -20.0)), fdm_a, home);
        world.add_vehicle(mk("vb", Vec3::new(0.5, 0.0, -20.0)), fdm_b, home);
        tokio::spawn(async move { let _ = world.run().await; });

        let ws_url = format!("ws://127.0.0.1:{ws_port}");
        let mut ws = loop {
            match connect_async(&ws_url).await {
                Ok((s, _)) => break s,
                Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
            }
        };
        // Ensure the WS subscription is live before the (edge-triggered) event fires.
        tokio::time::sleep(Duration::from_millis(150)).await;

        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let (addr_a, addr_b) = (format!("127.0.0.1:{fdm_a}"), format!("127.0.0.1:{fdm_b}"));
        let hover = [1500u16; 16];
        for fc in 1..=40u32 {
            exchange(&client, &addr_a, &hover, fc).await;
            exchange(&client, &addr_b, &hover, fc).await;
        }

        let got = tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if let Some(Ok(Message::Text(t))) = ws.next().await {
                    let v: serde_json::Value = serde_json::from_str(&t).unwrap();
                    if v["type"] == "collision" {
                        return v;
                    }
                }
            }
        })
        .await
        .expect("expected a collision event on the shared WS stream");
        let ids = [got["a"].as_str().unwrap(), got["b"].as_str().unwrap()];
        assert!(ids.contains(&"va") && ids.contains(&"vb"), "collision must name both vehicles, got {ids:?}");
        assert!(got["depth"].as_f64().unwrap() > 0.0);
    }

    #[tokio::test]
    async fn live_ws_fault_command_round_trips_into_state() {
        // §2 path 2: a `fault` frame sent on the state WS reaches the vehicle and
        // its physical consequence surfaces on the next state frames - MOT_1 dead,
        // its thrust zeroed, and a `faults` entry reported.
        let fdm_port = 19230u16;
        let ws_port = 19240u16;
        let home = HomeLocation { lat: -35.363261, lng: 149.16523, alt: 584.0, heading: 353.0 };
        let vehicle = CopterVehicle::new(
            "v1", default_params(), DEFAULT_ENVIRONMENT, home, calm_wind(),
            NO_SENSOR_NOISE, None, true, 1,
        );
        let world = SimWorld { fdm_port, ws_port, home, vehicle: Arc::new(Mutex::new(vehicle)) };
        tokio::spawn(async move { let _ = world.run().await; });

        let ws_url = format!("ws://127.0.0.1:{ws_port}");
        let mut ws = loop {
            match connect_async(&ws_url).await {
                Ok((s, _)) => break s,
                Err(_) => tokio::time::sleep(Duration::from_millis(20)).await,
            }
        };

        let client = UdpSocket::bind("127.0.0.1:0").await.unwrap();
        let addr = format!("127.0.0.1:{fdm_port}");
        let hover = [1500u16; 16];
        // Prime a few frames so the vehicle is running, then inject the fault.
        for fc in 1..=20u32 {
            exchange(&client, &addr, &hover, fc).await;
        }
        ws.send(Message::Text(r#"{"type":"fault","motor":0,"kind":"motor_out"}"#.to_string()))
            .await
            .unwrap();
        // Give the command a moment to queue, then drive more frames so it applies.
        tokio::time::sleep(Duration::from_millis(50)).await;
        for fc in 21..=120u32 {
            exchange(&client, &addr, &hover, fc).await;
        }

        // A subsequent state frame must report MOT_1 dead with zero thrust.
        let got = tokio::time::timeout(Duration::from_secs(3), async {
            loop {
                if let Some(Ok(Message::Text(t))) = ws.next().await {
                    let v: serde_json::Value = serde_json::from_str(&t).unwrap();
                    if v["type"] == "state" && v.get("faults").is_some() {
                        return v;
                    }
                }
            }
        })
        .await
        .expect("expected a state frame carrying the injected fault");

        let faults = got["faults"].as_array().unwrap();
        assert!(faults.iter().any(|f| f["motor"] == 0 && f["kind"] == "motor_out"));
        assert_eq!(got["motorThrust"][0].as_f64().unwrap(), 0.0, "dead motor thrust zeroed");
    }
}
