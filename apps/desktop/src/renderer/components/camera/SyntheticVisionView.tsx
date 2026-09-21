/**
 * Synthetic-vision view: a Garmin-SVT-style 3D terrain world locked to one
 * vehicle's GPS position and attitude, with the same overlay stack as the live
 * camera feed drawn on top. Needs no configured camera source — only a position
 * fix — so it works for any vehicle, and is the natural fallback when a real
 * feed is unavailable.
 *
 * The Three.js scene runs its own rAF loop reading a pose ref (so high-rate
 * attitude updates drive the camera without re-mounting anything). Terrain is
 * streamed from the DEM around the vehicle and rebuilt as it travels.
 */

import { useEffect, useRef, useState } from 'react';
import type { OsdLayers } from '../../../shared/camera-types';
import type { FleetVehicle } from '../../hooks/useFleet';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSmoothTelemetry } from '../../perf/render-governor';
import { useConnectionStore } from '../../stores/connection-store';
import { getVehicleClass } from '../../../shared/telemetry-types';
import { useFleetTelemetryStore } from '../../stores/fleet-telemetry-store';
import { useCameraStore } from '../../stores/camera-store';
import { CameraOverlays } from './CameraOverlays';
import { createSvtScene, type SvtScene, type SvtPose } from './svt/svt-scene';
import {
  approxDistanceM,
  buildTerrainGeometry,
  loadElevationGrid,
  metersPerDegLon,
  M_PER_DEG_LAT,
  sampleElevation,
  SVT_QUALITY,
  SVT_REBUILD_DISTANCE_M,
  type ElevationGrid,
  type SvtQuality,
} from './svt/svt-terrain';
import { loadDrapeRings, recenterDistanceM } from './svt/svt-satellite';
import {
  eulerRatesFromBody,
  lerpAngle,
  predictAngle,
  predictPosition,
  pushSample,
  type Sample,
} from './svt/svt-pose-buffer';

/**
 * Module-level cache of the last loaded terrain grid per vehicle. Grids are plain
 * data (not GPU resources), so they survive this component unmounting/remounting
 * across screen switches — a remount rebuilds the mesh from the cached grid
 * instantly instead of re-fetching and re-decoding tiles. Bounded to a few
 * vehicles so it never grows unbounded.
 */
const gridCache = new Map<string, ElevationGrid>();
const GRID_CACHE_MAX = 6;

function cacheGrid(key: string, grid: ElevationGrid): void {
  gridCache.delete(key);
  gridCache.set(key, grid);
  while (gridCache.size > GRID_CACHE_MAX) {
    const oldest = gridCache.keys().next().value;
    if (oldest === undefined) break;
    gridCache.delete(oldest);
  }
}

interface SyntheticVisionViewProps {
  vehicle: FleetVehicle | null;
  /** True when this view's vehicle is the active selection (enables the full HUD). */
  isPrimary: boolean;
  osd: OsdLayers;
  /** Grid mode: clicking the tile activates the vehicle. */
  onActivate?: () => void;
}

/** Beyond this a position sample is a teleport (new vehicle, first fix), not
 * motion, and the buffer restarts instead of gliding across the world. */
const SNAP_DIST_M = 250;

/** Terrain clearance below this raises the caution chip, the order of
 * magnitude general-aviation synthetic vision annunciates at. */
const TERRAIN_CAUTION_M = 30;

/** Render floor above the DEM: a rover's camera mast, an aircraft's clearance. */
const ROVER_EYE_M = 1;
const AIR_EYE_M = 2;

interface PosSample {
  lat: number;
  lon: number;
  altMsl: number;
  agl: number;
  /** NED velocity, m/s, used to carry the position forward between fixes. */
  vN: number;
  vE: number;
  vD: number;
}

/** How fast the shown position closes on the predicted one. Long enough to
 * absorb a fix correction without a visible jump. */
const POS_BLEND_TAU_S = 0.15;
interface AttSample {
  rollDeg: number;
  pitchDeg: number;
  headingDeg: number;
  /** Body rates, deg/s, used to carry the attitude forward between samples. */
  rollRate: number;
  pitchRate: number;
  yawRate: number;
}

/** How fast the shown attitude closes on the predicted one. Short enough to be
 * imperceptible, long enough to absorb the step when a new sample lands. */
const ATT_BLEND_TAU_S = 0.04;

/** ATTITUDE yaw (deg, may be signed) wrapped to a compass heading; falls back
 * to the VFR_HUD heading when yaw is not being streamed. */
function headingFrom(yawDeg: number, fallbackDeg: number): number {
  if (yawDeg === 0) return fallbackDeg;
  return ((yawDeg % 360) + 360) % 360;
}

function blendPos(a: PosSample, b: PosSample, u: number): PosSample {
  return {
    ...b,
    lat: a.lat + (b.lat - a.lat) * u,
    lon: a.lon + (b.lon - a.lon) * u,
    altMsl: a.altMsl + (b.altMsl - a.altMsl) * u,
    agl: a.agl + (b.agl - a.agl) * u,
  };
}

/** Position is dead-reckoned from the newest fix, never rendered in the past:
 * fixes arrive at a few hertz, so interpolating between them holds the world
 * still and then jumps it. */
function predictPos(sample: Sample<PosSample>, now: number): PosSample {
  const dt = (now - sample.t) / 1000;
  return {
    ...sample.v,
    ...predictPosition(sample.v, dt, M_PER_DEG_LAT, metersPerDegLon(sample.v.lat)),
  };
}

function lerpAtt(a: AttSample, b: AttSample, u: number): AttSample {
  return {
    ...b,
    rollDeg: lerpAngle(a.rollDeg, b.rollDeg, u),
    pitchDeg: lerpAngle(a.pitchDeg, b.pitchDeg, u),
    headingDeg: lerpAngle(a.headingDeg, b.headingDeg, u),
  };
}

/**
 * Attitude is predicted forward from the newest sample with the body rates,
 * never rendered in the past: angular lag is what a pilot notices first, and a
 * yaw drags the whole world with it.
 */
function predictAtt(sample: Sample<AttSample>, now: number): AttSample {
  const dt = (now - sample.t) / 1000;
  const v = sample.v;
  // Body rates are what the airframe measures; the camera's angles change at
  // the Euler rates, which differ as soon as it banks.
  const e = eulerRatesFromBody(v.rollDeg, v.pitchDeg, { p: v.rollRate, q: v.pitchRate, r: v.yawRate });
  return {
    ...v,
    rollDeg: predictAngle(v.rollDeg, e.rollRate, dt),
    pitchDeg: predictAngle(v.pitchDeg, e.pitchRate, dt),
    headingDeg: predictAngle(v.headingDeg, e.yawRate, dt),
  };
}

export function SyntheticVisionView({ vehicle, isPrimary, osd, onActivate }: SyntheticVisionViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SvtScene | null>(null);
  const poseRef = useRef<SvtPose | null>(null);
  const gridCenterRef = useRef<{ lat: number; lon: number } | null>(null);
  // Monotonic token so only the newest in-flight load applies — a cancelled or
  // superseded load can never wedge the view on "loading" (important in swarms,
  // where active-vehicle churn cancels loads for parked vehicles that then never
  // move enough to re-trigger).
  const loadTokenRef = useRef(0);
  // The scene is static between inputs: the loop repaints only when the pose,
  // viewport or terrain changed, instead of burning GPU at display rate.
  const dirtyRef = useRef(true);
  // Timestamped history per channel: the camera renders a fraction of a second
  // behind live and walks between samples at constant speed, instead of easing
  // toward the newest one (which surges then coasts once per tick). Position
  // and attitude arrive at different rates, so they buffer separately.
  const posBufRef = useRef<Array<Sample<PosSample>>>([]);
  const attBufRef = useRef<Array<Sample<AttSample>>>([]);
  const shownPosRef = useRef<PosSample | null>(null);
  const shownAttRef = useRef<AttSample | null>(null);
  const lastFrameRef = useRef(0);
  // Offset between the vehicle's altitude reference and the DEM's, measured
  // while it sits on the ground: SITL origins, baro drift and geoid models all
  // shift one against the other.
  const datumOffsetRef = useRef(0);
  const [clearanceM, setClearanceM] = useState(NaN);
  // Published to React at ~30 Hz for the world-locked HUD overlay, which has to
  // sit on the same interpolated terrain or its symbology swims.
  const shownRef = useRef<SvtPose | null>(null);
  const [shownPose, setShownPose] = useState<SvtPose | null>(null);
  const publishAtRef = useRef(0);
  const isPrimaryRef = useRef(isPrimary);
  isPrimaryRef.current = isPrimary;
  const [terrainStatus, setTerrainStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  // The SVT camera's vertical FOV, captured on mount so the world-locked HUD
  // overlay can drive its own camera with the exact same fov (zero calibration).
  const [svtFov, setSvtFov] = useState(62);
  const satellite = useCameraStore((s) => s.svtSatellite);
  const quality = useCameraStore((s) => s.svtQuality);
  // The grid the drape follows: state, not a ref, so a new patch re-runs the
  // imagery effect. Quality changes and the toggle do the same.
  const [drapeGrid, setDrapeGrid] = useState<ElevationGrid | null>(null);
  const drapeTokenRef = useRef(0);
  // One imagery load at a time: overlapping runs hold several hundred MB of
  // mosaics at once. A request that arrives during one is remembered and run
  // after it, never dropped: a parked aircraft produces no further move to
  // re-trigger on, so a dropped one left the drape blank until a remount.
  const drapeBusyRef = useRef(false);
  const drapePendingRef = useRef(false);
  const [drapeRetry, setDrapeRetry] = useState(0);
  // Quality the live mesh was built at: changing the level has to rebuild it
  // even though the vehicle has not moved.
  const terrainQualityRef = useRef<SvtQuality | null>(null);

  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  // A rover sits on the surface: terrain clearance is zero by definition, so
  // the CFIT caution is an aircraft idea and would latch red for a whole drive.
  const onSurface = getVehicleClass(mavType) === 'rover';
  // Read by the render loop, which never re-closes over props.
  const eyeFloorRef = useRef(ROVER_EYE_M);
  eyeFloorRef.current = onSurface ? ROVER_EYE_M : AIR_EYE_M;

  // Flies the camera off the live position: a thinned store reads as the
  // aircraft lurching backwards between samples.
  useSmoothTelemetry();

  const flatArmed = useTelemetryStore((s) => s.flight.armed);
  const flatClimb = useTelemetryStore((s) => s.vfrHud.climb);
  const flatGroundspeed = useTelemetryStore((s) => s.vfrHud.groundspeed);
  const flatAttitude = useTelemetryStore((s) => s.attitude);
  const flatAltMsl = useTelemetryStore((s) => s.position.alt);
  const fleetAttitude = useFleetTelemetryStore((s) => (vehicle ? s.byVehicle[vehicle.key]?.attitude : undefined));

  const position = vehicle?.position ?? null;
  const att = isPrimary ? flatAttitude : fleetAttitude;
  const armed = isPrimary ? flatArmed : (vehicle?.armed ?? false);
  const climbRate = isPrimary ? flatClimb : 0;
  const groundspeed = isPrimary ? flatGroundspeed : (vehicle?.groundspeed ?? 0);

  // Calibrate the altitude datum while the vehicle is on the ground: there its
  // true eye height IS the terrain height, so the difference from its reported
  // MSL is the offset between the two references. Once airborne the offset is
  // held, so a climb raises the eye by exactly what the vehicle climbed and
  // rising ground rises into view as it does in the world.
  useEffect(() => {
    // Disarmed and stationary means it is standing on the ground, so its eye
    // height IS the terrain height. NOT keyed on relative altitude: that is
    // measured from HOME, which can sit metres above or below the ground the
    // vehicle is actually on, and a wrong offset pins the camera to the terrain
    // floor for the first several metres of a climb.
    if (armed || !drapeGrid || !position) return;
    if (Math.abs(climbRate) > 0.5 || groundspeed > 1) return;
    const altMsl = isPrimary ? flatAltMsl : vehicle?.altitudeMsl ?? 0;
    if (altMsl === 0) return;
    datumOffsetRef.current = sampleElevation(drapeGrid, position[0], position[1]) - altMsl;
    dirtyRef.current = true;
  }, [armed, drapeGrid, position, climbRate, groundspeed, vehicle?.altitudeMsl, flatAltMsl, isPrimary]);

  // Latest pose for the render loop — assigned during render (cheap, idempotent).
  const nextPose = position
    ? {
        lat: position[0],
        lon: position[1],
        agl: vehicle?.altitudeAgl ?? 0,
        altMsl: isPrimary ? flatAltMsl : vehicle?.altitudeMsl ?? 0,
        eyeMsl: 0, // resolved against the datum offset in the render loop
        rollDeg: att?.roll ?? 0,
        pitchDeg: att?.pitch ?? 0,
        headingDeg: vehicle?.heading ?? 0,
      }
    : null;
  if ((nextPose === null) !== (poseRef.current === null)) {
    if (nextPose === null) {
      posBufRef.current = [];
      attBufRef.current = [];
      shownRef.current = null;
    }
    dirtyRef.current = true;
  }
  poseRef.current = nextPose;

  const vehicleKey = vehicle?.key ?? null;

  // ─── Telemetry sampling ───────────────────────────────────────────────────
  // Straight off the store, not out of the render body: React coalesces updates
  // that land in the same frame and would stamp them with the render time, so
  // attitude lost samples and got uneven timestamps (it stepped while position
  // glided). A store subscription sees every update at its arrival instant.
  useEffect(() => {
    const pushPos = (t: number, v: PosSample) => {
      const buf = posBufRef.current;
      const last = buf[buf.length - 1]?.v;
      if (
        last && last.lat === v.lat && last.lon === v.lon && last.altMsl === v.altMsl &&
        last.agl === v.agl && last.vN === v.vN && last.vE === v.vE && last.vD === v.vD
      ) return;
      if (last && approxDistanceM(last.lat, last.lon, v.lat, v.lon) > SNAP_DIST_M) posBufRef.current = [];
      pushSample(posBufRef.current, t, v);
      dirtyRef.current = true;
    };
    const pushAtt = (t: number, v: AttSample) => {
      const buf = attBufRef.current;
      const last = buf[buf.length - 1]?.v;
      if (
        last && last.rollDeg === v.rollDeg && last.pitchDeg === v.pitchDeg &&
        last.headingDeg === v.headingDeg && last.rollRate === v.rollRate &&
        last.pitchRate === v.pitchRate && last.yawRate === v.yawRate
      ) return;
      pushSample(attBufRef.current, t, v);
      dirtyRef.current = true;
    };

    if (isPrimary) {
      return useTelemetryStore.subscribe((st, prevSt) => {
        const t = performance.now();
        if (st.gps !== prevSt.gps || st.position !== prevSt.position) {
          if (st.gps.fixType >= 2 && (st.gps.lat !== 0 || st.gps.lon !== 0)) {
            pushPos(t, {
              lat: st.gps.lat,
              lon: st.gps.lon,
              altMsl: st.position.alt,
              agl: st.position.relativeAlt,
              vN: st.position.vx,
              vE: st.position.vy,
              vD: st.position.vz,
            });
          }
        }
        if (st.attitude !== prevSt.attitude || st.vfrHud !== prevSt.vfrHud) {
          pushAtt(t, {
            rollDeg: st.attitude.roll,
            pitchDeg: st.attitude.pitch,
            // ATTITUDE's own yaw, not VFR_HUD's whole-degree heading: it shares
            // this message's timestamp and rates, so the prediction advances
            // continuously instead of resetting to a stale heading.
            headingDeg: headingFrom(st.attitude.yaw, st.vfrHud.heading),
            rollRate: st.attitude.rollSpeed,
            pitchRate: st.attitude.pitchSpeed,
            yawRate: st.attitude.yawSpeed,
          });
        }
      });
    }
    if (!vehicleKey) return;
    return useFleetTelemetryStore.subscribe((st, prevSt) => {
      const tel = st.byVehicle[vehicleKey];
      if (!tel || tel === prevSt.byVehicle[vehicleKey]) return;
      const t = performance.now();
      if (tel.gps && tel.gps.fixType >= 2 && tel.position) {
        pushPos(t, {
          lat: tel.gps.lat,
          lon: tel.gps.lon,
          altMsl: tel.position.alt,
          agl: tel.position.relativeAlt,
          vN: tel.position.vx,
          vE: tel.position.vy,
          vD: tel.position.vz,
        });
      }
      if (tel.attitude) {
        pushAtt(t, {
          rollDeg: tel.attitude.roll,
          pitchDeg: tel.attitude.pitch,
          headingDeg: headingFrom(tel.attitude.yaw, tel.vfrHud?.heading ?? 0),
          rollRate: tel.attitude.rollSpeed,
          pitchRate: tel.attitude.pitchSpeed,
          yawRate: tel.attitude.yawSpeed,
        });
      }
    });
  }, [isPrimary, vehicleKey]);

  // ─── Scene lifecycle (mount once) ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const scene = createSvtScene(canvas);
    sceneRef.current = scene;
    setSvtFov(scene.getFov());

    const sizeToContainer = () => {
      const r = container.getBoundingClientRect();
      scene.resize(r.width, r.height);
      dirtyRef.current = true;
    };
    sizeToContainer();
    const ro = new ResizeObserver(sizeToContainer);
    ro.observe(container);

    let raf = 0;
    const loop = () => {
      const now = performance.now();
      const posBuf = posBufRef.current;
      const attBuf = attBufRef.current;
      const frameDt = lastFrameRef.current ? Math.min(0.1, (now - lastFrameRef.current) / 1000) : 0;
      lastFrameRef.current = now;
      const newestPos = posBuf[posBuf.length - 1];
      let pos: PosSample | null = null;
      if (newestPos) {
        const predicted = predictPos(newestPos, now);
        const held = shownPosRef.current;
        pos = held && approxDistanceM(held.lat, held.lon, predicted.lat, predicted.lon) <= SNAP_DIST_M
          ? blendPos(held, predicted, 1 - Math.exp(-frameDt / POS_BLEND_TAU_S))
          : predicted;
        shownPosRef.current = pos;
      } else {
        shownPosRef.current = null;
      }
      const newestAtt = attBuf[attBuf.length - 1];
      let att: AttSample | null = null;
      if (newestAtt) {
        const predicted = predictAtt(newestAtt, now);
        const held = shownAttRef.current;
        att = held ? lerpAtt(held, predicted, 1 - Math.exp(-frameDt / ATT_BLEND_TAU_S)) : predicted;
        shownAttRef.current = att;
      } else {
        shownAttRef.current = null;
      }
      const shown: SvtPose | null = pos && att
        ? { ...pos, ...att, eyeMsl: pos.altMsl + datumOffsetRef.current, eyeFloorM: eyeFloorRef.current }
        : null;
      const was = shownRef.current;
      const moved =
        (shown === null) !== (was === null) ||
        (shown !== null && was !== null && (
          shown.lat !== was.lat || shown.lon !== was.lon || shown.eyeMsl !== was.eyeMsl ||
          shown.rollDeg !== was.rollDeg || shown.pitchDeg !== was.pitchDeg ||
          shown.headingDeg !== was.headingDeg
        ));
      shownRef.current = shown;
      if (dirtyRef.current || moved) {
        dirtyRef.current = false;
        if (shown) scene.setPose(shown);
        scene.render();
        if (isPrimaryRef.current && now - publishAtRef.current > 33) {
          publishAtRef.current = now;
          setShownPose(shown);
          setClearanceM(scene.getClearanceM());
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // ─── Terrain streaming ────────────────────────────────────────────────────
  const lat = position?.[0] ?? null;
  const lon = position?.[1] ?? null;
  // Re-check on ~100 m moves; the distance gate below avoids needless reloads.
  const latKey = lat != null ? Math.round(lat * 1000) : null;
  const lonKey = lon != null ? Math.round(lon * 1000) : null;


  useEffect(() => {
    if (lat == null || lon == null || vehicleKey == null) return;
    const scene = sceneRef.current;
    if (!scene) return;

    // Instant restore after a remount (e.g. screen switch): rebuild the mesh from
    // the cached grid if it still covers us — cheap, no network, no reload flash.
    const cacheKey = `${vehicleKey}:${quality}`;
    if (!scene.hasTerrain()) {
      const cached = gridCache.get(cacheKey);
      if (cached && approxDistanceM(cached.centerLat, cached.centerLon, lat, lon) <= SVT_REBUILD_DISTANCE_M) {
        scene.setTerrain(buildTerrainGeometry(cached), cached);
        dirtyRef.current = true;
        gridCenterRef.current = { lat: cached.centerLat, lon: cached.centerLon };
        terrainQualityRef.current = quality;
        setDrapeGrid(cached);
        setTerrainStatus('ready');
      }
    }

    const center = gridCenterRef.current;
    const needsLoad =
      !center ||
      terrainQualityRef.current !== quality ||
      approxDistanceM(center.lat, center.lon, lat, lon) > SVT_REBUILD_DISTANCE_M;
    if (!needsLoad) return;

    const token = ++loadTokenRef.current; // newest load wins; stale ones no-op
    setTerrainStatus((s) => (s === 'ready' ? s : 'loading'));
    void (async () => {
      try {
        const grid = await loadElevationGrid(lat, lon, quality);
        if (token !== loadTokenRef.current) return; // superseded by a newer load
        sceneRef.current?.setTerrain(buildTerrainGeometry(grid), grid);
        dirtyRef.current = true;
        gridCenterRef.current = { lat, lon };
        terrainQualityRef.current = quality;
        setDrapeGrid(grid);
        cacheGrid(cacheKey, grid);
        setTerrainStatus('ready');
      } catch {
        if (token === loadTokenRef.current) setTerrainStatus((s) => (s === 'ready' ? s : 'error'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latKey, lonKey, vehicleKey, quality]);

  // ─── Satellite drape ──────────────────────────────────────────────────────
  // Rings follow the AIRCRAFT, not the terrain patch: the sharp inner ring is
  // small, so it is re-fetched every few hundred metres of travel (mostly cache
  // hits) instead of sitting at a patch centre kilometres behind.
  const drapeStep = recenterDistanceM() / 111_320;
  const drapeLatKey = lat != null ? Math.round(lat / drapeStep) : null;
  const drapeLonKey = lon != null ? Math.round(lon / drapeStep) : null;

  useEffect(() => {
    const scene = sceneRef.current;
    const grid = drapeGrid;
    if (!scene) return;
    if (!satellite || !grid || lat == null || lon == null) {
      scene.setDrape(null);
      dirtyRef.current = true;
      return;
    }
    if (drapeBusyRef.current) {
      drapePendingRef.current = true;
      return;
    }
    const token = ++drapeTokenRef.current;
    drapeBusyRef.current = true;
    void (async () => {
      try {
        const rings = await loadDrapeRings(grid, SVT_QUALITY[quality].outerRingTiles, { lat, lon });
        if (token !== drapeTokenRef.current) {
          for (const ring of rings) ring.texture.dispose();
          return;
        }
        sceneRef.current?.setDrape(rings.length > 0 ? rings : null);
        dirtyRef.current = true;
      } catch {
        // Imagery is optional; the elevation ramp stays.
      } finally {
        drapeBusyRef.current = false;
        if (drapePendingRef.current) {
          drapePendingRef.current = false;
          setDrapeRetry((n) => n + 1);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [satellite, quality, drapeGrid, drapeLatKey, drapeLonKey, drapeRetry]);

  const overlayAttitude = att ? { roll: att.roll, pitch: att.pitch } : null;
  // The 3D scene already shows a true banked horizon — drop the flat cyan line.
  const svtOsd: OsdLayers = { ...osd, artificialHorizon: false };

  // Drive the world-locked waypoint overlay with the SAME pose + fov the SVT
  // camera uses, so the symbology lands on the terrain. altMsl is the primary's
  // telemetry MSL (only the primary vehicle draws the overlay).
  const overlayPose = shownPose ?? nextPose;
  const worldOverlay = position && overlayPose
    ? {
        lat: overlayPose.lat,
        lon: overlayPose.lon,
        altMsl: overlayPose.altMsl !== 0 ? overlayPose.altMsl : flatAltMsl,
        yawDeg: overlayPose.headingDeg,
        pitchDeg: overlayPose.pitchDeg,
        rollDeg: overlayPose.rollDeg,
        fov: svtFov,
      }
    : null;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-black"
      onClick={onActivate}
      title={onActivate ? 'Click to make active' : undefined}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />

      {position && <CameraOverlays vehicle={vehicle} isPrimary={isPrimary} osd={svtOsd} attitude={overlayAttitude} worldOverlay={worldOverlay} />}

      {!position && (
        <Center>
          <div className="text-sm text-amber-300">No position fix</div>
          <div className="max-w-[80%] text-[11px] text-white/60">
            Synthetic vision needs a GPS fix from {vehicle?.label ?? 'the vehicle'}.
          </div>
        </Center>
      )}

      {position && armed && !onSurface && Number.isFinite(clearanceM) && clearanceM < TERRAIN_CAUTION_M && (
        <div
          className={
            'absolute left-1/2 top-2 -translate-x-1/2 rounded px-2 py-1 text-[11px] font-semibold tracking-wide ' +
            (clearanceM <= 0 ? 'bg-red-600/90 text-white' : 'bg-amber-500/90 text-black')
          }
        >
          {clearanceM <= 0 ? 'TERRAIN' : `TERRAIN ${Math.round(clearanceM)} m`}
        </div>
      )}

      {position && terrainStatus === 'loading' && (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded bg-black/55 px-2 py-1 text-[11px] text-white/80">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
          Loading terrain…
        </div>
      )}
      {position && terrainStatus === 'error' && (
        <div className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[11px] text-amber-300">
          Terrain data unavailable, check the internet connection.
        </div>
      )}
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-center">
      {children}
    </div>
  );
}
