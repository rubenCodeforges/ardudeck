/**
 * The host-owned module dock: a single, draggable "Modules" launcher that
 * expands into a menu of module-registered panels. Picking one opens its panel,
 * framed by the host. The host owns the launcher, placement and open/close
 * chrome; modules supply only the panel body via host.panels. This replaces
 * modules each dropping their own position:fixed overlay into the same corner
 * (which overlapped once more than one existed).
 *
 * Themed with the app's semantic tokens (surface/content/subtle) so it adapts
 * to light and dark. The launcher can be dragged out of the way and its
 * position persists.
 */

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Boxes, Box, ChevronLeft, ChevronRight, GripVertical, X } from 'lucide-react';
import {
  listModulePanels,
  subscribeModulePanels,
  type RegisteredPanel,
} from './module-panel-registry';
import { ModulePanelWindow } from './ModulePanelWindow';

const keyOf = (p: RegisteredPanel) => `${p.slug}:${p.id}`;
const POS_KEY = 'ardudeck.moduleDock.pos';

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) return JSON.parse(raw) as { x: number; y: number };
  } catch {
    /* ignore */
  }
  return null;
}

export function ModuleDock() {
  const { t } = useTranslation();
  const panels = useSyncExternalStore(subscribeModulePanels, listModulePanels);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [windowKey, setWindowKey] = useState<string | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(loadPos);
  const btnRef = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  // Drop a selection whose module unregistered (unload/reload).
  useEffect(() => {
    if (openKey && !panels.some((p) => keyOf(p) === openKey)) setOpenKey(null);
    if (windowKey && !panels.some((p) => keyOf(p) === windowKey)) setWindowKey(null);
  }, [panels, openKey, windowKey]);

  if (panels.length === 0) return null;

  const open = panels.find((p) => keyOf(p) === openKey) ?? null;
  const Body = open?.component ?? null;
  const windowPanel = panels.find((p) => keyOf(p) === windowKey) ?? null;
  const collapse = () => {
    setMenuOpen(false);
    setOpenKey(null);
  };

  // Compact panels open in the dropdown; large ones in a floating window.
  const pick = (p: RegisteredPanel) => {
    if (p.size === 'large') {
      setWindowKey(keyOf(p));
      setMenuOpen(false);
    } else {
      setOpenKey(keyOf(p));
    }
  };

  // Drag the launcher; a real drag (moved past a threshold) repositions and
  // persists, a tap toggles the menu.
  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    const bw = btnRef.current?.offsetWidth ?? 120;
    const bh = btnRef.current?.offsetHeight ?? 40;
    const x = Math.max(8, Math.min(window.innerWidth - bw - 8, d.ox + dx));
    const y = Math.max(8, Math.min(window.innerHeight - bh - 8, d.oy + dy));
    setPos({ x, y });
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) {
        try {
          localStorage.setItem(POS_KEY, JSON.stringify({ x: r.left, y: r.top }));
        } catch {
          /* ignore */
        }
      }
    } else if (menuOpen) {
      collapse();
    } else {
      setMenuOpen(true);
    }
  };

  // Default clears the bottom status strips (mission "Ready to upload" bar,
  // console line); user drags override via pos.
  const anchor = pos ? { left: pos.x, top: pos.y } : { right: 16, bottom: 52 };
  // Keep the popover on-screen: align to the button's left edge when the button
  // sits near the left of the viewport, otherwise to its right edge.
  const alignLeft = pos != null && pos.x < 320;

  return (
    <>
    {windowPanel && (
      <ModulePanelWindow panel={windowPanel} onClose={() => setWindowKey(null)} />
    )}
    <div className="fixed z-[900]" style={{ ...anchor, pointerEvents: 'none' }}>
      <div className="relative" style={{ pointerEvents: 'auto' }}>
        {menuOpen && (
          <div
            className="absolute w-72 overflow-hidden rounded-xl border border-subtle bg-surface-overlay text-content shadow-xl backdrop-blur-md"
            style={{ bottom: 'calc(100% + 10px)', [alignLeft ? 'left' : 'right']: 0 }}
          >
            {open && Body ? (
              <>
                <div className="flex items-center gap-1 border-b border-subtle px-2 py-2">
                  <button
                    onClick={() => setOpenKey(null)}
                    className="rounded-md p-1 text-content-secondary transition-colors hover:bg-surface-raised hover:text-content"
                    aria-label={t('modules:moduleDock.backToCargo')}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="flex-1 text-sm font-semibold text-content">{open.title}</span>
                  <button
                    onClick={collapse}
                    className="rounded-md p-1 text-content-secondary transition-colors hover:bg-surface-raised hover:text-content"
                    aria-label={t('common:close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[60vh] overflow-auto p-4">
                  <Body />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-subtle px-3 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-content-tertiary">
                    {t('modules:moduleDock.cargo')}
                  </span>
                  <button
                    onClick={() => setMenuOpen(false)}
                    className="-mr-1 rounded-md p-1 text-content-secondary transition-colors hover:bg-surface-raised hover:text-content"
                    aria-label={t('common:close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 p-1.5">
                  {panels.map((p) => (
                    <button
                      key={keyOf(p)}
                      onClick={() => pick(p)}
                      className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-raised"
                    >
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-blue-500/10 text-blue-500">
                        <Box className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm font-medium text-content">{p.title}</span>
                      {p.badge && (
                        <span className="rounded bg-surface-raised px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-content-tertiary">
                          {p.badge}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 text-content-tertiary transition-transform group-hover:translate-x-0.5" />
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <button
          ref={btnRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{ touchAction: 'none', cursor: 'grab' }}
          data-tip={t('modules:moduleDock.dragToMove')}
          className={
            'flex items-center gap-1.5 rounded-full border py-2 pl-2 pr-4 text-sm font-medium shadow-lg transition-colors ' +
            (menuOpen
              ? 'border-transparent bg-blue-600/90 text-white'
              : 'border-subtle bg-surface-overlay text-content backdrop-blur-md hover:bg-surface-raised')
          }
        >
          <GripVertical className={'h-4 w-4 ' + (menuOpen ? 'text-white/50' : 'text-content-tertiary')} />
          <Boxes className="h-4 w-4" />
          {t('modules:moduleDock.cargo')}
          <span
            className={
              'rounded-full px-1.5 text-[11px] ' +
              (menuOpen ? 'bg-white/25 text-white' : 'bg-surface-inset text-content-secondary')
            }
          >
            {panels.length}
          </span>
        </button>
      </div>
    </div>
    </>
  );
}
