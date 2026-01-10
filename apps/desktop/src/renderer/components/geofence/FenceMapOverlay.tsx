/**
 * FenceMapOverlay - Renders geofence items on the Leaflet map
 *
 * Displays:
 * - Inclusion polygons (green)
 * - Exclusion polygons (red)
 * - Inclusion/exclusion circles
 * - Return point marker
 * - Draggable vertices for selected fence
 */

import { useCallback, useMemo } from 'react';
import { Polygon, Circle, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { useFenceStore, type FenceDrawMode } from '../../stores/fence-store';
import type { PolygonFence, CircleFence } from '../../../shared/fence-types';

interface FenceMapOverlayProps {
  readOnly?: boolean;
}

// Colors for fence types
const COLORS = {
  inclusion: {
    fill: '#22c55e', // green-500
    stroke: '#16a34a', // green-600
    fillOpacity: 0.15,
  },
  exclusion: {
    fill: '#ef4444', // red-500
    stroke: '#dc2626', // red-600
    fillOpacity: 0.2,
  },
  returnPoint: {
    fill: '#fbbf24', // amber-400
    stroke: '#f59e0b', // amber-500
  },
  selected: {
    stroke: '#ffffff',
    weight: 3,
  },
};

// Custom icon for return point
const createReturnPointIcon = () =>
  L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        background-color: ${COLORS.returnPoint.fill};
        border: 2px solid ${COLORS.returnPoint.stroke};
        border-radius: 50%;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      ">
        <span style="font-size: 12px; font-weight: bold;">R</span>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

// Vertex marker for dragging
const createVertexIcon = (isSelected: boolean) =>
  L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        background-color: ${isSelected ? '#ffffff' : '#94a3b8'};
        border: 2px solid ${isSelected ? '#3b82f6' : '#64748b'};
        border-radius: 50%;
        width: 12px;
        height: 12px;
        cursor: grab;
      "></div>
    `,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

export function FenceMapOverlay({ readOnly = false }: FenceMapOverlayProps) {
  const {
    polygons,
    circles,
    returnPoint,
    selectedFenceId,
    drawMode,
    drawingVertices,
    setSelectedFenceId,
    setDrawMode,
    updatePolygonVertex,
    updateCircle,
    setReturnPoint,
  } = useFenceStore();

  // Handle polygon click - exit draw mode to allow editing
  const handlePolygonClick = useCallback(
    (polygon: PolygonFence, e: L.LeafletMouseEvent) => {
      if (readOnly) return;
      // Stop propagation so FenceDrawTool doesn't add a vertex
      e.originalEvent.stopPropagation();
      // Exit draw mode if active
      if (drawMode !== 'none') {
        setDrawMode('none');
      }
      setSelectedFenceId(selectedFenceId === polygon.id ? null : polygon.id);
    },
    [readOnly, selectedFenceId, setSelectedFenceId, drawMode, setDrawMode]
  );

  // Handle circle click - exit draw mode to allow editing
  const handleCircleClick = useCallback(
    (circle: CircleFence, e: L.LeafletMouseEvent) => {
      if (readOnly) return;
      // Stop propagation so FenceDrawTool doesn't add a vertex
      e.originalEvent.stopPropagation();
      // Exit draw mode if active
      if (drawMode !== 'none') {
        setDrawMode('none');
      }
      setSelectedFenceId(selectedFenceId === circle.id ? null : circle.id);
    },
    [readOnly, selectedFenceId, setSelectedFenceId, drawMode, setDrawMode]
  );

  // Handle vertex drag
  const handleVertexDrag = useCallback(
    (polygonId: string, vertexIndex: number, e: L.LeafletMouseEvent) => {
      if (readOnly) return;
      const { lat, lng } = e.target.getLatLng();
      updatePolygonVertex(polygonId, vertexIndex, lat, lng);
    },
    [readOnly, updatePolygonVertex]
  );

  // Handle circle center drag
  const handleCircleDrag = useCallback(
    (circleId: string, e: L.LeafletMouseEvent) => {
      if (readOnly) return;
      const { lat, lng } = e.target.getLatLng();
      updateCircle(circleId, { lat, lon: lng });
    },
    [readOnly, updateCircle]
  );

  // Handle return point drag
  const handleReturnPointDrag = useCallback(
    (e: L.LeafletMouseEvent) => {
      if (readOnly) return;
      const { lat, lng } = e.target.getLatLng();
      setReturnPoint(lat, lng, returnPoint?.altitude);
    },
    [readOnly, returnPoint?.altitude, setReturnPoint]
  );

  // Drawing preview
  const drawingPreview = useMemo(() => {
    if (drawMode === 'none' || drawingVertices.length === 0) return null;

    const positions = drawingVertices.map((v) => [v.lat, v.lon] as [number, number]);

    if (drawMode === 'polygon-inclusion' || drawMode === 'polygon-exclusion') {
      const isInclusion = drawMode === 'polygon-inclusion';
      return (
        <>
          {/* Line connecting vertices */}
          <Polyline
            positions={positions}
            pathOptions={{
              color: isInclusion ? COLORS.inclusion.stroke : COLORS.exclusion.stroke,
              weight: 2,
              dashArray: '5, 5',
            }}
          />
          {/* Closing line (preview) */}
          {positions.length >= 2 && (
            <Polyline
              positions={[positions[positions.length - 1], positions[0]]}
              pathOptions={{
                color: isInclusion ? COLORS.inclusion.stroke : COLORS.exclusion.stroke,
                weight: 1,
                dashArray: '3, 3',
                opacity: 0.5,
              }}
            />
          )}
          {/* Vertex markers */}
          {positions.map((pos, i) => (
            <Circle
              key={i}
              center={pos}
              radius={5}
              pathOptions={{
                color: isInclusion ? COLORS.inclusion.stroke : COLORS.exclusion.stroke,
                fillColor: '#ffffff',
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}
        </>
      );
    }

    if (drawMode === 'circle-inclusion' || drawMode === 'circle-exclusion') {
      const isInclusion = drawMode === 'circle-inclusion';
      if (positions.length === 1) {
        // Just center point
        return (
          <Circle
            center={positions[0]}
            radius={10}
            pathOptions={{
              color: isInclusion ? COLORS.inclusion.stroke : COLORS.exclusion.stroke,
              fillColor: '#ffffff',
              fillOpacity: 1,
              weight: 2,
            }}
          />
        );
      }
      // Show circle preview
      const center = positions[0];
      const edge = positions[1];
      const radius = calculateDistance(center[0], center[1], edge[0], edge[1]);
      return (
        <Circle
          center={center}
          radius={radius}
          pathOptions={{
            color: isInclusion ? COLORS.inclusion.stroke : COLORS.exclusion.stroke,
            fillColor: isInclusion ? COLORS.inclusion.fill : COLORS.exclusion.fill,
            fillOpacity: isInclusion ? COLORS.inclusion.fillOpacity : COLORS.exclusion.fillOpacity,
            weight: 2,
            dashArray: '5, 5',
          }}
        />
      );
    }

    return null;
  }, [drawMode, drawingVertices]);

  return (
    <>
      {/* Inclusion polygons */}
      {polygons
        .filter((p) => p.type === 'inclusion')
        .map((polygon) => {
          const isSelected = selectedFenceId === polygon.id;
          const positions = polygon.vertices.map((v) => [v.lat, v.lon] as [number, number]);

          return (
            <Polygon
              key={polygon.id}
              positions={positions}
              pathOptions={{
                color: isSelected ? COLORS.selected.stroke : COLORS.inclusion.stroke,
                fillColor: COLORS.inclusion.fill,
                fillOpacity: COLORS.inclusion.fillOpacity,
                weight: isSelected ? COLORS.selected.weight : 2,
                dashArray: isSelected ? undefined : '5, 5',
              }}
              eventHandlers={{
                click: (e) => handlePolygonClick(polygon, e as unknown as L.LeafletMouseEvent),
              }}
            />
          );
        })}

      {/* Exclusion polygons */}
      {polygons
        .filter((p) => p.type === 'exclusion')
        .map((polygon) => {
          const isSelected = selectedFenceId === polygon.id;
          const positions = polygon.vertices.map((v) => [v.lat, v.lon] as [number, number]);

          return (
            <Polygon
              key={polygon.id}
              positions={positions}
              pathOptions={{
                color: isSelected ? COLORS.selected.stroke : COLORS.exclusion.stroke,
                fillColor: COLORS.exclusion.fill,
                fillOpacity: COLORS.exclusion.fillOpacity,
                weight: isSelected ? COLORS.selected.weight : 2,
                dashArray: isSelected ? undefined : '5, 5',
              }}
              eventHandlers={{
                click: (e) => handlePolygonClick(polygon, e as unknown as L.LeafletMouseEvent),
              }}
            />
          );
        })}

      {/* Draggable vertices for selected polygon */}
      {!readOnly &&
        polygons
          .filter((p) => p.id === selectedFenceId)
          .map((polygon) =>
            polygon.vertices.map((vertex, i) => (
              <Marker
                key={`${polygon.id}-vertex-${i}`}
                position={[vertex.lat, vertex.lon]}
                icon={createVertexIcon(true)}
                draggable
                eventHandlers={{
                  dragend: (e) => handleVertexDrag(polygon.id, i, e as unknown as L.LeafletMouseEvent),
                }}
              />
            ))
          )}

      {/* Circles */}
      {circles.map((circle) => {
        const isSelected = selectedFenceId === circle.id;
        const isInclusion = circle.type === 'inclusion';

        return (
          <Circle
            key={circle.id}
            center={[circle.center.lat, circle.center.lon]}
            radius={circle.radius}
            pathOptions={{
              color: isSelected
                ? COLORS.selected.stroke
                : isInclusion
                  ? COLORS.inclusion.stroke
                  : COLORS.exclusion.stroke,
              fillColor: isInclusion ? COLORS.inclusion.fill : COLORS.exclusion.fill,
              fillOpacity: isInclusion ? COLORS.inclusion.fillOpacity : COLORS.exclusion.fillOpacity,
              weight: isSelected ? COLORS.selected.weight : 2,
              dashArray: isSelected ? undefined : '5, 5',
            }}
            eventHandlers={{
              click: (e) => handleCircleClick(circle, e as unknown as L.LeafletMouseEvent),
            }}
          />
        );
      })}

      {/* Draggable center for selected circle */}
      {!readOnly &&
        circles
          .filter((c) => c.id === selectedFenceId)
          .map((circle) => (
            <Marker
              key={`${circle.id}-center`}
              position={[circle.center.lat, circle.center.lon]}
              icon={createVertexIcon(true)}
              draggable
              eventHandlers={{
                dragend: (e) => handleCircleDrag(circle.id, e as unknown as L.LeafletMouseEvent),
              }}
            />
          ))}

      {/* Return point */}
      {returnPoint && (
        <Marker
          position={[returnPoint.lat, returnPoint.lon]}
          icon={createReturnPointIcon()}
          draggable={!readOnly}
          eventHandlers={{
            dragend: (e) => handleReturnPointDrag(e as unknown as L.LeafletMouseEvent),
          }}
        />
      )}

      {/* Drawing preview */}
      {drawingPreview}
    </>
  );
}

// Helper: Calculate distance between two points in meters (Haversine)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
