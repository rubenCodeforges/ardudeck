/**
 * EscTelemetryCard — live per-motor monitoring.
 *
 * Always shows the FC's PWM output to each motor (from SERVO_OUTPUT_RAW).
 * When ESC telemetry is also available (DShot + BLHeli_32 with telemetry
 * wire connected), additionally shows RPM, temp, voltage, and current.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Thermometer } from 'lucide-react';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { testOrderToLabel } from './motor-layout-utils';
import type { FrameLayout } from '../../../../shared/motor-test-types';

interface EscTelemetryCardProps {
  layout: FrameLayout;
}

function tempColor(tempC: number): string {
  if (tempC === 0) return 'text-content-secondary';
  if (tempC < 70) return 'text-emerald-400';
  if (tempC < 90) return 'text-amber-400';
  return 'text-red-400';
}

/**
 * Map a PWM µs value (1000-2000) to a 0-100% color band.
 * Idle ≈ 1000 = gray, mid = blue, high = yellow→red.
 */
function pwmColor(pwm: number): string {
  if (pwm < 1050) return 'text-content-secondary';
  if (pwm < 1300) return 'text-blue-400';
  if (pwm < 1600) return 'text-cyan-400';
  if (pwm < 1800) return 'text-amber-400';
  return 'text-red-400';
}

export const EscTelemetryCard: React.FC<EscTelemetryCardProps> = ({ layout }) => {
  const escTelemetry = useTelemetryStore((s) => s.escTelemetry);
  const { t } = useTranslation();
  const lastEscTelemetry = useTelemetryStore((s) => s.lastEscTelemetry);
  const servoOutput = useTelemetryStore((s) => s.servoOutput);
  const lastServoOutput = useTelemetryStore((s) => s.lastServoOutput);

  const escStale = lastEscTelemetry === 0 || Date.now() - lastEscTelemetry > 3000;
  const hasAnyEsc = escTelemetry?.motors.some((m) => m !== undefined) ?? false;
  const hasServoOutput = lastServoOutput > 0 && Date.now() - lastServoOutput < 3000;

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border-cyan-500/20 flex items-center justify-center">
          <Thermometer className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <div className="text-sm font-semibold text-content">{t('mavlink-config:escTelemetryCard.title')}</div>
          <div className="text-[11px] text-content-secondary">
            {hasAnyEsc ? t('mavlink-config:escTelemetryCard.subtitleEsc') : t('mavlink-config:escTelemetryCard.subtitlePwm')}
          </div>
        </div>
      </div>

      {escStale && !hasAnyEsc && (
        <div className="text-[11px] text-content-secondary italic mb-3 leading-snug">
          {t('mavlink-config:escTelemetryCard.notAvailable')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {layout.motors
          .slice()
          .sort((a, b) => a.Number - b.Number)
          .map((m) => {
            const data = escTelemetry?.motors[m.Number - 1];
            const pwm = servoOutput?.outputs[m.Number - 1];
            const hasPwm = pwm !== undefined && pwm > 0;

            return (
              <div
                key={m.Number}
                className="bg-surface-raised rounded-lg p-3 border border-subtle"
              >
                <div className="flex items-baseline justify-between mb-2">
                  <div className="text-xs font-mono font-semibold text-content">
                    M{m.Number}
                    <span className="text-content-secondary ml-1">{testOrderToLabel(m.TestOrder)}</span>
                  </div>
                  <div className="text-[9px] uppercase tracking-wider text-content-tertiary">
                    {m.Rotation}
                  </div>
                </div>

                <div className="space-y-1">
                  {/* PWM is always shown when available */}
                  <div className="flex items-baseline justify-between">
                    <span className="text-[10px] text-content-secondary">PWM</span>
                    <span className={`text-sm font-mono font-semibold ${hasPwm ? pwmColor(pwm) : 'text-content-tertiary'}`}>
                      {hasPwm ? `${pwm}` : '-'}
                      {hasPwm && <span className="text-[9px] text-content-tertiary ml-0.5">µs</span>}
                    </span>
                  </div>

                  {data ? (
                    <>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-content-secondary">RPM</span>
                        <span className="text-sm font-mono font-semibold text-amber-400">
                          {data.rpm}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-content-secondary">{t('mavlink-config:escTelemetryCard.temp')}</span>
                        <span className={`text-sm font-mono font-semibold ${tempColor(data.tempC)}`}>
                          {data.tempC}°C
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[10px] text-content-secondary">V / A</span>
                        <span className="text-xs font-mono text-content">
                          {data.voltageV.toFixed(1)} / {data.currentA.toFixed(1)}
                        </span>
                      </div>
                    </>
                  ) : !hasPwm && !hasServoOutput ? (
                    <div className="text-[10px] text-content-tertiary italic text-center py-2">
                      {t('mavlink-config:escTelemetryCard.noData')}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
