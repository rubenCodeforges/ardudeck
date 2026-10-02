/**
 * Free-floating Fleet Ops panel for the telemetry screen: the group commands that
 * used to sit pinned in the FleetStrip rail (synchronized take-off, per-leader
 * mission start, and the multi-select group actions), now draggable and edge-snapping
 * like the Sim World flight-control panel. Only shown in swarm mode with an engine
 * connected; self-gates to nothing otherwise.
 */

import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useRef } from 'react';
import { useDraggableSnap } from '../../hooks/useDraggableSnap';
import { useFleetActionsPanelStore } from '../../stores/fleet-actions-panel-store';
import { useFormationControl } from '../../hooks/useFormationControl';
import { FleetCoordination } from './FleetCoordination';
import { FleetGroupActions } from './FleetGroupActions';
import { FleetRadar } from './FleetMinimap';

export function DraggableFleetActions(): JSX.Element | null {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const x = useFleetActionsPanelStore((s) => s.x);
  const y = useFleetActionsPanelStore((s) => s.y);
  const collapsed = useFleetActionsPanelStore((s) => s.collapsed);
  const setPos = useFleetActionsPanelStore((s) => s.setPos);
  const persist = useFleetActionsPanelStore((s) => s.persist);
  const toggleCollapsed = useFleetActionsPanelStore((s) => s.toggleCollapsed);
  const { onHandlePointerDown } = useDraggableSnap(panelRef, { setPos, persist });

  const { vehicles } = useFormationControl();
  // Show for any fleet (2+ vehicles) so the radar is always available; the group-action
  // sections inside self-gate to when an engine is connected.
  const visible = vehicles.length >= 2;

  const clampIntoView = useCallback(() => {
    const w = panelRef.current?.offsetWidth ?? 240;
    const h = panelRef.current?.offsetHeight ?? 200;
    const maxX = Math.max(12, window.innerWidth - w - 12);
    const maxY = Math.max(12, window.innerHeight - h - 12);
    const store = useFleetActionsPanelStore.getState();
    if (store.x === null || store.y === null) {
      store.setPos(maxX, maxY); // seed lower-right, clear of the left fleet rail
      store.persist();
      return;
    }
    const nx = Math.min(Math.max(12, store.x), maxX);
    const ny = Math.min(Math.max(12, store.y), maxY);
    if (nx !== store.x || ny !== store.y) {
      store.setPos(nx, ny);
      store.persist();
    }
  }, []);

  useEffect(() => {
    if (!visible) return;
    clampIntoView();
    window.addEventListener('resize', clampIntoView);
    return () => window.removeEventListener('resize', clampIntoView);
  }, [visible, clampIntoView]);

  useEffect(() => {
    if (visible) clampIntoView();
  }, [collapsed, visible, clampIntoView]);

  if (!visible) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-[60] w-60 rounded-xl border border-subtle shadow-2xl overflow-hidden bg-surface-solid flex flex-col"
      style={{ left: x ?? -9999, top: y ?? -9999 }}
    >
      <div
        className="flex items-center gap-1.5 px-2 py-1 bg-surface-solid border-b border-subtle cursor-move shrink-0"
        onPointerDown={onHandlePointerDown}
        data-tip={t('fleet:draggableFleetActions.dragTip')}
      >
        <svg width="9" height="11" viewBox="0 0 9 11" className="text-content-tertiary" aria-hidden="true">
          {[2, 5.5, 9].map((cy) => [2, 7].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" fill="currentColor" />))}
        </svg>
        <span className="text-[10px] font-medium text-content-tertiary uppercase tracking-wide">{t('fleet:draggableFleetActions.title')}</span>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={toggleCollapsed}
          className="ml-auto -mr-0.5 flex h-5 w-5 items-center justify-center rounded text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
          data-tip={collapsed ? t('common:expand') : t('common:collapse')}
          aria-label={collapsed ? t('fleet:draggableFleetActions.expandAria') : t('fleet:draggableFleetActions.collapseAria')}
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${collapsed ? '' : 'rotate-180'}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {!collapsed && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <FleetRadar />
          <FleetCoordination />
          <FleetGroupActions />
        </div>
      )}
    </div>
  );
}
