/**
 * Steering stick to steering output, with the live stick on it.
 *
 * ArduPilot shapes manual steering with the same input_expo it uses for acro
 * sticks, so this is the throttle chart's sibling: one curve, one dot, no
 * parameter names needed to see what the wheel will do.
 */

import { useMemo } from 'react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { expoStick } from './rate-response';
import { stickPercent } from './throttle-response';

interface SteeringResponsePlotProps {
  /** MANUAL_STR_EXPO. ArduPilot declares -0.5 to 0.95, but 0.95 disables expo. */
  expo: number;
}

const W = 300;
const H = 190;
const L = 34;
const R = 12;
const T = 14;
const B = 26;
const ACCENT = '#10B981';

export function SteeringResponsePlot({ expo }: SteeringResponsePlotProps): JSX.Element {
  const { parameters } = useParameterStore();
  const rc = useTelemetryStore((s) => s.rcChannels);

  const stick = useMemo(() => {
    const ch = (parameters.get('RCMAP_ROLL')?.value as number) ?? 1;
    return stickPercent(
      rc.channels[ch - 1],
      (parameters.get(`RC${ch}_MIN`)?.value as number) ?? 1000,
      (parameters.get(`RC${ch}_MAX`)?.value as number) ?? 2000,
      (parameters.get(`RC${ch}_TRIM`)?.value as number) ?? 1500,
    );
  }, [parameters, rc.channels]);

  const points = useMemo(() => {
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i <= 40; i++) {
      const x = -100 + (200 * i) / 40;
      out.push({ x, y: expoStick(x, expo) });
    }
    return out;
  }, [expo]);

  const x = (v: number) => L + ((v + 100) / 200) * (W - L - R);
  const y = (v: number) => H - B - ((v + 100) / 200) * (H - T - B);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)}`).join(' ');

  const shaped = (v: number) => expoStick(v, expo);
  const liveOut = stick === null ? null : shaped(stick);
  const atHalf = shaped(50);

  return (
    <div className="rounded-xl border border-subtle bg-surface-raised overflow-hidden">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <defs>
          <linearGradient id="str-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ACCENT} stopOpacity="0.26" />
            <stop offset="1" stopColor={ACCENT} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[-100, -50, 0, 50, 100].map((v) => (
          <g key={`h${v}`}>
            <line x1={L} y1={y(v)} x2={W - R} y2={y(v)}
              stroke="var(--border-subtle)" strokeWidth={v === 0 ? 1.2 : 0.6} />
            <text x={L - 5} y={y(v) + 3} textAnchor="end" fontSize="7.5" fill="var(--text-tertiary)">{v}</text>
          </g>
        ))}
        {[-100, -50, 0, 50, 100].map((v) => (
          <line key={`v${v}`} x1={x(v)} y1={T} x2={x(v)} y2={H - B}
            stroke="var(--border-subtle)" strokeWidth={v === 0 ? 1.2 : 0.6} />
        ))}

        <line x1={x(-100)} y1={y(-100)} x2={x(100)} y2={y(100)}
          stroke="var(--text-tertiary)" strokeWidth="1" strokeDasharray="3 3" opacity="0.45" />

        <path d={`${path} L ${x(100).toFixed(1)} ${y(0).toFixed(1)} L ${x(-100).toFixed(1)} ${y(0).toFixed(1)} Z`}
          fill="url(#str-fill)" />
        <path d={path} fill="none" stroke={ACCENT} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

        {stick !== null && liveOut !== null && (
          <g>
            <line x1={x(stick)} y1={y(0)} x2={x(stick)} y2={y(liveOut)} stroke={ACCENT} strokeWidth="1" opacity="0.5" />
            <circle cx={x(stick)} cy={y(liveOut)} r="8" fill={ACCENT} opacity="0.18" />
            <circle cx={x(stick)} cy={y(liveOut)} r="4" fill={ACCENT}
              stroke="var(--bg-surface-solid)" strokeWidth="1.5" />
          </g>
        )}

        {stick !== null && (
          <g>
            <circle cx={W - R - 34} cy={T - 6} r="2.5" fill="#34D399">
              <animate attributeName="opacity" values="1;0.25;1" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <text x={W - R - 28} y={T - 3} fontSize="7.5" fill="#34D399" letterSpacing="0.5">LIVE</text>
          </g>
        )}
        <text x={L} y={T - 4} fontSize="7.5" fill="var(--text-tertiary)">steering %</text>
        <text x={W - R} y={H - 4} textAnchor="end" fontSize="7.5" fill="var(--text-tertiary)">stick %</text>
      </svg>

      <div className="border-t border-subtle px-3 py-2">
        {stick !== null && liveOut !== null ? (
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold tabular-nums" style={{ color: ACCENT }}>
              {Math.round(liveOut)}%
            </span>
            <span className="text-[11px] text-content-secondary">
              steering at {Math.round(stick)}% stick
              {Math.abs(stick) < 2 && ' · move it and the dot follows'}
            </span>
          </div>
        ) : (
          <div className="text-[11px] text-content-secondary">
            Connect the radio and move the steering stick: it appears on the curve.
          </div>
        )}
        <div className="mt-0.5 text-[11px] text-content-tertiary">
          Half stick gives {Math.round(atHalf)}% steering. Manual only.
        </div>
      </div>
    </div>
  );
}
