/**
 * Stick in, motors out, drawn.
 *
 * The live dot is the point: move the stick and watch where the output lands
 * on the curve. Nobody has to know what expo, slew and top throttle mean to
 * see that half stick gives a quarter power, or that a stab at full throttle
 * only reaches a third of the way before it is released.
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import {
  responseCurve,
  throttleOutput,
  fullTravelSeconds,
  blipPeak,
  stickPercent,
} from './throttle-response';

interface ThrottleResponsePlotProps {
  expo: number;
  thrMax: number;
  slew: number;
}

const W = 300;
const H = 190;
const L = 34;
const R = 12;
const T = 14;
const B = 26;

const ACCENT = '#F59E0B';

export function ThrottleResponsePlot({ expo, thrMax, slew }: ThrottleResponsePlotProps): JSX.Element {
  const { t } = useTranslation();
  const { parameters } = useParameterStore();
  const rc = useTelemetryStore((s) => s.rcChannels);

  // The throttle stick is whichever channel RCMAP points at, read through that
  // channel's own calibration so a non-centred trim does not skew the dot.
  const stick = useMemo(() => {
    const ch = (parameters.get('RCMAP_THROTTLE')?.value as number) ?? 3;
    const pwm = rc.channels[ch - 1];
    return stickPercent(
      pwm,
      (parameters.get(`RC${ch}_MIN`)?.value as number) ?? 1000,
      (parameters.get(`RC${ch}_MAX`)?.value as number) ?? 2000,
      (parameters.get(`RC${ch}_TRIM`)?.value as number) ?? 1500,
    );
  }, [parameters, rc.channels]);

  const points = useMemo(() => responseCurve(expo, thrMax), [expo, thrMax]);
  const x = (v: number) => L + ((v + 100) / 200) * (W - L - R);
  const y = (v: number) => H - B - ((v + 100) / 200) * (H - T - B);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L ${x(100).toFixed(1)} ${y(0).toFixed(1)} L ${x(-100).toFixed(1)} ${y(0).toFixed(1)} Z`;

  const travel = fullTravelSeconds(slew);
  const blip = blipPeak(slew, 1, thrMax);
  const liveOut = stick === null ? null : throttleOutput(stick, expo, thrMax);

  return (
    <div className="rounded-xl border border-subtle bg-surface-raised overflow-hidden">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <defs>
          <linearGradient id="thr-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.28" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[-100, -50, 0, 50, 100].map((v) => (
          <g key={`h${v}`}>
            <line x1={L} y1={y(v)} x2={W - R} y2={y(v)}
              stroke="var(--border-subtle)" strokeWidth={v === 0 ? 1.2 : 0.6} />
            <text x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="7.5" fill="var(--text-tertiary)">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}
        {[-100, -50, 0, 50, 100].map((v) => (
          <g key={`v${v}`}>
            <line x1={x(v)} y1={T} x2={x(v)} y2={H - B}
              stroke="var(--border-subtle)" strokeWidth={v === 0 ? 1.2 : 0.6} />
            <text x={x(v)} y={H - B + 11} textAnchor="middle" fontSize="7.5" fill="var(--text-tertiary)">
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}

        {/* Straight passthrough, for comparison. */}
        <line x1={x(-100)} y1={y(-100)} x2={x(100)} y2={y(100)}
          stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />

        {/* The power ceiling, when there is one. */}
        {thrMax < 100 && (
          <g>
            <line x1={L} y1={y(thrMax)} x2={W - R} y2={y(thrMax)}
              stroke={ACCENT} strokeWidth="1" strokeDasharray="4 3" opacity="0.7" />
            <text x={W - R - 2} y={y(thrMax) - 3} textAnchor="end" fontSize="7.5" fill={ACCENT} opacity="0.9">
              limit {Math.round(thrMax)}%
            </text>
          </g>
        )}

        <path d={area} fill="url(#thr-fill)" />
        <path d={path} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {stick !== null && liveOut !== null && (
          <g>
            <line x1={x(stick)} y1={y(0)} x2={x(stick)} y2={y(liveOut)}
              stroke={ACCENT} strokeWidth="1" opacity="0.5" />
            <circle cx={x(stick)} cy={y(liveOut)} r="8" fill={ACCENT} opacity="0.18" />
            <circle cx={x(stick)} cy={y(liveOut)} r="4" fill={ACCENT}
              stroke="var(--bg-surface-solid)" strokeWidth="1.5" />
          </g>
        )}

        {/* Say it is live: the dot is worth nothing if nobody knows it moves. */}
        {stick !== null && (
          <g>
            <circle cx={W - R - 34} cy={T - 6} r="2.5" fill="#34D399">
              <animate attributeName="opacity" values="1;0.25;1" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <text x={W - R - 28} y={T - 3} fontSize="7.5" fill="#34D399" letterSpacing="0.5">{t('mavlink-config:responsePlot.live')}</text>
          </g>
        )}
        <text x={L} y={T - 4} fontSize="7.5" fill="var(--text-tertiary)">{t('mavlink-config:throttleResponsePlot.motorPct')}</text>
        <text x={W - R} y={H - 4} textAnchor="end" fontSize="7.5" fill="var(--text-tertiary)">{t('mavlink-config:responsePlot.stickPct')}</text>
      </svg>

      <div className="border-t border-subtle px-3 py-2">
        {stick !== null && liveOut !== null ? (
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums" style={{ color: ACCENT }}>
              {Math.round(liveOut)}%
            </span>
            <span className="text-[11px] text-content-secondary">
              {t('mavlink-config:throttleResponsePlot.liveOut', { stick: Math.round(stick) })}
              {Math.abs(stick) < 2 && t('mavlink-config:responsePlot.moveHint')}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-content-secondary">
            {t('mavlink-config:throttleResponsePlot.connectHint')}
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-content-tertiary">
          {travel === null
            ? t('mavlink-config:throttleResponsePlot.noRamp')
            : t('mavlink-config:throttleResponsePlot.stab', { blip: Math.round(blip), travel: travel.toFixed(1) })}
        </div>
      </div>
    </div>
  );
}
