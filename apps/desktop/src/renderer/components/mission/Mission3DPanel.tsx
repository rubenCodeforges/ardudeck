import { Trans, useTranslation } from 'react-i18next';
import { useEffect, useRef, useState, useMemo, useCallback, type ReactNode } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Use pre-built CSP worker to avoid Vite esbuild __publicField error.
// Resolve relative to the document: a leading-slash path 404s under file:// in
// packaged builds (see ObjectEditorMap.tsx), breaking the MapLibre worker.
maplibregl.setWorkerUrl(new URL('maplibre-worker.js', document.baseURI).href);
import { useMissionStore } from '../../stores/mission-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useIpLocation } from '../../utils/ip-geolocation';
import { computeItemColors, SEGMENT_COLORS } from '../../utils/mission-segment-colors';
import {
  isNavigationCommand,
  commandHasLocation,
  hasValidCoordinates,
  mavFrameToAltFrame,
  MAV_CMD,
} from '../../../shared/mission-types';
import { isSurveyGroup } from '../../../shared/mission-group-types';
import { createMissionThreeJsLayer, type MissionThreeJsLayer, type MissionLayerWaypoint } from './mission-threejs-layer';
import { buildPathLegs } from './mission-path';
import { vehicleItemNumbers } from './mission-end';
import { altitudeForMsl, buildMission3D, homeAltitudeMsl, type GroundAt } from './mission-3d-geometry';
import { loadHeightfield, pickZoom, sampleHeightfield, type Heightfield } from '../camera/svt/svt-dem-tiles';
import { formatAltitudeFromMeters } from '../../../shared/user-units.js';
import { MapLayersControl } from '../map/overlays/MapLayersControl';
import { UserModelsMapLibreDrop } from '../models/UserModelsMapLibreDrop';
import { ElevationLegend } from '../map/ElevationLegend';
import type { ElevationRange } from '../map/TerrainOverlayLayer';
import { terrainColorStops, WATER_THRESHOLD } from '../../utils/terrain-colors';
import { attachModuleLayers3D, attachPick3D } from './module-layers-3d';
import { ModulePolygonPickBar } from '../panels/ModuleMapLayers';
import { getPolygonPick, subscribeModuleMapLayers } from '../../modules/module-map-registry';
import { useSurveyStore } from '../../stores/survey-store';
import { useSurveyMenuStore } from '../../stores/survey-menu-store';
import { useFlightPreviewStore } from '../../stores/flight-preview-store';
import { CAM_FOV_DEG, CAM_RANGE_M, offsetLatLng, useFlightPreviewTimeline } from './FlightPreviewOverlay';
import { FollowState, shouldRecenter } from './preview-follow';
import { sampleTimeline } from './flight-preview';
import type { Line3D } from './mission-3d-geometry';

/** The point of the drawn route nearest to a position, so the preview aircraft flies the line as drawn. */
function onRoute(lines: Line3D[], lat: number, lon: number): { lat: number; lon: number; alt: number } | null {
  const k = Math.cos((lat * Math.PI) / 180);
  let best: { lat: number; lon: number; alt: number } | null = null;
  let bestD = Infinity;
  for (const line of lines) {
    if (line.dashed) continue;
    for (let i = 0; i < line.points.length - 1; i++) {
      const a = line.points[i]!, b = line.points[i + 1]!;
      const ax = (a.lon - lon) * k, ay = a.lat - lat, bx = (b.lon - lon) * k, by = b.lat - lat;
      const dx = bx - ax, dy = by - ay;
      const len = dx * dx + dy * dy;
      const t = len > 0 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len)) : 0;
      const px = ax + dx * t, py = ay + dy * t;
      const d = px * px + py * py;
      if (d < bestD) {
        bestD = d;
        best = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t, alt: a.alt + (b.alt - a.alt) * t };
      }
    }
  }
  return best;
}
import { createVehicleThreeJsLayer, type VehicleThreeJsLayer } from './vehicle-threejs-layer';
import { createMeshThreeJsLayer, type MeshThreeJsLayer } from './mesh-threejs-layer';
import { demSourceMaxZoom, useTileSourceStore } from '../../stores/tile-source-store';
import { meshesFor, useSceneMeshStore } from '../../stores/scene-mesh-store';

// Shared map layer definitions (centralized)
import { MAP_LAYERS, mapLayerName, type LayerKey, type MapLayer } from '../../../shared/map-layers';

// Exclude 'dem' from the layer picker (it's a data layer, not a base map)
type BaseLayerKey = Exclude<LayerKey, 'dem'>;

const BASE_LAYERS = (Object.keys(MAP_LAYERS) as LayerKey[]).filter((k) => k !== 'dem' && k !== 'openaip' && k !== 'radar');
const BUILDINGS_FILTER: maplibregl.FilterSpecification = ['!=', ['get', 'hide_3d'], true];

/** MapLibre colour-relief stops for the 2D height scale, over `range` (else absolute), shifted by `ref`. */
function heightColorExpression(range: ElevationRange | null, ref: number): maplibregl.ExpressionSpecification {
  const stops = terrainColorStops();
  const top = stops[stops.length - 1]!.elev;
  const at = (e: number) => (range && range.max > range.min ? range.min + (e / top) * (range.max - range.min) : e) + ref;
  const expr: unknown[] = ['interpolate', ['linear'], ['elevation']];
  let last = -Infinity;
  for (const s of stops) {
    const e = Math.max(at(s.elev), last + 0.01);
    expr.push(e, `rgb(${s.color[0]},${s.color[1]},${s.color[2]})`);
    last = e;
  }
  return expr as maplibregl.ExpressionSpecification;
}

/** Sun shading on the relief, SVT's lit terrain on top of the draped imagery. */
function addRelief(map: maplibregl.Map, beforeId?: string) {
  map.addLayer({
    id: 'terrain-relief', type: 'hillshade', source: 'terrain-dem',
    paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': 'rgba(20,30,20,0.55)', 'hillshade-highlight-color': 'rgba(255,246,230,0.25)', 'hillshade-illumination-direction': 315 },
  }, beforeId);
}

/** Below the cargo and mission layers, so it only tints the ground. */
function addHeightLayer(map: maplibregl.Map, beforeId?: string) {
  map.addLayer({ id: 'height-colors', type: 'color-relief', source: 'terrain-dem', layout: { visibility: 'none' }, paint: { 'color-relief-opacity': 0.6, 'color-relief-color': heightColorExpression(null, 0) } }, beforeId);
}

/** Command-type color — matches 2D map markers */
function getCommandColor(cmd: number): string {
  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return '#22c55e';
    case MAV_CMD.NAV_LAND:
    case MAV_CMD.NAV_VTOL_LAND:
    case MAV_CMD.DO_LAND_START:
      return '#ef4444';
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return '#f97316';
    case MAV_CMD.NAV_LOITER_UNLIM:
    case MAV_CMD.NAV_LOITER_TIME:
    case MAV_CMD.NAV_LOITER_TURNS:
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return '#a855f7';
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return '#06b6d4';
    default:
      return '#3b82f6';
  }
}

/** Get icon shape for special command types (matches 2D markers) */
function getCommandShape(cmd: number): string {
  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return '\u25B2';
    case MAV_CMD.NAV_LAND:
    case MAV_CMD.NAV_VTOL_LAND:
    case MAV_CMD.DO_LAND_START:
      return '\u25BC';
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return '\u2302';
    case MAV_CMD.NAV_LOITER_UNLIM:
    case MAV_CMD.NAV_LOITER_TIME:
    case MAV_CMD.NAV_LOITER_TURNS:
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return '\u25CB';
    default:
      return '';
  }
}

const TILE_MISS_WARN_MS = 60_000;
let tileMissCount = 0;
let tileMissSources = new Set<string>();
let tileMissTimer: ReturnType<typeof setTimeout> | null = null;

function isTileMiss(message: string | undefined): boolean {
  return !!message && /could not be decoded|could not load image|failed to fetch|AJAXError/i.test(message);
}

/** One summarised warning per minute instead of one console error per missing tile. */
function noteTileMiss(sourceId: string): void {
  tileMissCount++;
  tileMissSources.add(sourceId);
  if (tileMissTimer) return;
  tileMissTimer = setTimeout(() => {
    console.warn(`[3D] ${tileMissCount} map tiles missing (${[...tileMissSources].join(', ')}), drawn without them`); // i18n-exempt
    tileMissCount = 0;
    tileMissSources = new Set();
    tileMissTimer = null;
  }, TILE_MISS_WARN_MS);
}

/** Get tile-cache:// URL template for a layer (MapLibre substitutes {z}/{x}/{y}) */
function getCachedTileUrl(layerKey: BaseLayerKey): string {
  return `tile-cache://${layerKey}/{z}/{x}/{y}.png`;
}

/** CSS overrides to dark-theme the MapLibre navigation control */
const DARK_MAP_CSS = `
.maplibregl-ctrl-group {
  background: var(--map-control-bg) !important;
  border: 1px solid var(--map-control-border) !important;
  border-radius: 8px !important;
  backdrop-filter: blur(8px);
}
.maplibregl-ctrl-group button {
  border-color: var(--map-control-border) !important;
}
.maplibregl-ctrl-group button + button {
  border-top-color: var(--map-control-border) !important;
}
.maplibregl-ctrl-group button span {
  filter: invert(0.7);
}
.maplibregl-ctrl-group button:hover {
  background: var(--map-control-bg-hover) !important;
}
.maplibregl-ctrl-attrib {
  background: transparent !important;
  color: rgba(156, 163, 175, 0.3) !important;
  font-size: 9px !important;
}
.maplibregl-ctrl-attrib a {
  color: rgba(156, 163, 175, 0.3) !important;
}
.maplibregl-ctrl-top-left,
.maplibregl-ctrl-bottom-left,
.maplibregl-ctrl-bottom-right {
  display: none !important;
}
`;

interface Mission3DPanelProps {
  /** Show an inline 2D/3D toggle at the top of the layer selector (used in telemetry panel) */
  showMapModeToggle?: boolean;
  /** Callback fired when the MapLibre map instance is ready (used by telemetry wrapper for follow-vehicle) */
  onMapReady?: (map: maplibregl.Map) => void;
  /** When true, hide the "Set Home / No waypoints" placeholder (used in telemetry mode) */
  isTelemetryMode?: boolean;
  /** Show heading line from vehicle position. Provide pre-computed end point [lon, lat] */
  headingLineEnd?: [number, number] | null;
  /** Color for heading line (matches armed state) */
  headingLineColor?: string;
  /** Flight trail coordinates as [lon, lat][] */
  trail?: [number, number][];
  /** Hide/show mission overlays (3D waypoints, ground shadow, home). Default: true */
  showMission?: boolean;
  /** Enable/disable terrain DEM. Default: true */
  showTerrain?: boolean;
  /** Extra toolbar buttons rendered below the layer buttons (used by TelemetryMap3D) */
  toolbarContent?: ReactNode;
  /** Override vehicle marker position [lon, lat] with fallback logic (for telemetry mode) */
  vehicleLngLat?: [number, number] | null;
  /** Override vehicle heading (for telemetry mode) */
  vehicleHeading?: number;
  /** Override vehicle armed state (for telemetry mode) */
  vehicleArmed?: boolean;
  /** Vehicle attitude for 3D model (roll/pitch in degrees) */
  vehicleAttitude?: { roll: number; pitch: number };
  /** Vehicle altitude above ground level in meters (for 3D model) */
  vehicleAltitudeAgl?: number;
  /** Heading line length in meters (for 3D heading line) */
  headingLineLength?: number;
  /** Use real vehicle size from profile (true) or auto-scale (false). Default: true */
  useRealVehicleSize?: boolean;
}

export function Mission3DPanel({
  showMapModeToggle,
  onMapReady,
  isTelemetryMode,
  headingLineEnd,
  headingLineColor = '#22d3ee',
  trail,
  showMission = true,
  showTerrain = true,
  toolbarContent,
  vehicleLngLat,
  vehicleHeading,
  vehicleArmed,
  vehicleAttitude,
  vehicleAltitudeAgl,
  headingLineLength,
  useRealVehicleSize = true,
}: Mission3DPanelProps = {}) {
  const { t } = useTranslation();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const threeLayerRef = useRef<MissionThreeJsLayer | null>(null);
  const vehicleLayerRef = useRef<VehicleThreeJsLayer | null>(null);
  const meshLayerRef = useRef<MeshThreeJsLayer | null>(null);
  const terrainVersion = useTileSourceStore((s) => s.version);
  const meshVersion = useSceneMeshStore((s) => s.version);
  const markerContainerRef = useRef<HTMLDivElement>(null);
  const isInitialFitDone = useRef(false);

  const sharedMapLayer = useEditModeStore((s) => s.mapLayer);
  const setSharedMapLayer = useEditModeStore((s) => s.setMapLayer);
  // Use shared layer if it's a valid 3D key, otherwise fall back to 'googleSat'
  const activeLayer: LayerKey = (sharedMapLayer in MAP_LAYERS ? sharedMapLayer : 'googleSat') as LayerKey;
  const setActiveLayer = (layer: LayerKey) => setSharedMapLayer(layer);
  const [exaggeration, setExaggeration] = useState(1.0);
  const exaggerationRef = useRef(1);
  exaggerationRef.current = exaggeration;
  const [showHeight, setShowHeight] = useState(false);
  const [heightAuto, setHeightAuto] = useState(true);
  const [heightFixed, setHeightFixed] = useState<ElevationRange>({ min: 0, max: 1500 });
  const [heightRelative, setHeightRelative] = useState(false);
  const [heightTick, setHeightTick] = useState(0);
  const [addMode, setAddMode] = useState(false);
  const [homeMode, setHomeMode] = useState(false);
  const activeMode = useEditModeStore((s) => s.activeMode);
  const surveyActive = useSurveyStore((s) => s.isActive);
  const [pickActive, setPickActive] = useState(() => getPolygonPick() !== null);
  useEffect(() => subscribeModuleMapLayers(() => setPickActive(getPolygonPick() !== null)), []);
  const detachRef = useRef<Array<() => void>>([]);
  const mapClickRef = useRef<(e: maplibregl.MapMouseEvent) => void>(() => {});

  // MapLibre caches raster-dem tiles per source; a module DEM change needs the source rebuilt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource('terrain-dem')) return;
    map.setTerrain(null);
    // a layer on the source blocks its removal
    if (map.getLayer('height-colors')) map.removeLayer('height-colors');
    if (map.getLayer('terrain-relief')) map.removeLayer('terrain-relief');
    map.removeSource('terrain-dem');
    map.addSource('terrain-dem', { type: 'raster-dem', tiles: ['tile-cache://dem/{z}/{x}/{y}.png'], tileSize: 256, encoding: 'terrarium', maxzoom: demSourceMaxZoom(useTileSourceStore.getState().entries) });
    map.setTerrain({ source: 'terrain-dem', exaggeration });
    const below = map.getLayer('module-fill') ? 'module-fill' : undefined;
    addRelief(map, below);
    addHeightLayer(map, below);
    setHeightTick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrainVersion]);

  useEffect(() => {
    meshLayerRef.current?.setMeshes(meshesFor('mission3d'), exaggeration);
  }, [meshVersion, exaggeration]);
  const [mapReady, setMapReady] = useState(false);
  const [ipLocation] = useIpLocation();

  // Store data
  const missionItems = useMissionStore(s => s.missionItems);
  const homePosition = useMissionStore(s => s.homePosition);
  const selectedSeq = useMissionStore(s => s.selectedSeq);
  const setSelectedSeq = useMissionStore(s => s.setSelectedSeq);
  const loadCounter = useMissionStore(s => s.loadCounter);
  const position = useTelemetryStore(s => s.position);
  const vfrHud = useTelemetryStore(s => s.vfrHud);
  const flight = useTelemetryStore(s => s.flight);
  const isConnected = useConnectionStore(s => s.connectionState.isConnected);

  const navWaypoints = useMemo(() => {
    return missionItems.filter(
      item =>
        isNavigationCommand(item.command) &&
        commandHasLocation(item.command) &&
        hasValidCoordinates(item.latitude, item.longitude),
    );
  }, [missionItems]);

  // Segment colors per item (for marker tinting + path coloring, matches 2D map)
  const itemColors = useMemo(() => computeItemColors(missionItems), [missionItems]);

  const groups = useMissionStore((s) => s.groups);
  const updateWaypoint = useMissionStore((s) => s.updateWaypoint);
  const showSegmentColors = useSettingsStore((s) => s.missionDefaults.showSegmentColors);
  const maxPins = useSettingsStore((s) => s.surveyPerformance.maxInteractiveWaypoints);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  // same visibility and colouring rules as the 2D map
  const visibleItems = useMemo(() => {
    const hidden = new Set(groups.filter((g) => !g.visible).map((g) => g.id));
    return hidden.size === 0 ? missionItems : missionItems.filter((it) => !it.groupId || !hidden.has(it.groupId));
  }, [missionItems, groups]);
  const colorByGroup = groups.length > 1;
  const groupColorOf = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.id, g.color]));
    return (id: string | undefined) => (id ? byId.get(id) : undefined);
  }, [groups]);
  const surveyGroupIds = useMemo(() => new Set(groups.filter(isSurveyGroup).map((g) => g.id)), [groups]);
  const groupNumbers = useMemo(() => vehicleItemNumbers(missionItems, groups), [missionItems, groups]);

  // ground under the mission, from the same DEM tiles the 3D terrain is drawn from
  const boundsKey = useMemo(() => {
    let minLat = Infinity, minLon = Infinity, maxLat = -Infinity, maxLon = -Infinity;
    const add = (lat: number, lon: number) => {
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
    };
    for (const it of visibleItems) if (hasValidCoordinates(it.latitude, it.longitude)) add(it.latitude, it.longitude);
    if (homePosition && hasValidCoordinates(homePosition.lat, homePosition.lon)) add(homePosition.lat, homePosition.lon);
    if (minLat === Infinity) return null;
    const r = (v: number) => Math.round(v * 200) / 200;
    return `${r(minLat - 0.005)},${r(minLon - 0.005)},${r(maxLat + 0.005)},${r(maxLon + 0.005)}`;
  }, [visibleItems, homePosition]);
  const [heightfield, setHeightfield] = useState<Heightfield | null>(null);
  const heightfieldRef = useRef<Heightfield | null>(null);
  heightfieldRef.current = heightfield;
  useEffect(() => {
    if (!boundsKey) { setHeightfield(null); return; }
    const [s0, w0, n0, e0] = boundsKey.split(',').map(Number) as [number, number, number, number];
    const lat = (s0 + n0) / 2;
    const halfM = Math.max((n0 - s0) * 111_320, (e0 - w0) * 111_320 * Math.cos((lat * Math.PI) / 180)) / 2;
    let cancelled = false;
    void loadHeightfield(s0, w0, n0, e0, pickZoom(halfM, lat, 14)).then((hf) => {
      if (!cancelled) setHeightfield(hf.loadedTiles > 0 ? hf : null);
    });
    return () => { cancelled = true; };
  }, [boundsKey, terrainVersion]);
  const ground: GroundAt = useMemo(() => {
    if (heightfield) return (lat: number, lon: number) => sampleHeightfield(heightfield, lat, lon);
    const flat = homePosition?.alt ?? 0;
    return () => flat;
  }, [heightfield, homePosition]);
  const homeAlt = useMemo(() => homeAltitudeMsl(homePosition, ground), [homePosition, ground]);

  // a waypoint being dragged is drawn where it is now, saved only on release
  const [preview, setPreview] = useState<{ seq: number; lat: number; lon: number; alt: number } | null>(null);
  const drawItems = useMemo(() => {
    if (!preview) return visibleItems;
    return visibleItems.map((it) => {
      if (it.seq !== preview.seq) return it;
      const placed = hasValidCoordinates(it.latitude, it.longitude);
      const lat = placed ? preview.lat : it.latitude;
      const lon = placed ? preview.lon : it.longitude;
      const g = placed ? ground(lat, lon) : ground(homePosition?.lat ?? 0, homePosition?.lon ?? 0);
      return { ...it, latitude: lat, longitude: lon, altitude: altitudeForMsl(it, preview.alt, g, homeAlt) };
    });
  }, [visibleItems, preview, ground, homeAlt, homePosition]);

  const geometry = useMemo(() => {
    const g = buildMission3D(drawItems, buildPathLegs(drawItems, colorByGroup ? groupColorOf : undefined), homePosition, ground);
    if (!colorByGroup && !showSegmentColors) for (const l of g.lines) if (!l.dashed) l.color = SEGMENT_COLORS.default;
    return g;
  }, [drawItems, colorByGroup, groupColorOf, homePosition, ground, showSegmentColors]);

  const layerWaypoints = useMemo((): MissionLayerWaypoint[] => geometry.waypoints.map((w) => {
    const commandColor = getCommandColor(w.item.command);
    const special = commandColor !== '#3b82f6';
    const color = special
      ? commandColor
      : (colorByGroup ? groupColorOf(w.item.groupId) : undefined) ?? (showSegmentColors ? itemColors.get(w.seq) : undefined) ?? '#3b82f6';
    return {
      seq: w.seq, lat: w.lat, lon: w.lon, alt: w.alt, ground: w.ground, color,
      label: getCommandShape(w.item.command) || String(groupNumbers.get(w.seq) ?? w.seq + 1),
      kind: w.item.groupId && surveyGroupIds.has(w.item.groupId) ? 'dot' : 'pin',
    };
  }), [geometry, colorByGroup, groupColorOf, showSegmentColors, itemColors, groupNumbers, surveyGroupIds]);

  // the layer's callbacks are made once, so they read the latest values from here
  const live = useRef({ geometry, ground, homeAlt, altitudeUnit, readOnly: !!isTelemetryMode });
  live.current = { geometry, ground, homeAlt, altitudeUnit, readOnly: !!isTelemetryMode };
  useEffect(() => {
    meshLayerRef.current?.setFallbackGround(heightfield ? ground : null);
  }, [ground, heightfield]);
  const frameTag = useCallback((frame: number) => {
    const f = mavFrameToAltFrame(frame);
    return f === 'asl' ? t('panels:altitudePanel.msl') : f === 'terrain' ? t('panels:altitudePanel.agl') : t('map:elevationLegend.rel');
  }, [t]);
  const frameTagRef = useRef(frameTag);
  frameTagRef.current = frameTag;

  const addWaypoint = useMissionStore((s) => s.addWaypoint);
  const setHomePosition = useMissionStore((s) => s.setHomePosition);
  const editingTools = !isTelemetryMode && activeMode === 'mission' && !surveyActive;
  mapClickRef.current = (e) => {
    if (!editingTools || getPolygonPick()) return;
    if (threeLayerRef.current?.hitAt(e.point.x, e.point.y)) return;
    const { lat, lng } = e.lngLat;
    if (homeMode) {
      setHomePosition(lat, lng, 0);
      setHomeMode(false);
      return;
    }
    if (!addMode && !e.originalEvent.shiftKey) return;
    // same rules as 2D: home follows the first waypoint, the height follows the last one
    if (!homePosition) setHomePosition(lat, lng, 0);
    const last = missionItems[missionItems.length - 1];
    addWaypoint(lat, lng, last?.altitude ?? 100);
  };
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.getCanvas().style.cursor = addMode || homeMode ? 'crosshair' : '';
    if (!addMode && !homeMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setAddMode(false);
      setHomeMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addMode, homeMode, mapReady]);
  useEffect(() => {
    if (!editingTools) { setAddMode(false); setHomeMode(false); }
  }, [editingTools]);

  // flight preview: this map runs the clock while it is open (the 2D map is unmounted then)
  const previewActive = useFlightPreviewStore((s) => s.isActive);
  const previewPlaying = useFlightPreviewStore((s) => s.playing);
  const previewTime = useFlightPreviewStore((s) => s.timeMs);
  const advancePreview = useFlightPreviewStore((s) => s.advance);
  const timeline = useFlightPreviewTimeline();
  useEffect(() => {
    if (!previewActive || !previewPlaying) return;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      advancePreview(now - last, timeline.durationMs);
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [previewActive, previewPlaying, advancePreview, timeline.durationMs]);
  const follow = useRef(new FollowState());
  useEffect(() => {
    if (previewPlaying) follow.current.restart();
  }, [previewPlaying]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    // a pan or zoom by the pilot hands the view back until play is pressed again
    const off = (e: { originalEvent?: unknown }) => { if (e.originalEvent) follow.current.userMoved(); };
    map.on('dragstart', off);
    map.on('zoomstart', off);
    map.on('rotatestart', off);
    return () => { map.off('dragstart', off); map.off('zoomstart', off); map.off('rotatestart', off); };
  }, [mapReady]);
  useEffect(() => {
    const layer = threeLayerRef.current;
    const map = mapRef.current;
    if (!layer || !map || !mapReady) return;
    const sample = previewActive ? sampleTimeline(timeline, previewTime) : null;
    const at = sample ? onRoute(geometry.lines, sample.lat, sample.lng) : null;
    if (!sample || !at) { layer.setPreviewPose(null); return; }
    // the camera looks forward and down; the patch it sees grows with the height over the ground
    const agl = Math.max(1, at.alt - ground(sample.lat, sample.lng));
    const range = Math.max(CAM_RANGE_M, agl * 1.2);
    const half = CAM_FOV_DEG / 2;
    const cone = [sample.camHeading - half, sample.camHeading, sample.camHeading + half].map((h, i) => {
      const [lat, lon] = offsetLatLng(sample.lat, sample.lng, h, i === 1 ? range * 1.12 : range);
      return { lat, lon, alt: ground(lat, lon) + 0.3 };
    });
    cone.unshift({ lat: sample.lat, lon: sample.lng, alt: ground(sample.lat, sample.lng) + 0.3 });
    layer.setPreviewPose({ lat: sample.lat, lon: sample.lng, alt: at.alt, heading: sample.trackHeading, cone });
    if (previewPlaying && follow.current.active && !map.isMoving()) {
      const pt = map.project([sample.lng, sample.lat]);
      const c = map.getCanvas();
      if (shouldRecenter(pt, { width: c.clientWidth, height: c.clientHeight }).recenter) map.easeTo({ center: [sample.lng, sample.lat], duration: 400 });
    }
  }, [previewActive, previewPlaying, previewTime, timeline, geometry, ground, mapReady]);

  // survey drawing lives on the 2D map, so that button hands over to it
  const openIn2d = useCallback((then: () => void) => {
    useEditModeStore.getState().setMapMode('2d');
    then();
  }, []);

  // Inject dark theme CSS
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = DARK_MAP_CSS;
    document.head.appendChild(style);
    return () => { document.head.removeChild(style); };
  }, []);

  // Compute fallback center (used only when no stored viewport from a previous panel)
  const fallbackCenter = useMemo((): [number, number] => {
    if (navWaypoints.length > 0) {
      let sumLat = 0, sumLon = 0;
      for (const wp of navWaypoints) {
        sumLat += wp.latitude;
        sumLon += wp.longitude;
      }
      return [sumLon / navWaypoints.length, sumLat / navWaypoints.length];
    }
    const gpsState = useTelemetryStore.getState().gps;
    if (gpsState.fixType >= 2 && gpsState.lat !== 0 && gpsState.lon !== 0) {
      return [gpsState.lon, gpsState.lat];
    }
    if (ipLocation && ipLocation.lat !== 0 && ipLocation.lon !== 0) {
      return [ipLocation.lon, ipLocation.lat];
    }
    return [20, 44];
  }, [ipLocation, navWaypoints]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Restore viewport from the panel we're switching from (2D↔3D)
    const storedVp = useEditModeStore.getState().mapViewport;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: buildStyle(activeLayer),
      center: storedVp?.center ?? fallbackCenter,
      zoom: storedVp?.zoom ?? 12,
      pitch: storedVp ? (storedVp.pitch || 50) : 50, // 0 from 2D → default 50
      bearing: storedVp?.bearing ?? 0,
      maxPitch: 85,
      canvasContextAttributes: { antialias: true },
    });

    // Sync viewport to shared store on every camera move
    map.on('moveend', () => {
      const c = map.getCenter();
      useEditModeStore.getState().setMapViewport({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      });
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left');

    map.on('load', () => {
      // Terrain DEM
      map.addSource('terrain-dem', {
        type: 'raster-dem',
        tiles: ['tile-cache://dem/{z}/{x}/{y}.png'],
        tileSize: 256,
        encoding: 'terrarium',
        // 15 is the native DEM; while a module DEM exists the host serves up to 19 and overzooms its own past 15
        maxzoom: demSourceMaxZoom(useTileSourceStore.getState().entries),
      });

      map.setTerrain({ source: 'terrain-dem', exaggeration });
      addRelief(map);
      addHeightLayer(map);

      // SVT's daylight sky (svt-scene.ts): deep blue overhead into a pale horizon haze
      map.setSky({
        'sky-color': '#3b74c4',
        'horizon-color': '#bcd4ec',
        'fog-color': '#bcd4ec',
        'fog-ground-blend': 0.75,
        'horizon-fog-blend': 0.6,
        'sky-horizon-blend': 0.7,
        'atmosphere-blend': 0.8,
      });

      // 3D buildings
      map.addSource('openmaptiles', {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet',
      });

      map.addLayer({
        id: '3d-buildings',
        source: 'openmaptiles',
        'source-layer': 'building',
        type: 'fill-extrusion',
        minzoom: 14,
        filter: BUILDINGS_FILTER,
        paint: {
          'fill-extrusion-color': [
            'interpolate', ['linear'], ['get', 'render_height'],
            0, '#2a2d3e', 50, '#363a4f', 200, '#434861',
          ],
          'fill-extrusion-height': [
            'interpolate', ['linear'], ['zoom'],
            14, 0, 15.5, ['get', 'render_height'],
          ],
          'fill-extrusion-base': [
            'interpolate', ['linear'], ['zoom'],
            14, 0, 15.5, ['get', 'render_min_height'],
          ],
          'fill-extrusion-opacity': 0.7,
        },
      });

      // Native MapLibre sources for terrain-level features
      const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
      map.addSource('ground-shadow', { type: 'geojson', data: empty });
      map.addSource('home', { type: 'geojson', data: empty });

      // Ground shadow — dashed line on terrain
      map.addLayer({
        id: 'ground-shadow',
        type: 'line',
        source: 'ground-shadow',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#6b7280',
          'line-width': 1.5,
          'line-opacity': 0.4,
          'line-dasharray': [4, 4],
        },
      });

      detachRef.current.push(attachModuleLayers3D(map, 'ground-shadow', () => exaggerationRef.current), attachPick3D(map, 'ground-shadow'));

      // Home marker
      map.addLayer({
        id: 'home-outer',
        type: 'circle',
        source: 'home',
        paint: {
          'circle-radius': 12,
          'circle-color': 'transparent',
          'circle-stroke-color': '#f97316',
          'circle-stroke-width': 2.5,
        },
      });
      map.addLayer({
        id: 'home-inner',
        type: 'circle',
        source: 'home',
        paint: { 'circle-radius': 4, 'circle-color': '#f97316' },
      });

      // Flight trail — dark outline + purple main trail
      map.addSource('vehicle-trail', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'vehicle-trail-outline',
        type: 'line',
        source: 'vehicle-trail',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#000', 'line-width': 5, 'line-opacity': 0.4 },
      });
      map.addLayer({
        id: 'vehicle-trail-main',
        type: 'line',
        source: 'vehicle-trail',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#a855f7', 'line-width': 3, 'line-opacity': 0.9 },
      });

      // Heading line — triple layer (black outline, white outline, colored)
      map.addSource('heading-line', { type: 'geojson', data: empty });
      map.addLayer({
        id: 'heading-line-dark',
        type: 'line',
        source: 'heading-line',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#000', 'line-width': 6, 'line-opacity': 0.6 },
      });
      map.addLayer({
        id: 'heading-line-white',
        type: 'line',
        source: 'heading-line',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#fff', 'line-width': 4, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'heading-line-color',
        type: 'line',
        source: 'heading-line',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': '#22d3ee', 'line-width': 3, 'line-opacity': 1 },
      });

      // Three.js custom layer — renders flight path + drop lines at altitude
      // Waypoint markers are DOM overlays projected to screen space each frame
      const threeLayer = createMissionThreeJsLayer({
        onSelect: (seq) => setSelectedSeq(seq),
        onPreview: (p) => setPreview(live.current.readOnly ? null : p),
        onCommit: ({ seq, lat, lon, alt, mode }) => {
          const { geometry: g, ground: groundAt, homeAlt: home, readOnly } = live.current;
          const wp = g.waypoints.find((w) => w.seq === seq);
          if (!wp || readOnly) return;
          if (mode === 'move') {
            // a takeoff drawn at home has no position of its own to move
            if (!wp.atHome) updateWaypoint(seq, { latitude: lat, longitude: lon });
            return;
          }
          const altitude = altitudeForMsl(wp.item, alt, groundAt(wp.lat, wp.lon), home);
          updateWaypoint(seq, { altitude: Math.round(altitude * 10) / 10 });
        },
        altitudeLabel: (seq, altMsl) => {
          const { geometry: g, ground: groundAt, homeAlt: home, altitudeUnit: unit } = live.current;
          const wp = g.waypoints.find((w) => w.seq === seq);
          if (!wp) return '';
          return `${formatAltitudeFromMeters(altitudeForMsl(wp.item, altMsl, groundAt(wp.lat, wp.lon), home), unit)} ${frameTagRef.current(wp.item.frame)}`;
        },
        handleTip: t('mission:mission3DPanel.altitudeHandleTip'),
      });
      threeLayer.setMarkerContainer(markerContainerRef.current);
      threeLayerRef.current = threeLayer;
      map.addLayer(threeLayer.layer);

      const meshLayer = createMeshThreeJsLayer({ buildings: { layerId: '3d-buildings', baseFilter: BUILDINGS_FILTER } });
      if (heightfieldRef.current) meshLayer.setFallbackGround(live.current.ground);
      meshLayerRef.current = meshLayer;
      map.addLayer(meshLayer.layer);
      meshLayer.setMeshes(meshesFor('mission3d'), exaggeration);

      // plain map clicks: add a waypoint or set home, as on the 2D map
      map.on('click', (e) => mapClickRef.current(e));

      // Vehicle 3D model layer
      const vehicleLayer = createVehicleThreeJsLayer();
      vehicleLayerRef.current = vehicleLayer;
      map.addLayer(vehicleLayer.layer);

      // If restoring from a stored viewport (2D↔3D switch), skip fitting to waypoints.
      // Otherwise, fit instantly (duration: 0) to avoid the "flap" on fresh 3D open.
      if (storedVp) {
        isInitialFitDone.current = true;
      } else {
        const storeWps = useMissionStore.getState().missionItems.filter(
          item => isNavigationCommand(item.command) && commandHasLocation(item.command) && hasValidCoordinates(item.latitude, item.longitude),
        );
        if (storeWps.length === 1) {
          const wp = storeWps[0]!;
          map.jumpTo({ center: [wp.longitude, wp.latitude], zoom: 16, pitch: 55 });
          isInitialFitDone.current = true;
        } else if (storeWps.length > 1) {
          const bounds = new maplibregl.LngLatBounds();
          for (const wp of storeWps) bounds.extend([wp.longitude, wp.latitude]);
          map.fitBounds(bounds, { padding: 80, pitch: 55, bearing: -20, duration: 0, maxZoom: 17 });
          isInitialFitDone.current = true;
        }
      }

      setMapReady(true);
      onMapReady?.(map);
    });

    map.on('error', (e) => {
      // A tile that comes back empty or as an error page is a miss, not a fault: the map draws on without it.
      if ((e as { tile?: unknown }).tile || isTileMiss(e.error?.message)) {
        noteTileMiss(String((e as { sourceId?: string }).sourceId ?? 'tiles'));
        return;
      }
      console.error('[3D] map error:', e.error?.message || e);
    });

    mapRef.current = map;

    return () => {
      for (const d of detachRef.current) d();
      detachRef.current = [];
      vehicleLayerRef.current?.dispose();
      vehicleLayerRef.current = null;
      threeLayerRef.current?.dispose();
      threeLayerRef.current = null;
      meshLayerRef.current?.dispose();
      meshLayerRef.current = null;
      map.remove();
      mapRef.current = null;
      setMapReady(false);
      isInitialFitDone.current = false;
    };
  }, []);

  // Center on IP location
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !ipLocation) return;
    if (isInitialFitDone.current) return;
    if (ipLocation.lat === 0 && ipLocation.lon === 0) return;
    if (map.getZoom() < 5) {
      map.flyTo({ center: [ipLocation.lon, ipLocation.lat], zoom: 12, duration: 1000 });
    }
  }, [ipLocation, mapReady]);

  // Update tile source
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource('raster-tiles') as maplibregl.RasterTileSource | undefined;
    if (source) source.setTiles([getCachedTileUrl(activeLayer as BaseLayerKey)]);
  }, [activeLayer, mapReady]);

  // Update terrain exaggeration (only when terrain is enabled)
  useEffect(() => {
    const map = mapRef.current;
    // a map rebuilt under a still-ready flag has no style yet; its load sets the terrain itself
    if (!map || !mapReady || !showTerrain || !map.isStyleLoaded()) return;
    map.setTerrain({ source: 'terrain-dem', exaggeration });
  }, [exaggeration, mapReady, showTerrain]);

  // ─── Update Three.js layer + native MapLibre layers ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    threeLayerRef.current?.updateData({
      lines: geometry.lines,
      waypoints: layerWaypoints,
      selectedSeq,
      exaggeration,
      editable: !isTelemetryMode,
      interactive: !pickActive,
      maxPins,
    });

    setSourceData(map, 'ground-shadow', geometry.lines.filter((l) => !l.dashed && l.points.length >= 2).map((l) => ({
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: l.points.map((p) => [p.lon, p.lat]) },
    })));

    const homeFeatures: GeoJSON.Feature[] = [];
    if (homePosition && hasValidCoordinates(homePosition.lat, homePosition.lon)) {
      homeFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [homePosition.lon, homePosition.lat] },
      });
    }
    setSourceData(map, 'home', homeFeatures);
  }, [geometry, layerWaypoints, selectedSeq, homePosition, mapReady, exaggeration, isTelemetryMode, maxPins, pickActive]);

  // height colours: the 2D scale, over the mission area's own range unless one is fixed
  const heightRange = useMemo((): ElevationRange => {
    if (!heightfield) return { min: 0, max: 0 };
    let min = Infinity, max = -Infinity;
    for (const e of heightfield.elev) {
      if (e < WATER_THRESHOLD) continue;
      if (e < min) min = e;
      if (e > max) max = e;
    }
    return min === Infinity ? { min: 0, max: 0 } : { min, max };
  }, [heightfield]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer('height-colors')) return;
    map.setLayoutProperty('height-colors', 'visibility', showHeight ? 'visible' : 'none');
    if (!showHeight) return;
    const range = heightAuto
      ? heightRange.max > heightRange.min ? { min: Math.floor(heightRange.min / 25) * 25, max: Math.ceil(heightRange.max / 25) * 25 } : null
      : heightFixed;
    map.setPaintProperty('height-colors', 'color-relief-color', heightColorExpression(range, heightRelative ? vfrHud.alt : 0));
  }, [showHeight, heightAuto, heightFixed, heightRelative, heightRange, vfrHud.alt, mapReady, heightTick]);

  // Fit bounds on first load
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || geometry.waypoints.length === 0) return;
    if (isInitialFitDone.current) return;
    isInitialFitDone.current = true;
    fitToWaypoints(map, geometry.waypoints);
  }, [geometry, mapReady, loadCounter]);

  // Re-fit on loadCounter change
  const prevLoadCounterRef = useRef(loadCounter);
  useEffect(() => {
    if (loadCounter !== prevLoadCounterRef.current) {
      prevLoadCounterRef.current = loadCounter;
      const map = mapRef.current;
      if (map && mapReady && geometry.waypoints.length > 0) {
        fitToWaypoints(map, geometry.waypoints);
      }
    }
  }, [loadCounter, mapReady, geometry]);

  // Fly to selected waypoint
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selectedSeq === null) return;
    const wp = live.current.geometry.waypoints.find(w => w.seq === selectedSeq);
    // only when it is out of view: a waypoint picked on this map is already where the pilot looks
    if (!wp || map.getBounds().contains([wp.lon, wp.lat])) return;
    map.flyTo({ center: [wp.lon, wp.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
  }, [selectedSeq, mapReady]);

  // Compute real-world vehicle size from active profile (mm → meters)
  const vehicleSizeMeters = useMemo(() => {
    const vehicle = useSettingsStore.getState().getActiveVehicle();
    if (!vehicle) return 3; // fallback 3m
    // Pick the most relevant dimension per vehicle type
    const sizeMm = vehicle.wingspan  // planes, VTOLs
      ?? vehicle.frameSize           // copters (diagonal)
      ?? vehicle.hullLength          // boats, subs
      ?? vehicle.wheelbase           // rovers
      ?? 3000;                       // fallback 3m
    return Math.max(0.3, sizeMm / 1000); // mm → meters, min 30cm
  }, []);

  // 3D vehicle model — uses override props if provided, otherwise store data
  useEffect(() => {
    if (!mapReady || !vehicleLayerRef.current) return;

    const lngLat: [number, number] | null = vehicleLngLat
      ?? (isConnected && (position.lat !== 0 || position.lon !== 0)
        ? [position.lon, position.lat]
        : null);

    const armed = vehicleArmed ?? flight.armed;
    const heading = vehicleHeading ?? vfrHud.heading;
    const roll = vehicleAttitude?.roll ?? 0;
    const pitch = vehicleAttitude?.pitch ?? 0;
    const altAgl = vehicleAltitudeAgl ?? 0;

    vehicleLayerRef.current.updateState({
      lngLat,
      heading,
      roll,
      pitch,
      altitudeAgl: altAgl,
      armed,
      terrainExaggeration: exaggeration,
      vehicleSizeMeters,
      useRealSize: useRealVehicleSize,
      showHeadingLine: !!headingLineEnd,
      headingLineLength: headingLineLength ?? 100,
      headingLineColor: headingLineColor,
    });
  }, [vehicleLngLat, vehicleHeading, vehicleArmed, vehicleAttitude, vehicleAltitudeAgl, position.lat, position.lon, vfrHud.heading, flight.armed, isConnected, mapReady, exaggeration, headingLineEnd, headingLineLength, headingLineColor, vehicleSizeMeters, useRealVehicleSize]);

  // Update heading line — in 3D mode the Three.js layer renders it at altitude,
  // so we clear the native MapLibre flat line to avoid duplicates.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // 3D: Three.js renders heading line at altitude — hide flat MapLibre version
    setSourceData(map, 'heading-line', []);
  }, [headingLineEnd, headingLineColor, vehicleLngLat, position.lat, position.lon, mapReady]);

  // Update flight trail
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const features: GeoJSON.Feature[] = [];
    if (trail && trail.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: trail,
        },
      });
    }
    setSourceData(map, 'vehicle-trail', features);
  }, [trail, mapReady]);

  // Toggle mission overlays visibility
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const visibility = showMission ? 'visible' : 'none';
    for (const layerId of ['ground-shadow', 'home-outer', 'home-inner']) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visibility);
      }
    }

    // Toggle Three.js layer visibility
    if (threeLayerRef.current) {
      const threeLayerId = threeLayerRef.current.layer.id;
      if (map.getLayer(threeLayerId)) {
        map.setLayoutProperty(threeLayerId, 'visibility', visibility);
      }
    }

    // Toggle marker container visibility
    if (markerContainerRef.current) {
      markerContainerRef.current.style.display = showMission ? '' : 'none';
    }
  }, [showMission, mapReady]);

  // Toggle terrain DEM
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.isStyleLoaded()) return;

    if (showTerrain) {
      map.setTerrain({ source: 'terrain-dem', exaggeration });
    } else {
      map.setTerrain(null as any);
    }
  }, [showTerrain, mapReady, exaggeration]);

  const handleCenterOnGps = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const gpsState = useTelemetryStore.getState().gps;
    if (gpsState.fixType >= 2 && gpsState.lat !== 0 && gpsState.lon !== 0) {
      map.flyTo({ center: [gpsState.lon, gpsState.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
    }
  }, []);

  const handleFitWaypoints = useCallback(() => {
    const map = mapRef.current;
    if (map && geometry.waypoints.length > 0) fitToWaypoints(map, geometry.waypoints);
  }, [geometry]);

  const handleExaggerationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setExaggeration(parseFloat(e.target.value));
  }, []);

  return (
    <div className="relative h-full w-full bg-surface-base">
      <div ref={mapContainerRef} className="h-full w-full" />
      {/* DOM overlay for 3D-projected waypoint markers */}
      <div ref={markerContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }} />

      {/* Layer selector */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1">
        {showMapModeToggle && (
          <div className="flex rounded-lg overflow-hidden shadow-lg border border-subtle mb-0.5">
            <button
              onClick={() => useEditModeStore.getState().setTelemetryMapMode('2d')}
              className="px-2 py-1 text-xs font-medium transition-colors bg-surface-raised text-content-secondary hover:text-content"
            >2D</button>
            <button
              className="px-2 py-1 text-xs font-medium transition-colors bg-indigo-600 text-white"
            >3D</button>
          </div>
        )}
        <MapLayersControl
          baseLayers={BASE_LAYERS}
          activeLayer={activeLayer}
          onSelectLayer={setActiveLayer}
          showTerrain={showHeight}
          onToggleTerrain={() => setShowHeight((v) => !v)}
          showOverlays={false}
        />
        {toolbarContent}
      </div>

      {showHeight && heightRange.max > 0 && (
        <div className="absolute top-3 left-3 z-[1000]">
          <ElevationLegend
            minElevation={heightRange.min}
            maxElevation={heightRange.max}
            autoRange={heightAuto}
            onAutoRangeChange={setHeightAuto}
            fixedRange={heightFixed}
            onFixedRangeChange={setHeightFixed}
            relativeMode={heightRelative}
            onRelativeModeChange={setHeightRelative}
            hasCraftPosition={vfrHud.alt !== 0}
          />
        </div>
      )}
      <ModulePolygonPickBar />
      <UserModelsMapLibreDrop map={mapReady ? mapRef.current : null} />

      {/* Bottom-left controls: the 2D map's row */}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2">
        {editingTools && (
          <button
            onClick={() => { setAddMode((v) => !v); setHomeMode(false); }}
            className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${addMode ? 'bg-blue-600 text-white' : 'bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm'}`}
            title={addMode ? t('mission:missionMapPanel.addWpActiveTip') : t('mission:missionMapPanel.addWpTip')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {addMode ? t('mission:missionMapPanel.clickMap') : t('mission:missionMapPanel.addWp')}
          </button>
        )}
        {editingTools && !addMode && !homeMode && (
          <span className="text-xs text-content-secondary bg-surface-solid border border-subtle shadow-sm px-2.5 py-1.5 rounded">
            <Trans i18nKey="mission:missionMapPanel.shiftClickHint" components={{ kbd: <kbd className="bg-surface-raised px-1 rounded text-content-secondary" /> }} />
          </span>
        )}

        {navWaypoints.length > 0 && (
          <button onClick={handleFitWaypoints} className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm transition-colors flex items-center gap-1.5" title={t('mission:mission3DPanel.fitTip')}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            {t('mission:mission3DPanel.fit')}
          </button>
        )}

        <button onClick={handleCenterOnGps} className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm transition-colors flex items-center gap-1.5" title={t('mission:mission3DPanel.centerTip')}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {t('common:vehicle')}
        </button>

        {editingTools && (
          <button
            onClick={() => { setHomeMode((v) => !v); setAddMode(false); }}
            className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${homeMode ? 'bg-emerald-600 text-white' : homePosition ? 'bg-emerald-600/80 text-white' : 'bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm'}`}
            title={homeMode ? t('mission:missionMapPanel.setHomeActiveTip') : homePosition ? t('mission:missionMapPanel.changeHomeTip') : t('mission:missionMapPanel.setHomeTip')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            {homeMode ? t('mission:missionMapPanel.clickMap') : homePosition ? t('mission:missionMapPanel.homeSet') : t('common:setHome')}
          </button>
        )}

        {!isTelemetryMode && activeMode === 'mission' && (
          <button
            onClick={() => { const fp = useFlightPreviewStore.getState(); if (fp.isActive) fp.close(); else fp.open(); }}
            className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm transition-colors flex items-center gap-1.5"
            data-tip={t('mission:missionMapPanel.previewTip')}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5v14l11-7z" />
            </svg>
            {t('mission:missionMapPanel.preview')}
          </button>
        )}

        {homeMode && (
          <span className="text-xs text-emerald-400 bg-surface-solid border border-subtle shadow-sm px-2.5 py-1.5 rounded">
            {t('mission:missionMapPanel.setHomeHint')}
          </span>
        )}

        {!isTelemetryMode && activeMode === 'mission' && (
          <>
            <div className="w-px h-5 bg-subtle" />
            <button
              onClick={() => openIn2d(() => { if (!surveyActive) useSurveyMenuStore.getState().setOpen(true); })}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface-solid border border-purple-400 shadow-sm text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1.5"
              data-tip={t('mission:mission3DPanel.surveyIn2dTip')}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              {t('common:survey')}
            </button>
          </>
        )}
      </div>

      {/* Placeholder — hidden in telemetry mode */}
      {navWaypoints.length === 0 && !isTelemetryMode && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="bg-surface-overlay backdrop-blur-sm px-6 py-4 rounded-xl text-center">
            <div className="text-content-secondary text-sm mb-2">{t('mission:mission3DPanel.noWaypoints')}</div>
            <div className="text-content-secondary text-xs">{t('mission:mission3DPanel.noWaypointsHint')}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setSourceData(map: maplibregl.Map, id: string, features: GeoJSON.Feature[]) {
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) src.setData({ type: 'FeatureCollection', features });
}

function buildStyle(layerKey: LayerKey): maplibregl.StyleSpecification {
  const layer = MAP_LAYERS[layerKey];
  return {
    version: 8,
    sources: {
      'raster-tiles': {
        type: 'raster',
        tiles: [getCachedTileUrl(layerKey as BaseLayerKey)],
        tileSize: 256,
        maxzoom: (layer as MapLayer).maxNativeZoom ?? layer.maxZoom,
      },
    },
    layers: [{ id: 'raster-layer', type: 'raster', source: 'raster-tiles' }],
  };
}

function fitToWaypoints(map: maplibregl.Map, waypoints: Array<{ lat: number; lon: number }>) {
  if (waypoints.length === 0) return;

  if (waypoints.length === 1) {
    const wp = waypoints[0]!;
    map.flyTo({ center: [wp.lon, wp.lat], zoom: 16, pitch: 55, duration: 1000 });
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  for (const wp of waypoints) bounds.extend([wp.lon, wp.lat]);

  map.fitBounds(bounds, {
    padding: 80,
    pitch: 55,
    bearing: -20,
    duration: 1000,
    maxZoom: 17,
  });
}
