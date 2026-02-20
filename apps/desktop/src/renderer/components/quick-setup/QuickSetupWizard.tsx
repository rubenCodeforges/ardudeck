/**
 * QuickSetupWizard
 *
 * Universal setup wizard that configures all flight controller systems at once:
 * - PIDs, Rates, Modes, Mixers, and Failsafe
 *
 * Supports both MSP boards (modern) and CLI boards (legacy).
 */

import React, { useEffect } from 'react';
import { useQuickSetupStore } from '../../stores/quick-setup-store';
import PresetSelectionStep from './steps/PresetSelectionStep';
import TransmitterCheckStep from './steps/TransmitterCheckStep';
import ConfigReviewStep from './steps/ConfigReviewStep';
import ApplyStep from './steps/ApplyStep';
import { Rocket, Target, Radio, ClipboardList, type LucideIcon } from 'lucide-react';

// Step info for progress display
const STEPS = [
  { id: 'welcome', label: 'Select', icon: Target },
  { id: 'transmitter', label: 'Check', icon: Radio },
  { id: 'review', label: 'Review', icon: ClipboardList },
  { id: 'apply', label: 'Apply', icon: Rocket },
] as const;

export const QuickSetupWizard: React.FC = () => {
  const {
    isOpen,
    currentStep,
    closeWizard,
    stopRcPolling,
  } = useQuickSetupStore();

  // Stop RC polling when closed
  useEffect(() => {
    if (!isOpen) {
      stopRcPolling();
    }
  }, [isOpen, stopRcPolling]);

  // Handle close
  const handleClose = () => {
    stopRcPolling();
    closeWizard();
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
      <div className="bg-zinc-900 rounded-2xl border border-zinc-700 shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-100">Quick Setup Wizard</h2>
              <p className="text-xs text-zinc-500">Configure everything in one go</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
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
                        <step.icon className="w-4 h-4" />
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
          {currentStep === 'welcome' && <PresetSelectionStep />}
          {currentStep === 'transmitter' && <TransmitterCheckStep />}
          {currentStep === 'review' && <ConfigReviewStep />}
          {currentStep === 'apply' && <ApplyStep />}
        </div>
      </div>
    </div>
  );
};

export default QuickSetupWizard;
