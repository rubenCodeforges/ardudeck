/**
 * ServoTuningTab
 *
 * Standalone servo tuning tab for MspConfigView.
 * Handles initialization of servo support check and loads servo configs from FC.
 * Auto-defaults to 'traditional' preset if no aircraft type is detected.
 */

import { useEffect } from 'react';
import {
  useServoWizardStore, writeServoTuning, SERVO_TUNING_PENDING_ID, type ServoTuningDraft,
} from '../../stores/servo-wizard-store';
import { usePendingWritesStore } from '../../stores/msp-pending-writes-store';
import { ServoTuningView } from '../servo-wizard/tuning';
import { CircleSlash } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';

export default function ServoTuningTab() {
  const { t } = useTranslation();
  const {
    checkServoSupport,
    servoSupported,
    isCheckingSupport,
    supportError,
    isMultirotor,
    reset,
    assignments,
    originalAssignments,
    fcServoConfigs,
  } = useServoWizardStore();

  // Edits are queued for the global Save All Changes; the draft outlives this tab's unmount.
  useEffect(() => {
    if (originalAssignments.length === 0) return;
    const store = usePendingWritesStore.getState();
    if (JSON.stringify(assignments) === JSON.stringify(originalAssignments)) {
      store.drop(SERVO_TUNING_PENDING_ID);
      return;
    }
    store.put<ServoTuningDraft>(SERVO_TUNING_PENDING_ID, {
      label: t('parameters:servoTuningTab.pendingLabel'),
      draft: { assignments, fcServoConfigs },
      write: writeServoTuning,
    });
  }, [assignments, originalAssignments, fcServoConfigs, t]);

  // Initialize on mount - check support and load from FC
  useEffect(() => {
    checkServoSupport();
    // Reset on unmount to clean up polling
    return () => {
      reset();
    };
  }, [checkServoSupport, reset]);

  // Loading state
  if (isCheckingSupport || servoSupported === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] h-full gap-4 text-content-secondary">
        <svg
          className="animate-spin h-8 w-8 text-blue-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <p className="text-sm">{t('parameters:servoTuningTab.checkingSupport')}</p>
      </div>
    );
  }

  // Servo not supported
  if (!servoSupported) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 max-w-lg mx-auto text-center">
        <CircleSlash className="w-16 h-16 text-content-secondary" />
        <div>
          <h2 className="text-xl font-bold text-content mb-2">
            {isMultirotor ? t('parameters:servoTuningTab.boardIsMultirotor') : t('parameters:servoTuningTab.notAvailable')}
          </h2>
          <p className="text-content-secondary">{supportError || t('parameters:servoTuningTab.outputsUnavailable')}</p>
        </div>

        <div className="bg-surface border rounded-xl p-4 text-left">
          <p className="text-sm text-content font-medium mb-2">{t('parameters:servoTuningTab.usedFor')}</p>
          <ul className="text-xs text-content-secondary space-y-1 list-disc list-inside">
            <li><Trans i18nKey="parameters:servoTuningTab.useFixedWing" components={{ b: <strong /> }} /></li>
            <li><Trans i18nKey="parameters:servoTuningTab.useFlyingWing" components={{ b: <strong /> }} /></li>
            <li><Trans i18nKey="parameters:servoTuningTab.useGimbal" components={{ b: <strong /> }} /></li>
          </ul>
        </div>

        {isMultirotor && (
          <div className="bg-blue-500/10 border-blue-500/30 rounded-xl p-4 w-full">
            <p className="text-sm text-blue-300">
              {t('parameters:servoTuningTab.multirotorHint')}
            </p>
          </div>
        )}
      </div>
    );
  }

  // Render the tuning view
  return <ServoTuningView hideSave />;
}
