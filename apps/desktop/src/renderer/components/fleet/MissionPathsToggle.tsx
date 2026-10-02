/**
 * "Mission paths" options for the telemetry map's Layers menu - decide whether the map
 * draws every vehicle's flight path or only the selected vehicle's. Rendered as two
 * radio-style rows that match the rest of the Layers menu (icon + label, active = blue),
 * so it reads as part of the menu rather than a stray toggle. Renders nothing for a
 * single vehicle.
 */

import { useTranslation } from 'react-i18next';
import { useFleetVehicles } from '../../hooks/useFleet';
import { useTelemMissionViewStore } from '../../stores/telem-mission-view-store';

function PathIcon() {
  return (
    <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 18 L10 8 L14 14 L19 6" />
      <circle cx="5" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="6" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MissionPathsToggle(): JSX.Element | null {
  const { t } = useTranslation();
  const vehicles = useFleetVehicles();
  const mode = useTelemMissionViewStore((s) => s.mode);
  const setMode = useTelemMissionViewStore((s) => s.setMode);

  if (vehicles.length < 2) return null;

  const row = (active: boolean) =>
    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition-colors focus:outline-none ' +
    (active ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-surface-raised hover:text-content');

  return (
    <>
      <div className="px-2.5 pt-1 pb-0.5 text-[11px] uppercase tracking-wide text-content-tertiary">{t('fleet:missionPathsToggle.title')}</div>
      <button type="button" onClick={() => setMode('all')} data-tip={t('fleet:missionPathsToggle.allTip')} className={row(mode === 'all')}>
        <PathIcon />
        {t('fleet:missionPathsToggle.all')}
      </button>
      <button type="button" onClick={() => setMode('selected')} data-tip={t('fleet:missionPathsToggle.selectedTip')} className={row(mode === 'selected')}>
        <PathIcon />
        {t('fleet:missionPathsToggle.selected')}
      </button>
    </>
  );
}
