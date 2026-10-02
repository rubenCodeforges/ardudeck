/**
 * ModeConfigStep
 *
 * Configure a single mode (part of the wizard flow).
 * Shows the mode info, AUX channel picker, and range slider.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { useModesWizardStore } from '../../../stores/modes-wizard-store';
import { MODE_INFO, AUX_CHANNELS } from '../presets/mode-presets';
import AuxChannelPicker from '../shared/AuxChannelPicker';
import RangeSlider from '../shared/RangeSlider';
import RcChannelBar from '../shared/RcChannelBar';
import { CheckCircle2, Lightbulb, HelpCircle } from 'lucide-react';

export const ModeConfigStep: React.FC = () => {
  const { t } = useTranslation();
  const {
    selectedPreset,
    currentModeIndex,
    pendingModes,
    rcChannels,
    updateModeConfig,
    nextStep,
    prevStep,
  } = useModesWizardStore();

  // Get current mode being configured
  const currentMode = pendingModes[currentModeIndex];
  const modeInfo = currentMode ? MODE_INFO[currentMode.boxId] : null;

  // Get progress info for preset wizard
  const totalModes = selectedPreset?.wizardModes.length || 1;
  const isLastMode = currentModeIndex >= totalModes - 1;

  if (!currentMode || !modeInfo) {
    return (
      <div className="text-center py-8">
        <p className="text-content-secondary">{t('modes:modeConfigStep.noMode')}</p>
      </div>
    );
  }

  // Get RC value for current mode's AUX channel
  const rcValue = rcChannels[currentMode.auxChannel + 4] || 1500;
  const isActive = rcValue >= currentMode.rangeStart && rcValue <= currentMode.rangeEnd;

  const handleChannelChange = (auxChannel: number) => {
    updateModeConfig(currentModeIndex, { auxChannel });
  };

  const handleRangeChange = (rangeStart: number, rangeEnd: number) => {
    updateModeConfig(currentModeIndex, { rangeStart, rangeEnd });
  };

  return (
    <div className="space-y-6">
      {/* Progress indicator (for preset wizard) */}
      {selectedPreset && (
        <div className="flex items-center justify-center gap-2">
          {selectedPreset.wizardModes.map((_, idx) => (
            <div
              key={idx}
              className={`w-8 h-1.5 rounded-full transition-colors ${
                idx < currentModeIndex
                  ? 'bg-green-500'
                  : idx === currentModeIndex
                  ? 'bg-blue-500'
                  : 'bg-surface-raised'
              }`}
            />
          ))}
        </div>
      )}

      {/* Mode header */}
      <div className="text-center">
        {(() => {
          const IconComponent = modeInfo.icon || HelpCircle;
          return (
            <div
              className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${modeInfo.color}/20 mb-4`}
            >
              <IconComponent className={`w-8 h-8 ${modeInfo.color.replace('bg-', 'text-')}`} />
            </div>
          );
        })()}
        <h2 className="text-xl font-semibold text-content">{modeInfo.name}</h2>
        <p className="text-sm text-content-secondary mt-1">{t(modeInfo.descriptionKey)}</p>
        {modeInfo.essential && (
          <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">
            {t('modes:modeConfigStep.essentialMode')}
          </span>
        )}
      </div>

      {/* Beginner explanation */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <p className="text-sm text-blue-200">{t(modeInfo.beginnerKey)}</p>
      </div>

      {/* AUX Channel selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-content">
          {t('modes:modeConfigStep.whichSwitch')}
        </label>
        <AuxChannelPicker
          selected={currentMode.auxChannel}
          onChange={handleChannelChange}
          rcChannels={rcChannels}
        />
      </div>

      {/* Range slider */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-content">
          {t('modes:modeConfigStep.whenActivate')}
        </label>
        <div className="p-4 bg-surface rounded-xl border border">
          <RangeSlider
            rangeStart={currentMode.rangeStart}
            rangeEnd={currentMode.rangeEnd}
            rcValue={rcValue}
            onChange={handleRangeChange}
          />
        </div>
      </div>

      {/* Live preview */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-content">
          {t('modes:modeConfigStep.testIt')}
        </label>
        <div
          className={`p-4 rounded-xl border transition-all ${
            isActive
              ? 'bg-green-500/10 border-green-500/30 shadow-lg shadow-green-500/10'
              : 'bg-surface border'
          }`}
        >
          <RcChannelBar
            rangeStart={currentMode.rangeStart}
            rangeEnd={currentMode.rangeEnd}
            rcValue={rcValue}
            color={modeInfo.color}
          />
        </div>
      </div>

      {/* Test result */}
      {isActive ? (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl animate-pulse">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
            <div>
              <h4 className="font-medium text-green-300">{t('modes:modeConfigStep.isActive', { name: modeInfo.name })}</h4>
              <p className="text-xs text-green-200/70">
                {t('modes:modeConfigStep.correctPosition')}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-surface border border-subtle rounded-xl">
          <div className="flex items-center gap-3">
            <Lightbulb className="w-6 h-6 text-amber-400 shrink-0" />
            <div>
              <h4 className="font-medium text-content">{t('modes:modeConfigStep.tryNow')}</h4>
              <p className="text-xs text-content-secondary">
                {t('modes:modeConfigStep.moveSwitch', {
                  channel: AUX_CHANNELS[currentMode.auxChannel]?.name || t('modes:modeConfigStep.switch'),
                  position: currentMode.rangeStart >= 1700 ? t('modes:rangeSlider.high') : currentMode.rangeEnd <= 1300 ? t('modes:rangeSlider.low') : t('modes:rangeSlider.mid'),
                  name: modeInfo.name,
                })}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={prevStep}
          className="px-4 py-2.5 bg-surface-raised hover:bg-surface-raised text-content rounded-lg transition-colors"
        >
          {t('common:back')}
        </button>
        <button
          onClick={nextStep}
          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
        >
          {isLastMode ? t('modes:modeConfigStep.reviewConfiguration') : t('modes:modeConfigStep.nextMode')}
        </button>
      </div>
    </div>
  );
};

export default ModeConfigStep;
