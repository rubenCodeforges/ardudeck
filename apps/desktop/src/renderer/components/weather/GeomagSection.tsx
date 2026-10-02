/**
 * Geomagnetic section of the pre-flight briefing. Reuses the briefing's visual
 * language (solid tiles, small-caps captions, threshold tracks) to surface the
 * two space-weather concerns that gate a survey: the current planetary Kp and
 * the forecast peak (the postpone-the-flight number), plus the offline WMM
 * field at the site as non-gating context.
 *
 * Grading is done by the caller (gradeGeomagneticActivity), which also feeds the
 * overall hero verdict; this file draws, it does not decide go / no-go.
 */
import {
  Activity, CalendarClock, Compass, ArrowDown, Magnet, ZapOff, Info, type LucideIcon,
} from 'lucide-react';
import type { GeomagneticActivity } from '../../utils/geomag-activity-api';
import { gScaleLabel, gScaleFromKp } from '../../utils/geomag-activity-api';
import type { GeomagneticField } from '../../utils/wmm';
import {
  GEOMAG_THRESHOLDS, gradeKp, type GeomagVerdict, type GeomagStatus,
} from '../../utils/geomag-thresholds';
import { GRADE_COLOR } from './weather-visuals';
import { MetricTile } from './MetricTile';
import { ThresholdTrack, type TrackZone } from './ThresholdTrack';
import { useTranslation } from 'react-i18next';

const GREEN = 'var(--gauge-green)';
const AMBER = 'var(--gauge-amber)';
const RED = 'var(--gauge-red)';
const KP_MAX = 9;

interface GeomagSectionProps {
  activity: GeomagneticActivity | null;
  unavailable: boolean;
  field: GeomagneticField | null;
  modelValid: boolean;
  verdict: GeomagVerdict | null;
  animate: boolean;
}

function formatKp(kp: number): string {
  return Number.isInteger(kp) ? String(kp) : kp.toFixed(1);
}

// Kp 0-9 rail with the storm zones straight from GEOMAG_THRESHOLDS.
function kpZones(): TrackZone[] {
  const { caution, nogo } = GEOMAG_THRESHOLDS.kp;
  return [
    { from: 0, to: caution, color: GREEN },
    { from: caution, to: nogo, color: AMBER },
    { from: nogo, to: KP_MAX, color: RED },
  ];
}

function hoursUntil(iso: string | null): number | null {
  if (!iso) return null;
  const diff = new Date(iso).valueOf() - Date.now();
  return Math.max(0, Math.round(diff / 3_600_000));
}

function GeomagTile({
  icon: Icon, caption, children,
}: { icon: LucideIcon; caption: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-solid rounded-xl border border-default px-3 py-2.5 flex flex-col shadow-sm">
      <div className="flex items-center gap-1.5 text-content-secondary">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{caption}</span>
      </div>
      {children}
    </div>
  );
}

/** Sparkline of the next few days of predicted Kp, each bar coloured by grade. */
function KpForecastBars({ activity, animate }: { activity: GeomagneticActivity; animate: boolean }) {
  const { t } = useTranslation();
  const points = activity.forecast.slice(0, 24);
  if (points.length === 0) return null;
  return (
    <div className="bg-surface-solid rounded-xl border border-default px-3 py-2.5 shadow-sm">
      <div className="flex items-center gap-1.5 text-content-secondary mb-2">
        <CalendarClock className="w-3.5 h-3.5" />
        <span className="text-[10px] font-semibold uppercase tracking-wider">{t('weather:geomag.forecastKp')}</span>
      </div>
      <div className="flex items-end gap-[3px] h-12">
        {points.map((p, i) => {
          const status = gradeKp(p.kp);
          const heightPct = Math.max(6, (p.kp / KP_MAX) * 100);
          const when = new Date(p.timeIso);
          const clock = `${String(when.getHours()).padStart(2, '0')}:00`;
          return (
            <div
              key={p.timeIso}
              className="flex-1 rounded-sm"
              data-tip={t('weather:geomag.kpBarTip', { kp: formatKp(p.kp), gScale: gScaleLabel(p.gScale), clock })}
              style={{
                height: `${heightPct}%`,
                background: `color-mix(in srgb, ${GRADE_COLOR[status]} 60%, transparent)`,
                transition: animate ? `height 0.5s cubic-bezier(0.22,1,0.36,1) ${i * 12}ms` : 'none',
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function GeomagSection({ activity, unavailable, field, modelValid, verdict, animate }: GeomagSectionProps): JSX.Element {
  const { t } = useTranslation();
  const decl = field ? field.declinationDeg : null;
  const incl = field ? field.inclinationDeg : null;
  const totalUt = field ? field.totalIntensityNt / 1000 : null;

  const contextTiles = (
    <div className="grid grid-cols-3 gap-3">
      <MetricTile
        icon={<Compass className="w-3.5 h-3.5" />}
        label={t('weather:geomag.declination')}
        value={decl != null ? Math.abs(decl).toFixed(1) : '--'}
        unit={decl != null ? (decl >= 0 ? 'deg E' : 'deg W') : ''}
        animate={animate}
      />
      <MetricTile
        icon={<ArrowDown className="w-3.5 h-3.5" />}
        label={t('weather:geomag.inclination')}
        value={incl != null ? incl.toFixed(1) : '--'}
        unit="deg"
        animate={animate}
      />
      <MetricTile
        icon={<Magnet className="w-3.5 h-3.5" />}
        label={t('weather:geomag.fieldStrength')}
        value={totalUt != null ? totalUt.toFixed(1) : '--'}
        unit="uT"
        animate={animate}
      />
    </div>
  );

  return (
    <div className="wx-rise" style={{ animationDelay: '230ms' }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-content-tertiary mb-2">
        {t('weather:geomag.title')}
      </div>

      {unavailable || !activity || !verdict ? (
        <div className="space-y-3">
          <div className="bg-surface-solid rounded-xl border border-default px-3 py-3 flex items-center gap-2.5 shadow-sm">
            <ZapOff className="w-4 h-4 shrink-0 text-content-tertiary" />
            <div className="min-w-0">
              <div className="text-xs font-medium text-content-secondary">{t('weather:geomag.unavailable')}</div>
              <div className="text-[10px] text-content-tertiary">
                {t('weather:geomag.unavailableHint')}
              </div>
            </div>
          </div>
          {contextTiles}
        </div>
      ) : (
        (() => {
          const kpColor = GRADE_COLOR[verdict.currentStatus as GeomagStatus];
          const peak = activity.peakKp72h;
          const peakColor = peak != null ? GRADE_COLOR[verdict.forecastStatus as GeomagStatus] : GRADE_COLOR.info;
          const peakHours = hoursUntil(activity.peakTime72hIso);

          return (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Current activity: gating, with a Kp 0-9 rail. */}
                <GeomagTile icon={Activity} caption={t('weather:geomag.activity')}>
                  <div className="mt-1.5 flex items-baseline gap-1.5 whitespace-nowrap">
                    <span className="text-2xl font-bold leading-none tabular-nums" style={{ color: kpColor }}>
                      {/* i18n-exempt */}
                      Kp {formatKp(activity.currentKp)}
                    </span>
                    <span className="text-xs font-medium text-content-tertiary">
                      {gScaleLabel(activity.currentGScale)}
                    </span>
                  </div>
                  <div className="text-[11px] text-content-secondary mt-0.5">{activity.conditionLabel}</div>
                  <ThresholdTrack
                    min={0}
                    max={KP_MAX}
                    value={Math.min(activity.currentKp, KP_MAX)}
                    zones={kpZones()}
                    markerColor={kpColor}
                    animate={animate}
                    tip={t('weather:geomag.kpThresholdTip', { caution: GEOMAG_THRESHOLDS.kp.caution, nogo: GEOMAG_THRESHOLDS.kp.nogo })}
                  />
                </GeomagTile>

                {/* Forecast peak: the postpone-the-survey signal, made prominent. */}
                <GeomagTile icon={CalendarClock} caption={t('weather:geomag.forecastPeak')}>
                  {peak != null ? (
                    <>
                      <div className="mt-1.5 flex items-baseline gap-1.5 whitespace-nowrap">
                        <span className="text-2xl font-bold leading-none tabular-nums" style={{ color: peakColor }}>
                          {t('weather:geomag.peakKp', { kp: formatKp(peak) })}
                        </span>
                        <span className="text-xs font-medium text-content-tertiary">
                          {gScaleLabel(gScaleFromKp(peak))}
                        </span>
                      </div>
                      <div className="text-[11px] text-content-secondary mt-0.5 tabular-nums">
                        {peakHours != null ? t('weather:geomag.inHours', { hours: peakHours }) : t('weather:geomag.within72h')}
                        {activity.peakTime72hIso && (
                          <span className="text-content-tertiary">
                            {' '}&middot; {new Date(activity.peakTime72hIso).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                      <ThresholdTrack
                        min={0}
                        max={KP_MAX}
                        value={Math.min(peak, KP_MAX)}
                        zones={kpZones()}
                        markerColor={peakColor}
                        animate={animate}
                        tip={t('weather:geomag.peakTip')}
                      />
                    </>
                  ) : (
                    <>
                      <div className="mt-1.5 text-2xl font-bold leading-none text-content-secondary">{t('weather:geomag.calm')}</div>
                      <div className="text-[11px] text-content-tertiary mt-0.5">{t('weather:geomag.noStorm')}</div>
                      <div className="mt-2 h-1.5" />
                    </>
                  )}
                </GeomagTile>
              </div>

              <KpForecastBars activity={activity} animate={animate} />

              {contextTiles}

              {!modelValid && (
                <div className="flex items-center gap-1.5 text-[10px] text-content-tertiary">
                  <Info className="w-3 h-3 shrink-0" />
                  {t('weather:geomag.wmmInvalid')}
                </div>
              )}

              <div className="text-[10px] text-content-tertiary text-center tabular-nums">
                {t('weather:geomag.sources')}
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}
