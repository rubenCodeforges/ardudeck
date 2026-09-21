/**
 * Survey Map Overlay - Renders survey polygon, flight lines, photo dots,
 * camera footprints, and drawing preview on the map.
 */
import { useMemo, useCallback, useState, useEffect, memo, Fragment } from 'react';
import { Polygon, Polyline, CircleMarker, Marker, Tooltip, Pane, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { extractGeneratorOverlays } from './generator-overlays';
import { bezierSpline, defaultSplineTangent, type SplineTangent } from './geo-edit';
import { latLngToLocal, localToLatLng } from './geo-math';
import { cullPathForViewport } from './path-culling';
import { useSurveyStore } from '../../stores/survey-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { LatLng } from './survey-types';

/** Preview cap: enough to read the coverage, few enough to stay smooth. */
const MAX_FOOTPRINTS = 500;

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

/**
 * Nearest edge of an OPEN polyline (no closing wrap): `nearestEdgeIndex` in
 * geo-edit treats the input as a closed ring, which would let a click near the
 * two ends insert a point on a nonexistent last-to-first edge.
 */
function nearestEdgeIndexOpen(line: LatLng[], p: LatLng): number {
  if (line.length < 2) return -1;
  let bestIdx = -1;
  let bestDist = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = latLngToLocal(p, line[i]!);
    const b = latLngToLocal(p, line[i + 1]!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? -(a.x * dx + a.y * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(a.x + t * dx, a.y + t * dy);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  return bestIdx;
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

const SELECTED_VERTEX_ICON = L.divIcon({
  className: 'survey-vertex',
  html: `<div style="
    width: 16px; height: 16px;
    border-radius: 50%;
    background: #f59e0b;
    border: 2.5px solid white;
    box-shadow: 0 1px 5px rgba(0,0,0,0.5);
    cursor: grab;
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Tangent arm endpoint of the selected anchor: the classic vector-editor
// handle you drag to shape the curve's direction and depth at that point.
const TANGENT_ICON = L.divIcon({
  className: 'survey-tangent-handle',
  html: `<div style="
    width: 10px; height: 10px;
    background: #f59e0b;
    border: 2px solid white;
    box-shadow: 0 1px 4px rgba(0,0,0,0.5);
    cursor: grab;
  "></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

// Ghost midpoint between two spline control points: the discoverable "add a
// point here" affordance (same convention as vector editors / Geoman).
const GHOST_VERTEX_ICON = L.divIcon({
  className: 'survey-ghost-vertex',
  html: `<div style="
    width: 10px; height: 10px;
    border-radius: 50%;
    background: rgba(217, 70, 239, 0.35);
    border: 1.5px dashed rgba(255,255,255,0.9);
    cursor: copy;
  "></div>`,
  iconSize: [10, 10],
  iconAnchor: [5, 5],
});

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
  selected,
  onSelect,
  live,
  locked,
}: {
  position: LatLng;
  index: number;
  canDelete: boolean;
  onDragEnd: (index: number, lat: number, lng: number) => void;
  onDelete: (index: number) => void;
  selected?: boolean;
  onSelect?: (index: number) => void;
  /** Update on every drag frame (cheap patterns like panorama), not only on release. */
  live?: boolean;
  locked?: boolean;
}) {
  const handleDragEnd = useCallback((e: L.DragEndEvent | L.LeafletEvent) => {
    const latlng = (e.target as L.Marker).getLatLng();
    onDragEnd(index, latlng.lat, latlng.lng);
  }, [index, onDragEnd]);

  const handleContextMenu = useCallback((e: L.LeafletMouseEvent) => {
    e.originalEvent.preventDefault();
    if (canDelete && !locked) {
      onDelete(index);
    }
  }, [index, canDelete, locked, onDelete]);

  const handleClick = useCallback((e: L.LeafletMouseEvent) => {
    e.originalEvent.stopPropagation();
    onSelect?.(index);
  }, [index, onSelect]);

  return (
    <Marker
      position={[position.lat, position.lng]}
      icon={selected ? SELECTED_VERTEX_ICON : VERTEX_ICON}
      draggable={!locked}
      // Above the boundary/curve lines (surveyEditPane, 640) - otherwise a
      // mouse-down aimed at a handle hits the line and pans the map instead.
      pane="surveyHandlePane"
      eventHandlers={{
        dragend: handleDragEnd,
        ...(live ? { drag: handleDragEnd } : {}),
        contextmenu: handleContextMenu,
        click: handleClick,
      }}
    >
      <Tooltip direction="top" offset={[0, -8]} opacity={0.9} pane="vertexTooltipPane">
        <span style={{ fontSize: '10px', fontFamily: 'monospace', whiteSpace: 'pre' }}>
          {`P${index + 1}: ${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`}
          {locked ? '\nLocked' : canDelete ? '\nRight-click to delete' : ''}
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
  const updateDrawingVertex = useSurveyStore((s) => s.updateDrawingVertex);
  const removeDrawingVertex = useSurveyStore((s) => s.removeDrawingVertex);
  const insertVertexAfter = useSurveyStore((s) => s.insertVertexAfter);
  const updateBranchVertex = useSurveyStore((s) => s.updateBranchVertex);
  const removeBranchVertex = useSurveyStore((s) => s.removeBranchVertex);
  const maxEditableVertices = useSettingsStore((s) => s.surveyPerformance.maxEditableVertices);
  const maxPhotoMarkers = useSettingsStore((s) => s.surveyPerformance.maxPhotoMarkers);
  const polygonEditMode = useSurveyStore((s) => s.polygonEditMode);
  const geometryLocked = useSurveyStore((s) => s.geometryLocked);

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
  // Live smooth preview while clicking out a panorama subject line.
  const drawingCurvePositions = useMemo(
    () => (pattern === 'panorama' && drawingVertices.length >= 3 ? bezierSpline(drawingVertices, undefined, 5).map(toLf) : null),
    [pattern, drawingVertices],
  );

  // Completed polygon
  const polygonPositions = useMemo(
    () => polygon?.map(toLf) ?? [],
    [polygon],
  );

  // Panorama control-point selection: clicking a handle selects it (amber) and
  // reveals the add-point ghosts on its two adjacent segments, keeping the
  // curve uncluttered otherwise. Cleared when the polygon shrinks under it.
  const [selectedCtrl, setSelectedCtrl] = useState<number | null>(null);
  useEffect(() => {
    if (selectedCtrl !== null && (!polygon || selectedCtrl >= polygon.length)) setSelectedCtrl(null);
  }, [polygon, selectedCtrl]);

  // Panorama: the vertices are spline control points; the line drawn on the
  // map is the smooth curve through them (matching what the generator flies),
  // while the draggable handles stay on the control points themselves.
  const panoramaTangents = useSurveyStore((s) => s.config.panoramaTangents);
  const panoramaStandoff = useSurveyStore((s) => s.config.panoramaStandoff);
  const setPanoramaTangent = useSurveyStore((s) => s.setPanoramaTangent);
  const subjectCurvePositions = useMemo(() => {
    if (pattern !== 'panorama' || !polygon || polygon.length < 2) return null;
    const tangents: Array<SplineTangent | undefined> | undefined = panoramaTangents
      ? polygon.map((_, i) => panoramaTangents[i])
      : undefined;
    return bezierSpline(polygon, tangents, 5).map(toLf);
  }, [pattern, polygon, panoramaTangents]);

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

  // Camera footprints, capped for performance. Footprints come out strip by
  // strip, so taking the first N covered only the first strips and read as a
  // swath shifted off the flight path; stride instead so the preview spans the
  // whole plan.
  const footprintPolygons = useMemo(() => {
    if (!showFootprints || !result) return [];
    const all = result.footprints;
    const step = Math.max(1, Math.ceil(all.length / MAX_FOOTPRINTS));
    const out: L.LatLngExpression[][] = [];
    for (let i = 0; i < all.length; i += step) out.push(all[i]!.map(toLf));
    return out;
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
      {/* Handles must stack above the boundary/curve lines (surveyEditPane,
          640) or grabbing one pans the map / clicks the line instead. */}
      <Pane name="surveyHandlePane" style={{ zIndex: 660 }} />

      {(() => {
        // Number the decomposition cells so the per-cell colors are readable
        // as "region 1..N" instead of unexplained colored shapes. Polygon
        // overlays arrive in cell order (the engine emits paths first, then
        // one polygon per cell).
        let cellNo = 0;
        return generatorOverlays.map((ov, oi) => {
          const pts = ov.points.map((p) => [p.lat, p.lng] as [number, number]);
          const color = ov.color ?? '#2dd4bf';
          const pathOptions = {
            color,
            // The smoothed curve is advisory context; keep it visually lighter
            // than the sky-blue mission line so the two cyans read apart.
            weight: ov.type === 'polyline' ? 2 : 2,
            opacity: ov.type === 'polyline' ? 0.55 : 0.9,
            ...(ov.dashed ? { dashArray: '6, 5' } : {}),
          };
          if (ov.type !== 'polygon') {
            return <Polyline key={`gen-ov-${oi}`} positions={pts} interactive={false} pathOptions={pathOptions} />;
          }
          cellNo += 1;
          let clat = 0;
          let clng = 0;
          for (const p of ov.points) { clat += p.lat; clng += p.lng; }
          const centroid: [number, number] = [clat / ov.points.length, clng / ov.points.length];
          const badge = L.divIcon({
            className: 'survey-cell-badge',
            html: `<div style="
              min-width: 18px; height: 18px; padding: 0 4px;
              border-radius: 9px;
              background: ${color};
              color: #fff; font-size: 11px; font-weight: 600;
              display: flex; align-items: center; justify-content: center;
              border: 1.5px solid rgba(255,255,255,0.9);
              box-shadow: 0 1px 3px rgba(0,0,0,0.45);
            ">${cellNo}</div>`,
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          });
          // Labeled overlays stay interactive just enough for a hover tooltip.
          return (
            <Fragment key={`gen-ov-${oi}`}>
              <Polygon
                positions={pts}
                interactive={!!ov.label}
                pathOptions={{ ...pathOptions, fillColor: color, fillOpacity: 0.16 }}
              >
                {ov.label && <Tooltip sticky>{ov.label}</Tooltip>}
              </Polygon>
              <Marker position={centroid} icon={badge} interactive={false} />
            </Fragment>
          );
        });
      })()}

      {/* Drawing preview (polygon outline or a corridor branch centerline) */}
      {(drawMode === 'polygon' || drawMode === 'branch') && drawingPositions.length > 0 && (
        <>
          <Polyline
            positions={drawingCurvePositions ?? drawingPositions}
            pathOptions={{
              color: SURVEY_DRAWING_COLOR,
              weight: 2,
              dashArray: '8, 4',
              opacity: 0.8,
            }}
          />
          {/* Placed points stay editable DURING drawing: drag to move,
              right-click to remove. DivIcon markers don't propagate clicks to
              the map, so grabbing a handle never adds a new vertex. */}
          {drawingVertices.map((v, i) => (
            <Marker
              key={`draw-${i}`}
              position={[v.lat, v.lng]}
              icon={DRAWING_VERTEX_ICON}
              draggable
              eventHandlers={{
                drag: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  updateDrawingVertex(i, ll.lat, ll.lng);
                },
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng();
                  updateDrawingVertex(i, ll.lat, ll.lng);
                },
                contextmenu: (e) => {
                  e.originalEvent.preventDefault();
                  e.originalEvent.stopPropagation();
                  removeDrawingVertex(i);
                },
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
          {pattern === 'corridor' || pattern === 'panorama' ? (
            <>
              <Polyline
                positions={subjectCurvePositions ?? polygonPositions}
                interactive={false}
                pathOptions={{ color: '#ffffff', weight: 7, opacity: 0.85 }}
              />
              <Polyline
                positions={subjectCurvePositions ?? polygonPositions}
                pathOptions={{ color: SURVEY_POLYGON_COLOR, weight: 4, dashArray: '10, 6' }}
                eventHandlers={{
                  click: (e) => {
                    e.originalEvent.stopPropagation();
                    // Panorama: clicking the curve adds a control point on the
                    // nearest segment - that's how curvature is refined.
                    if (pattern === 'panorama' && polygon && polygon.length >= 2) {
                      const p = { lat: e.latlng.lat, lng: e.latlng.lng };
                      const edge = nearestEdgeIndexOpen(polygon, p);
                      if (edge >= 0) insertVertexAfter(edge, p.lat, p.lng);
                    }
                  },
                }}
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
                        locked={geometryLocked}
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
          {/* Panorama: tangent arms of the SELECTED anchor - drag the square
              handles to shape the curve's direction and depth at that point
              (mirrored smooth handles). Right-click an arm handle to reset the
              anchor to the automatic smooth tangent. */}
          {pattern === 'panorama' && polygon && selectedCtrl !== null && polygon[selectedCtrl] && (() => {
            const anchor = polygon[selectedCtrl]!;
            const t = panoramaTangents?.[selectedCtrl] ?? defaultSplineTangent(polygon, selectedCtrl);
            const inPos = localToLatLng(anchor, t.inX, t.inY);
            const outPos = localToLatLng(anchor, t.outX, t.outY);
            const commitArm = (arm: 'in' | 'out') => (e: L.DragEndEvent | L.LeafletEvent) => {
              const ll = (e.target as L.Marker).getLatLng();
              const d = latLngToLocal(anchor, { lat: ll.lat, lng: ll.lng });
              // Mirrored smooth handles: dragging one arm reflects the other.
              const next: SplineTangent =
                arm === 'out'
                  ? { outX: d.x, outY: d.y, inX: -d.x, inY: -d.y }
                  : { inX: d.x, inY: d.y, outX: -d.x, outY: -d.y };
              setPanoramaTangent(selectedCtrl, next);
            };
            const resetArm = (e: L.LeafletMouseEvent) => {
              e.originalEvent.preventDefault();
              e.originalEvent.stopPropagation();
              setPanoramaTangent(selectedCtrl, null);
            };
            return (
              <>
                <Polyline
                  positions={[toLf(inPos), toLf(anchor), toLf(outPos)]}
                  interactive={false}
                  pathOptions={{ color: '#f59e0b', weight: 1.5, opacity: 0.9, dashArray: '3, 3' }}
                />
                {([['in', inPos], ['out', outPos]] as const).map(([arm, pos]) => (
                  <Marker
                    key={`tangent-${arm}`}
                    position={toLf(pos)}
                    icon={TANGENT_ICON}
                    draggable={!geometryLocked}
                    pane="surveyHandlePane"
                    // `drag` fires every move so the curve reshapes in realtime;
                    // dragend is the final commit for the same math.
                    eventHandlers={{ drag: commitArm(arm), dragend: commitArm(arm), contextmenu: resetArm }}
                  >
                    <Tooltip direction="top" offset={[0, -8]} opacity={0.9} pane="vertexTooltipPane">
                      <span style={{ fontSize: '10px' }}>Drag to shape the curve · right-click to reset</span>
                    </Tooltip>
                  </Marker>
                ))}
              </>
            );
          })()}

          {/* Panorama: ghost midpoints appear on the two segments beside the
              SELECTED control point - click one to add a control point there,
              then drag it to bend the curve. */}
          {pattern === 'panorama' && !geometryLocked && polygon && polygon.length >= 2 && selectedCtrl !== null &&
            [selectedCtrl - 1, selectedCtrl].map((i) => {
              if (i < 0 || i >= polygon.length - 1) return null;
              const v = polygon[i]!;
              const next = polygon[i + 1]!;
              const mid: [number, number] = [(v.lat + next.lat) / 2, (v.lng + next.lng) / 2];
              return (
                <Marker
                  key={`ghost-${i}`}
                  position={mid}
                  icon={GHOST_VERTEX_ICON}
                  pane="surveyHandlePane"
                  eventHandlers={{
                    click: (e) => {
                      e.originalEvent.stopPropagation();
                      insertVertexAfter(i, e.latlng.lat, e.latlng.lng);
                      setSelectedCtrl(i + 1);
                    },
                  }}
                >
                  <Tooltip direction="top" offset={[0, -8]} opacity={0.9} pane="vertexTooltipPane">
                    <span style={{ fontSize: '10px' }}>Click to add a control point</span>
                  </Tooltip>
                </Marker>
              );
            })}

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
              selected={pattern === 'panorama' && selectedCtrl === i}
              onSelect={pattern === 'panorama' ? setSelectedCtrl : undefined}
              live={pattern === 'panorama'}
              locked={geometryLocked}
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

      {/* Panorama: per-waypoint camera sight lines - the static projection of
          where the camera looks at each waypoint (playback in Flight Preview
          shows the same thing over time). */}
      {pattern === 'panorama' && result?.waypointYaws && result.waypoints.map((wp, i) => {
        const yaw = result.waypointYaws![i];
        if (typeof yaw !== 'number') return null;
        const rad = (yaw * Math.PI) / 180;
        // Sight line reaches the subject: exactly the standoff distance.
        const dist = panoramaStandoff ?? 30;
        const end: [number, number] = [
          wp.lat + (Math.cos(rad) * dist) / 111320,
          wp.lng + (Math.sin(rad) * dist) / (111320 * Math.cos((wp.lat * Math.PI) / 180)),
        ];
        return (
          <Polyline
            key={`sight-${i}`}
            positions={[[wp.lat, wp.lng], end]}
            interactive={false}
            pathOptions={{ color: SURVEY_PHOTO_COLOR, weight: 1.5, opacity: 0.8, dashArray: '3, 4' }}
          />
        );
      })}

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
