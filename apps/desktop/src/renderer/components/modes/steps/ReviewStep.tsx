/**
 * ReviewStep
 *
 * Final step of the wizard.
 * Shows summary of all configured modes and saves to FC.
 */

import React from 'react';
import { useModesWizardStore } from '../../../stores/modes-wizard-store';
import { MODE_INFO, AUX_CHANNELS, PRESET_ICONS } from '../presets/mode-presets';
import ModeCard from '../shared/ModeCard';
import { ClipboardList, AlertTriangle, XCircle, CheckCircle2, Lightbulb, HelpCircle } from 'lucide-react';

export const ReviewStep: React.FC = () => {
  const {
    selectedPreset,
    pendingModes,
    originalModes,
    rcChannels,
    isSaving,
    saveError,
    saveToFC,
    prevStep,
    closeWizard,
  } = useModesWizardStore();

  // Get RC value for a mode's AUX channel
  const getRcValue = (auxChannel: number) => rcChannels[auxChannel + 4] || 1500;

  // Find changes from original configuration
  const hasChanges = pendingModes.length !== originalModes.length ||
    pendingModes.some((mode, idx) => {
      const original = originalModes[idx];
      return !original ||
        mode.boxId !== original.boxId ||
        mode.auxChannel !== original.auxChannel ||
        mode.rangeStart !== original.rangeStart ||
        mode.rangeEnd !== original.rangeEnd;
    });

  const handleSave = async () => {
    const success = await saveToFC();
    if (success) {
      // Close wizard after successful save
      setTimeout(() => {
        closeWizard();
      }, 1500);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-4">
          <ClipboardList className="w-8 h-8 text-green-400" />
        </div>
        <h2 className="text-xl font-semibold text-zinc-100">Review Your Configuration</h2>
        <p className="text-sm text-zinc-400 mt-2 max-w-md mx-auto">
          {selectedPreset
            ? `Using ${selectedPreset.name} preset with ${pendingModes.length} mode${pendingModes.length !== 1 ? 's' : ''}.`
            : `You have configured ${pendingModes.length} mode${pendingModes.length !== 1 ? 's' : ''}.`}
        </p>
      </div>

      {/* Preset info */}
      {selectedPreset && (() => {
        const PresetIcon = PRESET_ICONS[selectedPreset.icon] || HelpCircle;
        return (
          <div className={`p-4 rounded-xl border bg-gradient-to-br ${selectedPreset.gradient}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                <PresetIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-medium text-zinc-100">{selectedPreset.name} Preset</h3>
                <p className="text-xs text-zinc-400 mt-0.5">{selectedPreset.tip}</p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Mode cards */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">Configured Modes:</h3>
        {pendingModes.map((mode, index) => (
          <ModeCard
            key={index}
            mode={mode}
            rcValue={getRcValue(mode.auxChannel)}
            readOnly
            expanded={false}
            showDescription={false}
          />
        ))}
      </div>

      {/* Summary table */}
      <div className="overflow-hidden rounded-xl border border-zinc-700">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-zinc-300">Mode</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-300">Channel</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-300">Range</th>
              <th className="px-4 py-2 text-left font-medium text-zinc-300">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {pendingModes.map((mode, index) => {
              const info = MODE_INFO[mode.boxId];
              const IconComponent = info?.icon || HelpCircle;
              const aux = AUX_CHANNELS[mode.auxChannel];
              const rcValue = getRcValue(mode.auxChannel);
              const isActive = rcValue >= mode.rangeStart && rcValue <= mode.rangeEnd;

              return (
                <tr key={index} className="bg-zinc-900/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <IconComponent className={`w-4 h-4 ${(info?.color || 'bg-zinc-500').replace('bg-', 'text-')}`} />
                      <span className="text-zinc-200">{info?.name || `Mode ${mode.boxId}`}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">{aux?.name || `AUX ${mode.auxChannel + 1}`}</td>
                  <td className="px-4 py-3 font-mono text-zinc-400">
                    {mode.rangeStart} - {mode.rangeEnd}
                  </td>
                  <td className="px-4 py-3">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                        <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                        Active
                      </span>
                    ) : (
                      <span className="text-zinc-500 text-xs">Ready</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Warning if ARM is missing */}
      {!pendingModes.some((m) => m.boxId === 0) && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-300">ARM mode is not configured!</h4>
              <p className="text-xs text-red-200/70 mt-1">
                Without ARM mode, you won&apos;t be able to arm your aircraft. Go back and add ARM to a switch.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-300">Failed to save</h4>
              <p className="text-xs text-red-200/70 mt-1">{saveError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success message */}
      {isSaving === false && !saveError && hasChanges === false && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-xl animate-pulse">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
            <div>
              <h4 className="font-medium text-green-300">Configuration saved!</h4>
              <p className="text-xs text-green-200/70">
                Your mode configuration has been written to the flight controller.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Important note */}
      <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-medium text-amber-200 text-sm">Before you fly:</h4>
            <ul className="text-xs text-amber-100/70 mt-2 space-y-1 list-disc list-inside">
              <li>Always test ARM in a safe area with props off</li>
              <li>Verify your failsafe is set correctly</li>
              <li>Double-check your AUX switch positions</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={prevStep}
          disabled={isSaving}
          className="px-4 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 text-zinc-200 rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || pendingModes.length === 0}
          className="flex-1 px-4 py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Save to Flight Controller
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ReviewStep;
