/**
 * ServoTestStep
 *
 * Step 3: Live test servos with reverse buttons.
 * Move transmitter sticks and verify servos respond correctly.
 */

import { Trans, useTranslation } from 'react-i18next';
import { useServoWizardStore } from '../../../stores/servo-wizard-store';
import { CONTROL_SURFACE_INFO } from '../presets/servo-presets';
import ServoBar from '../shared/ServoBar';
import { Check, Lightbulb } from 'lucide-react';

export default function ServoTestStep() {
  const { t } = useTranslation();
  const {
    assignments,
    servoValues,
    isPollingServos,
    reverseServo,
    startServoPolling,
    stopServoPolling,
    nextStep,
    prevStep,
  } = useServoWizardStore();

  // Get servo value for an assignment
  const getServoValue = (servoIndex: number) => {
    return servoValues[servoIndex] || 1500;
  };

  // Determine if servo is moving (not near center)
  const isServoMoving = (value: number) => {
    return Math.abs(value - 1500) > 50;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-xl font-bold text-content">{t('servo-wizard:servoTestStep.title')}</h2>
        <p className="text-sm text-content-secondary mt-2">
          {t('servo-wizard:servoTestStep.subtitle')}
          <br />
          <Trans
            i18nKey="servo-wizard:servoTestStep.reverseHint"
            components={{ b: <strong className="text-content" />, rev: <strong className="text-blue-400" /> }}
          />
        </p>
      </div>

      {/* Polling status */}
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
              <span className="text-green-400">{t('servo-wizard:servoTestStep.pollingEnabled')}</span>
            ) : (
              t('servo-wizard:servoTestStep.enablePolling')
            )}
          </span>
        </label>
      </div>

      {/* Servo test cards */}
      <div className="space-y-4">
        {assignments.map((assignment, index) => {
          const surfaceInfo = CONTROL_SURFACE_INFO[assignment.surface];
          const value = getServoValue(assignment.servoIndex);
          const moving = isServoMoving(value);

          return (
            <div
              key={assignment.surface}
              className={`bg-surface-input rounded-xl border p-4 transition-all ${
                moving
                  ? 'border-green-500/50 bg-green-500/5'
                  : 'border-subtle'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2">
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
                  <div className="text-xs text-content-secondary mt-1">
                    {t(getServoTestInstructionKey(assignment.surface))}
                  </div>
                </div>
                <button
                  onClick={() => reverseServo(index)}
                  className={`px-4 py-2 text-sm rounded-lg transition-all ${
                    assignment.reversed
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                      : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
                  }`}
                >
                  {assignment.reversed ? t('servo-wizard:servoTestStep.undoReverse') : t('common:reverse')}
                </button>
              </div>

              {/* Servo bar */}
              <ServoBar
                value={value}
                min={assignment.min}
                max={assignment.max}
                center={assignment.center}
                showLabels={false}
                height={20}
              />

              {/* Status indicator */}
              <div className="mt-2 flex items-center gap-2">
                {moving ? (
                  <>
                    <Check className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-green-400">{t('servo-wizard:servoTestStep.responding')}</span>
                  </>
                ) : (
                  <>
                    <span className="text-content-secondary">○</span>
                    <span className="text-xs text-content-secondary">{t('servo-wizard:servoTestStep.moveStick')}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Help tip */}
      <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
        <Lightbulb className="w-5 h-5 text-amber-400 shrink-0" />
        <div>
          <p className="text-sm text-amber-400 font-medium">{t('servo-wizard:servoTestStep.howToCheck')}</p>
          <ul className="text-xs text-content-secondary mt-1 space-y-1 list-disc list-inside">
            <li><Trans i18nKey="servo-wizard:servoTestStep.checkAilerons" components={{ b: <strong /> }} /></li>
            <li><Trans i18nKey="servo-wizard:servoTestStep.checkElevator" components={{ b: <strong /> }} /></li>
            <li><Trans i18nKey="servo-wizard:servoTestStep.checkRudder" components={{ b: <strong /> }} /></li>
            <li><Trans i18nKey="servo-wizard:servoTestStep.checkElevons" components={{ b: <strong /> }} /></li>
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
          {t('servo-wizard:servoTestStep.continue')}
        </button>
      </div>
    </div>
  );
}

// Get test instruction i18n key for a control surface
function getServoTestInstructionKey(surface: string): string {
  switch (surface) {
    case 'aileron_left':
      return 'servo-wizard:servoTestStep.instruction.aileronLeft';
    case 'aileron_right':
      return 'servo-wizard:servoTestStep.instruction.aileronRight';
    case 'elevator':
      return 'servo-wizard:servoTestStep.instruction.elevator';
    case 'rudder':
      return 'servo-wizard:servoTestStep.instruction.rudder';
    case 'elevon_left':
      return 'servo-wizard:servoTestStep.instruction.elevonLeft';
    case 'elevon_right':
      return 'servo-wizard:servoTestStep.instruction.elevonRight';
    case 'vtail_left':
      return 'servo-wizard:servoTestStep.instruction.vtailLeft';
    case 'vtail_right':
      return 'servo-wizard:servoTestStep.instruction.vtailRight';
    case 'yaw_servo':
      return 'servo-wizard:servoTestStep.instruction.yawServo';
    case 'gimbal_pan':
      return 'servo-wizard:servoTestStep.instruction.gimbalPan';
    case 'gimbal_tilt':
      return 'servo-wizard:servoTestStep.instruction.gimbalTilt';
    default:
      return 'servo-wizard:servoTestStep.instruction.default';
  }
}
