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
import { useFleetTelemetryStore } from '../../stores/fleet-telemetry-store';
import { CameraOverlays } from './CameraOverlays';
import { createSvtScene, type SvtScene, type SvtPose } from './svt/svt-scene';
import {
  approxDistanceM,
  buildTerrainGeometry,
  loadElevationGrid,
  SVT_REBUILD_DISTANCE_M,
  type ElevationGrid,
} from './svt/svt-terrain';

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
  const [terrainStatus, setTerrainStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  // The SVT camera's vertical FOV, captured on mount so the world-locked HUD
  // overlay can drive its own camera with the exact same fov (zero calibration).
  const [svtFov, setSvtFov] = useState(62);

  const flatAttitude = useTelemetryStore((s) => s.attitude);
  const flatAltMsl = useTelemetryStore((s) => s.position.alt);
  const fleetAttitude = useFleetTelemetryStore((s) => (vehicle ? s.byVehicle[vehicle.key]?.attitude : undefined));

  const position = vehicle?.position ?? null;
  const att = isPrimary ? flatAttitude : fleetAttitude;

  // Latest pose for the render loop — assigned during render (cheap, idempotent).
  poseRef.current = position
    ? {
        lat: position[0],
        lon: position[1],
        agl: vehicle?.altitudeAgl ?? 0,
        rollDeg: att?.roll ?? 0,
        pitchDeg: att?.pitch ?? 0,
        headingDeg: vehicle?.heading ?? 0,
      }
    : null;

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
    };
    sizeToContainer();
    const ro = new ResizeObserver(sizeToContainer);
    ro.observe(container);

    let raf = 0;
    const loop = () => {
      if (poseRef.current) scene.setPose(poseRef.current);
      scene.render();
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

  const vehicleKey = vehicle?.key ?? null;

  useEffect(() => {
    if (lat == null || lon == null || vehicleKey == null) return;
    const scene = sceneRef.current;
    if (!scene) return;

    // Instant restore after a remount (e.g. screen switch): rebuild the mesh from
    // the cached grid if it still covers us — cheap, no network, no reload flash.
    if (!scene.hasTerrain()) {
      const cached = gridCache.get(vehicleKey);
      if (cached && approxDistanceM(cached.centerLat, cached.centerLon, lat, lon) <= SVT_REBUILD_DISTANCE_M) {
        scene.setTerrain(buildTerrainGeometry(cached), cached);
        gridCenterRef.current = { lat: cached.centerLat, lon: cached.centerLon };
        setTerrainStatus('ready');
      }
    }

    const center = gridCenterRef.current;
    const needsLoad = !center || approxDistanceM(center.lat, center.lon, lat, lon) > SVT_REBUILD_DISTANCE_M;
    if (!needsLoad) return;

    const token = ++loadTokenRef.current; // newest load wins; stale ones no-op
    setTerrainStatus((s) => (s === 'ready' ? s : 'loading'));
    void (async () => {
      try {
        const grid = await loadElevationGrid(lat, lon);
        if (token !== loadTokenRef.current) return; // superseded by a newer load
        sceneRef.current?.setTerrain(buildTerrainGeometry(grid), grid);
        gridCenterRef.current = { lat, lon };
        cacheGrid(vehicleKey, grid);
        setTerrainStatus('ready');
      } catch {
        if (token === loadTokenRef.current) setTerrainStatus((s) => (s === 'ready' ? s : 'error'));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latKey, lonKey, vehicleKey]);

  const overlayAttitude = att ? { roll: att.roll, pitch: att.pitch } : null;
  // The 3D scene already shows a true banked horizon — drop the flat cyan line.
  const svtOsd: OsdLayers = { ...osd, artificialHorizon: false };

  // Drive the world-locked waypoint overlay with the SAME pose + fov the SVT
  // camera uses, so the symbology lands on the terrain. altMsl is the primary's
  // telemetry MSL (only the primary vehicle draws the overlay).
  const worldOverlay = position
    ? {
        lat: position[0],
        lon: position[1],
        altMsl: flatAltMsl,
        yawDeg: vehicle?.heading ?? 0,
        pitchDeg: att?.pitch ?? 0,
        rollDeg: att?.roll ?? 0,
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

      {position && terrainStatus === 'loading' && (
        <div className="absolute bottom-2 left-2 flex items-center gap-2 rounded bg-black/55 px-2 py-1 text-[11px] text-white/80">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
          Loading terrain…
        </div>
      )}
      {position && terrainStatus === 'error' && (
        <div className="absolute bottom-2 left-2 rounded bg-black/55 px-2 py-1 text-[11px] text-amber-300">
          Terrain data unavailable — check the internet connection.
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
