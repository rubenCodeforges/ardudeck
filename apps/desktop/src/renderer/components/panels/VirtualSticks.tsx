/**
 * On-screen sticks, for when there is no gamepad in the bag.
 *
 * Reports axes in gamepad order [leftX, leftY, rightX, rightY]. The store
 * places them on channels using the vehicle's RCMAP_* rather than the learned
 * pad mapping, because a pad needs teaching only for its arbitrary axis order
 * and these have none.
 *
 * Throttle latches where you leave it and everything else springs to centre,
 * which is how a transmitter behaves. Letting throttle spring to zero on
 * pointer-up would chop the motors every time a finger slipped off the pad.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface VirtualSticksProps {
  /** Called on every change with [leftX, leftY, rightX, rightY], each -1..1. */
  onAxes: (axes: number[]) => void;
  disabled?: boolean;
}

interface PadState {
  x: number;
  y: number;
}

const CENTER: PadState = { x: 0, y: 0 };

export function VirtualSticks({ onAxes, disabled }: VirtualSticksProps): JSX.Element {
  // Throttle stick holds its position; the attitude stick springs back.
  const [left, setLeft] = useState<PadState>({ x: 0, y: 1 });
  const [right, setRight] = useState<PadState>(CENTER);

  const push = useCallback((l: PadState, r: PadState) => {
    onAxes([l.x, l.y, r.x, r.y]);
  }, [onAxes]);

  useEffect(() => { push(left, right); }, [left, right, push]);

  // Losing the window must not leave the sticks held where they were.
  useEffect(() => {
    const centre = () => {
      setRight(CENTER);
      setLeft((prev) => ({ x: 0, y: prev.y }));
    };
    window.addEventListener('blur', centre);
    return () => window.removeEventListener('blur', centre);
  }, []);

  return (
    <div className="grid grid-cols-2 gap-3">
      <Pad
        label="Throttle / Yaw"
        value={left}
        disabled={disabled}
        onChange={setLeft}
        onRelease={() => setLeft((prev) => ({ x: 0, y: prev.y }))}
      />
      <Pad
        label="Pitch / Roll"
        value={right}
        disabled={disabled}
        onChange={setRight}
        onRelease={() => setRight(CENTER)}
      />
    </div>
  );
}

function Pad({
  label, value, disabled, onChange, onRelease,
}: {
  label: string;
  value: PadState;
  disabled?: boolean;
  onChange: (v: PadState) => void;
  onRelease: () => void;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  const fromEvent = useCallback((e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    onChange({ x: clamp(nx), y: clamp(ny) });
  }, [onChange]);

  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-content-tertiary">{label}</div>
      <div
        ref={ref}
        onPointerDown={(e) => {
          if (disabled) return;
          // Without this the drag also starts the panel's own scroll/selection
          // gesture, so the list jumps away under the stick.
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          setActive(true);
          fromEvent(e);
        }}
        onPointerMove={(e) => {
          if (!active || disabled) return;
          e.preventDefault();
          fromEvent(e);
        }}
        onDragStart={(e) => e.preventDefault()}
        onContextMenu={(e) => e.preventDefault()}
        onPointerUp={(e) => {
          (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
          setActive(false);
          onRelease();
        }}
        onPointerCancel={() => { setActive(false); onRelease(); }}
        className={`relative aspect-square w-full touch-none select-none overscroll-contain rounded-lg border ${
          disabled ? 'border-subtle bg-surface-raised opacity-40' : 'border-subtle bg-surface-inset'
        }`}
      >
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-content-tertiary/20" />
        <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-content-tertiary/20" />
        <div
          className={`absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 ${
            active ? 'border-cyan-400 bg-cyan-500/40' : 'border-content-tertiary/50 bg-surface-overlay'
          }`}
          style={{ left: `${((value.x + 1) / 2) * 100}%`, top: `${((value.y + 1) / 2) * 100}%` }}
        />
      </div>
    </div>
  );
}

function clamp(v: number): number {
  return Math.min(1, Math.max(-1, v));
}
