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
    setMixerChangeStatus({ type: 'info', message: 'Setting platform type to AIRPLANE...' });

    try {
      // Use the proper iNav platform type command (has CLI fallback built-in)
      setMixerChangeStatus({ type: 'info', message: 'Sending platform config (MSP2 + CLI fallback)...' });
      const success = await window.electronAPI.mspSetInavPlatformType(PLATFORM_TYPE.AIRPLANE);

      if (success) {
        // CLI fallback may have already rebooted the board
        // Wait and prompt to reconnect
        setMixerChangeStatus({ type: 'info', message: 'Platform change sent. Saving to EEPROM...' });

        // Try to save EEPROM (may fail if board already rebooting from CLI)
        try {
          await window.electronAPI.mspSaveEeprom();
          setMixerChangeStatus({ type: 'info', message: 'Rebooting board...' });
          await window.electronAPI.mspReboot();
          await new Promise(r => setTimeout(r, 1000));
        } catch {
          // Board may have already rebooted from CLI save command
          console.log('[ServoWizard] Board may have already rebooted from CLI');
        }

        // Disconnect
        setMixerChangeStatus({ type: 'info', message: 'Disconnecting...' });
        try {
          await window.electronAPI.disconnect();
        } catch {
          // Ignore disconnect errors
        }

        // Wait for board to reboot (F3 boards are slow)
        setMixerChangeStatus({ type: 'info', message: 'Waiting for board to reboot (5s)...' });
        await new Promise(r => setTimeout(r, 5000));

        // Show reconnect prompt
        setMixerChangeStatus({
          type: 'success',
          message: 'Platform changed to AIRPLANE! Reconnect to verify.',
        });
      } else {
        // Both MSP2 and CLI fallback failed
        setMixerChangeStatus({
          type: 'error',
          message: 'Failed to change platform. For iNav 2.0.0, try using iNav Configurator CLI: mixer AIRPLANE then save',
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setMixerChangeStatus({ type: 'error', message: `Failed: ${message}. Try iNav Configurator CLI.` });
    } finally {
      setIsChangingMixer(false);
    }
  };

  // Reconnect after mixer change
  const handleReconnect = async () => {
    setIsChangingMixer(true);
    setMixerChangeStatus({ type: 'info', message: 'Reconnecting...' });

    try {
      // Get the last connection settings and reconnect
      // For now, just prompt user to use the connection panel
      setMixerChangeStatus({
        type: 'info',
        message: 'Please use the connection panel to reconnect to your board.',
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
      <div className="flex flex-col items-center justify-center min-h-[400px] h-full gap-4 text-zinc-400">
        <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-sm">Checking servo support...</p>
      </div>
    );
  }

  // Show error if servos not supported
  if (!servoSupported) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 max-w-lg mx-auto text-center">
        <div className="text-6xl">{isMultirotor ? '🚁' : '🚫'}</div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2">
            {isMultirotor ? 'Board Configured as Multirotor' : 'Servo Setup Not Available'}
          </h2>
          <p className="text-zinc-400">{supportError}</p>
        </div>

        {/* Show conversion options if it's a multirotor */}
        {isMultirotor && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 w-full">
            <p className="text-sm text-blue-300 font-medium mb-3">
              Want to configure this board as a plane?
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
                    {mixerChangeStatus?.message || 'Configuring...'}
                  </>
                ) : (
                  <>Configure as Airplane</>
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
                <p className="text-xs text-zinc-400 mt-1">
                  Use the connection panel at the top to reconnect.
                </p>
              )}
            </div>

            <p className="text-xs text-zinc-500 mt-3">
              This will change the mixer type to AIRPLANE, save to EEPROM, and reboot the board.
            </p>

            {/* Warning for old firmware */}
            <div className="mt-3 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-xs text-yellow-400">
                <strong>Note:</strong> iNav 2.0.0 is very old. If this doesn't work, you may need to use
                iNav Configurator CLI: <code className="bg-black/30 px-1 rounded">mixer AIRPLANE</code> then <code className="bg-black/30 px-1 rounded">save</code>
              </p>
            </div>
          </div>
        )}

        <div className="bg-zinc-800/50 border border-zinc-700 rounded-xl p-4 text-left">
          <p className="text-sm text-zinc-300 font-medium mb-2">Servo Setup is used for:</p>
          <ul className="text-xs text-zinc-400 space-y-1 list-disc list-inside">
            <li><strong>Fixed-wing aircraft</strong> - ailerons, elevator, rudder</li>
            <li><strong>Flying wings</strong> - elevon mixing</li>
            <li><strong>Gimbal servos</strong> - camera pan/tilt (requires compatible board)</li>
          </ul>
        </div>
      </div>
    );
  }

  // Common header with mode toggle (consistent in both views)
  const renderHeader = () => (
    <div className="bg-zinc-900/50 border-b border-zinc-800/50 px-6 py-4">
      <div className="flex items-center justify-between max-w-3xl mx-auto">
        {/* Mode toggle - always in same position */}
        <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
          <button
            onClick={() => setViewMode('wizard')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'wizard'
                ? 'bg-blue-500 text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Wizard
          </button>
          <button
            onClick={() => setViewMode('tune')}
            disabled={!selectedPresetId || assignments.length === 0}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              viewMode === 'tune'
                ? 'bg-blue-500 text-white'
                : !selectedPresetId || assignments.length === 0
                ? 'text-zinc-600 cursor-not-allowed'
                : 'text-zinc-400 hover:text-white'
            }`}
            title={!selectedPresetId ? 'Complete wizard first' : 'Fine-tune servos'}
          >
            Tune
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
                    title={info.description}
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                        isActive
                          ? 'bg-blue-500 text-white ring-2 ring-blue-400/50 ring-offset-2 ring-offset-zinc-900'
                          : isCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      }`}
                    >
                      {isCompleted ? '✓' : info.icon}
                    </div>
                    <span
                      className={`text-[10px] font-medium ${
                        isActive ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-zinc-500'
                      }`}
                    >
                      {info.label}
                    </span>
                  </button>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`w-8 h-0.5 mx-1 ${
                        index < currentStepIndex ? 'bg-green-500' : 'bg-zinc-700'
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
              <span className="text-sm font-medium text-white">{selectedPreset?.name}</span>
              <span className="text-xs text-zinc-500 ml-2">- {assignments.length} servos</span>
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
