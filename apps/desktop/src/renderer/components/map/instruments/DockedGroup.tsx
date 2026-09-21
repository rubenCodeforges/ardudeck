/**
 * One docked instrument group. Two shapes:
 * - card/tray: members merge into a single chrome (hairline dividers; a
 *   lighter tray when a round gauge is aboard) and share the group's scale.
 * - cluster: a free-form constellation around the attitude ball; members keep
 *   their own chrome AND their own scale, pinned at the px offset where they
 *   were dropped, and the whole formation drags as one.
 * A member's hover pill drags it out (undocks past UNDOCK_PX; inside a card
 * it reorders, inside a cluster it repositions). The ball's pill breaks the
 * whole cluster apart in place.
 */
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDraggableOverlay } from '../useDraggableOverlay';
import {
  useMapInstrumentsStore,
  INSTRUMENT_SCALE_MIN,
  INSTRUMENT_SCALE_MAX,
  INSTRUMENT_SCALE_STEP,
  type InstrumentDisplayMode,
} from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS, resolveInstrumentComponent, isRoundInMode } from './registry';
import { variantGlyph } from './variant-glyphs';
import { useGroupShapeStore } from '../../../stores/group-shape-store';
import { GAUGE_COLORS } from './RoundGauge';
import { DockedContext } from './dock-context';
import { groupOverlayKey, isCluster, groupDisplayOptions, CLUSTER_ANCHOR, type DockGroup } from './dock-groups';
import { memberInsertionIndex, isOutsideUndockZone, snapToBallEdge, type DockRect } from './dock-snap';
import { useDockPreviewStore, measureGroupDockCandidate, commitGroupDock, type MeasuredCandidate } from './dock-tracking';

const RESIZE_PX_PER_SCALE_UNIT = 100;
const DOCK_EASE = 'cubic-bezier(0.05, 0.7, 0.1, 1.0)';
/** How far the constellation's shared backdrop reaches beyond each member. */
const BLOB_PAD = 7;

function clampScale(v: number): number {
  const stepped = Math.round(v / INSTRUMENT_SCALE_STEP) * INSTRUMENT_SCALE_STEP;
  const rounded = Math.round(stepped * 100) / 100;
  return Math.max(INSTRUMENT_SCALE_MIN, Math.min(INSTRUMENT_SCALE_MAX, rounded));
}

function containerRectOf(el: HTMLElement): { rect: DockRect; left: number; top: number } | null {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return null;
  const p = parent.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { rect: { x: r.left - p.left, y: r.top - p.top, w: r.width, h: r.height }, left: p.left, top: p.top };
}

function GroupDisplayPopover({
  title,
  ids,
  options,
  anchorRect,
  onClose,
}: {
  title: string;
  ids: string[];
  options: Array<{ id: string; label: string }>;
  anchorRect: DOMRect;
  onClose: () => void;
}): JSX.Element {
  const displayMode = useMapInstrumentsStore((s) => s.displayMode);
  const setDisplayModes = useMapInstrumentsStore((s) => s.setDisplayModes);
  const width = 216;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - width - 8));
  const belowTop = anchorRect.bottom + 6;
  const top = belowTop + 130 > window.innerHeight ? Math.max(8, anchorRect.top - 136) : belowTop;
  // Active only when every switchable member already shows that mode.
  const shared = ids.every((id) => (displayMode[id] ?? 'analog') === (displayMode[ids[0]!] ?? 'analog'))
    ? displayMode[ids[0]!] ?? 'analog'
    : null;
  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div className="fixed z-[9999] rounded-lg bg-surface-solid border border-subtle shadow-xl" style={{ top, left, width }}>
        <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary border-b border-subtle">{title}</div>
        <div className="p-2">
          <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1.5">Display for all</div>
          <div className="grid grid-cols-3 gap-1.5">
            {options.map((opt) => {
              const active = shared === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDisplayModes(ids, opt.id as InstrumentDisplayMode)}
                  data-tip={`${opt.label} display for the whole group`}
                  className={
                    'flex flex-col items-center justify-center gap-1 py-1.5 rounded-md border transition-colors ' +
                    (active
                      ? 'border-blue-500/60 bg-blue-500/10 text-blue-400'
                      : 'border-subtle text-content-secondary hover:border-default hover:text-content hover:bg-surface-raised')
                  }
                >
                  <span className="w-5 h-5 flex items-center justify-center">{variantGlyph(opt.id)}</span>
                  <span className="text-[10px] leading-none">{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

function UndockIcon(): JSX.Element {
  return (
    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 8V6a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2h-2M4 8h10a2 2 0 012 2v10H6a2 2 0 01-2-2V8z" />
    </svg>
  );
}

export function DockedGroup({ gid, group }: { gid: string; group: DockGroup }): JSX.Element {
  // A ball-in-card group clamps by its CARD edges: the ball's bulge may hang
  // off the panel so the strip run itself can reach the screen edge.
  const overhangRef = useRef<{ top: number; right: number; bottom: number; left: number } | null>(null);
  const drag = useDraggableOverlay(groupOverlayKey(gid), () => overhangRef.current);
  const cluster = isCluster(group);
  const scaleKey = 'group:' + gid;
  const storedScale = useMapInstrumentsStore((s) => s.scale[scaleKey] ?? 1);
  const memberScales = useMapInstrumentsStore((s) => s.scale);
  const setScale = useMapInstrumentsStore((s) => s.setScale);
  const globalOpacity = useMapInstrumentsStore((s) => s.opacity);
  const displayMode = useMapInstrumentsStore((s) => s.displayMode);
  const groupShapeMode = useGroupShapeStore((s) => s.mode);
  const dockRemove = useMapInstrumentsStore((s) => s.dockRemove);
  const dockReorder = useMapInstrumentsStore((s) => s.dockReorder);
  const dockSetClusterOffset = useMapInstrumentsStore((s) => s.dockSetClusterOffset);
  const dockSetStretch = useMapInstrumentsStore((s) => s.dockSetStretch);
  const dockDissolve = useMapInstrumentsStore((s) => s.dockDissolve);

  const [liveScale, setLiveScale] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [hoveredMember, setHoveredMember] = useState<string | null>(null);
  const [ghost, setGhost] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [reorderTo, setReorderTo] = useState<number | null>(null);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [displayAnchor, setDisplayAnchor] = useState<DOMRect | null>(null);
  const [cellSizes, setCellSizes] = useState<Record<string, { x: number; y: number; w: number; h: number }> | null>(null);
  const [bodySize, setBodySize] = useState<{ w: number; h: number } | null>(null);
  const [panelExt, setPanelExt] = useState<{ before: number; after: number } | null>(null);
  const [naturalCross, setNaturalCross] = useState<Record<string, number>>({});
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const innerRefs = useRef(new Map<string, HTMLElement>());
  const dragMain = useRef(0);
  const resize = useRef<{ startX: number; startY: number; startScale: number } | null>(null);
  const scale = liveScale ?? storedScale;

  const dragRef = drag.ref;
  const setRefs = useCallback((el: HTMLDivElement | null) => {
    wrapperRef.current = el;
    dragRef(el);
  }, [dragRef]);
  const measureOnlyRef = useCallback((el: HTMLDivElement | null) => {
    wrapperRef.current = el;
  }, []);
  // A cluster wrapper has no intrinsic size (absolute cells): deriving the
  // drag anchor before the measured union lands would skew center anchors by
  // half the width, so the drag ref waits for the first measurement.
  const sized = !cluster || cellSizes !== null;

  const members = group.members
    .map((id) => MAP_INSTRUMENTS.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d);
  // Members that bulge the shared flat card, per groupShapeMode.
  const isRoundNow = (id: string): boolean => {
    const def = members.find((d) => d.id === id);
    return !!def && isRoundInMode(def, displayMode[id] ?? 'analog');
  };
  const bulgeIds = (() => {
    if (cluster || groupShapeMode === 'square') return new Set<string>();
    const ids = group.members;
    if (groupShapeMode === 'roundedAll') {
      return new Set(ids.filter((id) => isRoundNow(id)));
    }
    const out = new Set<string>();
    if (ids.includes(CLUSTER_ANCHOR) && isRoundNow(CLUSTER_ANCHOR)) out.add(CLUSTER_ANCHOR);
    const first = ids[0];
    const last = ids[ids.length - 1];
    if (first !== undefined && isRoundNow(first)) out.add(first);
    if (ids.length > 1 && last !== undefined && isRoundNow(last)) out.add(last);
    return out;
  })();
  const shapedGroup = !cluster && bulgeIds.size > 0;
  const stretched = !cluster && group.stretch === true;
  const tray = !cluster && !shapedGroup && members.some((d) => isRoundInMode(d, displayMode[d.id] ?? 'analog'));
  const row = group.orientation === 'row';
  const displayChoices = groupDisplayOptions(members);

  // Cross-axis fit: the group is as wide (col) or tall (row) as its first
  // non-bulging member, and a member that does not fit is zoomed down to it.
  // Without this a single wide instrument (the flight-control card's
  // min-w-[248px]) stretched every sibling and resized the whole group.
  const fitAnchorId = !cluster ? members.find((d) => !bulgeIds.has(d.id))?.id ?? null : null;
  const fitBasis = fitAnchorId ? naturalCross[fitAnchorId] ?? null : null;
  const isFitted = (id: string): boolean => !cluster && !bulgeIds.has(id);
  const fitOf = (id: string): number => {
    if (!fitBasis || id === fitAnchorId || !isFitted(id)) return 1;
    const n = naturalCross[id];
    return n && n > fitBasis ? fitBasis / n : 1;
  };

  const offsetOf = (id: string): { x: number; y: number } =>
    id === CLUSTER_ANCHOR ? { x: 0, y: 0 } : group.offsets?.[id] ?? { x: 0, y: 0 };
  const shift = cluster
    ? {
        x: Math.max(0, ...group.members.map((m) => -offsetOf(m).x)),
        y: Math.max(0, ...group.members.map((m) => -offsetOf(m).y)),
      }
    : { x: 0, y: 0 };

  // The cluster body sizes itself to the union of its absolute cells so the
  // wrapper stays draggable/clampable and measurable by the arranger.
  useLayoutEffect(() => {
    if (!cluster && !shapedGroup) return;
    const measure = () => {
      const sizes: Record<string, { x: number; y: number; w: number; h: number }> = {};
      for (const id of group.members) {
        const el = cellRefs.current.get(id);
        if (el && el.offsetWidth > 0) sizes[id] = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      }
      if (Object.keys(sizes).length === 0) return;
      const first = cellRefs.current.values().next().value as HTMLElement | undefined;
      const body = first?.offsetParent as HTMLElement | null;
      if (body) {
        setBodySize((prev) =>
          prev && prev.w === body.clientWidth && prev.h === body.clientHeight
            ? prev
            : { w: body.clientWidth, h: body.clientHeight },
        );
      }
      setCellSizes((prev) => {
        if (prev && Object.keys(prev).length === Object.keys(sizes).length
          && Object.entries(sizes).every(([id, s]) => {
            const q = prev[id];
            return q && q.x === s.x && q.y === s.y && q.w === s.w && q.h === s.h;
          })) return prev;
        return sizes;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of cellRefs.current.values()) ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cluster, shapedGroup, group, memberScales, displayMode]);

  // offsetWidth/Height on the inner is pre-zoom, so a member already scaled
  // down still reports its natural size and the factor stays stable.
  useLayoutEffect(() => {
    if (cluster) return;
    const measure = () => {
      const next: Record<string, number> = {};
      for (const [id, el] of innerRefs.current) {
        const v = row ? el.offsetHeight : el.offsetWidth;
        if (v > 0) next[id] = v;
      }
      if (Object.keys(next).length === 0) return;
      setNaturalCross((prev) => {
        const keys = Object.keys(next);
        if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) return prev;
        return next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    for (const el of innerRefs.current.values()) ro.observe(el);
    return () => ro.disconnect();
  }, [cluster, row, group, memberScales, displayMode]);

  // Stretching never moves the members: the bar reaches the panel edges by
  // extending the chrome PAST the body on the main axis, and the group's
  // position is fixed while stretched.
  const measurePanelExt = () => {
    if (!stretched) {
      setPanelExt((prev) => (prev === null ? prev : null));
      return;
    }
    const el = wrapperRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const before = Math.round(row ? el.offsetLeft : el.offsetTop);
    const after = Math.round(row
      ? parent.clientWidth - el.offsetLeft - el.offsetWidth
      : parent.clientHeight - el.offsetTop - el.offsetHeight);
    setPanelExt((prev) => (prev && prev.before === before && prev.after === after ? prev : { before, after }));
  };
  // Value deps, not every-commit: the wrapper moves when the overlay position
  // lands (drag.style) and resizes with scale/size changes; the observer
  // covers split drags. An unconditional effect ping-pongs into React's
  // update-depth limit.
  const posLeft = (drag.style as { left?: number } | undefined)?.left;
  const posTop = (drag.style as { top?: number } | undefined)?.top;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(measurePanelExt, [stretched, row, scale, posLeft, posTop, bodySize, cellSizes]);
  useLayoutEffect(() => {
    if (!stretched) return;
    const parent = wrapperRef.current?.offsetParent as HTMLElement | null;
    if (!parent) return;
    const ro = new ResizeObserver(measurePanelExt);
    ro.observe(parent);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stretched]);

  const clusterSize = cluster && cellSizes
    ? group.members.reduce(
        (acc, id) => {
          const s = cellSizes[id];
          if (!s) return acc;
          const o = offsetOf(id);
          return { w: Math.max(acc.w, o.x + shift.x + s.w), h: Math.max(acc.h, o.y + shift.y + s.h) };
        },
        { w: 0, h: 0 },
      )
    : null;

  const cellRects = (): Map<string, DockRect> | null => {
    const wrapper = wrapperRef.current;
    const c = wrapper ? containerRectOf(wrapper) : null;
    if (!c) return null;
    const out = new Map<string, DockRect>();
    for (const [id, el] of cellRefs.current) {
      const r = el.getBoundingClientRect();
      out.set(id, { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height });
    }
    return out;
  };

  const onGripPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    resize.current = { startX: e.clientX, startY: e.clientY, startScale: scale };
    const onMove = (ev: globalThis.PointerEvent) => {
      const r = resize.current;
      if (!r) return;
      const d = (ev.clientX - r.startX + ev.clientY - r.startY) / 2;
      setLiveScale(clampScale(r.startScale + d / RESIZE_PX_PER_SCALE_UNIT));
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      const r = resize.current;
      resize.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (r) {
        const d = (ev.clientX - r.startX + ev.clientY - r.startY) / 2;
        setScale(scaleKey, clampScale(r.startScale + d / RESIZE_PX_PER_SCALE_UNIT));
      }
      setLiveScale(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Pull-out gesture from a member's pill: the member ghosts along with the
  // cursor. Released past UNDOCK_PX it undocks there; inside, a card group
  // reorders and a cluster repositions. The ball's pill breaks the cluster.
  const onMemberPillPointerDown = (memberId: string) => (e: ReactPointerEvent) => {
    const cellEl = (e.currentTarget as HTMLElement).parentElement;
    if (e.button !== 0 || !cellEl) return;
    e.stopPropagation();
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY };
    const wrapper = wrapperRef.current;
    const startC = wrapper ? containerRectOf(wrapper) : null;
    const startCell = startC
      ? (() => {
          const r = cellEl.getBoundingClientRect();
          return { x: r.left - startC.left, y: r.top - startC.top, w: r.width, h: r.height };
        })()
      : null;
    const startBall = cluster && memberId !== CLUSTER_ANCHOR ? cellRects()?.get(CLUSTER_ANCHOR) ?? null : null;
    const defAtDown = members.find((d) => d.id === memberId);
    const roundAtDown = defAtDown ? isRoundInMode(defAtDown, displayMode[memberId] ?? 'analog') : false;
    // Layout px (pre-zoom): sibling slide transforms run inside the group's
    // zoom, so client-px sizes would over-shift scaled groups.
    dragMain.current = row ? cellEl.offsetWidth : cellEl.offsetHeight;
    const from = group.members.indexOf(memberId);
    let moved = false;
    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true;
      // A cluster satellite rides its orbit live while the cursor stays in
      // the dock zone; leaving the zone frees the ghost (undock intent).
      if (startBall && startC && startCell) {
        const point = { x: ev.clientX - startC.left, y: ev.clientY - startC.top };
        if (!isOutsideUndockZone(startC.rect, point)) {
          const satRect = { x: point.x - startCell.w / 2, y: point.y - startCell.h / 2, w: startCell.w, h: startCell.h };
          const snapped = snapToBallEdge(startBall, satRect, roundAtDown);
          setGhost({ id: memberId, dx: snapped.x - startCell.x, dy: snapped.y - startCell.y });
          return;
        }
        setGhost({ id: memberId, dx, dy });
        return;
      }
      // Card group: siblings slide aside live to preview the drop slot.
      if (startC) {
        const point = { x: ev.clientX - startC.left, y: ev.clientY - startC.top };
        if (isOutsideUndockZone(startC.rect, point) || cluster) {
          setReorderTo(null);
        } else {
          let to = memberInsertionIndex(startC.rect, group.orientation, group.members.length, point);
          if (to > from) to -= 1;
          setReorderTo(to);
        }
      }
      setGhost({ id: memberId, dx, dy });
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setGhost(null);
      setReorderTo(null);
      const w = wrapperRef.current;
      const c = w ? containerRectOf(w) : null;
      if (!c || !startCell) return;
      const point = { x: ev.clientX - c.left, y: ev.clientY - c.top };
      const delta = { x: ev.clientX - start.x, y: ev.clientY - start.y };
      const droppedTopLeft = { x: startCell.x + delta.x, y: startCell.y + delta.y };
      const rects = cellRects();
      const pairSurvivorPos = () => {
        if (group.members.length !== 2 || !rects) return null;
        const other = group.members.find((m) => m !== memberId)!;
        const r = rects.get(other);
        return r ? { x: r.x, y: r.y } : null;
      };

      if (cluster && memberId === CLUSTER_ANCHOR) {
        // The ball's pill dissolves the whole constellation, in place on a
        // click, with the ball carried to the drop point on a drag.
        if (!rects) return;
        const positions: Record<string, { x: number; y: number }> = {};
        for (const [id, r] of rects) positions[id] = { x: r.x, y: r.y };
        if (moved && isOutsideUndockZone(c.rect, point)) positions[memberId] = droppedTopLeft;
        dockDissolve(gid, positions);
        return;
      }

      if (!moved) {
        dockRemove(memberId, { x: c.rect.x + c.rect.w + 8, y: c.rect.y }, pairSurvivorPos());
        return;
      }
      if (isOutsideUndockZone(c.rect, point)) {
        dockRemove(memberId, droppedTopLeft, pairSurvivorPos());
        return;
      }
      if (cluster) {
        const ballRect = rects?.get(CLUSTER_ANCHOR);
        if (!ballRect || !rects) return;
        // Same cursor-driven orbit rule the live ghost showed.
        const satRect = { x: point.x - startCell.w / 2, y: point.y - startCell.h / 2, w: startCell.w, h: startCell.h };
        const snapped = snapToBallEdge(ballRect, satRect, roundAtDown);
        const offset = { x: snapped.x - ballRect.x, y: snapped.y - ballRect.y };
        rects.set(memberId, { ...snapped, w: startCell.w, h: startCell.h });
        let minX = Infinity;
        let minY = Infinity;
        for (const r of rects.values()) {
          minX = Math.min(minX, r.x);
          minY = Math.min(minY, r.y);
        }
        dockSetClusterOffset(gid, memberId, offset, { x: minX, y: minY });
      } else {
        const from = group.members.indexOf(memberId);
        let to = memberInsertionIndex(c.rect, group.orientation, group.members.length, point);
        if (to > from) to -= 1;
        dockReorder(gid, from, to);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Whole-group drags dock too: near another card group the two merge, near
  // a standalone instrument the group absorbs it. Runs beside the overlay
  // drag exactly like the per-instrument tracker.
  const onWrapperPointerDown = (e: ReactPointerEvent) => {
    if (stretched) return;
    drag.onPointerDown(e);
    if (cluster) return;
    const el = wrapperRef.current;
    if (!el || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [role="slider"]')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    let raf = 0;
    let last: MeasuredCandidate | null = null;
    const onMove = (ev: globalThis.PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      active = true;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const node = wrapperRef.current;
        last = node ? measureGroupDockCandidate(node, gid) : null;
        useDockPreviewStore.getState().setPreview(
          last ? { rect: last.targetRect, side: last.candidate.side, cluster: false } : null,
        );
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      useDockPreviewStore.getState().setPreview(null);
      if (active && last) commitGroupDock(gid, last);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const chromeStyle: CSSProperties = tray || cluster || shapedGroup
    ? {}
    : {
        background: GAUGE_COLORS.face,
        ...(stretched
          ? row
            ? { borderTop: `1.5px solid ${GAUGE_COLORS.bezelEdge}`, borderBottom: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }
            : { borderLeft: `1.5px solid ${GAUGE_COLORS.bezelEdge}`, borderRight: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }
          : { border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }),
      };

  // One card rect spans every non-bulging member; each bulge's circle unions on top.
  const trayish = bulgeIds.has(CLUSTER_ANCHOR) && members.some((d) => d.id !== CLUSTER_ANCHOR && isRoundInMode(d, displayMode[d.id] ?? 'analog'));
  const contour = (() => {
    if (!shapedGroup || !cellSizes) return null;
    const PAD = 18;
    const INFLATE = 5;
    const shapes: Array<{ kind: 'circle'; cx: number; cy: number; r: number } | { kind: 'rect'; x: number; y: number; w: number; h: number; rx?: number }> = [];
    const rest = members.filter((d) => !bulgeIds.has(d.id)).map((d) => cellSizes[d.id]).filter((c): c is NonNullable<typeof c> => !!c);
    const bulging = members
      .filter((d) => bulgeIds.has(d.id))
      .map((d) => ({ id: d.id, cell: cellSizes[d.id] }))
      .filter((e): e is { id: string; cell: NonNullable<typeof e.cell> } => !!e.cell);
    if (rest.length > 0) {
      let x = Math.min(...rest.map((r) => r.x)) - INFLATE;
      let y = Math.min(...rest.map((r) => r.y)) - INFLATE;
      let x2 = Math.max(...rest.map((r) => r.x + r.w)) + INFLATE;
      let y2 = Math.max(...rest.map((r) => r.y + r.h)) + INFLATE;
      // Stretched: the silhouette extends past the body to the panel edges
      // (screen px converted into the zoomed coordinate space).
      if (stretched && bodySize && panelExt) {
        if (row) {
          x = -panelExt.before / scale;
          x2 = bodySize.w + panelExt.after / scale;
        } else {
          y = -panelExt.before / scale;
          y2 = bodySize.h + panelExt.after / scale;
        }
      }
      // Extend to each bulge's center so the arc meets it flush, no wedge notch.
      for (const { cell } of bulging) {
        const cx = cell.x + cell.w / 2;
        const cy = cell.y + cell.h / 2;
        x = Math.min(x, cx);
        x2 = Math.max(x2, cx);
        y = Math.min(y, cy);
        y2 = Math.max(y2, cy);
      }
      shapes.push({ kind: 'rect', x, y, w: x2 - x, h: y2 - y, rx: stretched ? 0 : 10 });
    }
    // Only the ball needs the extra proud margin; an edge gauge is the
    // run's own size.
    for (const { id, cell } of bulging) {
      const margin = id === CLUSTER_ANCHOR ? 12 : INFLATE;
      shapes.push({ kind: 'circle', cx: cell.x + cell.w / 2, cy: cell.y + cell.h / 2, r: Math.min(cell.w, cell.h) / 2 + margin });
    }
    if (shapes.length === 0) return null;
    const minX = Math.min(...shapes.map((sh) => (sh.kind === 'circle' ? sh.cx - sh.r : sh.x)));
    const minY = Math.min(...shapes.map((sh) => (sh.kind === 'circle' ? sh.cy - sh.r : sh.y)));
    const maxX = Math.max(...shapes.map((sh) => (sh.kind === 'circle' ? sh.cx + sh.r : sh.x + sh.w)));
    const maxY = Math.max(...shapes.map((sh) => (sh.kind === 'circle' ? sh.cy + sh.r : sh.y + sh.h)));
    return { shapes, PAD, minX, minY, maxX, maxY };
  })();

  overhangRef.current = (() => {
    if (!shapedGroup || !cellSizes || !bodySize) return null;
    const rest = members
      .filter((d) => !bulgeIds.has(d.id))
      .map((d) => cellSizes[d.id])
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (rest.length === 0) return null;
    const runTop = Math.min(...rest.map((r) => r.y)) - 5;
    const runBottom = Math.max(...rest.map((r) => r.y + r.h)) + 5;
    const runLeft = Math.min(...rest.map((r) => r.x)) - 5;
    const runRight = Math.max(...rest.map((r) => r.x + r.w)) + 5;
    return {
      top: Math.max(0, runTop) * scale,
      bottom: Math.max(0, bodySize.h - runBottom) * scale,
      left: Math.max(0, runLeft) * scale,
      right: Math.max(0, bodySize.w - runRight) * scale,
    };
  })();

  const contourShapes = (fill: string, stroke?: string): JSX.Element[] | null =>
    contour
      ? contour.shapes.map((sh, i) =>
          sh.kind === 'circle' ? (
            <circle key={i} cx={sh.cx - contour.minX + contour.PAD} cy={sh.cy - contour.minY + contour.PAD} r={sh.r} fill={fill} stroke={stroke} strokeWidth={stroke ? 3 : undefined} />
          ) : (
            <rect key={i} x={sh.x - contour.minX + contour.PAD} y={sh.y - contour.minY + contour.PAD} width={sh.w} height={sh.h} rx={sh.rx ?? 10} fill={fill} stroke={stroke} strokeWidth={stroke ? 3 : undefined} />
          ),
        )
      : null;

  const memberCell = (def: (typeof members)[number], i: number): JSX.Element => {
    const dragging = ghost?.id === def.id;
    const mode = displayMode[def.id] ?? 'analog';
    const off = offsetOf(def.id);
    const slide = (() => {
      if (cluster || !ghost || dragging || reorderTo === null) return undefined;
      const from = group.members.indexOf(ghost.id);
      let v = 0;
      if (from < reorderTo && i > from && i <= reorderTo) v = -dragMain.current;
      else if (from > reorderTo && i >= reorderTo && i < from) v = dragMain.current;
      if (v === 0) return undefined;
      return row ? { x: v, y: 0 } : { x: 0, y: v };
    })();
    return (
      <MemberCell
        key={def.id}
        memberId={def.id}
        cellRefs={cellRefs.current}
        innerRefs={innerRefs.current}
        fit={isFitted(def.id) ? { axis: row ? 'height' : 'width', factor: fitOf(def.id), anchor: def.id === fitAnchorId } : null}
        divider={
          !tray && !cluster && i > 0
            && !isRoundInMode(def, displayMode[def.id] ?? 'analog')
            && !isRoundInMode(members[i - 1]!, displayMode[members[i - 1]!.id] ?? 'analog')
            ? (row ? { borderLeft: `1px solid ${GAUGE_COLORS.bezelEdge}` } : { borderTop: `1px solid ${GAUGE_COLORS.bezelEdge}` })
            : undefined
        }
        position={cluster ? { left: off.x + shift.x, top: off.y + shift.y } : undefined}
        slide={slide}
        ghost={dragging ? ghost : null}
        zoom={cluster ? 1 : scale}
        showPill={hoveredMember === def.id && ghost === null}
        onHover={(h) => setHoveredMember(h ? def.id : null)}
        onPillPointerDown={onMemberPillPointerDown(def.id)}
        label={def.label}
      >
        {cluster ? (
          <div style={{ zoom: memberScales[def.id] ?? 1 } as CSSProperties}>
            {(() => { const C = resolveInstrumentComponent(def, mode); return <C />; })()}
          </div>
        ) : (
          <DockedContext.Provider value>
            {(() => { const C = resolveInstrumentComponent(def, mode); return <C />; })()}
          </DockedContext.Provider>
        )}
      </MemberCell>
    );
  };

  return (
    <div
      ref={sized ? setRefs : measureOnlyRef}
      data-dock-group-id={gid}
      style={{
        ...drag.style,
        opacity: hovered || liveScale !== null || ghost !== null || displayOpen ? 1 : globalOpacity,
        ...(cluster ? { pointerEvents: 'none' } : {}),
      }}
      onPointerDown={onWrapperPointerDown}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => { setHovered(false); setHoveredMember(null); }}
      className="absolute left-3 top-16 z-[1000] group transition-opacity duration-150 dock-pop"
    >
      {cluster ? (
        <div className="relative select-none" style={clusterSize ? { width: clusterSize.w, height: clusterSize.h } : undefined}>
          {clusterSize && cellSizes && (
            // Shared tray, contoured: one masked fill so the baked-alpha
            // overlay color stays uniform where member shapes overlap.
            <svg
              className="absolute pointer-events-none"
              style={{
                left: -BLOB_PAD,
                top: -BLOB_PAD,
                width: clusterSize.w + 2 * BLOB_PAD,
                height: clusterSize.h + 2 * BLOB_PAD,
                filter: 'drop-shadow(0 5px 14px rgba(0, 0, 0, 0.28))',
              }}
            >
              <mask id={`dock-blob-${gid}`}>
                {members.map((def) => {
                  const s = cellSizes[def.id];
                  if (!s) return null;
                  const o = offsetOf(def.id);
                  const x = o.x + shift.x + BLOB_PAD;
                  const y = o.y + shift.y + BLOB_PAD;
                  return isRoundInMode(def, displayMode[def.id] ?? 'analog') ? (
                    <circle key={def.id} cx={x + s.w / 2} cy={y + s.h / 2} r={Math.min(s.w, s.h) / 2 + BLOB_PAD} fill="#fff" />
                  ) : (
                    <rect key={def.id} x={x - BLOB_PAD} y={y - BLOB_PAD} width={s.w + 2 * BLOB_PAD} height={s.h + 2 * BLOB_PAD} rx={14} fill="#fff" />
                  );
                })}
              </mask>
              <rect width="100%" height="100%" fill="var(--bg-overlay-light)" mask={`url(#dock-blob-${gid})`} />
            </svg>
          )}
          {members.map((def, i) => memberCell(def, i))}
        </div>
      ) : (
        <>
          {stretched && !shapedGroup && panelExt && ([true, false] as const).map((before) => {
            const len = before ? panelExt.before : panelExt.after;
            if (len <= 0) return null;
            return (
              <div
                key={before ? 'before' : 'after'}
                className={'absolute shadow-xl' + (tray ? ' bg-surface-overlay-light' : '')}
                style={{
                  ...(row
                    ? { top: 0, height: '100%', ...(before ? { left: -len, width: len } : { right: -len, width: len }) }
                    : { left: 0, width: '100%', ...(before ? { top: -len, height: len } : { bottom: -len, height: len }) }),
                  ...(tray
                    ? {}
                    : {
                        background: GAUGE_COLORS.face,
                        ...(row
                          ? { borderTop: `1.5px solid ${GAUGE_COLORS.bezelEdge}`, borderBottom: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }
                          : { borderLeft: `1.5px solid ${GAUGE_COLORS.bezelEdge}`, borderRight: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }),
                      }),
                }}
              />
            );
          })}
        <div
          style={{ zoom: scale } as CSSProperties}
        >
          <div
            className={
              (tray
                ? `flex ${row ? 'flex-row items-center' : 'flex-col items-start'} gap-1.5 p-1.5 ${stretched ? '' : 'rounded-xl'} bg-surface-overlay-light shadow-xl select-none`
                : shapedGroup
                  ? `relative flex ${row ? 'flex-row items-center' : 'flex-col items-center'} ${trayish ? 'gap-1.5' : ''} select-none`
                  : `flex ${row ? 'flex-row items-stretch' : 'flex-col items-stretch'} ${stretched ? '' : 'rounded-lg'} shadow-xl select-none overflow-hidden`)
            }
            style={{
              ...chromeStyle,
              // Bulging members are meant to sit proud, so a shaped group keeps
              // sizing itself; a flat card is pinned to its anchor.
              ...(!shapedGroup && fitBasis ? (row ? { height: fitBasis } : { width: fitBasis }) : {}),
            }}
          >
            {contour && (
              <svg
                className="absolute pointer-events-none"
                style={{
                  left: contour.minX - contour.PAD,
                  top: contour.minY - contour.PAD,
                  width: contour.maxX - contour.minX + 2 * contour.PAD,
                  height: contour.maxY - contour.minY + 2 * contour.PAD,
                  filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.25))',
                  zIndex: -1,
                }}
              >
                <mask id={`dock-contour-ring-${gid}`}>
                  <g>{contourShapes('#000', '#fff')}</g>
                  <g>{contourShapes('#000')}</g>
                </mask>
                <mask id={`dock-contour-fill-${gid}`}>{contourShapes('#fff')}</mask>
                {!trayish && (
                  <rect width="100%" height="100%" fill={GAUGE_COLORS.bezelEdge} mask={`url(#dock-contour-ring-${gid})`} />
                )}
                <rect width="100%" height="100%" fill={trayish ? 'var(--bg-overlay-light)' : GAUGE_COLORS.face} mask={`url(#dock-contour-fill-${gid})`} />
              </svg>
            )}
            {members.map((def, i) => memberCell(def, i))}
          </div>
        </div>
        </>
      )}
      {!cluster && (
        <div
          onPointerDown={onGripPointerDown}
          className={
            'absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-br border-b-2 border-r-2 cursor-nwse-resize transition-opacity ' +
            (liveScale !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
          }
          style={{ borderColor: 'var(--gauge-text-dim)' }}
        />
      )}
      {liveScale !== null && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums bg-surface text-content shadow-lg pointer-events-none">
          {Math.round(scale * 100)}%
        </div>
      )}
      {!cluster && (
        <button
          type="button"
          onClick={() => dockSetStretch(gid, !stretched)}
          data-tip={stretched
            ? 'Shrink the group back to its content'
            : (row ? 'Stretch the group across the panel' : 'Stretch the group down the panel')}
          style={stretched && panelExt
            ? (row
                ? { top: 6, left: 6 - panelExt.before }
                : { top: 6 - panelExt.before, left: 6 })
            : undefined}
          className={
            'absolute p-1.5 rounded-full bg-surface-solid border shadow-lg transition-opacity pointer-events-auto ' +
            (stretched ? '' : '-top-2 ' + (displayChoices ? 'left-5' : '-left-2')) + ' ' +
            (stretched
              ? 'text-blue-400 border-blue-500 opacity-100'
              : 'text-content-secondary border-transparent hover:text-content hover:bg-surface-raised ') +
            (stretched ? '' : (displayOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'))
          }
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
            {row ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 12h16M7 8l-4 4 4 4M17 8l4 4-4 4" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M8 7l4-4 4 4M8 17l4 4 4-4" />
            )}
          </svg>
        </button>
      )}
      {displayChoices && (
        <button
          type="button"
          onClick={() => {
            const r = wrapperRef.current?.getBoundingClientRect();
            if (r) { setDisplayAnchor(r); setDisplayOpen(true); }
          }}
          data-tip="Display mode for the whole group"
          style={stretched && panelExt
            ? (row
                ? { top: 8, left: 38 - panelExt.before }
                : { top: 38 - panelExt.before, left: 8 })
            : undefined}
          className={
            `absolute ${stretched ? '' : '-top-1.5 -left-1.5'} p-1 rounded-full bg-surface-solid shadow-lg text-content-secondary ` +
            'hover:text-content hover:bg-surface-raised pointer-events-auto transition-opacity ' +
            (displayOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
          }
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </button>
      )}
      {displayOpen && displayAnchor && displayChoices && (
        <GroupDisplayPopover
          title={cluster ? 'Constellation' : 'Docked group'}
          ids={displayChoices.ids}
          options={displayChoices.options}
          anchorRect={displayAnchor}
          onClose={() => setDisplayOpen(false)}
        />
      )}
    </div>
  );
}

function MemberCell({
  children,
  memberId,
  cellRefs,
  innerRefs,
  fit,
  divider,
  position,
  slide,
  ghost,
  zoom,
  showPill,
  onHover,
  onPillPointerDown,
  label,
}: {
  children: React.ReactNode;
  memberId: string;
  cellRefs: Map<string, HTMLElement>;
  innerRefs: Map<string, HTMLElement>;
  /** Cross-axis fit; the anchor measures free, the rest stretch or shrink to it. */
  fit: { axis: 'width' | 'height'; factor: number; anchor: boolean } | null;
  divider?: CSSProperties;
  /** Cluster only: absolute placement inside the constellation body. */
  position?: { left: number; top: number };
  /** Live reorder preview: this sibling steps aside for the dragged member. */
  slide?: { x: number; y: number };
  ghost: { dx: number; dy: number } | null;
  zoom: number;
  showPill: boolean;
  onHover: (hovered: boolean) => void;
  onPillPointerDown: (e: ReactPointerEvent) => void;
  label: string;
}): JSX.Element {
  const setCellRef = useCallback((el: HTMLElement | null) => {
    if (el) cellRefs.set(memberId, el);
    else cellRefs.delete(memberId);
  }, [cellRefs, memberId]);
  const setInnerRef = useCallback((el: HTMLElement | null) => {
    if (el) innerRefs.set(memberId, el);
    else innerRefs.delete(memberId);
  }, [innerRefs, memberId]);
  const cross = fit?.axis === 'height' ? 'Height' : 'Width';
  const body = fit ? (
    // The zoom rides the outer box so the measured inner never carries it.
    <div style={fit.factor < 1 ? ({ zoom: fit.factor, [fit.axis]: '100%' } as CSSProperties) : (fit.axis === 'height' ? { height: '100%' } : undefined)}>
      <div
        ref={setInnerRef}
        style={{
          [fit.axis]: 'max-content',
          ...(fit.anchor ? {} : { [`min${cross}`]: '100%' }),
        } as CSSProperties}
      >
        {children}
      </div>
    </div>
  ) : children;
  return (
    <div
      ref={setCellRef}
      data-dock-member={memberId}
      className={position ? 'absolute pointer-events-auto' : 'relative'}
      style={{
        ...divider,
        ...(position ? { left: position.left, top: position.top } : {}),
        // Cursor deltas are client px; a card cell lives inside the group's
        // CSS zoom, so divide or the ghost outruns the pointer.
        ...(ghost
          ? { transform: `translate(${ghost.dx / zoom}px, ${ghost.dy / zoom}px) scale(1.03)`, zIndex: 10, opacity: 0.9, transition: 'none' }
          : {
              transform: slide ? `translate(${slide.x}px, ${slide.y}px)` : 'none',
              transition: `transform 400ms ${DOCK_EASE}`,
            }),
      }}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      {body}
      <button
        type="button"
        onPointerDown={onPillPointerDown}
        data-tip={`Drag out or click to undock ${label}`}
        className={
          'absolute top-0.5 right-0.5 p-1 rounded-full bg-surface shadow-lg text-content-secondary ' +
          'hover:text-content hover:bg-surface-raised cursor-grab transition-opacity ' +
          (showPill || ghost ? 'opacity-100' : 'opacity-0 pointer-events-none')
        }
      >
        <UndockIcon />
      </button>
    </div>
  );
}
