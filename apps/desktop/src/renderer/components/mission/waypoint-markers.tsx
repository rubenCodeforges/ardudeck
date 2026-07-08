/**
 * Interactive waypoint markers, extracted from MissionMapPanel so the tiered
 * waypoint overlay can materialize the exact same markers the panel always
 * used - small missions must look and behave identically to before the
 * canvas tier existed.
 */
import { useState, useEffect, useRef, useMemo, memo } from 'react';
import { Marker } from 'react-leaflet';
import L from 'leaflet';
import { MAV_CMD, type MissionItem } from '../../../shared/mission-types';

/** Fill for a plain waypoint; commands with a distinct color override it. */
export const DEFAULT_WAYPOINT_COLOR = '#3b82f6';

// Get color based on command type
export function getCommandColor(cmd: number): string {
  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return '#22c55e'; // Green - takeoff
    case MAV_CMD.NAV_LAND:
    case MAV_CMD.NAV_VTOL_LAND:
    case MAV_CMD.DO_LAND_START:
      return '#ef4444'; // Red - land
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return '#f97316'; // Orange - RTL
    case MAV_CMD.NAV_LOITER_UNLIM:
    case MAV_CMD.NAV_LOITER_TIME:
    case MAV_CMD.NAV_LOITER_TURNS:
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return '#a855f7'; // Purple - loiter
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return '#06b6d4'; // Cyan - spline
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
    case MAV_CMD.DO_DIGICAM_CONTROL:
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
    case MAV_CMD.DO_MOUNT_CONTROL:
    case MAV_CMD.DO_MOUNT_CONFIGURE:
      return '#eab308'; // Yellow - camera/gimbal
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      return '#ec4899'; // Pink - ROI
    default:
      return DEFAULT_WAYPOINT_COLOR; // Blue - regular waypoint
  }
}

// Get icon shape based on command type
export function getCommandShape(cmd: number): string {
  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return '▲'; // Triangle up
    case MAV_CMD.NAV_LAND:
    case MAV_CMD.NAV_VTOL_LAND:
    case MAV_CMD.DO_LAND_START:
      return '▼'; // Triangle down
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return '⌂'; // Home
    case MAV_CMD.NAV_LOITER_UNLIM:
    case MAV_CMD.NAV_LOITER_TIME:
    case MAV_CMD.NAV_LOITER_TURNS:
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return '○'; // Circle for loiter
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
    case MAV_CMD.DO_DIGICAM_CONTROL:
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
      return '▣'; // Square with fill - camera
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      return '◉'; // Fisheye - ROI
    default:
      return ''; // Just number for regular waypoints
  }
}

// Create waypoint marker icon
export function createWaypointIcon(wp: MissionItem, isSelected: boolean, isCurrent: boolean, segmentColor?: string, displayNumber?: number, groupColor?: string): L.DivIcon {
  // For regular waypoints, use segment color to reflect mission state (camera, ROI, speed)
  // For special commands (takeoff, land, loiter, etc.), keep their distinct command color
  const commandColor = getCommandColor(wp.command);
  const hasSpecialColor = commandColor !== DEFAULT_WAYPOINT_COLOR;
  const baseColor = hasSpecialColor ? commandColor : (segmentColor ?? commandColor);
  const bgColor = isCurrent ? '#f59e0b' : baseColor;
  const size = isSelected ? 38 : 28;
  const shape = getCommandShape(wp.command);
  const displayText = shape || (displayNumber ?? wp.seq + 1).toString();
  // In a fleet (multiple groups assigned to vehicles), ring each marker in its
  // group's (vehicle's) colour so the per-vehicle missions are distinguishable;
  // the fill still encodes the command type. Selected/current keep their styling.
  const borderColor = isCurrent ? '#fbbf24' : isSelected ? 'rgba(255,255,255,0.95)' : (groupColor ?? 'rgba(255,255,255,0.95)');
  const borderWidth = isCurrent ? 3 : isSelected ? 3 : (groupColor ? 3 : 2);

  // Selected state: layered halo (white inner ring + bright cyan outer ring + glow).
  // Cyan #22d3ee is reserved for selection so it never collides with command colors
  // (blue WP, amber current, green takeoff, red land, purple loiter, etc.).
  const baseShadow = '0 2px 6px rgba(0,0,0,0.4)';
  const selectedShadow = [
    '0 0 0 3px rgba(255,255,255,0.95)',
    '0 0 0 6px #22d3ee',
    '0 0 14px 2px rgba(34,211,238,0.7)',
    '0 3px 8px rgba(0,0,0,0.5)',
  ].join(', ');
  const boxShadow = isSelected ? selectedShadow : baseShadow;
  const fontSize = isSelected ? (shape ? 16 : 14) : (shape ? 14 : 12);

  return L.divIcon({
    className: `waypoint-marker${isSelected ? ' waypoint-marker--selected' : ''}`,
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${bgColor};
        border: ${borderWidth}px solid ${borderColor};
        box-shadow: ${boxShadow};
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: ${fontSize}px;
        font-weight: bold;
        color: white;
        transition: width 0.12s ease, height 0.12s ease, box-shadow 0.12s ease;
      ">${displayText}</div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Small circular icon matching the look survey turn-point dots always had on
// this map. Used when a survey waypoint materializes as a real (draggable)
// marker - a full numbered pin per turn point would stack into an unreadable
// cluster, so survey dots stay dots even when interactive.
function createDotIcon(wp: MissionItem, isSelected: boolean, isCurrent: boolean, segmentColor?: string): L.DivIcon {
  const fill = isCurrent
    ? '#f59e0b'
    : isSelected
      ? '#22d3ee'
      : (segmentColor ?? DEFAULT_WAYPOINT_COLOR);
  const size = isSelected || isCurrent ? 12 : 8;
  return L.divIcon({
    className: 'waypoint-dot-marker',
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${fill};
        border: 1px solid rgba(255,255,255,0.95);
      "></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Draggable marker component that maintains position during drag
// Wrapped in memo to prevent re-renders from parent state changes during drag
export const DraggableMarker = memo(function DraggableMarker({
  wp,
  isSelected,
  isCurrent,
  onSelect,
  onDragEnd,
  onRightClick,
  readOnly = false,
  segmentColor,
  displayNumber,
  groupColor,
  variant = 'pin',
}: {
  wp: MissionItem;
  isSelected: boolean;
  isCurrent: boolean;
  displayNumber?: number;
  onSelect: (seq: number) => void;
  onDragEnd: (seq: number, lat: number, lng: number) => void;
  onRightClick?: (e: L.LeafletMouseEvent, wp: MissionItem) => void;
  readOnly?: boolean;
  segmentColor?: string;
  groupColor?: string;
  variant?: 'pin' | 'dot';
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
      contextmenu: (e: L.LeafletMouseEvent) => onRightClick?.(e, wp),
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
    [wp, onSelect, onDragEnd, onRightClick]
  );

  // Memoize icon to prevent unnecessary recreations
  const icon = useMemo(
    () =>
      variant === 'dot'
        ? createDotIcon(wp, isSelected, isCurrent, segmentColor)
        : createWaypointIcon(wp, isSelected, isCurrent, segmentColor, displayNumber, groupColor),
    [wp.command, wp.seq, isSelected, isCurrent, segmentColor, displayNumber, groupColor, variant]
  );

  return (
    <Marker
      ref={markerRef}
      position={position}
      icon={icon}
      draggable={!readOnly}
      eventHandlers={eventHandlers}
      zIndexOffset={isSelected ? 1000 : 0}
    />
  );
});
