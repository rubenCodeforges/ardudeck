/**
 * Drag-to-place for floating map overlay widgets (wind bar, attitude ball,
 * instruments, ...).
 *
 * Widgets keep their default Tailwind position until the user drags them; a
 * drag switches to an absolute left/top pinned inside the map container and
 * persists per widget key, so the operator arranges the cockpit once. Drag
 * moves in 8px grid steps so arrangements line up.
 *
 * Positions persist as EDGE ANCHORS (v3 payload { ax, ay, dx, dy }): the
 * widget's center picks the nearest third of the panel on each axis, and the
 * pixel offset from that edge (or from the panel center) is stored. On
 * resize a bottom-anchored gauge row stays the same distance from the bottom
 * and a center-anchored cluster keeps its exact internal spacing, instead of
 * the whole arrangement compressing proportionally (the v2 ratio scheme did
 * that and piled fixed-size widgets into each other on small windows).
 * A ResizeObserver re-derives pixels whenever the container or the widget
 * changes size. Legacy v1 px / v2 ratio payloads migrate on first apply.
 *
 * Interactive children (buttons, inputs, sliders) never start a drag, and a
 * drag under the 4px threshold still delivers the click.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_PREFIX = 'map-overlay-pos:';
const DRAG_THRESHOLD_PX = 4;
const GRID_PX = 8;

/** Auto-arrange animates widgets to a new anchor without a remount. */
export const ARRANGE_EVENT = 'ardudeck:overlay-arrange';
/** Fired when the user commits a drag, so arrange-undo can invalidate. */
export const USER_MOVED_EVENT = 'ardudeck:overlay-user-moved';
const ARRANGE_TRANSITION = 'left 450ms cubic-bezier(0.05, 0.7, 0.1, 1.0), top 450ms cubic-bezier(0.05, 0.7, 0.1, 1.0)';

export interface ArrangeEventDetail {
  key: string;
  anchor: OverlayAnchorPos & { v?: number };
}

interface Pos { x: number; y: number }

export type OverlayAnchorX = 'left' | 'center' | 'right';
export type OverlayAnchorY = 'top' | 'middle' | 'bottom';

/**
 * v3 payload. dx/dy are px offsets: from the anchored edge for left/right/
 * top/bottom, or the widget-center offset from the panel center for
 * center/middle.
 */
export interface OverlayAnchorPos {
  ax: OverlayAnchorX;
  ay: OverlayAnchorY;
  dx: number;
  dy: number;
}

/**
 * Anchor payloads carry a rule version: v4 anchors were derived with the
 * fixed-edge-band rule below. Earlier (unversioned) anchors used a
 * relative-distance rule that could split one visual cluster across
 * different anchors, so they re-derive from their current pixel position on
 * first apply.
 */
const ANCHOR_RULE_VERSION = 4;

/**
 * A widget is edge-anchored only when its near edge sits within this many px
 * of the panel edge (a deliberately pinned toolbar/card); everything else is
 * center-anchored so an arranged cluster keeps its exact shape and moves as
 * one on resize. Choosing anchors by relative distance instead breaks wide
 * clusters: their outer members sit closer to a side edge than to the
 * center, get edge-anchored, and resize drags them through their neighbours.
 */
const EDGE_SNAP_PX = 140;

type Stored =
  | { kind: 'anchor'; anchor: OverlayAnchorPos; current: boolean }
  | { kind: 'ratio'; ratio: { xr: number; yr: number } }
  | { kind: 'px'; pos: Pos };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function isAnchorX(v: unknown): v is OverlayAnchorX {
  return v === 'left' || v === 'center' || v === 'right';
}
function isAnchorY(v: unknown): v is OverlayAnchorY {
  return v === 'top' || v === 'middle' || v === 'bottom';
}

function readStored(key: string): Stored | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Record<string, unknown>;
    if (isAnchorX(p.ax) && isAnchorY(p.ay) && Number.isFinite(p.dx) && Number.isFinite(p.dy)) {
      return {
        kind: 'anchor',
        anchor: { ax: p.ax, ay: p.ay, dx: p.dx as number, dy: p.dy as number },
        current: p.v === ANCHOR_RULE_VERSION,
      };
    }
    if (Number.isFinite(p.xr) && Number.isFinite(p.yr)) {
      return { kind: 'ratio', ratio: { xr: clamp01(p.xr as number), yr: clamp01(p.yr as number) } };
    }
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
      return { kind: 'px', pos: { x: p.x as number, y: p.y as number } };
    }
    return null;
  } catch {
    return null;
  }
}

function writeAnchor(key: string, anchor: OverlayAnchorPos): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ ...anchor, v: ANCHOR_RULE_VERSION }));
  } catch { /* full/blocked */ }
}

/** Raw stored payload for a widget key (any version), for layout snapshots. */
export function readOverlayPosPayload(key: string): unknown | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** Write back a payload captured by readOverlayPosPayload (or a preset). */
export function writeOverlayPosPayload(key: string, payload: unknown): void {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(payload)); } catch { /* full/blocked */ }
}

/** Remove a stored position so the widget returns to its default placement. */
export function clearOverlayPosPayload(key: string): void {
  try { localStorage.removeItem(STORAGE_PREFIX + key); } catch { /* blocked */ }
}

function snapToGrid(v: number): number {
  return Math.round(v / GRID_PX) * GRID_PX;
}

/** How far a widget may hang past each panel edge. A ball-in-card group
 * clamps its CARD to the panel and lets the ball's bulge overflow. */
export interface OverlayOverhang {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const NO_OVERHANG: OverlayOverhang = { top: 0, right: 0, bottom: 0, left: 0 };

function clampToParent(el: HTMLElement, pos: Pos, o: OverlayOverhang = NO_OVERHANG): Pos {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return pos;
  return {
    x: Math.max(-o.left, Math.min(parent.clientWidth - el.offsetWidth + o.right, pos.x)),
    y: Math.max(-o.top, Math.min(parent.clientHeight - el.offsetHeight + o.bottom, pos.y)),
  };
}

function toAnchor(el: HTMLElement, pos: Pos): OverlayAnchorPos | null {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return null;
  const W = parent.clientWidth;
  const H = parent.clientHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const cx = pos.x + w / 2;
  const cy = pos.y + h / 2;

  // Fixed edge band (see EDGE_SNAP_PX): only widgets deliberately pinned
  // near an edge get edge anchors; everything else is center-anchored so an
  // arranged cluster keeps its exact shape on resize.
  const leftDist = pos.x;
  const rightDist = W - w - pos.x;
  let ax: OverlayAnchorX;
  let dx: number;
  if (leftDist <= EDGE_SNAP_PX && leftDist <= rightDist) { ax = 'left'; dx = leftDist; }
  else if (rightDist <= EDGE_SNAP_PX) { ax = 'right'; dx = rightDist; }
  else { ax = 'center'; dx = cx - W / 2; }

  const topDist = pos.y;
  const bottomDist = H - h - pos.y;
  let ay: OverlayAnchorY;
  let dy: number;
  if (topDist <= EDGE_SNAP_PX && topDist <= bottomDist) { ay = 'top'; dy = topDist; }
  else if (bottomDist <= EDGE_SNAP_PX) { ay = 'bottom'; dy = bottomDist; }
  else { ay = 'middle'; dy = cy - H / 2; }

  return { ax, ay, dx, dy };
}

function fromAnchor(el: HTMLElement, a: OverlayAnchorPos, o?: OverlayOverhang): Pos | null {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return null;
  const W = parent.clientWidth;
  const H = parent.clientHeight;
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const x = a.ax === 'left' ? a.dx : a.ax === 'right' ? W - w - a.dx : W / 2 + a.dx - w / 2;
  const y = a.ay === 'top' ? a.dy : a.ay === 'bottom' ? H - h - a.dy : H / 2 + a.dy - h / 2;
  // No grid re-snap here: snapping happens during the drag, and re-snapping a
  // center-anchored widget after resize would walk it off its saved offset.
  return clampToParent(el, { x, y }, o);
}

function fromRatioLegacy(el: HTMLElement, ratio: { xr: number; yr: number }): Pos | null {
  const parent = el.offsetParent as HTMLElement | null;
  if (!parent) return null;
  return clampToParent(el, {
    x: ratio.xr * Math.max(0, parent.clientWidth - el.offsetWidth),
    y: ratio.yr * Math.max(0, parent.clientHeight - el.offsetHeight),
  });
}

export function useDraggableOverlay(
  storageKey: string,
  getOverhang?: () => OverlayOverhang | null,
  // Off for draggables outside the map, so moving them leaves the instruments' arrange undo alone.
  { announce = true }: { announce?: boolean } = {},
): {
  ref: (el: HTMLElement | null) => void;
  style: CSSProperties | undefined;
  onPointerDown: (e: ReactPointerEvent) => void;
} {
  const [pos, setPos] = useState<Pos | null>(null);
  const [animating, setAnimating] = useState(false);
  // Bumped when the ref attaches, so effects re-run for consumers that hand
  // the element over late (e.g. a cluster group waiting for its first
  // measurement); a mount-time-only effect would never see their element.
  const [attachRev, setAttachRev] = useState(0);
  const elRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<OverlayAnchorPos | null>(null);
  const drag = useRef<{ startX: number; startY: number; origin: Pos; active: boolean } | null>(null);

  // Bail out when the recomputed position is unchanged: applying a fresh
  // object every time would re-render, and a consumer whose render re-invokes
  // the ref (e.g. an unstable composite ref) would then loop forever.
  const applyPos = useCallback((next: Pos | null) => {
    setPos((prev) => (prev && next && prev.x === next.x && prev.y === next.y ? prev : next));
  }, []);
  const overhangRef = useRef(getOverhang);
  overhangRef.current = getOverhang;
  const oh = useCallback((): OverlayOverhang => overhangRef.current?.() ?? NO_OVERHANG, []);

  // Applying a stored position needs real element/container dimensions, so it
  // happens in the ref callback (post-attach, pre-paint) rather than in state
  // initialisation. v1 px and v2 ratio payloads migrate to anchors here.
  const ref = useCallback((el: HTMLElement | null) => {
    const changed = elRef.current !== el;
    elRef.current = el;
    if (!el) return;
    if (changed) setAttachRev((v) => v + 1);
    if (!anchorRef.current) {
      const stored = readStored(storageKey);
      if (!stored) return;
      if (stored.kind === 'anchor' && stored.current) {
        anchorRef.current = stored.anchor;
      } else {
        // Older payloads (px, ratio, or anchors from a previous rule
        // version) re-derive from their current on-screen position.
        const px = stored.kind === 'anchor'
          ? fromAnchor(el, stored.anchor, oh())
          : stored.kind === 'px'
            ? clampToParent(el, stored.pos, oh())
            : fromRatioLegacy(el, stored.ratio);
        const anchor = px ? toAnchor(el, px) : null;
        if (!anchor) return;
        anchorRef.current = anchor;
        writeAnchor(storageKey, anchor);
      }
    }
    applyPos(fromAnchor(el, anchorRef.current, oh()));
  }, [storageKey, applyPos, oh]);

  useEffect(() => {
    const onArrange = (e: Event) => {
      const detail = (e as CustomEvent<ArrangeEventDetail>).detail;
      if (!detail || detail.key !== storageKey) return;
      const el = elRef.current;
      if (!el) return;
      anchorRef.current = { ax: detail.anchor.ax, ay: detail.anchor.ay, dx: detail.anchor.dx, dy: detail.anchor.dy };
      writeAnchor(storageKey, anchorRef.current);
      const next = fromAnchor(el, anchorRef.current, oh());
      if (!next) return;
      // Pin class-positioned widgets at current px first, so the glide has a start point.
      setPos((prev) => {
        if (prev) return prev;
        const parent = el.offsetParent as HTMLElement | null;
        if (!parent) return prev;
        const r = el.getBoundingClientRect();
        const pr = parent.getBoundingClientRect();
        return { x: r.left - pr.left, y: r.top - pr.top };
      });
      requestAnimationFrame(() => {
        setAnimating(true);
        applyPos(next);
        window.setTimeout(() => setAnimating(false), 500);
      });
    };
    window.addEventListener(ARRANGE_EVENT, onArrange);
    return () => window.removeEventListener(ARRANGE_EVENT, onArrange);
  }, [storageKey, applyPos]);

  // Keep the anchored placement when the map panel resizes or the widget
  // itself changes size (e.g. instrument scaling).
  useEffect(() => {
    const el = elRef.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    const ro = new ResizeObserver(() => {
      const node = elRef.current;
      if (!node || !anchorRef.current || drag.current) return;
      applyPos(fromAnchor(node, anchorRef.current, oh()));
    });
    ro.observe(parent);
    ro.observe(el);
    return () => ro.disconnect();
  }, [storageKey, applyPos, attachRev]);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    const el = elRef.current;
    if (!el || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [role="slider"]')) return;

    const rect = el.getBoundingClientRect();
    const parentRect = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect();
    if (!parentRect) return;
    drag.current = {
      startX: e.clientX,
      startY: e.clientY,
      origin: { x: rect.left - parentRect.left, y: rect.top - parentRect.top },
      active: false,
    };

    const onMove = (ev: globalThis.PointerEvent) => {
      const d = drag.current;
      const node = elRef.current;
      if (!d || !node) return;
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.active && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      d.active = true;
      setPos(clampToParent(node, {
        x: snapToGrid(d.origin.x + dx),
        y: snapToGrid(d.origin.y + dy),
      }, oh()));
    };

    const onUp = () => {
      const d = drag.current;
      drag.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (d?.active) {
        setPos((p) => {
          const node = elRef.current;
          if (p && node) {
            const anchor = toAnchor(node, p);
            if (anchor) {
              anchorRef.current = anchor;
              writeAnchor(storageKey, anchor);
            }
          }
          return p;
        });
        if (announce) window.dispatchEvent(new CustomEvent(USER_MOVED_EVENT, { detail: { key: storageKey } }));
        // Swallow the click that follows a real drag so buttons under the
        // pointer don't fire.
        window.addEventListener('click', (ce) => { ce.stopPropagation(); ce.preventDefault(); }, { capture: true, once: true });
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [storageKey, announce]);

  const style: CSSProperties | undefined = pos
    ? {
        left: pos.x,
        top: pos.y,
        right: 'auto',
        bottom: 'auto',
        transform: 'none',
        cursor: 'grab',
        ...(animating ? { transition: ARRANGE_TRANSITION } : {}),
      }
    : { cursor: 'grab' };

  return { ref, style, onPointerDown };
}
