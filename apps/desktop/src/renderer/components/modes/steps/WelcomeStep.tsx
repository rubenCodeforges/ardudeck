/**
 * WelcomeStep
 *
 * First step of the modes wizard.
 * Shows preset cards for quick setup or manual configuration option.
 */

import React from 'react';
import { PRESETS, type ModePreset } from '../presets/mode-presets';
import { useModesWizardStore } from '../../../stores/modes-wizard-store';

interface PresetCardProps {
  preset: ModePreset;
  onSelect: () => void;
}

const PresetCard: React.FC<PresetCardProps> = ({ preset, onSelect }) => {
  return (
    <button
      onClick={onSelect}
      className={`w-full p-5 rounded-xl border bg-gradient-to-br ${preset.gradient} hover:scale-[1.02] transition-transform text-left`}
    >
      <div className="flex items-start gap-4">
        {/* Large icon */}
        <div className="text-4xl">{preset.icon}</div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-zinc-100">{preset.name}</h3>
          <p className="text-sm text-zinc-400 mt-1">{preset.description}</p>

          {/* Mode badges */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {preset.wizardModes.slice(0, 4).map((boxId, idx) => (
              <span
                key={idx}
                className="px-2 py-0.5 text-xs bg-white/10 rounded-full text-zinc-300"
              >
                {boxId === 0 ? 'ARM' : boxId === 1 ? 'ANGLE' : boxId === 2 ? 'HORIZON' : boxId === 7 ? 'GPS RESCUE' : boxId === 13 ? 'BEEPER' : boxId === 28 ? 'AIRMODE' : `Mode ${boxId}`}
              </span>
            ))}
          </div>
        </div>

        {/* Arrow */}
        <svg
          className="w-5 h-5 text-zinc-400 mt-1"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>

      {/* Tip */}
      <div className="mt-4 pt-3 border-t border-white/10">
        <p className="text-xs text-zinc-500 italic">💡 {preset.tip}</p>
      </div>
    </button>
  );
};

export const WelcomeStep: React.FC = () => {
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
          <span className="text-3xl">🎮</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">Choose Your Flying Style</h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          Select a preset to quickly configure the essential flight modes for your style,
          or set up modes manually for full control.
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
      <div className="pt-4 border-t border-zinc-700">
        <button
          onClick={handleManualSetup}
          className="w-full p-4 rounded-xl border border-zinc-600 bg-zinc-800/50 hover:bg-zinc-700/50 transition-colors text-left flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="text-2xl">⚙️</div>
            <div>
              <h3 className="font-medium text-zinc-200">Manual Setup</h3>
              <p className="text-xs text-zinc-500">Configure modes one by one (advanced)</p>
            </div>
          </div>
          <svg
            className="w-5 h-5 text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>

      {/* Info note */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <span className="text-xl">💡</span>
          <div>
            <h4 className="font-medium text-amber-200 text-sm">New to FPV?</h4>
            <p className="text-xs text-amber-100/70 mt-1">
              Start with the <strong>Beginner</strong> preset. It enables ANGLE mode which
              keeps your quad level automatically - perfect for learning!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeStep;
