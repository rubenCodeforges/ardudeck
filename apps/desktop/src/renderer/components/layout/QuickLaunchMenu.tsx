/**
 * Quick Launch — a header menu that opens self-contained features in their own
 * OS window (rather than swapping the main view like the nav rail does). These
 * are surfaces you want alongside your workspace or on a second monitor.
 *
 * Area Editor keeps its existing dedicated opener; the other entries go through
 * the generic detached-window system (they are already registered there).
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { t as i18nT } from '../../../shared/i18n/index.js';

interface LaunchItem {
  id: string;
  labelKey: string;
  descKey: string;
  iconColor: string;
  icon: React.ReactNode;
  badgeKey?: string;
  launch: () => void;
}

const ITEMS: LaunchItem[] = [
  {
    id: 'area-editor',
    labelKey: 'common:areaEditor',
    descKey: 'layout:quickLaunch.areaEditorDesc',
    iconColor: 'text-teal-400',
    badgeKey: 'common:new',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536M9 11l6.5-6.5a2 2 0 012.828 2.828L11.828 14H9v-3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17l4-4" />
      </svg>
    ),
    launch: () => { window.electronAPI?.openAreaEditor?.().catch(() => undefined); },
  },
  {
    id: 'sim-world',
    labelKey: 'common:3dSimWorld',
    descKey: 'layout:quickLaunch.simWorldDesc',
    iconColor: 'text-emerald-400',
    badgeKey: 'common:new',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
      </svg>
    ),
    launch: () => { window.electronAPI?.openDetachedWindow?.({ componentId: 'sim-world', title: i18nT('common:3dSimWorld'), initialBounds: { width: 1280, height: 800 } }); },
  },
  {
    id: 'inspector',
    labelKey: 'common:mavlinkInspector',
    descKey: 'layout:quickLaunch.inspectorDesc',
    iconColor: 'text-blue-400',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    launch: () => { window.electronAPI?.openDetachedWindow?.({ componentId: 'inspector', title: i18nT('common:mavlinkInspector'), initialBounds: { width: 1200, height: 800 } }); },
  },
  {
    id: 'telemetry-dashboard',
    labelKey: 'layout:quickLaunch.telemetryDashboard',
    descKey: 'layout:quickLaunch.telemetryDashboardDesc',
    iconColor: 'text-purple-400',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    launch: () => { window.electronAPI?.openDetachedWindow?.({ componentId: 'telemetry-dashboard', title: i18nT('layout:quickLaunch.telemetryDashboard'), initialBounds: { width: 1280, height: 800 } }); },
  },
];

export function QuickLaunchMenu() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        data-tour="quick-launch"
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-1.5 pl-2.5 pr-2 py-1.5 rounded-lg bg-surface border border-subtle hover:border-teal-500/40 hover:bg-surface-raised transition-colors"
        title={t('layout:quickLaunch.buttonTitle')}
      >
        <svg className="w-4 h-4 text-teal-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h5a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
        <span className="text-sm font-medium text-content-secondary group-hover:text-content transition-colors">{t('layout:quickLaunch.button')}</span>
        <svg className={`w-3 h-3 text-content-tertiary transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-[60] w-72 bg-surface-solid border border-subtle rounded-lg shadow-xl py-1">
          {ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => { item.launch(); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors flex items-start gap-2.5"
            >
              <span className={`${item.iconColor} mt-0.5 shrink-0`}>{item.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-content">{t(item.labelKey)}</span>
                  {item.badgeKey && (
                    <span className="px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-teal-300 bg-teal-500/15 border border-teal-500/30 rounded">
                      {t(item.badgeKey)}
                    </span>
                  )}
                </span>
                <span className="block text-[10px] text-content-tertiary leading-snug">{t(item.descKey)}</span>
              </span>
              {/* opens-in-a-window affordance */}
              <svg className="w-3.5 h-3.5 text-content-tertiary mt-0.5 shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
