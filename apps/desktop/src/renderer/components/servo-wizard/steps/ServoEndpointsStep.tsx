/**
 * ServoEndpointsStep
 *
 * Step 4: Fine-tune servo endpoints (min/center/max) with visual feedback.
 * Helps prevent servo binding and ensure proper travel.
 */

import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useServoWizardStore } from '../../../stores/servo-wizard-store';
import { CONTROL_SURFACE_INFO } from '../presets/servo-presets';
import ServoEndpointSlider from '../shared/ServoEndpointSlider';
import ServoBar from '../shared/ServoBar';
import { Lightbulb } from 'lucide-react';

export default function ServoEndpointsStep() {
  const { t } = useTranslation();
  const {
    assignments,
    servoValues,
    isPollingServos,
    updateAssignment,
    startServoPolling,
    stopServoPolling,
    nextStep,
    prevStep,
    servoRangeLimits,
  } = useServoWizardStore();

  // Track which servo is being tested
  const [testingServo, setTestingServo] = useState<number | null>(null);

  // Get current servo value
  const getServoValue = (servoIndex: number) => {
    return servoValues[servoIndex] || 1500;
  };

  // Handle endpoint test - would send command to FC to move servo
  const handleTestPosition = (index: number, position: 'min' | 'center' | 'max') => {
    const assignment = assignments[index];
    setTestingServo(index);

    // Get the target value
    const targetValue =
      position === 'min' ? assignment!.min :
      position === 'max' ? assignment!.max :
      assignment!.center;

    // TODO: Send MSP command to move servo to target position
    // For now, just show visual feedback
    console.log(`Testing servo ${assignment!.servoIndex} at ${position}: ${targetValue}µs`);

    // Clear testing state after 2 seconds
    setTimeout(() => setTestingServo(null), 2000);
  };

  // Update endpoints for an assignment
  const handleEndpointChange = (
    index: number,
    endpoints: { min: number; center: number; max: number }
  ) => {
    updateAssignment(index, {
      min: endpoints.min,
      center: endpoints.center,
      max: endpoints.max,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-content">{t('servo-wizard:servoEndpointsStep.title')}</h2>
        <p className="text-sm text-content-secondary mt-2">
          {t('servo-wizard:servoEndpointsStep.subtitle')}
        </p>
      </div>

      {/* Polling toggle */}
      <div className="flex items-center justify-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isPollingServos}
            onChange={(e) => (e.target.checked ? startServoPolling() : stopServoPolling())}
            className="w-4 h-4 rounded border bg-surface-raised text-blue-500 focus:ring-blue-500/50"
          />
          <span className="text-sm text-content-secondary">
            {isPollingServos ? (
              <span className="text-green-400">{t('servo-wizard:servoEndpointsStep.feedbackEnabled')}</span>
            ) : (
              t('servo-wizard:servoEndpointsStep.enableFeedback')
            )}
          </span>
        </label>
      </div>

      {/* Endpoint calibration cards */}
      <div className="space-y-6">
        {assignments.map((assignment, index) => {
          const surfaceInfo = CONTROL_SURFACE_INFO[assignment.surface];
          const currentValue = getServoValue(assignment.servoIndex);
          const isTesting = testingServo === index;

          return (
            <div
              key={assignment.surface}
              className={`bg-surface-input rounded-xl border p-5 transition-all overflow-hidden ${
                isTesting
                  ? 'border-yellow-500/50 bg-yellow-500/5'
                  : 'border-subtle'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-content">{t(surfaceInfo.nameKey)}</span>
                  <span className="text-xs px-2 py-0.5 bg-surface-raised rounded text-content-secondary">
                    {t('servo-wizard:servoTestStep.servoIndex', { index: assignment.servoIndex })}
                  </span>
                  {assignment.reversed && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-500/20 rounded text-yellow-400">
                      {t('common:reversed')}
                    </span>
                  )}
                </div>
                {isTesting && (
                  <span className="text-xs text-yellow-400 animate-pulse">
                    {t('servo-wizard:servoEndpointsStep.testingPosition')}
                  </span>
                )}
              </div>

              {/* Live position bar */}
              <div className="mb-4">
                <div className="text-xs text-content-secondary mb-1">{t('servo-wizard:servoEndpointsStep.livePosition')}</div>
                <ServoBar
                  value={currentValue}
                  min={assignment.min}
                  max={assignment.max}
                  center={assignment.center}
                  showLabels
                  height={24}
                />
              </div>

              {/* Endpoint slider */}
              <ServoEndpointSlider
                min={assignment.min}
                center={assignment.center}
                max={assignment.max}
                currentValue={currentValue}
                onChange={(endpoints) => handleEndpointChange(index, endpoints)}
                onTestPosition={(position) => handleTestPosition(index, position)}
                rangeLimits={servoRangeLimits}
              />

              {/* Rate slider */}
              <div className="mt-4 pt-4 border-t border-subtle">
                <div className="flex items-center gap-4">
                  <label className="text-xs text-content-secondary whitespace-nowrap">{t('servo-wizard:servoEndpointsStep.rate')}</label>
                  <input
                    type="range"
                    min={0}
                    max={125}
                    value={(assignment as any).rate || 100}
                    onChange={(e) => updateAssignment(index, { rate: Number(e.target.value) } as any)}
                    className="flex-1 h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer"
                  />
                  <span className="text-sm font-mono text-content w-12 text-right">
                    {(assignment as any).rate || 100}%
                  </span>
                </div>
                <p className="text-xs text-content-tertiary mt-1">
                  {t('servo-wizard:servoEndpointsStep.rateHint')}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Help tip */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-amber-400 shrink-0" />
        <div>
          <p className="text-sm text-amber-400 font-medium">{t('servo-wizard:servoEndpointsStep.quickTips')}</p>
          <ul className="text-xs text-content-secondary mt-1 space-y-1 list-disc list-inside">
            <li><Trans i18nKey="servo-wizard:servoEndpointsStep.tipGrinding" components={{ b: <strong /> }} /></li>
            <li><Trans i18nKey="servo-wizard:servoEndpointsStep.tipNotLevel" components={{ b: <strong /> }} /></li>
            <li><Trans i18nKey="servo-wizard:servoEndpointsStep.tipSensitive" components={{ b: <strong /> }} /></li>
          </ul>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={prevStep}
          className="px-6 py-2.5 rounded-lg font-medium bg-surface-raised text-content hover:bg-surface-raised"
        >
          {t('servo-wizard:wizardNav.back')}
        </button>
        <button
          onClick={nextStep}
          className="px-6 py-2.5 rounded-lg font-medium bg-blue-500 text-white hover:bg-blue-400"
        >
          {t('servo-wizard:servoEndpointsStep.continue')}
        </button>
      </div>
    </div>
  );
}
