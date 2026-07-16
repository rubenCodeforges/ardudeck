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

import { useCallback, useEffect, useMemo } from 'react';
import { Polygon, Circle, Marker, Polyline, Tooltip } from 'react-leaflet';
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

// Drag handle at the centroid of the selected polygon: grab it to move the
// whole zone at once (the alternative - dragging every vertex - is painful
// for anything beyond a triangle).
const createMoveHandleIcon = () =>
  L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        background-color: #ffffff;
        color: #1e293b;
        border: 2px solid #3b82f6;
        border-radius: 50%;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        cursor: grab;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="5 9 2 12 5 15"></polyline>
          <polyline points="9 5 12 2 15 5"></polyline>
          <polyline points="15 19 12 22 9 19"></polyline>
          <polyline points="19 9 22 12 19 15"></polyline>
          <line x1="2" y1="12" x2="22" y2="12"></line>
          <line x1="12" y1="2" x2="12" y2="22"></line>
        </svg>
      </div>
    `,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });

// Floating delete button shown near the centroid of the selected fence
// (offset below the move handle). Renders as a small red pill with a trash
// glyph + label so it is obvious even when the underlying zone fill is
// tinted similarly.
const createDeleteButtonIcon = () =>
  L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 8px;
        background-color: #dc2626;
        color: #ffffff;
        border: 1px solid #b91c1c;
        border-radius: 9999px;
        font-size: 11px;
        font-weight: 600;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        cursor: pointer;
        white-space: nowrap;
        user-select: none;
      ">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7"></path>
        </svg>
        Delete
      </div>
    `,
    iconSize: [70, 22],
    iconAnchor: [35, -8], // Below the centroid so the move handle stays grabbable
  });

// Centroid of a polygon's vertices (simple average — good enough for placing
// a floating UI marker; not a true geometric centroid).
function polygonCentroid(vertices: Array<{ lat: number; lon: number }>): [number, number] {
  if (vertices.length === 0) return [0, 0];
  let lat = 0;
  let lon = 0;
  for (const v of vertices) {
    lat += v.lat;
    lon += v.lon;
  }
  return [lat / vertices.length, lon / vertices.length];
}

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
    translatePolygon,
    removeVertexFromPolygon,
    updateCircle,
    setReturnPoint,
    removePolygon,
    removeCircle,
  } = useFenceStore();

  // Delete the currently selected fence (polygon or circle). Used by both
  // the keyboard shortcut and the floating centroid button.
  const deleteSelectedFence = useCallback(() => {
    if (!selectedFenceId || readOnly) return;
    if (polygons.some(p => p.id === selectedFenceId)) {
      removePolygon(selectedFenceId);
    } else if (circles.some(c => c.id === selectedFenceId)) {
      removeCircle(selectedFenceId);
    }
  }, [selectedFenceId, readOnly, polygons, circles, removePolygon, removeCircle]);

  // Keyboard shortcut: Delete or Backspace removes the selected zone. Skip when
  // the user is typing in an input/textarea or while a draw mode is active
  // (Backspace there typically means "undo last vertex" semantically — better
  // to not steal the key).
  useEffect(() => {
    if (readOnly || !selectedFenceId || drawMode !== 'none') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }
      e.preventDefault();
      deleteSelectedFence();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly, selectedFenceId, drawMode, deleteSelectedFence]);

  // Handle polygon click - exit draw mode to allow editing
  const handlePolygonClick = useCallback(
    (polygon: PolygonFence, e: L.LeafletMouseEvent) => {
      if (readOnly) return;
      // When placing a return point, a click inside the polygon should set the
      // return point at that location, not select/edit the polygon. Let the
      // event propagate to FenceDrawTool's map-click handler so the point lands
      // where the user clicked. (issue #57)
      if (drawMode === 'return-point') return;
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
      // When placing a return point, let the click fall through to
      // FenceDrawTool so it lands inside the circle rather than selecting it.
      // (issue #57)
      if (drawMode === 'return-point') return;
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

  // Handle vertex delete (right-click)
  const handleVertexContextMenu = useCallback(
    (polygonId: string, vertexIndex: number, vertexCount: number, e: L.LeafletMouseEvent) => {
      e.originalEvent.preventDefault();
      if (readOnly || vertexCount <= 3) return; // Need at least 3 vertices
      removeVertexFromPolygon(polygonId, vertexIndex);
    },
    [readOnly, removeVertexFromPolygon]
  );

  // Handle whole-polygon move via the centroid drag handle
  const handlePolygonMove = useCallback(
    (polygonId: string, renderedCentroid: [number, number], e: L.LeafletMouseEvent) => {
      if (readOnly) return;
      const { lat, lng } = e.target.getLatLng();
      translatePolygon(polygonId, lat - renderedCentroid[0], lng - renderedCentroid[1]);
    },
    [readOnly, translatePolygon]
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
              positions={[positions[positions.length - 1]!, positions[0]!]}
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
            center={positions[0]!}
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
      const center = positions[0]!;
      const edge = positions[1]!;
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
            >
              {!readOnly && !isSelected && drawMode === 'none' && (
                <Tooltip sticky opacity={0.9}>
                  <span style={{ fontSize: '10px' }}>Click to edit or delete this zone</span>
                </Tooltip>
              )}
            </Polygon>
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
            >
              {!readOnly && !isSelected && drawMode === 'none' && (
                <Tooltip sticky opacity={0.9}>
                  <span style={{ fontSize: '10px' }}>Click to edit or delete this zone</span>
                </Tooltip>
              )}
            </Polygon>
          );
        })}

      {/* Move handle at the centroid of the selected polygon - drag to move the whole zone */}
      {!readOnly && drawMode === 'none' &&
        polygons
          .filter((p) => p.id === selectedFenceId)
          .map((polygon) => {
            const centroid = polygonCentroid(polygon.vertices);
            return (
              <Marker
                key={`${polygon.id}-move-handle`}
                position={centroid}
                icon={createMoveHandleIcon()}
                draggable
                eventHandlers={{
                  dragend: (e) => handlePolygonMove(polygon.id, centroid, e as unknown as L.LeafletMouseEvent),
                }}
              >
                <Tooltip direction="top" offset={[0, -14]} opacity={0.9}>
                  <span style={{ fontSize: '10px' }}>Drag to move the whole zone</span>
                </Tooltip>
              </Marker>
            );
          })}

      {/* Draggable vertices for selected polygon - right-click to delete, hover for coordinates */}
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
                  contextmenu: (e) => handleVertexContextMenu(polygon.id, i, polygon.vertices.length, e as unknown as L.LeafletMouseEvent),
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.9}>
                  <span style={{ fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'pre' }}>
                    {`P${i + 1}: ${vertex.lat.toFixed(6)}, ${vertex.lon.toFixed(6)}`}
                    {polygon.vertices.length > 3 ? '\nRight-click to delete' : ''}
                  </span>
                </Tooltip>
              </Marker>
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
          >
            {!readOnly && !isSelected && drawMode === 'none' && (
              <Tooltip sticky opacity={0.9}>
                <span style={{ fontSize: '10px' }}>Click to edit or delete this zone</span>
              </Tooltip>
            )}
          </Circle>
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

      {/* Floating delete button at centroid of selected zone (skipped in readOnly).
          Discoverable mouse-side affordance to complement the Delete key shortcut. */}
      {!readOnly && selectedFenceId && drawMode === 'none' && (() => {
        const selectedPoly = polygons.find((p) => p.id === selectedFenceId);
        if (selectedPoly) {
          const center = polygonCentroid(selectedPoly.vertices);
          return (
            <Marker
              key={`${selectedPoly.id}-delete-btn`}
              position={center}
              icon={createDeleteButtonIcon()}
              interactive
              eventHandlers={{
                click: (e: L.LeafletMouseEvent) => {
                  e.originalEvent.stopPropagation();
                  e.originalEvent.preventDefault();
                  deleteSelectedFence();
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -14]} opacity={0.9}>
                <span style={{ fontSize: '10px' }}>Delete this zone (Del)</span>
              </Tooltip>
            </Marker>
          );
        }
        const selectedCircle = circles.find((c) => c.id === selectedFenceId);
        if (selectedCircle) {
          return (
            <Marker
              key={`${selectedCircle.id}-delete-btn`}
              position={[selectedCircle.center.lat, selectedCircle.center.lon]}
              icon={createDeleteButtonIcon()}
              interactive
              eventHandlers={{
                click: (e: L.LeafletMouseEvent) => {
                  e.originalEvent.stopPropagation();
                  e.originalEvent.preventDefault();
                  deleteSelectedFence();
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -14]} opacity={0.9}>
                <span style={{ fontSize: '10px' }}>Delete this zone (Del)</span>
              </Tooltip>
            </Marker>
          );
        }
        return null;
      })()}

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
