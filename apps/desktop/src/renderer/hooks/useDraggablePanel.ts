/**
 * useDraggablePanel — make a floating overlay panel movable by a header handle.
 *
 * Spread `handleProps` on the drag handle (the panel header) and position the
 * panel with the returned `pos` (absolute left/top). Dragging that starts on an
 * interactive control (button, input, select) is ignored so the header's own
 * buttons keep working. The panel is clamped so its header can never leave the
 * viewport (you can always grab it again).
 */
import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

export interface PanelPos {
  x: number;
  y: number;
}

export function useDraggablePanel(initial: PanelPos) {
  const [pos, setPos] = useState<PanelPos>(initial);
  const grab = useRef<{ dx: number; dy: number } | null>(null);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      const el = e.target as HTMLElement;
      // Never start a drag from a control the header hosts (close, reset, etc.).
      if (el.closest('button, input, select, textarea, a, [role="slider"]')) return;
      grab.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    if (!grab.current) return;
    const maxX = Math.max(0, window.innerWidth - 80);
    const maxY = Math.max(0, window.innerHeight - 44);
    setPos({
      x: Math.min(Math.max(e.clientX - grab.current.dx, 0), maxX),
      y: Math.min(Math.max(e.clientY - grab.current.dy, 0), maxY),
    });
  }, []);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    grab.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  }, []);

  return {
    pos,
    /** Spread on the drag handle element (the panel header). */
    handleProps: { onPointerDown, onPointerMove, onPointerUp },
  };
}
