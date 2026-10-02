/**
 * QuickSetupWizard
 *
 * Universal setup wizard that configures all flight controller systems at once:
 * - PIDs, Rates, Modes, Mixers, and Failsafe
 *
 * Supports both MSP boards (modern) and CLI boards (legacy).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuickSetupStore } from '../../stores/quick-setup-store';
import PresetSelectionStep from './steps/PresetSelectionStep';
import TransmitterCheckStep from './steps/TransmitterCheckStep';
import ConfigReviewStep from './steps/ConfigReviewStep';
import ApplyStep from './steps/ApplyStep';
import { Rocket, Target, Radio, ClipboardList, type LucideIcon } from 'lucide-react';

// Step info for progress display
const STEPS = [
  { id: 'welcome', labelKey: 'quick-setup:wizard.stepSelect', icon: Target },
  { id: 'transmitter', labelKey: 'quick-setup:wizard.stepCheck', icon: Radio },
  { id: 'review', labelKey: 'quick-setup:wizard.stepReview', icon: ClipboardList },
  { id: 'apply', labelKey: 'quick-setup:wizard.stepApply', icon: Rocket },
] as const;

export const QuickSetupWizard: React.FC = () => {
  const { t } = useTranslation();
  const {
    isOpen,
    currentStep,
    closeWizard,
    stopRcPolling,
  } = useQuickSetupStore();

  // Close guard: past the first step, one Escape/X press arms the confirm, a second discards
  const [confirmClose, setConfirmClose] = useState(false);
  const confirmCloseTimer = useRef<number | null>(null);

  // Stop RC polling when closed
  useEffect(() => {
    if (!isOpen) {
      stopRcPolling();
      setConfirmClose(false);
    }
  }, [isOpen, stopRcPolling]);

  // Handle close
  const handleClose = useCallback(() => {
    if (currentStep !== 'welcome' && !confirmClose) {
      setConfirmClose(true);
      if (confirmCloseTimer.current) window.clearTimeout(confirmCloseTimer.current);
      confirmCloseTimer.current = window.setTimeout(() => setConfirmClose(false), 4000);
      return;
    }
    if (confirmCloseTimer.current) window.clearTimeout(confirmCloseTimer.current);
    setConfirmClose(false);
    stopRcPolling();
    closeWizard();
  }, [currentStep, confirmClose, stopRcPolling, closeWizard]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  // Get current step index for progress
  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {/* Modal container */}
      <div className="bg-surface-solid rounded-2xl border border shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-content">{t('quick-setup:wizard.title')}</h2>
              <p className="text-xs text-content-secondary">{t('quick-setup:wizard.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {confirmClose && (
              <span className="text-xs text-amber-400">{t('quick-setup:wizard.pressAgainToDiscard')}</span>
            )}
            <button
              onClick={handleClose}
              className={`p-2 rounded-lg transition-colors ${
                confirmClose
                  ? 'text-amber-400 bg-amber-500/20 hover:bg-amber-500/30'
                  : 'text-content-secondary hover:text-content hover:bg-surface-raised'
              }`}
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
        </div>

        {/* Progress indicator */}
        <div className="px-6 py-3 border-b border-subtle bg-surface">
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
                          : 'bg-surface-raised text-content-secondary'
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
                        isCurrent ? 'text-blue-400' : isCompleted ? 'text-green-400' : 'text-content-secondary'
                      }`}
                    >
                      {t(step.labelKey)}
                    </span>
                  </div>

                  {/* Connector line */}
                  {index < STEPS.length - 1 && (
                    <div className="flex-1 mx-2">
                      <div
                        className={`h-0.5 rounded ${
                          index < currentStepIndex ? 'bg-green-500' : 'bg-surface-raised'
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
