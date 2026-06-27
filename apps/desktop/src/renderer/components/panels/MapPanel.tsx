import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useMissionStore } from '../../stores/mission-store';
import { commandHasLocation, hasValidCoordinates, MAV_CMD, type MissionItem } from '../../../shared/mission-types';
import { splitMissionMarkers } from '../../utils/mission-markers';
import { AttitudeIndicator } from './AttitudePanel';
import { useIpLocation } from '../../utils/ip-geolocation';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useSettingsStore } from '../../stores/settings-store';
import { Mission3DPanel } from '../mission/Mission3DPanel';
import { TAKEOFF_AT_HOME_ICON } from '../mission/takeoff-icon';
import { createTacticalVehicleIcon, updateTacticalIconDOM } from '../map/TacticalVehicleIcon';
import { mavTypeToTacticalClass, type VehicleState } from '../map/tactical-icon-pool';
import { dispatchMapCommand, type ActiveCommandTarget, type MapCommand } from '../map/map-command-types';
import { useCommandTargetStore, useSelfActiveTarget, SELF_VEHICLE_ID } from '../../stores/command-target-store';
import { useImperativeMapLayer } from '../map/ImperativeMapLayer';
import { MapCommandPopup } from '../map/MapCommandPopup';
import { createPortal } from 'react-dom';
import { computeOffsetPosition } from '../../utils/geo-offset';
import { formatAltitudeFromMeters, formatDistanceFromMeters, formatSpeedFromMetersPerSecond, type DistanceUnit } from '../../../shared/user-units.js';

// Geofence and Rally overlays (read-only in telemetry view)
import { FenceMapOverlay } from '../geofence/FenceMapOverlay';
import { RallyMapOverlay } from '../rally/RallyMapOverlay';

// Terrain elevation overlay
import { TerrainOverlayLayer, type ElevationRange } from '../map/TerrainOverlayLayer';
import { ElevationLegend } from '../map/ElevationLegend';

// Offline map download
import { OfflineAreaDownload } from '../map/OfflineAreaDownload';

// Cached area overlay
import { CachedAreaOverlay } from '../map/CachedAreaOverlay';

// Shared map layer definitions (centralized)
import { MAP_LAYERS, type LayerKey, type MapLayer } from '../../../shared/map-layers';

// Map overlays (weather radar, aviation, airspace zones)
import { WeatherRadarOverlay } from '../map/overlays/WeatherRadarOverlay';
import { OpenAipOverlay } from '../map/overlays/OpenAipOverlay';
import { DipulOverlay } from '../map/overlays/DipulOverlay';
import { AirspaceOverlay } from '../map/overlays/AirspaceOverlay';
import { AirspaceLegend } from '../map/overlays/AirspaceLegend';
import { MapLayersControl } from '../map/overlays/MapLayersControl';
import { WindParticleOverlay } from '../map/overlays/WindParticleOverlay';
import { WindControls } from '../map/overlays/WindControls';
import { WindRoseCard } from '../map/overlays/WindRoseCard';
import { ApiKeyDialog } from '../map/overlays/ApiKeyDialog';
import { useOverlayStore } from '../../stores/overlay-store';

const TELEMETRY_LAYERS = {
  osm: MAP_LAYERS.osm,
  satellite: MAP_LAYERS.satellite,
  googleSat: MAP_LAYERS.googleSat,
  googleHybrid: MAP_LAYERS.googleHybrid,
  terrain: MAP_LAYERS.terrain,
  dark: MAP_LAYERS.dark,
} as const;

type TelemetryLayerKey = keyof typeof TELEMETRY_LAYERS;

// Calculate distance between two points (Haversine formula)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Calculate bearing between two points
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// Calculate point at distance and bearing from origin
function calculateDestination(lat: number, lon: number, bearing: number, distance: number): [number, number] {
  const R = 6371000;
  const bearingRad = bearing * Math.PI / 180;
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;

  const lat2 = Math.asin(
    Math.sin(latRad) * Math.cos(distance / R) +
    Math.cos(latRad) * Math.sin(distance / R) * Math.cos(bearingRad)
  );
  const lon2 = lonRad + Math.atan2(
    Math.sin(bearingRad) * Math.sin(distance / R) * Math.cos(latRad),
    Math.cos(distance / R) - Math.sin(latRad) * Math.sin(lat2)
  );

  return [lat2 * 180 / Math.PI, lon2 * 180 / Math.PI];
}

// =====================================================
// MISSION WAYPOINT RENDERING (read-only in telemetry)
// =====================================================

// Build the complete mission path with curves for spline waypoints
function buildMissionPath(waypoints: MissionItem[]): {
  positions: [number, number][];
  isSpline: boolean[];
} {
  if (waypoints.length < 2) {
    return {
      positions: waypoints.map(wp => [wp.latitude, wp.longitude] as [number, number]),
      isSpline: waypoints.map(wp => wp.command === MAV_CMD.NAV_SPLINE_WAYPOINT)
    };
  }

  const positions: [number, number][] = [];
  const isSpline: boolean[] = [];

  // Add first point
  positions.push([waypoints[0]!.latitude, waypoints[0]!.longitude]);
  isSpline.push(waypoints[0]!.command === MAV_CMD.NAV_SPLINE_WAYPOINT);

  // For each segment between waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    const curr = waypoints[i]!;
    const next = waypoints[i + 1]!;
    const currIsSpline = curr.command === MAV_CMD.NAV_SPLINE_WAYPOINT;
    const nextIsSpline = next.command === MAV_CMD.NAV_SPLINE_WAYPOINT;

    // If either endpoint is a spline, draw a curve
    if (currIsSpline || nextIsSpline) {
      // Get control points (previous and next waypoints for curve direction)
      const prev = i > 0 ? waypoints[i - 1]! : curr;
      const after = i < waypoints.length - 2 ? waypoints[i + 2]! : next;

      const p0: [number, number] = [prev.latitude, prev.longitude];
      const p1: [number, number] = [curr.latitude, curr.longitude];
      const p2: [number, number] = [next.latitude, next.longitude];
      const p3: [number, number] = [after.latitude, after.longitude];

      // Interpolate curve using Catmull-Rom
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

        positions.push([lat, lng]);
        isSpline.push(true);
      }
    }

    // Add the next waypoint
    positions.push([next.latitude, next.longitude]);
    isSpline.push(nextIsSpline);
  }

  return { positions, isSpline };
}

// Get color based on command type
function getCommandColor(cmd: number): string {
  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
      return '#22c55e'; // Green - takeoff
    case MAV_CMD.NAV_LAND:
      return '#ef4444'; // Red - land
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return '#f97316'; // Orange - RTL
    case MAV_CMD.NAV_LOITER_UNLIM:
    case MAV_CMD.NAV_LOITER_TIME:
    case MAV_CMD.NAV_LOITER_TURNS:
      return '#a855f7'; // Purple - loiter
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return '#06b6d4'; // Cyan - spline
    default:
      return '#3b82f6'; // Blue - regular waypoint
  }
}

// Get icon shape based on command type
function getCommandShape(cmd: number): string {
  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
      return '▲'; // Triangle up
    case MAV_CMD.NAV_LAND:
      return '▼'; // Triangle down
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return '⌂'; // Home
    case MAV_CMD.NAV_LOITER_UNLIM:
    case MAV_CMD.NAV_LOITER_TIME:
    case MAV_CMD.NAV_LOITER_TURNS:
      return '○'; // Circle for loiter
    default:
      return ''; // Just number for regular waypoints
  }
}

// Create waypoint marker icon (read-only display)
function createWaypointIcon(wp: MissionItem, isCurrent: boolean): L.DivIcon {
  const baseColor = getCommandColor(wp.command);
  const bgColor = isCurrent ? '#f59e0b' : baseColor;
  const size = isCurrent ? 28 : 24;
  const shape = getCommandShape(wp.command);
  const displayText = shape || (wp.seq + 1).toString();
  const borderColor = isCurrent ? '#fbbf24' : 'rgba(255,255,255,0.8)';
  const borderWidth = isCurrent ? 3 : 2;

  return L.divIcon({
    className: 'waypoint-marker',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${bgColor};
        border: ${borderWidth}px solid ${borderColor};
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${shape ? 12 : 10}px;
        font-weight: bold;
        color: white;
      ">${displayText}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Start/end pills for large missions, where a plain endpoint's sequence number
// is meaningless. A labeled pill ("START"/"END") tells the pilot where the
// route begins and finishes; key commands (takeoff/land/loiter) keep their own
// glyph instead.
function createEndpointIcon(label: string, color: string): L.DivIcon {
  return L.divIcon({
    className: 'waypoint-endpoint-marker',
    html: `
      <div style="
        padding: 2px 7px;
        border-radius: 9px;
        background: ${color};
        border: 2px solid rgba(255,255,255,0.9);
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.5px;
        color: white;
        white-space: nowrap;
      ">${label}</div>
    `,
    iconSize: [46, 18],
    iconAnchor: [23, 9],
  });
}

const START_ICON = createEndpointIcon('START', '#22c55e');
const END_ICON = createEndpointIcon('END', '#ef4444');

// Mission home marker icon
function createMissionHomeIcon(): L.DivIcon {
  return L.divIcon({
    className: 'mission-home-marker',
    html: `
      <div style="
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        filter: drop-shadow(0 2px 4px rgba(0,0,0,0.4));
      ">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#10b981" stroke="white" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

// Memoized mission home icon
const MISSION_HOME_ICON = createMissionHomeIcon();

// =====================================================
// END MISSION WAYPOINT RENDERING
// =====================================================


// Home marker icon
const homeIcon = L.divIcon({
  className: 'home-marker',
  html: `
    <div style="width: 32px; height: 32px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.5));">
      <svg viewBox="0 0 24 24">
        <!-- Dark outline for contrast -->
        <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z" fill="none" stroke="#000" stroke-width="2.5" stroke-linejoin="round"/>
        <!-- White outline -->
        <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z" fill="none" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
        <!-- Green fill -->
        <path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z" fill="#22c55e" stroke="#166534" stroke-width="0.5" stroke-linejoin="round"/>
      </svg>
    </div>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Component to handle map updates and resize
function MapController({
  position,
  followVehicle,
  onUserInteraction,
  onMapClick,
  onContextMenu,
  containerRef,
}: {
  position: [number, number];
  followVehicle: boolean;
  onUserInteraction: () => void;
  onMapClick?: () => void;
  onContextMenu?: (lat: number, lon: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}) {
  const map = useMap();
  const lastSetPositionRef = useRef<[number, number] | null>(null);

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      setTimeout(() => {
        // Safety check: ensure map is initialized and has valid container
        try {
          if (map && map.getContainer()) {
            map.invalidateSize();
          }
        } catch {
          // Map not ready yet, ignore
        }
      }, 100);
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [map, containerRef]);

  // Disable follow-vehicle when user manually interacts with map (drag/zoom)
  useEffect(() => {
    const handleInteraction = () => {
      onUserInteraction();
    };

    const handleClick = () => onMapClick?.();

    const handleContextMenu = (e: L.LeafletMouseEvent) => {
      onContextMenu?.(e.latlng.lat, e.latlng.lng);
    };

    map.on('dragstart', handleInteraction);
    map.on('zoomstart', handleInteraction);
    map.on('click', handleClick);
    map.on('contextmenu', handleContextMenu);

    return () => {
      map.off('dragstart', handleInteraction);
      map.off('zoomstart', handleInteraction);
      map.off('click', handleClick);
      map.off('contextmenu', handleContextMenu);
    };
  }, [map, onUserInteraction, onMapClick, onContextMenu]);

  // Clear last position when follow is disabled so re-enabling always snaps to vehicle
  useEffect(() => {
    if (!followVehicle) {
      lastSetPositionRef.current = null;
    }
  }, [followVehicle]);

  // Follow vehicle - only when coordinates actually change
  useEffect(() => {
    if (!followVehicle) return;

    const last = lastSetPositionRef.current;
    if (last && last[0] === position[0] && last[1] === position[1]) return;

    lastSetPositionRef.current = position;
    map.setView(position, map.getZoom(), { animate: true, duration: 0.5 });
  }, [position, followVehicle, map]);

  return null;
}

// Speed-proportional heading line - length scales with groundspeed (meters on the map).
// At 0 m/s it vanishes, at speed it shows where the vehicle is going.
// Multiplier: groundspeed * seconds of lookahead (e.g. 5s = 50m at 10m/s, 250m at 50m/s)
const HEADING_LINE_LOOKAHEAD_S = 5;
const HEADING_LINE_MIN_SPEED = 0.5; // m/s - below this, hide the line

function HeadingLine({
  position,
  heading,
  groundspeed,
  armed,
}: {
  position: [number, number];
  heading: number;
  groundspeed: number;
  armed: boolean;
}) {
  if (groundspeed < HEADING_LINE_MIN_SPEED) return null;

  const length = groundspeed * HEADING_LINE_LOOKAHEAD_S;
  // Start line well ahead of vehicle (past the icon arrowhead) so it doesn't overlap
  const GAP = 30; // meters - clears the icon at typical zoom levels
  const startPoint = calculateDestination(position[0], position[1], heading, GAP);
  const endPoint = calculateDestination(position[0], position[1], heading, length + GAP);
  const lineColor = armed ? '#f97316' : '#4ade80';

  return (
    <Polyline
      positions={[startPoint, endPoint]}
      pathOptions={{
        color: lineColor,
        weight: 2,
        opacity: 0.8,
        dashArray: '8 5',
      }}
    />
  );
}

// Home line component (line from vehicle to home)
function HomeLine({
  vehiclePosition,
  homePosition,
}: {
  vehiclePosition: [number, number];
  homePosition: [number, number];
}) {
  return (
    <Polyline
      positions={[vehiclePosition, homePosition]}
      pathOptions={{
        color: '#10b981',
        weight: 1,
        opacity: 0.5,
        dashArray: '3, 6',
      }}
    />
  );
}

// Command target icons + line styles (module-level, created once)
const GOTO_TARGET_ICON = L.divIcon({
  className: '',
  html: `
    <div style="
      width:24px;height:24px;display:flex;align-items:center;justify-content:center;
      filter:drop-shadow(0 0 6px rgba(34,211,238,0.8));
    ">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="3" fill="#22d3ee" fill-opacity="0.4"/>
        <line x1="12" y1="2" x2="12" y2="6"/>
        <line x1="12" y1="18" x2="12" y2="22"/>
        <line x1="2" y1="12" x2="6" y2="12"/>
        <line x1="18" y1="12" x2="22" y2="12"/>
      </svg>
    </div>
  `,
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

// Orbit center: crosshair / target reticle in violet (matches ring)
const ORBIT_CENTER_ICON = L.divIcon({
  className: '',
  html: `
    <div style="
      width:28px;height:28px;display:flex;align-items:center;justify-content:center;
      filter:drop-shadow(0 0 6px rgba(167,139,250,0.9));
    ">
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round">
        <circle cx="14" cy="14" r="4" fill="#a78bfa" fill-opacity="0.5" stroke="#fff" stroke-width="1.5"/>
        <line x1="14" y1="2" x2="14" y2="7"/>
        <line x1="14" y1="21" x2="14" y2="26"/>
        <line x1="2" y1="14" x2="7" y2="14"/>
        <line x1="21" y1="14" x2="26" y2="14"/>
      </svg>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const LAND_TARGET_ICON = L.divIcon({
  className: '',
  html: `
    <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 0 6px rgba(244,63,94,0.8));">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="#fb7185" stroke="#fff" stroke-width="1.5" stroke-linejoin="round">
        <path d="M12 21l-7-9h4V3h6v9h4z"/>
      </svg>
    </div>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Per-command line styles. Color matches the command's accent color.
const GOTO_LINE_OPTIONS: L.PolylineOptions = {
  color: '#22d3ee',
  weight: 2,
  opacity: 0.7,
  dashArray: '8 6',
};
const ORBIT_LINE_OPTIONS: L.PolylineOptions = {
  color: '#a78bfa',
  weight: 2,
  opacity: 0.55,
  dashArray: '4 6',
};
const LAND_LINE_OPTIONS: L.PolylineOptions = {
  color: '#fb7185',
  weight: 2,
  opacity: 0.7,
  dashArray: '8 6',
};

const ORBIT_RING_OPTIONS: L.CircleMarkerOptions = {
  color: '#a78bfa',
  weight: 2.5,
  opacity: 0.95,
  fill: true,
  fillColor: '#a78bfa',
  fillOpacity: 0.08,
  dashArray: '8 6',
};

/**
 * Build a small arrow marker pointing tangentially around the orbit, indicating
 * direction (CW for positive radius, CCW for negative). Placed at 4 points
 * around the ring so direction is unambiguous from any zoom level.
 */
function createOrbitArrowIcon(rotationDeg: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `
      <div style="
        width:18px;height:18px;
        transform:rotate(${rotationDeg}deg);
        display:flex;align-items:center;justify-content:center;
      ">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="#a78bfa" stroke="#fff" stroke-width="1">
          <path d="M7 1 L12 11 L7 8 L2 11 Z"/>
        </svg>
      </div>
    `,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/**
 * Command layer - uses useImperativeMapLayer() to manage target marker and
 * target line. The COMMAND POPUP itself is rendered as a React overlay
 * positioned via map.latLngToContainerPoint(), NOT a leaflet popup.
 *
 * Why: React 18 event delegation runs from the React root. Leaflet popups call
 * disableClickPropagation on their content which kills React synthetic events,
 * so portaling React UI into a leaflet popup makes onClick handlers no-op. By
 * rendering the popup as a normal React child inside the MapContainer, events
 * stay live while we still get pixel-perfect positioning by tracking the map.
 */
function CommandLayer({
  commandPopup,
  activeTarget,
  vehiclePosition,
  onConfirm,
  onCancel,
}: {
  commandPopup: { lat: number; lon: number } | null;
  activeTarget: ActiveCommandTarget | null;
  vehiclePosition: [number, number];
  onConfirm: (command: MapCommand) => void;
  onCancel: () => void;
}) {
  const layer = useImperativeMapLayer();
  const map = layer.map;

  // Track screen-space anchor for the popup. Updated on every map move so the
  // popup stays glued to the lat/lon as the user pans/zooms.
  const [anchorPx, setAnchorPx] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!commandPopup) {
      setAnchorPx(null);
      return;
    }
    const updateAnchor = () => {
      const pt = map.latLngToContainerPoint([commandPopup.lat, commandPopup.lon]);
      setAnchorPx({ x: pt.x, y: pt.y });
    };
    updateAnchor();
    map.on('move zoom moveend zoomend', updateAnchor);
    return () => { map.off('move zoom moveend zoomend', updateAnchor); };
  }, [commandPopup, map]);

  // Distance + telemetry context for the popup
  const popupContext = useMemo(() => {
    if (!commandPopup) return null;
    const dist = calculateDistance(
      vehiclePosition[0], vehiclePosition[1],
      commandPopup.lat, commandPopup.lon,
    );
    const altAgl = useTelemetryStore.getState().position.relativeAlt;
    const mode = useTelemetryStore.getState().flight.mode;
    return { dist, altAgl, mode };
  }, [commandPopup, vehiclePosition]);

  // --- Active target marker + line + orbit ring + direction arrows ---
  useEffect(() => {
    const ARROW_IDS = ['cmd-orbit-arrow-0', 'cmd-orbit-arrow-1', 'cmd-orbit-arrow-2', 'cmd-orbit-arrow-3'] as const;
    const cleanupArrows = () => ARROW_IDS.forEach(id => layer.remove(id));

    if (!activeTarget) {
      layer.remove('cmd-target');
      layer.remove('cmd-line');
      layer.remove('cmd-orbit-ring');
      cleanupArrows();
      return;
    }

    if (activeTarget.type === 'goto') {
      layer.polyline('cmd-line', [vehiclePosition, [activeTarget.lat, activeTarget.lon]], GOTO_LINE_OPTIONS);
      layer.marker('cmd-target', [activeTarget.lat, activeTarget.lon], { icon: GOTO_TARGET_ICON });
      layer.remove('cmd-orbit-ring');
      cleanupArrows();
    } else if (activeTarget.type === 'orbit' || activeTarget.type === 'spiral') {
      // Spiral renders the same circular footprint as Orbit - the climb is a
      // temporal property, not a static path. Direction arrows still apply.
      layer.polyline('cmd-line', [vehiclePosition, [activeTarget.lat, activeTarget.lon]], ORBIT_LINE_OPTIONS);
      layer.marker('cmd-target', [activeTarget.lat, activeTarget.lon], { icon: ORBIT_CENTER_ICON });
      layer.circle('cmd-orbit-ring', [activeTarget.lat, activeTarget.lon], Math.abs(activeTarget.radius), ORBIT_RING_OPTIONS);
      const isCw = activeTarget.radius >= 0;
      const tangentOffset = isCw ? 90 : -90;
      const r = Math.abs(activeTarget.radius);
      [0, 90, 180, 270].forEach((bearing, i) => {
        const pos = computeOffsetPosition(activeTarget.lat, activeTarget.lon, bearing, r);
        const arrowRotation = (bearing + tangentOffset + 360) % 360;
        layer.marker(ARROW_IDS[i]!, [pos.lat, pos.lon], { icon: createOrbitArrowIcon(arrowRotation), interactive: false });
      });
    } else if (activeTarget.type === 'watchtower') {
      // Watchtower flies the vehicle TO the point (approach phase) before
      // starting yaw rotation. Render the same line + marker intent indicator
      // as Move/Orbit so the operator sees what was commanded.
      layer.polyline('cmd-line', [vehiclePosition, [activeTarget.lat, activeTarget.lon]], ORBIT_LINE_OPTIONS);
      layer.marker('cmd-target', [activeTarget.lat, activeTarget.lon], { icon: ORBIT_CENTER_ICON });
      layer.remove('cmd-orbit-ring');
      cleanupArrows();
    } else if (activeTarget.type === 'reveal' || activeTarget.type === 'strafe') {
      // Reveal/Strafe: line from vehicle to target as the "look-at" indicator.
      // The exact pull-back / dolly path is computed FC-side from the vehicle
      // pose at command START; from the GCS side we can only show the target
      // and the look-at line as an intent indicator.
      layer.polyline('cmd-line', [vehiclePosition, [activeTarget.lat, activeTarget.lon]], ORBIT_LINE_OPTIONS);
      layer.marker('cmd-target', [activeTarget.lat, activeTarget.lon], { icon: ORBIT_CENTER_ICON });
      layer.remove('cmd-orbit-ring');
      cleanupArrows();
    } else if (activeTarget.type === 'climbRtl') {
      // No spatial target - vehicle climbs in place. Clear all overlays.
      layer.remove('cmd-line');
      layer.remove('cmd-target');
      layer.remove('cmd-orbit-ring');
      cleanupArrows();
    } else {
      layer.polyline('cmd-line', [vehiclePosition, [activeTarget.lat, activeTarget.lon]], LAND_LINE_OPTIONS);
      layer.marker('cmd-target', [activeTarget.lat, activeTarget.lon], { icon: LAND_TARGET_ICON });
      layer.remove('cmd-orbit-ring');
      cleanupArrows();
    }
  }, [activeTarget, vehiclePosition, layer]);

  // Render the popup as a React overlay portaled to document.body so it's
  // outside the leaflet map subtree (otherwise leaflet's native click listener
  // fires before React's synthetic events and kills the popup).
  // Position is calculated by adding the map container's viewport offset to
  // the lat/lon → container point projection.
  if (!commandPopup || !anchorPx || !popupContext) return null;

  return (
    <CommandPopupOverlay
      anchorPx={anchorPx}
      mapContainer={map.getContainer()}
      lat={commandPopup.lat}
      lon={commandPopup.lon}
      distanceMeters={popupContext.dist}
      currentAltAgl={popupContext.altAgl}
      currentMode={popupContext.mode}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

interface CommandPopupOverlayProps {
  anchorPx: { x: number; y: number };
  mapContainer: HTMLElement;
  lat: number;
  lon: number;
  distanceMeters: number;
  currentAltAgl: number;
  currentMode: string;
  onConfirm: (command: MapCommand) => void;
  onCancel: () => void;
}

function CommandPopupOverlay({
  anchorPx,
  mapContainer,
  lat,
  lon,
  distanceMeters,
  currentAltAgl,
  currentMode,
  onConfirm,
  onCancel,
}: CommandPopupOverlayProps) {
  // Two-pass positioning: render off-screen first, measure, then re-place with
  // viewport-edge collision avoidance. Default anchors above-and-right of the
  // click; flips below if it would clip the top, shifts left if it would clip
  // the right edge.
  const popupRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; ready: boolean }>({
    left: -9999, top: -9999, ready: false,
  });

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const rect = mapContainer.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popupW = el.offsetWidth;
    const popupH = el.offsetHeight;
    const margin = 12;
    const clickX = rect.left + anchorPx.x;
    const clickY = rect.top + anchorPx.y;

    // Horizontal: prefer 12px right of click; flip to 12px left if it would
    // overflow the viewport on the right.
    let left = clickX + margin;
    if (left + popupW > vw - margin) {
      left = clickX - margin - popupW;
    }
    if (left < margin) left = margin;

    // Vertical: prefer above the click (12px gap). Flip below if it would
    // overflow the top. Clamp to bottom margin as last resort.
    let top = clickY - margin - popupH;
    if (top < margin) {
      top = clickY + margin;
    }
    if (top + popupH > vh - margin) {
      top = Math.max(margin, vh - margin - popupH);
    }

    setPos({ left, top, ready: true });
  }, [anchorPx.x, anchorPx.y, mapContainer]);

  // Click-outside dismiss. mousedown so the click that started outside the
  // popup doesn't accidentally hit a button after re-render. Left-button only
  // — a right-click elsewhere on the map should relocate the popup, not
  // dismiss-and-reopen it.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const el = popupRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      onCancel();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onCancel]);

  return createPortal(
    <div
      ref={popupRef}
      className="tactical-command-popup fixed z-[2000] pointer-events-auto rounded-lg shadow-2xl border border-cyan-700/40 bg-gray-900/95 backdrop-blur-sm p-3 max-w-[340px]"
      style={{
        left: pos.left,
        top: pos.top,
        visibility: pos.ready ? 'visible' : 'hidden',
      }}
    >
      <MapCommandPopup
        lat={lat}
        lon={lon}
        distanceMeters={distanceMeters}
        currentAltAgl={currentAltAgl}
        currentMode={currentMode}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>,
    document.body,
  );
}

// Layer switcher component
function LayerSwitcher({
  currentLayer,
  onLayerChange,
}: {
  currentLayer: TelemetryLayerKey;
  onLayerChange: (layer: TelemetryLayerKey) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 text-xs rounded bg-surface text-content hover:bg-surface-raised shadow-lg transition-colors flex items-center gap-1"
        title="Change map layer"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        {TELEMETRY_LAYERS[currentLayer].name}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-surface-solid border border-subtle rounded shadow-xl z-[1000] py-1 min-w-[100px]">
            {(Object.keys(TELEMETRY_LAYERS) as TelemetryLayerKey[]).map((key) => (
              <button
                key={key}
                onClick={() => {
                  onLayerChange(key);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                  currentLayer === key
                    ? 'bg-blue-600 text-white'
                    : 'text-content hover:bg-surface-raised'
                }`}
              >
                {TELEMETRY_LAYERS[key].name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Compass overlay
function CompassOverlay({ heading }: { heading: number }) {
  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000]">
      <div className="relative w-16 h-16">
        {/* Compass ring */}
        <svg viewBox="0 0 100 100" className="w-full h-full">
          <circle cx="50" cy="50" r="45" fill="var(--bg-overlay)" stroke="var(--border-default)" strokeWidth="2" />
          {/* Cardinal directions */}
          <text x="50" y="18" textAnchor="middle" fill="var(--text-primary)" fontSize="12" fontWeight="bold">N</text>
          <text x="85" y="54" textAnchor="middle" fill="var(--text-secondary)" fontSize="10">E</text>
          <text x="50" y="90" textAnchor="middle" fill="var(--text-secondary)" fontSize="10">S</text>
          <text x="15" y="54" textAnchor="middle" fill="var(--text-secondary)" fontSize="10">W</text>
          {/* Tick marks */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <line
              key={deg}
              x1="50"
              y1="8"
              x2="50"
              y2={deg % 90 === 0 ? "14" : "11"}
              stroke={deg === 0 ? "#ef4444" : "var(--text-tertiary)"}
              strokeWidth={deg % 90 === 0 ? "2" : "1"}
              transform={`rotate(${deg} 50 50)`}
            />
          ))}
          {/* Heading indicator (aircraft nose) */}
          <g transform={`rotate(${heading} 50 50)`}>
            <polygon points="50,20 45,35 55,35" fill="#3b82f6" stroke="var(--bg-base)" strokeWidth="0.5" />
          </g>
        </svg>
        {/* Digital heading */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-content text-xs font-mono font-bold">{Math.round(heading)}°</span>
        </div>
      </div>
    </div>
  );
}

// Format distance for display
function formatDistance(meters: number, unit: DistanceUnit): string {
  return formatDistanceFromMeters(meters, unit);
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

// Sync telemetry map viewport to shared store (for 2D↔3D switch)
function TelemetryViewportSync() {
  const map = useMap();

  useEffect(() => {
    const sync = () => {
      const c = map.getCenter();
      useEditModeStore.getState().setMapViewport({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        pitch: 0,
        bearing: 0,
      });
    };
    map.on('moveend', sync);
    sync();
    return () => { map.off('moveend', sync); };
  }, [map]);

  return null;
}

// ─── 3D Telemetry Map (wraps Mission3DPanel with HUD overlays) ───────────────

const TelemetryMap3D = React.memo(function TelemetryMap3D() {
  const gps = useTelemetryStore((s) => s.gps);
  const position = useTelemetryStore((s) => s.position);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const flight = useTelemetryStore((s) => s.flight);
  const attitude = useTelemetryStore((s) => s.attitude);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);

  const [followVehicle, setFollowVehicle] = useState(true);
  const [showCompass, setShowCompass] = useState(true);
  const [showAttitude, setShowAttitude] = useState(true);
  const [showHeadingLine, setShowHeadingLine] = useState(false); // off by default in 3D — vehicle model shows heading
  const [showMission, setShowMission] = useState(true);
  const [showTerrain, setShowTerrain] = useState(true);
  const [useRealVehicleSize, setUseRealVehicleSize] = useState(false);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [homePosition, setHomePosition] = useState<[number, number] | null>(null);
  const [headingLineLength] = useState(100); // meters

  const mapInstanceRef = useRef<import('maplibre-gl').Map | null>(null);
  const lastTrailUpdateRef = useRef<number>(0);

  // IP geolocation fallback (same as 2D)
  const [ipLocation] = useIpLocation();
  const defaultPosition = useMemo<[number, number]>(
    () => ipLocation ? [ipLocation.lat, ipLocation.lon] : [51.505, -0.09],
    [ipLocation]
  );

  const hasValidGps = gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0;
  const gpsPosition = useMemo<[number, number] | null>(
    () => hasValidGps ? [gps.lat, gps.lon] : null,
    [hasValidGps, gps.lat, gps.lon]
  );

  // Vehicle display position with fallback — GPS > home > IP location (same as 2D)
  const vehiclePosition = useMemo<[number, number]>(
    () => gpsPosition || homePosition || defaultPosition,
    [gpsPosition, homePosition, defaultPosition]
  );

  // Vehicle position for MapLibre [lon, lat]
  const vehicleLngLat = useMemo<[number, number]>(
    () => [vehiclePosition[1], vehiclePosition[0]],
    [vehiclePosition]
  );

  // Use mission home for distance calculation (set via MAVLink HOME_POSITION or mission load)
  const missionHome = useMissionStore((s) => s.homePosition);
  const homeStats = useMemo(() => {
    if (!missionHome || (missionHome.lat === 0 && missionHome.lon === 0)) return null;
    if (!hasValidGps) return null;
    const distance = calculateDistance(gps.lat, gps.lon, missionHome.lat, missionHome.lon);
    const bearing = calculateBearing(gps.lat, gps.lon, missionHome.lat, missionHome.lon);
    return { distance, bearing };
  }, [gps.lat, gps.lon, missionHome, hasValidGps]);

  // Compute heading line end point [lon, lat] for MapLibre
  const headingLineEnd = useMemo<[number, number] | null>(() => {
    if (!showHeadingLine) return null;
    const [endLat, endLon] = calculateDestination(vehiclePosition[0], vehiclePosition[1], vfrHud.heading, headingLineLength);
    return [endLon, endLat];
  }, [showHeadingLine, vehiclePosition, vfrHud.heading, headingLineLength]);

  const headingLineColor = flight.armed ? '#f97316' : '#22d3ee';

  // Trail recording — 100-point buffer, 500ms throttle (same as 2D)
  useEffect(() => {
    if (gpsPosition && hasValidGps) {
      const now = Date.now();
      if (now - lastTrailUpdateRef.current > 500) {
        lastTrailUpdateRef.current = now;
        setTrail(prev => {
          const newTrail = [...prev, [gpsPosition[1], gpsPosition[0]] as [number, number]]; // [lon, lat] for MapLibre
          if (newTrail.length > 100) return newTrail.slice(-100);
          return newTrail;
        });

        // Set home on first valid GPS fix
        setHomePosition(prev => prev ?? gpsPosition);
      }
    }
  }, [gpsPosition, hasValidGps]);

  // Map-readiness flag so the command-overlay effect knows when the MapLibre
  // instance is wired up and styles are loaded.
  const [mapReady, setMapReady] = useState(false);

  // Handle map ready — store ref, attach drag listener, and center on vehicle
  const handleMapReady = useCallback((map: import('maplibre-gl').Map) => {
    mapInstanceRef.current = map;
    map.on('dragstart', () => setFollowVehicle(false));
    setMapReady(true);
    // Center on vehicle immediately when 3D map loads (follow effect uses a ref
    // that isn't a dependency, so it won't fire until the next GPS update)
    const g = useTelemetryStore.getState().gps;
    if (g.fixType >= 2 && g.lat !== 0 && g.lon !== 0) {
      map.flyTo({ center: [g.lon, g.lat], duration: 500 });
    }
  }, []);

  // Follow vehicle on GPS update
  useEffect(() => {
    if (!followVehicle || !hasValidGps || !mapInstanceRef.current) return;
    mapInstanceRef.current.flyTo({ center: [gps.lon, gps.lat], duration: 500 });
  }, [followVehicle, hasValidGps, gps.lat, gps.lon]);

  // ── Command-target overlay (3D) ────────────────────────────────────────
  // Mirrors the 2D map's command visualisation: draws the orbit ring, line
  // from vehicle to target, and target marker on top of the MapLibre 3D map
  // so the operator sees the same intent regardless of the active map mode.
  // Reads from the shared command-target store so the overlay survives the
  // 2D ↔ 3D switch (the bug this whole refactor was about).
  const activeTarget3D = useSelfActiveTarget();
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !mapReady) return;

    // All overlay layers/sources share this prefix so cleanup is a single
    // sweep — no chance of leaking layers when the target type changes.
    const PREFIX = 'ad-cmd-';
    const cleanup = () => {
      // Remove layers first (they reference sources), then sources.
      const style = map.getStyle();
      if (!style?.layers) return;
      for (const layer of [...style.layers]) {
        if (layer.id.startsWith(PREFIX) && map.getLayer(layer.id)) map.removeLayer(layer.id);
      }
      for (const sourceId of Object.keys(style.sources ?? {})) {
        if (sourceId.startsWith(PREFIX) && map.getSource(sourceId)) map.removeSource(sourceId);
      }
    };
    cleanup();

    if (!activeTarget3D) return;

    // Helper: GeoJSON Polygon ring approximating a circle of radius `r` (m)
    // around (lat, lon). 64 segments is smooth enough at typical zoom levels.
    const circlePoly = (lat: number, lon: number, r: number): [number, number][] => {
      const segs = 64;
      const out: [number, number][] = [];
      const latM = 111320;
      const lonM = 111320 * Math.cos((lat * Math.PI) / 180);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * 2 * Math.PI;
        out.push([lon + (r * Math.sin(a)) / lonM, lat + (r * Math.cos(a)) / latM]);
      }
      return out;
    };

    const addLine = (id: string, from: [number, number], to: [number, number], color: string) => {
      map.addSource(`${PREFIX}${id}`, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [from, to] } },
      });
      map.addLayer({
        id: `${PREFIX}${id}`,
        type: 'line',
        source: `${PREFIX}${id}`,
        paint: { 'line-color': color, 'line-width': 2, 'line-dasharray': [2, 2] },
      });
    };

    const addPoint = (id: string, lng: number, lat: number, color: string) => {
      map.addSource(`${PREFIX}${id}`, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lng, lat] } },
      });
      map.addLayer({
        id: `${PREFIX}${id}`,
        type: 'circle',
        source: `${PREFIX}${id}`,
        paint: {
          'circle-radius': 8,
          'circle-color': color,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
        },
      });
    };

    const addRing = (id: string, lat: number, lon: number, r: number, color: string) => {
      map.addSource(`${PREFIX}${id}`, {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: circlePoly(lat, lon, r) } },
      });
      map.addLayer({
        id: `${PREFIX}${id}`,
        type: 'line',
        source: `${PREFIX}${id}`,
        paint: { 'line-color': color, 'line-width': 2.5, 'line-dasharray': [3, 2] },
      });
    };

    const vehLngLat: [number, number] = [vehicleLngLat[0], vehicleLngLat[1]];

    if (activeTarget3D.type === 'goto') {
      const tgt: [number, number] = [activeTarget3D.lon, activeTarget3D.lat];
      addLine('line', vehLngLat, tgt, '#22d3ee');
      addPoint('target', tgt[0], tgt[1], '#22d3ee');
    } else if (activeTarget3D.type === 'orbit' || activeTarget3D.type === 'spiral') {
      const tgt: [number, number] = [activeTarget3D.lon, activeTarget3D.lat];
      addLine('line', vehLngLat, tgt, '#a78bfa');
      addPoint('target', tgt[0], tgt[1], '#a78bfa');
      addRing('ring', activeTarget3D.lat, activeTarget3D.lon, Math.abs(activeTarget3D.radius), '#a78bfa');
    } else if (activeTarget3D.type === 'watchtower') {
      const tgt: [number, number] = [activeTarget3D.lon, activeTarget3D.lat];
      addLine('line', vehLngLat, tgt, '#a78bfa');
      addPoint('target', tgt[0], tgt[1], '#a78bfa');
    } else if (activeTarget3D.type === 'reveal' || activeTarget3D.type === 'strafe') {
      // Same intent indicator as 2D: line from vehicle to target + target dot.
      const tgt: [number, number] = [activeTarget3D.lon, activeTarget3D.lat];
      addLine('line', vehLngLat, tgt, '#a78bfa');
      addPoint('target', tgt[0], tgt[1], '#a78bfa');
    } else if (activeTarget3D.type === 'land') {
      const tgt: [number, number] = [activeTarget3D.lon, activeTarget3D.lat];
      addLine('line', vehLngLat, tgt, '#f43f5e');
      addPoint('target', tgt[0], tgt[1], '#f43f5e');
    }
    // climbRtl has no spatial point — nothing to draw.

    return cleanup;
  }, [activeTarget3D, vehicleLngLat, mapReady]);

  const clearTrail = useCallback(() => { setTrail([]); }, []);

  const setHome = useCallback(() => {
    if (gpsPosition) setHomePosition(gpsPosition);
  }, [gpsPosition]);

  // Center on vehicle + re-enable follow (uses display position, works even without GPS)
  const handleCenterOnVehicle = useCallback(() => {
    if (!mapInstanceRef.current) return;
    setFollowVehicle(true);
    mapInstanceRef.current.flyTo({ center: vehicleLngLat, duration: 800 });
  }, [vehicleLngLat]);

  // Toolbar toggle helper
  const toggleBtn = useCallback((label: string, active: boolean, onClick: () => void, title: string, icon?: React.ReactNode) => (
    <button
      key={label}
      onClick={onClick}
      className={`px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
        active ? 'bg-blue-600 text-white' : 'bg-surface text-content hover:bg-surface-raised'
      }`}
      title={title}
    >{icon}{label}</button>
  ), []);

  // Reusable icon elements for 3D toolbar
  const icons = useMemo(() => ({
    crosshair: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="3" />
        <line x1="12" y1="2" x2="12" y2="6" strokeLinecap="round" />
        <line x1="12" y1="18" x2="12" y2="22" strokeLinecap="round" />
        <line x1="2" y1="12" x2="6" y2="12" strokeLinecap="round" />
        <line x1="18" y1="12" x2="22" y2="12" strokeLinecap="round" />
      </svg>
    ),
    resize: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
      </svg>
    ),
    compass: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" stroke="none" />
      </svg>
    ),
    attitude: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="12" r="10" />
        <path strokeLinecap="round" d="M4.93 12h14.14" />
        <path strokeLinecap="round" d="M8 9.5l4-2 4 2" />
      </svg>
    ),
    mission: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
    height: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-4 3 3 4-6 7 7" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h18" />
      </svg>
    ),
    trash: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    home: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    more: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="12" cy="5" r="1" fill="currentColor" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
        <circle cx="12" cy="19" r="1" fill="currentColor" />
      </svg>
    ),
  }), []);

  // Toolbar buttons — compact with overflow toggle
  const toolbarContent = useMemo(() => (
    <>
      <div className="my-0.5 border-t border-subtle" />
      {toggleBtn(followVehicle ? 'Following' : 'Free', followVehicle, () => setFollowVehicle(f => !f), followVehicle ? 'Following vehicle' : 'Free camera', icons.crosshair)}
      {toggleBtn(useRealVehicleSize ? 'Real Size' : 'Auto Size', useRealVehicleSize, () => setUseRealVehicleSize(v => !v), useRealVehicleSize ? 'Vehicle at real profile size' : 'Vehicle auto-scaled to stay visible', icons.resize)}
      {/* Overflow toggle */}
      <button
        onClick={() => setShowMoreTools(v => !v)}
        className={`px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
          showMoreTools ? 'bg-surface-raised text-content' : 'bg-surface text-content-secondary hover:text-content'
        }`}
        title="More options"
      >
        {icons.more}
        {showMoreTools ? 'Less' : 'More...'}
      </button>
      {showMoreTools && (
        <>
          {toggleBtn('Compass', showCompass, () => setShowCompass(v => !v), 'Toggle compass', icons.compass)}
          {toggleBtn('Attitude', showAttitude, () => setShowAttitude(v => !v), 'Toggle attitude indicator', icons.attitude)}
          {toggleBtn('Mission', showMission, () => setShowMission(v => !v), 'Toggle mission overlays', icons.mission)}
          {toggleBtn('Height', showTerrain, () => setShowTerrain(v => !v), 'Toggle terrain elevation', icons.height)}
          <div className="my-0.5 border-t border-subtle" />
          <button
            onClick={clearTrail}
            className="px-2 py-1 text-xs rounded bg-surface text-content hover:bg-surface-raised shadow-lg transition-colors flex items-center gap-1.5"
            title="Clear flight trail"
          >
            {icons.trash}
            Clear Trail
          </button>
          <button
            onClick={setHome}
            disabled={!hasValidGps}
            className="px-2 py-1 text-xs rounded bg-surface text-content hover:bg-surface-raised shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            title="Set home to current position"
          >
            {icons.home}
            Set Home
          </button>
        </>
      )}
    </>
  ), [followVehicle, showCompass, showAttitude, showMission, showTerrain, useRealVehicleSize, showMoreTools, hasValidGps, clearTrail, setHome, toggleBtn, icons]);

  return (
    <div className="relative h-full w-full">
      <Mission3DPanel
        onMapReady={handleMapReady}
        isTelemetryMode
        headingLineEnd={headingLineEnd}
        headingLineColor={headingLineColor}
        headingLineLength={headingLineLength}
        trail={trail}
        showMission={showMission}
        showTerrain={showTerrain}
        toolbarContent={toolbarContent}
        vehicleLngLat={vehicleLngLat}
        vehicleHeading={vfrHud.heading}
        vehicleArmed={flight.armed}
        vehicleAttitude={{ roll: attitude.roll, pitch: attitude.pitch }}
        vehicleAltitudeAgl={position.relativeAlt}
        useRealVehicleSize={useRealVehicleSize}
      />

      {/* Compass overlay */}
      {showCompass && <CompassOverlay heading={vfrHud.heading} />}

      {/* Attitude indicator overlay */}
      {showAttitude && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]">
          <div className="absolute inset-[-4px] rounded-full bg-surface-overlay-light shadow-xl" />
          <div className="relative">
            <AttitudeIndicator
              roll={attitude.roll}
              pitch={attitude.pitch}
              heading={vfrHud.heading}
              size={140}
            />
          </div>
        </div>
      )}

      {/* GPS warning */}
      {!hasValidGps && (
        <div className="absolute top-2 left-2 z-[1000] px-2 py-1 bg-yellow-600/90 text-white text-xs rounded shadow-lg">
          No GPS fix
        </div>
      )}

      {/* Stats overlay */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-surface-overlay backdrop-blur-sm rounded px-3 py-2 text-xs text-content space-y-1 min-w-[130px] border border-subtle shadow-lg">
        <div className="flex justify-between">
          <span className="text-content-secondary">MSL</span>
          <span className="font-mono text-content">{formatAltitudeFromMeters(position.alt, altitudeUnit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-secondary">Rel</span>
          <span className="font-mono text-content">{formatAltitudeFromMeters(position.relativeAlt, altitudeUnit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-secondary">Spd</span>
          <span className="font-mono text-content">{formatSpeedFromMetersPerSecond(vfrHud.groundspeed, speedUnit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-secondary">Hdg</span>
          <span className="font-mono text-content">{vfrHud.heading.toFixed(0)}<span className="text-content-secondary ml-0.5">deg</span></span>
        </div>
        {homeStats && (
          <>
            <div className="border-t border-default my-1" />
            <div className="flex justify-between">
              <span className="text-content-secondary">Home</span>
              <span className="font-mono text-emerald-400">{formatDistance(homeStats.distance, distanceUnit)}</span>
            </div>
          </>
        )}
        {hasValidGps && (
          <>
            <div className="border-t border-default my-1" />
            <div className="text-[10px] text-content-secondary font-mono">
              {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
            </div>
          </>
        )}
      </div>

      {/* Center on vehicle FAB — Google Maps style */}
      <button
        onClick={handleCenterOnVehicle}
        className={`absolute bottom-14 right-3 z-[1000] w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all ${
          followVehicle
            ? 'bg-blue-600 text-white'
            : 'bg-surface text-content-secondary hover:text-content hover:bg-surface-raised'
        }`}
        title={followVehicle ? 'Following vehicle' : 'Center on vehicle'}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>

      {/* Armed status indicator */}
      <div className={`absolute bottom-2 right-3 z-[1000] px-2 py-1 rounded shadow-lg text-xs font-bold ${
        flight.armed ? 'bg-red-600 text-white' : 'bg-surface text-content-secondary'
      }`}>
        {flight.armed ? 'ARMED' : 'DISARMED'}
      </div>
    </div>
  );
});

// Overlay data fetcher (runs inside MapContainer)
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
    </>
  );
}

// Airspace legend — owns its own subscription
function AirspaceLegendWrapper() {
  const hasAirspace = useOverlayStore((s) => s.activeOverlays.has('airspace'));
  if (!hasAirspace) return null;
  return <AirspaceLegend />;
}

// Wind timeline bar — owns its own subscription
function WindControlsWrapper() {
  const hasWind = useOverlayStore((s) => s.activeOverlays.has('wind'));
  if (!hasWind) return null;
  return <WindControls />;
}

// ─── MapPanel entry point — delegates to 2D or 3D based on global mapMode ────

export const MapPanel = React.memo(function MapPanel() {
  const mapMode = useEditModeStore((s) => s.mapMode);

  if (mapMode === '3d') {
    return <TelemetryMap3D />;
  }

  return <TelemetryMap2D />;
});

// ─── Mission overlays (read-only) ────────────────────────────────────────────
// Self-subscribed to the mission store so live telemetry ticks (position,
// attitude, vfrHud - several per second) can't re-render it. Without this, a
// large mission re-maps every waypoint marker and rebuilds every DivIcon on
// every telemetry frame, which is what made the telemetry map lag on big KMLs.
// React.memo + no props means the parent's telemetry re-renders bail out here.
const MissionOverlays = React.memo(function MissionOverlays() {
  const { missionItems, homePosition: missionHome, currentSeq } = useMissionStore();

  const waypoints = useMemo(() =>
    missionItems.filter(item =>
      commandHasLocation(item.command) && hasValidCoordinates(item.latitude, item.longitude)
    ),
    [missionItems]
  );
  const ghostTakeoffItems = useMemo(() =>
    missionItems.filter(item =>
      item.command === MAV_CMD.NAV_TAKEOFF && !hasValidCoordinates(item.latitude, item.longitude)
    ),
    [missionItems]
  );
  const missionPath = useMemo(() => buildMissionPath(waypoints), [waypoints]);

  // Small missions: a numbered pin per waypoint. Large/auto-generated missions:
  // only the live target, route start/end, and meaningful commands keep a pin -
  // the rest are noise and the path already shows them. See mission-markers.ts.
  const markerPins = useMemo(
    () => splitMissionMarkers(waypoints, currentSeq).pins,
    [waypoints, currentSeq],
  );

  return (
    <>
      {/* Mission path - single polyline with curves through spline waypoints */}
      {missionPath.positions.length > 1 && (
        <Polyline
          positions={missionPath.positions}
          pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.8 }}
        />
      )}

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
            radius={Math.abs(wp.param3)}
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

      {/* Mission home marker */}
      {missionHome && (
        <Marker
          position={[missionHome.lat, missionHome.lon]}
          icon={MISSION_HOME_ICON}
          zIndexOffset={-1000}
        />
      )}

      {/* TAKEOFF (placeholder coords) rendered at mission home */}
      {missionHome && ghostTakeoffItems.map((wp) => (
        <Marker
          key={`takeoff-${wp.seq}`}
          position={[missionHome.lat, missionHome.lon]}
          icon={TAKEOFF_AT_HOME_ICON}
          zIndexOffset={-500}
        />
      ))}

      {/* Waypoint markers (read-only). Small missions get a numbered pin each;
          large missions get only key waypoints + start/end + the live target. */}
      {markerPins.map(({ wp, role }) => (
        <Marker
          key={wp.seq}
          position={[wp.latitude, wp.longitude]}
          icon={
            role === 'start'
              ? START_ICON
              : role === 'end'
                ? END_ICON
                : createWaypointIcon(wp, wp.seq === currentSeq)
          }
          zIndexOffset={role === 'current' ? 1000 : 0}
        />
      ))}

      {/* Geofence overlays (read-only) */}
      <FenceMapOverlay readOnly />

      {/* Rally point overlays (read-only) */}
      <RallyMapOverlay readOnly />
    </>
  );
});

// ─── 2D Telemetry Map ────────────────────────────────────────────────────────

const TelemetryMap2D = React.memo(function TelemetryMap2D() {
  // Use selective subscriptions to prevent re-renders on unrelated telemetry updates
  const gps = useTelemetryStore((s) => s.gps);
  const position = useTelemetryStore((s) => s.position);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const flight = useTelemetryStore((s) => s.flight);
  const attitude = useTelemetryStore((s) => s.attitude);
  const battery = useTelemetryStore((s) => s.battery);
  const wind = useTelemetryStore((s) => s.wind);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const [followVehicle, setFollowVehicle] = useState(true);
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [homePosition, setHomePosition] = useState<[number, number] | null>(null);
  const sharedMapLayer = useEditModeStore((s) => s.mapLayer);
  const setSharedMapLayer = useEditModeStore((s) => s.setMapLayer);
  // Use shared layer if it's a valid 2D key, otherwise fall back to 'googleSat'
  const currentLayer: TelemetryLayerKey = (sharedMapLayer in TELEMETRY_LAYERS ? sharedMapLayer : 'googleSat') as TelemetryLayerKey;
  const setCurrentLayer = (layer: TelemetryLayerKey) => setSharedMapLayer(layer);
  const [showHeadingLine, setShowHeadingLine] = useState(true);
  const [showCompass, setShowCompass] = useState(true);
  const [showAttitude, setShowAttitude] = useState(true);
  const [showMission, setShowMission] = useState(true); // Show mission overlays by default
  const [showTerrain, setShowTerrain] = useState(false);
  const [elevationRange, setElevationRange] = useState<ElevationRange>({ min: 0, max: 0 });
  const [terrainAutoRange, setTerrainAutoRange] = useState(true);
  const [terrainFixedRange, setTerrainFixedRange] = useState<ElevationRange>({ min: 0, max: 1500 });
  const [terrainRelativeMode, setTerrainRelativeMode] = useState(false);
  const [headingLineLength, setHeadingLineLength] = useState(100); // meters
  const [mapBounds, setMapBounds] = useState<{ north: number; south: number; east: number; west: number } | null>(null);
  const handleBoundsChange = useCallback((b: { north: number; south: number; east: number; west: number }) => setMapBounds(b), []);
  const lastUpdateRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Mission store - only what the large-mission badge below needs. The actual
  // mission overlays render in <MissionOverlays/>, which self-subscribes so
  // telemetry re-renders can't rebuild its markers.
  const { missionItems, currentSeq } = useMissionStore();

  // Filter to only items with real coordinates (badge counts what gets thinned).
  const waypoints = useMemo(() =>
    missionItems.filter(item =>
      commandHasLocation(item.command) && hasValidCoordinates(item.latitude, item.longitude)
    ),
    [missionItems]
  );

  // Whether the mission is large enough that we collapse plain waypoints to
  // key markers only (drives the explanatory badge). Same split the overlay uses.
  const markersSemantic = useMemo(
    () => splitMissionMarkers(waypoints, currentSeq).semantic,
    [waypoints, currentSeq],
  );

  // IP geolocation fallback (used when GPS not available)
  const [ipLocation] = useIpLocation();

  // Default position - use IP location if available, otherwise fallback to London
  const defaultPosition = useMemo<[number, number]>(
    () => ipLocation ? [ipLocation.lat, ipLocation.lon] : [51.505, -0.09],
    [ipLocation]
  );

  // Get current position from GPS data
  const hasValidGps = gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0;
  const gpsPosition = useMemo<[number, number] | null>(
    () => hasValidGps ? [gps.lat, gps.lon] : null,
    [hasValidGps, gps.lat, gps.lon]
  );

  // Vehicle display position - use GPS if available, otherwise use home, then IP location
  const vehiclePosition = useMemo<[number, number]>(
    () => gpsPosition || homePosition || defaultPosition,
    [gpsPosition, homePosition, defaultPosition]
  );

  // Selection state
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const VEHICLE_ID = 'vehicle-1';

  // Tactical icon properties
  const tacticalClass = mavTypeToTacticalClass(connectionState.mavType);
  const vehicleState: VehicleState = useMemo(() => {
    if (flight.armed && battery.remaining > 0 && battery.remaining < 20) return 'critical';
    if (flight.armed && gps.fixType < 2) return 'critical';
    if (flight.armed) return 'armed';
    return 'disarmed';
  }, [flight.armed, battery.remaining, gps.fixType]);

  const isSelected = selectedVehicleId === VEHICLE_ID;

  // Icon is only rebuilt when stable props change (state, mode, selection, vehicle class).
  // Heading/speed/alt are updated via cheap DOM mutations to avoid flicker.
  const tacticalIcon = useMemo(
    () => createTacticalVehicleIcon({
      vehicleClass: tacticalClass,
      state: vehicleState,
      selected: isSelected,
      mode: flight.mode,
    }),
    [tacticalClass, vehicleState, isSelected, flight.mode],
  );

  // Ref to the Leaflet marker for DOM-based updates
  const vehicleMarkerRef = useRef<L.Marker | null>(null);

  // Update heading/speed/alt via DOM manipulation - no icon rebuild, no flicker
  useEffect(() => {
    const marker = vehicleMarkerRef.current;
    if (!marker) return;
    const el = marker.getElement();
    if (!el) return;
    updateTacticalIconDOM(el, {
      heading: vfrHud.heading,
      groundspeed: vfrHud.groundspeed,
      speedText: formatSpeedFromMetersPerSecond(vfrHud.groundspeed, speedUnit),
      altitudeAgl: position.relativeAlt,
      altitudeText: formatAltitudeFromMeters(position.relativeAlt, altitudeUnit),
      windDirection: wind.direction,
      windSpeed: wind.speed,
    }, tacticalClass === 'antenna');
    // tacticalIcon is in deps so that whenever the icon DOM is regenerated
    // (e.g. selection change rebuilds it with reset rotation), we reapply
    // the current heading immediately - prevents a brief flip-to-north flicker.
  }, [vfrHud.heading, vfrHud.groundspeed, position.relativeAlt, altitudeUnit, speedUnit, wind.direction, wind.speed, tacticalClass, tacticalIcon]);

  // Calculate distance and bearing to home
  const homeStats = useMemo(() => {
    if (!homePosition) return null;
    const distance = calculateDistance(
      vehiclePosition[0], vehiclePosition[1],
      homePosition[0], homePosition[1]
    );
    const bearing = calculateBearing(
      vehiclePosition[0], vehiclePosition[1],
      homePosition[0], homePosition[1]
    );
    return { distance, bearing };
  }, [vehiclePosition, homePosition]);

  // Update trail with position history (only when GPS is valid)
  // Reduced trail limit from 500 to 100 points (~50 seconds at 2Hz) for better performance
  useEffect(() => {
    if (gpsPosition && hasValidGps) {
      const now = Date.now();
      if (now - lastUpdateRef.current > 500) {
        lastUpdateRef.current = now;
        setTrail(prev => {
          const newTrail = [...prev, gpsPosition];
          if (newTrail.length > 100) {
            return newTrail.slice(-100);
          }
          return newTrail;
        });

        // Set home on first valid GPS fix
        setHomePosition(prev => prev ?? gpsPosition);
      }
    }
  }, [gpsPosition, hasValidGps]); // Removed homePosition from deps - it's only read, not a condition

  // Disable follow when user manually interacts with the map
  const handleUserMapInteraction = useCallback(() => {
    setFollowVehicle(false);
  }, []);

  // Command popup is local UI state — only relevant while the popover is up.
  const [commandPopup, setCommandPopup] = useState<{ lat: number; lon: number } | null>(null);
  // Active target lives in a global store so it survives 2D ↔ 3D switches and
  // panel remounts, and so the 3D map can render the same overlay. Keyed by
  // vehicle id (currently always SELF) for future multi-vehicle support.
  const activeTarget = useSelfActiveTarget();
  const setActiveTarget = useCallback((next: ActiveCommandTarget | null) => {
    useCommandTargetStore.getState().setTarget(SELF_VEHICLE_ID, next);
  }, []);

  // Escape key: close popup first, then deselect vehicle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (commandPopup) {
          setCommandPopup(null);
        } else {
          setSelectedVehicleId(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPopup]);

  // Right-click handler: open go-to popup (only when vehicle selected AND armed)
  const handleMapContextMenu = useCallback((lat: number, lon: number) => {
    if (!selectedVehicleId) return;
    if (!useTelemetryStore.getState().flight.armed) return; // safety: no commands when disarmed
    setCommandPopup({ lat, lon });
  }, [selectedVehicleId]);

  // Command confirm: dispatch the chosen MapCommand and visualize the target.
  // The popup decides the dispatch path (native vs script) and passes through
  // here so we don't duplicate that decision.
  //
  // Script→Native handoff: if the previously-active target was script-managed
  // (orbit / spiral / POI / watchtower / climb-RTL) the script keeps pushing
  // set_target_location every tick. Any subsequent NATIVE command (Move /
  // Land / native DO_ORBIT) will appear ignored unless we first send STOP to
  // the script's USER_1 dispatcher. We do this transparently here based on
  // the prior activeTarget.
  const handleCommandConfirm = useCallback(async (command: MapCommand, options?: { preferScript?: boolean }) => {
    // Safety: verify still armed before sending any flight command
    if (!useTelemetryStore.getState().flight.armed) {
      setCommandPopup(null);
      return;
    }
    const prev = useCommandTargetStore.getState().getTarget(SELF_VEHICLE_ID);
    const prevWasScriptHeld = !!prev && (
      prev.type === 'orbit' || prev.type === 'spiral' ||
      prev.type === 'watchtower' || prev.type === 'climbRtl' ||
      prev.type === 'reveal' || prev.type === 'strafe'
    );
    const newIsNative =
      command.type === 'goto' ||
      command.type === 'land' ||
      (command.type === 'orbit' && !options?.preferScript);
    const stopScriptFirst = prevWasScriptHeld && newIsNative;
    const result = await dispatchMapCommand(command, { ...options, stopScriptFirst });
    if (result.success) {
      // ActiveTarget mirrors the issued command's variant for correct overlay rendering.
      if (command.type === 'goto') {
        setActiveTarget({ type: 'goto', lat: command.lat, lon: command.lon, alt: command.alt });
      } else if (command.type === 'orbit') {
        setActiveTarget({ type: 'orbit', lat: command.lat, lon: command.lon, alt: command.alt, radius: command.radius });
      } else if (command.type === 'spiral') {
        setActiveTarget({
          type: 'spiral', lat: command.lat, lon: command.lon, radius: command.radius,
          startAlt: command.startAlt, targetAlt: command.targetAlt,
        });
      } else if (command.type === 'watchtower') {
        setActiveTarget({ type: 'watchtower', lat: command.lat, lon: command.lon, alt: command.alt, yawRate: command.yawRate });
      } else if (command.type === 'climbRtl') {
        setActiveTarget({ type: 'climbRtl', targetAlt: command.targetAlt });
      } else if (command.type === 'reveal') {
        setActiveTarget({
          type: 'reveal', lat: command.lat, lon: command.lon, alt: command.alt,
          pullbackDist: command.pullbackDist,
        });
      } else if (command.type === 'strafe') {
        setActiveTarget({
          type: 'strafe', lat: command.lat, lon: command.lon, alt: command.alt,
          offsetDist: command.offsetDist, length: command.length,
        });
      } else {
        setActiveTarget({ type: 'land', lat: command.lat, lon: command.lon });
      }
    }
    setCommandPopup(null);
  }, []);

  const handleCommandCancel = useCallback(() => {
    setCommandPopup(null);
  }, []);

  // Clear active target based on command type:
  //  - goto:  mode != GUIDED, OR vehicle within 5m of target (arrived)
  //  - orbit/spiral/watchtower: mode != GUIDED (script keeps running otherwise)
  //  - climbRtl: mode != GUIDED && != RTL (RTL is the expected next mode)
  //  - land:  mode != GUIDED && mode != LAND (LAND is the expected next mode)
  useEffect(() => {
    if (!activeTarget) return;
    const modeUpper = flight.mode.toUpperCase();

    if (activeTarget.type === 'land') {
      if (modeUpper !== 'GUIDED' && modeUpper !== 'LAND') setActiveTarget(null);
      return;
    }
    if (activeTarget.type === 'climbRtl') {
      if (modeUpper !== 'GUIDED' && modeUpper !== 'RTL') setActiveTarget(null);
      return;
    }
    if (modeUpper !== 'GUIDED') {
      setActiveTarget(null);
      return;
    }
    if (activeTarget.type === 'goto') {
      const dist = calculateDistance(
        vehiclePosition[0], vehiclePosition[1],
        activeTarget.lat, activeTarget.lon,
      );
      if (dist < 5) setActiveTarget(null);
    }
  }, [activeTarget, flight.mode, vehiclePosition]);

  const clearTrail = useCallback(() => {
    setTrail([]);
  }, []);

  const setHome = useCallback(() => {
    if (gpsPosition) {
      setHomePosition(gpsPosition);
    }
  }, [gpsPosition]);

  // Center on vehicle + re-enable follow
  const handleCenterOnVehicle = useCallback(() => {
    setFollowVehicle(true);
  }, []);

  const layer = TELEMETRY_LAYERS[currentLayer];

  return (
    <div ref={containerRef} data-tour="telemetry-map" className="h-full w-full flex flex-col bg-surface-base relative">
      {/* Large-mission notice: plain waypoints carry no useful number and stack
          into an unreadable cluster, so we show only the route's start/end, the
          live target, and key commands. The full flight path is still drawn. */}
      {showMission && markersSemantic && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-900/90 border border-white/10 shadow-md backdrop-blur-sm text-[11px] text-gray-100 pointer-events-none whitespace-nowrap">
          <svg className="w-3.5 h-3.5 text-blue-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Large mission: showing key waypoints (launch, turns, landing) and the live target - the full flight path is drawn.
          </span>
        </div>
      )}
      {/* Top toolbar */}
      <div data-tour="telemetry-map-overlays" className="absolute top-2 right-2 z-[1000] flex flex-col gap-1">
        <MapLayersControl
          baseLayers={Object.keys(TELEMETRY_LAYERS) as LayerKey[]}
          activeLayer={currentLayer}
          onSelectLayer={(k) => setCurrentLayer(k as TelemetryLayerKey)}
          showTerrain={showTerrain}
          onToggleTerrain={() => setShowTerrain(!showTerrain)}
          extra={<OfflineAreaDownload bounds={mapBounds} activeLayer={currentLayer} />}
        />
        <button
          onClick={() => setFollowVehicle(!followVehicle)}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
            followVehicle
              ? 'bg-blue-600 text-white'
              : 'bg-surface text-content hover:bg-surface-raised'
          }`}
          title={followVehicle ? 'Following vehicle' : 'Free camera'}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" strokeLinecap="round" />
            <line x1="12" y1="18" x2="12" y2="22" strokeLinecap="round" />
            <line x1="2" y1="12" x2="6" y2="12" strokeLinecap="round" />
            <line x1="18" y1="12" x2="22" y2="12" strokeLinecap="round" />
          </svg>
          {followVehicle ? 'Following' : 'Free'}
        </button>
        <button
          onClick={() => setShowHeadingLine(!showHeadingLine)}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
            showHeadingLine
              ? 'bg-blue-600 text-white'
              : 'bg-surface text-content hover:bg-surface-raised'
          }`}
          title="Toggle heading line"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-4 4m4-4l4 4" />
          </svg>
          HDG Line
        </button>
        <button
          onClick={() => setShowCompass(!showCompass)}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
            showCompass
              ? 'bg-blue-600 text-white'
              : 'bg-surface text-content hover:bg-surface-raised'
          }`}
          title="Toggle compass"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <polygon points="16.24,7.76 14.12,14.12 7.76,16.24 9.88,9.88" fill="currentColor" stroke="none" />
          </svg>
          Compass
        </button>
        <button
          onClick={() => setShowAttitude(!showAttitude)}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
            showAttitude
              ? 'bg-blue-600 text-white'
              : 'bg-surface text-content hover:bg-surface-raised'
          }`}
          title="Toggle attitude indicator"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <path strokeLinecap="round" d="M4.93 12h14.14" />
            <path strokeLinecap="round" d="M8 9.5l4-2 4 2" />
          </svg>
          Attitude
        </button>
        <button
          onClick={clearTrail}
          className="px-2 py-1 text-xs rounded bg-surface text-content hover:bg-surface-raised shadow-lg transition-colors flex items-center gap-1.5"
          title="Clear flight trail"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Clear Trail
        </button>
        <button
          onClick={setHome}
          disabled={!hasValidGps}
          className="px-2 py-1 text-xs rounded bg-surface text-content hover:bg-surface-raised shadow-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          title="Set home to current position"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          Set Home
        </button>
        <button
          onClick={() => setShowMission(!showMission)}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
            showMission
              ? 'bg-blue-600 text-white'
              : 'bg-surface text-content hover:bg-surface-raised'
          }`}
          title="Toggle mission overlays (waypoints, geofence, rally)"
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Mission
        </button>
      </div>

      {/* Airspace legend */}
      <AirspaceLegendWrapper />

      {/* Wind timeline bar */}
      <WindControlsWrapper />

      {/* API key dialog */}
      <ApiKeyDialog />

      {/* Compass overlay */}
      {showCompass && <CompassOverlay heading={vfrHud.heading} />}

      {/* Attitude indicator overlay (nav ball) */}
      {showAttitude && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000]">
          {/* Dark background circle */}
          <div className="absolute inset-[-4px] rounded-full bg-surface-overlay-light shadow-xl" />
          <div className="relative">
            <AttitudeIndicator
              roll={attitude.roll}
              pitch={attitude.pitch}
              heading={vfrHud.heading}
              size={140}
            />
          </div>
        </div>
      )}

      {/* GPS status overlay */}
      {!hasValidGps && (
        <div className="absolute top-2 left-2 z-[1000] px-2 py-1 bg-yellow-600/90 text-white text-xs rounded shadow-lg">
          No GPS fix
        </div>
      )}

      {/* Elevation legend (above stats overlay) */}
      {showTerrain && elevationRange.max > 0 && (
        <div className="absolute bottom-[120px] left-2 z-[1000]">
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

      {/* Stats overlay */}
      <div className="absolute bottom-2 left-2 z-[1000] bg-surface-overlay backdrop-blur-sm rounded px-3 py-2 text-xs text-content space-y-1 min-w-[130px] border border-subtle shadow-lg">
        <div className="flex justify-between">
          <span className="text-content-secondary">MSL</span>
          <span className="font-mono text-content">{formatAltitudeFromMeters(position.alt, altitudeUnit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-secondary">Rel</span>
          <span className="font-mono text-content">{formatAltitudeFromMeters(position.relativeAlt, altitudeUnit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-secondary">Spd</span>
          <span className="font-mono text-content">{formatSpeedFromMetersPerSecond(vfrHud.groundspeed, speedUnit)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-content-secondary">Hdg</span>
          <span className="font-mono text-content">{vfrHud.heading.toFixed(0)}<span className="text-content-secondary ml-0.5">°</span></span>
        </div>
        {homeStats && (
          <>
            <div className="border-t border-default my-1" />
            <div className="flex justify-between">
              <span className="text-content-secondary">Home</span>
              <span className="font-mono text-emerald-400">{formatDistance(homeStats.distance, distanceUnit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-content-secondary">Brng</span>
              <span className="font-mono text-emerald-400">{homeStats.bearing.toFixed(0)}<span className="text-content-secondary ml-0.5">°</span></span>
            </div>
          </>
        )}
        {hasValidGps && (
          <>
            <div className="border-t border-default my-1" />
            <div className="text-[10px] text-content-secondary font-mono">
              {gps.lat.toFixed(6)}, {gps.lon.toFixed(6)}
            </div>
          </>
        )}
      </div>

      {/* Center on vehicle FAB — Google Maps style */}
      <button
        onClick={handleCenterOnVehicle}
        className={`absolute bottom-14 right-3 z-[1000] w-9 h-9 rounded-full shadow-lg flex items-center justify-center transition-all ${
          followVehicle
            ? 'bg-blue-600 text-white'
            : 'bg-surface text-content-secondary hover:text-content hover:bg-surface-raised'
        }`}
        title={followVehicle ? 'Following vehicle' : 'Center on vehicle'}
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" />
          <line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" />
          <line x1="18" y1="12" x2="22" y2="12" />
        </svg>
      </button>

      {/* Armed status indicator */}
      <div className={`absolute bottom-2 right-3 z-[1000] px-2 py-1 rounded shadow-lg text-xs font-bold ${
        flight.armed ? 'bg-red-600 text-white' : 'bg-surface text-content-secondary'
      }`}>
        {flight.armed ? 'ARMED' : 'DISARMED'}
      </div>

      {/* Map container */}
      <MapContainer
        center={vehiclePosition}
        zoom={17}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={false}
      >
        <TelemetryViewportSync />
        <MapBoundsTracker onBoundsChange={handleBoundsChange} />
        <TileLayer
          key={currentLayer}
          url={`tile-cache://${currentLayer}/{z}/{x}/{y}.png`}
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

        {/* Map controller for resize handling and following */}
        <MapController
          position={vehiclePosition}
          followVehicle={followVehicle}
          onUserInteraction={handleUserMapInteraction}
          onMapClick={() => { setSelectedVehicleId(null); setCommandPopup(null); }}
          onContextMenu={handleMapContextMenu}
          containerRef={containerRef}
        />

        {/* Flight trail */}
        {trail.length > 1 && (
          <>
            {/* Dark outline for contrast */}
            <Polyline
              positions={trail}
              pathOptions={{
                color: '#000',
                weight: 5,
                opacity: 0.4,
              }}
            />
            {/* Main trail */}
            <Polyline
              positions={trail}
              pathOptions={{
                color: '#a855f7', // Purple for trail
                weight: 3,
                opacity: 0.9,
              }}
            />
          </>
        )}

        {/* Home to vehicle line */}
        {homePosition && homeStats && homeStats.distance > 5 && (
          <HomeLine vehiclePosition={vehiclePosition} homePosition={homePosition} />
        )}

        {/* Heading line - speed proportional */}
        {showHeadingLine && (
          <HeadingLine
            position={vehiclePosition}
            heading={vfrHud.heading}
            groundspeed={vfrHud.groundspeed}
            armed={flight.armed}
          />
        )}

        {/* Home marker */}
        {homePosition && (
          <Marker position={homePosition} icon={homeIcon} />
        )}

        {/* ======= MISSION OVERLAYS (read-only) ======= */}
        {/* Self-subscribed + memoized so live telemetry re-renders don't rebuild
            every waypoint marker/DivIcon. See MissionOverlays above. */}
        {showMission && <MissionOverlays />}
        {/* ======= END MISSION OVERLAYS ======= */}

        {/* Map overlays (self-subscribed to avoid re-rendering terrain) */}
        <MapOverlayLayers baseLayer={currentLayer} />

        {/* Vehicle marker - tactical icon */}
        <Marker
          ref={vehicleMarkerRef}
          position={vehiclePosition}
          zIndexOffset={5000}
          icon={tacticalIcon}
          eventHandlers={{
            click: (e) => {
              L.DomEvent.stopPropagation(e.originalEvent);
              setSelectedVehicleId(prev => prev === VEHICLE_ID ? null : VEHICLE_ID);
            },
          }}
        />

        {/* Imperative command layer - popup/target/line managed via refs, immune to re-renders */}
        <CommandLayer
          commandPopup={commandPopup}
          activeTarget={activeTarget}
          vehiclePosition={vehiclePosition}
          onConfirm={handleCommandConfirm}
          onCancel={handleCommandCancel}
        />
      </MapContainer>
    </div>
  );
});
