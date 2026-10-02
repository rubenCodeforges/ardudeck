/**
 * ServoWizard
 *
 * Main container component for the Servo Setup Wizard.
 * Renders step progress indicator and the active step component.
 *
 * Supports two modes:
 * - Wizard: Guided 5-step setup for beginners
 * - Tune: Visual fine-tuning view for adjustments
 *
 * Wizard steps:
 * 1. Pick aircraft type (visual cards)
 * 2. Assign servos to control surfaces (with diagram)
 * 3. Test servo movement (live feedback)
 * 4. Calibrate endpoints (prevent binding)
 * 5. Review and save to FC
 */

import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { CircleSlash, Check } from 'lucide-react';
import { useServoWizardStore, WizardStep, STEP_INFO } from '../../stores/servo-wizard-store';
import {
  PlaneTypeStep,
  ServoAssignmentStep,
  ServoTestStep,
  ServoEndpointsStep,
  ServoReviewStep,
} from './steps';
import { ServoTuningView } from './tuning';
import { PLATFORM_TYPE } from './presets/servo-presets';

type ViewMode = 'wizard' | 'tune';

const STEPS: WizardStep[] = ['aircraft', 'assign', 'test', 'endpoints', 'review'];

export default function ServoWizard() {
  const { t } = useTranslation();
  const {
    currentStep,
    currentStepIndex,
    selectedPresetId,
    selectedPreset,
    assignments,
    goToStep,
    servoSupported,
    isCheckingSupport,
    supportError,
    isMultirotor,
    checkServoSupport,
  } = useServoWizardStore();

  // State for changing mixer type
  const [isChangingMixer, setIsChangingMixer] = useState(false);
  const [mixerChangeStatus, setMixerChangeStatus] = useState<{
    type: 'info' | 'success' | 'error' | 'warning';
    message: string;
  } | null>(null);

  // Change platform to airplane using the proper iNav method (with CLI fallback for old versions)
  const handleChangeToAirplane = async () => {
    setIsChangingMixer(true);
    setMixerChangeStatus({ type: 'info', message: t('servo-wizard:servoWizard.settingPlatform') });

    try {
      // Use the proper iNav platform type command (has CLI fallback built-in)
      setMixerChangeStatus({ type: 'info', message: t('servo-wizard:servoWizard.sendingPlatform') });
      const success = await window.electronAPI.mspSetInavPlatformType(PLATFORM_TYPE.AIRPLANE);

      if (success) {
        // CLI fallback may have already rebooted the board
        // Wait and prompt to reconnect
        setMixerChangeStatus({ type: 'info', message: t('servo-wizard:servoWizard.savingEeprom') });

        // Try to save EEPROM (may fail if board already rebooting from CLI)
        try {
          await window.electronAPI.mspSaveEeprom();
          setMixerChangeStatus({ type: 'info', message: t('servo-wizard:servoWizard.rebooting') });
          await window.electronAPI.mspReboot();
          await new Promise(r => setTimeout(r, 1000));
        } catch {
          // Board may have already rebooted from CLI save command
          console.log('[ServoWizard] Board may have already rebooted from CLI');
        }

        // Disconnect
        setMixerChangeStatus({ type: 'info', message: t('servo-wizard:servoWizard.disconnecting') });
        try {
          await window.electronAPI.disconnect();
        } catch {
          // Ignore disconnect errors
        }

        // Wait for board to reboot (F3 boards are slow)
        setMixerChangeStatus({ type: 'info', message: t('servo-wizard:servoWizard.waitingReboot') });
        await new Promise(r => setTimeout(r, 5000));

        // Show reconnect prompt
        setMixerChangeStatus({
          type: 'success',
          message: t('servo-wizard:servoWizard.platformChanged'),
        });
      } else {
        // Both MSP2 and CLI fallback failed
        setMixerChangeStatus({
          type: 'error',
          message: t('servo-wizard:servoWizard.platformChangeFailed'),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('servo-wizard:servoWizard.unknownError');
      setMixerChangeStatus({ type: 'error', message: t('servo-wizard:servoWizard.failedWithMessage', { message }) });
    } finally {
      setIsChangingMixer(false);
    }
  };

  // Reconnect after mixer change
  const handleReconnect = async () => {
    setIsChangingMixer(true);
    setMixerChangeStatus({ type: 'info', message: t('servo-wizard:servoWizard.reconnecting') });

    try {
      // Get the last connection settings and reconnect
      // For now, just prompt user to use the connection panel
      setMixerChangeStatus({
        type: 'info',
        message: t('servo-wizard:servoWizard.useConnectionPanel'),
      });
    } finally {
      setIsChangingMixer(false);
    }
  };

  // View mode: wizard for setup, tune for fine-tuning
  // Default to tune if already configured, wizard if not
  const [viewMode, setViewMode] = useState<ViewMode>(
    selectedPresetId && assignments.length > 0 ? 'tune' : 'wizard'
  );

  // Auto-switch to tune mode after wizard completion
  useEffect(() => {
    if (currentStep === 'review' && selectedPresetId && assignments.length > 0) {
      // User just completed wizard, could optionally switch to tune
    }
  }, [currentStep, selectedPresetId, assignments]);

  // Render the current step component
  const renderStep = () => {
    switch (currentStep) {
      case 'aircraft':
        return <PlaneTypeStep />;
      case 'assign':
        return <ServoAssignmentStep />;
      case 'test':
        return <ServoTestStep />;
      case 'endpoints':
        return <ServoEndpointsStep />;
      case 'review':
        return <ServoReviewStep />;
      default:
        return <PlaneTypeStep />;
    }
  };

  // Check if step is accessible (can only go to steps we've already passed)
  const canGoToStep = (stepIndex: number) => {
    // Can always go back to previous steps
    if (stepIndex < currentStepIndex) return true;

    // Can only go forward if aircraft is selected
    if (stepIndex === 0) return true;
    if (!selectedPresetId) return false;

    return stepIndex <= currentStepIndex;
  };

  // Show loading state while checking servo support
  if (isCheckingSupport || servoSupported === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] h-full gap-4 text-content-secondary">
        <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-sm">{t('servo-wizard:servoWizard.checkingSupport')}</p>
      </div>
    );
  }

  // Show error if servos not supported
  if (!servoSupported) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 max-w-lg mx-auto text-center">
        <CircleSlash className="w-16 h-16 text-content-secondary" />
        <div>
          <h2 className="text-xl font-bold text-content mb-2">
            {isMultirotor ? t('servo-wizard:servoWizard.boardIsMultirotor') : t('servo-wizard:servoWizard.notAvailable')}
          </h2>
          <p className="text-content-secondary">{supportError}</p>
        </div>

        {/* Show conversion options if it's a multirotor */}
        {isMultirotor && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 w-full">
            <p className="text-sm text-blue-300 font-medium mb-3">
              {t('servo-wizard:servoWizard.configureAsPlaneQuestion')}
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleChangeToAirplane}
                disabled={isChangingMixer}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {isChangingMixer ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    {mixerChangeStatus?.message || t('servo-wizard:servoWizard.configuring')}
                  </>
                ) : (
                  <>{t('servo-wizard:servoWizard.configureAsAirplane')}</>
                )}
              </button>

              {/* Status message */}
              {mixerChangeStatus && !isChangingMixer && (
                <p className={`text-xs ${
                  mixerChangeStatus.type === 'success' ? 'text-green-400' :
                  mixerChangeStatus.type === 'error' ? 'text-red-400' :
                  mixerChangeStatus.type === 'warning' ? 'text-yellow-400' :
                  'text-blue-400'
                }`}>
                  {mixerChangeStatus.message}
                </p>
              )}

              {/* Show reconnect prompt after successful change */}
              {mixerChangeStatus?.type === 'success' && (
                <p className="text-xs text-content-secondary mt-1">
                  {t('servo-wizard:servoWizard.reconnectHint')}
                </p>
              )}
            </div>

            <p className="text-xs text-content-secondary mt-3">
              {t('servo-wizard:servoWizard.changeMixerHint')}
            </p>

            {/* Warning for old firmware */}
            <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-xs text-yellow-400">
                <Trans
                  i18nKey="servo-wizard:servoWizard.oldFirmwareNote"
                  components={{ b: <strong />, code: <code className="bg-black/30 px-1 rounded" /> }}
                />
              </p>
            </div>
          </div>
        )}

        <div className="bg-surface border border rounded-xl p-4 text-left">
          <p className="text-sm text-content font-medium mb-2">{t('servo-wizard:servoWizard.usedFor')}</p>
          <ul className="text-xs text-content-secondary space-y-1 list-disc list-inside">
            <li><Trans i18nKey="servo-wizard:servoWizard.usedForFixedWing" components={{ b: <strong /> }} /></li>
            <li><Trans i18nKey="servo-wizard:servoWizard.usedForFlyingWing" components={{ b: <strong /> }} /></li>
            <li><Trans i18nKey="servo-wizard:servoWizard.usedForGimbal" components={{ b: <strong /> }} /></li>
          </ul>
        </div>
      </div>
    );
  }

  // Common header with mode toggle (consistent in both views)
  const renderHeader = () => (
    <div className="bg-surface-input border-b border-subtle px-6 py-4">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {/* Mode toggle - always in same position */}
        <div className="flex items-center gap-1 bg-surface-raised rounded-lg p-1">
          <button
            onClick={() => setViewMode('wizard')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'wizard'
                ? 'bg-blue-500 text-white'
                : 'text-content-secondary hover:text-content'
            }`}
          >
            {t('servo-wizard:servoWizard.wizard')}
          </button>
          <button
            onClick={() => setViewMode('tune')}
            disabled={!selectedPresetId || assignments.length === 0}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'tune'
                ? 'bg-blue-500 text-white'
                : !selectedPresetId || assignments.length === 0
                ? 'text-content-tertiary cursor-not-allowed'
                : 'text-content-secondary hover:text-content'
            }`}
            title={!selectedPresetId ? t('servo-wizard:servoWizard.completeWizardFirst') : t('servo-wizard:servoWizard.fineTuneServos')}
          >
            {t('servo-wizard:servoWizard.tune')}
          </button>
        </div>

        {/* Right side: Step indicators (wizard) or Live status (tune) */}
        {viewMode === 'wizard' ? (
          <div className="flex items-center">
            {STEPS.map((step, index) => {
              const info = STEP_INFO[step];
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              const isAccessible = canGoToStep(index);

              return (
                <div key={step} className="flex items-center">
                  <button
                    onClick={() => isAccessible && goToStep(step)}
                    disabled={!isAccessible}
                    className={`flex flex-col items-center gap-1 transition-all ${
                      isAccessible ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                    }`}
                    title={t(`servo-wizard:servoWizard.steps.${step}.description`)}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-blue-500 text-white ring-2 ring-blue-400/50 ring-offset-2 ring-offset-zinc-900'
                          : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-surface-raised text-content-secondary border border'
                      }`}
                    >
                      {isCompleted ? <Check className="w-4 h-4" /> : <info.icon className="w-4 h-4" />}
                    </div>
                    <span
                      className={`text-[10px] font-medium ${
                        isActive ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-content-secondary'
                      }`}
                    >
                      {t(`servo-wizard:servoWizard.steps.${step}.label`)}
                    </span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`w-8 h-0.5 mx-1 ${
                        index < currentStepIndex ? 'bg-green-500' : 'bg-surface-raised'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-xl">{selectedPreset?.icon}</span>
            <div>
              <span className="text-sm font-medium text-content">{selectedPreset ? t(selectedPreset.nameKey) : null}</span>
              <span className="text-xs text-content-secondary ml-2">{t('servo-wizard:servoWizard.servoCount', { count: assignments.length })}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Render Tune view
  if (viewMode === 'tune') {
    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <ServoTuningView />
      </div>
    );
  }

  // Render Wizard view
  return (
    <div className="flex flex-col h-full">
      {renderHeader()}

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">{renderStep()}</div>
      </div>
    </div>
  );
}

/**
 * Inline version of the wizard for embedding in tabs (replaces ServoMixerTab)
 */
export function ServoWizardInline() {
  const { openWizard, reset } = useServoWizardStore();

  // Initialize wizard when component mounts, cleanup on unmount
  useEffect(() => {
    openWizard();
    return () => {
      reset();
    };
  }, [openWizard, reset]);

  return (
    <div className="h-full">
      <ServoWizard />
    </div>
  );
}
