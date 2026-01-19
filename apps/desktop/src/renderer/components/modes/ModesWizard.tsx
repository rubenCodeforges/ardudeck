/**
 * ModesWizard
 *
 * Main wizard modal for configuring Betaflight/iNav flight modes.
 * Follows the same pattern as BootPadWizard.
 */

import React, { useEffect } from 'react';
import { useModesWizardStore } from '../../stores/modes-wizard-store';
import WelcomeStep from './steps/WelcomeStep';
import TransmitterCheckStep from './steps/TransmitterCheckStep';
import ModeConfigStep from './steps/ModeConfigStep';
import ReviewStep from './steps/ReviewStep';
import { Radio, Satellite, Settings, Save, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ModesWizardProps {
  isOpen: boolean;
  onClose: () => void;
}

// Step info for progress display
const STEPS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: 'welcome', label: 'Style', Icon: Radio },
  { id: 'transmitter', label: 'Check', Icon: Satellite },
  { id: 'mode-config', label: 'Configure', Icon: Settings },
  { id: 'review', label: 'Save', Icon: Save },
];

export const ModesWizard: React.FC<ModesWizardProps> = ({ isOpen, onClose }) => {
  const {
    currentStep,
    stopRcPolling,
    reset,
  } = useModesWizardStore();

  // Reset wizard state when opened
  useEffect(() => {
    if (!isOpen) {
      stopRcPolling();
    }
  }, [isOpen, stopRcPolling]);

  // Handle close
  const handleClose = () => {
    stopRcPolling();
    onClose();
  };

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  // Get current step index for progress
  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Modal container */}
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Modes Setup Wizard</h2>
              <p className="text-xs text-zinc-500">Configure your flight modes</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress indicator */}
        <div className="px-6 py-3 border-b border-zinc-800 bg-zinc-800/30">
          <div className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;

              return (
                <React.Fragment key={step.id}>
                  {/* Step indicator */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${
                        isCompleted
                          ? 'bg-green-500 text-white'
                          : isCurrent
                          ? 'bg-blue-500 text-white'
                          : 'bg-zinc-700 text-zinc-400'
                      }`}
                    >
                      {isCompleted ? (
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        <step.Icon className="w-4 h-4" />
                      )}
                    </div>
                    <span
                      className={`text-xs mt-1 ${
                        isCurrent ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-zinc-500'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>

                  {/* Connector line */}
                  {index < STEPS.length - 1 && (
                    <div className="flex-1 mx-2">
                      <div
                        className={`h-0.5 rounded ${
                          index < currentStepIndex ? 'bg-green-500' : 'bg-zinc-700'
                        }`}
                      />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">
          {currentStep === 'welcome' && <WelcomeStep />}
          {currentStep === 'transmitter' && <TransmitterCheckStep />}
          {currentStep === 'mode-config' && <ModeConfigStep />}
          {currentStep === 'review' && <ReviewStep />}
        </div>
      </div>
    </div>
  );
};

export default ModesWizard;
