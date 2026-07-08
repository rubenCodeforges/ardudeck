import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Polyline, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMissionStore } from '../../stores/mission-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { commandHasLocation, isNavigationCommand, hasValidCoordinates, computeGroupWaypointNumbers, MAV_CMD, type MissionItem } from '../../../shared/mission-types';
import { useIpLocation } from '../../utils/ip-geolocation';
import { SEGMENT_COLORS, getSegmentColor, computeItemColors } from '../../utils/mission-segment-colors';

// Geofence and Rally overlays
import { FenceMapOverlay } from '../geofence/FenceMapOverlay';
import { FenceDrawTool } from '../geofence/FenceDrawTool';
import { RallyMapOverlay } from '../rally/RallyMapOverlay';

// Terrain elevation overlay
import { TerrainOverlayLayer, type ElevationRange } from '../map/TerrainOverlayLayer';
import { ElevationLegend } from '../map/ElevationLegend';
import { useFenceStore } from '../../stores/fence-store';
import { useRallyStore } from '../../stores/rally-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useSettingsStore } from '../../stores/settings-store';
import { Mission3DPanel } from './Mission3DPanel';
import { RelativeWaypointPopover } from './RelativeWaypointPopover';
import { TAKEOFF_AT_HOME_ICON } from './takeoff-icon';
import { WaypointTiersOverlay } from './WaypointTiersOverlay';

// Survey grid overlay
import { SurveyDrawTool } from '../survey/SurveyDrawTool';
import { SurveyMapOverlay } from '../survey/SurveyMapOverlay';
import { SurveyStartButton } from '../survey/SurveyStartButton';
import { PersistentSurveyOverlay } from '../survey/PersistentSurveyOverlay';
import { GuidesOverlay } from './GuidesOverlay';
import { PlanReplayOverlay } from './PlanReplayOverlay';
import { useSurveyStore } from '../../stores/survey-store';
import { isSurveyGroup } from '../../../shared/mission-group-types';

// Offline map download
import { OfflineAreaDownload } from '../map/OfflineAreaDownload';

// Cached area overlay
import { CachedAreaOverlay } from '../map/CachedAreaOverlay';

// Map overlays (weather radar, aviation, airspace zones)
import { WeatherRadarOverlay } from '../map/overlays/WeatherRadarOverlay';
import { OpenAipOverlay } from '../map/overlays/OpenAipOverlay';
import { DipulOverlay } from '../map/overlays/DipulOverlay';
import { AirspaceOverlay } from '../map/overlays/AirspaceOverlay';
import { AirspaceLegend } from '../map/overlays/AirspaceLegend';
import { MapLayersControl } from '../map/overlays/MapLayersControl';
import { WindParticleOverlay } from '../map/overlays/WindParticleOverlay';
import { TrafficOverlay } from '../map/overlays/TrafficOverlay';
import { TrafficAltitudeFilter } from '../map/overlays/TrafficAltitudeFilter';
import { ZoneAlertBanner } from '../map/overlays/ZoneAlertBanner';
import { WindControls } from '../map/overlays/WindControls';
import { WindRoseCard } from '../map/overlays/WindRoseCard';
import { ApiKeyDialog } from '../map/overlays/ApiKeyDialog';
import { useOverlayStore } from '../../stores/overlay-store';

// Catmull-Rom spline interpolation between two nav waypoints
function interpolateSpline(
  navWaypoints: MissionItem[],
  fromIdx: number,
  toIdx: number,
): [number, number][] {
  const curr = navWaypoints[fromIdx]!;
  const next = navWaypoints[toIdx]!;
  const prev = fromIdx > 0 ? navWaypoints[fromIdx - 1]! : curr;
  const after = toIdx < navWaypoints.length - 1 ? navWaypoints[toIdx + 1]! : next;

  const p0: [number, number] = [prev.latitude, prev.longitude];
  const p1: [number, number] = [curr.latitude, curr.longitude];
  const p2: [number, number] = [next.latitude, next.longitude];
  const p3: [number, number] = [after.latitude, after.longitude];

  const points: [number, number][] = [[p1[0], p1[1]]];
  const segments = 15;
  for (let t = 1 / segments; t <= 1; t += 1 / segments) {
    const t2 = t * t;
    const t3 = t2 * t;
    const lat = 0.5 * (
      (2 * p1[0]) +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
    );
    const lng = 0.5 * (
      (2 * p1[1]) +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
    );
    points.push([lat, lng]);
  }
  return points;
}

interface PathSegment {
  positions: [number, number][];
  color: string;
}

// Build colored path segments from ALL mission items (not just location ones).
// When `groupColorOf` is supplied (fleet / multi-mission), each leg is coloured by
// its group's colour instead of the command/state segment colour.
function buildSegmentedPath(allItems: MissionItem[], groupColorOf?: (groupId: string | undefined) => string | undefined): PathSegment[] {
  // Extract navigation waypoints with locations for drawing (skip 0,0 null coordinates)
  const navWaypoints = allItems.filter(
    item => isNavigationCommand(item.command) && commandHasLocation(item.command) && hasValidCoordinates(item.latitude, item.longitude),
  );
  if (navWaypoints.length < 2) return [];

  // Index nav waypoints by seq so spline interpolation can find their position
  // without a linear scan.
  const navIndexBySeq = new Map<number, number>();
  navWaypoints.forEach((w, i) => navIndexBySeq.set(w.seq, i));

  // State flags
  let cameraActive = false;
  let roiActive = false;
  let speedOverride = false;

  // Single pass over all items in seq order: DO_* commands update the flags;
  // each located nav waypoint closes the leg from the previous one. This is
  // O(n) — the old version re-scanned every item for every nav pair (O(n²)),
  // which froze/OOM'd the renderer on large (20k+) survey missions.
  const raw: PathSegment[] = [];
  let prevNav: MissionItem | null = null;
  let prevNavIdx = -1;

  for (const item of allItems) {
    const isLocatedNav =
      isNavigationCommand(item.command) &&
      commandHasLocation(item.command) &&
      hasValidCoordinates(item.latitude, item.longitude);

    if (isLocatedNav) {
      const idx = navIndexBySeq.get(item.seq)!;
      // Skip the connecting leg across group boundaries — a line from the last
      // WP of one group to the first of the next isn't a real flight leg.
      const crossesGroup = !!(prevNav && prevNav.groupId && item.groupId && prevNav.groupId !== item.groupId);
      if (prevNav && !crossesGroup) {
        const color = groupColorOf?.(item.groupId) ?? getSegmentColor(item.command, cameraActive, roiActive, speedOverride);
        const isSpline =
          prevNav.command === MAV_CMD.NAV_SPLINE_WAYPOINT ||
          item.command === MAV_CMD.NAV_SPLINE_WAYPOINT;
        const positions: [number, number][] = isSpline
          ? interpolateSpline(navWaypoints, prevNavIdx, idx)
          : [
              [prevNav.latitude, prevNav.longitude],
              [item.latitude, item.longitude],
            ];
        raw.push({ positions, color });
      }
      prevNav = item;
      prevNavIdx = idx;
      continue;
    }

    // Match the original windowed behavior: DO_* commands only take effect once
    // the first located waypoint has been seen (legs are drawn between located
    // waypoints, and the old code never scanned items before the first one).
    if (prevNav === null) continue;

    switch (item.command) {
      case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
        cameraActive = item.param1 > 0;
        break;
      case MAV_CMD.IMAGE_START_CAPTURE:
        cameraActive = true;
        break;
      case MAV_CMD.IMAGE_STOP_CAPTURE:
        cameraActive = false;
        break;
      case MAV_CMD.DO_SET_ROI:
      case MAV_CMD.DO_SET_ROI_LOCATION:
        roiActive = true;
        break;
      case MAV_CMD.DO_SET_ROI_NONE:
        roiActive = false;
        break;
      case MAV_CMD.DO_CHANGE_SPEED:
        speedOverride = item.param2 > 0;
        break;
    }
  }

  // Coalesce consecutive straight legs of the same color into a single polyline.
  // A survey is overwhelmingly one color (camera), so this collapses ~20k tiny
  // two-point segments into a handful of polylines — the difference between
  // thousands of Leaflet layers and a few. Spline legs (multi-point) and any
  // break in continuity (group-boundary gap) start a fresh run.
  const samePoint = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
  const segments: PathSegment[] = [];
  let run: { positions: [number, number][]; color: string; plain: boolean } | null = null;
  for (const seg of raw) {
    const plain = seg.positions.length === 2;
    if (
      run && run.plain && plain && run.color === seg.color &&
      samePoint(run.positions[run.positions.length - 1]!, seg.positions[0]!)
    ) {
      run.positions.push(seg.positions[1]!);
    } else {
      if (run) segments.push({ positions: run.positions, color: run.color });
      run = { positions: [...seg.positions], color: seg.color, plain };
    }
  }
  if (run) segments.push({ positions: run.positions, color: run.color });

  return segments;
}

// Shared map layer definitions (centralized)
import { MAP_LAYERS, type LayerKey, type MapLayer } from '../../../shared/map-layers';
import { MapSearchControl } from '../map/MapSearchControl';
import { EnginePlanLegend } from '../survey/EnginePlanLegend';

// Default center fallback (London) - will be overridden by IP geolocation
const FALLBACK_CENTER: [number, number] = [51.505, -0.09];
const DEFAULT_ZOOM_AIRCRAFT = 15;
const DEFAULT_ZOOM_ROVER = 18; // Rovers need higher zoom for street-level detail

// Above this many waypoints we stop rendering per-leg clickable insertion
// segments — each is an interactive Leaflet layer and tens of thousands of them
// exhaust memory. The (coalesced) visible path still draws.
const MAX_CLICKABLE_SEGMENTS = 2000;

// Create home marker icon - house shape
function createHomeIcon(): L.DivIcon {
  return L.divIcon({
    className: 'home-marker',
    html: `
      <div style="
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
      ">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#10b981" stroke="white" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

// Memoized home icon
const HOME_ICON = createHomeIcon();

// Ghost waypoint icon for relative-waypoint live preview
const GHOST_WAYPOINT_ICON = L.divIcon({
  className: 'ghost-waypoint-marker',
  html: `
    <div style="
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(59, 130, 246, 0.35);
      border: 2px dashed #3b82f6;
      box-shadow: 0 0 0 2px rgba(0,0,0,0.25);
    "></div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Custom vehicle marker icon (arrow pointing in heading direction)
function createVehicleIcon(heading: number, armed: boolean): L.DivIcon {
  const fillColor = armed ? '#f97316' : '#22d3ee'; // Orange when armed, cyan when disarmed
  const strokeColor = armed ? '#7c2d12' : '#0e7490'; // Dark orange / dark cyan outlines

  return L.divIcon({
    className: 'vehicle-marker',
    html: `
      <div style="transform: rotate(${heading}deg); width: 48px; height: 48px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
        <svg viewBox="0 0 24 24">
          <!-- Dark outline for contrast -->
          <path d="M12 2L4 20l8-4 8 4L12 2z" fill="none" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
          <!-- White outline -->
          <path d="M12 2L4 20l8-4 8 4L12 2z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
          <!-- Colored fill -->
          <path d="M12 2L4 20l8-4 8 4L12 2z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="1" stroke-linejoin="round"/>
        </svg>
      </div>
    `,
    iconSize: [48, 48],
    iconAnchor: [24, 24],
  });
}

// Map resize handler
function MapResizeHandler() {
  const map = useMap();
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const container = map.getContainer();
    containerRef.current = container;

    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [map]);

  return null;
}

// Fetch overlay data (radar meta, airspace zones, API key check)
function OverlayFetcher() {
  const map = useMap();
  const activeOverlays = useOverlayStore((s) => s.activeOverlays);
  const fetchRadarMeta = useOverlayStore((s) => s.fetchRadarMeta);
  const fetchAirspaceData = useOverlayStore((s) => s.fetchAirspaceData);

  useEffect(() => {
    if (activeOverlays.has('radar')) {
      fetchRadarMeta();
      const interval = setInterval(fetchRadarMeta, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [activeOverlays, fetchRadarMeta]);

  useEffect(() => {
    useOverlayStore.getState().checkApiKey();
  }, []);

  useEffect(() => {
    const b = map.getBounds();
    useOverlayStore.getState().updateRegionalAvailability({
      south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast(),
    });
  }, [map]);

  useEffect(() => {
    if (activeOverlays.has('airspace')) {
      const center = map.getCenter();
      fetchAirspaceData(center.lat, center.lng, map.getZoom());
    }
  }, [activeOverlays, fetchAirspaceData, map]);

  useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      useOverlayStore.getState().updateRegionalAvailability({
        south: b.getSouth(), north: b.getNorth(), west: b.getWest(), east: b.getEast(),
      });
      if (useOverlayStore.getState().activeOverlays.has('airspace')) {
        const center = map.getCenter();
        fetchAirspaceData(center.lat, center.lng, map.getZoom());
      }
    },
  });

  return null;
}

// Overlay layers rendered inside MapContainer — owns its own store subscription
// so overlay state changes don't trigger parent re-renders (which would recreate terrain)
function MapOverlayLayers({ baseLayer }: { baseLayer: string }) {
  const activeOverlays = useOverlayStore((s) => s.activeOverlays);
  return (
    <>
      <OverlayFetcher />
      {activeOverlays.has('airspace') && <AirspaceOverlay />}
      {activeOverlays.has('radar') && <WeatherRadarOverlay baseLayer={baseLayer} />}
      {activeOverlays.has('openaip') && <OpenAipOverlay />}
      {activeOverlays.has('dipul') && <DipulOverlay />}
      {activeOverlays.has('wind') && <WindParticleOverlay />}
      {activeOverlays.has('wind') && <WindRoseCard />}
      {(activeOverlays.has('traffic') || activeOverlays.has('gliders') || activeOverlays.has('remoteid')) && <TrafficOverlay />}
    </>
  );
}

// Airspace legend — owns its own subscription
function AirspaceLegendWrapper() {
  const hasAirspace = useOverlayStore((s) => s.activeOverlays.has('airspace'));
  if (!hasAirspace) return null;
  return <AirspaceLegend />;
}

// Wind controls — owns its own subscription, shown only when the overlay is on
function WindControlsWrapper() {
  const hasWind = useOverlayStore((s) => s.activeOverlays.has('wind'));
  if (!hasWind) return null;
  return <WindControls />;
}

// Update map maxZoom when layer changes (MapContainer maxZoom is immutable after mount)
function MaxZoomUpdater({ maxZoom }: { maxZoom: number }) {
  const map = useMap();

  useEffect(() => {
    map.setMaxZoom(maxZoom);
  }, [map, maxZoom]);

  return null;
}

// Map click handler for adding waypoints or setting home
// Supports: Add mode, Set Home mode, or Shift+click (quick add)
// Disabled when fence or rally editing is active (they have their own click handlers)
function MapClickHandler({
  onMapClick,
  isAddMode,
  isSettingHomeMode,
  readOnly,
  isFenceOrRallyActive,
}: {
  onMapClick: (lat: number, lng: number) => void;
  isAddMode: boolean;
  isSettingHomeMode: boolean;
  readOnly: boolean;
  isFenceOrRallyActive: boolean;
}) {
  useMapEvents({
    click: (e) => {
      // Don't handle mission clicks when fence/rally editing is active
      if (isFenceOrRallyActive) return;
      // Handle click if in any edit mode OR Shift+click (and not readOnly)
      if (!readOnly && (isAddMode || isSettingHomeMode || e.originalEvent.shiftKey)) {
        onMapClick(e.latlng.lat, e.latlng.lng);
      }
    },
  });
  return null;
}

// Fit map to waypoints - only fires when trigger actually changes (not on every render)
function FitToBounds({ waypoints, trigger }: { waypoints: MissionItem[]; trigger: number }) {
  const map = useMap();
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    if (trigger === lastTriggerRef.current) return;
    lastTriggerRef.current = trigger;

    if (waypoints.length > 0) {
      const bounds = L.latLngBounds(
        waypoints.map(wp => [wp.latitude, wp.longitude] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [trigger, waypoints, map]);

  return null;
}

// Focus map on selected waypoint - only when the WP is off-screen.
// If the user just placed/clicked a WP that's already visible, leave the
// camera where it is to avoid jarring auto-pans.
function FocusOnSelected({ waypoints, selectedSeq }: { waypoints: MissionItem[]; selectedSeq: number | null }) {
  const map = useMap();
  const prevSelectedRef = useRef<number | null>(null);

  useEffect(() => {
    if (selectedSeq !== null && selectedSeq !== prevSelectedRef.current) {
      const wp = waypoints.find(w => w.seq === selectedSeq);
      if (wp && wp.latitude !== 0 && wp.longitude !== 0) {
        const latlng: [number, number] = [wp.latitude, wp.longitude];
        // Only re-center if the WP isn't already in view (with a small inset
        // so WPs hugging the edge still get nudged into a comfortable area).
        const bounds = map.getBounds().pad(-0.1);
        if (!bounds.contains(latlng)) {
          map.setView(latlng, map.getZoom(), { animate: true, duration: 0.3 });
        }
      }
    }
    prevSelectedRef.current = selectedSeq;
  }, [selectedSeq, waypoints, map]);

  return null;
}

// Explicit "focus" action from the WP list - always pan AND zoom in on the
// requested waypoint (unlike FocusOnSelected, which only nudges off-screen
// WPs at the current zoom). Driven by a nonce so re-focusing the same WP
// re-centres.
function FocusController({ waypoints }: { waypoints: MissionItem[] }) {
  const map = useMap();
  const focusNonce = useMissionStore((s) => s.focusNonce);
  const focusedSeq = useMissionStore((s) => s.focusedSeq);
  const prevNonceRef = useRef(focusNonce);

  useEffect(() => {
    if (focusNonce === prevNonceRef.current) return;
    prevNonceRef.current = focusNonce;
    if (focusedSeq === null) return;
    const wp = waypoints.find((w) => w.seq === focusedSeq);
    if (!wp || wp.latitude === 0 || wp.longitude === 0) return;
    map.setView([wp.latitude, wp.longitude], Math.max(map.getZoom(), 17), {
      animate: true,
      duration: 0.4,
    });
  }, [focusNonce, focusedSeq, waypoints, map]);

  return null;
}

// IP geolocation resolves after mount; recenter once when it arrives, but
// only if the map is still sitting on the untouched London fallback (a user
// pan or a GPS fix means somebody better already decided the view).
function CenterOnIpOnce({ location, enabled }: { location: { lat: number; lon: number } | null; enabled: boolean }) {
  const map = useMap();
  const doneRef = useRef(false);

  useEffect(() => {
    if (!enabled || doneRef.current || !location) return;
    const c = map.getCenter();
    const stillOnFallback =
      Math.abs(c.lat - FALLBACK_CENTER[0]) < 0.01 && Math.abs(c.lng - FALLBACK_CENTER[1]) < 0.01;
    if (!stillOnFallback) {
      doneRef.current = true;
      return;
    }
    doneRef.current = true;
    map.setView([location.lat, location.lon], map.getZoom(), { animate: true });
  }, [enabled, location, map]);

  return null;
}

// Center map on vehicle GPS position once when it becomes available
// Uses interval polling to avoid React re-renders that break marker drag
function CenterOnGps() {
  const map = useMap();
  // Skip auto-centering when restoring viewport from a view switch (2D↔3D)
  const hasCenteredRef = useRef(useEditModeStore.getState().mapViewport !== null);

  useEffect(() => {
    // Check immediately on mount
    const checkAndCenter = () => {
      if (hasCenteredRef.current) return true; // Already centered

      const gps = useTelemetryStore.getState().gps;
      if (gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0) {
        map.setView([gps.lat, gps.lon], map.getZoom(), { animate: true, duration: 0.5 });
        hasCenteredRef.current = true;
        return true; // Centered successfully
      }
      return false; // Not yet
    };

    // Try immediately
    if (checkAndCenter()) return;

    // Poll every 2 seconds until GPS is available (then stop)
    const interval = setInterval(() => {
      if (checkAndCenter()) {
        clearInterval(interval);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [map]);

  return null;
}

// Center map on vehicle GPS when triggered
function CenterOnVehicle({ trigger }: { trigger: number }) {
  const map = useMap();
  const lastTriggerRef = useRef(0);

  useEffect(() => {
    if (trigger === lastTriggerRef.current) return;
    lastTriggerRef.current = trigger;

    const gps = useTelemetryStore.getState().gps;
    if (gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0) {
      map.setView([gps.lat, gps.lon], map.getZoom(), { animate: true, duration: 0.5 });
    }
  }, [trigger, map]);

  return null;
}

// Sync Leaflet viewport to shared store on every camera move (for 2D↔3D switch)
function ViewportSync() {
  const map = useMap();

  useEffect(() => {
    const sync = () => {
      const c = map.getCenter();
      const zoom = map.getZoom();
      useEditModeStore.getState().setMapViewport({
        center: [c.lng, c.lat],
        zoom,
        pitch: 0,
        bearing: 0,
      });
      // Cross-session memory: next launch opens here instead of the fallback.
      useSettingsStore.getState().setMissionMapViewport({ lat: c.lat, lng: c.lng, zoom });
      // Report to main so the Area Editor opens on the same location.
      window.electronAPI?.reportMapViewport?.({ lat: c.lat, lng: c.lng, zoom });
    };
    map.on('moveend', sync);
    sync(); // capture initial position
    return () => { map.off('moveend', sync); };
  }, [map]);

  return null;
}

// Track map bounds for offline download
function MapBoundsTracker({ onBoundsChange }: { onBoundsChange: (b: { north: number; south: number; east: number; west: number }) => void }) {
  const map = useMap();

  useEffect(() => {
    const update = () => {
      const b = map.getBounds();
      onBoundsChange({
        north: b.getNorth(),
        south: b.getSouth(),
        east: b.getEast(),
        west: b.getWest(),
      });
    };
    map.on('moveend', update);
    update();
    return () => { map.off('moveend', update); };
  }, [map, onBoundsChange]);

  return null;
}

// GPS warning component - checks GPS on mount
function GpsWarning() {
  const [hasGps, setHasGps] = useState(false);

  useEffect(() => {
    const gps = useTelemetryStore.getState().gps;
    setHasGps(gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0);
  }, []);

  if (hasGps) return null;

  return (
    <div className="px-3 py-2 rounded text-xs bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center gap-2">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
      No GPS - home will use clicked position
    </div>
  );
}

// Clickable path segment for right-click insertion
function ClickablePathSegment({
  positions,
  afterSeq,
  onRightClick,
}: {
  positions: [number, number][];
  afterSeq: number;
  onRightClick: (e: L.LeafletMouseEvent, afterSeq: number) => void;
}) {
  return (
    <Polyline
      positions={positions}
      pathOptions={{
        color: 'transparent',
        weight: 20, // Wide invisible clickable area
        opacity: 0,
      }}
      eventHandlers={{
        contextmenu: (e) => onRightClick(e, afterSeq),
      }}
    />
  );
}

interface MissionMapPanelProps {
  readOnly?: boolean;
}

// Context menu state type
interface ContextMenuState {
  x: number;
  y: number;
  lat: number;
  lon: number;
  afterSeq: number;
  kind: 'path' | 'marker';
  refSeq?: number;
  refAlt?: number;
}

interface RelativeEditorState {
  x: number;
  y: number;
  refSeq: number;
  refLat: number;
  refLon: number;
  refAlt: number;
}

export function MissionMapPanel({ readOnly = false }: MissionMapPanelProps) {
  const mapMode = useEditModeStore((s) => s.mapMode);

  // 3D mode — render the MapLibre 3D viewer instead of Leaflet
  if (mapMode === '3d') {
    return <Mission3DPanel />;
  }

  return <MissionMapPanel2D readOnly={readOnly} />;
}

function MissionMapPanel2D({ readOnly = false }: MissionMapPanelProps) {
  // Get connection state to check protocol type and vehicle type
  const connectionState = useConnectionStore((state) => state.connectionState);
  const isMspProtocol = connectionState?.protocol === 'msp';

  // Detect Rover (MAV_TYPE 10 = Ground Rover, 11 = Surface Boat)
  const isRover = connectionState?.mavType === 10 || connectionState?.mavType === 11;

  // Set defaults based on vehicle type - Rovers need higher zoom and hybrid map
  const defaultLayer: LayerKey = isRover ? 'googleHybrid' : 'googleSat';
  const defaultZoom = isRover ? DEFAULT_ZOOM_ROVER : DEFAULT_ZOOM_AIRCRAFT;

  const [activeLayer, setActiveLayer] = useState<LayerKey>(defaultLayer);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [isSettingHome, setIsSettingHome] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [centerOnVehicleTrigger, setCenterOnVehicleTrigger] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showTerrain, setShowTerrain] = useState(false);
  const [elevationRange, setElevationRange] = useState<ElevationRange>({ min: 0, max: 0 });
  const [terrainAutoRange, setTerrainAutoRange] = useState(true);
  const [terrainFixedRange, setTerrainFixedRange] = useState<ElevationRange>({ min: 0, max: 1500 });
  const [terrainRelativeMode, setTerrainRelativeMode] = useState(false);
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const handleBoundsChange = useCallback((b: { north: number; south: number; east: number; west: number }) => setMapBounds(b), []);

  // Update layer when vehicle type changes (e.g., connecting to a Rover)
  useEffect(() => {
    if (isRover && activeLayer === 'osm') {
      setActiveLayer('googleHybrid');
    }
  }, [isRover, activeLayer]);

  // IP geolocation fallback (used when no GPS or mission items)
  const [ipLocation] = useIpLocation();

  // Restore viewport from previous panel (read once on mount, not reactive)
  const storedViewport = useMemo(() => useEditModeStore.getState().mapViewport, []);
  // Cross-session memory (settings). Session viewport wins when both exist.
  const persistedViewport = useMemo(() => useSettingsStore.getState().missionMapViewport, []);

  // Dynamic default center - session viewport > persisted viewport > IP > fallback
  const defaultCenter: [number, number] = storedViewport
    ? [storedViewport.center[1]!, storedViewport.center[0]!] // [lat, lng] for Leaflet
    : persistedViewport
      ? [persistedViewport.lat, persistedViewport.lng]
      : ipLocation
        ? [ipLocation.lat, ipLocation.lon]
        : FALLBACK_CENTER;
  const effectiveZoom = storedViewport?.zoom ?? persistedViewport?.zoom ?? defaultZoom;
  // IP geolocation resolves async, usually AFTER the map mounts - and Leaflet
  // only reads `center` at mount, which is how "always opens on London"
  // happened. When we mounted on the bare fallback, fly to the IP fix once.
  const mountedOnFallback = !storedViewport && !persistedViewport;

  const {
    missionItems,
    homePosition,
    selectedSeq,
    currentSeq,
    setSelectedSeq,
    addWaypoint,
    insertWaypoint,
    updateWaypoint,
    setHomePosition,
  } = useMissionStore();

  // Get telemetry for vehicle marker
  const gps = useTelemetryStore((state) => state.gps);
  const vfrHud = useTelemetryStore((state) => state.vfrHud);
  const flight = useTelemetryStore((state) => state.flight);

  // Compute vehicle position for marker
  const hasValidGps = gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0;
  const vehiclePosition: [number, number] | null = hasValidGps
    ? [gps.lat, gps.lon]
    : null;

  // Get active edit mode from toolbar
  const activeMode = useEditModeStore((state) => state.activeMode);
  const showSegmentColors = useSettingsStore((s) => s.missionDefaults.showSegmentColors);
  const updateMissionDefaults = useSettingsStore((s) => s.updateMissionDefaults);

  // Get fence and rally stores for floating tools
  const fenceDrawMode = useFenceStore((state) => state.drawMode);
  const setFenceDrawMode = useFenceStore((state) => state.setDrawMode);
  const fenceInclusionMode = useFenceStore((state) => state.inclusionMode);
  const setFenceInclusionMode = useFenceStore((state) => state.setInclusionMode);

  const rallyAddMode = useRallyStore((state) => state.addMode);
  const setRallyAddMode = useRallyStore((state) => state.setAddMode);

  // Survey state
  const surveyIsActive = useSurveyStore((s) => s.isActive);
  const surveyDrawMode = useSurveyStore((s) => s.drawMode);
  const surveyPolygon = useSurveyStore((s) => s.polygon);
  const surveyPattern = useSurveyStore((s) => s.config.pattern);
  const activateSurvey = useSurveyStore((s) => s.activateSurvey);
  const deactivateSurvey = useSurveyStore((s) => s.deactivateSurvey);
  const startSurveyDrawing = useSurveyStore((s) => s.startDrawing);

  // Disable mission editing when fence, rally, or survey editing is active
  const isFenceOrRallyActive = fenceDrawMode !== 'none' || rallyAddMode || surveyDrawMode !== 'none';

  const groups = useMissionStore((s) => s.groups);

  // Hidden groups (checkbox off) drop off the map entirely — polygon, WPs,
  // and path. Items with no groupId (legacy/orphan) always show.
  const visibleMissionItems = useMemo(() => {
    if (groups.length === 0) return missionItems;
    const hidden = new Set(groups.filter((g) => !g.visible).map((g) => g.id));
    if (hidden.size === 0) return missionItems;
    return missionItems.filter((it) => !it.groupId || !hidden.has(it.groupId));
  }, [missionItems, groups]);

  // Filter to only items with locations and valid (non-zero) coordinates.
  // Memoized: the tiers overlay keys its spatial index off this identity.
  const waypoints = useMemo(
    () =>
      visibleMissionItems.filter(
        item => commandHasLocation(item.command) && hasValidCoordinates(item.latitude, item.longitude),
      ),
    [visibleMissionItems],
  );

  // Per-group waypoint numbers (1-based within each group). Computed over the
  // full mission so hiding a group doesn't renumber the others.
  const groupWaypointNumbers = useMemo(
    () => computeGroupWaypointNumbers(missionItems),
    [missionItems],
  );

  // Fleet/multi-mission: with more than one group, colour each waypoint + path leg
  // by its group's (vehicle's) colour so the per-vehicle routes are distinguishable.
  // A single mission keeps the classic command/segment colouring (colorByGroup off).
  const colorByGroup = groups.length > 1;
  const groupColorById = useMemo(
    () => new Map(groups.map((g) => [g.id, g.color])),
    [groups],
  );
  const groupColorOf = useMemo(
    () => (groupId: string | undefined) => (groupId ? groupColorById.get(groupId) : undefined),
    [groupColorById],
  );

  // Survey grids are read as their PATH plus light turn-point dots, NOT as
  // full numbered pins (which stack into an unreadable cluster). The tiers
  // overlay uses this to decide which marker style a waypoint materializes as.
  const surveyGroupIds = useMemo(
    () => new Set(groups.filter(isSurveyGroup).map((g) => g.id)),
    [groups],
  );

  // TAKEOFF items with placeholder (0,0) coords - render at home with rocket icon
  const ghostTakeoffItems = useMemo(() =>
    visibleMissionItems.filter(item =>
      item.command === MAV_CMD.NAV_TAKEOFF && !hasValidCoordinates(item.latitude, item.longitude)
    ),
    [visibleMissionItems]
  );

  // Auto-fit map only when a mission is freshly loaded (file or FC download).
  // Tracking loadCounter via a ref ensures we don't refit every time the user
  // adds/removes a waypoint (which would jarringly zoom out on each click).
  const loadCounter = useMissionStore((s) => s.loadCounter);
  const prevLoadCounterRef = useRef(loadCounter);
  useEffect(() => {
    if (loadCounter !== prevLoadCounterRef.current) {
      prevLoadCounterRef.current = loadCounter;
      if (loadCounter > 0 && waypoints.length > 0) {
        setFitTrigger(t => t + 1);
      }
    }
  }, [loadCounter, waypoints.length]);

  // Reset click modes when home is cleared (e.g., New button clicked)
  useEffect(() => {
    if (!homePosition) {
      setIsAddingWaypoint(false);
      setIsSettingHome(false);
    }
  }, [homePosition]);

  // Handle map click - either set home or add waypoint depending on mode
  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isSettingHome) {
      setHomePosition(lat, lng, 0);
      setIsSettingHome(false);
      return;
    }

    // Auto-set home on first waypoint click if not already set.
    // Home is a planning reference (FC sets its own home on arm via GPS).
    if (!homePosition) {
      setHomePosition(lat, lng, 0);
    }

    // Get default altitude from last waypoint or 100m
    const lastWp = missionItems[missionItems.length - 1];
    const alt = lastWp?.altitude ?? 100;
    addWaypoint(lat, lng, alt);
  }, [isSettingHome, homePosition, missionItems, setHomePosition, addWaypoint]);

  // Toggle set home mode
  const handleToggleSetHome = useCallback(() => {
    setIsSettingHome(prev => !prev);
    setIsAddingWaypoint(false); // Exit waypoint mode if entering home mode
  }, []);

  // Memoize callbacks to prevent DraggableMarker re-renders during drag
  const handleMarkerClick = useCallback((seq: number) => {
    setSelectedSeq(seq);
  }, [setSelectedSeq]);

  const handleMarkerDragEnd = useCallback((seq: number, lat: number, lng: number) => {
    updateWaypoint(seq, { latitude: lat, longitude: lng });
  }, [updateWaypoint]);

  // Handle right-click on path segment to insert waypoint
  const handlePathRightClick = useCallback((e: L.LeafletMouseEvent, afterSeq: number) => {
    if (readOnly) return;
    e.originalEvent.preventDefault();

    // Get screen position for context menu
    const containerPoint = e.containerPoint;

    setContextMenu({
      x: containerPoint.x,
      y: containerPoint.y,
      lat: e.latlng.lat,
      lon: e.latlng.lng,
      afterSeq,
      kind: 'path',
    });
  }, [readOnly]);

  // Relative-waypoint editor state (popover anchored to a reference WP)
  const [relativeEditor, setRelativeEditor] = useState<RelativeEditorState | null>(null);
  const [relativePreview, setRelativePreview] = useState<{ lat: number; lon: number } | null>(null);

  // Handle right-click on a waypoint marker
  const handleMarkerRightClick = useCallback((e: L.LeafletMouseEvent, wp: MissionItem) => {
    if (readOnly) return;
    e.originalEvent.preventDefault();
    const containerPoint = e.containerPoint;

    setContextMenu({
      x: containerPoint.x,
      y: containerPoint.y,
      lat: wp.latitude,
      lon: wp.longitude,
      afterSeq: wp.seq,
      kind: 'marker',
      refSeq: wp.seq,
      refAlt: wp.altitude,
    });
  }, [readOnly]);

  // Handle insert waypoint from context menu (path mode)
  const handleInsertWaypoint = useCallback(() => {
    if (!contextMenu) return;

    // Get altitude from adjacent waypoints (average)
    const prevWp = waypoints.find(wp => wp.seq === contextMenu.afterSeq);
    const nextWp = waypoints.find(wp => wp.seq === contextMenu.afterSeq + 1);
    const alt = prevWp && nextWp
      ? Math.round((prevWp.altitude + nextWp.altitude) / 2)
      : prevWp?.altitude ?? 100;

    insertWaypoint(contextMenu.afterSeq, contextMenu.lat, contextMenu.lon, alt);
    setContextMenu(null);
  }, [contextMenu, waypoints, insertWaypoint]);

  // Open relative waypoint editor from marker context menu
  const handleOpenRelativeEditor = useCallback(() => {
    if (!contextMenu || contextMenu.kind !== 'marker' || contextMenu.refSeq == null) return;
    setRelativeEditor({
      x: contextMenu.x,
      y: contextMenu.y,
      refSeq: contextMenu.refSeq,
      refLat: contextMenu.lat,
      refLon: contextMenu.lon,
      refAlt: contextMenu.refAlt ?? 100,
    });
    setContextMenu(null);
  }, [contextMenu]);

  const handleRelativeConfirm = useCallback((insertAfterSeq: number, lat: number, lon: number) => {
    if (!relativeEditor) return;
    insertWaypoint(insertAfterSeq, lat, lon, relativeEditor.refAlt);
    setRelativeEditor(null);
    setRelativePreview(null);
  }, [insertWaypoint, relativeEditor]);

  const handleRelativeCancel = useCallback(() => {
    setRelativeEditor(null);
    setRelativePreview(null);
  }, []);

  // Close context menu on click elsewhere
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // Keyboard shortcut: R opens relative-waypoint editor for the selected WP
  useEffect(() => {
    if (readOnly) return;
    const handler = (ev: KeyboardEvent) => {
      if (ev.key !== 'r' && ev.key !== 'R') return;
      // Don't fire while typing in inputs
      const target = ev.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (selectedSeq == null) return;
      const wp = waypoints.find(w => w.seq === selectedSeq);
      if (!wp) return;
      ev.preventDefault();
      // Position popover near viewport center as fallback
      setRelativeEditor({
        x: window.innerWidth / 2 - 140,
        y: window.innerHeight / 2 - 160,
        refSeq: wp.seq,
        refLat: wp.latitude,
        refLon: wp.longitude,
        refAlt: wp.altitude,
      });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [readOnly, selectedSeq, waypoints]);

  const layer = MAP_LAYERS[activeLayer];

  // Build colored path segments from visible mission items (includes DO_* state
  // changes). Hidden groups are excluded so their legs vanish with their WPs.
  const pathSegments = useMemo(() => {
    return buildSegmentedPath(visibleMissionItems, colorByGroup ? groupColorOf : undefined);
  }, [visibleMissionItems, colorByGroup, groupColorOf]);

  // Segment colors per item (for marker tinting)
  const itemColors = useMemo(() => computeItemColors(missionItems), [missionItems]);

  return (
    <div data-tour="mission-map" className="h-full w-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={effectiveZoom}
        maxZoom={layer.maxZoom}
        className="h-full w-full"
        zoomControl={false}
      >
        <ViewportSync />
        <MapResizeHandler />
        <MapBoundsTracker onBoundsChange={handleBoundsChange} />
        <MaxZoomUpdater maxZoom={layer.maxZoom} />
        <MapClickHandler
          onMapClick={handleMapClick}
          isAddMode={isAddingWaypoint}
          isSettingHomeMode={isSettingHome}
          readOnly={readOnly}
          isFenceOrRallyActive={isFenceOrRallyActive}
        />
        <FitToBounds waypoints={waypoints} trigger={fitTrigger} />
        <FocusOnSelected waypoints={waypoints} selectedSeq={selectedSeq} />
        <FocusController waypoints={waypoints} />
        <CenterOnGps />
        <CenterOnIpOnce location={ipLocation} enabled={mountedOnFallback} />
        <MapSearchControl />
        <EnginePlanLegend />
        <CenterOnVehicle trigger={centerOnVehicleTrigger} />

        <TileLayer
          key={activeLayer}
          url={`tile-cache://${activeLayer}/{z}/{x}/{y}.png`}
          maxZoom={layer.maxZoom}
          maxNativeZoom={(layer as MapLayer).maxNativeZoom ?? layer.maxZoom}
        />

        {/* Terrain elevation heatmap overlay */}
        {showTerrain && (
          <TerrainOverlayLayer
            opacity={0.6}
            fixedRange={
              terrainAutoRange
                ? elevationRange.max > elevationRange.min
                  ? {
                      min: Math.floor(elevationRange.min / 25) * 25,
                      max: Math.ceil(elevationRange.max / 25) * 25,
                    }
                  : null
                : terrainFixedRange
            }
            referenceAlt={terrainRelativeMode ? vfrHud.alt : null}
            onElevationRangeChange={setElevationRange}
          />
        )}

        {/* Cached area overlay */}
        <CachedAreaOverlay />

        {/* Mission path - colored segments based on active state */}
        {pathSegments.map((seg, i) => (
          <Polyline
            key={i}
            positions={seg.positions}
            pathOptions={{
              color: (colorByGroup || showSegmentColors) ? seg.color : SEGMENT_COLORS.default,
              weight: 3,
              opacity: 0.8,
            }}
          />
        ))}

        {/* Clickable path segments for right-click insertion (hidden in readOnly
            mode). Each is an interactive Leaflet layer, so for very large
            missions we skip them entirely — rendering ~20k interactive layers
            OOM'd the map. Per-segment insertion isn't a meaningful workflow on
            an auto-generated survey of that size anyway. */}
        {!readOnly && waypoints.length > 1 && waypoints.length <= MAX_CLICKABLE_SEGMENTS &&
          waypoints.slice(0, -1).map((wp, i) => {
          const nextWp = waypoints[i + 1]!;
          return (
            <ClickablePathSegment
              key={`segment-${wp.seq}`}
              positions={[
                [wp.latitude, wp.longitude],
                [nextWp.latitude, nextWp.longitude],
              ]}
              afterSeq={wp.seq}
              onRightClick={handlePathRightClick}
            />
          );
        })}

        {/* Loiter radius circles - param3 is radius for all loiter commands */}
        {waypoints
          .filter(wp =>
            (wp.command === MAV_CMD.NAV_LOITER_UNLIM ||
             wp.command === MAV_CMD.NAV_LOITER_TIME ||
             wp.command === MAV_CMD.NAV_LOITER_TURNS) &&
            wp.param3 > 0
          )
          .map((wp) => (
            <Circle
              key={`loiter-${wp.seq}`}
              center={[wp.latitude, wp.longitude]}
              radius={Math.abs(wp.param3)} // param3 is radius for loiter commands
              pathOptions={{
                color: '#a855f7',
                weight: 2,
                opacity: 0.6,
                fill: true,
                fillColor: '#a855f7',
                fillOpacity: 0.1,
                dashArray: '5, 5',
              }}
            />
          ))}

        {/* Home marker */}
        {homePosition && (
          <Marker
            position={[homePosition.lat, homePosition.lon]}
            icon={HOME_ICON}
            zIndexOffset={-1000}
          />
        )}

        {/* TAKEOFF (placeholder coords) rendered at home */}
        {homePosition && ghostTakeoffItems.map((wp) => (
          <Marker
            key={`takeoff-${wp.seq}`}
            position={[homePosition.lat, homePosition.lon]}
            icon={TAKEOFF_AT_HOME_ICON}
            zIndexOffset={-500}
          />
        ))}

        {/* Tiered waypoint rendering: batched canvas dots for everything,
            hover/click hit-testing via a spatial index, real markers only
            while few waypoints are in view (small missions behave as before). */}
        <WaypointTiersOverlay
          waypoints={waypoints}
          surveyGroupIds={surveyGroupIds}
          selectedSeq={selectedSeq}
          currentSeq={currentSeq}
          readOnly={readOnly}
          interactive={!isFenceOrRallyActive}
          showSegmentColors={showSegmentColors}
          itemColors={itemColors}
          groupWaypointNumbers={groupWaypointNumbers}
          colorByGroup={colorByGroup}
          groupColorOf={groupColorOf}
          onSelect={handleMarkerClick}
          onDragEnd={handleMarkerDragEnd}
          onRightClick={handleMarkerRightClick}
        />

        {/* Ghost preview for relative-waypoint editor */}
        {relativeEditor && relativePreview && (
          <>
            <Polyline
              positions={[
                [relativeEditor.refLat, relativeEditor.refLon],
                [relativePreview.lat, relativePreview.lon],
              ]}
              pathOptions={{
                color: '#3b82f6',
                weight: 2,
                opacity: 0.9,
                dashArray: '6, 6',
              }}
            />
            <Marker
              position={[relativePreview.lat, relativePreview.lon]}
              icon={GHOST_WAYPOINT_ICON}
              interactive={false}
            />
          </>
        )}

        {/* Vehicle marker - show when GPS is valid */}
        {vehiclePosition && (
          <Marker
            position={vehiclePosition}
            icon={createVehicleIcon(vfrHud.heading, flight.armed)}
            zIndexOffset={1000}
          />
        )}

        {/* Geofence overlays - always visible */}
        <FenceMapOverlay readOnly={readOnly} />
        <FenceDrawTool />

        {/* Rally point overlays - always visible */}
        <RallyMapOverlay readOnly={readOnly} />

        {/* Map overlays (self-subscribed to avoid re-rendering terrain) */}
        <MapOverlayLayers baseLayer={activeLayer} />

        {/* Persistent overlay for completed survey groups (always on whenever
            survey groups exist in the mission). The in-progress drawing
            overlay below is conditional on the survey panel being active. */}
        <PersistentSurveyOverlay />
        <GuidesOverlay />
        <PlanReplayOverlay />

        {/* Survey grid overlay */}
        {surveyIsActive && (
          <>
            <SurveyDrawTool />
            <SurveyMapOverlay />
          </>
        )}
      </MapContainer>

      <TrafficAltitudeFilter />
      <ZoneAlertBanner />

      {/* Survey config panel lives as a docked tab next to Waypoints; see
          MissionPlanningView. The map no longer renders it as a floating overlay. */}

      {/* Consolidated Layers control (base map + overlays + terrain + offline) */}
      <div className="absolute top-3 right-3 z-[1000]">
        <MapLayersControl
          baseLayers={(Object.keys(MAP_LAYERS) as LayerKey[]).filter((k) => k !== 'dem' && k !== 'radar' && k !== 'openaip')}
          activeLayer={activeLayer}
          onSelectLayer={setActiveLayer}
          showTerrain={showTerrain}
          onToggleTerrain={() => setShowTerrain(!showTerrain)}
          extra={<OfflineAreaDownload bounds={mapBounds} activeLayer={activeLayer} />}
        />
      </div>

      {/* Airspace legend */}
      <AirspaceLegendWrapper />

      {/* Wind overlay controls */}
      <WindControlsWrapper />

      {/* API key dialog */}
      <ApiKeyDialog />

      {/* Elevation legend */}
      {showTerrain && elevationRange.max > 0 && (
        <div className="absolute top-3 left-3 z-[1000]">
          <ElevationLegend
            minElevation={elevationRange.min}
            maxElevation={elevationRange.max}
            autoRange={terrainAutoRange}
            onAutoRangeChange={setTerrainAutoRange}
            fixedRange={terrainFixedRange}
            onFixedRangeChange={setTerrainFixedRange}
            relativeMode={terrainRelativeMode}
            onRelativeModeChange={setTerrainRelativeMode}
            hasCraftPosition={vfrHud.alt !== 0}
          />
        </div>
      )}

      {/* Bottom controls - mode-specific floating tools */}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2">
        {/* === MISSION MODE TOOLS === */}
        {activeMode === 'mission' && (
          <>
            {/* Mission buttons - hidden during survey mode */}
            {!surveyIsActive && (
            <>
            {/* GPS warning for first waypoint - only show when adding mode is active */}
            {!readOnly && isAddingWaypoint && missionItems.length === 0 && <GpsWarning />}

            {/* Add WP button - hidden in readOnly mode */}
            {!readOnly && (
              <button
                onClick={() => {
                  setIsAddingWaypoint(!isAddingWaypoint);
                  setIsSettingHome(false); // Exit home mode if entering add mode
                }}
                className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isAddingWaypoint
                    ? 'bg-blue-600 text-white'
                    : 'bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm'
                }`}
                title={isAddingWaypoint ? 'Click on map to add waypoints' : 'Enter waypoint adding mode'}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {isAddingWaypoint ? 'Click map' : 'Add WP'}
              </button>
            )}

            {/* Hint for Shift+click - show when NOT in add mode (as a shortcut hint) */}
            {!readOnly && !isAddingWaypoint && !isSettingHome && (
              <span className="text-xs text-content-secondary bg-surface-solid border border-subtle shadow-sm px-2.5 py-1.5 rounded">
                <kbd className="bg-surface-raised px-1 rounded text-content-secondary">Shift</kbd>+click to add
              </span>
            )}

            {waypoints.length > 0 && (
              <button
                onClick={() => setFitTrigger(t => t + 1)}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm transition-colors flex items-center gap-1.5"
                title="Fit map to show all waypoints"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                Fit
              </button>
            )}

            {/* Center on Vehicle button */}
            <button
              onClick={() => setCenterOnVehicleTrigger(t => t + 1)}
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm transition-colors flex items-center gap-1.5"
              title="Center map on vehicle GPS position"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Vehicle
            </button>

            {/* Set Home button - hidden in readOnly mode */}
            {!readOnly && (
              <button
                onClick={handleToggleSetHome}
                className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  isSettingHome
                    ? 'bg-emerald-600 text-white'
                    : homePosition
                      ? 'bg-emerald-600/80 text-white'
                      : 'bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm'
                }`}
                title={isSettingHome ? 'Click on map to set home position' : homePosition ? 'Click to change home position' : 'Set home position by clicking on map'}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                {isSettingHome ? 'Click map' : homePosition ? 'Home Set' : 'Set Home'}
              </button>
            )}

            {/* Hint for Set Home mode */}
            {!readOnly && isSettingHome && (
              <span className="text-xs text-emerald-400 bg-surface-solid border border-subtle shadow-sm px-2.5 py-1.5 rounded">
                Click on map to set home
              </span>
            )}

            </>
            )}

            {/* Survey button */}
            {!readOnly && (
              <>
                <div className="w-px h-5 bg-subtle" />
                {!surveyIsActive ? (
                  <SurveyStartButton />
                ) : (
                  <>
                    {surveyDrawMode === 'polygon' && (
                      <span className="text-xs text-purple-400 bg-surface-solid border border-subtle shadow-sm px-2.5 py-1.5 rounded">
                        {surveyPattern === 'corridor'
                          ? 'Click to add centerline points, double-click to finish'
                          : 'Click to add boundary points, double-click to finish'}
                      </span>
                    )}
                    {surveyDrawMode === 'none' && !surveyPolygon && (
                      <button
                        onClick={startSurveyDrawing}
                        className="px-2.5 py-1.5 rounded text-xs font-medium bg-purple-600/80 text-white transition-colors flex items-center gap-1.5"
                        title={surveyPattern === 'corridor' ? 'Draw corridor centerline' : 'Draw survey boundary'}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {surveyPattern === 'corridor' ? 'Draw Centerline' : 'Draw Boundary'}
                      </button>
                    )}
                    <button
                      onClick={deactivateSurvey}
                      className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface-solid border border-red-400 shadow-sm text-red-400 hover:bg-red-600 hover:text-white transition-colors flex items-center gap-1.5"
                      title="Exit survey mode"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      Exit Survey
                    </button>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* === GEOFENCE MODE TOOLS === */}
        {activeMode === 'geofence' && !readOnly && (
          <>
            {/* Include/Exclude toggle */}
            <div className="flex items-center bg-surface-solid border border-subtle shadow-sm rounded overflow-hidden">
              <button
                onClick={() => setFenceInclusionMode(true)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  fenceInclusionMode
                    ? 'bg-green-600 text-white'
                    : 'text-content-secondary hover:text-content'
                }`}
                title="Draw inclusion zones (vehicle must stay inside)"
              >
                Include
              </button>
              <button
                onClick={() => setFenceInclusionMode(false)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  !fenceInclusionMode
                    ? 'bg-red-600 text-white'
                    : 'text-content-secondary hover:text-content'
                }`}
                title="Draw exclusion zones (vehicle must stay outside)"
              >
                Exclude
              </button>
            </div>

            {/* Draw polygon button */}
            {(() => {
              const polygonMode = fenceInclusionMode ? 'polygon-inclusion' : 'polygon-exclusion';
              const isPolygonActive = fenceDrawMode === polygonMode;
              const activeColor = fenceInclusionMode ? 'bg-green-600' : 'bg-red-600';
              return (
                <button
                  onClick={() => setFenceDrawMode(isPolygonActive ? 'none' : polygonMode)}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    isPolygonActive
                      ? `${activeColor} text-white`
                      : 'bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm'
                  }`}
                  title={`Draw ${fenceInclusionMode ? 'inclusion' : 'exclusion'} polygon`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5h16l-2 14H6L4 5z" />
                  </svg>
                  {isPolygonActive ? 'Drawing...' : 'Polygon'}
                </button>
              );
            })()}

            {/* Draw circle button */}
            {(() => {
              const circleMode = fenceInclusionMode ? 'circle-inclusion' : 'circle-exclusion';
              const isCircleActive = fenceDrawMode === circleMode;
              const activeColor = fenceInclusionMode ? 'bg-green-600' : 'bg-red-600';
              return (
                <button
                  onClick={() => setFenceDrawMode(isCircleActive ? 'none' : circleMode)}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                    isCircleActive
                      ? `${activeColor} text-white`
                      : 'bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm'
                  }`}
                  title={`Draw ${fenceInclusionMode ? 'inclusion' : 'exclusion'} circle`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <circle cx="12" cy="12" r="9" strokeWidth={2} />
                  </svg>
                  {isCircleActive ? 'Drawing...' : 'Circle'}
                </button>
              );
            })()}

            {/* Return point button */}
            <button
              onClick={() => setFenceDrawMode(fenceDrawMode === 'return-point' ? 'none' : 'return-point')}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                fenceDrawMode === 'return-point'
                  ? 'bg-amber-600 text-white'
                  : 'bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm'
              }`}
              title="Set fence return point (where vehicle flies on breach)"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {fenceDrawMode === 'return-point' ? 'Click map' : 'Return Pt'}
            </button>

            {/* Drawing hint */}
            {fenceDrawMode !== 'none' && (
              <span className={`text-xs bg-surface-solid border border-subtle shadow-sm px-2.5 py-1.5 rounded ${
                fenceDrawMode === 'return-point' ? 'text-amber-400' :
                fenceInclusionMode ? 'text-green-400' : 'text-red-400'
              }`}>
                {fenceDrawMode.startsWith('polygon-') ? 'Click to add points, double-click to finish' :
                 fenceDrawMode.startsWith('circle-') ? 'Click center, then click edge for radius' :
                 'Click to set return point'}
              </span>
            )}
          </>
        )}

        {/* === RALLY MODE TOOLS === */}
        {activeMode === 'rally' && !readOnly && (
          <>
            <button
              onClick={() => setRallyAddMode(!rallyAddMode)}
              className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                rallyAddMode
                  ? 'bg-orange-600 text-white'
                  : 'bg-surface border border-subtle text-content hover:bg-surface-raised shadow-sm'
              }`}
              title="Add rally points by clicking on map"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {rallyAddMode ? 'Click map' : 'Add Rally'}
            </button>

            {/* Adding hint */}
            {rallyAddMode && (
              <span className="text-xs text-orange-400 bg-surface-solid border border-subtle shadow-sm px-2.5 py-1.5 rounded">
                Click on map to add rally point (ESC to cancel)
              </span>
            )}
          </>
        )}
      </div>

      {/* Center map prompt — kept only for the "Set Home" mode, which is a
          discrete action the user kicks off from the toolbar and has no other
          map-side indicator. The waypoint variant was redundant with the
          sidebar empty state and the bottom toolbar; removed to stop blocking
          the area users are trying to click. */}
      {activeMode === 'mission' && isSettingHome && !readOnly && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="bg-surface border border-subtle shadow-lg px-6 py-4 rounded-xl text-center">
            <div className="text-emerald-400 text-sm mb-2">Click anywhere on the map</div>
            <div className="text-content-secondary text-xs">to set your Home position</div>
          </div>
        </div>
      )}

      {/* ReadOnly empty state */}
      {waypoints.length === 0 && readOnly && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="bg-surface border border-subtle shadow-lg px-6 py-4 rounded-xl text-center">
            <div className="text-content-secondary text-sm">No mission loaded</div>
          </div>
        </div>
      )}

      {/* Segment color legend + toggle */}
      {activeMode === 'mission' && waypoints.length > 1 && (
        <div className="absolute bottom-3 right-3 z-[1000]">
          <div className="bg-surface-solid border border-subtle shadow-sm rounded-lg overflow-hidden text-xs">
            <button
              onClick={() => updateMissionDefaults({ showSegmentColors: !showSegmentColors })}
              className="flex items-center gap-1.5 px-2.5 py-1.5 w-full hover:bg-surface-raised transition-colors"
            >
              <div className={`w-3 h-3 rounded-sm border transition-colors ${
                showSegmentColors
                  ? 'bg-blue-500 border-blue-400'
                  : 'bg-transparent border-content-secondary'
              }`}>
                {showSegmentColors && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M2 6l3 3 5-5" />
                  </svg>
                )}
              </div>
              <span className="text-content font-medium">Path colors</span>
            </button>
            {showSegmentColors && (
              <div className="px-2.5 pb-2 pt-0.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS.camera }} />
                  <span className="text-content-secondary">Camera</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS.roi }} />
                  <span className="text-content-secondary">ROI</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS.speed }} />
                  <span className="text-content-secondary">Speed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS.rth }} />
                  <span className="text-content-secondary">RTH</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS.land }} />
                  <span className="text-content-secondary">Land</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS.default }} />
                  <span className="text-content-secondary">Default</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context menu for inserting waypoint */}
      {contextMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-[1100]"
            onClick={handleCloseContextMenu}
            onContextMenu={(e) => { e.preventDefault(); handleCloseContextMenu(); }}
          />
          {/* Menu */}
          <div
            className="absolute z-[1200] bg-surface border border-default rounded-lg shadow-xl py-1 min-w-[200px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {contextMenu.kind === 'path' ? (
              <>
                <button
                  onClick={handleInsertWaypoint}
                  className="w-full px-3 py-2 text-left text-sm text-content hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Insert waypoint here
                </button>
                <div className="px-3 py-1 text-[10px] text-content-secondary border-t border-default mt-1">
                  Between WP {contextMenu.afterSeq + 1} → {contextMenu.afterSeq + 2}
                </div>
              </>
            ) : (
              <>
                <button
                  onClick={handleOpenRelativeEditor}
                  className="w-full px-3 py-2 text-left text-sm text-content hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <circle cx="12" cy="12" r="3" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
                  </svg>
                  Add relative waypoint…
                </button>
                <div className="px-3 py-1 text-[10px] text-content-secondary border-t border-default mt-1">
                  From WP {(contextMenu.refSeq ?? 0) + 1} · bearing + distance
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* Relative waypoint editor popover */}
      {relativeEditor && (
        <RelativeWaypointPopover
          refSeq={relativeEditor.refSeq}
          refLat={relativeEditor.refLat}
          refLon={relativeEditor.refLon}
          totalWaypoints={missionItems.length}
          screenX={relativeEditor.x}
          screenY={relativeEditor.y}
          onPreview={setRelativePreview}
          onConfirm={handleRelativeConfirm}
          onCancel={handleRelativeCancel}
        />
      )}
    </div>
  );
}
