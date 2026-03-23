import { useEffect, useRef, useState, useMemo, useCallback, type ReactNode } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Use pre-built CSP worker to avoid Vite esbuild __publicField error
maplibregl.setWorkerUrl('/maplibre-worker.js');
import { useMissionStore } from '../../stores/mission-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useSettingsStore } from '../../stores/settings-store';
import { getElevations } from '../../utils/elevation-api';
import { useIpLocation } from '../../utils/ip-geolocation';
import { computeItemColors } from '../../utils/mission-segment-colors';
import {
  isNavigationCommand,
  commandHasLocation,
  hasValidCoordinates,
  MAV_FRAME,
  MAV_CMD,
} from '../../../shared/mission-types';
import { createMissionThreeJsLayer, type MissionThreeJsLayer } from './mission-threejs-layer';
import { createVehicleThreeJsLayer, type VehicleThreeJsLayer } from './vehicle-threejs-layer';

// Shared map layer definitions (centralized)
import { MAP_LAYERS, type LayerKey, type MapLayer } from '../../../shared/map-layers';
import { LayerIcon } from '../map/LayerIcon';

// Exclude 'dem' from the layer picker (it's a data layer, not a base map)
type BaseLayerKey = Exclude<LayerKey, 'dem'>;

/** Waypoint with computed display altitude (AGL at its location) */
interface WpDisplay {
  seq: number;
  lon: number;
  lat: number;
  frame: number;
  command: number;
  /** Original altitude from mission item (relative to home or terrain depending on frame) */
  missionAlt: number;
  /** Computed AGL at this waypoint's location */
  displayAgl: number;
  /** Terrain elevation MSL at this waypoint */
  groundElev: number;
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

/** Get tile-cache:// URL template for a layer (MapLibre substitutes {z}/{x}/{y}) */
function getCachedTileUrl(layerKey: BaseLayerKey): string {
  return `tile-cache://${layerKey}/{z}/{x}/{y}.png`;
}

/** CSS overrides to dark-theme the MapLibre navigation control */
const DARK_MAP_CSS = `
.maplibregl-ctrl-group {
  background: rgba(17, 24, 39, 0.9) !important;
  border: 1px solid rgba(75, 85, 99, 0.5) !important;
  border-radius: 8px !important;
  backdrop-filter: blur(8px);
}
.maplibregl-ctrl-group button {
  border-color: rgba(75, 85, 99, 0.3) !important;
}
.maplibregl-ctrl-group button + button {
  border-top-color: rgba(75, 85, 99, 0.3) !important;
}
.maplibregl-ctrl-group button span {
  filter: invert(0.7);
}
.maplibregl-ctrl-group button:hover {
  background: rgba(55, 65, 81, 0.8) !important;
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
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const threeLayerRef = useRef<MissionThreeJsLayer | null>(null);
  const vehicleLayerRef = useRef<VehicleThreeJsLayer | null>(null);
  const markerContainerRef = useRef<HTMLDivElement>(null);
  const isInitialFitDone = useRef(false);

  const sharedMapLayer = useEditModeStore((s) => s.mapLayer);
  const setSharedMapLayer = useEditModeStore((s) => s.setMapLayer);
  // Use shared layer if it's a valid 3D key, otherwise fall back to 'osm'
  const activeLayer: LayerKey = (sharedMapLayer in MAP_LAYERS ? sharedMapLayer : 'osm') as LayerKey;
  const setActiveLayer = (layer: LayerKey) => setSharedMapLayer(layer);
  const [exaggeration, setExaggeration] = useState(1.0);
  const [mapReady, setMapReady] = useState(false);
  const [wpDisplayData, setWpDisplayData] = useState<WpDisplay[]>([]);
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

  // ─── Compute display AGL for each waypoint ─────────────────────────────────
  useEffect(() => {
    if (navWaypoints.length === 0) {
      setWpDisplayData([]);
      return;
    }

    let cancelled = false;

    const compute = async () => {
      const queryPoints: { lat: number; lon: number }[] = [];

      if (homePosition) {
        queryPoints.push({ lat: homePosition.lat, lon: homePosition.lon });
      }

      for (const wp of navWaypoints) {
        queryPoints.push({ lat: wp.latitude, lon: wp.longitude });
      }

      let elevations: (number | null)[];
      try {
        elevations = await getElevations(queryPoints);
      } catch {
        elevations = queryPoints.map(() => 0);
      }

      if (cancelled) return;

      const homeIdx = homePosition ? 0 : -1;
      const homeGroundElev = homeIdx >= 0 ? (elevations[homeIdx] ?? 0) : 0;
      const wpOffset = homePosition ? 1 : 0;

      const result: WpDisplay[] = navWaypoints.map((wp, i) => {
        const wpGroundElev = elevations[i + wpOffset] ?? 0;
        let displayAgl: number;

        if (wp.frame === MAV_FRAME.GLOBAL_TERRAIN_ALT) {
          displayAgl = wp.altitude;
        } else if (wp.frame === MAV_FRAME.GLOBAL || wp.frame === MAV_FRAME.GLOBAL_INT) {
          displayAgl = wp.altitude - wpGroundElev;
        } else {
          // GLOBAL_RELATIVE_ALT (default)
          displayAgl = homeGroundElev + wp.altitude - wpGroundElev;
        }

        displayAgl = Math.max(displayAgl, 2);

        return {
          seq: wp.seq,
          lon: wp.longitude,
          lat: wp.latitude,
          frame: wp.frame,
          command: wp.command,
          missionAlt: wp.altitude,
          displayAgl,
          groundElev: wpGroundElev,
        };
      });

      setWpDisplayData(result);
    };

    compute();
    return () => { cancelled = true; };
  }, [navWaypoints, homePosition]);

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
        maxzoom: 15, // Terrarium tiles only available up to zoom 15
      });

      map.setTerrain({ source: 'terrain-dem', exaggeration });

      map.setSky({
        'sky-color': '#1a1d2e',
        'horizon-color': '#2d3148',
        'fog-color': '#1a1d2e',
        'fog-ground-blend': 0.5,
        'horizon-fog-blend': 0.8,
        'sky-horizon-blend': 0.9,
        'atmosphere-blend': 0.7,
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
        filter: ['!=', ['get', 'hide_3d'], true],
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
      const threeLayer = createMissionThreeJsLayer((seq) => {
        setSelectedSeq(seq);
      });
      threeLayer.setMarkerContainer(markerContainerRef.current);
      threeLayerRef.current = threeLayer;
      map.addLayer(threeLayer.layer);

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
      console.error('[3D] map error:', e.error?.message || e);
    });

    mapRef.current = map;

    return () => {
      vehicleLayerRef.current?.dispose();
      vehicleLayerRef.current = null;
      threeLayerRef.current?.dispose();
      threeLayerRef.current = null;
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
    if (!map || !mapReady || !showTerrain) return;
    map.setTerrain({ source: 'terrain-dem', exaggeration });
  }, [exaggeration, mapReady, showTerrain]);

  // ─── Update Three.js layer + native MapLibre layers ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // Update Three.js layer with waypoint data
    threeLayerRef.current?.updateData({
      waypoints: wpDisplayData.map(wp => {
        // Same logic as 2D: special commands keep their color, regular WPs use segment color
        const commandColor = getCommandColor(wp.command);
        const hasSpecialColor = commandColor !== '#3b82f6';
        const segColor = itemColors.get(wp.seq) ?? '#3b82f6';
        const markerColor = hasSpecialColor ? commandColor : segColor;
        const shape = getCommandShape(wp.command);

        return {
          seq: wp.seq,
          lon: wp.lon,
          lat: wp.lat,
          displayAgl: wp.displayAgl,
          groundElev: wp.groundElev,
          color: markerColor,
          displayText: shape || String(wp.seq + 1),
        };
      }),
      selectedSeq,
      terrainExaggeration: exaggeration,
      segmentColors: wpDisplayData.length >= 2
        ? wpDisplayData.slice(1).map(wp => itemColors.get(wp.seq) ?? '#3b82f6')
        : [],
    });

    // Ground shadow — dashed line on terrain
    const groundFeatures: GeoJSON.Feature[] = [];
    if (wpDisplayData.length >= 2) {
      groundFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: wpDisplayData.map(wp => [wp.lon, wp.lat]),
        },
      });
    }
    setSourceData(map, 'ground-shadow', groundFeatures);

    // Home position
    const homeFeatures: GeoJSON.Feature[] = [];
    if (homePosition && hasValidCoordinates(homePosition.lat, homePosition.lon)) {
      homeFeatures.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [homePosition.lon, homePosition.lat] },
      });
    }
    setSourceData(map, 'home', homeFeatures);

  }, [wpDisplayData, selectedSeq, homePosition, mapReady, exaggeration, itemColors]);

  // Fit bounds on first load
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || wpDisplayData.length === 0) return;
    if (isInitialFitDone.current) return;
    isInitialFitDone.current = true;
    fitToWaypoints(map, wpDisplayData);
  }, [wpDisplayData, mapReady, loadCounter]);

  // Re-fit on loadCounter change
  const prevLoadCounterRef = useRef(loadCounter);
  useEffect(() => {
    if (loadCounter !== prevLoadCounterRef.current) {
      prevLoadCounterRef.current = loadCounter;
      const map = mapRef.current;
      if (map && mapReady && wpDisplayData.length > 0) {
        fitToWaypoints(map, wpDisplayData);
      }
    }
  }, [loadCounter, mapReady, wpDisplayData]);

  // Fly to selected waypoint
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selectedSeq === null) return;
    const wp = wpDisplayData.find(w => w.seq === selectedSeq);
    if (!wp) return;
    map.flyTo({ center: [wp.lon, wp.lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
  }, [selectedSeq, mapReady, wpDisplayData]);

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
    if (!map || !mapReady) return;

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
    if (map && wpDisplayData.length > 0) fitToWaypoints(map, wpDisplayData);
  }, [wpDisplayData]);

  const handleExaggerationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setExaggeration(parseFloat(e.target.value));
  }, []);

  return (
    <div className="relative h-full w-full bg-gray-950">
      <div ref={mapContainerRef} className="h-full w-full" />
      {/* DOM overlay for 3D-projected waypoint markers */}
      <div ref={markerContainerRef} className="absolute inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 1 }} />

      {/* Layer selector */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1">
        {showMapModeToggle && (
          <div className="flex rounded-lg overflow-hidden shadow-lg border border-gray-600/50 mb-0.5">
            <button
              onClick={() => useEditModeStore.getState().setMapMode('2d')}
              className="px-2 py-1 text-xs font-medium transition-colors bg-gray-800/90 text-gray-500 hover:text-gray-300"
            >2D</button>
            <button
              className="px-2 py-1 text-xs font-medium transition-colors bg-indigo-600 text-white"
            >3D</button>
          </div>
        )}
        {(Object.keys(MAP_LAYERS) as LayerKey[]).filter((k) => k !== 'dem').map((key) => (
          <button
            key={key}
            onClick={() => setActiveLayer(key)}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
              activeLayer === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
            }`}
          >
            <LayerIcon layerKey={key} />
            {MAP_LAYERS[key].name}
          </button>
        ))}
        {toolbarContent}
      </div>

      {/* Bottom-left controls */}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2">
        {navWaypoints.length > 0 && (
          <button
            onClick={handleFitWaypoints}
            className="px-2.5 py-1.5 rounded text-xs font-medium bg-gray-800/90 text-gray-300 hover:bg-gray-700/90 transition-colors flex items-center gap-1.5"
            title="Fit map to show all waypoints"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            Fit
          </button>
        )}

        <button
          onClick={handleCenterOnGps}
          className="px-2.5 py-1.5 rounded text-xs font-medium bg-gray-800/90 text-gray-300 hover:bg-gray-700/90 transition-colors flex items-center gap-1.5"
          title="Center map on vehicle GPS position"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Vehicle
        </button>

      </div>

      {/* Placeholder — hidden in telemetry mode */}
      {navWaypoints.length === 0 && !isTelemetryMode && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="bg-gray-900/80 backdrop-blur-sm px-6 py-4 rounded-xl text-center">
            <div className="text-gray-400 text-sm mb-2">No waypoints yet</div>
            <div className="text-gray-500 text-xs">Add waypoints in 2D view to see them in 3D</div>
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

function fitToWaypoints(map: maplibregl.Map, waypoints: WpDisplay[]) {
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
