/**
 * Shared drag mechanics for free-floating panels: drag by a handle, magnet-snap
 * to nearby panel/window edges on release, and persist the dropped position.
 * Extracted from the fleet minimap so every draggable overlay (minimap, the
 * Sim World flight control panel, future ones) shares one implementation.
 */
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';

/** Magnet pull distance (px): a drop within this range of a line snaps to it. */
const SNAP = 14;

export interface SnapLines {
  v: number[];
  h: number[];
}

/** The two actions this hook needs from a position store: a cheap per-frame setter
 *  and an explicit persist step (called once, on drop, so dragging never spams
 *  storage). Pass the store's own `setPos`/`persist`, already-subscribed, rather
 *  than the whole store, so this hook never causes an extra re-render subscription. */
export interface DraggablePosActions {
  setPos: (x: number, y: number) => void;
  persist: () => void;
}

/** Vertical (x) and horizontal (y) edge lines to magnet against: the window edges plus
 *  every dockview panel boundary on screen (a no-op where there is no dockview, e.g. a
 *  pop-out window). Captured once at drag start (panels do not move mid-drag). */
export function collectSnapLines(): SnapLines {
  const v = [0, window.innerWidth];
  const h = [0, window.innerHeight];
  document.querySelectorAll('.dv-groupview').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return;
    v.push(r.left, r.right);
    h.push(r.top, r.bottom);
  });
  return { v, h };
}

/** Nearest line within SNAP for one axis: try snapping both the near edge and the far
 *  edge (pos + size); returns the snapped coordinate, or the free coordinate if none pull. */
export function magnet(pos: number, size: number, lines: number[]): number {
  let best = SNAP + 1;
  let snapped = pos;
  for (const line of lines) {
    const dNear = Math.abs(pos - line);
    if (dNear < best) {
      best = dNear;
      snapped = line;
    }
    const dFar = Math.abs(pos + size - line);
    if (dFar < best) {
      best = dFar;
      snapped = line - size;
    }
  }
  return best <= SNAP ? snapped : pos;
}

/**
 * Wires up free-move-with-magnet-snap dragging for a panel. Spread `handleProps` on
 * the drag handle element; `panelRef` must point at the panel's outer element so its
 * size and current position can be measured at drag start.
 */
export function useDraggableSnap(panelRef: RefObject<HTMLElement | null>, { setPos, persist }: DraggablePosActions) {
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number; w: number; h: number; lines: SnapLines } | null>(null);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const px = e.clientX - d.dx;
      const py = e.clientY - d.dy;
      setPos(
        Math.max(0, Math.min(magnet(px, d.w, d.lines.v), window.innerWidth - d.w)),
        Math.max(0, Math.min(magnet(py, d.h, d.lines.h), window.innerHeight - d.h)),
      );
    };
    const up = () => {
      setDragging(false);
      persist();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, setPos, persist]);

  const onHandlePointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const r = panelRef.current?.getBoundingClientRect();
      if (r) dragRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, w: r.width, h: r.height, lines: collectSnapLines() };
      setDragging(true);
      e.preventDefault();
    },
    [panelRef],
  );

  return { onHandlePointerDown, dragging };
}
