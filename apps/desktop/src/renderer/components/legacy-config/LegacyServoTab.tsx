/**
 * Legacy Servo Tab
 *
 * Servo endpoint configuration for legacy F3 boards.
 * Modern UI with visual sliders and range indicators.
 */

import { useTranslation } from 'react-i18next';
import { useLegacyConfigStore, type LegacyServoConfig } from '../../stores/legacy-config-store';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { CompactSlider } from '../ui/DraggableSlider';
import { Settings } from 'lucide-react';

export default function LegacyServoTab() {
  const { t } = useTranslation();
  const { servoConfigs, updateServoConfig } = useLegacyConfigStore();

  const handleChange = (config: LegacyServoConfig) => {
    updateServoConfig(config.index, config);
    // Send CLI command: servo <index> <min> <max> <mid> <rate>
    window.electronAPI.cliSendCommand(
      `servo ${config.index} ${config.min} ${config.max} ${config.mid} ${config.rate}`
    );
  };

  if (servoConfigs.length === 0) {
    return (
      <div className="text-center py-12 text-content-secondary">
        <Settings className="w-10 h-10 text-content-secondary mb-3 mx-auto" />
        <p>{t('legacy-config:legacyServoTab.noConfigs')}</p>
        <p className="text-sm mt-1">{t('legacy-config:legacyServoTab.noConfigsHint')}</p>
      </div>
    );
  }

  const servoColors = ['#EF4444', '#22C55E', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#10B981'];

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <div className="flex items-start gap-3">
          <Settings className="w-6 h-6 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm text-amber-300 font-medium">{t('legacy-config:legacyServoTab.title')}</p>
            <p className="text-xs text-amber-300/70 mt-1">
              {t('legacy-config:legacyServoTab.description')}
            </p>
          </div>
        </div>
      </div>

      {/* Servo Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {servoConfigs.map((servo, idx) => {
          const color = servoColors[idx % servoColors.length]!;
          const travelRange = servo.max - servo.min;
          const isReversed = servo.rate < 0;

          return (
            <div key={servo.index} className="bg-surface-input rounded-xl border border-subtle overflow-hidden">
              {/* Header */}
              <div className="px-5 py-3 border-b border-subtle flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-content font-bold"
                    style={{ backgroundColor: color }}
                  >
                    S{servo.index}
                  </div>
                  <div>
                    <h3 className="font-semibold text-content">{t('legacy-config:legacyMixerTab.servoN', { index: servo.index })}</h3>
                    <p className="text-xs text-content-secondary">{t('legacy-config:legacyServoTab.travel', { range: travelRange })}</p>
                  </div>
                </div>
                {isReversed && (
                  <span className="px-2 py-1 rounded-full bg-orange-500/20 text-orange-400 text-xs font-medium">
                    {t('common:reversed')}
                  </span>
                )}
              </div>

              {/* Controls */}
              <div className="p-5 space-y-4">
                {/* Visual Range */}
                <div className="relative h-8 bg-surface-inset rounded-lg overflow-hidden">
                  {/* Range bar */}
                  <div
                    className="absolute h-full transition-all opacity-40"
                    style={{
                      left: `${((servo.min - 750) / 1500) * 100}%`,
                      width: `${((servo.max - servo.min) / 1500) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                  {/* Center marker */}
                  <div
                    className="absolute w-1 h-full transition-all"
                    style={{
                      left: `${((servo.mid - 750) / 1500) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                  {/* PWM center line */}
                  <div className="absolute left-1/2 top-0 bottom-0 w-px bg-surface-raised" />
                </div>
                <div className="flex justify-between text-xs text-content-secondary">
                  <span>750μs</span>
                  <span>1500μs</span>
                  <span>2250μs</span>
                </div>

                {/* Sliders */}
                <div className="grid grid-cols-2 gap-4">
                  <CompactSlider
                    label={t('legacy-config:legacyServoTab.minimum')}
                    value={servo.min}
                    onChange={(v) => handleChange({ ...servo, min: v })}
                    min={750}
                    max={2250}
                    step={10}
                    color={color}
                  />
                  <CompactSlider
                    label={t('legacy-config:legacyServoTab.maximum')}
                    value={servo.max}
                    onChange={(v) => handleChange({ ...servo, max: v })}
                    min={750}
                    max={2250}
                    step={10}
                    color={color}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <CompactSlider
                    label={t('common:center')}
                    value={servo.mid}
                    onChange={(v) => handleChange({ ...servo, mid: v })}
                    min={750}
                    max={2250}
                    step={10}
                    color={color}
                  />
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-content-secondary">{t('common:rate')}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleChange({ ...servo, rate: -servo.rate })}
                          className="px-2 py-0.5 rounded bg-surface-raised hover:bg-surface-raised text-content-secondary text-xs"
                        >
                          {t('common:reverse')}
                        </button>
                        <DraftNumberInput
                          min={-125}
                          max={125}
                          integer
                          value={servo.rate}
                          onCommit={(v) => handleChange({ ...servo, rate: v })}
                          className="w-16 px-2 py-0.5 text-center text-sm bg-surface-input border border rounded text-content"
                        />
                      </div>
                    </div>
                    <div className="relative h-2 bg-surface-inset rounded-full overflow-hidden">
                      <div
                        className="absolute top-0 h-full rounded-full transition-all"
                        style={{
                          left: servo.rate >= 0 ? '50%' : `${50 + (servo.rate / 125) * 50}%`,
                          width: `${(Math.abs(servo.rate) / 125) * 50}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Quick presets */}
                <div className="flex gap-2 pt-2 border-t border-subtle">
                  <button
                    onClick={() => handleChange({ ...servo, min: 1000, max: 2000, mid: 1500, rate: 100 })}
                    className="flex-1 py-1.5 text-xs text-content-secondary hover:text-content hover:bg-surface-raised rounded transition-colors"
                  >
                    {t('legacy-config:legacyServoTab.resetDefault')}
                  </button>
                  <button
                    onClick={() => handleChange({ ...servo, min: 1100, max: 1900, mid: 1500, rate: 100 })}
                    className="flex-1 py-1.5 text-xs text-content-secondary hover:text-content hover:bg-surface-raised rounded transition-colors"
                  >
                    {t('legacy-config:legacyServoTab.safeRange')}
                  </button>
                  <button
                    onClick={() => handleChange({ ...servo, min: 750, max: 2250, mid: 1500, rate: 100 })}
                    className="flex-1 py-1.5 text-xs text-content-secondary hover:text-content hover:bg-surface-raised rounded transition-colors"
                  >
                    {t('legacy-config:legacyServoTab.fullRange')}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
