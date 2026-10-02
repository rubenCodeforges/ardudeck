/**
 * TrafficAltitudeFilter — on-map control for the altitude relevance band.
 *
 * The Settings value is only the *default*; this control is what actually governs
 * the live maps. It reads/writes the traffic-store band, so dragging a slider
 * instantly resizes/fades contacts on every surface. The card collapses to a
 * compact chip (showing the current band) so it stays out of the way until needed.
 * `TrafficAltitudeFilterCard` is the presentational card; the default export
 * self-gates on the Leaflet overlay toggles so it can be dropped into a map once.
 */

import { useTranslation, Trans } from 'react-i18next';
import { useState } from 'react';
import { useTrafficStore } from '../../../stores/traffic-store';
import { useOverlayStore } from '../../../stores/overlay-store';

const MAX_M = 8000;
const ft = (m: number): string => Math.round(m / 0.3048).toLocaleString();

function AltIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7l4-4 4 4M8 17l4 4 4-4M12 3v18" />
    </svg>
  );
}

export function TrafficAltitudeFilterCard({ className }: { className?: string }): JSX.Element {
  const { t } = useTranslation();
  const band = useTrafficStore((s) => s.altitudeBand);
  const setBand = useTrafficStore((s) => s.setAltitudeBand);
  const [open, setOpen] = useState(false);

  const setFloor = (v: number): void => setBand({ ...band, floorMeters: Math.min(v, band.ceilingMeters) });
  const setCeil = (v: number): void => setBand({ ...band, ceilingMeters: Math.max(v, band.floorMeters) });
  const setHardCeiling = (v: boolean): void => setBand({ ...band, hardCeiling: v });

  if (!open) {
    return (
      <div className={`${className ?? ''} pointer-events-auto`}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-tip={t('map:trafficAltFilter.title')}
          className="flex items-center gap-1.5 h-8 px-2.5 bg-surface-overlay backdrop-blur-sm rounded-lg border border-subtle shadow-lg text-xs font-medium text-content hover:border-strong transition-colors"
        >
          <AltIcon className="w-3.5 h-3.5 text-content-secondary" />
          <span className="tabular-nums">{band.floorMeters}-{band.ceilingMeters} m</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`${className ?? ''} w-56 bg-surface-overlay backdrop-blur-sm rounded-lg border border-subtle shadow-lg p-3 pointer-events-auto`}>
      <div className="flex items-center justify-between mb-2">
        <span className="flex items-center gap-1.5 text-xs font-medium text-content">
          <AltIcon className="w-3.5 h-3.5 text-content-secondary" />
          {t('map:trafficAltFilter.title')}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-content-tertiary uppercase tracking-wide">{t('map:trafficAltFilter.msl')}</span>
          <button type="button" onClick={() => setOpen(false)} data-tip={t('common:collapse')} className="text-content-tertiary hover:text-content">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            </svg>
          </button>
        </div>
      </div>
      <label className="block text-[11px] text-content-secondary mb-1">
        <Trans i18nKey="map:trafficAltFilter.floor" values={{ m: band.floorMeters, ft: ft(band.floorMeters) }} components={{ v: <span className="text-content tabular-nums" />, ft: <span className="text-content-tertiary" /> }} />
      </label>
      <input
        type="range"
        min={0}
        max={MAX_M}
        step={50}
        value={band.floorMeters}
        onChange={(e) => setFloor(Number(e.target.value))}
        className="w-full accent-sky-500 mb-2"
      />
      <label className="block text-[11px] text-content-secondary mb-1">
        <Trans i18nKey="map:trafficAltFilter.ceiling" values={{ m: band.ceilingMeters, ft: ft(band.ceilingMeters) }} components={{ v: <span className="text-content tabular-nums" />, ft: <span className="text-content-tertiary" /> }} />
      </label>
      <input
        type="range"
        min={0}
        max={MAX_M}
        step={50}
        value={band.ceilingMeters}
        onChange={(e) => setCeil(Number(e.target.value))}
        className="w-full accent-sky-500"
      />
      <button
        type="button"
        onClick={() => setHardCeiling(!band.hardCeiling)}
        className="mt-2.5 flex items-center justify-between w-full text-left"
      >
        <span className="text-[11px] text-content-secondary">{t('map:trafficAltFilter.hideAbove')}</span>
        <span className={`w-8 h-[18px] rounded-full transition-colors relative flex-shrink-0 ${band.hardCeiling ? 'bg-sky-500' : 'bg-surface-inset'}`}>
          <span className={`w-3.5 h-3.5 rounded-full bg-white border border-strong shadow-sm absolute top-0.5 transition-all ${band.hardCeiling ? 'left-[14px]' : 'left-0.5'}`} />
        </span>
      </button>
      <p className="text-[10px] text-content-tertiary mt-1.5 leading-snug">
        {band.hardCeiling ? t('map:trafficAltFilter.hintHard') : t('map:trafficAltFilter.hintSoft')}
      </p>
    </div>
  );
}

/** Leaflet maps: shows only when a traffic layer is active. */
export function TrafficAltitudeFilter({ className }: { className?: string }): JSX.Element | null {
  const active = useOverlayStore((s) => s.activeOverlays.has('traffic') || s.activeOverlays.has('gliders'));
  if (!active) return null;
  return <TrafficAltitudeFilterCard className={className ?? 'absolute top-3 left-14 z-[1000]'} />;
}
