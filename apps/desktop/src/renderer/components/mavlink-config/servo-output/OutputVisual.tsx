import { useMemo } from 'react';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import type { OutputShape } from './output-shape';

interface OutputVisualProps {
  /** Output channel, 1-based. */
  channel: number;
  shape: OutputShape;
  /** Label from parameter metadata, e.g. "GroundSteering". */
  functionName?: string;
  min: number;
  trim: number;
  max: number;
  /** Full scale either side of trim for a bidirectional arc, in µs. */
  maxUs?: number;
  accent?: string;
}

const W = 300;
const H = 176;
const CX = 150;
const CY = 146;
const R_OUT = 116;
const R_IN = 66;
const ACCENT = '#10B981';
const STALE_MS = 2000;

function pointAt(us: number, maxUs: number, radius: number) {
  const rad = ((us / maxUs) * 90 - 90) * (Math.PI / 180);
  return { x: CX + Math.cos(rad) * radius, y: CY + Math.sin(rad) * radius };
}

function wedge(fromUs: number, toUs: number, maxUs: number): string {
  const a = pointAt(fromUs, maxUs, R_OUT);
  const b = pointAt(toUs, maxUs, R_OUT);
  const c = pointAt(toUs, maxUs, R_IN);
  const d = pointAt(fromUs, maxUs, R_IN);
  return [
    `M ${a.x.toFixed(1)} ${a.y.toFixed(1)}`,
    `A ${R_OUT} ${R_OUT} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
    `L ${c.x.toFixed(1)} ${c.y.toFixed(1)}`,
    `A ${R_IN} ${R_IN} 0 0 0 ${d.x.toFixed(1)} ${d.y.toFixed(1)}`,
    'Z',
  ].join(' ');
}

export function OutputVisual({
  channel,
  shape,
  functionName,
  min,
  trim,
  max,
  maxUs = 500,
  accent = ACCENT,
}: OutputVisualProps): JSX.Element {
  const servoOutput = useTelemetryStore((s) => s.servoOutput);

  const live = useMemo(() => {
    const pwm = servoOutput?.outputs[channel - 1];
    if (!pwm || pwm <= 0) return null;
    return { pwm, stale: Date.now() - (servoOutput?.timestamp ?? 0) > STALE_MS };
  }, [servoOutput, channel]);

  const label = functionName ?? `Servo ${channel}`;
  const footer = (text: string) => (
    <div className="border-t border-subtle px-3 py-1.5 text-[10px] text-content-tertiary">{text}</div>
  );

  if (shape === 'discrete') {
    const on = live !== null && live.pwm >= (min + max) / 2;
    return (
      <div className="rounded-xl border border-subtle bg-surface-raised overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-6">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: on ? accent : 'var(--text-tertiary)', opacity: live ? 1 : 0.35 }}
          />
          <div className="min-w-0">
            <div className="text-sm text-content">{on ? 'On' : 'Off'}</div>
            <div className="text-[11px] text-content-tertiary">
              {label} switches between {min} and {max} µs
            </div>
          </div>
        </div>
        {footer(live === null ? `Servo ${channel}: waiting for output` : `Servo ${channel} at ${live.pwm} µs`)}
      </div>
    );
  }

  if (shape === 'bipolar') {
    const lowSpan = Math.max(1, trim - min);
    const highSpan = Math.max(1, max - trim);
    const frac = live === null ? null : (live.pwm - trim) / (live.pwm >= trim ? highSpan : lowSpan);
    const pct = frac === null ? null : Math.max(-100, Math.min(100, frac * 100));
    return (
      <div className="rounded-xl border border-subtle bg-surface-raised overflow-hidden">
        <div className="px-4 py-5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-lg font-semibold text-content">
              {pct === null ? '--' : `${pct > 0 ? '+' : ''}${Math.round(pct)}%`}
            </span>
            <span className="text-[10px] text-content-tertiary">{min} · {trim} · {max} µs</span>
          </div>
          <div className="relative h-4">
            <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-content-tertiary/25 border border-subtle overflow-hidden">
              <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-content-tertiary/70" />
              {pct !== null && Math.abs(pct) > 0.5 && (
                <div
                  className="absolute top-0 h-full"
                  style={{
                    left: pct >= 0 ? '50%' : `${50 + pct / 2}%`,
                    width: `${Math.abs(pct) / 2}%`,
                    background: accent,
                    opacity: live?.stale ? 0.4 : 1,
                  }}
                />
              )}
            </div>
            {pct !== null && (
              <div
                className="absolute top-0 h-4 w-[3px] rounded-full"
                style={{
                  left: `calc(${50 + pct / 2}% - 1.5px)`,
                  background: live?.stale ? 'var(--text-tertiary)' : accent,
                }}
              />
            )}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-content-tertiary">
            <span>reverse</span>
            <span>stop</span>
            <span>forward</span>
          </div>
        </div>
        {footer(live === null ? `Servo ${channel}: waiting for output` : `Servo ${channel} at ${live.pwm} µs${live.stale ? ' (stale)' : ''}`)}
      </div>
    );
  }

  if (shape === 'unidirectional' || shape === 'motor') {
    const span = Math.max(1, max - min);
    const pct = live === null ? null : Math.max(0, Math.min(100, ((live.pwm - min) / span) * 100));
    return (
      <div className="rounded-xl border border-subtle bg-surface-raised overflow-hidden">
        <div className="px-4 py-5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-lg font-semibold text-content">
              {pct === null ? '--' : `${Math.round(pct)}%`}
            </span>
            <span className="text-[10px] text-content-tertiary">{min}–{max} µs</span>
          </div>
          <div className="relative h-4">
            <div className="absolute inset-x-0 top-1/2 h-2.5 -translate-y-1/2 rounded-full bg-content-tertiary/25 border border-subtle overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full transition-[width] duration-100"
                style={{ width: `${pct ?? 0}%`, background: accent, opacity: live?.stale ? 0.4 : 1 }}
              />
            </div>
            {pct !== null && (
              <div
                className="absolute top-0 h-4 w-[3px] rounded-full"
                style={{
                  left: `calc(${pct}% - 1.5px)`,
                  background: live?.stale ? 'var(--text-tertiary)' : accent,
                }}
              />
            )}
          </div>
        </div>
        {footer(live === null ? `Servo ${channel}: waiting for output` : `Servo ${channel} at ${live.pwm} µs${live.stale ? ' (stale)' : ''}`)}
      </div>
    );
  }

  // Drawn from the real endpoints, so uneven travel looks uneven.
  const lowUs = Math.max(-maxUs, Math.min(0, min - trim));
  const highUs = Math.min(maxUs, Math.max(0, max - trim));
  const even = Math.abs(-lowUs - highUs) <= 1;
  const liveUs = live === null ? null : Math.max(-maxUs, Math.min(maxUs, live.pwm - trim));
  const needle = liveUs === null ? null : pointAt(liveUs, maxUs, R_OUT + 6);
  const needleIn = liveUs === null ? null : pointAt(liveUs, maxUs, R_IN - 6);
  const beyond = liveUs !== null && (liveUs < lowUs - 1 || liveUs > highUs + 1);

  return (
    <div className="rounded-xl border border-subtle bg-surface-raised overflow-hidden">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        <path d={wedge(-maxUs, maxUs, maxUs)} fill="currentColor" className="text-content-tertiary/10" />
        <path d={wedge(lowUs, highUs, maxUs)} fill={accent} fillOpacity="0.22" />

        {[lowUs, highUs].map((v, i) => {
          const a = pointAt(v, maxUs, R_IN);
          const b = pointAt(v, maxUs, R_OUT);
          const lbl = pointAt(v, maxUs, R_OUT + 14);
          return (
            <g key={i}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={accent} strokeWidth="2" />
              <text
                x={lbl.x}
                y={lbl.y}
                textAnchor={v < 0 ? 'start' : 'end'}
                dominantBaseline="middle"
                className="fill-content-tertiary"
                style={{ fontSize: 9 }}
              >
                {Math.round(trim + v)}
              </text>
            </g>
          );
        })}

        <line
          x1={pointAt(0, maxUs, R_IN).x}
          y1={pointAt(0, maxUs, R_IN).y}
          x2={pointAt(0, maxUs, R_OUT).x}
          y2={pointAt(0, maxUs, R_OUT).y}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="3 3"
          className="text-content-tertiary/60"
        />

        {needle && needleIn && (
          <line
            x1={needleIn.x}
            y1={needleIn.y}
            x2={needle.x}
            y2={needle.y}
            stroke={beyond ? '#F59E0B' : live?.stale ? 'currentColor' : accent}
            className={live?.stale ? 'text-content-tertiary' : undefined}
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        )}

        <text x={CX} y={CY - 26} textAnchor="middle" className="fill-content" style={{ fontSize: 19, fontWeight: 600 }}>
          {even
            ? `${Math.round((highUs / maxUs) * 100)}%`
            : `${Math.round((-lowUs / maxUs) * 100)}/${Math.round((highUs / maxUs) * 100)}%`}
        </text>
        <text x={CX} y={CY - 12} textAnchor="middle" className="fill-content-tertiary" style={{ fontSize: 9 }}>
          {even ? `±${Math.round(highUs)}` : `${Math.round(lowUs)}/+${Math.round(highUs)}`} µs from {Math.round(trim)}
        </text>
      </svg>

      {footer(
        live === null
          ? `Servo ${channel}: waiting for output`
          : beyond
            ? `Servo ${channel} is outside the limit at ${live.pwm} µs`
            : `Servo ${channel} at ${live.pwm} µs${live.stale ? ' (stale)' : ''}`
      )}
    </div>
  );
}
