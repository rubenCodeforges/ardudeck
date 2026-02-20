import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Polyline, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMissionStore } from '../../stores/mission-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { commandHasLocation, MAV_CMD, type MissionItem } from '../../../shared/mission-types';
import { useIpLocation } from '../../utils/ip-geolocation';

// Geofence and Rally overlays
import { FenceMapOverlay } from '../geofence/FenceMapOverlay';
import { FenceDrawTool } from '../geofence/FenceDrawTool';
import { RallyMapOverlay } from '../rally/RallyMapOverlay';
import { useFenceStore } from '../../stores/fence-store';
import { useRallyStore } from '../../stores/rally-store';
import { useEditModeStore } from '../../stores/edit-mode-store';

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
    positions.push([next!.latitude, next!.longitude]);
    isSpline.push(nextIsSpline);
  }

  return { positions, isSpline };
}

// Map layer options
const MAP_LAYERS = {
  osm: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
    maxZoom: 18,
  },
  // Google Maps satellite - higher zoom for detailed ground views (rovers)
  googleSat: {
    name: 'Google Sat',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
    maxZoom: 21,
  },
  // Google Maps hybrid - satellite with road labels (great for rovers)
  googleHybrid: {
    name: 'Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google',
    maxZoom: 21,
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap',
    maxZoom: 17,
  },
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB',
    maxZoom: 20,
  },
};

type LayerKey = keyof typeof MAP_LAYERS;

// Default center fallback (London) - will be overridden by IP geolocation
const FALLBACK_CENTER: [number, number] = [51.505, -0.09];
const DEFAULT_ZOOM_AIRCRAFT = 15;
const DEFAULT_ZOOM_ROVER = 18; // Rovers need higher zoom for street-level detail

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

// Create waypoint marker icon
function createWaypointIcon(wp: MissionItem, isSelected: boolean, isCurrent: boolean): L.DivIcon {
  const baseColor = getCommandColor(wp.command);
  const bgColor = isCurrent ? '#f59e0b' : isSelected ? baseColor : baseColor;
  const size = isSelected ? 32 : 28;
  const shape = getCommandShape(wp.command);
  const displayText = shape || (wp.seq + 1).toString();
  const borderColor = isCurrent ? '#fbbf24' : isSelected ? 'white' : 'rgba(255,255,255,0.8)';
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
        font-size: ${shape ? 14 : 12}px;
        font-weight: bold;
        color: white;
        transition: transform 0.15s ease;
      ">${displayText}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

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

// Fit map to waypoints
function FitToBounds({ waypoints, trigger }: { waypoints: MissionItem[]; trigger: number }) {
  const map = useMap();

  useEffect(() => {
    if (trigger > 0 && waypoints.length > 0) {
      const bounds = L.latLngBounds(
        waypoints.map(wp => [wp.latitude, wp.longitude] as [number, number])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, [trigger, waypoints, map]);

  return null;
}

// Focus map on selected waypoint
function FocusOnSelected({ waypoints, selectedSeq }: { waypoints: MissionItem[]; selectedSeq: number | null }) {
  const map = useMap();
  const prevSelectedRef = useRef<number | null>(null);

  useEffect(() => {
    // Only focus if selection changed (not on initial render or when clearing selection)
    if (selectedSeq !== null && selectedSeq !== prevSelectedRef.current) {
      const wp = waypoints.find(w => w.seq === selectedSeq);
      if (wp && wp.latitude !== 0 && wp.longitude !== 0) {
        map.setView([wp.latitude, wp.longitude], map.getZoom(), { animate: true, duration: 0.3 });
      }
    }
    prevSelectedRef.current = selectedSeq;
  }, [selectedSeq, waypoints, map]);

  return null;
}

// Center map on vehicle GPS position once when it becomes available
// Uses interval polling to avoid React re-renders that break marker drag
function CenterOnGps() {
  const map = useMap();
  const hasCenteredRef = useRef(false);

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

// Draggable marker component that maintains position during drag
// Wrapped in memo to prevent re-renders from parent state changes during drag
const DraggableMarker = memo(function DraggableMarker({
  wp,
  isSelected,
  isCurrent,
  onSelect,
  onDragEnd,
  readOnly = false,
}: {
  wp: MissionItem;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: (seq: number) => void;
  onDragEnd: (seq: number, lat: number, lng: number) => void;
  readOnly?: boolean;
}) {
  const [position, setPosition] = useState<[number, number]>([wp.latitude, wp.longitude]);
  const markerRef = useRef<L.Marker>(null);
  const isDraggingRef = useRef(false);

  // Update position when waypoint changes (but not during drag)
  useEffect(() => {
    if (!isDraggingRef.current) {
      setPosition([wp.latitude, wp.longitude]);
    }
  }, [wp.latitude, wp.longitude]);

  const eventHandlers = useMemo(
    () => ({
      click: () => onSelect(wp.seq),
      dragstart: () => {
        isDraggingRef.current = true;
      },
      drag: () => {
        const marker = markerRef.current;
        if (marker) {
          const latlng = marker.getLatLng();
          setPosition([latlng.lat, latlng.lng]);
        }
      },
      dragend: () => {
        const marker = markerRef.current;
        if (marker) {
          const latlng = marker.getLatLng();
          isDraggingRef.current = false;
          onDragEnd(wp.seq, latlng.lat, latlng.lng);
        }
      },
    }),
    [wp.seq, onSelect, onDragEnd]
  );

  // Memoize icon to prevent unnecessary recreations
  const icon = useMemo(
    () => createWaypointIcon(wp, isSelected, isCurrent),
    [wp.command, wp.seq, isSelected, isCurrent]
  );

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      draggable={!readOnly}
      eventHandlers={eventHandlers}
    />
  );
});

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
}

export function MissionMapPanel({ readOnly = false }: MissionMapPanelProps) {
  // Get connection state to check protocol type and vehicle type
  const connectionState = useConnectionStore((state) => state.connectionState);
  const isMspProtocol = connectionState?.protocol === 'msp';

  // Detect Rover (MAV_TYPE 10 = Ground Rover, 11 = Surface Boat)
  const isRover = connectionState?.mavType === 10 || connectionState?.mavType === 11;

  // Set defaults based on vehicle type - Rovers need higher zoom and hybrid map
  const defaultLayer: LayerKey = isRover ? 'googleHybrid' : 'osm';
  const defaultZoom = isRover ? DEFAULT_ZOOM_ROVER : DEFAULT_ZOOM_AIRCRAFT;

  const [activeLayer, setActiveLayer] = useState<LayerKey>(defaultLayer);
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [isSettingHome, setIsSettingHome] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);
  const [centerOnVehicleTrigger, setCenterOnVehicleTrigger] = useState(0);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Update layer when vehicle type changes (e.g., connecting to a Rover)
  useEffect(() => {
    if (isRover && activeLayer === 'osm') {
      setActiveLayer('googleHybrid');
    }
  }, [isRover, activeLayer]);

  // IP geolocation fallback (used when no GPS or mission items)
  const [ipLocation] = useIpLocation();

  // Dynamic default center - use IP location if available
  const defaultCenter: [number, number] = ipLocation
    ? [ipLocation.lat, ipLocation.lon]
    : FALLBACK_CENTER;

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

  // Get fence and rally stores for floating tools
  const fenceDrawMode = useFenceStore((state) => state.drawMode);
  const setFenceDrawMode = useFenceStore((state) => state.setDrawMode);
  const fenceInclusionMode = useFenceStore((state) => state.inclusionMode);
  const setFenceInclusionMode = useFenceStore((state) => state.setInclusionMode);

  const rallyAddMode = useRallyStore((state) => state.addMode);
  const setRallyAddMode = useRallyStore((state) => state.setAddMode);

  // Disable mission editing when fence or rally editing is active
  const isFenceOrRallyActive = fenceDrawMode !== 'none' || rallyAddMode;

  // Filter to only items with locations
  const waypoints = missionItems.filter(item => commandHasLocation(item.command));

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

    // For MAVLink boards, require home position to be set first
    // For MSP boards (iNav/Betaflight), home is auto-set on arm + GPS lock, so allow waypoints without it
    if (!isMspProtocol && !homePosition) {
      return;
    }

    // Get default altitude from last waypoint or 100m
    const lastWp = missionItems[missionItems.length - 1];
    const alt = lastWp?.altitude ?? 100;
    addWaypoint(lat, lng, alt);
  }, [isSettingHome, homePosition, missionItems, setHomePosition, addWaypoint, isMspProtocol]);

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
    });
  }, [readOnly]);

  // Handle insert waypoint from context menu
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

  // Close context menu on click elsewhere
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const layer = MAP_LAYERS[activeLayer];

  // Build complete path with curves for spline waypoints
  const missionPath = useMemo(() => {
    return buildMissionPath(waypoints);
  }, [waypoints]);

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={defaultCenter}
        zoom={defaultZoom}
        maxZoom={layer.maxZoom}
        className="h-full w-full"
        zoomControl={false}
      >
        <MapResizeHandler />
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
        <CenterOnGps />
        <CenterOnVehicle trigger={centerOnVehicleTrigger} />

        <TileLayer
          url={layer.url}
          attribution={layer.attribution}
          maxZoom={layer.maxZoom}
        />

        {/* Mission path - single polyline with curves through spline waypoints */}
        {missionPath.positions.length > 1 && (
          <Polyline
            positions={missionPath.positions}
            pathOptions={{
              color: '#3b82f6',
              weight: 3,
              opacity: 0.8,
            }}
          />
        )}

        {/* Clickable path segments for right-click insertion (hidden in readOnly mode) */}
        {!readOnly && waypoints.length > 1 && waypoints.slice(0, -1).map((wp, i) => {
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

        {/* Waypoint markers */}
        {waypoints.map((wp) => (
          <DraggableMarker
            key={wp.seq}
            wp={wp}
            isSelected={wp.seq === selectedSeq}
            isCurrent={wp.seq === currentSeq}
            onSelect={handleMarkerClick}
            onDragEnd={handleMarkerDragEnd}
            readOnly={readOnly}
          />
        ))}

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
      </MapContainer>

      {/* Layer selector */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col gap-1">
        {(Object.keys(MAP_LAYERS) as LayerKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveLayer(key)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              activeLayer === key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
            }`}
          >
            {MAP_LAYERS[key].name}
          </button>
        ))}
      </div>

      {/* Bottom controls - mode-specific floating tools */}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2">
        {/* === MISSION MODE TOOLS === */}
        {activeMode === 'mission' && (
          <>
            {/* GPS warning for first waypoint - only show when adding mode is active */}
            {!readOnly && isAddingWaypoint && missionItems.length === 0 && <GpsWarning />}

            {/* Add WP button - hidden in readOnly mode, disabled without home */}
            {!readOnly && (
              <button
                onClick={() => {
                  if (!homePosition) return; // Can't add without home
                  setIsAddingWaypoint(!isAddingWaypoint);
                  setIsSettingHome(false); // Exit home mode if entering add mode
                }}
                disabled={!homePosition}
                className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  !homePosition
                    ? 'bg-gray-800/50 text-gray-600 cursor-not-allowed'
                    : isAddingWaypoint
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
                }`}
                title={!homePosition ? 'Set Home position first' : isAddingWaypoint ? 'Click on map to add waypoints' : 'Enter waypoint adding mode'}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {isAddingWaypoint ? 'Click map' : 'Add WP'}
              </button>
            )}

            {/* Hint for Shift+click - show when NOT in add mode (as a shortcut hint) */}
            {!readOnly && !isAddingWaypoint && !isSettingHome && homePosition && (
              <span className="text-xs text-gray-500 bg-gray-800/90 px-2.5 py-1.5 rounded">
                <kbd className="bg-gray-700 px-1 rounded text-gray-400">Shift</kbd>+click to add
              </span>
            )}

            {waypoints.length > 0 && (
              <button
                onClick={() => setFitTrigger(t => t + 1)}
                className="px-2.5 py-1.5 rounded text-xs font-medium bg-gray-800/90 text-gray-300 hover:bg-gray-700/90 transition-colors flex items-center gap-1.5"
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
              className="px-2.5 py-1.5 rounded text-xs font-medium bg-gray-800/90 text-gray-300 hover:bg-gray-700/90 transition-colors flex items-center gap-1.5"
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
                      : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
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
              <span className="text-xs text-emerald-400 bg-gray-800/90 px-2.5 py-1.5 rounded">
                Click on map to set home
              </span>
            )}
          </>
        )}

        {/* === GEOFENCE MODE TOOLS === */}
        {activeMode === 'geofence' && !readOnly && (
          <>
            {/* Include/Exclude toggle */}
            <div className="flex items-center bg-gray-800/90 rounded overflow-hidden">
              <button
                onClick={() => setFenceInclusionMode(true)}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  fenceInclusionMode
                    ? 'bg-green-600 text-white'
                    : 'text-gray-400 hover:text-gray-200'
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
                    : 'text-gray-400 hover:text-gray-200'
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
                      : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
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
                      : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
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
                  : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
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
              <span className={`text-xs bg-gray-800/90 px-2.5 py-1.5 rounded ${
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
                  : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
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
              <span className="text-xs text-orange-400 bg-gray-800/90 px-2.5 py-1.5 rounded">
                Click on map to add rally point (ESC to cancel)
              </span>
            )}
          </>
        )}
      </div>

      {/* Placeholder message when no waypoints - only in mission mode */}
      {activeMode === 'mission' && waypoints.length === 0 && !readOnly && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="bg-gray-900/80 backdrop-blur-sm px-6 py-4 rounded-xl text-center">
            {isSettingHome ? (
              <>
                <div className="text-emerald-400 text-sm mb-2">Click anywhere on the map</div>
                <div className="text-gray-500 text-xs">to set your Home position</div>
              </>
            ) : !homePosition ? (
              <>
                <div className="text-gray-400 text-sm mb-2">Set Home position first</div>
                <div className="text-gray-500 text-xs">Click "Set Home" then click on the map</div>
              </>
            ) : (
              <>
                <div className="text-blue-400 text-sm mb-2">Now select Takeoff location</div>
                <div className="text-gray-500 text-xs">
                  Click "Add WP" or <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-gray-400 text-[10px]">Shift</kbd>+click
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ReadOnly empty state */}
      {waypoints.length === 0 && readOnly && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="bg-gray-900/80 backdrop-blur-sm px-6 py-4 rounded-xl text-center">
            <div className="text-gray-500 text-sm">No mission loaded</div>
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
            className="absolute z-[1200] bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button
              onClick={handleInsertWaypoint}
              className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-blue-600 hover:text-white transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Insert waypoint here
            </button>
            <div className="px-3 py-1 text-[10px] text-gray-500 border-t border-gray-700 mt-1">
              Between WP {contextMenu.afterSeq + 1} → {contextMenu.afterSeq + 2}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
