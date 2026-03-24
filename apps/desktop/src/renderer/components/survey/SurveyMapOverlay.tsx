/**
 * Survey Map Overlay - Renders survey polygon, flight lines, photo dots,
 * camera footprints, and drawing preview on the map.
 */
import { useMemo, useCallback, memo } from 'react';
import { Polygon, Polyline, CircleMarker, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { useSurveyStore } from '../../stores/survey-store';
import type { LatLng } from './survey-types';

// Colors
const SURVEY_POLYGON_COLOR = '#8b5cf6';     // Purple
const SURVEY_LINE_COLOR = '#38bdf8';         // Sky blue
const SURVEY_PHOTO_COLOR = '#f59e0b';        // Amber
const SURVEY_FOOTPRINT_COLOR = '#8b5cf6';    // Purple
const SURVEY_DRAWING_COLOR = '#c084fc';      // Light purple

// Convert our LatLng to Leaflet tuple
function toLf(p: LatLng): [number, number] {
  return [p.lat, p.lng];
}

// Create vertex drag icon
function createVertexIcon(isDrawing: boolean): L.DivIcon {
  const color = isDrawing ? SURVEY_DRAWING_COLOR : SURVEY_POLYGON_COLOR;
  return L.divIcon({
    className: 'survey-vertex',
    html: `<div style="
      width: 12px; height: 12px;
      border-radius: 50%;
      background: ${color};
      border: 2px solid white;
      box-shadow: 0 1px 4px rgba(0,0,0,0.4);
      cursor: grab;
    "></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });
}

const VERTEX_ICON = createVertexIcon(false);
const DRAWING_VERTEX_ICON = createVertexIcon(true);

/**
 * Draggable vertex marker for survey polygon editing.
 * - Drag to reposition
 * - Right-click to delete (if polygon has more than 3 vertices)
 * - Tooltip shows coordinates
 */
const VertexMarker = memo(function VertexMarker({
  position,
  index,
  canDelete,
  onDragEnd,
  onDelete,
}: {
  position: LatLng;
  index: number;
  canDelete: boolean;
  onDragEnd: (index: number, lat: number, lng: number) => void;
  onDelete: (index: number) => void;
}) {
  const handleDragEnd = useCallback((e: L.DragEndEvent) => {
    const latlng = (e.target as L.Marker).getLatLng();
    onDragEnd(index, latlng.lat, latlng.lng);
  }, [index, onDragEnd]);

  const handleContextMenu = useCallback((e: L.LeafletMouseEvent) => {
    e.originalEvent.preventDefault();
    if (canDelete) {
      onDelete(index);
    }
  }, [index, canDelete, onDelete]);

  return (
    <Marker
      position={[position.lat, position.lng]}
      icon={VERTEX_ICON}
      draggable
      eventHandlers={{
        dragend: handleDragEnd,
        contextmenu: handleContextMenu,
      }}
    >
      <Tooltip direction="top" offset={[0, -8]} opacity={0.9}>
        <span style={{ fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'pre' }}>
          {`P${index + 1}: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`}
          {canDelete ? '\nRight-click to delete' : ''}
        </span>
      </Tooltip>
    </Marker>
  );
});

export function SurveyMapOverlay() {
  const drawMode = useSurveyStore((s) => s.drawMode);
  const drawingVertices = useSurveyStore((s) => s.drawingVertices);
  const polygon = useSurveyStore((s) => s.polygon);
  const result = useSurveyStore((s) => s.result);
  const showFootprints = useSurveyStore((s) => s.showFootprints);
  const updateVertex = useSurveyStore((s) => s.updateVertex);
  const removeVertex = useSurveyStore((s) => s.removeVertex);

  // Drawing preview (in-progress polygon)
  const drawingPositions = useMemo(
    () => drawingVertices.map(toLf),
    [drawingVertices],
  );

  // Completed polygon
  const polygonPositions = useMemo(
    () => polygon?.map(toLf) ?? [],
    [polygon],
  );

  // Flight path
  const flightPath = useMemo(
    () => result?.waypoints.map(toLf) ?? [],
    [result],
  );

  // Photo positions
  const photoPositions = useMemo(
    () => result?.photoPositions ?? [],
    [result],
  );

  // Camera footprints (limit to first 500 to avoid perf issues)
  const footprintPolygons = useMemo(() => {
    if (!showFootprints || !result) return [];
    return result.footprints.slice(0, 500).map(fp => fp.map(toLf));
  }, [showFootprints, result]);

  const handleVertexDrag = useCallback((index: number, lat: number, lng: number) => {
    updateVertex(index, lat, lng);
  }, [updateVertex]);

  const handleVertexDelete = useCallback((index: number) => {
    removeVertex(index);
  }, [removeVertex]);

  return (
    <>
      {/* Drawing preview */}
      {drawMode === 'polygon' && drawingPositions.length > 0 && (
        <>
          <Polyline
            positions={drawingPositions}
            pathOptions={{
              color: SURVEY_DRAWING_COLOR,
              weight: 2,
              dashArray: '8, 4',
              opacity: 0.8,
            }}
          />
          {drawingVertices.map((v, i) => (
            <CircleMarker
              key={`draw-${i}`}
              center={[v.lat, v.lng]}
              radius={5}
              pathOptions={{
                color: 'white',
                fillColor: SURVEY_DRAWING_COLOR,
                fillOpacity: 1,
                weight: 2,
              }}
            />
          ))}
        </>
      )}

      {/* Completed survey polygon */}
      {polygon && polygonPositions.length > 0 && (
        <>
          <Polygon
            positions={polygonPositions}
            pathOptions={{
              color: SURVEY_POLYGON_COLOR,
              weight: 2,
              fillColor: SURVEY_POLYGON_COLOR,
              fillOpacity: 0.1,
              dashArray: '6, 3',
            }}
          />
          {/* Draggable vertex markers - right-click to delete, hover for coordinates */}
          {polygon.map((v, i) => (
            <VertexMarker
              key={`vertex-${i}`}
              position={v}
              index={i}
              canDelete={polygon.length > 3}
              onDragEnd={handleVertexDrag}
              onDelete={handleVertexDelete}
            />
          ))}
        </>
      )}

      {/* Camera footprints (rendered behind flight lines) */}
      {footprintPolygons.map((fp, i) => (
        <Polygon
          key={`fp-${i}`}
          positions={fp}
          pathOptions={{
            color: SURVEY_FOOTPRINT_COLOR,
            weight: 0.5,
            fillColor: SURVEY_FOOTPRINT_COLOR,
            fillOpacity: 0.06,
            opacity: 0.3,
          }}
        />
      ))}

      {/* Flight path */}
      {flightPath.length > 1 && (
        <Polyline
          positions={flightPath}
          pathOptions={{
            color: SURVEY_LINE_COLOR,
            weight: 2,
            opacity: 0.7,
          }}
        />
      )}

      {/* Photo positions */}
      {photoPositions.map((p, i) => (
        <CircleMarker
          key={`photo-${i}`}
          center={[p.lat, p.lng]}
          radius={2.5}
          pathOptions={{
            color: SURVEY_PHOTO_COLOR,
            fillColor: SURVEY_PHOTO_COLOR,
            fillOpacity: 0.8,
            weight: 0,
          }}
        />
      ))}
    </>
  );
}
