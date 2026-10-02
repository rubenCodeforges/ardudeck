/**
 * VibrationCard — live vibration monitor.
 *
 * Shows per-axis bars (X/Y/Z), 30-second sparklines, and clipping counters.
 * Color thresholds match ArduPilot's standard guidance:
 *   < 30 m/s²  → good (green)
 *   30 – 60    → marginal (yellow)
 *   > 60       → bad (red)
 */

import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity } from 'lucide-react';
import { useTelemetryStore } from '../../../stores/telemetry-store';

const GOOD_THRESHOLD = 30;
const BAD_THRESHOLD = 60;
const MAX_DISPLAY = 80;
const HISTORY_LENGTH = 150; // ~30s at 5Hz

function vibColor(value: number): string {
  if (value < GOOD_THRESHOLD) return 'rgb(16, 185, 129)';    // emerald
  if (value < BAD_THRESHOLD) return 'rgb(250, 204, 21)';     // amber
  return 'rgb(239, 68, 68)';                                  // red
}

function vibBarPercent(value: number): number {
  return Math.min(100, (value / MAX_DISPLAY) * 100);
}

interface SparklineProps {
  history: number[];
  width: number;
  height: number;
  color: string;
}

const Sparkline: React.FC<SparklineProps> = ({ history, width, height, color }) => {
  if (history.length < 2) {
    return <div style={{ width, height }} className="bg-surface-raised rounded" />;
  }

  const max = Math.max(MAX_DISPLAY, ...history);
  const step = width / (HISTORY_LENGTH - 1);
  const points = history
    .slice(-HISTORY_LENGTH)
    .map((v, i) => `${i * step},${height - (v / max) * height}`)
    .join(' ');

  return (
    <svg width={width} height={height} className="bg-surface-raised rounded">
      {/* Threshold line at GOOD_THRESHOLD */}
      <line
        x1={0}
        y1={height - (GOOD_THRESHOLD / max) * height}
        x2={width}
        y2={height - (GOOD_THRESHOLD / max) * height}
        stroke="var(--border-default)"
        strokeWidth={1}
        strokeDasharray="2 3"
      />
      <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} />
    </svg>
  );
};

export const VibrationCard: React.FC = () => {
  const { t } = useTranslation();
  const vibration = useTelemetryStore((s) => s.vibration);
  const lastVibration = useTelemetryStore((s) => s.lastVibration);

  // Rolling history buffers (kept in a ref so they don't cause re-renders)
  const historyRef = useRef<{ x: number[]; y: number[]; z: number[] }>({ x: [], y: [], z: [] });

  useEffect(() => {
    if (!vibration) return;
    const h = historyRef.current;
    h.x.push(vibration.x);
    h.y.push(vibration.y);
    h.z.push(vibration.z);
    if (h.x.length > HISTORY_LENGTH) h.x.shift();
    if (h.y.length > HISTORY_LENGTH) h.y.shift();
    if (h.z.length > HISTORY_LENGTH) h.z.shift();
  }, [vibration]);

  const stale = lastVibration === 0 || Date.now() - lastVibration > 3000;

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-orange-500/10 border-orange-500/20 flex items-center justify-center">
          <Activity className="w-5 h-5 text-orange-400" />
        </div>
        <div>
          <div className="text-sm font-semibold text-content">{t('common:vibration')}</div>
          <div className="text-[11px] text-content-secondary">{t('mavlink-config:vibrationCard.subtitle')}</div>
        </div>
      </div>

      {stale && (
        <div className="text-xs text-content-secondary italic mb-3">{t('mavlink-config:vibrationCard.noTelemetry')}</div>
      )}

      <div className="space-y-3">
        {(['x', 'y', 'z'] as const).map((axis) => {
          const value = vibration?.[axis] ?? 0;
          const color = vibColor(value);
          const pct = vibBarPercent(value);
          const history = historyRef.current[axis];

          return (
            <div key={axis}>
              <div className="flex items-baseline justify-between mb-1">
                <div className="text-[11px] uppercase tracking-wider text-content-secondary">{t('mavlink-config:vibrationCard.vibAxis', { axis: axis.toUpperCase() })}</div>
                <div className="text-sm font-mono font-semibold" style={{ color }}>
                  {value.toFixed(1)}
                </div>
              </div>
              <div className="h-2 bg-surface-inset rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
              <div className="mt-1">
                <Sparkline history={history} width={260} height={28} color={color} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 pt-4 border-t border-subtle grid grid-cols-3 gap-2 text-center">
        {(['clip0', 'clip1', 'clip2'] as const).map((key, i) => {
          const value = vibration?.[key] ?? 0;
          const bad = value > 0;
          return (
            <div key={key} className="bg-surface-raised rounded-lg py-2">
              <div className="text-[10px] uppercase tracking-wider text-content-secondary">{t('mavlink-config:vibrationCard.clip', { n: i + 1 })}</div>
              <div className={`text-sm font-mono font-semibold ${bad ? 'text-red-400' : 'text-content-secondary'}`}>
                {value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
