import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents, Circle } from 'react-leaflet';
import { ModuleMapLayers } from './ModuleMapLayers';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useMissionStore } from '../../stores/mission-store';
import { commandHasLocation, hasValidCoordinates, MAV_CMD, type MissionItem } from '../../../shared/mission-types';
import { splitMissionMarkers } from '../../utils/mission-markers';
import { useIpLocation } from '../../utils/ip-geolocation';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useSettingsStore } from '../../stores/settings-store';
import { Mission3DPanel } from '../mission/Mission3DPanel';
import { TAKEOFF_AT_HOME_ICON } from '../mission/takeoff-icon';
import { createTacticalVehicleIcon, updateTacticalIconDOM } from '../map/TacticalVehicleIcon';
import { FleetMarkers } from '../fleet/FleetMarkers';
import { MissionPathsToggle } from '../fleet/MissionPathsToggle';
import { OfflineCacheBox } from '../map/OfflineCacheBox';
import { OfflineCachePanel } from '../map/OfflineCachePanel';
import { useTelemMapBoundsStore } from '../../stores/telem-map-bounds-store';
import { deselectActiveVehicle } from '../../hooks/useFleet';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useMessagesStore } from '../../stores/messages-store';
import { isFleetCommandTarget } from '../../lib/command-target';
import { useVehicleColor } from '../../stores/vehicle-appearance-store';
import { useTelemMissionViewStore } from '../../stores/telem-mission-view-store';
import { mavTypeToTacticalClass, type VehicleState } from '../map/tactical-icon-pool';
import { dispatchMapCommand, type ActiveCommandTarget, type MapCommand } from '../map/map-command-types';
import { useCommandTargetStore, useActiveVehicleTarget, commandTargetKey } from '../../stores/command-target-store';
import { useImperativeMapLayer } from '../map/ImperativeMapLayer';
import { MapCommandPopup } from '../map/MapCommandPopup';
import { SmoothWheelZoom } from '../map/SmoothWheelZoom';
import { useDraggableOverlay } from '../map/useDraggableOverlay';
import { createPortal } from 'react-dom';
import { computeOffsetPosition } from '../../utils/geo-offset';
import { getElevation } from '../../utils/elevation-api';
import { formatAltitudeFromMeters, formatDistanceFromMeters, formatSpeedFromMetersPerSecond, type DistanceUnit } from '../../../shared/user-units.js';

// Geofence and Rally overlays (read-only in telemetry view)
import { FenceMapOverlay } from '../geofence/FenceMapOverlay';
import { RallyMapOverlay } from '../rally/RallyMapOverlay';

// Live survey execution progress (path tint + cell states + readout card)
import { SurveyProgressOverlay, SurveyProgressCard } from '../survey/SurveyProgressOverlay';

// Terrain elevation overlay
import { TerrainOverlayLayer, type ElevationRange } from '../map/TerrainOverlayLayer';
import { ElevationLegend } from '../map/ElevationLegend';

// Offline map download

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
import { InstrumentsLayer, SingleMapInstrument } from '../map/instruments/InstrumentsLayer';
import { PRESET_INSTRUMENT_LAYOUTS } from '../map/instruments/preset-layouts';
import { InstrumentsMenu } from '../map/instruments/InstrumentsMenu';
import { useMapHomeStore } from '../map/instruments/registry';
import { useMapInstrumentsStore, resolveInstrumentVisible } from '../../stores/map-instruments-store';
import { WindParticleOverlay } from '../map/overlays/WindParticleOverlay';
import { TrafficOverlay } from '../map/overlays/TrafficOverlay';
import { CameraFootprintOverlay } from '../map/overlays/CameraFootprintOverlay';
import { MissionWaypointDotsLayer } from '../map/overlays/MissionWaypointDotsLayer';
import { TrafficAltitudeFilter } from '../map/overlays/TrafficAltitudeFilter';
import { ZoneAlertBanner } from '../map/overlays/ZoneAlertBanner';
import { WindControls } from '../map/overlays/WindControls';
import { WindRoseCard } from '../map/overlays/WindRoseCard';
import { ApiKeyDialog } from '../map/overlays/ApiKeyDialog';
import { useOverlayStore } from '../../stores/overlay-store';
import { useMapSplitStore, MAP_SPLIT_RATIO_MIN, MAP_SPLIT_RATIO_MAX } from '../../stores/map-split-store';
import { PANEL_COMPONENTS, PANEL_RENDERERS, type PanelId } from './index';

const TELEMETRY_LAYERS = {
  osm: MAP_LAYERS.osm,
  satellite: MAP_LAYERS.satellite,
  googleSat: MAP_LAYERS.googleSat,
  googleHybrid: MAP_LAYERS.googleHybrid,
  bingSat: MAP_LAYERS.bingSat,
  bingHybrid: MAP_LAYERS.bingHybrid,
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

// Create waypoint marker icon (read-only display). `groupColor`, when given,
// rings the marker in that group's (vehicle's) identity colour so a fleet's
// per-vehicle waypoints are distinguishable at a glance; the fill still encodes
// the command type.
function createWaypointIcon(wp: MissionItem, isCurrent: boolean, groupColor?: string): L.DivIcon {
  const baseColor = getCommandColor(wp.command);
  const bgColor = isCurrent ? '#f59e0b' : baseColor;
  const size = isCurrent ? 28 : 24;
  const shape = getCommandShape(wp.command);
  const displayText = shape || (wp.seq + 1).toString();
  const borderColor = isCurrent ? '#fbbf24' : (groupColor ?? 'rgba(255,255,255,0.8)');
  const borderWidth = isCurrent ? 3 : (groupColor ? 3 : 2);

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

// Camera ROI target: amber reticle with a small lens dot. Marks the ground
// point the gimbal is locked onto (distinct from the cyan Move / violet Orbit
// targets so it reads as "camera", not "fly here").
const ROI_TARGET_ICON = L.divIcon({
  className: '',
  html: `
    <div style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 0 6px rgba(245,158,11,0.85));">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round">
        <circle cx="13" cy="13" r="6" fill="none" stroke="#f59e0b" stroke-width="1.5"/>
        <circle cx="13" cy="13" r="1.8" fill="#f59e0b"/>
        <line x1="13" y1="1.5" x2="13" y2="5"/>
        <line x1="13" y1="21" x2="13" y2="24.5"/>
        <line x1="1.5" y1="13" x2="5" y2="13"/>
        <line x1="21" y1="13" x2="24.5" y2="13"/>
      </svg>
    </div>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
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

// ── Vehicle-authoritative guided target ─────────────────────────────────────
// POSITION_TARGET_GLOBAL_INT (87) is the autopilot's own broadcast of its
// active guided destination, so a goto commanded by ANY GCS on the link
// (phone, second laptop) renders here with no app-to-app sync.
const GUIDED_TARGET_MAX_AGE_MS = 5000;

/** Fresh, position-valid vehicle-broadcast guided target, else null. */
function useVehicleGuidedTarget(): { lat: number; lon: number; alt: number } | null {
  const guidedTarget = useTelemetryStore((s) => s.guidedTarget);
  const mode = useTelemetryStore((s) => s.flight.mode);
  // Re-check freshness on a timer: ArduPilot stops broadcasting once the
  // target clears, so there is no store update left to trigger the age-out.
  const [, setAgeTick] = useState(0);
  useEffect(() => {
    if (!guidedTarget) return;
    const id = setInterval(() => setAgeTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [guidedTarget]);
  if (!guidedTarget) return null;
  if (Date.now() - guidedTarget.receivedAt > GUIDED_TARGET_MAX_AGE_MS) return null;
  // Position bits ignored, or the all-zero placeholder: not a spatial target.
  if ((guidedTarget.typeMask & 0x3) !== 0) return null;
  if (guidedTarget.lat === 0 && guidedTarget.lon === 0) return null;
  // The autopilot broadcasts wp targets in AUTO / RTL too; only guided-family
  // modes represent a commanded goto (the mission overlay covers the rest).
  if (!mode.toUpperCase().includes('GUIDED')) return null;
  return { lat: guidedTarget.lat, lon: guidedTarget.lon, alt: guidedTarget.alt };
}

/**
 * Merge the locally-issued command target with the vehicle broadcast for
 * display. For plain gotos the broadcast wins: it is the FC's accepted truth
 * and echoes desktop-issued gotos at (approximately) the same spot, so
 * rendering only it also dedupes the local marker. Script-held / multi-shape
 * commands (orbit, spiral, land, ...) keep the richer local overlay; their
 * broadcast is just the script's per-tick moving setpoint.
 */
function mergeGuidedTarget(
  local: ActiveCommandTarget | null,
  vehicle: { lat: number; lon: number; alt: number } | null,
): ActiveCommandTarget | null {
  if (!vehicle) return local;
  if (local && local.type !== 'goto') return local;
  return { type: 'goto', lat: vehicle.lat, lon: vehicle.lon, alt: vehicle.alt };
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
  roiTarget,
  onConfirm,
  onCancel,
  onSetRoi,
  onClearRoi,
}: {
  commandPopup: { lat: number; lon: number } | null;
  activeTarget: ActiveCommandTarget | null;
  vehiclePosition: [number, number];
  roiTarget: { lat: number; lon: number } | null;
  onConfirm: (command: MapCommand) => void;
  onCancel: () => void;
  onSetRoi: (lat: number, lon: number) => void;
  onClearRoi: () => void;
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

  // --- Camera ROI marker (independent of the flight-command target) ---
  useEffect(() => {
    if (!roiTarget) {
      layer.remove('cmd-roi');
      return;
    }
    layer.marker('cmd-roi', [roiTarget.lat, roiTarget.lon], { icon: ROI_TARGET_ICON });
    return () => layer.remove('cmd-roi');
  }, [roiTarget, layer]);

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
      onSetRoi={onSetRoi}
      onClearRoi={onClearRoi}
      hasRoi={roiTarget !== null}
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
  onSetRoi: (lat: number, lon: number) => void;
  onClearRoi: () => void;
  hasRoi: boolean;
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
  onSetRoi,
  onClearRoi,
  hasRoi,
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
      className="tactical-command-popup fixed z-[2000] pointer-events-auto rounded-xl shadow-2xl border border-strong bg-surface-overlay backdrop-blur-md p-2 w-[300px]"
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
        onSetRoi={onSetRoi}
        onClearRoi={onClearRoi}
        hasRoi={hasRoi}
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

// Split control. Sets the in-map split target: the chosen panel shares the map
// panel's content area (map on the left, panel on the right, draggable divider
// between) while the floating instruments overlay stays on top of BOTH halves.
// The split lives entirely inside MapPanel (see SplitDivider / SecondSurface) so
// there is no dockview involvement here. Vision leads as the suggested split.
function SplitControl() {
  const [isOpen, setIsOpen] = useState(false);
  const target = useMapSplitStore((s) => s.target);
  const setTarget = useMapSplitStore((s) => s.setTarget);

  // Splittable panels: everything in the registry we have a renderer for,
  // except the map itself. Vision leads.
  const options = useMemo(() => {
    const ids = (Object.keys(PANEL_COMPONENTS) as PanelId[]).filter(
      (id) => id !== 'map' && PANEL_RENDERERS[id],
    );
    ids.sort((a, b) => (a === 'camera' ? -1 : b === 'camera' ? 1 : 0));
    return ids;
  }, []);

  return (
    <div className="relative">
      {/* w-full so this wrapped button stretches to the flex column's width like
          the plain sibling buttons; icon-left/label-after (no justify-center) so
          the whole column shares one left-aligned icon-then-text layout. */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
          target ? 'bg-blue-600 text-white' : 'bg-surface text-content hover:bg-surface-raised'
        }`}
        data-tip={target ? `Split with ${PANEL_COMPONENTS[target].title}` : 'Split the map with another panel'}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <line x1="12" y1="4" x2="12" y2="20" />
        </svg>
        {target ? PANEL_COMPONENTS[target].title : 'Split'}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-[999]" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-surface-solid border border-subtle rounded shadow-xl z-[1000] py-1 min-w-[160px] max-h-[320px] overflow-y-auto">
            {target && (
              <>
                <button
                  onClick={() => {
                    setTarget(null);
                    setIsOpen(false);
                  }}
                  className="w-full px-3 py-1.5 text-left text-xs text-content hover:bg-surface-raised transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Close split
                </button>
                <div className="my-1 border-t border-subtle" />
              </>
            )}
            {options.map((id) => (
              <button
                key={id}
                onClick={() => {
                  setTarget(id);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                  id === target ? 'bg-blue-600 text-white' : 'text-content hover:bg-surface-raised'
                }`}
              >
                Split with {PANEL_COMPONENTS[id].title}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Second surface rendered in the right half of the split. Resolves the chosen
// panel id to its component (prop-free, like dockview renders them) and lets it
// fill the half. Renders nothing for an unknown id.
function SecondSurface({ panelId }: { panelId: PanelId }) {
  const Component = PANEL_RENDERERS[panelId];
  if (!Component) return null;
  return (
    <div className="h-full w-full overflow-hidden bg-surface">
      <Component />
    </div>
  );
}

// Draggable divider between the map half and the second surface. Reports the new
// map (left) fraction as the pointer moves, computed against the content row's
// width. A clear button sits at the top so the operator can unsplit from here.
function SplitDivider({
  rowRef,
  onRatio,
  onDragEnd,
  onClose,
}: {
  rowRef: React.RefObject<HTMLDivElement>;
  onRatio: (ratio: number) => void;
  onDragEnd: () => void;
  onClose: () => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);

    const handleMove = (ev: PointerEvent) => {
      const row = rowRef.current;
      if (!row) return;
      const rect = row.getBoundingClientRect();
      if (rect.width <= 0) return;
      onRatio((ev.clientX - rect.left) / rect.width);
    };
    const handleUp = (ev: PointerEvent) => {
      (e.target as HTMLElement).releasePointerCapture?.(ev.pointerId);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      setDragging(false);
      onDragEnd();
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [rowRef, onRatio, onDragEnd]);

  return (
    <div
      onPointerDown={handlePointerDown}
      // Under the docked instruments (z-1000), which overhang the map pane.
      className={`group relative z-[900] w-1.5 h-full shrink-0 cursor-col-resize flex items-stretch justify-center ${
        dragging ? 'bg-blue-500' : 'bg-subtle hover:bg-blue-500/60'
      } transition-colors`}
      data-tip="Drag to resize, or use the X to close the split"
    >
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onClose}
        className="absolute top-2 left-1/2 -translate-x-1/2 z-[901] w-5 h-5 rounded-full bg-surface-solid border border-subtle text-content-secondary hover:text-content hover:bg-surface-raised shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        data-tip="Close split"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Captures the Leaflet map instance for the parent so it can invalidateSize()
// when the map half's width changes (split toggle / divider drag), which Leaflet
// needs or the map paints grey.
function MapRefBridge({ mapRef }: { mapRef: React.MutableRefObject<L.Map | null> }) {
  const map = useMap();
  useEffect(() => {
    mapRef.current = map;
    return () => {
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [map, mapRef]);
  return null;
}

// Compass overlay. 3D view only: the 2D map replaced it with the 'heading'
// round gauge instrument (map-instruments-store).
function CompassOverlay({ heading }: { heading: number }) {
  const dragOverlay = useDraggableOverlay('compass');
  return (
    <div
      ref={dragOverlay.ref}
      style={dragOverlay.style}
      onPointerDown={dragOverlay.onPointerDown}
      className="absolute top-2 left-1/2 -translate-x-1/2 z-[1000]"
    >
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

// The split-view layout flow (mobile FPV parity): ask on first entry, then
// follow the remembered choice.
const SPLIT_LAYOUT_MODE_KEY = 'map-split-layout-mode'; // ask | split | off
const SPLIT_LAYOUT_SOURCE_KEY = 'map-split-layout-source'; // preset | custom
const SPLIT_LAYOUT_CUSTOM_KEY = 'map-split-layout-custom'; // captured snapshot

function resolveSplitProfile() {
  const store = useMapInstrumentsStore.getState();
  const savedNames = Object.keys(store.savedLayouts);
  const savedName =
    savedNames.find((n) => n.trim().toLowerCase() === 'split') ??
    savedNames.find((n) => n.trim().toLowerCase().includes('split'));
  return savedName
    ? store.savedLayouts[savedName]!
    : PRESET_INSTRUMENT_LAYOUTS.find((p) => p.name === 'Split cockpit')?.layout ?? null;
}

/** First-entry prompt for the in-map split: pick the split layout treatment,
 * optionally remembering it (mirrors mobile's camera-view prompt). */
function SplitLayoutPrompt({ onChoose }: { onChoose: (action: 'preset' | 'current' | 'keep', remember: boolean) => void }) {
  const [remember, setRemember] = useState(false);
  const opt = (title: string, sub: string, action: 'preset' | 'current' | 'keep') => (
    <button
      type="button"
      onClick={() => onChoose(action, remember)}
      className="w-full text-left px-3.5 py-2.5 rounded-lg border border-default hover:bg-surface-raised transition-colors"
    >
      <div className="text-sm font-medium text-content">{title}</div>
      <div className="text-xs text-content-tertiary">{sub}</div>
    </button>
  );
  return (
    <div className="absolute inset-0 z-[1500] flex items-center justify-center bg-black/40" onClick={() => onChoose('keep', false)}>
      <div className="w-[390px] rounded-xl bg-surface-solid border border-strong shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="text-sm font-semibold text-content">Split view layout</div>
        <div className="mt-0.5 text-xs text-content-secondary">Switch the instruments to a layout sized for the half-width map?</div>
        <div className="mt-3 space-y-2">
          {opt('Use split preset', 'The split cockpit layout (a saved layout named "split" wins)', 'preset')}
          {opt('Use my current layout', 'Keep what is on screen as the split layout', 'current')}
          {opt('Keep current, do not switch', 'Leave the layout as it is', 'keep')}
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-content-secondary cursor-pointer select-none">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="accent-blue-600" />
          Remember my choice
        </label>
      </div>
    </div>
  );
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
  // The nav ball is the 'attitude' registry instrument; 3D mounts just it.
  const showAttitude = useMapInstrumentsStore((s) => resolveInstrumentVisible(s.visible, 'attitude'));
  const toggleInstrument = useMapInstrumentsStore((s) => s.toggle);
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
  const localTarget3D = useActiveVehicleTarget();
  const vehicleGuidedTarget3D = useVehicleGuidedTarget();
  const activeTarget3D = mergeGuidedTarget(localTarget3D, vehicleGuidedTarget3D);
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
          {toggleBtn('Attitude', showAttitude, () => toggleInstrument('attitude'), 'Toggle attitude indicator', icons.attitude)}
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
  ), [followVehicle, showCompass, showAttitude, toggleInstrument, showMission, showTerrain, useRealVehicleSize, showMoreTools, hasValidGps, clearTrail, setHome, toggleBtn, icons]);

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

      {/* Attitude ball (the 'attitude' instrument; drag/resize/config work here too) */}
      <SingleMapInstrument id="attitude" />

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
      {(activeOverlays.has('traffic') || activeOverlays.has('gliders') || activeOverlays.has('remoteid')) && <TrafficOverlay />}
      {activeOverlays.has('camera') && <CameraFootprintOverlay />}
      {activeOverlays.has('waypointdots') && <MissionWaypointDotsLayer />}
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
function WindControlsWrapper({ raised }: { raised?: boolean }) {
  const hasWind = useOverlayStore((s) => s.activeOverlays.has('wind'));
  if (!hasWind) return null;
  return <WindControls raised={raised} />;
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
  const missionItems = useMissionStore((s) => s.missionItems);
  const groups = useMissionStore((s) => s.groups);
  const missionHome = useMissionStore((s) => s.homePosition);
  const currentSeq = useMissionStore((s) => s.currentSeq);
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const viewMode = useTelemMissionViewStore((s) => s.mode);

  const ghostTakeoffItems = useMemo(() =>
    missionItems.filter(item =>
      item.command === MAV_CMD.NAV_TAKEOFF && !hasValidCoordinates(item.latitude, item.longitude)
    ),
    [missionItems]
  );

  // Per-group render plan: each group draws its own coloured path + markers so a
  // fleet's per-vehicle missions are distinguishable. Falls back to the single
  // global mission for the common one-group case (colour = that group's colour).
  const groupPlans = useMemo(() => {
    const hasAssignments = groups.some((g) => g.assignedVehicleKey);
    const byOrder = [...groups].sort((a, b) => a.order - b.order);
    const plans: Array<{
      id: string;
      color: string;
      dim: boolean;
      waypoints: MissionItem[];
    }> = [];
    for (const g of byOrder) {
      if (g.visible === false) continue;
      const wps = missionItems.filter(
        (it) =>
          it.groupId === g.id &&
          commandHasLocation(it.command) &&
          hasValidCoordinates(it.latitude, it.longitude),
      );
      if (wps.length === 0) continue;

      // Per-vehicle visibility/dimming only kicks in once the operator has
      // actually assigned groups to vehicles; otherwise everything is solid
      // (single-mission behaviour, unchanged).
      const isUnassigned = !g.assignedVehicleKey;
      const isActiveGroup = !!g.assignedVehicleKey && g.assignedVehicleKey === activeVehicleKey;
      let dim = false;
      if (hasAssignments && !isUnassigned && !isActiveGroup) {
        if (viewMode === 'selected') continue; // hidden entirely
        dim = true; // shown but de-emphasised
      }
      plans.push({ id: g.id, color: g.color, dim, waypoints: wps });
    }
    return plans;
  }, [groups, missionItems, activeVehicleKey, viewMode]);

  return (
    <>
      {groupPlans.map((plan) => {
        const path = buildMissionPath(plan.waypoints);
        // Dimmed groups: just the faint path (no markers) to cut clutter.
        // Solid groups: numbered pins via splitMissionMarkers, ringed in colour.
        const pins = plan.dim ? [] : splitMissionMarkers(plan.waypoints, currentSeq).pins;
        const loiters = plan.dim
          ? []
          : plan.waypoints.filter(
              (wp) =>
                (wp.command === MAV_CMD.NAV_LOITER_UNLIM ||
                  wp.command === MAV_CMD.NAV_LOITER_TIME ||
                  wp.command === MAV_CMD.NAV_LOITER_TURNS) &&
                wp.param3 > 0,
            );
        return (
          <React.Fragment key={plan.id}>
            {path.positions.length > 1 && (
              <Polyline
                positions={path.positions}
                pathOptions={{ color: plan.color, weight: plan.dim ? 2 : 3, opacity: plan.dim ? 0.3 : 0.85 }}
              />
            )}
            {loiters.map((wp) => (
              <Circle
                key={`loiter-${plan.id}-${wp.seq}`}
                center={[wp.latitude, wp.longitude]}
                radius={Math.abs(wp.param3)}
                pathOptions={{
                  color: '#a855f7', weight: 2, opacity: 0.6,
                  fill: true, fillColor: '#a855f7', fillOpacity: 0.1, dashArray: '5, 5',
                }}
              />
            ))}
            {pins.map(({ wp, role }) => (
              <Marker
                key={`${plan.id}-${wp.seq}`}
                position={[wp.latitude, wp.longitude]}
                icon={
                  role === 'start'
                    ? START_ICON
                    : role === 'end'
                      ? END_ICON
                      : createWaypointIcon(wp, wp.seq === currentSeq, plan.color)
                }
                zIndexOffset={role === 'current' ? 1000 : 0}
              />
            ))}
          </React.Fragment>
        );
      })}

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

      {/* Geofence overlays (read-only) */}
      <FenceMapOverlay readOnly />

      {/* Rally point overlays (read-only) */}
      <RallyMapOverlay readOnly />
    </>
  );
});

// ─── Live (tick-rate) leaves of the 2D map ──────────────────────────────────
// Each subscribes to high-rate telemetry itself, so TelemetryMap2D, which
// renders the whole Leaflet tree, no longer re-renders per telemetry batch.
// Every displayed value still updates on every batch, in these leaves.

function useLiveVehiclePosition(homePosition: [number, number] | null, fallback: [number, number]): [number, number] {
  const lat = useTelemetryStore((s) => s.gps.lat);
  const lon = useTelemetryStore((s) => s.gps.lon);
  const ok = useTelemetryStore((s) => s.gps.fixType >= 2 && s.gps.lat !== 0 && s.gps.lon !== 0);
  return useMemo(() => (ok ? [lat, lon] : homePosition ?? fallback), [ok, lat, lon, homePosition, fallback]);
}

function LiveMapController({ followVehicle, homePosition, defaultPosition, onUserInteraction, onMapClick, onContextMenu, containerRef }: {
  followVehicle: boolean;
  homePosition: [number, number] | null;
  defaultPosition: [number, number];
  onUserInteraction: () => void;
  onMapClick?: () => void;
  onContextMenu?: (lat: number, lon: number) => void;
  containerRef: React.RefObject<HTMLDivElement>;
}): JSX.Element {
  const position = useLiveVehiclePosition(homePosition, defaultPosition);
  return (
    <MapController
      position={position}
      followVehicle={followVehicle}
      onUserInteraction={onUserInteraction}
      onMapClick={onMapClick}
      onContextMenu={onContextMenu}
      containerRef={containerRef}
    />
  );
}

// Renderless: appends throttled trail points and seeds home on first fix.
function TrailAndHomeUpdater({ setTrail, setHomePosition }: {
  setTrail: React.Dispatch<React.SetStateAction<[number, number][]>>;
  setHomePosition: React.Dispatch<React.SetStateAction<[number, number] | null>>;
}): null {
  const lat = useTelemetryStore((s) => s.gps.lat);
  const lon = useTelemetryStore((s) => s.gps.lon);
  const hasValidGps = useTelemetryStore((s) => s.gps.fixType >= 2 && s.gps.lat !== 0 && s.gps.lon !== 0);
  const lastUpdateRef = useRef<number>(0);
  useEffect(() => {
    if (!hasValidGps) return;
    const now = Date.now();
    if (now - lastUpdateRef.current > 500) {
      lastUpdateRef.current = now;
      const gpsPosition: [number, number] = [lat, lon];
      setTrail(prev => {
        const newTrail = [...prev, gpsPosition];
        return newTrail.length > 100 ? newTrail.slice(-100) : newTrail;
      });
      setHomePosition(prev => prev ?? gpsPosition);
    }
  }, [lat, lon, hasValidGps, setTrail, setHomePosition]);
  return null;
}

function LiveHomeLine({ homePosition, defaultPosition }: {
  homePosition: [number, number] | null;
  defaultPosition: [number, number];
}): JSX.Element | null {
  const vehiclePosition = useLiveVehiclePosition(homePosition, defaultPosition);
  if (!homePosition) return null;
  const distance = calculateDistance(vehiclePosition[0], vehiclePosition[1], homePosition[0], homePosition[1]);
  if (distance <= 5) return null;
  return <HomeLine vehiclePosition={vehiclePosition} homePosition={homePosition} />;
}

function LiveHeadingLine({ homePosition, defaultPosition }: {
  homePosition: [number, number] | null;
  defaultPosition: [number, number];
}): JSX.Element {
  const position = useLiveVehiclePosition(homePosition, defaultPosition);
  const heading = useTelemetryStore((s) => s.vfrHud.heading);
  const groundspeed = useTelemetryStore((s) => s.vfrHud.groundspeed);
  const armed = useTelemetryStore((s) => s.flight.armed);
  return <HeadingLine position={position} heading={heading} groundspeed={groundspeed} armed={armed} />;
}

function LiveVehicleMarker({ tacticalClass, isSelected, activeIsLeader, activeDesignation, activeBodyColor, homePosition, defaultPosition, altitudeUnit, speedUnit, onSelectToggle }: {
  tacticalClass: ReturnType<typeof mavTypeToTacticalClass>;
  isSelected: boolean;
  activeIsLeader: boolean;
  activeDesignation: string | undefined;
  activeBodyColor: string | undefined;
  homePosition: [number, number] | null;
  defaultPosition: [number, number];
  altitudeUnit: ReturnType<typeof useSettingsStore.getState>['unitPreferences']['altitude'];
  speedUnit: ReturnType<typeof useSettingsStore.getState>['unitPreferences']['speed'];
  onSelectToggle: () => void;
}): JSX.Element {
  const vehiclePosition = useLiveVehiclePosition(homePosition, defaultPosition);
  const heading = useTelemetryStore((s) => s.vfrHud.heading);
  const groundspeed = useTelemetryStore((s) => s.vfrHud.groundspeed);
  const relativeAlt = useTelemetryStore((s) => s.position.relativeAlt);
  const windDirection = useTelemetryStore((s) => s.wind.direction);
  const windSpeed = useTelemetryStore((s) => s.wind.speed);
  const mode = useTelemetryStore((s) => s.flight.mode);
  const vehicleState = useTelemetryStore((s): VehicleState => {
    if (s.flight.armed && s.battery.remaining > 0 && s.battery.remaining < 20) return 'critical';
    if (s.flight.armed && s.gps.fixType < 2) return 'critical';
    if (s.flight.armed) return 'armed';
    return 'disarmed';
  });

  // Icon is only rebuilt when stable props change (state, mode, selection,
  // vehicle class). Heading/speed/alt are updated via cheap DOM mutations.
  const tacticalIcon = useMemo(
    () => createTacticalVehicleIcon({
      vehicleClass: tacticalClass,
      state: vehicleState,
      selected: isSelected,
      mode,
      isLeader: activeIsLeader,
      topmost: true,
      designation: activeDesignation,
      bodyColor: activeBodyColor,
    }),
    [tacticalClass, vehicleState, isSelected, mode, activeIsLeader, activeDesignation, activeBodyColor],
  );

  const vehicleMarkerRef = useRef<L.Marker | null>(null);

  useEffect(() => {
    const marker = vehicleMarkerRef.current;
    if (!marker) return;
    const el = marker.getElement();
    if (!el) return;
    updateTacticalIconDOM(el, {
      heading,
      groundspeed,
      speedText: formatSpeedFromMetersPerSecond(groundspeed, speedUnit),
      altitudeAgl: relativeAlt,
      altitudeText: formatAltitudeFromMeters(relativeAlt, altitudeUnit),
      windDirection,
      windSpeed,
    }, tacticalClass === 'antenna');
    // tacticalIcon is in deps so a regenerated icon DOM (e.g. selection
    // change) gets the current heading reapplied immediately.
  }, [heading, groundspeed, relativeAlt, altitudeUnit, speedUnit, windDirection, windSpeed, tacticalClass, tacticalIcon]);

  return (
    <Marker
      ref={vehicleMarkerRef}
      position={vehiclePosition}
      zIndexOffset={5000}
      icon={tacticalIcon}
      eventHandlers={{
        click: (e) => {
          L.DomEvent.stopPropagation(e.originalEvent);
          onSelectToggle();
        },
      }}
    />
  );
}

function LiveCommandLayer(props: Omit<React.ComponentProps<typeof CommandLayer>, 'vehiclePosition'> & {
  homePosition: [number, number] | null;
  defaultPosition: [number, number];
}): JSX.Element {
  const { homePosition, defaultPosition, ...rest } = props;
  const vehiclePosition = useLiveVehiclePosition(homePosition, defaultPosition);
  return <CommandLayer {...rest} vehiclePosition={vehiclePosition} />;
}

// ─── 2D Telemetry Map ────────────────────────────────────────────────────────

const TelemetryMap2D = React.memo(function TelemetryMap2D() {
  // Low-rate primitive selections only. This component renders the entire
  // Leaflet tree, so it must never re-render at telemetry rate; every
  // tick-rate consumer lives in the Live* leaf components above.
  const armed = useTelemetryStore((s) => s.flight.armed);
  const flightMode = useTelemetryStore((s) => s.flight.mode);
  const vfrAltNonZero = useTelemetryStore((s) => s.vfrHud.alt !== 0);

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
  // The old small CompassOverlay is gone in 2D; the toolbar Compass button
  // now drives the 'heading' round gauge instrument instead.
  const headingInstrumentVisible = useMapInstrumentsStore((s) => resolveInstrumentVisible(s.visible, 'heading'));
  const toggleInstrument = useMapInstrumentsStore((s) => s.toggle);
  // The nav ball is the 'attitude' registry instrument now.
  const attitudeVisible = useMapInstrumentsStore((s) => resolveInstrumentVisible(s.visible, 'attitude'));
  const [showMission, setShowMission] = useState(true); // Show mission overlays by default
  // Clean-screen: collapse the whole right-side control column to a single
  // eye, leaving the map and the flight instruments. Same idea as the mobile
  // HUD's hide-chrome toggle; the instruments are flight data and stay.
  const [controlsHidden, setControlsHidden] = useState(false);
  const [largeMissionNoticeDismissed, setLargeMissionNoticeDismissed] = useState(false);
  const [showTerrain, setShowTerrain] = useState(false);
  const [elevationRange, setElevationRange] = useState<ElevationRange>({ min: 0, max: 0 });
  const [terrainAutoRange, setTerrainAutoRange] = useState(true);
  const [terrainFixedRange, setTerrainFixedRange] = useState<ElevationRange>({ min: 0, max: 1500 });
  const [terrainRelativeMode, setTerrainRelativeMode] = useState(false);
  // 1 m resolution is plenty for the 25 m-bucketed terrain heatmap and keeps
  // this from re-rendering the tree at telemetry rate.
  const terrainRefAlt = useTelemetryStore((s) => (terrainRelativeMode ? Math.round(s.vfrHud.alt) : null));
  const [headingLineLength, setHeadingLineLength] = useState(100); // meters
  const handleBoundsChange = useCallback((b: { north: number; south: number; east: number; west: number }) => {
    useTelemMapBoundsStore.getState().setBounds(b);
  }, []);
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

  const hasValidGps = useTelemetryStore((s) => s.gps.fixType >= 2 && s.gps.lat !== 0 && s.gps.lon !== 0);
  // Initial map center only; MapContainer ignores later center changes and
  // LiveMapController takes over from there.
  const [initialCenter] = useState<[number, number]>(() => {
    const t = useTelemetryStore.getState();
    const ok = t.gps.fixType >= 2 && t.gps.lat !== 0 && t.gps.lon !== 0;
    return ok ? [t.gps.lat, t.gps.lon] : defaultPosition;
  });

  // Selection state
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const VEHICLE_ID = 'vehicle-1';

  // Fleet mode: the active fleet vehicle IS the map's command target (it was chosen in
  // the fleet strip or by clicking its map marker; commands route via activeFlightTarget()
  // in the main process). Single-vehicle mode is unchanged: click the marker to select
  // before commanding. See isFleetCommandTarget for why this is not "primary link down".
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const formations = useActiveVehicleStore((s) => s.formations);
  const knownVehicleCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);
  const fleetActive = isFleetCommandTarget(activeVehicleKey, knownVehicleCount, connectionState.isConnected);
  // The big primary marker renders the active vehicle; mark it as leader when the
  // active vehicle leads a formation (after "form up", the leader IS active).
  const activeIsLeader = fleetActive && activeVehicleKey !== null && activeVehicleKey in formations;

  // Active vehicle identity (fleet mode): its SYS id label + identity colour, matching the
  // strip card / its waypoints. Single-vehicle mode keeps the plain state-coloured marker.
  const activeVehicle = useActiveVehicleStore((s) => (activeVehicleKey ? s.knownVehicles[activeVehicleKey] : undefined));
  const activeIdentityColor = useVehicleColor(activeVehicleKey ?? '', activeVehicle?.sysid ?? 1);
  const activeDesignation = fleetActive && activeVehicle ? `SYS ${activeVehicle.sysid}` : undefined;
  const activeBodyColor = fleetActive ? activeIdentityColor : undefined;

  // Tactical icon properties
  const tacticalClass = mavTypeToTacticalClass(connectionState.mavType);

  const isSelected = selectedVehicleId === VEHICLE_ID || fleetActive;

  // Marker icon, per-tick DOM pose updates and home distance/bearing all live
  // in LiveVehicleMarker / LiveHomeLine now.


  // Mirror home into the instruments' store: the flight-data instrument is a
  // registry component with no access to this panel's local state.
  useEffect(() => {
    useMapHomeStore.getState().setHome(homePosition);
  }, [homePosition]);

  // Disable follow when user manually interacts with the map
  const handleUserMapInteraction = useCallback(() => {
    setFollowVehicle(false);
  }, []);

  // Command popup is local UI state — only relevant while the popover is up.
  const [commandPopup, setCommandPopup] = useState<{ lat: number; lon: number } | null>(null);
  // Refusals must be visible on the map itself: the Messages panel is not part
  // of the default layout, so a store-only warning reads as a dead right-click.
  const [mapNotice, setMapNotice] = useState<string | null>(null);
  const mapNoticeTimer = useRef<number | null>(null);
  const showMapNotice = useCallback((text: string) => {
    useMessagesStore.getState().addMessage(4, 'WARNING', text);
    setMapNotice(text);
    if (mapNoticeTimer.current !== null) window.clearTimeout(mapNoticeTimer.current);
    mapNoticeTimer.current = window.setTimeout(() => setMapNotice(null), 4000);
  }, []);
  useEffect(() => () => {
    if (mapNoticeTimer.current !== null) window.clearTimeout(mapNoticeTimer.current);
  }, []);
  // Ground point the camera/gimbal is currently locked onto (ROI). Marks the
  // spot on the map; cleared by "Clear ROI" or on disconnect. Ref mirrors the
  // state so empty-dep callbacks (handleCommandConfirm) read the live value.
  const [roiTarget, setRoiTarget] = useState<{ lat: number; lon: number } | null>(null);
  const roiTargetRef = useRef<{ lat: number; lon: number } | null>(null);
  roiTargetRef.current = roiTarget;
  // Active target lives in a global store so it survives 2D ↔ 3D switches and
  // panel remounts, and so the 3D map can render the same overlay. Keyed by
  // the active fleet vehicle so each drone keeps its own target: switching
  // selection must not steal the previous vehicle's line.
  const localTarget = useActiveVehicleTarget();
  // Displayed target: the vehicle's own POSITION_TARGET_GLOBAL_INT broadcast
  // is authoritative for gotos, so targets commanded by another GCS appear
  // and desktop-issued ones don't double-draw.
  const vehicleGuidedTarget = useVehicleGuidedTarget();
  const activeTarget = mergeGuidedTarget(localTarget, vehicleGuidedTarget);
  // When the target was last SET. PX4 needs a grace window: its goto flips the
  // mode to Hold only on the next heartbeat, and clearing on the stale mode
  // reading would erase the overlay the instant it was drawn.
  const targetSetAtRef = useRef(0);
  const setActiveTarget = useCallback((next: ActiveCommandTarget | null) => {
    if (next) targetSetAtRef.current = Date.now();
    useCommandTargetStore.getState().setTarget(commandTargetKey(), next);
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

  // Right-click handler: open go-to popup (only when vehicle selected AND armed).
  // Both refusals say WHY. Silence here reads as "the fleet ignores right-click".
  const handleMapContextMenu = useCallback((lat: number, lon: number) => {
    if (!selectedVehicleId && !fleetActive) {
      showMapNotice('No vehicle selected: click a vehicle marker before commanding.');
      return;
    }
    if (!useTelemetryStore.getState().flight.armed) {
      showMapNotice('Map commands need an armed vehicle.');
      return;
    }
    setCommandPopup({ lat, lon });
  }, [selectedVehicleId, fleetActive, showMapNotice]);

  // Camera ROI: point the active vehicle's gimbal at a clicked ground point.
  // This is a gimbal command (MAV_CMD_DO_SET_ROI_LOCATION), not a nav command,
  // so it does not go through dispatchMapCommand / activeTarget.
  const sendRoiCommand = useCallback(async (lat: number, lon: number): Promise<boolean> => {
    const vehicleKey = useActiveVehicleStore.getState().activeVehicleKey ?? '';
    // PX4 ignores DO_SET_ROI_LOCATION for VEHICLE yaw outside missions
    // (navigator only applies ROI to mission items), so on PX4 "look here"
    // must pin the heading through DO_REPOSITION param4 — which PX4 stores
    // raw as RADIANS. Hovering: reposition in place with the bearing.
    // Transiting a goto: re-issue the same target with the bearing pinned.
    if (useConnectionStore.getState().connectionState.firmware === 'px4') {
      const t = useTelemetryStore.getState();
      const bearingRad = Math.atan2(
        Math.sin((lon - t.gps.lon) * Math.PI / 180) * Math.cos(lat * Math.PI / 180),
        Math.cos(t.gps.lat * Math.PI / 180) * Math.sin(lat * Math.PI / 180) -
        Math.sin(t.gps.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) * Math.cos((lon - t.gps.lon) * Math.PI / 180),
      );
      const tgt = useCommandTargetStore.getState().getTarget(commandTargetKey());
      const gotoTgt = tgt?.type === 'goto' ? tgt : null;
      const ok = await window.electronAPI.mavlinkGoto(
        gotoTgt?.lat ?? t.gps.lat,
        gotoTgt?.lon ?? t.gps.lon,
        gotoTgt?.px4Amsl ?? t.position.alt,
        5,
        (bearingRad + 2 * Math.PI) % (2 * Math.PI),
      );
      // Fall through to the gimbal ROI too — a mounted gimbal should also point.
      if (!ok) return false;
    }
    // ROI needs the target's ground altitude (AMSL). Prefer the terrain DEM;
    // fall back to the ground height under the vehicle (its AMSL minus AGL) when
    // the elevation service is offline, matching the video-click ROI path.
    let groundAmsl = await getElevation(lat, lon);
    if (groundAmsl == null) {
      const t = useTelemetryStore.getState();
      groundAmsl = t.gps.alt - t.position.relativeAlt;
    }
    return window.electronAPI.cameraGimbalCommand(vehicleKey, {
      kind: 'point-roi', lat, lon, alt: groundAmsl, deviceId: 0,
    });
  }, []);

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
      showMapNotice('Command dropped: vehicle disarmed.');
      setCommandPopup(null);
      return;
    }
    const prev = useCommandTargetStore.getState().getTarget(commandTargetKey());
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
    const result = await dispatchMapCommand(command, {
      ...options,
      stopScriptFirst,
      firmware: connectionState.firmware,
    });
    if (result.success) {
      // ActiveTarget mirrors the issued command's variant for correct overlay rendering.
      if (command.type === 'goto') {
        setActiveTarget({ type: 'goto', lat: command.lat, lon: command.lon, alt: command.alt, px4Amsl: result.px4Amsl });
        // ArduPilot resets guided yaw behaviour on every new destination, which
        // silently cancels an active ROI (verified in SITL: yaw snapped from the
        // ROI bearing to face-travel on DO_REPOSITION). Re-assert the lock so
        // "look here" survives "fly here".
        const roi = roiTargetRef.current;
        if (roi) void sendRoiCommand(roi.lat, roi.lon);
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
  }, [sendRoiCommand, showMapNotice]);

  const handleCommandCancel = useCallback(() => {
    setCommandPopup(null);
  }, []);

  const handleSetRoi = useCallback(async (lat: number, lon: number) => {
    const ok = await sendRoiCommand(lat, lon);
    if (ok) setRoiTarget({ lat, lon });
    setCommandPopup(null);
  }, [sendRoiCommand]);

  const handleClearRoi = useCallback(async () => {
    const vehicleKey = useActiveVehicleStore.getState().activeVehicleKey ?? '';
    await window.electronAPI.cameraGimbalCommand(vehicleKey, { kind: 'roi-none' });
    setRoiTarget(null);
    setCommandPopup(null);
  }, []);

  // Drop the ROI marker when the active link goes away (the lock is gone FC-side).
  useEffect(() => {
    if (!connectionState.isConnected && !fleetActive) setRoiTarget(null);
  }, [connectionState.isConnected, fleetActive]);

  // Clear active target based on command type:
  //  - goto:  mode != GUIDED, OR vehicle within 5m of target (arrived)
  //  - orbit/spiral/watchtower: mode != GUIDED (script keeps running otherwise)
  //  - climbRtl: mode != GUIDED && != RTL (RTL is the expected next mode)
  //  - land:  mode != GUIDED && mode != LAND (LAND is the expected next mode)
  useEffect(() => {
    if (!localTarget) return;
    const modeUpper = flightMode.toUpperCase();
    // The mode a command "lives in" is firmware-specific. ArduPilot flies
    // gotos/orbits in GUIDED; PX4 has no GUIDED — DO_REPOSITION holds at the
    // target in Hold, DO_ORBIT flies as Orbit, land is its own mode. The old
    // GUIDED-only rule erased every PX4 overlay the moment it was drawn.
    const isPx4Fw = connectionState.firmware === 'px4';
    // Grace window after set: PX4's mode flips on the NEXT heartbeat, so the
    // first evaluations still see the pre-command mode.
    const inGrace = Date.now() - targetSetAtRef.current < 3000;

    if (localTarget.type === 'land') {
      const landModes = isPx4Fw ? ['LAND'] : ['GUIDED', 'LAND'];
      if (!landModes.includes(modeUpper) && !inGrace) setActiveTarget(null);
      return;
    }
    if (localTarget.type === 'climbRtl') {
      if (modeUpper !== 'GUIDED' && modeUpper !== 'RTL' && !inGrace) setActiveTarget(null);
      return;
    }
    const holdModes = isPx4Fw
      ? (localTarget.type === 'orbit' ? ['ORBIT', 'HOLD'] : ['HOLD'])
      : ['GUIDED'];
    if (!holdModes.includes(modeUpper)) {
      if (!inGrace) setActiveTarget(null);
      return;
    }
    if (localTarget.type === 'goto') {
      // 1s proximity poll instead of a per-tick position dependency; arrival
      // clearing does not need telemetry-rate resolution.
      const check = () => {
        const t = useTelemetryStore.getState();
        const dist = calculateDistance(t.gps.lat, t.gps.lon, localTarget.lat, localTarget.lon);
        if (dist < 5) setActiveTarget(null);
      };
      check();
      const id = setInterval(check, 1000);
      return () => clearInterval(id);
    }
  }, [localTarget, flightMode, connectionState.firmware]);

  const clearTrail = useCallback(() => {
    setTrail([]);
  }, []);

  const setHome = useCallback(() => {
    const t = useTelemetryStore.getState();
    if (t.gps.fixType >= 2 && t.gps.lat !== 0 && t.gps.lon !== 0) {
      setHomePosition([t.gps.lat, t.gps.lon]);
    }
  }, []);


  // ── In-map split ──────────────────────────────────────────────────────────
  // A second panel (Vision first) can share the map panel's content area: map on
  // the left, panel on the right, with a draggable divider. The floating
  // instruments overlay (rendered as a sibling below) stays on top of the WHOLE
  // panel, spanning both halves. The Leaflet map must be told its width changed
  // (invalidateSize) or it paints grey tiles.
  const splitTarget = useMapSplitStore((s) => s.target);

  // Opening the split swaps the cockpit to a profile sized for a half-width
  // map. First time it ASKS (preset / current / keep, with remember), after
  // that it follows the remembered choice; closing restores the pre-split
  // arrangement exactly.
  const prevSplitRef = useRef<string | null>(null);
  const [splitPrompt, setSplitPrompt] = useState(false);
  useEffect(() => {
    const wasSplit = prevSplitRef.current !== null;
    const isSplit = splitTarget !== null;
    prevSplitRef.current = splitTarget;
    if (isSplit === wasSplit) return;
    const store = useMapInstrumentsStore.getState();
    if (isSplit) {
      const mode = localStorage.getItem(SPLIT_LAYOUT_MODE_KEY) ?? 'ask';
      if (mode === 'off') return;
      if (mode === 'split') {
        let profile: ReturnType<typeof resolveSplitProfile> = null;
        if ((localStorage.getItem(SPLIT_LAYOUT_SOURCE_KEY) ?? 'preset') === 'custom') {
          try { profile = JSON.parse(localStorage.getItem(SPLIT_LAYOUT_CUSTOM_KEY) ?? '') as never; } catch { profile = null; }
        }
        profile ??= resolveSplitProfile();
        if (profile) store.enterSplitProfile(profile);
        return;
      }
      setSplitPrompt(true);
    } else {
      setSplitPrompt(false);
      store.exitSplitProfile();
    }
  }, [splitTarget]);
  const onSplitPromptChoice = useCallback((action: 'preset' | 'current' | 'keep', remember: boolean) => {
    setSplitPrompt(false);
    const store = useMapInstrumentsStore.getState();
    if (action === 'preset') {
      const profile = resolveSplitProfile();
      if (profile) store.enterSplitProfile(profile);
      if (remember) {
        localStorage.setItem(SPLIT_LAYOUT_MODE_KEY, 'split');
        localStorage.setItem(SPLIT_LAYOUT_SOURCE_KEY, 'preset');
      }
    } else if (action === 'current') {
      // The on-screen layout BECOMES the split layout; applying it back is a
      // visual no-op but arms the exit restore like any other split profile.
      const current = store.captureLayoutSnapshot();
      try { localStorage.setItem(SPLIT_LAYOUT_CUSTOM_KEY, JSON.stringify(current)); } catch { /* full/blocked */ }
      localStorage.setItem(SPLIT_LAYOUT_SOURCE_KEY, 'custom');
      store.enterSplitProfile(current);
      if (remember) localStorage.setItem(SPLIT_LAYOUT_MODE_KEY, 'split');
    } else if (remember) {
      localStorage.setItem(SPLIT_LAYOUT_MODE_KEY, 'off');
    }
  }, []);
  const splitRatio = useMapSplitStore((s) => s.ratio);
  const setSplitRatio = useMapSplitStore((s) => s.setRatio);
  const clearSplit = useMapSplitStore((s) => s.clear);
  const leafletMapRef = useRef<L.Map | null>(null);
  const splitRowRef = useRef<HTMLDivElement>(null);
  // While dragging the divider we keep the ratio local (smooth, no persist spam)
  // and commit it to the store on release. A ref carries the latest value into
  // the pointerup handler, whose closure captured drag-start state.
  const [dragRatio, setDragRatio] = useState<number | null>(null);
  const dragRatioRef = useRef<number | null>(null);
  const effectiveRatio = dragRatio ?? splitRatio;

  const invalidateMapSize = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    try { map.invalidateSize(); } catch { /* map not initialised yet */ }
  }, []);

  // Repaint after the new width has been applied to the DOM (split toggled, or
  // ratio changed during/after a drag).
  useEffect(() => {
    const id = requestAnimationFrame(invalidateMapSize);
    return () => cancelAnimationFrame(id);
  }, [splitTarget, effectiveRatio, invalidateMapSize]);

  const handleSplitRatio = useCallback((ratio: number) => {
    const clamped = Math.max(MAP_SPLIT_RATIO_MIN, Math.min(MAP_SPLIT_RATIO_MAX, ratio));
    dragRatioRef.current = clamped;
    setDragRatio(clamped);
  }, []);
  const handleSplitDragEnd = useCallback(() => {
    const r = dragRatioRef.current;
    if (r != null) setSplitRatio(r);
    dragRatioRef.current = null;
    setDragRatio(null);
  }, [setSplitRatio]);

  const layer = TELEMETRY_LAYERS[currentLayer];

  return (
    <div ref={containerRef} data-tour="telemetry-map" className="h-full w-full flex flex-col bg-surface-base relative">
      {/* Large-mission notice: plain waypoints carry no useful number and stack
          into an unreadable cluster, so we show only the route's start/end, the
          live target, and key commands. The full flight path is still drawn. */}
      {showMission && markersSemantic && !largeMissionNoticeDismissed && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md bg-gray-900/90 border border-white/10 shadow-md backdrop-blur-sm text-[11px] text-gray-100 pointer-events-none whitespace-nowrap">
          <svg className="w-3.5 h-3.5 text-blue-300 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            Large mission: showing key waypoints (launch, turns, landing) and the live target. The full flight path is still drawn.
          </span>
          {/* The banner is click-through so it never eats a map click; only the
              dismiss button opts back into pointer events. */}
          <button
            type="button"
            onClick={() => setLargeMissionNoticeDismissed(true)}
            data-tip="Dismiss"
            className="pointer-events-auto ml-1 p-0.5 rounded text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
      {/* Shifted right of its default slot: the Instruments menu owns top-left here */}
      <TrafficAltitudeFilter className="absolute top-3 left-40 z-[1000]" />
      <ZoneAlertBanner />
      {/* Transient refusal notice (right-click with nothing selected, etc.) */}
      {mapNotice && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-2 px-3 py-1.5 rounded-md bg-surface-solid border border-amber-500/50 shadow-lg text-[12px] font-medium text-content pointer-events-none whitespace-nowrap">
          <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.3 3.86l-8.02 13.89A2 2 0 004 21h16a2 2 0 001.73-3.25L13.7 3.86a2 2 0 00-3.4 0z" />
          </svg>
          {mapNotice}
        </div>
      )}

      {/* Instruments menu (top-left counterpart of the Layers menu) */}
      <div data-arrange-chrome className="absolute top-2 left-2 z-[1000]">
        <InstrumentsMenu />
      </div>

      {/* Airspace legend */}
      <AirspaceLegendWrapper />

      {/* Wind timeline bar */}
      <WindControlsWrapper raised={attitudeVisible} />

      {/* API key dialog */}
      <ApiKeyDialog />

      {/* GPS status overlay (below the Instruments menu button) */}
      {!hasValidGps && (
        <div className="absolute top-10 left-2 z-[1000] px-2 py-1 bg-yellow-600/90 text-white text-xs rounded shadow-lg">
          No GPS fix
        </div>
      )}

      {/* Live survey progress readout (renders nothing until a survey group
          has actual progress). Drops below the "No GPS fix" badge slot. */}
      {showMission && <SurveyProgressCard className={hasValidGps ? 'top-10 left-2' : 'top-[4.5rem] left-2'} />}

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
            hasCraftPosition={vfrAltNonZero}
          />
        </div>
      )}

      {/* The flight-data card that lived here is now the 'flight-data' entry in
          the instruments registry (same bottom-left default, draggable). */}


      {/* Content area: the Leaflet map, plus an optional in-map split second
          surface to its right with a draggable divider. The floating overlays
          above (toolbars, instruments) are siblings of this row, so they stay on
          top of the WHOLE panel and span BOTH halves. */}
      {splitPrompt && <SplitLayoutPrompt onChoose={onSplitPromptChoice} />}
      <div ref={splitRowRef} className="flex-1 min-h-0 flex">
        <div
          className="relative h-full min-w-0"
          style={{ flexGrow: splitTarget ? effectiveRatio : 1, flexBasis: 0 }}
        >
      <MapContainer
        center={initialCenter}
        zoom={17}
        zoomSnap={0}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={false}
      >
        <MapRefBridge mapRef={leafletMapRef} />
        <SmoothWheelZoom />
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
            referenceAlt={terrainRefAlt}
            onElevationRangeChange={setElevationRange}
          />
        )}

        {/* Cached area overlay */}
        <CachedAreaOverlay />

        {/* Map controller for resize handling and following */}
        <LiveMapController
          followVehicle={followVehicle}
          homePosition={homePosition}
          defaultPosition={defaultPosition}
          onUserInteraction={handleUserMapInteraction}
          onMapClick={() => { setSelectedVehicleId(null); setCommandPopup(null); }}
          onContextMenu={handleMapContextMenu}
          containerRef={containerRef}
        />
        <TrailAndHomeUpdater setTrail={setTrail} setHomePosition={setHomePosition} />

        {/* Module layers first, so nothing a module draws covers the aircraft. */}
        <ModuleMapLayers />

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
        <LiveHomeLine homePosition={homePosition} defaultPosition={defaultPosition} />

        {/* Heading line - speed proportional */}
        {showHeadingLine && (
          <LiveHeadingLine homePosition={homePosition} defaultPosition={defaultPosition} />
        )}

        {/* Home marker */}
        {homePosition && (
          <Marker position={homePosition} icon={homeIcon} />
        )}

        {/* ======= MISSION OVERLAYS (read-only) ======= */}
        {/* Self-subscribed + memoized so live telemetry re-renders don't rebuild
            every waypoint marker/DivIcon. See MissionOverlays above. */}
        {showMission && <MissionOverlays />}
        {/* Live survey progress tint over the group paths (self-subscribed,
            recomputes on MISSION_CURRENT changes + 1 Hz position samples). */}
        {showMission && <SurveyProgressOverlay />}
        {/* ======= END MISSION OVERLAYS ======= */}

        {/* Map overlays (self-subscribed to avoid re-rendering terrain) */}
        <MapOverlayLayers baseLayer={currentLayer} />

        {/* Vehicle marker - tactical icon. Hidden when nothing is selected in fleet mode
            (the deselected vehicle reverts to an ordinary fleet marker via FleetMarkers). */}
        {(connectionState.isConnected || activeVehicleKey !== null) && (
          <LiveVehicleMarker
            tacticalClass={tacticalClass}
            isSelected={isSelected}
            activeIsLeader={activeIsLeader}
            activeDesignation={activeDesignation}
            activeBodyColor={activeBodyColor}
            homePosition={homePosition}
            defaultPosition={defaultPosition}
            altitudeUnit={altitudeUnit}
            speedUnit={speedUnit}
            onSelectToggle={() => {
              // In fleet mode, clicking the active vehicle deselects it; single-vehicle
              // mode keeps the local select toggle for the command popup.
              if (fleetActive) deselectActiveVehicle();
              else setSelectedVehicleId(prev => prev === VEHICLE_ID ? null : VEHICLE_ID);
            }}
          />
        )}

        {/* Other connected vehicles (multi-vehicle). Renders nothing for a single vehicle. */}
        <FleetMarkers />

        {/* Adjustable rectangle for selecting an area to cache offline. */}
        <OfflineCacheBox />

        {/* Imperative command layer - popup/target/line managed via refs, immune to re-renders */}
        <LiveCommandLayer
          commandPopup={commandPopup}
          activeTarget={activeTarget}
          homePosition={homePosition}
          defaultPosition={defaultPosition}
          roiTarget={roiTarget}
          onConfirm={handleCommandConfirm}
          onCancel={handleCommandCancel}
          onSetRoi={handleSetRoi}
          onClearRoi={handleClearRoi}
        />
      </MapContainer>

          {/* Floating instrument widgets, attitude ball included (drag-to-place,
              toggled from the Instruments menu). Inside the map half, NOT the
              panel root: on split their anchors re-derive against the map's own
              box, so they stay off the second surface. */}
          <InstrumentsLayer />
      {/* Top toolbar: inside the map half, so on split it hugs the MAP's
          right edge instead of floating over the second surface. */}
      {controlsHidden ? (
        <button
          onClick={() => setControlsHidden(false)}
          data-tip="Show map controls"
          data-arrange-chrome
          className="absolute top-2 right-2 z-[1100] p-1.5 rounded bg-surface text-content-secondary hover:text-content hover:bg-surface-raised shadow-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      ) : (
      <div data-tour="telemetry-map-overlays" data-arrange-chrome className="absolute top-2 right-2 z-[1100] flex flex-col gap-1">
        {/* Clean-screen toggle: hides this whole column, leaving the map and
            the flight instruments. Sits at the top of the stack as its handle. */}
        <button
          onClick={() => setControlsHidden(true)}
          data-tip="Hide map controls"
          className="self-end p-1.5 rounded bg-surface text-content-secondary hover:text-content hover:bg-surface-raised shadow-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
        </button>
        <MapLayersControl
          baseLayers={Object.keys(TELEMETRY_LAYERS) as LayerKey[]}
          activeLayer={currentLayer}
          onSelectLayer={(k) => setCurrentLayer(k as TelemetryLayerKey)}
          showTerrain={showTerrain}
          onToggleTerrain={() => setShowTerrain(!showTerrain)}
          extra={<MissionPathsToggle />}
        />
        <SplitControl />
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
          onClick={() => toggleInstrument('heading')}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
            headingInstrumentVisible
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
          onClick={() => toggleInstrument('attitude')}
          className={`px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
            attitudeVisible
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
      )}
        </div>

        {/* In-map split: divider + second surface (Vision first). */}
        {splitTarget && (
          <>
            <SplitDivider
              rowRef={splitRowRef}
              onRatio={handleSplitRatio}
              onDragEnd={handleSplitDragEnd}
              onClose={clearSplit}
            />
            <div
              className="relative h-full min-w-0"
              style={{ flexGrow: 1 - effectiveRatio, flexBasis: 0 }}
            >
              <SecondSurface panelId={splitTarget} />
            </div>
          </>
        )}
      </div>

      {/* Offline cache-area control panel (visible only in cache mode). */}
      <OfflineCachePanel activeLayer={currentLayer} />
    </div>
  );
});
