/**
 * attachObjectInteractions — wires objects-store to a MapLibre map.
 *
 * Tools:
 *   select   — click an object to select; drag its body to move; drag the
 *              transform handles to rotate / scale (about the opposite corner).
 *   polygon  — click to add points, double-click to finish.
 *   corridor — click to lay a centerline, double-click to finish.
 *   rectangle/circle — drag on the map; the object is created on release.
 *   edit     — drag the selected object's vertices; click an edge to insert;
 *              right-click a vertex to delete (vertex-editable objects only).
 *   measure  — click to drop points; live rubber-band + on-map readout; the
 *              measurement persists until cleared. Double-click ends it.
 *
 * Returns a cleanup that removes every listener, subscription and DOM node.
 */

import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapMouseEvent, MapLayerMouseEvent } from 'maplibre-gl';
import { useObjectsStore, type ContextTarget } from './objects-store';
import {
  makeRectangle, makeCircle, translateObject, rotateObject, scaleObjectAbout,
  worldToLocal, objectWorldRing, isVertexEditable, type EditorObject, type LocalPt,
} from './area-object';
import { buildObjectsData, buildTransformHandles, buildVertexHandles, buildDraftData } from './objects-geo';
import { rectangleRing, circleRing, nearestEdgeIndex, polylineLength } from '../components/survey/geo-edit';
import { latLngToLocal, distanceLatLng, polygonArea } from '../components/survey/geo-math';
import { useSettingsStore } from '../stores/settings-store';
import { formatSurveyDistanceM } from './survey-units';
import { formatAreaFromSquareMeters } from '../../shared/user-units.js';
import type { LatLng } from '../components/survey/survey-types';

function src(map: maplibregl.Map, id: string): GeoJSONSource | null {
  const s = map.getSource(id);
  return s ? (s as GeoJSONSource) : null;
}

const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

function buildMeasureData(points: LatLng[], cursor: LatLng | null, selected: boolean): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];
  const line = cursor && points.length >= 1 ? [...points, cursor] : points;
  if (line.length >= 2) features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line.map((p) => [p.lng, p.lat]) }, properties: { selected } });
  points.forEach((p, i) => features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p.lng, p.lat] }, properties: { selected, index: i } }));
  return { type: 'FeatureCollection', features };
}

function formatDist(m: number): string {
  return formatSurveyDistanceM(m, useSettingsStore.getState().unitPreferences.distance);
}
function formatArea(m2: number): string {
  return formatAreaFromSquareMeters(m2, useSettingsStore.getState().unitPreferences.area);
}

type Drag =
  | { kind: 'move'; obj0: EditorObject; start: LatLng }
  | { kind: 'rotate'; obj0: EditorObject; startAngle: number }
  | { kind: 'scale'; obj0: EditorObject; anchor: LocalPt; hx: number; hy: number; axis: 'xy' | 'x' | 'y' }
  | { kind: 'vertex'; index: number }
  | { kind: 'measureVertex'; index: number }
  | { kind: 'shape'; tool: 'rectangle' | 'circle'; anchor: LatLng }
  | null;

/** Pointer angle (degrees, CCW from east) about an object's center. */
function pointerAngle(center: LatLng, p: LatLng): number {
  const l = latLngToLocal(center, p);
  return (Math.atan2(l.y, l.x) * 180) / Math.PI;
}

export function attachObjectInteractions(map: maplibregl.Map): () => void {
  const get = useObjectsStore.getState;

  let drag: Drag = null;
  // A geometry drag records ONE history entry, lazily on its first actual move
  // (so a click that only selects doesn't create a spurious undo step).
  let dragHistoryPushed = false;
  let draftCursor: LatLng | null = null;
  let measureCursor: LatLng | null = null;
  let shapePreview: LatLng[] | null = null;
  let splitStart: LatLng | null = null; // first click of the split (slice) line
  let splitCursor: LatLng | null = null;

  // Floating measure readout near the cursor.
  const label = document.createElement('div');
  label.style.cssText =
    'position:absolute;z-index:5;pointer-events:none;display:none;transform:translate(12px,12px);' +
    'padding:2px 6px;border-radius:6px;font:600 11px/1.4 system-ui,sans-serif;white-space:nowrap;' +
    'background:#f59e0b;color:#1a1300;box-shadow:0 1px 4px rgba(0,0,0,0.4);';
  map.getContainer().appendChild(label);

  function selectedObject(): EditorObject | null {
    const { objects, selectedId } = get();
    return objects.find((o) => o.id === selectedId) ?? null;
  }

  function syncObjects(): void {
    const { objects, selectedId, tool, selectedVertex, draftPoints, measurePoints } = get();
    src(map, 'objects')?.setData(buildObjectsData(objects, selectedId));

    const sel = objects.find((o) => o.id === selectedId) ?? null;
    src(map, 'handles')?.setData(
      sel && tool === 'select' ? buildTransformHandles(sel) : EMPTY_FC,
    );
    src(map, 'vertices')?.setData(
      sel && tool === 'edit' && isVertexEditable(sel) ? buildVertexHandles(sel, selectedVertex) : EMPTY_FC,
    );

    const draftType = get().draftType;
    const splitLine = tool === 'split' && splitStart && splitCursor
      ? ({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: [splitStart, splitCursor].map((p) => [p.lng, p.lat]) }, properties: {} }] } as GeoJSON.FeatureCollection)
      : null;
    src(map, 'draft')?.setData(
      splitLine
        ? splitLine
        : shapePreview
          ? { type: 'FeatureCollection', features: shapePreview.length >= 3 ? [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...shapePreview, shapePreview[0]!].map((p) => [p.lng, p.lat])] }, properties: {} }] : [] }
          : draftType
            ? buildDraftData(draftPoints, draftCursor)
            : EMPTY_FC,
    );

    src(map, 'measure')?.setData(buildMeasureData(measurePoints, get().tool === 'measure' ? measureCursor : null, get().selectedMeasure));
    if (measurePoints.length === 0) label.style.display = 'none';
  }

  syncObjects();

  function updateMeasureLabel(pt: maplibregl.Point | null): void {
    const { tool, measurePoints } = get();
    if (tool !== 'measure' || measurePoints.length === 0 || !pt) { label.style.display = 'none'; return; }
    const chain = measureCursor ? [...measurePoints, measureCursor] : measurePoints;
    let text = formatDist(polylineLength(chain));
    if (chain.length >= 3) text += ` · ${formatArea(polygonArea(chain))}`;
    label.textContent = text;
    label.style.left = `${pt.x}px`;
    label.style.top = `${pt.y}px`;
    label.style.display = 'block';
  }

  // Re-sync whenever the relevant state changes.
  const unsubState = useObjectsStore.subscribe(
    (s) => ({ o: s.objects, sel: s.selectedId, t: s.tool, v: s.selectedVertex, d: s.draftPoints, m: s.measurePoints, sm: s.selectedMeasure }),
    () => syncObjects(),
    { equalityFn: () => false },
  );

  // Cursor + dblclick-zoom per tool.
  const unsubTool = useObjectsStore.subscribe(
    (s) => s.tool,
    (tool) => {
      const placing = tool === 'polygon' || tool === 'corridor' || tool === 'measure' || tool === 'rectangle' || tool === 'circle' || tool === 'hole' || tool === 'split';
      if (placing) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
      map.getCanvas().style.cursor = placing ? 'crosshair' : '';
      if (tool !== 'measure') { measureCursor = null; label.style.display = 'none'; }
      if (tool !== 'split') { splitStart = null; splitCursor = null; }
      draftCursor = null;
      syncObjects();
    },
  );

  // ---- select tool: start drags on handles / object body ----
  const onScaleDown = (e: MapLayerMouseEvent): void => {
    if (e.originalEvent.button !== 0) return; // left button only; right-click must reach contextmenu
    if (get().tool !== 'select') return;
    const obj0 = selectedObject();
    const f = e.features?.[0];
    if (!obj0 || !f) return;
    const p = f.properties ?? {};
    drag = {
      kind: 'scale', obj0,
      anchor: { x: Number(p['ax']), y: Number(p['ay']) },
      hx: Number(p['hx']), hy: Number(p['hy']),
      axis: (p['axis'] as 'xy' | 'x' | 'y') ?? 'xy',
    };
    dragHistoryPushed = false;
    map.dragPan.disable();
    e.preventDefault();
  };
  const onRotateDown = (e: MapLayerMouseEvent): void => {
    if (e.originalEvent.button !== 0) return;
    if (get().tool !== 'select') return;
    const obj0 = selectedObject();
    if (!obj0) return;
    drag = { kind: 'rotate', obj0, startAngle: pointerAngle(obj0.center, { lat: e.lngLat.lat, lng: e.lngLat.lng }) };
    dragHistoryPushed = false;
    map.dragPan.disable();
    e.preventDefault();
  };
  const onObjectDown = (e: MapLayerMouseEvent): void => {
    if (e.originalEvent.button !== 0) return; // right-click is for the context menu
    const t = get().tool;
    if (t !== 'select' && t !== 'edit') return;
    const id = e.features?.[0]?.properties?.['id'];
    if (typeof id !== 'string') return;
    get().selectObject(id);
    // In edit mode, clicking a shape just makes it the active object so its
    // vertices appear — point editing happens via the vertex / outline handlers.
    if (t === 'edit') return;
    const obj0 = get().objects.find((o) => o.id === id);
    if (!obj0) return;
    drag = { kind: 'move', obj0, start: { lat: e.lngLat.lat, lng: e.lngLat.lng } };
    dragHistoryPushed = false;
    map.dragPan.disable();
    e.preventDefault();
  };

  // ---- edit tool: vertex drag / insert / delete ----
  const onVertexDown = (e: MapLayerMouseEvent): void => {
    if (e.originalEvent.button !== 0) return;
    if (get().tool !== 'edit') return;
    const idx = e.features?.[0]?.properties?.['vertex'];
    if (typeof idx !== 'number') return;
    get().selectVertex(idx);
    drag = { kind: 'vertex', index: idx };
    dragHistoryPushed = false;
    map.dragPan.disable();
    e.preventDefault();
  };
  const onOutlineClick = (e: MapLayerMouseEvent): void => {
    if (get().tool !== 'edit') return;
    const sel = selectedObject();
    // Clicking a different object's edge selects it rather than inserting a
    // vertex on the currently-selected shape.
    const clickedId = e.features?.[0]?.properties?.['id'];
    if (typeof clickedId === 'string' && clickedId !== sel?.id) {
      get().selectObject(clickedId);
      return;
    }
    if (!sel || !isVertexEditable(sel)) return;
    const i = nearestEdgeIndex(objectWorldRing(sel), { lat: e.lngLat.lat, lng: e.lngLat.lng });
    get().insertVertexAfter(i, { lat: e.lngLat.lat, lng: e.lngLat.lng });
  };
  const onVertexContext = (e: MapLayerMouseEvent): void => {
    e.preventDefault();
    if (get().tool !== 'edit') return;
    const idx = e.features?.[0]?.properties?.['vertex'];
    if (typeof idx === 'number') get().deleteVertex(idx);
  };

  // ---- select tool: drag a point of the selected measurement ----
  const onMeasureVertexDown = (e: MapLayerMouseEvent): void => {
    if (e.originalEvent.button !== 0) return;
    if (get().tool !== 'select' || !get().selectedMeasure) return;
    const idx = e.features?.[0]?.properties?.['index'];
    if (typeof idx !== 'number') return;
    drag = { kind: 'measureVertex', index: idx };
    dragHistoryPushed = false;
    map.dragPan.disable();
    e.preventDefault();
  };

  // ---- shape tools: drag to create ----
  const onShapeDown = (e: MapMouseEvent): void => {
    if (e.originalEvent.button !== 0) return;
    const t = get().tool;
    if (t !== 'rectangle' && t !== 'circle') return;
    drag = { kind: 'shape', tool: t, anchor: { lat: e.lngLat.lat, lng: e.lngLat.lng } };
    shapePreview = null;
    map.dragPan.disable();
    e.preventDefault();
  };

  // ---- generic move / up for all drags ----
  const onMove = (e: MapMouseEvent): void => {
    const p: LatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng };

    if (drag) {
      // Record one undo step the moment a geometry drag actually moves.
      if (!dragHistoryPushed && drag.kind !== 'shape') {
        get().pushHistory();
        dragHistoryPushed = true;
      }
      if (drag.kind === 'move') {
        get().replaceObject(translateObject(drag.obj0, p.lat - drag.start.lat, p.lng - drag.start.lng));
      } else if (drag.kind === 'rotate') {
        const delta = pointerAngle(drag.obj0.center, p) - drag.startAngle;
        get().replaceObject(rotateObject(drag.obj0, delta));
      } else if (drag.kind === 'scale') {
        const pl = worldToLocal(drag.obj0, p);
        const denomX = drag.hx - drag.anchor.x;
        const denomY = drag.hy - drag.anchor.y;
        const sx = drag.axis === 'y' || Math.abs(denomX) < 1e-6 ? 1 : (pl.x - drag.anchor.x) / denomX;
        const sy = drag.axis === 'x' || Math.abs(denomY) < 1e-6 ? 1 : (pl.y - drag.anchor.y) / denomY;
        get().replaceObject(scaleObjectAbout(drag.obj0, sx, sy, drag.anchor));
      } else if (drag.kind === 'vertex') {
        get().moveVertex(drag.index, p);
      } else if (drag.kind === 'measureVertex') {
        get().moveMeasurePoint(drag.index, p);
      } else if (drag.kind === 'shape') {
        shapePreview = drag.tool === 'rectangle'
          ? rectangleRing(drag.anchor, p)
          : circleRing(drag.anchor, distanceLatLng(drag.anchor, p));
        syncObjects();
      }
      return;
    }

    // No drag: update draft / measure rubber-bands.
    const t = get().tool;
    if ((t === 'polygon' || t === 'corridor' || t === 'hole') && get().draftPoints.length >= 1) {
      draftCursor = p;
      syncObjects();
    } else if (t === 'split' && splitStart) {
      splitCursor = p;
      syncObjects();
    } else if (t === 'measure') {
      // A finished measurement stays static — no rubber band to the cursor.
      if (get().measureDone) return;
      measureCursor = p;
      syncObjects();
      updateMeasureLabel(e.point);
    }
  };

  const onUp = (): void => {
    if (!drag) return;
    if (drag.kind === 'shape' && shapePreview) {
      const anchor = drag.anchor;
      const last = shapePreview[Math.floor(shapePreview.length / 2)] ?? anchor;
      if (drag.tool === 'rectangle') {
        const center: LatLng = { lat: (anchor.lat + last.lat) / 2, lng: (anchor.lng + last.lng) / 2 };
        const half = latLngToLocal(center, anchor);
        const w = Math.abs(half.x) * 2;
        const h = Math.abs(half.y) * 2;
        if (w > 1 && h > 1) get().addObject(makeRectangle(center, w, h, `Rectangle ${get().nameSeq + 1}`));
      } else {
        const r = distanceLatLng(anchor, last);
        if (r > 1) get().addObject(makeCircle(anchor, r, `Circle ${get().nameSeq + 1}`));
      }
    }
    drag = null;
    shapePreview = null;
    map.dragPan.enable();
    syncObjects();
  };

  // ---- click (draft / measure / deselect) ----
  const onClick = (e: MapMouseEvent): void => {
    const t = get().tool;
    if (t === 'polygon' || t === 'corridor' || t === 'hole') {
      // Hole tool: the first click also targets the area underneath, so the user
      // doesn't have to select it first (unless a suitable area is already chosen).
      if (t === 'hole' && get().draftPoints.length === 0) {
        const cur = selectedObject();
        if (!cur || cur.type === 'corridor') {
          const hit = map.queryRenderedFeatures(e.point, { layers: ['objects-fill'] });
          const id = hit[0]?.properties?.['id'];
          if (typeof id === 'string') {
            const obj = get().objects.find((o) => o.id === id);
            if (obj && obj.type !== 'corridor') get().selectObject(id);
          }
        }
      }
      get().addDraftPoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    } else if (t === 'split') {
      const p: LatLng = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      if (!splitStart) {
        splitStart = p;
        splitCursor = p;
      } else {
        get().splitSelectedByLine(splitStart, p);
        splitStart = null;
        splitCursor = null;
      }
      syncObjects();
    } else if (t === 'measure') {
      get().addMeasurePoint({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    } else if (t === 'select') {
      if (drag) return;
      const objHits = map.queryRenderedFeatures(e.point, { layers: ['objects-fill', 'handles-scale', 'handles-rotate', 'vertices-circle'] });
      if (objHits.length > 0) return; // an object/handle was clicked — selection handled on mousedown
      // Clicking the ruler selects it; clicking truly empty map deselects all.
      const measureHits = map.queryRenderedFeatures(e.point, { layers: ['measure-line', 'measure-points'] });
      if (measureHits.length > 0) get().selectMeasure();
      else get().selectObject(null);
    }
  };

  const onDblClick = (e: MapMouseEvent): void => {
    const t = get().tool;
    if (t === 'polygon' || t === 'corridor') {
      e.preventDefault();
      draftCursor = null;
      get().finishDraft();
    } else if (t === 'hole') {
      e.preventDefault();
      draftCursor = null;
      get().finishHole();
    } else if (t === 'measure') {
      // Finish the measurement but keep it on screen; pin the readout to the
      // last point. Staying in the measure tool lets the next click start a
      // fresh measurement.
      e.preventDefault();
      measureCursor = null;
      get().endMeasure();
      syncObjects();
      const pts = get().measurePoints;
      const last = pts[pts.length - 1];
      if (last) updateMeasureLabel(map.project([last.lng, last.lat]));
    }
  };

  // Right-click anything (object / ruler / empty map) to open a context menu.
  const onMapContext = (e: MapMouseEvent): void => {
    e.preventDefault();
    // In edit mode a right-click on a vertex deletes it (see onVertexContext);
    // don't also pop a menu in that case.
    if (get().tool === 'edit' && map.queryRenderedFeatures(e.point, { layers: ['vertices-circle'] }).length > 0) return;
    const objHit = map.queryRenderedFeatures(e.point, { layers: ['objects-fill', 'objects-outline'] });
    const measurePtHit = map.queryRenderedFeatures(e.point, { layers: ['measure-points'] });
    const measureLineHit = map.queryRenderedFeatures(e.point, { layers: ['measure-line'] });
    let target: ContextTarget;
    const hitId = objHit[0]?.properties?.['id'];
    if (typeof hitId === 'string') {
      get().selectObject(hitId);
      target = { kind: 'object', id: hitId };
    } else if (measurePtHit.length > 0 || measureLineHit.length > 0) {
      get().selectMeasure();
      const idx = measurePtHit[0]?.properties?.['index'];
      target = { kind: 'measure', world: { lat: e.lngLat.lat, lng: e.lngLat.lng }, pointIndex: typeof idx === 'number' ? idx : undefined };
    } else {
      target = { kind: 'empty' };
    }
    const oe = e.originalEvent;
    get().openContextMenu({ x: oe.clientX, y: oe.clientY, target });
  };

  // Pointer feedback over interactive features in select/edit mode.
  const setPointer = (): void => { map.getCanvas().style.cursor = 'pointer'; };
  // Over a measure point: a move cue once the ruler is selected (drag to edit).
  const onMeasurePointEnter = (): void => {
    map.getCanvas().style.cursor = get().tool === 'select' && get().selectedMeasure ? 'move' : 'pointer';
  };
  const clearPointer = (): void => {
    const t = get().tool;
    map.getCanvas().style.cursor = (t === 'polygon' || t === 'corridor' || t === 'measure' || t === 'rectangle' || t === 'circle' || t === 'hole' || t === 'split') ? 'crosshair' : '';
  };

  // Edit tool: hovering the active shape's edge shows an add-point ("+") cursor;
  // over a vertex keep the move cue, over another shape keep the select cue.
  const onOutlineMove = (e: MapLayerMouseEvent): void => {
    if (get().tool !== 'edit') return;
    const sel = selectedObject();
    const hoveredId = e.features?.[0]?.properties?.['id'];
    if (sel && isVertexEditable(sel) && hoveredId === sel.id) {
      const onVertex = map.queryRenderedFeatures(e.point, { layers: ['vertices-circle'] }).length > 0;
      map.getCanvas().style.cursor = onVertex ? 'pointer' : 'copy';
    } else {
      map.getCanvas().style.cursor = 'pointer';
    }
  };

  map.on('mousedown', 'handles-scale', onScaleDown);
  map.on('mousedown', 'handles-rotate', onRotateDown);
  map.on('mousedown', 'objects-fill', onObjectDown);
  map.on('mousedown', 'vertices-circle', onVertexDown);
  map.on('mousedown', 'measure-points', onMeasureVertexDown);
  map.on('click', 'objects-outline', onOutlineClick);
  map.on('mousemove', 'objects-outline', onOutlineMove);
  map.on('mouseleave', 'objects-outline', clearPointer);
  map.on('contextmenu', 'vertices-circle', onVertexContext);
  map.on('contextmenu', onMapContext);
  map.on('mousedown', onShapeDown);
  map.on('mousemove', onMove);
  map.on('mouseup', onUp);
  map.on('click', onClick);
  map.on('dblclick', onDblClick);
  for (const lyr of ['objects-fill', 'handles-scale', 'handles-rotate', 'vertices-circle']) {
    map.on('mouseenter', lyr, setPointer);
    map.on('mouseleave', lyr, clearPointer);
  }
  map.on('mouseenter', 'measure-points', onMeasurePointEnter);
  map.on('mouseleave', 'measure-points', clearPointer);

  return () => {
    unsubState();
    unsubTool();
    map.dragPan.enable();
    map.doubleClickZoom.enable();
    map.getCanvas().style.cursor = '';
    map.off('mousedown', 'handles-scale', onScaleDown);
    map.off('mousedown', 'handles-rotate', onRotateDown);
    map.off('mousedown', 'objects-fill', onObjectDown);
    map.off('mousedown', 'vertices-circle', onVertexDown);
    map.off('mousedown', 'measure-points', onMeasureVertexDown);
    map.off('click', 'objects-outline', onOutlineClick);
    map.off('mousemove', 'objects-outline', onOutlineMove);
    map.off('mouseleave', 'objects-outline', clearPointer);
    map.off('contextmenu', 'vertices-circle', onVertexContext);
    map.off('contextmenu', onMapContext);
    map.off('mousedown', onShapeDown);
    map.off('mousemove', onMove);
    map.off('mouseup', onUp);
    map.off('click', onClick);
    map.off('dblclick', onDblClick);
    for (const lyr of ['objects-fill', 'handles-scale', 'handles-rotate', 'vertices-circle']) {
      map.off('mouseenter', lyr, setPointer);
      map.off('mouseleave', lyr, clearPointer);
    }
    map.off('mouseenter', 'measure-points', onMeasurePointEnter);
    map.off('mouseleave', 'measure-points', clearPointer);
    label.remove();
  };
}
