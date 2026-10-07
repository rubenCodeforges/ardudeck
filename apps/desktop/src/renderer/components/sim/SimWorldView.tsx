/**
 * SimWorldView — the in-app 3D simulator world.
 *
 * Renders the headless sim-engine's vehicle state (consumed via sim-state-store)
 * in a standalone three.js scene (see sim-world-scene.ts), with camera-mode
 * controls and a flight HUD overlay. Connects the state WebSocket whenever
 * ArduPilot SITL is running with ArduDeck Sim active (simStateWsPort present).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { SvtImageryPicker } from '../camera/svt/SvtImageryPicker';
import { useTranslation } from 'react-i18next';
import { useSimStateStore, type SimStateMessage } from '../../stores/sim-state-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { createSimWorldScene, type SimWorldScene, type SimCameraMode, type SimVehicleFrame, type SimObstacle, type SimWaypoint } from './sim-world-scene';
import { FlightControlPanel } from '../panels/FlightControlPanel';
import ObstaclePanel from './ObstaclePanel';
import SimTestPanel from './SimTestPanel';
import { SimStreamControl } from './SimStreamControl';
import { useSimObstaclesStore } from '../../stores/sim-obstacles-store';
import { useMissionStore } from '../../stores/mission-store';
import { useFenceStore } from '../../stores/fence-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useActiveVehicleStore, formationOf } from '../../stores/active-vehicle-store';
import { useFleetTelemetryStore, type VehicleTelemetry } from '../../stores/fleet-telemetry-store';
import { useVehicleAppearanceStore, resolveVehicleColor } from '../../stores/vehicle-appearance-store';
import { useFleetVehicles, selectActiveVehicle, deselectActiveVehicle, type FleetVehicle } from '../../hooks/useFleet';
import { useOrchestrationStore } from '../../stores/orchestration-store';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useFormationStore } from '../../stores/formation-store';
import { useFleetUiStore, isFleetExpanded } from '../../stores/fleet-ui-store';
import { useFormationControl } from '../../hooks/useFormationControl';
import { FleetCoordination } from '../fleet/FleetCoordination';
import { FleetChevron, FleetCountHeader } from '../fleet/FleetDisclosure';
import { FleetContextMenu } from '../fleet/FleetContextMenu';
import { startVehicleDrag, readVehicleDrag, allowVehicleDrop, FREE_ZONE } from '../fleet/fleet-dnd';
import { getVehicleClass } from '../../../shared/telemetry-types';
import type { VehicleInfoIpc } from '../../../shared/ipc-channels';
import { latLngToLocal, localToLatLng } from '../survey/geo-math';
import {
  loadElevationGrid,
  buildTerrainGeometry,
  sampleElevation,
  type ElevationGrid,
} from '../camera/svt/svt-terrain';
import {
  WIDE_RING_SPANS_M,
  loadDrapeRings,
  validImagery,
  recenterDistanceM,
} from '../camera/svt/svt-satellite';
import { useCameraStore } from '../../stores/camera-store';

/** The sim world is a local patch about the launch point, not the wide SVT
 * one, so the quality level maps to its own densities. */
const SIM_PATCH_HALF_M = 8_000;
const SIM_TERRAIN_RES: Record<'low' | 'medium' | 'high', number> = {
  low: 48,
  medium: 96,
  high: 160,
};

/**
 * Imagery range per quality level, sim world only (the vision panel's cockpit
 * view is right as it is).
 *
 * The tile budget rises with the span so the sharp ring keeps the imagery's
 * native zoom instead of trading detail for size: more range costs texture
 * memory, which is exactly what the quality setting is there to choose.
 */
const SIM_DRAPE: Record<'low' | 'medium' | 'high', { spans: number[]; inner: number; outer: number }> = {
  low: { spans: [800, 2_500, Infinity], inner: 12, outer: 6 },
  medium: { spans: [1_000, 3_500, Infinity], inner: 16, outer: 9 },
  high: { spans: [1_536, 6_000, Infinity], inner: 24, outer: 12 },
};
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
/**
 * Best available global position for a fleet vehicle. Prefer a real GPS fix,
 * but fall back to the EKF / global position (GLOBAL_POSITION_INT) that the HUD
 * and terrain-follow already use, so the 3D world anchors whenever telemetry
 * shows a position, not only when raw GPS_RAW_INT reports a fix. A vehicle can
 * have a valid fused position with no raw GPS fix (non-GPS nav, or the fleet
 * store simply never received GPS_RAW for it), which used to leave the world
 * with no origin even though telemetry worked. Returns null when neither
 * source has a position.
 */
function vehicleLatLon(t: VehicleTelemetry | undefined): { lat: number; lon: number } | null {
  const g = t?.gps;
  if (g && (g.fixType ?? 0) >= 2 && (g.lat !== 0 || g.lon !== 0)) return { lat: g.lat, lon: g.lon };
  const p = t?.position;
  if (p && (p.lat !== 0 || p.lon !== 0)) return { lat: p.lat, lon: p.lon };
  return null;
}

/** The flat telemetry store's position (what the HUD/terrain-follow use), or
 *  null before a fix. The last-resort origin anchor for a single primary
 *  vehicle whose fleet-store row lacks any position. */
function flatLatLon(): { lat: number; lon: number } | null {
  const p = useTelemetryStore.getState().position;
  return p.lat !== 0 || p.lon !== 0 ? { lat: p.lat, lon: p.lon } : null;
}

const CAMERA_MODES: Array<{ value: SimCameraMode; labelKey: string; tipKey: string }> = [
  { value: 'chase', labelKey: 'sim:worldView.camera.chase', tipKey: 'sim:worldView.camera.chaseTip' },
  { value: 'orbit', labelKey: 'sim:worldView.camera.orbit', tipKey: 'sim:worldView.camera.orbitTip' },
  { value: 'topdown', labelKey: 'sim:worldView.camera.top', tipKey: 'sim:worldView.camera.topTip' },
  { value: 'fpv', labelKey: 'sim:worldView.camera.fpv', tipKey: 'sim:worldView.camera.fpvTip' },
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

/**
 * Map the selected SITL copter frame model (e.g. 'octaquad', 'hexa', 'y6') to the
 * ardudeck-frame crate's class/type so the generated frame matches the chosen
 * layout - critically distinguishing coax classes (octaquad/y6/dodecahexa) from
 * flat ones, which a motor count alone cannot. Returns undefined for non-copter
 * vehicles (they keep their GLB model).
 */
function copterFrameClass(model: string | undefined, vehicleType: string): { frameClass: string; frameType: string } | undefined {
  if (vehicleType !== 'copter') return undefined;
  const m = (model ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!m) return undefined;
  if (m.includes('octaquad') || m.includes('octoquad') || m.includes('x8')) return { frameClass: 'octa_quad', frameType: 'x' };
  if (m.includes('dodeca')) return { frameClass: 'dodeca_hexa', frameType: 'x' };
  if (m.includes('y6')) return { frameClass: 'y6', frameType: 'y6_b' };
  if (m.includes('octa') || m.includes('octo')) return { frameClass: 'octa', frameType: 'x' };
  if (m.includes('deca')) return { frameClass: 'deca', frameType: 'x' };
  if (m.includes('hexa') || m.includes('hex')) return { frameClass: 'hexa', frameType: 'x' };
  if (m.includes('coax')) return { frameClass: 'coax_copter', frameType: 'plus' };
  if (m.includes('tri')) return { frameClass: 'tri', frameType: 'x' };
  if (m.includes('single')) return { frameClass: 'single_copter', frameType: 'plus' };
  if (m.includes('quad')) return { frameClass: 'quad', frameType: m.includes('plus') ? 'plus' : 'x' };
  return undefined;
}

export default function SimWorldView() {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<SimWorldScene | null>(null);
  // Real-build inputs for the procedural frame generator: the launched custom
  // frame (disc area / mass / motor count read off disk in main) and the active
  // vehicle profile. Subscribed so a frame/profile switch regenerates the mesh.
  const customFramePath = useArduPilotSitlStore((s) => s.customFramePath);
  const sitlModel = useArduPilotSitlStore((s) => s.model);
  const sitlVehicleType = useArduPilotSitlStore((s) => s.vehicleType);
  const activeVehicle = useSettingsStore((s) => s.getActiveVehicle());
  const rafRef = useRef<number | null>(null);
  // Mission waypoints projected to scene-local NED, cached against the mission
  // items array identity + origin so the render loop reprojects only on change.
  const wpCacheRef = useRef<{
    items: unknown;
    lat: number;
    lon: number;
    wps: SimWaypoint[] | undefined;
  }>({ items: null, lat: NaN, lon: NaN, wps: undefined });
  // Geo origin (first valid fix) for converting MAVLink lat/lon to local metres
  // when driving the world from telemetry rather than the ArduDeck Sim engine.
  const geoOriginRef = useRef<{ lat: number; lon: number } | null>(null);
  // Bumped when the world's geo anchor moves, so the terrain rebuilds around it.
  const [originRev, setOriginRev] = useState(0);
  // Guard so a site's saved obstacle set is loaded only once per origin.
  const siteLoadedRef = useRef(false);
  // Origin key the synthetic-vision terrain was last built for (null = none).
  const terrainOriginRef = useRef<string | null>(null);
  // Live Q_ENABLE (the decisive VTOL signal). Read directly off the FC because a
  // detached window doesn't bulk-hydrate the parameter store; feeds getVehicleClass
  // so the 3D world picks the right per-airframe model.
  const qEnableRef = useRef<number | undefined>(undefined);

  const [cameraMode, setCameraMode] = useState<SimCameraMode>('orbit');
  const [showTerrain, setShowTerrain] = useState(false);
  const satellite = useCameraStore((s) => s.svtSatellite);
  const imagery = useCameraStore((s) => validImagery(s.svtImagery));
  const quality = useCameraStore((s) => s.svtQuality);
  const setSvtSatellite = useCameraStore((s) => s.setSvtSatellite);
  const setSvtQuality = useCameraStore((s) => s.setSvtQuality);
  const [showTerrainMenu, setShowTerrainMenu] = useState(false);
  // The grid the drape follows; cleared when terrain is switched off.
  const [simGrid, setSimGrid] = useState<ElevationGrid | null>(null);
  // Local NED metres the imagery rings are currently centred on.
  const drapeCenterRef = useRef<{ north: number; east: number } | null>(null);
  // The loop reads the live spans to know how closely to follow.
  const spansRef = useRef<number[]>(SIM_DRAPE.medium.spans);
  const [drapeCenter, setDrapeCenter] = useState<{ north: number; east: number } | null>(null);
  // Terrain toggle feedback: pending while the DEM downloads, and a brief
  // inline note when the toggle has to revert (fetch failed / no GPS origin).
  const [terrainPending, setTerrainPending] = useState(false);
  const [terrainError, setTerrainError] = useState<string | null>(null);
  // Reference grid (spatial-perception aid over ground + SVT terrain). Default on.
  const [showGrid, setShowGrid] = useState(true);
  // Conformal 3D waypoint markers (billboard target reticles). Default on.
  const [showWaypoints, setShowWaypoints] = useState(true);
  // FPV-goggles HUD overlay (crosshair + pitch/roll ladder + tapes). Default OFF;
  // only meaningful in FPV/Chase, and the toggle is disabled in Orbit/Top.
  const [showHud, setShowHud] = useState(false);
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
        // Identity parity with the fleet path below: engine ids ("v1") are not
        // fleet keys, so match to the connected fleet by the id's trailing index
        // (the engine numbers vehicles 1..N like SITL sysids). When no fleet row
        // matches, the parsed index still yields a stable distinct colour.
        const engOverrides = useVehicleAppearanceStore.getState().overrides;
        const engActiveKey = useActiveVehicleStore.getState().activeVehicleKey;
        const engMulti = engine.size > 1;
        let engActivePrimary: SimStateMessage | null = null;
        let engIdx = 0;
        frames = Array.from(engine.values()).map((m) => {
          engIdx += 1;
          const num = /(\d+)\s*$/.exec(m.id);
          const sysid = num ? parseInt(num[1]!, 10) : engIdx;
          const kv = known.find((k) => k.sysid === sysid);
          const isActive = !!kv && kv.key === engActiveKey;
          if (isActive) engActivePrimary = m;
          return {
            id: m.id,
            position: m.position,
            quaternion: m.quaternion,
            euler: m.euler,
            // The engine streams normalized motor output; use it to spin the props
            // (and treat any real throttle as "active" so they turn while flying).
            throttle01: m.throttle,
            armed: (m.throttle ?? 0) > 0.02,
            color: resolveVehicleColor(engOverrides, kv?.key ?? m.id, sysid),
            label: engMulti ? `SYS ${sysid}` : '',
            active: isActive && engMulti,
            vehicleClass: kv ? getVehicleClass(kv.mavType, { qEnable: qEnableRef.current }) : undefined,
            motorCount: m.motors?.length,
            // Physics X-ray internals (engine-only; sticky in the store).
            diagnostics: m.diagnostics,
            // Slung-load cable + payload (engine-only).
            load: m.load,
          };
        });
        const first = engine.values().next();
        primary = engActivePrimary ?? (first.done ? null : first.value);
        // Engine frames are NED about the ENGINE's home, so the world has to be
        // anchored there too. Seeding the origin from telemetry instead put the
        // terrain (and its imagery) at a different point than the vehicles were
        // being drawn against, which reads as the drone sitting in the wrong
        // place on the map.
        const engHome = primary?.home;
        if (engHome && (engHome.lat !== 0 || engHome.lng !== 0)) {
          const cur = geoOriginRef.current;
          if (!cur || Math.abs(cur.lat - engHome.lat) > 1e-5 || Math.abs(cur.lon - engHome.lng) > 1e-5) {
            geoOriginRef.current = { lat: engHome.lat, lon: engHome.lng };
            drapeCenterRef.current = null;
            setOriginRev((r) => r + 1);
          }
        }
      } else if (known.length > 0) {
        // Fleet path: render EVERY known vehicle that has a fix, against one
        // shared geo origin, each tinted with its identity colour and labelled
        // by SYS id. The active vehicle is highlighted and drives the camera.
        const byVehicle = useFleetTelemetryStore.getState().byVehicle;
        const overrides = useVehicleAppearanceStore.getState().overrides;
        const activeKey = useActiveVehicleStore.getState().activeVehicleKey;

        // Lock the shared origin to the first vehicle with a position (prefer
        // the active one so the world stays centred on what the operator is
        // flying). Accepts a GPS fix or the fused EKF position, and finally the
        // flat telemetry store, so it anchors on any position telemetry shows.
        if (!geoOriginRef.current) {
          const seed =
            (activeKey ? vehicleLatLon(byVehicle[activeKey]) : null) ??
            known.map((v) => vehicleLatLon(byVehicle[v.key])).find((ll): ll is { lat: number; lon: number } => ll != null) ??
            flatLatLon();
          if (seed) geoOriginRef.current = seed;
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
            if (!t) continue;
            const ll = vehicleLatLon(t);
            if (!ll) continue;
            const north = (ll.lat - o.lat) * 111320;
            const east = (ll.lon - o.lon) * 111320 * cosLat;
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

      // Mission waypoints from the FC → NED for the scene. Cached on the mission
      // items array identity + origin: this runs every frame, and a 573-waypoint
      // survey re-projected and re-allocated the whole list 60 times a second for
      // a result that only changes when the mission or the origin does.
      let waypoints: SimWaypoint[] | undefined;
      if (origin) {
        const items = useMissionStore.getState().missionItems;
        const cache = wpCacheRef.current;
        if (cache.items !== items || cache.lat !== origin.lat || cache.lon !== origin.lon) {
          const wps = items
            .filter((it) => it.latitude !== 0 || it.longitude !== 0)
            .map((it) => {
              const local = latLngToLocal({ lat: origin.lat, lng: origin.lon }, { lat: it.latitude, lng: it.longitude });
              return { seq: it.seq, position: [local.y, local.x, -it.altitude] as [number, number, number] };
            });
          cache.items = items;
          cache.lat = origin.lat;
          cache.lon = origin.lon;
          cache.wps = wps.length > 0 ? wps : undefined;
        }
        waypoints = cache.wps;
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

      // Imagery follows the vehicle, not the launch point: the sharp inner ring
      // is 1.5 km across, so anchoring it at home leaves everything around a
      // vehicle that has flown away on the coarse outer rings.
      const lead = frames.find((f) => f.active) ?? frames[0];
      if (lead) {
        const [north, east] = lead.position;
        const c = drapeCenterRef.current;
        if (!c || Math.hypot(north - c.north, east - c.east) > recenterDistanceM(spansRef.current)) {
          drapeCenterRef.current = { north, east };
          setDrapeCenter({ north, east });
        }
      }

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

  useEffect(() => {
    spansRef.current = cameraMode === 'topdown' ? WIDE_RING_SPANS_M : SIM_DRAPE[quality].spans;
  }, [cameraMode, quality]);

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

  // Feed the real-build context to the frame generator. The profile subset maps
  // camelCase; main maps it plus the on-disk custom frame into the crate spec.
  useEffect(() => {
    const fc = copterFrameClass(sitlModel, sitlVehicleType);
    sceneRef.current?.setBuildContext({
      customFramePath: customFramePath || undefined,
      frameClass: fc?.frameClass,
      frameType: fc?.frameType,
      profile: activeVehicle
        ? {
            weightG: activeVehicle.weight,
            frameSizeMm: activeVehicle.frameSize,
            motorCount: activeVehicle.motorCount,
            motorKv: activeVehicle.motorKv,
            propDiameterMm: activeVehicle.propDiameter,
            escRatingA: activeVehicle.escRating,
            batteryCells: activeVehicle.batteryCells,
            cogOffsetMm: activeVehicle.cogOffset,
          }
        : undefined,
    });
  }, [customFramePath, activeVehicle, sitlModel, sitlVehicleType]);

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
      setTerrainPending(false);
      if (terrainOriginRef.current !== null) {
        scene.setTerrain(null);
        scene.setDrape(null);
        terrainOriginRef.current = null;
        setSimGrid(null);
      }
      return;
    }
    const origin = geoOriginRef.current;
    if (!origin) {
      // Nothing to anchor the DEM to: revert the toggle with a note instead of
      // silently arming it.
      setShowTerrain(false);
      setTerrainError('sim:worldView.terrainNeedsOrigin');
      return;
    }
    const key = `${origin.lat.toFixed(4)},${origin.lon.toFixed(4)}`;
    if (terrainOriginRef.current === key) return;
    terrainOriginRef.current = key;
    let cancelled = false;
    setTerrainPending(true);
    setTerrainError(null);
    void (async () => {
      try {
        // The sim patch is small (8 km), so the quality level drives density
        // directly rather than through the wide-patch preset resolution.
        const res = SIM_TERRAIN_RES[quality];
        const grid = await loadElevationGrid(origin.lat, origin.lon, quality, SIM_PATCH_HALF_M, res);
        if (cancelled) return;
        const homeElev = sampleElevation(grid, origin.lat, origin.lon);
        sceneRef.current?.setTerrain(buildTerrainGeometry(grid), -homeElev);
        setSimGrid(grid);
      } catch {
        if (!cancelled) {
          terrainOriginRef.current = null; // allow a later retry
          setShowTerrain(false);
          setTerrainError('sim:worldView.terrainFetchFailed');
        }
      } finally {
        if (!cancelled) setTerrainPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showTerrain, fixSignal, quality, originRev]);

  // Satellite drape over the sim terrain: same rings the synthetic-vision view
  // builds, centred on the sim's own origin (the world is local metres about
  // it, so the rings' local-ENU rects line up unchanged).
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (!satellite || !showTerrain || !simGrid) {
      scene.setDrape(null);
      return;
    }
    // Sharp rings everywhere except Top, which looks straight down from high
    // up and is the only view where coverage beats detail. Orbit sits a few
    // hundred metres out, close enough that the wide rings just read blurry.
    const tuning = SIM_DRAPE[quality];
    const spans = cameraMode === 'topdown' ? WIDE_RING_SPANS_M : tuning.spans;
    const origin = geoOriginRef.current;
    const at = origin && drapeCenter
      ? {
          lat: origin.lat + drapeCenter.north / 111_320,
          lon: origin.lon + drapeCenter.east / (111_320 * Math.cos((origin.lat * Math.PI) / 180)),
        }
      : undefined;
    let cancelled = false;
    void (async () => {
      try {
        const rings = await loadDrapeRings(simGrid, tuning.outer, at, spans, tuning.inner, imagery);
        if (cancelled) {
          for (const ring of rings) ring.texture.dispose();
          return;
        }
        sceneRef.current?.setDrape(rings.length > 0 ? rings : null);
      } catch {
        // Imagery is optional; the elevation ramp stays.
      }
    })();
    return () => { cancelled = true; };
  }, [satellite, imagery, quality, simGrid, showTerrain, drapeCenter, cameraMode]);

  // The revert note is transient: clear it after a few seconds.
  useEffect(() => {
    if (!terrainError) return;
    const t = setTimeout(() => setTerrainError(null), 5000);
    return () => clearTimeout(t);
  }, [terrainError]);

  // ─── Pointer / wheel handlers (orbit interaction + click-select) ─────────────
  // Down position for the click-vs-drag test behind vehicle click-select.
  const clickRef = useRef<{ x: number; y: number; consumed: boolean } | null>(null);
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    clickRef.current = { x: e.clientX, y: e.clientY, consumed: false };
    // Obstacle placement mode: a ground click drops a new obstacle.
    const obStore = useSimObstaclesStore.getState();
    const origin = geoOriginRef.current;
    if (obStore.placing && origin) {
      clickRef.current.consumed = true;
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
  const onPointerUp = useCallback((e: React.PointerEvent) => {
    sceneRef.current?.onPointerUp();
    // A press-and-release without a drag is a click: raycast the vehicles and
    // select/deselect exactly like the picker-rail pills do.
    const c = clickRef.current;
    clickRef.current = null;
    if (!c || c.consumed) return;
    if (Math.hypot(e.clientX - c.x, e.clientY - c.y) > 5) return;
    const canvas = canvasRef.current;
    const scene = sceneRef.current;
    if (!canvas || !scene) return;
    const rect = canvas.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
    const id = scene.pickVehicle(ndcX, ndcY);
    if (!id) return;
    // Scene ids are fleet keys on the fleet path; engine ids ("v1") map to
    // fleet rows by their trailing index = sysid.
    const st = useActiveVehicleStore.getState();
    let kv: VehicleInfoIpc | undefined = st.knownVehicles[id];
    if (!kv) {
      const num = /(\d+)\s*$/.exec(id);
      if (num) {
        const sysid = parseInt(num[1]!, 10);
        kv = Object.values(st.knownVehicles).find((k) => k.sysid === sysid);
      }
    }
    if (!kv) return;
    if (st.activeVehicleKey === kv.key) deselectActiveVehicle();
    else selectActiveVehicle(kv.key, kv.transportId);
  }, []);
  // Leaving the canvas ends any drag but must never count as a click.
  const onPointerCancel = useCallback(() => {
    clickRef.current = null;
    sceneRef.current?.onPointerUp();
  }, []);
  const onWheel = useCallback((e: React.WheelEvent) => {
    sceneRef.current?.onWheel(e.deltaY);
  }, []);

  const altitude = hud ? -hud.position[2] : 0;
  const speed = hud ? groundSpeed(hud.velocity) : 0;
  // The HUD only makes sense in a forward view; its toggle is disabled elsewhere.
  const hudSupported = cameraMode === 'fpv' || cameraMode === 'chase';

  // Recognition is driven by the live MAVLink connection (standard SITL or real
  // hardware), not by the optional ArduDeck sim engine. A vehicle renders once
  // we have a position fix (hud); before that we still acknowledge the link.
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const hasFix = useTelemetryStore((s) => s.position.lat !== 0 || s.position.lon !== 0);
  const knownCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);

  // The geo origin locks on the first fix; if it stayed locked forever,
  // restarting SITL at a different home in the same window would render
  // kilometres off. Once nothing is connected and no vehicles are known, drop
  // the origin (and the per-site obstacle/terrain latches) so the next fix
  // re-seeds everything.
  useEffect(() => {
    if (!isConnected && knownCount === 0) {
      geoOriginRef.current = null;
      siteLoadedRef.current = false;
      terrainOriginRef.current = null;
    }
  }, [isConnected, knownCount]);
  const engineConnected = status === 'connected';
  const live = engineConnected || hud !== null;
  const pillLabel = engineConnected
    ? t('sim:worldView.simConnected')
    : hud
      ? t('sim:worldView.vehicleLive')
      : isConnected
        ? t('sim:worldView.connectedWaitingGps')
        : status === 'connecting'
          ? t('common:connecting')
          : t('sim:worldView.waitingForSitl');
  // Amber = connected/handshaking but no vehicle on screen yet.
  const pending = !live && (isConnected || status === 'connecting');

  return (
    <div ref={containerRef} className="relative h-full w-full bg-surface-base overflow-hidden">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerCancel}
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
          disabled={terrainPending}
          data-tip={t('sim:worldView.terrainTip')}
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            terrainPending
              ? 'bg-surface-raised text-content-tertiary opacity-60 cursor-wait'
              : showTerrain ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          {terrainPending ? t('sim:worldView.terrainPending') : t('common:terrain')}
        </button>
        <div className="relative">
          <button
            onClick={() => setShowTerrainMenu((v) => !v)}
            data-tip={t('sim:worldView.terrainMenuTip')}
            className="rounded-lg border border-subtle bg-surface-raised px-2 py-1.5 text-xs font-medium text-content-secondary shadow-lg transition-colors hover:text-content"
          >
            ⚙
          </button>
          {showTerrainMenu && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowTerrainMenu(false)} />
              <div className="absolute right-0 top-9 z-40 w-52 rounded-lg border border-default bg-surface-solid p-1.5 shadow-xl">
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[11px] text-content hover:bg-surface-raised">
                  <input
                    type="checkbox"
                    checked={satellite}
                    onChange={(e) => setSvtSatellite(e.target.checked)}
                    className="accent-blue-500"
                  />
                  {t('sim:worldView.satelliteImagery')}
                </label>
                <SvtImageryPicker disabled={!satellite} />
                <div className="mt-1 border-t border-subtle pt-1">
                  <div className="px-1.5 pb-1 text-[10px] uppercase tracking-wide text-content-tertiary">{t('sim:worldView.terrainDetail')}</div>
                  <div className="flex overflow-hidden rounded-md border border-subtle">
                    {(['low', 'medium', 'high'] as const).map((q) => (
                      <button
                        key={q}
                        onClick={() => setSvtQuality(q)}
                        className={`flex-1 px-1.5 py-0.5 text-[11px] capitalize transition-colors ${quality === q ? 'bg-surface-raised text-content' : 'text-content-secondary hover:bg-surface-raised'}`}
                      >{q === 'low' ? t('sim:worldView.qualityLow') : q === 'medium' ? t('sim:worldView.qualityMedium') : t('common:high')}</button>
                    ))}
                  </div>
                  <div className="px-1.5 pt-1 text-[10px] leading-snug text-content-tertiary">
                    {t('sim:worldView.terrainSharedNote')}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        <button
          onClick={() => setShowXray((v) => !v)}
          data-tip={t('sim:worldView.xrayTip')}
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            showXray ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          {t('sim:worldView.xray')}
        </button>
        <button
          onClick={() => setShowGrid((v) => !v)}
          data-tip={t('sim:worldView.gridTip')}
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            showGrid ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          {t('common:grid')}
        </button>
        <button
          onClick={() => setShowWaypoints((v) => !v)}
          data-tip={t('sim:worldView.waypointsTip')}
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            showWaypoints ? 'bg-blue-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          {t('common:waypoints')}
        </button>
        <button
          onClick={() => setShowHud((v) => !v)}
          disabled={!hudSupported}
          data-tip={hudSupported
            ? t('sim:worldView.hudTip')
            : t('sim:worldView.hudUnavailableTip')}
          className={`rounded-lg border border-subtle px-3 py-1.5 text-xs font-medium shadow-lg transition-colors ${
            !hudSupported
              ? 'bg-surface-raised text-content-tertiary opacity-40 cursor-not-allowed'
              : showHud
                ? 'bg-blue-600 text-white'
                : 'bg-surface-raised text-content-secondary hover:text-content'
          }`}
        >
          {t('sim:worldView.hud')}
        </button>
        <SimStreamControl canvasRef={canvasRef} />
        <div className="flex overflow-hidden rounded-lg border border-subtle shadow-lg">
          {CAMERA_MODES.map((m) => (
            <button
              key={m.value}
              onClick={() => setCameraMode(m.value)}
              data-tip={t(m.tipKey)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                cameraMode === m.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-surface-raised text-content-secondary hover:text-content'
              }`}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {/* Transient terrain-toggle revert note (fetch failed / no GPS origin). */}
      {terrainError && (
        <div className="absolute top-14 right-3 z-10 rounded-md border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-[11px] text-rose-300 pointer-events-none">
          {t(terrainError)}
        </div>
      )}

      {/* X-ray force-arrow legend: a single compact row (dot + label per force),
          not a card, so it reads at a glance without covering the view. Tucked
          in the bottom-left corner, clear of every other overlay. */}
      {showXray && hud?.diagnostics && (
        <div className="absolute bottom-3 left-3 z-10 flex items-center gap-2.5 rounded-md bg-surface-raised/80 backdrop-blur-sm px-2 py-1 text-[10px] text-content-tertiary pointer-events-none">
          <LegendDot swatch="linear-gradient(90deg,#38bdf8,#ef4444)" label={t('sim:worldView.legend.thrust')} />
          <LegendDot color="#fef08a" label={t('sim:worldView.legend.lift')} />
          <LegendDot color="#9ca3af" label={t('sim:worldView.legend.weight')} />
          <LegendDot color="#f97316" label={t('sim:worldView.legend.drag')} />
          <LegendDot color="#ffffff" outline label={t('sim:worldView.legend.net')} />
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
            <HudTile label={t('sim:worldView.tile.alt')} value={altitude.toFixed(1)} unit="m" tip={t('sim:worldView.tile.altTip')} />
            <HudTile label={t('sim:worldView.tile.spd')} value={speed.toFixed(1)} unit="m/s" tip={t('sim:worldView.tile.spdTip')} />
            <HudTile label={t('sim:worldView.tile.roll')} value={rad2deg(hud.euler.roll).toFixed(0)} unit="°" tip={t('sim:worldView.tile.rollTip')} />
            <HudTile label={t('sim:worldView.tile.pitch')} value={rad2deg(hud.euler.pitch).toFixed(0)} unit="°" tip={t('sim:worldView.tile.pitchTip')} />
            <HudTile label={t('sim:worldView.tile.yaw')} value={((rad2deg(hud.euler.yaw) + 360) % 360).toFixed(0)} unit="°" tip={t('common:heading')} />
            {typeof hud.batteryVoltage === 'number' && (
              <HudTile label={t('sim:worldView.tile.batt')} value={hud.batteryVoltage.toFixed(1)} unit="V" tip={t('sim:worldView.tile.battTip')} />
            )}
            {hud.load && (
              <HudTile
                label={t('sim:worldView.tile.sling')}
                value={hud.load.attached ? hud.load.tension.toFixed(0) : t('sim:worldView.tile.released')}
                unit={hud.load.attached ? 'N' : ''}
                tip={hud.load.attached
                  ? t('sim:worldView.tile.slingTip', { m: hud.load.cableLength.toFixed(1) })
                  : t('sim:worldView.tile.loadReleased')}
                accent={hud.load.attached ? undefined : 'amber'}
              />
            )}
            {showXray && hud.diagnostics && (
              <>
                <HudTile
                  label={t('sim:worldView.tile.load')}
                  value={hud.diagnostics.loadFactor.toFixed(2)}
                  unit="g"
                  tip={t('sim:worldView.tile.loadTip')}
                  accent={hud.diagnostics.loadFactor > 4 ? 'red' : hud.diagnostics.loadFactor > 2 ? 'amber' : undefined}
                />
                <HudTile label={t('sim:worldView.tile.armMax')} value={hud.diagnostics.maxArmMoment.toFixed(1)} unit="N·m" tip={t('sim:worldView.tile.armMaxTip')} />
                <HudTile
                  label={t('sim:worldView.tile.thrust')}
                  value={Math.hypot(...hud.diagnostics.netThrustBody).toFixed(0)}
                  unit="N"
                  tip={t('sim:worldView.tile.thrustTip')}
                />
                <HudTile label={t('sim:worldView.tile.weight')} value={hud.diagnostics.weight.toFixed(0)} unit="N" tip={t('sim:worldView.tile.weightTip')} />
                <HudTile
                  label={t('sim:worldView.tile.drag')}
                  value={Math.hypot(
                    hud.diagnostics.airframeDragBody[0] + hud.diagnostics.momentumDragBody[0],
                    hud.diagnostics.airframeDragBody[1] + hud.diagnostics.momentumDragBody[1],
                    hud.diagnostics.airframeDragBody[2] + hud.diagnostics.momentumDragBody[2],
                  ).toFixed(0)}
                  unit="N"
                  tip={t('sim:worldView.tile.dragTip')}
                />
                <HudTile
                  label={t('sim:worldView.tile.net')}
                  value={Math.hypot(...hud.diagnostics.netForceWorld).toFixed(0)}
                  unit="N"
                  tip={t('sim:worldView.tile.netTip')}
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
                  ? t('sim:worldView.acquiringState')
                  : t('sim:worldView.connectedWaitingFix')
                : t('sim:worldView.noVehicle')}
            </div>
            <div className="text-content-tertiary text-xs mb-4">
              {isConnected
                ? t('sim:worldView.connectedHint')
                : t('sim:worldView.disconnectedHint')}
            </div>
            <button
              onClick={() => window.electronAPI?.focusMainWindow?.()}
              data-tip={t('sim:worldView.focusMainTip')}
              className="px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-lg transition-colors"
            >
              {t('sim:worldView.focusMain')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** One vehicle pill in the picker rail: identity colour + SYS id, draggable between
 *  fleets, right-click for orders. `role` gives the leader a gold ring + Lead tag. */
function FleetPill({ v, role, count = 0 }: { v: FleetVehicle; role?: 'leader' | 'wingman'; count?: number }) {
  const overrides = useVehicleAppearanceStore.getState().overrides;
  const color = resolveVehicleColor(overrides, v.key, v.sysid);
  const openContextMenu = useFormationStore((s) => s.openContextMenu);
  const { t } = useTranslation();
  return (
    <button
      draggable
      onDragStart={(e) => { e.stopPropagation(); startVehicleDrag(e, v.key); }}
      onClick={() => (v.isActive ? deselectActiveVehicle() : selectActiveVehicle(v.key, v.transportId))}
      onContextMenu={(e) => { e.preventDefault(); openContextMenu({ x: e.clientX, y: e.clientY, vehicleKey: v.key }); }}
      data-tip={v.isActive ? t('sim:worldView.pillActiveTip', { label: v.label }) : t(v.armed ? 'sim:worldView.pillTipArmed' : 'sim:worldView.pillTip', { label: v.label, mode: v.mode })}
      className={`flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg border border-subtle text-xs font-medium text-content shadow-md cursor-grab active:cursor-grabbing transition-colors ${
        v.isActive ? 'bg-surface-solid' : 'bg-surface-raised hover:bg-surface-solid'
      }`}
      style={{
        ...(v.isActive ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : {}),
        ...(role === 'leader' ? { boxShadow: `0 0 0 1.5px #f59e0b` } : {}),
      }}
    >
      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color, boxShadow: v.position ? 'none' : '0 0 0 1px rgba(127,127,127,0.5)' }} />
      <span className="font-mono">{v.label}</span>
      {role === 'leader' && <span className="text-[7px] font-bold uppercase tracking-wide px-1 rounded-sm bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">{t('sim:worldView.lead')}</span>}
      {role === 'leader' && count > 0 && <span className="text-[9px] font-mono text-content-tertiary">+{count}</span>}
      {!v.position && <span className="text-[9px] text-content-tertiary">{t('sim:worldView.noFix')}</span>}
    </button>
  );
}

/**
 * Vehicle picker rail (multi-vehicle only). Grouped by leader like the telemetry
 * fleet strip: a leader pill with its wingmen indented under it, free vehicles below.
 * Tapping a pill makes that vehicle active (camera, HUD, commands retarget); tapping
 * the active pill deselects. Drag a pill onto a fleet to add it, onto the free zone to
 * peel it out; right-click for orders (create leader, add to fleet, disband).
 */
function FleetPicker() {
  const vehicles = useFleetVehicles();
  const formations = useActiveVehicleStore((s) => s.formations);
  const { addToFleet, removeFromFleet } = useFormationControl();
  const uiOverrides = useFleetUiStore((s) => s.overrides);
  const toggleFleet = useFleetUiStore((s) => s.toggle);
  const [dropZone, setDropZone] = useState<string | null>(null);
  const { t } = useTranslation();
  if (vehicles.length < 2) return null;

  const sorted = [...vehicles].sort((a, b) => a.sysid - b.sysid);
  const inFormation = new Set(Object.values(formations).flat());
  const groups = Object.entries(formations)
    .map(([leaderKey, memberKeys]) => ({
      leader: sorted.find((v) => v.key === leaderKey),
      wingmen: sorted.filter((v) => v.key !== leaderKey && memberKeys.includes(v.key)),
    }))
    .filter((g): g is { leader: FleetVehicle; wingmen: FleetVehicle[] } => !!g.leader)
    .sort((a, b) => a.leader.sysid - b.leader.sysid);
  const others = sorted.filter((v) => !inFormation.has(v.key));

  const dropOn = (zone: string) => ({
    onDragOver: (e: React.DragEvent) => { allowVehicleDrop(e); setDropZone(zone); },
    onDragLeave: () => setDropZone((z) => (z === zone ? null : z)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropZone(null);
      const key = readVehicleDrag(e);
      if (!key) return;
      if (zone === FREE_ZONE) void removeFromFleet(key);
      else if (key !== zone) void addToFleet(zone, key);
    },
  });

  const leaderKeys = groups.map((g) => g.leader.key);

  return (
    <div className="absolute top-1/2 -translate-y-1/2 left-3 z-10 flex flex-col gap-1.5 max-h-[80%] overflow-y-auto pr-1">
      <FleetCountHeader leaderKeys={leaderKeys} className="px-1 pb-0.5" />
      {groups.map((g) => {
        const expanded = isFleetExpanded(uiOverrides, g.leader.key, leaderKeys.length);
        return (
          <div
            key={g.leader.key}
            {...dropOn(g.leader.key)}
            className={`flex flex-col gap-1.5 rounded-lg p-0.5 transition-colors ${dropZone === g.leader.key ? 'bg-cyan-500/10 ring-1 ring-cyan-500/40' : ''}`}
          >
            <div className="flex items-center gap-0.5">
              {g.wingmen.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleFleet(g.leader.key, expanded)}
                  className="shrink-0 w-4 h-6 grid place-items-center text-content-tertiary hover:text-content"
                  data-tip={expanded ? t('sim:worldView.collapseFleet') : t('sim:worldView.expandFleet')}
                >
                  <FleetChevron open={expanded} />
                </button>
              ) : <span className="w-4 shrink-0" />}
              <div className="flex-1 min-w-0"><FleetPill v={g.leader} role="leader" count={g.wingmen.length} /></div>
            </div>
            {expanded && g.wingmen.length > 0 && (
              <div className="ml-4 border-l border-subtle pl-1.5 flex flex-col gap-1.5">
                {g.wingmen.map((v) => <FleetPill key={v.key} v={v} role="wingman" />)}
              </div>
            )}
          </div>
        );
      })}
      <div
        {...dropOn(FREE_ZONE)}
        className={`flex flex-col gap-1.5 rounded-lg p-0.5 transition-colors ${dropZone === FREE_ZONE ? 'ring-1 ring-subtle bg-surface-raised/40' : ''}`}
      >
        {others.map((v) => <FleetPill key={v.key} v={v} />)}
      </div>
      <FleetContextMenu />
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
  const { t } = useTranslation();
  if (vehicles.length < 2) return null;

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 w-64 bg-surface-overlay backdrop-blur-sm border border-subtle rounded-xl shadow-xl text-content overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-content-secondary hover:text-content transition-colors"
      >
        <span>{t('sim:worldView.fleetOps', { count: vehicles.length })}</span>
        <span className="text-content-tertiary">{collapsed ? '▾' : '▴'}</span>
      </button>
      {!collapsed && (
        hasEngine ? (
          <FleetCoordination />
        ) : (
          <div className="px-3 pb-3 -mt-1 text-[11px] text-content-secondary leading-relaxed">
            {t('sim:worldView.fleetOpsNoEngine')}
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
  const { t } = useTranslation();

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
        className="flex items-center gap-1.5 px-2 py-1 bg-surface-solid border-b border-subtle cursor-move shrink-0 touch-none"
        onPointerDown={onHandlePointerDown}
        data-tip={t('sim:worldView.dragTip')}
      >
        <svg width="9" height="11" viewBox="0 0 9 11" className="text-content-tertiary" aria-hidden="true">
          {[2, 5.5, 9].map((cy) => [2, 7].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" fill="currentColor" />))}
        </svg>
        <span className="text-[10px] font-medium text-content-tertiary uppercase tracking-wide">{t('sim:worldView.flightControl')}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleCollapsed}
          className="ml-auto -mr-0.5 flex h-5 w-5 items-center justify-center rounded text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
          data-tip={collapsed ? t('common:expand') : t('common:collapse')}
          aria-label={collapsed ? t('sim:worldView.expandPanel') : t('sim:worldView.collapsePanel')}
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
  // Per-field selectors: subscribing to the whole telemetry store re-rendered
  // this overlay on every MAVLink message, not just when a read field changed.
  const gpsLat = useTelemetryStore((s) => s.gps.lat);
  const gpsLon = useTelemetryStore((s) => s.gps.lon);
  const posLat = useTelemetryStore((s) => s.position.lat);
  const posLon = useTelemetryStore((s) => s.position.lon);
  const gpsSats = useTelemetryStore((s) => s.gps.satellites);
  const gpsHdop = useTelemetryStore((s) => s.gps.hdop);
  const battVoltage = useTelemetryStore((s) => s.battery.voltage);
  const battRemaining = useTelemetryStore((s) => s.battery.remaining);
  const battCurrent = useTelemetryStore((s) => s.battery.current);
  const flightMode = useTelemetryStore((s) => s.flight.mode);
  const flightArmed = useTelemetryStore((s) => s.flight.armed);
  const windSpeed = useTelemetryStore((s) => s.wind?.speed);
  const wpDistance = useTelemetryStore((s) => s.navController?.wpDist);
  const xtrackError = useTelemetryStore((s) => s.navController?.xtrackError);
  const steerPwm = useTelemetryStore((s) => s.servoOutput?.outputs[0]);
  const home = useMissionStore((s) => s.homePosition);
  const config = useHudStore((s) => s.config);
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const profile = resolveHudProfile(config.profile, mavType);
  const widgets = profile === 'ground' ? config.widgetsGround : config.widgets;
  const linkHistory = useLinkHistory(widgets.linkGraph);
  const { t } = useTranslation();

  // Core flight state from the physics engine (sim-state), radians → degrees.
  const heading = ((rad2deg(hud.euler.yaw) % 360) + 360) % 360;
  const speed = groundSpeed(hud.velocity);

  // Home arrow + distance from the real telemetry fix (as the Vision panel does),
  // taken relative to the sim heading the compass tape actually shows.
  const lat = gpsLat || posLat;
  const lon = gpsLon || posLon;
  let distance = 0;
  let homeDirection = 0;
  if (home && (lat || lon)) {
    distance = haversineMeters(lat, lon, home.lat, home.lon);
    homeDirection = wrap180(bearingDeg(lat, lon, home.lat, home.lon) - heading);
  }

  // Rover steering (mirror LiveFighterHud) so a ground-profile sim reads right.
  let steer: number | undefined;
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
    batteryVoltage: hud.batteryVoltage ?? battVoltage,
    batteryPercent: battRemaining,
    current: battCurrent,
    mode: flightMode,
    armed: flightArmed,
    distance,
    homeDirection,
    gpsSats,
    hdop: gpsHdop,
    lat,
    lon,
    windSpeed,
    linkHistory,
    linkLabel: t('sim:worldView.rcLink'),
    steer,
    wpDistance,
    xtrackError,
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
  const { t } = useTranslation();
  return (
    <div
      data-tip={t('sim:worldView.motorBarsTip')}
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
