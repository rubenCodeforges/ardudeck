/**
 * ServoReviewStep
 *
 * Step 5: Review configuration and save to flight controller.
 * Shows summary table of all servo assignments and mixer rules.
 */

import { useState } from 'react';
import { useServoWizardStore } from '../../../stores/servo-wizard-store';
import { CONTROL_SURFACE_INFO, SERVO_INPUT_SOURCE } from '../presets/servo-presets';

export default function ServoReviewStep() {
  const {
    selectedPreset,
    assignments,
    saveToFC,
    prevStep,
    closeWizard,
  } = useServoWizardStore();

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  // Get input source name
  const getInputName = (source: number) => {
    const entry = Object.entries(SERVO_INPUT_SOURCE).find(([, v]) => v === source);
    return entry ? entry[0].replace(/_/g, ' ') : `Source ${source}`;
  };

  // Handle save to flight controller
  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');
    setErrorMessage('');

    try {
      await saveToFC();
      setSaveStatus('success');
    } catch (err) {
      setSaveStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  // Handle finish (close wizard)
  const handleFinish = () => {
    closeWizard();
  };

  if (!selectedPreset) {
    return <div className="text-zinc-400">No configuration to review</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-white">Review Your Configuration</h2>
        <p className="text-sm text-zinc-400 mt-2">
          Verify your servo configuration before saving to the flight controller.
        </p>
      </div>

      {/* Aircraft type badge */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-3 px-4 py-2 bg-zinc-800/50 rounded-full border border-zinc-700/50">
          <span className="text-2xl">{selectedPreset.icon}</span>
          <span className="text-sm font-medium text-white">{selectedPreset.name}</span>
          <span className="text-xs text-zinc-400">
            {selectedPreset.servoCount} servo{selectedPreset.servoCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Configuration summary table */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-800/50 text-zinc-400 text-xs uppercase tracking-wide">
              <th className="px-4 py-3 text-left">Control Surface</th>
              <th className="px-4 py-3 text-left">Servo</th>
              <th className="px-4 py-3 text-left">Input</th>
              <th className="px-4 py-3 text-center">Rate</th>
              <th className="px-4 py-3 text-center">Range</th>
              <th className="px-4 py-3 text-center">Center</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {assignments.map((assignment) => {
              const surfaceInfo = CONTROL_SURFACE_INFO[assignment.surface];
              const defaultRule = selectedPreset.defaultRules[assignment.surface];

              return (
                <tr key={assignment.surface} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{surfaceInfo.name}</span>
                      {assignment.reversed && (
                        <span className="text-xs px-1.5 py-0.5 bg-yellow-500/20 rounded text-yellow-400">
                          REV
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-blue-400">S{assignment.servoIndex}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {defaultRule ? getInputName(defaultRule.inputSource) : '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-mono ${
                      assignment.reversed ? 'text-yellow-400' : 'text-zinc-300'
                    }`}>
                      {assignment.reversed ? '-' : ''}{assignment.rate || 100}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono text-zinc-400">
                      {assignment.min} - {assignment.max}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono text-green-400">{assignment.center}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mixer rules preview */}
      <div className="bg-zinc-800/30 rounded-xl p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Mixer Rules Preview</h3>
        <div className="font-mono text-xs text-zinc-500 space-y-1">
          {assignments.map((assignment) => {
            const defaultRule = selectedPreset.defaultRules[assignment.surface];
            if (!defaultRule) return null;

            const rate = assignment.reversed
              ? -(assignment.rate || 100)
              : (assignment.rate || 100);

            return (
              <div key={assignment.surface}>
                <span className="text-zinc-400">Servo {assignment.servoIndex}</span>
                <span className="text-zinc-600"> → </span>
                <span className="text-blue-400">{getInputName(defaultRule.inputSource)}</span>
                <span className="text-zinc-600"> @ </span>
                <span className={rate < 0 ? 'text-yellow-400' : 'text-green-400'}>
                  {rate}%
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save status */}
      {saveStatus === 'success' && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">✓</span>
          <div>
            <p className="text-sm text-green-400 font-medium">Configuration saved successfully!</p>
            <p className="text-xs text-zinc-400 mt-1">
              Settings have been written to the flight controller. You can now close this wizard.
            </p>
          </div>
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <span className="text-2xl">✗</span>
          <div>
            <p className="text-sm text-red-400 font-medium">Failed to save configuration</p>
            <p className="text-xs text-zinc-400 mt-1">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* Important notes */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
        <span className="text-xl">ℹ️</span>
        <div>
          <p className="text-sm text-blue-400 font-medium">Before saving:</p>
          <ul className="text-xs text-zinc-400 mt-1 space-y-1 list-disc list-inside">
            <li>Ensure your flight controller is connected</li>
            <li>Disconnect propellers for safety</li>
            <li>After saving, test all controls before flight</li>
            <li>Settings are stored in EEPROM (persist after power off)</li>
          </ul>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={prevStep}
          disabled={isSaving}
          className="px-6 py-2.5 rounded-lg font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
        >
          ← Back
        </button>

        <div className="flex gap-3">
          {saveStatus === 'success' ? (
            <button
              onClick={handleFinish}
              className="px-6 py-2.5 rounded-lg font-medium bg-green-500 text-white hover:bg-green-400"
            >
              ✓ Done
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-6 py-2.5 rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-400 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <span className="animate-spin">⟳</span>
                  Saving...
                </>
              ) : (
                <>
                  💾 Save to Flight Controller
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
