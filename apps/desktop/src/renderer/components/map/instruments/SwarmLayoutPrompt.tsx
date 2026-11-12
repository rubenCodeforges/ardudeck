import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { useActiveVehicleStore } from '../../../stores/active-vehicle-store';
import { useMapInstrumentsStore } from '../../../stores/map-instruments-store';
import { PRESET_INSTRUMENT_LAYOUTS, SWARM_PRESET_NAME } from './preset-layouts';

// Session only: a dismissed offer comes back the next time a fleet forms.
const useSwarmPromptStore = create<{ dismissed: boolean; setDismissed: (d: boolean) => void }>((set) => ({
  dismissed: false,
  setDismissed: (dismissed) => set({ dismissed }),
}));

const SPLIT_PRESET_NAME = 'Split cockpit'; // i18n-exempt: preset identifier

/** Offers the Swarm layout once a second vehicle joins. */
export function SwarmLayoutPrompt(): JSX.Element | null {
  const { t } = useTranslation();
  const fleetCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);
  const activePreset = useMapInstrumentsStore((s) => s.activePreset);
  const applyLayout = useMapInstrumentsStore((s) => s.applyLayout);
  const dismissed = useSwarmPromptStore((s) => s.dismissed);
  const setDismissed = useSwarmPromptStore((s) => s.setDismissed);

  useEffect(() => {
    if (fleetCount < 2) setDismissed(false);
  }, [fleetCount, setDismissed]);

  if (fleetCount < 2 || dismissed || activePreset === SWARM_PRESET_NAME || activePreset === SPLIT_PRESET_NAME) return null;
  const swarm = PRESET_INSTRUMENT_LAYOUTS.find((p) => p.name === SWARM_PRESET_NAME);
  if (!swarm) return null;

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1001] flex items-center gap-3 rounded-lg border border-subtle bg-surface-solid shadow-xl px-3 py-2">
      <div className="min-w-0">
        <div className="text-[12px] font-semibold text-content">{t('map:swarmPrompt.title', { count: fleetCount })}</div>
        <div className="text-[11px] text-content-tertiary">{t('map:swarmPrompt.body')}</div>
      </div>
      <button
        type="button"
        onClick={() => applyLayout(swarm.layout, swarm.name)}
        className="shrink-0 rounded px-2.5 py-1 text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-500 transition-colors"
      >
        {t('map:swarmPrompt.apply')}
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded px-2 py-1 text-[11px] text-content-secondary hover:bg-surface-raised hover:text-content transition-colors"
      >
        {t('map:swarmPrompt.dismiss')}
      </button>
    </div>
  );
}
