/**
 * Discoverable trigger for the briefing location. Shows the resolved place, its
 * coordinates, and a "Planned" badge when an override is active, styled as an
 * unmistakable "Change location" button (people missed the old caption-with-a-
 * chevron entirely and briefed the wrong site). Clicking opens the map-first
 * picker; the pick becomes an override in weather-store, driving both the
 * weather fetch and the WMM computation.
 */
import { useState } from 'react';
import { MapPin, Pencil } from 'lucide-react';
import {
  useWeatherStore, type WeatherLocationSource,
} from '../../stores/weather-store';
import { LocationPickerDialog } from './LocationPickerDialog';
import { useTranslation } from 'react-i18next';

const AUTO_SOURCE_LABEL_KEY: Record<Exclude<WeatherLocationSource, 'override'>, string> = {
  vehicle: 'weather:source.vehicle',
  home: 'weather:source.home',
  map: 'weather:source.map',
};

export function LocationPicker(): JSX.Element {
  const { t } = useTranslation();
  const location = useWeatherStore((s) => s.location);
  const override = useWeatherStore((s) => s.override);
  const [open, setOpen] = useState(false);

  const label = location
    ? location.source === 'override'
      ? (location.name ?? t('weather:source.override'))
      : t(AUTO_SOURCE_LABEL_KEY[location.source])
    : t('weather:locationPicker.noPosition');

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="group flex items-center gap-1.5 text-xs text-content-secondary hover:text-content hover:border-default transition-colors px-2 py-1 rounded-md border border-subtle bg-surface"
        data-tip={t('weather:locationPicker.pickTip')}
      >
        <MapPin className="w-3 h-3 text-sky-400" />
        <span className="truncate max-w-[220px]">{label}</span>
        {location && (
          <span className="text-content-tertiary tabular-nums">
            &middot; {location.lat.toFixed(4)}, {location.lon.toFixed(4)}
          </span>
        )}
        {override && (
          <span className="ml-1 px-1 rounded-sm text-[9px] font-semibold uppercase tracking-wide bg-sky-500/15 text-sky-400 border border-sky-500/30">
            {t('weather:locationPicker.planned')}
          </span>
        )}
        <span className="ml-0.5 flex items-center gap-1 pl-1.5 border-l border-subtle text-content-tertiary group-hover:text-content-secondary">
          <Pencil className="w-3 h-3" />
          {t('weather:locationPicker.change')}
        </span>
      </button>

      {open && <LocationPickerDialog onClose={() => setOpen(false)} />}
    </>
  );
}
