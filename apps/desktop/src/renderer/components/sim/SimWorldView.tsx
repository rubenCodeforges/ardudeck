/**
 * SimWorldView — the in-app 3D simulator world.
 *
 * Renders the headless sim-engine's vehicle state (consumed via sim-state-store)
 * in a standalone three.js scene (see sim-world-scene.ts), with camera-mode
 * controls and a flight HUD overlay. Connects the state WebSocket whenever
 * ArduPilot SITL is running with ArduDeck Sim active (simStateWsPort present).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useSimStateStore, type SimStateMessage } from '../../stores/sim-state-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { createSimWorldScene, type SimWorldScene, type SimCameraMode, type SimVehicleFrame, type SimObstacle, type SimWaypoint } from './sim-world-scene';
import { FlightControlPanel } from '../panels/FlightControlPanel';
import ObstaclePanel from './ObstaclePanel';
import SimTestPanel from './SimTestPanel';
import { useSimObstaclesStore } from '../../stores/sim-obstacles-store';
import { useMissionStore } from '../../stores/mission-store';
import { useFenceStore } from '../../stores/fence-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useFleetTelemetryStore, type VehicleTelemetry } from '../../stores/fleet-telemetry-store';
import { useVehicleAppearanceStore, resolveVehicleColor } from '../../stores/vehicle-appearance-store';
import { useFleetVehicles, selectActiveVehicle, deselectActiveVehicle } from '../../hooks/useFleet';
import { useOrchestrationStore } from '../../stores/orchestration-store';
import { FleetCoordination } from '../fleet/FleetCoordination';
import { getVehicleClass } from '../../../shared/telemetry-types';
import { latLngToLocal, localToLatLng } from '../survey/geo-math';
import { loadElevationGrid, buildTerrainGeometry, sampleElevation } from '../camera/svt/svt-terrain';
import type { SimFence } from './sim-world-scene';
import { useSimFlightControlPanelStore } from '../../stores/sim-flight-control-panel-store';
import { useDraggableSnap } from '../../hooks/useDraggableSnap';
import { FighterHud, type FighterHudValues } from '../camera/hud/FighterHud';
import { resolveHudProfile } from '../camera/hud/hud-config';
import { useHudStore } from '../../stores/hud-store';
import { useLinkHistory } from '../camera/hud/useLinkHistory';
import { wrap180 } from '../camera/hud/hud-geometry';
import { bearingDeg, haversineMeters } from '../../utils/osd/live-telemetry';
import { MountPoint } from '../../modules/MountPoint';

/** Whether a vehicle's telemetry carries a usable GPS fix (matches useFleet). */
function hasGpsFix(t: VehicleTelemetry | undefined): t is VehicleTelemetry & { gps: NonNullable<VehicleTelemetry['gps']> } {
  return !!t?.gps && (t.gps.fixType ?? 0) >= 2 && (t.gps.lat !== 0 || t.gps.lon !== 0);
}

const CAMERA_MODES: Array<{ value: SimCameraMode; label: string; tip: string }> = [
  { value: 'chase', label: 'Chase', tip: 'Follow behind the vehicle along its heading' },
  { value: 'orbit', label: 'Orbit', tip: 'Drag to orbit, scroll to zoom' },
  { value: 'topdown', label: 'Top', tip: 'Top-down map-style view' },
  { value: 'fpv', label: 'FPV', tip: 'First-person view from the vehicle' },
];

function groundSpeed(vel: [number, number, number]): number {
  return Math.hypot(vel[0], vel[1]);
}

function rad2deg(r: number): number {
  return (r * 180) / Math.PI;
}

/**
 * Build a vehicle state from live MAVLink telemetry (attitude + global position),
 * converting lat/lon to local NED metres relative to the first valid fix. This is
 * what lets the 3D world show ANY connected vehicle - a normal SITL with its own
 * built-in physics, or real hardware - not just the ArduDeck Sim engine. Returns
 * null until there is a position fix.
 */
function telemetryToState(
  originRef: { current: { lat: number; lon: number } | null },
): SimStateMessage | null {
  const t = useTelemetryStore.getState();
  const { lat, lon, relativeAlt, vx, vy, vz } = t.position;
  if (lat === 0 && lon === 0) return null; // no fix yet
  if (!originRef.current) originRef.current = { lat, lon };
  const o = originRef.current;
  const north = (lat - o.lat) * 111320;
  const east = (lon - o.lon) * 111320 * Math.cos((o.lat * Math.PI) / 180);
  // telemetry-store attitude is in DEGREES (converted from MAVLink rad in the
  // main process); the scene's euler convention is RADIANS. Convert, else a 30°
  // bank becomes 30 radians and the vehicle tumbles.
  const d2r = Math.PI / 180;
  return {
    type: 'state',
    id: 'vehicle',
    home: { lat: o.lat, lng: o.lon, alt: 0, heading: 0 },
    timestamp: 0,
    position: [north, east, -relativeAlt],
    velocity: [vx, vy, vz],
    quaternion: [1, 0, 0, 0],
    euler: { roll: t.attitude.roll * d2r, pitch: t.attitude.pitch * d2r, yaw: t.attitude.yaw * d2r },
    batteryVoltage: t.battery.voltage > 0 ? t.battery.voltage : undefined,
  };
}

/**
 * Normalized motor activity 0..1 for driving prop spin, from real telemetry.
 *
 * Copters/VTOLs use SERVO_OUTPUT_RAW (the actual motor PWM, present even while
 * disarmed) so compassmot and motor test show real spin-up; their main-rail
 * outputs are all motors. Planes ride VFR_HUD throttle instead, since their
 * other outputs are control surfaces, not the prop. Rover/sub have no props.
 */
export function motorActivity01(
  vehicleClass: string | undefined,
  vfrThrottlePct: number | undefined,
  servoOutputs: number[] | undefined,
): number | undefined {
  const cls = vehicleClass ?? 'copter';
  if (cls === 'rover' || cls === 'sub') return undefined;
  const throttleFrac = Math.max(0, Math.min(1, (vfrThrottlePct ?? 0) / 100));
  if ((cls === 'copter' || cls === 'vtol') && servoOutputs && servoOutputs.length > 0) {
    let maxFrac = 0;
    for (const pwm of servoOutputs) {
      if (pwm < 1000) continue; // disabled / zero channel
      const frac = Math.min(1, (pwm - 1000) / 1000);
      if (frac > maxFrac) maxFrac = frac;
    }
    return Math.max(throttleFrac, maxFrac);
  }
  return throttleFrac;
}

export default function SimWorldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SimWorldScene | null>(null);
  const rafRef = useRef<number | null>(null);
  // Geo origin (first valid fix) for converting MAVLink lat/lon to local metres
  // when driving the world from telemetry rather than the ArduDeck Sim engine.
  const geoOriginRef = useRef<{ lat: number; lon: number } | null>(null);
  // Guard so a site's saved obstacle set is loaded only once per origin.
  const siteLoadedRef = useRef(false);
  // Origin key the synthetic-vision terrain was last built for (null = none).
  const terrainOriginRef = useRef<string | null>(null);
  // Live Q_ENABLE (the decisive VTOL signal). Read directly off the FC because a
  // detached window doesn't bulk-hydrate the parameter store; feeds getVehicleClass
  // so the 3D world picks the right per-airframe model.
  const qEnableRef = useRef<number | undefined>(undefined);

  const [cameraMode, setCameraMode] = useState<SimCameraMode>('chase');
  const [showTerrain, setShowTerrain] = useState(false);
  // Reference grid (spatial-perception aid over ground + SVT terrain). Default on.
  const [showGrid, setShowGrid] = useState(true);
  // Conformal 3D waypoint markers (billboard target reticles). Default on.
  const [showWaypoints, setShowWaypoints] = useState(true);
  // FPV-goggles HUD overlay (crosshair + pitch/roll ladder + tapes). Default on;
  // only rendered in FPV/Chase where a forward view makes it meaningful.
  const [showHud, setShowHud] = useState(true);
  // Physics X-ray overlay: thrust arrows + net-lift vector + CG markers + load
  // readouts. Off by default so the flight view stays clean. The rAF loop reads
  // the ref (its closure is created once); the state drives the button + HUD.
  const [showXray, setShowXray] = useState(false);
  const showXrayRef = useRef(false);
  // HUD is driven from a ref-fed React state sampled in the rAF loop (throttled
  // to ~10Hz) so we don't re-render the whole tree at 60fps.
  const [hud, setHud] = useState<SimStateMessage | null>(null);

  const status = useSimStateStore((s) => s.status);

  // ─── Connect / disconnect the state WS based on SITL status ──────────────────
  // Driven entirely off the main-process status (via IPC) so this works the same
  // whether rendered inline or in a detached pop-out window (where the SITL
  // zustand store is not hydrated).
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const st = await window.electronAPI.ardupilotSitlGetStatus();
        if (cancelled) return;
        if (st.isRunning && typeof st.simStateWsPort === 'number') {
          useSimStateStore.getState().connect(st.simStateWsPort);
        } else {
          useSimStateStore.getState().disconnect();
        }
      } catch {
        /* ignore — will retry on next poll */
      }
    };
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Disconnect when leaving the view entirely.
  useEffect(() => {
    return () => {
      useSimStateStore.getState().disconnect();
    };
  }, []);

  // Keep the live Q_ENABLE fresh (for VTOL model selection). Cheap targeted read
  // off the FC; re-polled so it survives reconnects and param changes.
  useEffect(() => {
    const readQ = () => {
      if (!useConnectionStore.getState().connectionState.isConnected) { qEnableRef.current = undefined; return; }
      void window.electronAPI?.readParameterBatch?.(['Q_ENABLE'])
        .then((res) => { const v = res?.values?.['Q_ENABLE']; qEnableRef.current = typeof v === 'number' ? v : undefined; })
        .catch(() => {});
    };
    readQ();
    const t = setInterval(readQ, 5000);
    return () => clearInterval(t);
  }, []);

  // Pull the FC mission once connected so this (detached) window's mission store
  // is populated; completion broadcasts keep it fresh thereafter.
  useEffect(() => {
    let fetched = false;
    const t = setInterval(() => {
      if (fetched) return;
      if (useConnectionStore.getState().connectionState.isConnected) {
        fetched = true;
        void window.electronAPI?.downloadMission?.();
        void window.electronAPI?.downloadFence?.();
      }
    }, 2000);
    return () => clearInterval(t);
  }, []);

  // ─── Scene lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const scene = createSimWorldScene(canvas);
    sceneRef.current = scene;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      scene.resize(rect.width, rect.height);
    };
    applySize();

    const ro = new ResizeObserver(applySize);
    ro.observe(container);

    let lastHud = 0;
    const loop = () => {
      const engine = useSimStateStore.getState().vehicles;
      let frames: SimVehicleFrame[];
      let primary: SimStateMessage | null;

      const known = Object.values(useActiveVehicleStore.getState().knownVehicles);

      if (engine.size > 0) {
        // Preferred source: the ArduDeck Sim engine (own physics, multi-vehicle).
        frames = Array.from(engine.values()).map((m) => ({
          id: m.id,
          position: m.position,
          quaternion: m.quaternion,
          euler: m.euler,
          // The engine streams normalized motor output; use it to spin the props
          // (and treat any real throttle as "active" so they turn while flying).
          throttle01: m.throttle,
          armed: (m.throttle ?? 0) > 0.02,
          // Physics X-ray internals (engine-only; sticky in the store).
          diagnostics: m.diagnostics,
          // Slung-load cable + payload (engine-only).
          load: m.load,
        }));
        const first = engine.values().next();
        primary = first.done ? null : first.value;
      } else if (known.length > 0) {
        // Fleet path: render EVERY known vehicle that has a fix, against one
        // shared geo origin, each tinted with its identity colour and labelled
        // by SYS id. The active vehicle is highlighted and drives the camera.
        const byVehicle = useFleetTelemetryStore.getState().byVehicle;
        const overrides = useVehicleAppearanceStore.getState().overrides;
        const activeKey = useActiveVehicleStore.getState().activeVehicleKey;

        // Lock the shared origin to the first vehicle with a fix (prefer the
        // active one so the world stays centred on what the operator is flying).
        if (!geoOriginRef.current) {
          const seed =
            known.find((v) => v.key === activeKey && hasGpsFix(byVehicle[v.key])) ??
            known.find((v) => hasGpsFix(byVehicle[v.key]));
          const seedTel = seed ? byVehicle[seed.key] : undefined;
          if (seed && hasGpsFix(seedTel)) geoOriginRef.current = { lat: seedTel.gps.lat, lon: seedTel.gps.lon };
        }

        const o = geoOriginRef.current;
        const multi = known.length > 1;
        frames = [];
        let activePrimary: SimStateMessage | null = null;
        let firstPrimary: SimStateMessage | null = null;
        if (o) {
          const d2r = Math.PI / 180;
          const cosLat = Math.cos((o.lat * Math.PI) / 180);
          for (const v of known) {
            const t = byVehicle[v.key];
            if (!hasGpsFix(t)) continue;
            const north = (t.gps.lat - o.lat) * 111320;
            const east = (t.gps.lon - o.lon) * 111320 * cosLat;
            const relAlt = t.position?.relativeAlt ?? 0;
            const att = t.attitude ?? { roll: 0, pitch: 0, yaw: 0 };
            const state: SimStateMessage = {
              type: 'state',
              id: v.key,
              home: { lat: o.lat, lng: o.lon, alt: 0, heading: 0 },
              timestamp: 0,
              position: [north, east, -relAlt],
              velocity: [t.position?.vx ?? 0, t.position?.vy ?? 0, t.position?.vz ?? 0],
              quaternion: [1, 0, 0, 0],
              euler: { roll: att.roll * d2r, pitch: att.pitch * d2r, yaw: att.yaw * d2r },
              batteryVoltage: t.battery && t.battery.voltage > 0 ? t.battery.voltage : undefined,
            };
            const isActive = v.key === activeKey;
            const cls = getVehicleClass(v.mavType, { qEnable: qEnableRef.current });
            frames.push({
              id: v.key,
              position: state.position,
              quaternion: state.quaternion,
              euler: state.euler,
              armed: t.flight?.armed ?? false,
              color: resolveVehicleColor(overrides, v.key, v.sysid),
              label: multi ? `SYS ${v.sysid}` : '',
              active: isActive && multi,
              vehicleClass: cls,
              throttle01: motorActivity01(cls, t.vfrHud?.throttle, t.servoOutput?.outputs),
            });
            if (isActive) activePrimary = state;
            if (!firstPrimary) firstPrimary = state;
          }
        }
        primary = activePrimary ?? firstPrimary;
      } else {
        // Universal fallback: drive the world from MAVLink telemetry, so ANY
        // SITL (built-in physics) - or a real connected vehicle - shows up here,
        // not only the ArduDeck Sim engine.
        primary = telemetryToState(geoOriginRef);
        const t = useTelemetryStore.getState();
        const cls = getVehicleClass(useConnectionStore.getState().connectionState.mavType, { qEnable: qEnableRef.current });
        frames = primary
          ? [{
              id: primary.id,
              position: primary.position,
              quaternion: primary.quaternion,
              euler: primary.euler,
              armed: t.flight?.armed ?? false,
              vehicleClass: cls,
              throttle01: motorActivity01(cls, t.vfrHud?.throttle, t.servoOutput?.outputs),
            }]
          : [];
      }

      // Obstacles (stored geographically) → NED for the scene, once we have an
      // origin. Also lazily load this site's saved obstacle set.
      let obstacles: SimObstacle[] | undefined;
      const origin = geoOriginRef.current;
      if (origin) {
        if (!siteLoadedRef.current) {
          siteLoadedRef.current = true;
          void useSimObstaclesStore.getState().loadForSite(origin.lat, origin.lon);
        }
        const authored = useSimObstaclesStore.getState().obstacles;
        if (authored.length > 0) {
          obstacles = authored.map((o) => {
            const local = latLngToLocal({ lat: origin.lat, lng: origin.lon }, { lat: o.lat, lng: o.lon });
            return { id: o.id, center: [local.y, local.x] as [number, number], shape: o.shape, radius: o.radius, height: o.height };
          });
        }
      }

      // Mission waypoints from the FC → NED for the scene.
      let waypoints: SimWaypoint[] | undefined;
      if (origin) {
        const items = useMissionStore.getState().missionItems;
        const wps = items
          .filter((it) => it.latitude !== 0 || it.longitude !== 0)
          .map((it) => {
            const local = latLngToLocal({ lat: origin.lat, lng: origin.lon }, { lat: it.latitude, lng: it.longitude });
            return { seq: it.seq, position: [local.y, local.x, -it.altitude] as [number, number, number] };
          });
        if (wps.length > 0) waypoints = wps;
      }

      // Geofences from the FC → NED rings for the scene.
      let fences: SimFence[] | undefined;
      if (origin) {
        const fs = useFenceStore.getState();
        const out: SimFence[] = [];
        for (const p of fs.polygons) {
          const points = p.vertices.map((v) => {
            const l = latLngToLocal({ lat: origin.lat, lng: origin.lon }, { lat: v.lat, lng: v.lon });
            return [l.y, l.x] as [number, number];
          });
          if (points.length >= 2) out.push({ id: p.id, kind: p.type, points });
        }
        for (const c of fs.circles) {
          const ctr = latLngToLocal({ lat: origin.lat, lng: origin.lon }, { lat: c.center.lat, lng: c.center.lon });
          const points: Array<[number, number]> = [];
          for (let i = 0; i <= 32; i++) {
            const t = (i / 32) * Math.PI * 2;
            points.push([ctr.y + Math.sin(t) * c.radius, ctr.x + Math.cos(t) * c.radius]);
          }
          out.push({ id: c.id, kind: c.type, points });
        }
        if (out.length > 0) fences = out;
      }

      scene.update({ vehicles: frames, obstacles, waypoints, fences, showDiagnostics: showXrayRef.current });
      scene.render();

      // Throttled HUD sample from the primary vehicle.
      const now = performance.now();
      if (now - lastHud > 100) {
        lastHud = now;
        setHud(primary);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Push camera mode to the scene.
  useEffect(() => {
    sceneRef.current?.setCameraMode(cameraMode);
  }, [cameraMode]);

  // Keep the rAF loop's X-ray flag in sync with the toggle.
  useEffect(() => {
    showXrayRef.current = showXray;
  }, [showXray]);

  // Push the reference-grid + conformal-waypoint toggles to the scene.
  useEffect(() => {
    sceneRef.current?.setGrid(showGrid);
  }, [showGrid]);
  useEffect(() => {
    sceneRef.current?.setWaypoints(showWaypoints);
  }, [showWaypoints]);

  // Reactive trigger that changes once a position fix exists (and as the vehicle
  // moves), so the terrain effect can build as soon as the home origin is set.
  const fixSignal = useTelemetryStore((s) =>
    s.position.lat !== 0 || s.position.lon !== 0
      ? `${Math.round(s.position.lat * 1000)},${Math.round(s.position.lon * 1000)}`
      : '',
  );

  // Synthetic-vision terrain: build the DEM mesh around the home origin (offset
  // so the home surface sits at y = 0, matching the NED vehicle frame), or clear
  // it. Rebuilds only when toggled or the origin changes.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!showTerrain) {
      if (terrainOriginRef.current !== null) {
        scene.setTerrain(null);
        terrainOriginRef.current = null;
      }
      return;
    }
    const origin = geoOriginRef.current;
    if (!origin) return; // no fix yet; fixSignal re-runs this when one arrives
    const key = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}`;
    if (terrainOriginRef.current === key) return;
    terrainOriginRef.current = key;
    let cancelled = false;
    void (async () => {
      try {
        const grid = await loadElevationGrid(origin.lat, origin.lon, 8000, 64);
        if (cancelled) return;
        const homeElev = sampleElevation(grid, origin.lat, origin.lon);
        sceneRef.current?.setTerrain(buildTerrainGeometry(grid), -homeElev);
      } catch {
        if (!cancelled) terrainOriginRef.current = null; // allow a later retry
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showTerrain, fixSignal]);

  // ─── Pointer / wheel handlers (orbit interaction) ────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Obstacle placement mode: a ground click drops a new obstacle.
    const obStore = useSimObstaclesStore.getState();
    const origin = geoOriginRef.current;
    if (obStore.placing && origin) {
      const canvas = canvasRef.current;
      const scene = sceneRef.current;
      if (canvas && scene) {
        const rect = canvas.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        const hit = scene.pickGround(ndcX, ndcY);
        if (hit) {
          const [north, east] = hit;
          const ll = localToLatLng({ lat: origin.lat, lng: origin.lon }, east, north);
          obStore.add({ lat: ll.lat, lon: ll.lng, ...obStore.draft });
          obStore.setPlacing(false);
        }
      }
      return; // don't start an orbit drag
    }
    sceneRef.current?.onPointerDown(e.clientX, e.clientY);
  }, []);
  const onPointerMove = useCallback((e: React.PointerEvent) => {
    sceneRef.current?.onPointerMove(e.clientX, e.clientY);
  }, []);
  const onPointerUp = useCallback(() => {
    sceneRef.current?.onPointerUp();
  }, []);
  const onWheel = useCallback((e: React.WheelEvent) => {
    sceneRef.current?.onWheel(e.deltaY);
  }, []);

  const altitude = hud ? -hud.position[2] : 0;
  const speed = hud ? groundSpeed(hud.velocity) : 0;

  // Recognition is driven by the live MAVLink connection (standard SITL or real
  // hardware), not by the optional ArduDeck sim engine. A vehicle renders once
  // we have a position fix (hud); before that we still acknowledge the link.
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const hasFix = useTelemetryStore((s) => s.position.lat !== 0 || s.position.lon !== 0);
  const engineConnected = status === 'connected';
  const live = engineConnected || hud !== null;
  const pillLabel = engineConnected
    ? 'Sim Connected'
    : hud
      ? 'Vehicle Live'
      : isConnected
        ? 'Connected — waiting for GPS'
        : status === 'connecting'
          ? 'Connecting...'
          : 'Waiting for SITL';
  // Amber = connected/handshaking but no vehicle on screen yet.
  const pending = !live && (isConnected || status === 'connecting');

  return (
    <div ref={containerRef} className="relative h-full w-full bg-surface-base overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />

      {/* FPV HUD overlay — the SAME green fighter HUD the telemetry Vision panel
          uses (FighterHud), fed from the sampled sim `hud` state. Only in FPV/
          Chase, where a forward view makes it meaningful; hidden in Orbit/Top.
          Sits above the canvas but below the controls, and ignores pointer events. */}
      {showHud && hud && (cameraMode === 'fpv' || cameraMode === 'chase') && (
        <SimFighterHud hud={hud} />
      )}

      {/* Top-right controls: synthetic-vision terrain toggle + camera mode */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        <button
          onClick={() => setShowTerrain((v) => !v)}
          data-tip="Show real elevation terrain (synthetic vision) under the vehicles"
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            showTerrain ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          Terrain
        </button>
        <button
          onClick={() => setShowXray((v) => !v)}
          data-tip="Physics X-ray: force budget through the CG (thrust, weight, drag, net resultant), per-motor arrows, CG markers and g-load (ArduDeck sim engine only)"
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            showXray ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          X-ray
        </button>
        <button
          onClick={() => setShowGrid((v) => !v)}
          data-tip="Reference grid — a spatial-perception aid that stays visible over both the flat ground and the SVT terrain"
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            showGrid ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          Grid
        </button>
        <button
          onClick={() => setShowWaypoints((v) => !v)}
          data-tip="Conformal 3D waypoint markers — target reticles floating at each waypoint's true position + altitude, with number and live slant-range"
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            showWaypoints ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          Waypoints
        </button>
        <button
          onClick={() => setShowHud((v) => !v)}
          data-tip="FPV HUD overlay — boresight, pitch/roll horizon ladder, airspeed/altitude, heading and climb rate (FPV & Chase views)"
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            showHud ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          HUD
        </button>
        <div className="flex overflow-hidden rounded-lg border border-subtle shadow-lg">
          {CAMERA_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setCameraMode(m.value)}
              data-tip={m.tip}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                cameraMode === m.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-raised text-content-secondary hover:text-content'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* X-ray force-arrow legend: a single compact row (dot + label per force),
          not a card, so it reads at a glance without covering the view. Tucked
          in the bottom-left corner, clear of every other overlay. */}
      {showXray && hud?.diagnostics && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2.5 rounded-md bg-surface-raised/80 backdrop-blur-sm px-2 py-1 text-[10px] text-content-tertiary pointer-events-none">
          <LegendDot swatch="linear-gradient(90deg,#38bdf8,#ef4444)" label="Thrust" />
          <LegendDot color="#fef08a" label="Lift" />
          <LegendDot color="#9ca3af" label="Weight" />
          <LegendDot color="#f97316" label="Drag" />
          <LegendDot color="#ffffff" outline label="Net" />
        </div>
      )}

      {/* Connection status pill */}
      <div className="absolute top-3 left-3 z-10">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
            live
              ? 'bg-green-500/10 text-green-400 border-green-500/30'
              : pending
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                : 'bg-surface-raised text-content-secondary border-subtle'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              live
                ? 'bg-green-400'
                : pending
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-zinc-500'
            }`}
          />
          {pillLabel}
        </div>
      </div>

      {/* Fleet vehicle picker (multi-vehicle only) — tap a chip to follow + command it. */}
      <FleetPicker />

      {/* Fleet ops (multi-vehicle only) — synchronized takeoff + formations over the engine. */}
      <FleetOpsPanel />

      {/* Test Conditions bench: motor faults, payload, wind, GPS/nav, sensors.
          Adapts to the active physics (engine live-control vs built-in SIM_*). */}
      <SimTestPanel />

      {/* Obstacle authoring + fence-hack */}
      <ObstaclePanel />

      {/* Bottom-centre: telemetry HUD for the selected vehicle. Wrapper ignores
          pointer events so the canvas stays draggable around the tiles. */}
      <div className="absolute bottom-3 inset-x-0 z-10 flex flex-col items-center gap-2 px-3 pointer-events-none">
        {hud && (
          <div className="flex items-end gap-2 flex-wrap justify-center pointer-events-auto">
            <HudTile label="ALT" value={altitude.toFixed(1)} unit="m" tip="Altitude above home (-position.down)" />
            <HudTile label="SPD" value={speed.toFixed(1)} unit="m/s" tip="Ground speed from horizontal velocity" />
            <HudTile label="ROLL" value={rad2deg(hud.euler.roll).toFixed(0)} unit="°" tip="Roll attitude" />
            <HudTile label="PITCH" value={rad2deg(hud.euler.pitch).toFixed(0)} unit="°" tip="Pitch attitude" />
            <HudTile label="YAW" value={((rad2deg(hud.euler.yaw) + 360) % 360).toFixed(0)} unit="°" tip="Heading" />
            {typeof hud.batteryVoltage === 'number' && (
              <HudTile label="BATT" value={hud.batteryVoltage.toFixed(1)} unit="V" tip="Loaded battery voltage" />
            )}
            {hud.load && (
              <HudTile
                label="SLING"
                value={hud.load.attached ? hud.load.tension.toFixed(0) : 'REL'}
                unit={hud.load.attached ? 'N' : ''}
                tip={hud.load.attached
                  ? `Slung-load cable tension (cable ${hud.load.cableLength.toFixed(1)} m)`
                  : 'Load released'}
                accent={hud.load.attached ? undefined : 'amber'}
              />
            )}
            {showXray && hud.diagnostics && (
              <>
                <HudTile
                  label="LOAD"
                  value={hud.diagnostics.loadFactor.toFixed(2)}
                  unit="g"
                  tip="Airframe load factor (specific force / g). 1.0 in level hover; higher in pull-ups / hard turns"
                  accent={hud.diagnostics.loadFactor > 4 ? 'red' : hud.diagnostics.loadFactor > 2 ? 'amber' : undefined}
                />
                <HudTile label="ARM MAX" value={hud.diagnostics.maxArmMoment.toFixed(1)} unit="N·m" tip="Worst per-arm bending moment (thrust x arm length)" />
                <HudTile
                  label="THRUST"
                  value={Math.hypot(...hud.diagnostics.netThrustBody).toFixed(0)}
                  unit="N"
                  tip="Total rotor thrust (cyan-to-red per-motor arrows)"
                />
                <HudTile label="WEIGHT" value={hud.diagnostics.weight.toFixed(0)} unit="N" tip="Gravity, m·g (grey arrow, straight down)" />
                <HudTile
                  label="DRAG"
                  value={Math.hypot(
                    hud.diagnostics.airframeDragBody[0] + hud.diagnostics.momentumDragBody[0],
                    hud.diagnostics.airframeDragBody[1] + hud.diagnostics.momentumDragBody[1],
                    hud.diagnostics.airframeDragBody[2] + hud.diagnostics.momentumDragBody[2],
                  ).toFixed(0)}
                  unit="N"
                  tip="Airframe parasitic + rotor momentum drag (orange arrow)"
                />
                <HudTile
                  label="NET"
                  value={Math.hypot(...hud.diagnostics.netForceWorld).toFixed(0)}
                  unit="N"
                  tip="Net resultant force accelerating the airframe (white arrow); near zero in a steady hover"
                  accent={Math.hypot(...hud.diagnostics.netForceWorld) > hud.diagnostics.weight * 0.5 ? 'amber' : undefined}
                />
                <MotorBars diag={hud.diagnostics} />
              </>
            )}
          </div>
        )}
      </div>

      {/* Flight controls for the SELECTED vehicle — the exact telemetry-screen
          control panel (class-aware modes, per-class takeoff, mission, squad +
          orchestrator routing), so commanding behaves identically here. Draggable
          (same magnet-snap-and-remember mechanics as the fleet radar), defaults to
          the lower right on first show. */}
      {(isConnected || activeVehicleKey !== null) && <DraggableFlightControlPanel />}

      {/* Empty state when there's no vehicle to show */}
      {!hud && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-surface-overlay backdrop-blur-sm px-6 py-5 rounded-xl text-center max-w-sm pointer-events-auto">
            <div className="text-content-secondary text-sm mb-1">
              {isConnected
                ? hasFix
                  ? 'Acquiring vehicle state…'
                  : 'Connected — waiting for GPS fix'
                : 'No vehicle connected'}
            </div>
            <div className="text-content-tertiary text-xs mb-4">
              {isConnected
                ? 'The vehicle will appear here once it has a position fix. Any connected SITL or aircraft works — the ArduDeck sim engine is optional.'
                : 'Connect to SITL (or a vehicle) from the main window and it will appear here.'}
            </div>
            <button
              onClick={() => window.electronAPI?.focusMainWindow?.()}
              data-tip="Bring ArduDeck's main window forward"
              className="px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-colors"
            >
              Focus main window
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Vehicle picker rail (multi-vehicle only). Each chip is the vehicle's identity
 * colour + SYS id; tapping it makes that vehicle active so the camera follows it,
 * the HUD reads it, and flight commands retarget to it. Tapping the active chip
 * again deselects. Mirrors the fleet strip on the main telemetry view, which is
 * not present in this pop-out window.
 */
function FleetPicker() {
  const vehicles = useFleetVehicles();
  if (vehicles.length < 2) return null;
  const sorted = [...vehicles].sort((a, b) => a.sysid - b.sysid);
  const overrides = useVehicleAppearanceStore.getState().overrides;
  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-3 z-10 flex flex-col gap-1.5 max-h-[70%] overflow-y-auto pr-1">
      {sorted.map((v) => {
        const color = resolveVehicleColor(overrides, v.key, v.sysid);
        return (
          <button
            key={v.key}
            onClick={() => (v.isActive ? deselectActiveVehicle() : selectActiveVehicle(v.key, v.transportId))}
            data-tip={v.isActive ? `${v.label} - click to deselect` : `${v.label} - ${v.mode}${v.armed ? ' - ARMED' : ''}`}
            className={`flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg border border-subtle text-xs font-medium text-content shadow-md transition-colors ${
              v.isActive
                ? 'bg-surface-solid'
                : 'bg-surface-raised hover:bg-surface-solid'
            }`}
            style={v.isActive ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
          >
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: v.position ? 'none' : '0 0 0 1px rgba(127,127,127,0.5)' }} />
            <span className="font-mono">{v.label}</span>
            {!v.position && <span className="text-[9px] text-content-tertiary">no fix</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Fleet ops panel (multi-vehicle only). Multi-vehicle is orchestrator-first: when
 * an orchestration engine is connected this hosts the engine-backed group ops -
 * synchronized take-off-all and follow-the-leader formations (FleetCoordination).
 * Without an engine it points the operator at the multi-vehicle engine, since the
 * fleet should be flown over the orchestrator (for SITL, exclusively). Per-vehicle
 * commanding stays on the docked FlightControlPanel (the active vehicle).
 */
function FleetOpsPanel() {
  const vehicles = useFleetVehicles();
  const hasEngine = useOrchestrationStore((s) => Object.keys(s.servers).length > 0);
  const [collapsed, setCollapsed] = useState(false);
  if (vehicles.length < 2) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-64 bg-surface-overlay backdrop-blur-sm border border-subtle rounded-xl shadow-xl text-content overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-content-secondary hover:text-content transition-colors"
      >
        <span>Fleet ops ({vehicles.length})</span>
        <span className="text-content-tertiary">{collapsed ? '▾' : '▴'}</span>
      </button>
      {!collapsed && (
        hasEngine ? (
          <FleetCoordination />
        ) : (
          <div className="px-3 pb-3 -mt-1 text-[11px] text-content-secondary leading-relaxed">
            Multi-vehicle ops run over the engine. Start the multi-vehicle engine from the
            connection screen to take off and form up the whole fleet together. Single-vehicle
            commands stay on the bar below.
          </div>
        )
      )}
    </div>
  );
}

/** One inline dot + label in the X-ray force legend row. `color` is a solid
    dot; `swatch` is a raw CSS background (the thrust ramp gradient). `outline`
    draws a ring instead of a fill, for the white dot to stay visible against
    a light background. */
function LegendDot({
  color,
  swatch,
  outline,
  label,
}: {
  color?: string;
  swatch?: string;
  outline?: boolean;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1 whitespace-nowrap">
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${outline ? 'border border-content-tertiary' : ''}`}
        style={{ background: swatch ?? (outline ? 'transparent' : color) }}
      />
      {label}
    </span>
  );
}

/** The flight-control panel, free-floating over the 3D world. Drag its header to
 *  move it; the same magnet-snap-and-remember mechanics as the fleet radar
 *  (useDraggableSnap), backed by its own position store. Defaults to the lower
 *  right, matching where it used to sit fixed. */
function DraggableFlightControlPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const x = useSimFlightControlPanelStore((s) => s.x);
  const y = useSimFlightControlPanelStore((s) => s.y);
  const collapsed = useSimFlightControlPanelStore((s) => s.collapsed);
  const setPos = useSimFlightControlPanelStore((s) => s.setPos);
  const persist = useSimFlightControlPanelStore((s) => s.persist);
  const toggleCollapsed = useSimFlightControlPanelStore((s) => s.toggleCollapsed);
  const { onHandlePointerDown } = useDraggableSnap(panelRef, { setPos, persist });

  // Keep the panel on-screen: seed a default lower-right position on first show,
  // and re-clamp into view on every window resize (and whenever it collapses /
  // expands, since the height changes). Without this a position saved for one
  // window size (a larger pop-out, the docked panel) leaves it parked off-screen.
  const clampIntoView = useCallback(() => {
    const w = panelRef.current?.offsetWidth ?? 288; // w-72
    const h = panelRef.current?.offsetHeight ?? 460;
    const maxX = Math.max(12, window.innerWidth - w - 12);
    const maxY = Math.max(12, window.innerHeight - h - 12);
    const store = useSimFlightControlPanelStore.getState();
    if (store.x === null || store.y === null) {
      store.setPos(maxX, maxY);
      store.persist();
      return;
    }
    const nx = Math.min(Math.max(12, store.x), maxX);
    const ny = Math.min(Math.max(12, store.y), maxY);
    if (nx !== store.x || ny !== store.y) {
      store.setPos(nx, ny);
      store.persist();
    }
  }, []);

  useEffect(() => {
    clampIntoView();
    window.addEventListener('resize', clampIntoView);
    return () => window.removeEventListener('resize', clampIntoView);
  }, [clampIntoView]);

  // Re-clamp after a collapse/expand so expanding near the bottom edge doesn't
  // push the body below the viewport.
  useEffect(() => {
    clampIntoView();
  }, [collapsed, clampIntoView]);

  return (
    <div
      ref={panelRef}
      className={`absolute z-20 w-72 rounded-xl border border-subtle shadow-2xl overflow-hidden pointer-events-auto flex flex-col ${collapsed ? '' : 'h-[460px] max-h-[78vh]'}`}
      style={{ left: x ?? -9999, top: y ?? -9999 }}
    >
      <div
        className="flex items-center gap-1.5 px-2 py-1 bg-surface-solid border-b border-subtle cursor-move shrink-0"
        onPointerDown={onHandlePointerDown}
        data-tip="Drag to move - magnets to panel & window edges"
      >
        <svg width="9" height="11" viewBox="0 0 9 11" className="text-content-tertiary" aria-hidden="true">
          {[2, 5.5, 9].map((cy) => [2, 7].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" fill="currentColor" />))}
        </svg>
        <span className="text-[10px] font-medium text-content-tertiary uppercase tracking-wide">Flight Control</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleCollapsed}
          className="ml-auto -mr-0.5 flex h-5 w-5 items-center justify-center rounded text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
          data-tip={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand flight control panel' : 'Collapse flight control panel'}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform ${collapsed ? '' : 'rotate-180'}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-hidden">
          <FlightControlPanel />
        </div>
      )}
    </div>
  );
}

function HudTile({ label, value, unit, tip, accent }: { label: string; value: string; unit: string; tip: string; accent?: 'amber' | 'red' }) {
  const valueClass = accent === 'red' ? 'text-red-400' : accent === 'amber' ? 'text-amber-400' : 'text-content';
  return (
    <div
      data-tip={tip}
      className="bg-surface-overlay backdrop-blur-sm border border-subtle rounded-lg px-3 py-2 min-w-[68px] text-center"
    >
      <div className="text-[10px] font-medium text-content-tertiary tracking-wide">{label}</div>
      <div className={`text-lg font-semibold leading-tight tabular-nums ${valueClass}`}>
        {value}
        <span className="text-xs text-content-secondary ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

/**
 * FPV HUD overlay for the sim world — renders the SAME green fighter HUD the
 * telemetry Vision panel uses (FighterHud), so the sim view and the live camera
 * view share one instrument set. It mirrors LiveFighterHud's data build: the
 * CORE flight state (roll/pitch/heading/altitude/airspeed/vario/vx-vz/throttle)
 * comes from the physics `hud` (sim-state, NED + radians) so the HUD tracks the
 * engine, while every field sim-state lacks — battery, GPS, mode/armed, home,
 * wind, nav solution and the RC-link sparkline — is pulled from the SAME real
 * stores the Vision panel uses (populated in this window by
 * useDetachedSubscriptions). Config comes from the shared hud-store so the
 * operator's instrument selection + styling carry over identically. The
 * cameraOverlay MountPoint hosts module HUD overlays (CCIP/CCRP) when a module
 * runtime is present in the window (renders nothing otherwise). Full-screen
 * overlay above the canvas, below the controls; ignores pointer events.
 */
function SimFighterHud({ hud }: { hud: SimStateMessage }) {
  const t = useTelemetryStore();
  const home = useMissionStore((s) => s.homePosition);
  const config = useHudStore((s) => s.config);
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const profile = resolveHudProfile(config.profile, mavType);
  const widgets = profile === 'ground' ? config.widgetsGround : config.widgets;
  const linkHistory = useLinkHistory(widgets.linkGraph);

  // Core flight state from the physics engine (sim-state), radians → degrees.
  const heading = ((rad2deg(hud.euler.yaw) % 360) + 360) % 360;
  const speed = groundSpeed(hud.velocity);

  // Home arrow + distance from the real telemetry fix (as the Vision panel does),
  // taken relative to the sim heading the compass tape actually shows.
  const lat = t.gps.lat || t.position.lat;
  const lon = t.gps.lon || t.position.lon;
  let distance = 0;
  let homeDirection = 0;
  if (home && (lat || lon)) {
    distance = haversineMeters(lat, lon, home.lat, home.lon);
    homeDirection = wrap180(bearingDeg(lat, lon, home.lat, home.lon) - heading);
  }

  // Rover steering (mirror LiveFighterHud) so a ground-profile sim reads right.
  let steer: number | undefined;
  const steerPwm = t.servoOutput?.outputs[0];
  if (steerPwm && steerPwm >= 800 && steerPwm <= 2200) {
    steer = Math.max(-100, Math.min(100, ((steerPwm - 1500) / 500) * 100));
  }

  const v: FighterHudValues = {
    // ─ CORE flight state: physics engine (sim-state). FighterHud wants degrees.
    roll: rad2deg(hud.euler.roll),
    pitch: rad2deg(hud.euler.pitch),
    heading,
    airspeed: speed,
    groundspeed: speed,
    altitude: -hud.position[2], // NED down → up
    vario: -hud.velocity[2],
    throttle: (hud.throttle ?? 0) * 100, // normalized 0..1 → percent
    vx: hud.velocity[0],
    vy: hud.velocity[1],
    vz: hud.velocity[2],
    // ─ Everything sim-state lacks: the real telemetry store (like Vision panel).
    batteryVoltage: hud.batteryVoltage ?? t.battery.voltage,
    batteryPercent: t.battery.remaining,
    current: t.battery.current,
    mode: t.flight.mode,
    armed: t.flight.armed,
    distance,
    homeDirection,
    gpsSats: t.gps.satellites,
    hdop: t.gps.hdop,
    lat,
    lon,
    windSpeed: t.wind?.speed,
    linkHistory,
    linkLabel: 'RC LINK',
    steer,
    wpDistance: t.navController?.wpDist,
    xtrackError: t.navController?.xtrackError,
  };

  return (
    <div className="absolute inset-0 z-[5] pointer-events-none">
      <FighterHud v={v} config={config} profile={profile} />
      {/* Module-contributed HUD overlays (e.g. release-point CCIP/CCRP). Renders
          nothing unless a module runtime is mounted in this window. */}
      <MountPoint name="cameraOverlay" />
    </div>
  );
}

/**
 * Per-motor thrust mini-bar strip: one bar per motor, height = normalized command,
 * tinted cool->hot by its arm-load ratio (matching the 3D thrust arrows). An
 * at-a-glance read of which corner is working hardest.
 */
function MotorBars({ diag }: { diag: NonNullable<SimStateMessage['diagnostics']> }) {
  return (
    <div
      data-tip="Per-motor output (bar height = throttle command, colour = arm load)"
      className="bg-surface-overlay backdrop-blur-sm border border-subtle rounded-lg px-3 py-2 flex items-end gap-1 h-[52px]"
    >
      {diag.motors.map((m, i) => {
        const h = Math.max(6, Math.round(Math.max(0, Math.min(1, m.command)) * 34) + 2);
        // Cool (#38bdf8) -> hot (#ef4444) by arm load ratio.
        const r = Math.max(0, Math.min(1, m.armLoadRatio));
        const color = `rgb(${Math.round(56 + (239 - 56) * r)}, ${Math.round(189 + (68 - 189) * r)}, ${Math.round(248 + (68 - 248) * r)})`;
        return <div key={i} className="w-1.5 rounded-sm" style={{ height: `${h}px`, background: color }} />;
      })}
    </div>
  );
}
