/**
 * Tiered waypoint rendering for the mission map.
 *
 * Tier 1: every waypoint, always, as a dot on one canvas (waypoint-canvas-layer).
 * Tier 2: one mousemove listener + grid-index hit test for hover highlight,
 *         a single reused data-tip anchor, and click-to-select.
 * Tier 3: real interactive markers materialize only while the in-view count
 *         is at or below the settings threshold; the selected waypoint always
 *         materializes so it stays draggable at any zoom. Dragging is only
 *         possible via materialized markers by design - zoom in to edit.
 *
 * This component is thin wiring per the imperative-layer house pattern: all
 * spatial math lives in waypoint-tiers.ts, all drawing in waypoint-canvas-layer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { MissionItem } from '../../../shared/mission-types';
import { useSettingsStore } from '../../stores/settings-store';
import {
  buildGridIndex,
  collectMaterializable,
  meanConsecutiveSpacing,
  pickCellSize,
  queryNearest,
  type Bounds,
  type XY,
} from './waypoint-tiers';
import {
  createWaypointCanvasLayer,
  WAYPOINT_REF_ZOOM,
  type WaypointCanvasLayer,
  type WaypointDotInfo,
} from './waypoint-canvas-layer';
import { DEFAULT_WAYPOINT_COLOR, DraggableMarker, getCommandColor } from './waypoint-markers';

const HIT_RADIUS_PX = 10;
// Padding around the view for the materialization query so markers just past
// the edge exist before they scroll in.
const MATERIALIZE_PAD_PX = 64;

interface WaypointTiersOverlayProps {
  /** Located, visible waypoints in mission order. */
  waypoints: MissionItem[];
  surveyGroupIds: Set<string>;
  selectedSeq: number | null;
  currentSeq: number | null;
  readOnly: boolean;
  /** False while fence/rally/survey drawing owns map clicks. */
  interactive: boolean;
  showSegmentColors: boolean;
  itemColors: Map<number, string>;
  groupWaypointNumbers: Map<number, number>;
  colorByGroup: boolean;
  groupColorOf: (groupId: string | undefined) => string | undefined;
  onSelect: (seq: number) => void;
  onDragEnd: (seq: number, lat: number, lng: number) => void;
  onRightClick: (e: L.LeafletMouseEvent, wp: MissionItem) => void;
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

export function WaypointTiersOverlay({
  waypoints,
  surveyGroupIds,
  selectedSeq,
  currentSeq,
  readOnly,
  interactive,
  showSegmentColors,
  itemColors,
  groupWaypointNumbers,
  colorByGroup,
  groupColorOf,
  onSelect,
  onDragEnd,
  onRightClick,
}: WaypointTiersOverlayProps) {
  const map = useMap();
  const threshold = useSettingsStore((s) => s.surveyPerformance.maxInteractiveWaypoints);

  // Ref-zoom pixel positions + spatial index, rebuilt only on mission change.
  const points = useMemo<XY[]>(
    () =>
      waypoints.map((wp) => {
        const p = map.project([wp.latitude, wp.longitude], WAYPOINT_REF_ZOOM);
        return { x: p.x, y: p.y };
      }),
    [waypoints, map],
  );

  const index = useMemo(() => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const cellSize = points.length > 0 ? pickCellSize(maxX - minX, maxY - minY, points.length) : 1;
    return buildGridIndex(points, cellSize);
  }, [points]);

  const meanSpacing = useMemo(() => meanConsecutiveSpacing(points), [points]);

  const { infos, maxLabel } = useMemo(() => {
    let max = 1;
    const list: WaypointDotInfo[] = waypoints.map((wp) => {
      const commandColor = getCommandColor(wp.command);
      const special = commandColor !== DEFAULT_WAYPOINT_COLOR;
      // Same precedence as the markers: distinct command colors win; plain
      // waypoints take the group color in fleet view, else the segment color.
      const color = special
        ? commandColor
        : (colorByGroup ? groupColorOf(wp.groupId) : undefined) ??
          (showSegmentColors ? itemColors.get(wp.seq) : undefined) ??
          DEFAULT_WAYPOINT_COLOR;
      const num = groupWaypointNumbers.get(wp.seq) ?? wp.seq + 1;
      if (num > max) max = num;
      return { seq: wp.seq, color, label: String(num) };
    });
    return { infos: list, maxLabel: max };
  }, [waypoints, colorByGroup, groupColorOf, showSegmentColors, itemColors, groupWaypointNumbers]);

  const wpBySeq = useMemo(() => new Map(waypoints.map((wp) => [wp.seq, wp])), [waypoints]);

  // ─── Tier 1: canvas layer lifecycle ────────────────────────────────────────
  const layerRef = useRef<WaypointCanvasLayer | null>(null);
  useEffect(() => {
    const layer = createWaypointCanvasLayer(map);
    layerRef.current = layer;
    return () => {
      layerRef.current = null;
      layer.dispose();
    };
  }, [map]);

  // ─── Tier 3: materialized marker set ───────────────────────────────────────
  const [materialized, setMaterialized] = useState<ReadonlySet<number>>(() => new Set());

  const recompute = useCallback(() => {
    const next = new Set<number>();
    if (index.count > 0) {
      const crs = map.options.crs ?? L.CRS.EPSG3857;
      const scale = crs.scale(map.getZoom()) / crs.scale(WAYPOINT_REF_ZOOM);
      const pb = map.getPixelBounds();
      const min = pb.min!;
      const max = pb.max!;
      const b: Bounds = {
        minX: (min.x - MATERIALIZE_PAD_PX) / scale,
        minY: (min.y - MATERIALIZE_PAD_PX) / scale,
        maxX: (max.x + MATERIALIZE_PAD_PX) / scale,
        maxY: (max.y + MATERIALIZE_PAD_PX) / scale,
      };
      const idxs = collectMaterializable(index, b, threshold);
      if (idxs) {
        for (const i of idxs) {
          const wp = waypoints[i];
          if (wp) next.add(wp.seq);
        }
      }
    }
    // The selected waypoint is always a real draggable marker, whatever the zoom.
    if (selectedSeq !== null && wpBySeq.has(selectedSeq)) next.add(selectedSeq);
    setMaterialized((prev) => (sameSet(prev, next) ? prev : next));
  }, [map, index, threshold, waypoints, wpBySeq, selectedSeq]);

  useEffect(() => {
    recompute();
    map.on('moveend zoomend', recompute);
    return () => {
      map.off('moveend zoomend', recompute);
    };
  }, [map, recompute]);

  // ─── Tier 2: hover + click hit-testing ─────────────────────────────────────
  // Latest-value refs so the map listeners are bound once per map, not
  // re-subscribed on every data change.
  const indexRef = useRef(index);
  indexRef.current = index;
  const waypointsRef = useRef(waypoints);
  waypointsRef.current = waypoints;
  const infosRef = useRef(infos);
  infosRef.current = infos;
  const materializedRef = useRef(materialized);
  materializedRef.current = materialized;
  const interactiveRef = useRef(interactive);
  interactiveRef.current = interactive;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const hoverSeqRef = useRef<number | null>(null);
  const clearHoverRef = useRef<(() => void) | null>(null);

  // Feed the canvas whenever inputs change; drop a hover that no longer
  // resolves to an existing waypoint (deleted/hidden mid-hover).
  useEffect(() => {
    if (hoverSeqRef.current !== null && !wpBySeq.has(hoverSeqRef.current)) {
      clearHoverRef.current?.();
    }
    layerRef.current?.setData({
      index,
      infos,
      meanSpacing,
      maxLabel,
      selectedSeq,
      currentSeq,
      suppressed: materialized,
    });
  }, [index, infos, meanSpacing, maxLabel, selectedSeq, currentSeq, materialized, wpBySeq]);

  useEffect(() => {
    const container = map.getContainer();
    // The single reused tooltip anchor: a small invisible div positioned over
    // the hovered dot so the app-wide [data-tip] GlobalTooltip picks it up.
    // Native title= is banned; a canvas cannot carry per-dot tips itself.
    const anchor = document.createElement('div');
    anchor.style.cssText =
      'position:absolute;width:18px;height:18px;margin-left:-9px;margin-top:-9px;' +
      'z-index:500;cursor:pointer;display:none;';
    container.appendChild(anchor);
    let mapMoving = false;

    const clearHover = () => {
      hoverSeqRef.current = null;
      anchor.style.display = 'none';
      layerRef.current?.setHover(null);
    };
    clearHoverRef.current = clearHover;

    const onMouseMove = (e: L.LeafletMouseEvent) => {
      if (mapMoving) return;
      if (!interactiveRef.current) {
        if (hoverSeqRef.current !== null) clearHover();
        return;
      }
      const idx = indexRef.current;
      if (idx.count === 0) {
        if (hoverSeqRef.current !== null) clearHover();
        return;
      }
      const crs = map.options.crs ?? L.CRS.EPSG3857;
      const scale = crs.scale(map.getZoom()) / crs.scale(WAYPOINT_REF_ZOOM);
      const p = map.project(e.latlng, WAYPOINT_REF_ZOOM);
      const i = queryNearest(idx, p.x, p.y, HIT_RADIUS_PX / scale);
      const wp = i >= 0 ? waypointsRef.current[i] : undefined;
      // Materialized waypoints already have a real marker under the cursor;
      // double hover affordances would fight it.
      if (!wp || materializedRef.current.has(wp.seq)) {
        if (hoverSeqRef.current !== null) clearHover();
        return;
      }
      const info = infosRef.current[i];
      const cp = map.latLngToContainerPoint([wp.latitude, wp.longitude]);
      anchor.style.left = `${cp.x}px`;
      anchor.style.top = `${cp.y}px`;
      anchor.style.display = 'block';
      anchor.setAttribute('data-tip', `WP ${info?.label ?? wp.seq + 1} - ${Math.round(wp.altitude)} m`);
      if (hoverSeqRef.current !== wp.seq) {
        hoverSeqRef.current = wp.seq;
        layerRef.current?.setHover(wp.seq);
      }
    };

    // Selecting via the anchor (not a map click listener) lets us stop
    // propagation natively, so add-waypoint/shift-click handlers never fire
    // on top of a select - the same containment real markers give.
    const onAnchorClick = (ev: MouseEvent) => {
      L.DomEvent.stop(ev);
      if (hoverSeqRef.current !== null) onSelectRef.current(hoverSeqRef.current);
    };
    anchor.addEventListener('click', onAnchorClick);

    const onMoveStart = () => {
      mapMoving = true;
      clearHover();
    };
    const onMoveEnd = () => {
      mapMoving = false;
    };

    map.on('mousemove', onMouseMove);
    map.on('mouseout', clearHover);
    map.on('movestart zoomstart', onMoveStart);
    map.on('moveend zoomend', onMoveEnd);
    return () => {
      map.off('mousemove', onMouseMove);
      map.off('mouseout', clearHover);
      map.off('movestart zoomstart', onMoveStart);
      map.off('moveend zoomend', onMoveEnd);
      anchor.removeEventListener('click', onAnchorClick);
      anchor.remove();
      clearHoverRef.current = null;
    };
  }, [map]);

  // ─── Tier 3: the materialized markers themselves ───────────────────────────
  const markers: MissionItem[] = [];
  for (const seq of materialized) {
    const wp = wpBySeq.get(seq);
    if (wp) markers.push(wp);
  }

  return (
    <>
      {markers.map((wp) => {
        const isSurvey = !!(wp.groupId && surveyGroupIds.has(wp.groupId));
        return (
          <DraggableMarker
            key={wp.seq}
            wp={wp}
            variant={isSurvey ? 'dot' : 'pin'}
            isSelected={wp.seq === selectedSeq}
            isCurrent={wp.seq === currentSeq}
            onSelect={onSelect}
            onDragEnd={onDragEnd}
            onRightClick={onRightClick}
            readOnly={readOnly}
            segmentColor={showSegmentColors ? itemColors.get(wp.seq) : undefined}
            displayNumber={groupWaypointNumbers.get(wp.seq)}
            groupColor={colorByGroup ? groupColorOf(wp.groupId) : undefined}
          />
        );
      })}
    </>
  );
}
