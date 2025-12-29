import { useState, useEffect, useRef, useMemo, useCallback, memo } from 'react';
import { MapContainer, TileLayer, useMap, Marker, Polyline, useMapEvents, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMissionStore } from '../../stores/mission-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { commandHasLocation, MAV_CMD, type MissionItem } from '../../../shared/mission-types';

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
  positions.push([waypoints[0].latitude, waypoints[0].longitude]);
  isSpline.push(waypoints[0].command === MAV_CMD.NAV_SPLINE_WAYPOINT);

  // For each segment between waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    const curr = waypoints[i];
    const next = waypoints[i + 1];
    const currIsSpline = curr.command === MAV_CMD.NAV_SPLINE_WAYPOINT;
    const nextIsSpline = next.command === MAV_CMD.NAV_SPLINE_WAYPOINT;

    // If either endpoint is a spline, draw a curve
    if (currIsSpline || nextIsSpline) {
      // Get control points (previous and next waypoints for curve direction)
      const prev = i > 0 ? waypoints[i - 1] : curr;
      const after = i < waypoints.length - 2 ? waypoints[i + 2] : next;

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

// Map layer options
const MAP_LAYERS = {
  osm: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri',
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap',
  },
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; CartoDB',
  },
};

type LayerKey = keyof typeof MAP_LAYERS;

// Default center (will be updated to vehicle position or mission area)
const DEFAULT_CENTER: [number, number] = [51.505, -0.09];
const DEFAULT_ZOOM = 15;

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

// Map resize handler
function MapResizeHandler() {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement | null>(null);

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

// Map click handler for adding waypoints
function MapClickHandler({ onMapClick, isActive }: { onMapClick: (lat: number, lng: number) => void; isActive: boolean }) {
  useMapEvents({
    click: (e) => {
      if (isActive) {
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
}: {
  wp: MissionItem;
  isSelected: boolean;
  isCurrent: boolean;
  onSelect: (seq: number) => void;
  onDragEnd: (seq: number, lat: number, lng: number) => void;
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
      draggable={true}
      eventHandlers={eventHandlers}
    />
  );
});

export function MissionMapPanel() {
  const [activeLayer, setActiveLayer] = useState<LayerKey>('osm');
  const [isAddingWaypoint, setIsAddingWaypoint] = useState(false);
  const [fitTrigger, setFitTrigger] = useState(0);

  const {
    missionItems,
    selectedSeq,
    currentSeq,
    setSelectedSeq,
    addWaypoint,
    updateWaypoint,
  } = useMissionStore();

  // Filter to only items with locations
  const waypoints = missionItems.filter(item => commandHasLocation(item.command));

  const handleMapClick = (lat: number, lng: number) => {
    if (isAddingWaypoint) {
      // Get default altitude from last waypoint or 100m
      const lastWp = missionItems[missionItems.length - 1];
      const alt = lastWp?.altitude ?? 100;

      // For first waypoint, get current GPS position for home/takeoff
      // Using getState() to avoid subscription that causes re-renders
      const isFirstWaypoint = missionItems.length === 0;
      let homePosition: { lat: number; lon: number } | undefined;
      if (isFirstWaypoint) {
        const gps = useTelemetryStore.getState().gps;
        const hasGpsFix = gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0;
        if (hasGpsFix) {
          homePosition = { lat: gps.lat, lon: gps.lon };
        }
      }

      addWaypoint(lat, lng, alt, homePosition);
      setIsAddingWaypoint(false);
    }
  };

  // Memoize callbacks to prevent DraggableMarker re-renders during drag
  const handleMarkerClick = useCallback((seq: number) => {
    setSelectedSeq(seq);
  }, [setSelectedSeq]);

  const handleMarkerDragEnd = useCallback((seq: number, lat: number, lng: number) => {
    updateWaypoint(seq, { latitude: lat, longitude: lng });
  }, [updateWaypoint]);

  const layer = MAP_LAYERS[activeLayer];

  // Build complete path with curves for spline waypoints
  const missionPath = useMemo(() => {
    return buildMissionPath(waypoints);
  }, [waypoints]);

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={DEFAULT_CENTER}
        zoom={DEFAULT_ZOOM}
        className="h-full w-full"
        zoomControl={false}
      >
        <MapResizeHandler />
        <MapClickHandler onMapClick={handleMapClick} isActive={isAddingWaypoint} />
        <FitToBounds waypoints={waypoints} trigger={fitTrigger} />
        <FocusOnSelected waypoints={waypoints} selectedSeq={selectedSeq} />
        <CenterOnGps />

        <TileLayer
          url={layer.url}
          attribution={layer.attribution}
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

        {/* Waypoint markers */}
        {waypoints.map((wp) => (
          <DraggableMarker
            key={wp.seq}
            wp={wp}
            isSelected={wp.seq === selectedSeq}
            isCurrent={wp.seq === currentSeq}
            onSelect={handleMarkerClick}
            onDragEnd={handleMarkerDragEnd}
          />
        ))}
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

      {/* Bottom controls */}
      <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-2">
        {/* GPS warning for first waypoint - only show when adding mode is active */}
        {isAddingWaypoint && missionItems.length === 0 && <GpsWarning />}
        <button
          onClick={() => setIsAddingWaypoint(!isAddingWaypoint)}
          className={`px-3 py-2 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
            isAddingWaypoint
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {isAddingWaypoint ? 'Click map...' : 'Add WP'}
        </button>

        {waypoints.length > 0 && (
          <button
            onClick={() => setFitTrigger(t => t + 1)}
            className="px-3 py-2 rounded text-sm font-medium bg-gray-800/90 text-gray-300 hover:bg-gray-700/90 transition-colors flex items-center gap-2"
            title="Fit map to show all waypoints"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
            Fit
          </button>
        )}
      </div>

      {/* Placeholder message when no waypoints */}
      {waypoints.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[500]">
          <div className="bg-gray-900/80 backdrop-blur-sm px-6 py-4 rounded-xl text-center">
            <div className="text-gray-400 text-sm mb-2">No waypoints</div>
            <div className="text-gray-500 text-xs">Click "Add Waypoint" or load a mission file</div>
          </div>
        </div>
      )}
    </div>
  );
}
