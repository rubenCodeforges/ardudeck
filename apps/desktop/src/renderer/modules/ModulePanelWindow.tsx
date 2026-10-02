/**
 * A resizable, draggable in-app floating window for `size: 'large'` module
 * panels (chats, terminals) that don't fit the dock dropdown. Drag the header
 * to move, the bottom-right handle to resize, the button to maximize; bounds
 * persist per panel. Themed with the app's surface/content tokens.
 *
 * Drag/resize use global pointer listeners started on pointerdown (robust -
 * pointer-capture + parent bubbling was unreliable when the panel body, e.g. an
 * xterm canvas, sat over the handle).
 */

import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Maximize2, Minimize2, X } from 'lucide-react';
import type { RegisteredPanel } from './module-panel-registry';

interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_W = 340;
const MIN_H = 260;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function boundsKey(panel: RegisteredPanel) {
  return `ardudeck.moduleWindow.${panel.slug}:${panel.id}`;
}

function loadBounds(panel: RegisteredPanel): Bounds {
  try {
    const raw = localStorage.getItem(boundsKey(panel));
    if (raw) return JSON.parse(raw) as Bounds;
  } catch {
    /* ignore */
  }
  const w = 640;
  const h = 560;
  return {
    w,
    h,
    x: Math.max(16, Math.round((window.innerWidth - w) / 2)),
    y: Math.max(16, Math.round((window.innerHeight - h) / 2)),
  };
}

export function ModulePanelWindow({ panel, onClose }: { panel: RegisteredPanel; onClose: () => void }) {
  const { t } = useTranslation();
  const Body = panel.component;
  const [bounds, setBounds] = useState<Bounds>(() => loadBounds(panel));
  const [maximized, setMaximized] = useState(false);
  const boundsRef = useRef(bounds);

  const persist = useCallback(
    (b: Bounds) => {
      try {
        localStorage.setItem(boundsKey(panel), JSON.stringify(b));
      } catch {
        /* ignore */
      }
    },
    [panel],
  );

  const startGesture = (mode: 'move' | 'resize') => (e: React.PointerEvent) => {
    if (maximized) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const base = boundsRef.current;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - sx;
      const dy = ev.clientY - sy;
      const next: Bounds =
        mode === 'move'
          ? {
              ...base,
              x: clamp(base.x + dx, 0, window.innerWidth - 80),
              y: clamp(base.y + dy, 0, window.innerHeight - 40),
            }
          : {
              ...base,
              w: clamp(base.w + dx, MIN_W, window.innerWidth - base.x - 8),
              h: clamp(base.h + dy, MIN_H, window.innerHeight - base.y - 8),
            };
      boundsRef.current = next;
      setBounds(next);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      persist(boundsRef.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const style: React.CSSProperties = maximized
    ? { left: 16, top: 16, width: window.innerWidth - 32, height: window.innerHeight - 32 }
    : { left: bounds.x, top: bounds.y, width: bounds.w, height: bounds.h };

  return (
    <div
      className="fixed z-[950] flex flex-col overflow-hidden rounded-xl border border-subtle bg-surface-overlay text-content shadow-2xl backdrop-blur-md"
      style={style}
    >
      <div
        onPointerDown={startGesture('move')}
        style={{ cursor: maximized ? 'default' : 'grab', touchAction: 'none' }}
        className="flex shrink-0 items-center gap-2 border-b border-subtle px-3 py-2 select-none"
      >
        <span className="flex-1 truncate text-sm font-semibold text-content">{panel.title}</span>
        <button
          onClick={() => setMaximized((m) => !m)}
          className="rounded-md p-1 text-content-secondary transition-colors hover:bg-surface-raised hover:text-content"
          aria-label={maximized ? t('common:restore') : t('modules:modulePanelWindow.maximize')}
        >
          {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-content-secondary transition-colors hover:bg-surface-raised hover:text-content"
          aria-label={t('common:close')}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <Body />
      </div>

      {!maximized && (
        <div
          onPointerDown={startGesture('resize')}
          style={{ cursor: 'nwse-resize', touchAction: 'none' }}
          className="absolute bottom-0 right-0 z-10 flex h-5 w-5 items-end justify-end p-1"
          aria-label={t('modules:modulePanelWindow.resize')}
        >
          <svg viewBox="0 0 10 10" className="h-3 w-3 text-content-tertiary">
            <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
          </svg>
        </div>
      )}
    </div>
  );
}
