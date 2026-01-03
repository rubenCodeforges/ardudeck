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

type ViewMode = 'wizard' | 'tune';

const STEPS: WizardStep[] = ['aircraft', 'assign', 'test', 'endpoints', 'review'];

export default function ServoWizard() {
  const {
    currentStep,
    currentStepIndex,
    selectedPresetId,
    assignments,
    goToStep,
    servoSupported,
    isCheckingSupport,
    supportError,
    closeWizard,
  } = useServoWizardStore();

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
        <div className="text-6xl">🚫</div>
        <div>
          <h2 className="text-xl font-bold text-white mb-2">Servo Setup Not Available</h2>
          <p className="text-zinc-400">{supportError}</p>
        </div>
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

  // Render Tune view
  if (viewMode === 'tune') {
    return (
      <ServoTuningView onSwitchToWizard={() => setViewMode('wizard')} />
    );
  }

  // Render Wizard view
  return (
    <div className="flex flex-col h-full">
      {/* Mode toggle + Progress stepper */}
      <div className="bg-zinc-900/50 border-b border-zinc-800/50 px-6 py-4">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          {/* Mode toggle */}
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

          {/* Step indicators */}
          <div className="flex items-center">
            {STEPS.map((step, index) => {
              const info = STEP_INFO[step];
              const isActive = index === currentStepIndex;
              const isCompleted = index < currentStepIndex;
              const isAccessible = canGoToStep(index);

              return (
                <div key={step} className="flex items-center">
                  {/* Step indicator */}
                  <button
                    onClick={() => isAccessible && goToStep(step)}
                    disabled={!isAccessible}
                    className={`flex flex-col items-center gap-1 transition-all ${
                      isAccessible ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
                    }`}
                    title={info.description}
                  >
                    {/* Circle with number/icon */}
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
                    {/* Label */}
                    <span
                      className={`text-[10px] font-medium ${
                        isActive ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-zinc-500'
                      }`}
                    >
                      {info.label}
                    </span>
                  </button>

                  {/* Connector line */}
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
        </div>
      </div>

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
