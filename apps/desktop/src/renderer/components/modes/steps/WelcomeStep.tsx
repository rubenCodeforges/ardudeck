/**
 * WelcomeStep
 *
 * First step of the modes wizard.
 * Shows preset cards for quick setup or manual configuration option.
 */

import React from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { PRESETS, PRESET_ICONS, MODE_INFO, type ModePreset } from '../presets/mode-presets';
import { useModesWizardStore } from '../../../stores/modes-wizard-store';
import { Radio, Settings, Lightbulb, ChevronRight, HelpCircle } from 'lucide-react';

interface PresetCardProps {
  preset: ModePreset;
  onSelect: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, onSelect }) => {
  const { t } = useTranslation();
  const IconComponent = PRESET_ICONS[preset.icon] || HelpCircle;

  return (
    <button
      onClick={onSelect}
      className={`w-full p-5 rounded-xl border bg-gradient-to-br ${preset.gradient} hover:scale-[1.02] transition-transform text-left`}
    >
      <div className="flex items-start gap-4">
        {/* Large icon */}
        <div className="w-12 h-12 rounded-xl bg-surface-overlay-subtle flex items-center justify-center">
          <IconComponent className="w-6 h-6 text-content" />
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-content">{t(preset.nameKey)}</h3>
          <p className="text-sm text-content-secondary mt-1">{t(preset.descriptionKey)}</p>

          {/* Mode badges */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {preset.wizardModes.slice(0, 4).map((boxId, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 text-xs bg-surface-overlay-subtle rounded-full text-content"
              >
                {MODE_INFO[boxId]?.name ?? t('modes:modeFallback', { id: boxId })}
              </span>
            ))}
          </div>
        </div>

        {/* Arrow */}
        <ChevronRight className="w-5 h-5 text-content-secondary mt-1" />
      </div>

      {/* Tip */}
      <div className="mt-4 pt-3 border-t border-subtle">
        <p className="text-xs text-content-secondary italic flex items-center gap-1.5">
          <Lightbulb className="w-3.5 h-3.5" />
          {t(preset.tipKey)}
        </p>
      </div>
    </button>
  );
};

export const WelcomeStep: React.FC = () => {
  const { t } = useTranslation();
  const { selectPreset, startCustomSetup, nextStep } = useModesWizardStore();

  const handleSelectPreset = (presetId: string) => {
    selectPreset(presetId);
    nextStep();
  };

  const handleManualSetup = () => {
    startCustomSetup();
    nextStep();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-purple-500/20 mb-4">
          <Radio className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-xl font-semibold text-content">{t('modes:welcomeStep.title')}</h2>
        <p className="text-sm text-content-secondary mt-2 max-w-md mx-auto">
          {t('modes:welcomeStep.subtitle')}
        </p>
      </div>

      {/* Preset cards */}
      <div className="grid gap-4">
        {Object.values(PRESETS).map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            onSelect={() => handleSelectPreset(preset.id)}
          />
        ))}
      </div>

      {/* Manual setup option */}
      <div className="pt-4 border-t border">
        <button
          onClick={handleManualSetup}
          className="w-full p-4 rounded-xl border border bg-surface hover:bg-surface-raised transition-colors text-left flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-surface-raised flex items-center justify-center">
              <Settings className="w-5 h-5 text-content-secondary" />
            </div>
            <div>
              <h3 className="font-medium text-content">{t('modes:welcomeStep.manualSetup')}</h3>
              <p className="text-xs text-content-secondary">{t('modes:welcomeStep.manualSetupHint')}</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-content-secondary" />
        </button>
      </div>

      {/* Info note */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-200 text-sm">{t('modes:welcomeStep.newToFpv')}</h4>
            <p className="text-xs text-amber-100/70 mt-1">
              <Trans i18nKey="modes:welcomeStep.newToFpvHint" components={{ b: <strong /> }} />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeStep;
