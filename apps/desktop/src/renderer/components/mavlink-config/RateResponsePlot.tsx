/**
 * Stick to rotation rate, with the pilot's own stick on it.
 *
 * Same idea as the rover's throttle curve: the two numbers that define the
 * feeling are legible as a shape, not as "180 deg/s, expo 0.35".
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { rateCurve, commandedRate, secondsPerTurn, rateAtHalfStick } from './rate-response';
import { stickPercent } from './throttle-response';

interface RateResponsePlotProps {
  /** Rate at full stick, in the scheme's units (deg/s on modern ArduCopter). */
  maxRate: number;
  expo: number;
  unit: string;
  /** Which stick to follow: roll uses RCMAP_ROLL, yaw uses RCMAP_YAW. */
  axis: 'roll' | 'yaw';
  accent?: string;
}

const W = 300;
const H = 190;
const L = 40;
const R = 12;
const T = 14;
const B = 26;

export function RateResponsePlot({
  maxRate, expo, unit, axis, accent = '#3B82F6',
}: RateResponsePlotProps): JSX.Element {
  const { t } = useTranslation();
  const { parameters } = useParameterStore();
  const rc = useTelemetryStore((s) => s.rcChannels);

  const stick = useMemo(() => {
    const mapParam = axis === 'yaw' ? 'RCMAP_YAW' : 'RCMAP_ROLL';
    const ch = (parameters.get(mapParam)?.value as number) ?? (axis === 'yaw' ? 4 : 1);
    return stickPercent(
      rc.channels[ch - 1],
      (parameters.get(`RC${ch}_MIN`)?.value as number) ?? 1000,
      (parameters.get(`RC${ch}_MAX`)?.value as number) ?? 2000,
      (parameters.get(`RC${ch}_TRIM`)?.value as number) ?? 1500,
    );
  }, [parameters, rc.channels, axis]);

  const points = useMemo(() => rateCurve(maxRate, expo), [maxRate, expo]);
  const x = (v: number) => L + ((v + 100) / 200) * (W - L - R);
  const y = (v: number) => H - B - ((v / maxRate + 1) / 2) * (H - T - B);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');

  const liveRate = stick === null ? null : commandedRate(stick, maxRate, expo);
  const turn = secondsPerTurn(maxRate);
  const half = rateAtHalfStick(maxRate, expo);

  return (
    <div className="rounded-xl border border-subtle bg-surface-raised overflow-hidden">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <defs>
          <linearGradient id={`rate-fill-${axis}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={accent} stopOpacity="0.26" />
            <stop offset="1" stopColor={accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[-1, -0.5, 0, 0.5, 1].map((f) => (
          <g key={`h${f}`}>
            <line x1={L} y1={y(maxRate * f)} x2={W - R} y2={y(maxRate * f)}
              stroke="var(--border-subtle)" strokeWidth={f === 0 ? 1.2 : 0.6} />
            <text x={L - 5} y={y(maxRate * f) + 3} textAnchor="end" fontSize="7.5" fill="var(--text-tertiary)">
              {Math.round(maxRate * f)}
            </text>
          </g>
        ))}
        {[-100, -50, 0, 50, 100].map((v) => (
          <line key={`v${v}`} x1={x(v)} y1={T} x2={x(v)} y2={H - B}
            stroke="var(--border-subtle)" strokeWidth={v === 0 ? 1.2 : 0.6} />
        ))}

        <line x1={x(-100)} y1={y(-maxRate)} x2={x(100)} y2={y(maxRate)}
          stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />

        <path d={`${path} L ${x(100).toFixed(1)} ${y(0).toFixed(1)} L ${x(-100).toFixed(1)} ${y(0).toFixed(1)} Z`}
          fill={`url(#rate-fill-${axis})`} />
        <path d={path} fill="none" stroke={accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {stick !== null && liveRate !== null && (
          <g>
            <line x1={x(stick)} y1={y(0)} x2={x(stick)} y2={y(liveRate)} stroke={accent} strokeWidth="1" opacity="0.5" />
            <circle cx={x(stick)} cy={y(liveRate)} r="8" fill={accent} opacity="0.18" />
            <circle cx={x(stick)} cy={y(liveRate)} r="4" fill={accent}
              stroke="var(--bg-surface-solid)" strokeWidth="1.5" />
          </g>
        )}

        {stick !== null && (
          <g>
            <circle cx={W - R - 34} cy={T - 6} r="2.5" fill="#34D399">
              <animate attributeName="opacity" values="1;0.25;1" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <text x={W - R - 28} y={T - 3} fontSize="7.5" fill="#34D399" letterSpacing="0.5">{t('mavlink-config:responsePlot.live')}</text>
          </g>
        )}
        <text x={L} y={T - 4} fontSize="7.5" fill="var(--text-tertiary)">{unit}</text>
        <text x={W - R} y={H - 4} textAnchor="end" fontSize="7.5" fill="var(--text-tertiary)">{t('mavlink-config:responsePlot.stickPct')}</text>
      </svg>

      <div className="border-t border-subtle px-3 py-2">
        {stick !== null && liveRate !== null ? (
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums" style={{ color: accent }}>
              {Math.round(liveRate)}
            </span>
            <span className="text-[11px] text-content-secondary">
              {t('mavlink-config:rateResponsePlot.liveRate', { unit, stick: Math.round(stick) })}
              {Math.abs(stick) < 2 && t('mavlink-config:responsePlot.moveHint')}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-content-secondary">
            {t('mavlink-config:rateResponsePlot.connectHint')}
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-content-tertiary">
          {turn !== null
            ? t('mavlink-config:rateResponsePlot.fullTurn', { turn: turn.toFixed(1), half: Math.round(half), unit })
            : t('mavlink-config:rateResponsePlot.halfStick', { half: Math.round(half), unit })}
        </div>
      </div>
    </div>
  );
}
