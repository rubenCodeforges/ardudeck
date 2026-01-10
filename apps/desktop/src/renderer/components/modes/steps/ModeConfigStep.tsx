/**
 * ModeConfigStep
 *
 * Configure a single mode (part of the wizard flow).
 * Shows the mode info, AUX channel picker, and range slider.
 */

import React from 'react';
import { useModesWizardStore } from '../../../stores/modes-wizard-store';
import { MODE_INFO, AUX_CHANNELS } from '../presets/mode-presets';
import AuxChannelPicker from '../shared/AuxChannelPicker';
import RangeSlider from '../shared/RangeSlider';
import RcChannelBar from '../shared/RcChannelBar';

export const ModeConfigStep: React.FC = () => {
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
        <p className="text-zinc-400">No mode to configure</p>
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
                  : 'bg-zinc-700'
              }`}
            />
          ))}
        </div>
      )}

      {/* Mode header */}
      <div className="text-center">
        <div
          className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${modeInfo.color}/20 mb-4`}
        >
          <span className="text-3xl">{modeInfo.icon}</span>
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">{modeInfo.name}</h2>
        <p className="text-sm text-zinc-400 mt-1">{modeInfo.description}</p>
        {modeInfo.essential && (
          <span className="inline-block mt-2 px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">
            ESSENTIAL MODE
          </span>
        )}
      </div>

      {/* Beginner explanation */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <p className="text-sm text-blue-200">{modeInfo.beginner}</p>
      </div>

      {/* AUX Channel selection */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          Which switch should activate this mode?
        </label>
        <AuxChannelPicker
          selected={currentMode.auxChannel}
          onChange={handleChannelChange}
          rcChannels={rcChannels}
        />
      </div>

      {/* Range slider */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-zinc-300">
          When should it activate? (PWM range)
        </label>
        <div className="p-4 bg-zinc-800/50 rounded-xl border border-zinc-700">
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
        <label className="block text-sm font-medium text-zinc-300">
          Test it! Flip your switch to see if it activates:
        </label>
        <div
          className={`p-4 rounded-xl border transition-all ${
            isActive
              ? 'bg-green-500/10 border-green-500/30 shadow-lg shadow-green-500/10'
              : 'bg-zinc-800/50 border-zinc-700'
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
            <span className="text-2xl">✅</span>
            <div>
              <h4 className="font-medium text-green-300">{modeInfo.name} is ACTIVE!</h4>
              <p className="text-xs text-green-200/70">
                Your switch is in the correct position. This mode would be active in flight.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-xl">
          <div className="flex items-center gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <h4 className="font-medium text-zinc-300">Try it now!</h4>
              <p className="text-xs text-zinc-500">
                Move your {AUX_CHANNELS[currentMode.auxChannel]?.name || 'switch'} to
                the {currentMode.rangeStart >= 1700 ? 'HIGH' : currentMode.rangeEnd <= 1300 ? 'LOW' : 'MID'} position
                to see {modeInfo.name} activate.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={prevStep}
          className="px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={nextStep}
          className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors"
        >
          {isLastMode ? 'Review Configuration' : 'Next Mode'}
        </button>
      </div>
    </div>
  );
};

export default ModeConfigStep;
