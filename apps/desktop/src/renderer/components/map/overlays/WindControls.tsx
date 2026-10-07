/**
 * WindControls — slim Windy-style timeline bar for the wind overlay.
 *
 * Sits low and centred so it doesn't obscure the map (unlike a side panel):
 * altitude pills, a play/pause, a forecast-hour scrubber with the current time,
 * and a compact speed legend. Auto-play advances the forecast hour on a timer.
 */

import { useTranslation } from 'react-i18next';
import { i18n } from '../../../../shared/i18n/index.js';
import { useEffect, useState } from 'react';
import { useWindStore } from '../../../stores/wind-store';
import { useSettingsStore } from '../../../stores/settings-store';
import { WIND_ALTITUDES, type WindAltitude } from '../../../../shared/wind-types';
import { formatAltitudeFromMeters } from '../../../../shared/user-units.js';
import { windColor, convertSpeed, unitLabel } from '../wind/wind-field';
import { useDraggableOverlay } from '../useDraggableOverlay';

const LEGEND_SAMPLES = [0, 5, 10, 15, 20, 28];
const PLAY_INTERVAL_MS = 600;

function legendGradient(): string {
  return `linear-gradient(to right, ${LEGEND_SAMPLES.map((s) => windColor(s)).join(', ')})`;
}

/** "2026-06-18T14:00" -> "Wed 14:00 UTC". Falls back to the raw string. */
function formatFrameTime(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, y, mo, d, hh, mm] = m;
  const dow = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' });
  return `${dow} ${hh}:${mm} UTC`;
}

function shortDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString(i18n.language, { weekday: 'short', timeZone: 'UTC' });
}

// raised: clear the attitude-ball overlay (bottom-center, ~160px tall) on the
// telemetry map; other hosts keep the default bottom placement. Both are only
// the STARTING position: the bar is drag-to-place and persists where the
// operator drops it (per dragKey, clamped inside the map panel).
export function WindControls({ raised = false, dragKey = 'wind-bar' }: { raised?: boolean; dragKey?: string } = {}): JSX.Element {
  const { t } = useTranslation();
  const dragOverlay = useDraggableOverlay(dragKey);
  const field = useWindStore((s) => s.field);
  const loading = useWindStore((s) => s.loading);
  const error = useWindStore((s) => s.error);
  const altitudeM = useWindStore((s) => s.altitudeM);
  const frameIndex = useWindStore((s) => s.frameIndex);
  const units = useWindStore((s) => s.units);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const { setAltitude, setFrameIndex, cycleUnits } = useWindStore.getState();
  const [playing, setPlaying] = useState(false);

  const frames = field?.frames ?? [];
  const current = frames[frameIndex];
  const lastIdx = Math.max(0, frames.length - 1);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const id = window.setInterval(() => {
      const s = useWindStore.getState();
      const n = (s.field?.frames.length ?? 0);
      if (n === 0) return;
      s.setFrameIndex(s.frameIndex + 1 >= n ? 0 : s.frameIndex + 1);
    }, PLAY_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  const status = loading ? t('map:windControls.loading') : field ? null : error ? t('map:windControls.unavailable') : null;

  return (
    <div
      ref={dragOverlay.ref}
      style={dragOverlay.style}
      onPointerDown={dragOverlay.onPointerDown}
      className={`touch-none absolute ${raised ? 'bottom-44' : 'bottom-12'} left-1/2 -translate-x-1/2 z-[1000] max-w-[92%] flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-solid border border-subtle shadow-xl select-none`}
    >
      {/* Altitude pills */}
      <div className="flex items-center gap-0.5 shrink-0">
        {WIND_ALTITUDES.map((a: WindAltitude) => (
          <button
            key={a}
            type="button"
            onClick={() => setAltitude(a)}
            className={
              'px-1.5 py-1 rounded text-[11px] font-medium transition-colors ' +
              (a === altitudeM ? 'bg-blue-600 text-white' : 'text-content-secondary hover:text-content')
            }
            data-tip={t('map:windControls.altTip', { alt: formatAltitudeFromMeters(a, altitudeUnit) })}
          >
            {formatAltitudeFromMeters(a, altitudeUnit)}
          </button>
        ))}
      </div>

      <div className="w-px h-6 bg-subtle shrink-0" />

      {/* Play / pause */}
      <button
        type="button"
        onClick={() => setPlaying((v) => !v)}
        disabled={frames.length === 0}
        data-tip={playing ? t('common:pause') : t('map:windControls.play')}
        className="w-7 h-7 shrink-0 flex items-center justify-center rounded bg-surface-raised text-content hover:brightness-125 disabled:opacity-40"
      >
        {playing ? (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 5l12 7-12 7z" /></svg>
        )}
      </button>

      {/* Timeline. min-w low enough that the bar fits narrow map panes - with 240px the
          shrink-0 legend was pushed past the container's rounded corner. */}
      <div className="flex flex-col gap-0.5 min-w-[140px] flex-1">
        <div className="flex items-center justify-between text-[10px] text-content-tertiary tabular-nums leading-none">
          <span>{frames[0] ? shortDay(frames[0].time) : ''}</span>
          <span className="text-content font-medium truncate max-w-[180px]">{current ? formatFrameTime(current.time) : (status ?? '-')}</span>
          <span>{frames[lastIdx] ? shortDay(frames[lastIdx].time) : ''}</span>
        </div>
        <input
          type="range"
          min={0}
          max={lastIdx}
          value={frameIndex}
          onChange={(e) => setFrameIndex(Number(e.target.value))}
          disabled={frames.length === 0}
          className="w-full accent-blue-600"
          aria-label={t('map:windControls.forecastHour')}
        />
      </div>

      <div className="w-px h-6 bg-subtle shrink-0" />

      {/* Legend + unit toggle */}
      <div className="shrink-0 flex flex-col gap-0.5" data-tip={t('map:windControls.legendTip')}>
        <div className="w-20 h-2 rounded" style={{ background: legendGradient() }} />
        <div className="flex justify-between items-center text-[9px] text-content-tertiary leading-none tabular-nums">
          <span>0</span>
          <button
            type="button"
            onClick={cycleUnits}
            data-tip={t('map:windControls.cycleUnits')}
            className="px-1 rounded text-content-secondary hover:text-content hover:bg-surface-raised font-medium"
          >
            {unitLabel(units)}
          </button>
          <span>{Math.round(convertSpeed(28, units))}</span>
        </div>
      </div>
    </div>
  );
}
