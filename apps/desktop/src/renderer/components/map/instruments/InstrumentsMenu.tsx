/**
 * "Instruments" button at the telemetry map's top-left. Opens the instruments
 * catalog (InstrumentsCatalog): a role rail plus live-preview cards for
 * showing/hiding instruments, picking each one's display variant, and sizing
 * it, alongside a layout-and-presets pane.
 *
 * The button deliberately mirrors MapLayersControl's trigger so the two map
 * menus read as one family; the count reflects how many instruments are on
 * screen.
 */
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useMapInstrumentsStore, resolveInstrumentVisible } from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS } from './registry';
import { InstrumentsCatalog } from './InstrumentsCatalog';

const gaugeIcon = (
  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 15a8.4 8.4 0 1116.8 0" />
    <path strokeLinecap="round" d="M12 15l3.5-4.5" />
  </svg>
);

export function InstrumentsMenu(): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const visible = useMapInstrumentsStore((s) => s.visible);
  const count = MAP_INSTRUMENTS.reduce((n, i) => n + (resolveInstrumentVisible(visible, i.id) ? 1 : 0), 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-tip={t('map:instrumentsMenu.tip')}
        data-tour="map-instruments"
        className="px-2 py-1 inline-flex items-center gap-1.5 rounded text-xs bg-surface text-content hover:bg-surface-raised shadow-lg transition-colors"
      >
        {gaugeIcon}
        <span className="font-medium">{count > 0 ? t('map:instrumentsMenu.buttonCount', { count }) : t('map:instrumentsMenu.button')}</span>
      </button>
      {open && <InstrumentsCatalog onClose={() => setOpen(false)} />}
    </>
  );
}
