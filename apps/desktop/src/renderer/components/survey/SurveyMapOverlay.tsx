/**
 * Survey Map Overlay - Renders survey polygon, flight lines, photo dots,
 * camera footprints, and drawing preview on the map.
 */
import { useMemo, useCallback, useState, useEffect, memo, Fragment } from 'react';
import { Polygon, Polyline, CircleMarker, Marker, Tooltip, Pane, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { extractGeneratorOverlays } from './generator-overlays';
import { cullPathForViewport } from './path-culling';
import { useSurveyStore } from '../../stores/survey-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { LatLng } from './survey-types';

// Colors
const SURVEY_POLYGON_COLOR = '#d946ef';     // Fuchsia - kept clearly off the sky-blue grid lines
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
      <Tooltip direction="top" offset={[0, -8]} opacity={0.9} pane="vertexTooltipPane">
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
  const pattern = useSurveyStore((s) => s.config.pattern);
  const corridorBranches = useSurveyStore((s) => s.config.corridorBranches);
  const result = useSurveyStore((s) => s.result);
  const showFootprints = useSurveyStore((s) => s.showFootprints);
  const updateVertex = useSurveyStore((s) => s.updateVertex);
  const removeVertex = useSurveyStore((s) => s.removeVertex);
  const updateBranchVertex = useSurveyStore((s) => s.updateBranchVertex);
  const removeBranchVertex = useSurveyStore((s) => s.removeBranchVertex);
  const maxEditableVertices = useSettingsStore((s) => s.surveyPerformance.maxEditableVertices);
  const maxPhotoMarkers = useSettingsStore((s) => s.surveyPerformance.maxPhotoMarkers);
  const polygonEditMode = useSurveyStore((s) => s.polygonEditMode);

  // Track the map viewport so that, when editing a large polygon, we only
  // render drag handles for vertices currently on screen (capped) - editing a
  // 20k-point boundary is impossible (and would relag the map) if we drew a
  // marker for every vertex. Zoom to the stretch you want and nudge those.
  const [bounds, setBounds] = useState<L.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const map = useMapEvents({
    moveend: () => { setBounds(map.getBounds()); setZoom(map.getZoom()); },
    zoomend: () => { setBounds(map.getBounds()); setZoom(map.getZoom()); },
  });
  useEffect(() => { setBounds(map.getBounds()); setZoom(map.getZoom()); }, [map]);

  const editableVertexIndices = useMemo<number[]>(() => {
    if (!polygon) return [];
    if (polygonEditMode) {
      // Edit mode: viewport-culled handles, capped so a zoomed-out view can't
      // spawn thousands of markers.
      if (!bounds) return [];
      const out: number[] = [];
      for (let i = 0; i < polygon.length; i++) {
        const v = polygon[i]!;
        if (bounds.contains([v.lat, v.lng])) {
          out.push(i);
          if (out.length >= maxEditableVertices) break;
        }
      }
      return out;
    }
    // Not editing: show handles only for small polygons (back-compat); large
    // ones require entering edit mode.
    return polygon.length <= maxEditableVertices ? polygon.map((_, i) => i) : [];
  }, [polygon, polygonEditMode, bounds, maxEditableVertices]);

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

  // Flight path: the result carries the full-fidelity plan (tens of
  // thousands of points on large plans) - drawing is viewport-culled and
  // zoom-simplified instead of ever thinning the data itself.
  const flightPathRuns = useMemo(() => {
    const wps = result?.waypoints ?? [];
    if (wps.length < 2 || !bounds || zoom == null) return [];
    const vb = {
      west: bounds.getWest(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      north: bounds.getNorth(),
    };
    return cullPathForViewport(wps, vb, zoom).map((run) => run.map(toLf));
  }, [result, bounds, zoom]);

  // Photo positions. Rendering one CircleMarker each is fine for a typical
  // survey but melts the map for a huge area; past a threshold we drop the dots
  // (the flight path already conveys coverage).
  const photoPositions = useMemo(() => {
    const photos = result?.photoPositions ?? [];
    return photos.length > maxPhotoMarkers ? [] : photos;
  }, [result, maxPhotoMarkers]);

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

  // Engine-contributed decorations (e.g. TOPAS decomposition cells + the true
  // smoothed curve) belong to the DRAFT too - the persistent overlay only
  // draws committed, non-editing groups, which made them invisible in the
  // state the user actually works in.
  const generatorOverlays = useMemo(
    () => extractGeneratorOverlays(result?.generatorResult),
    [result],
  );

  return (
    <>
      {/* Dedicated high-z pane for vertex tooltips so they sit above the survey
          grid/flight lines and the boundary (which live in lower panes). */}
      <Pane name="vertexTooltipPane" style={{ zIndex: 680 }} />

      {generatorOverlays.map((ov, oi) => {
        const pts = ov.points.map((p) => [p.lat, p.lng] as [number, number]);
        const pathOptions = {
          color: ov.color ?? '#2dd4bf',
          weight: ov.type === 'polyline' ? 2.5 : 2,
          opacity: 0.9,
          ...(ov.dashed ? { dashArray: '6, 5' } : {}),
        };
        // Labeled overlays stay interactive just enough for a hover tooltip.
        return ov.type === 'polygon' ? (
          <Polygon
            key={`gen-ov-${oi}`}
            positions={pts}
            interactive={!!ov.label}
            pathOptions={{ ...pathOptions, fillColor: ov.color ?? '#2dd4bf', fillOpacity: 0.16 }}
          >
            {ov.label && <Tooltip sticky>{ov.label}</Tooltip>}
          </Polygon>
        ) : (
          <Polyline key={`gen-ov-${oi}`} positions={pts} interactive={false} pathOptions={pathOptions} />
        );
      })}

      {/* Drawing preview (polygon outline or a corridor branch centerline) */}
      {(drawMode === 'polygon' || drawMode === 'branch') && drawingPositions.length > 0 && (
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

      {/* Completed survey polygon. Rendered in a high-z pane (above the survey
          grid lines and the numbered waypoint markers) so the boundary and its
          drag handles are visible and grabbable instead of buried under the WPs. */}
      {polygon && polygonPositions.length > 0 && (
        <Pane name="surveyEditPane" style={{ zIndex: 640 }}>
          {/* Corridor renders the boundary as an OPEN centerline polyline; area
              patterns render a closed, lightly-filled polygon. Both keep the
              white casing for legibility over the blue grid and the draggable
              vertices for editing. */}
          {pattern === 'corridor' ? (
            <>
              <Polyline
                positions={polygonPositions}
                interactive={false}
                pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.85 }}
              />
              <Polyline
                positions={polygonPositions}
                pathOptions={{ color: SURVEY_POLYGON_COLOR, weight: 4, dashArray: '10, 6' }}
                eventHandlers={{ click: (e) => e.originalEvent.stopPropagation() }}
              />
              {/* Branch centerlines forked off the corridor, with draggable
                  vertex handles (right-click a handle to delete). */}
              {(corridorBranches ?? []).map((br, bi) => {
                if (br.length < 2) return null;
                const brPos = br.map(toLf);
                return (
                  <Fragment key={`branch-${bi}`}>
                    <Polyline positions={brPos} interactive={false} pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.85 }} />
                    <Polyline
                      positions={brPos}
                      pathOptions={{ color: SURVEY_POLYGON_COLOR, weight: 4, dashArray: '10, 6' }}
                      eventHandlers={{ click: (e) => e.originalEvent.stopPropagation() }}
                    />
                    {br.map((v, vi) => (
                      <VertexMarker
                        key={`branch-${bi}-v${vi}`}
                        position={v}
                        index={vi}
                        canDelete
                        onDragEnd={(idx, lat, lng) => updateBranchVertex(bi, idx, lat, lng)}
                        onDelete={(idx) => removeBranchVertex(bi, idx)}
                      />
                    ))}
                  </Fragment>
                );
              })}
            </>
          ) : (
            <>
              {/* White casing so the boundary reads clearly over the blue grid. */}
              <Polygon
                positions={polygonPositions}
                interactive={false}
                pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.85, fill: false }}
              />
              <Polygon
                positions={polygonPositions}
                pathOptions={{
                  color: SURVEY_POLYGON_COLOR,
                  weight: 4,
                  fillColor: SURVEY_POLYGON_COLOR,
                  fillOpacity: 0.05,
                }}
                // Clicking the polygon you're editing shouldn't count as an
                // "empty map" click that exits edit mode.
                eventHandlers={{ click: (e) => e.originalEvent.stopPropagation() }}
              />
            </>
          )}
          {/* Draggable vertex markers - right-click to delete, hover for
              coordinates. For dense (imported) boundaries these only appear in
              edit mode and only for the on-screen vertices, so the map stays
              responsive at any polygon size. */}
          {editableVertexIndices.map((i) => (
            <VertexMarker
              key={`vertex-${i}`}
              position={polygon[i]!}
              index={i}
              canDelete={polygon.length > 3}
              onDragEnd={handleVertexDrag}
              onDelete={handleVertexDelete}
            />
          ))}
        </Pane>
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

      {/* Flight path (visible runs only; re-culled on pan/zoom) */}
      {flightPathRuns.map((run, i) => (
        <Polyline
          key={`fp-run-${i}`}
          positions={run}
          pathOptions={{
            color: SURVEY_LINE_COLOR,
            weight: 2,
            opacity: 0.7,
          }}
        />
      ))}

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
