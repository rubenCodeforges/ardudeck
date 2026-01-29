/**
 * CalibrationHeader - Header for the calibration wizard
 *
 * Shows title, protocol badge, step indicator, and close button.
 */

import { useCalibrationStore } from '../../stores/calibration-store';
import { CALIBRATION_TYPES, type CalibrationStep } from '../../../shared/calibration-types';

const STEPS: { id: CalibrationStep; label: string }[] = [
  { id: 'select', label: 'Select' },
  { id: 'prepare', label: 'Prepare' },
  { id: 'calibrating', label: 'Calibrate' },
  { id: 'complete', label: 'Complete' },
];

export function CalibrationHeader() {
  const { currentStep, calibrationType, protocol, fcVariant } = useCalibrationStore();

  const calTypeInfo = calibrationType
    ? CALIBRATION_TYPES.find((t) => t.id === calibrationType)
    : null;

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <div className="flex-shrink-0 border-b border-gray-700/50 p-4">
      <div className="flex items-center justify-between">
        {/* Title and Protocol Badge */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
            <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-white">
              {calTypeInfo ? calTypeInfo.name : 'Calibration'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              {/* FC variant badge - show variant name, or protocol as fallback */}
              {(fcVariant || protocol) && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  protocol === 'msp'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-green-500/20 text-green-400'
                }`}>
                  {fcVariant || protocol?.toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center gap-2">
          {STEPS.map((step, index) => {
            const isActive = index === currentStepIndex;
            const isCompleted = index < currentStepIndex;
            const isDisabled = !calibrationType && index > 0;

            return (
              <div key={step.id} className="flex items-center">
                {/* Step circle */}
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-cyan-500 text-white'
                      : isCompleted
                        ? 'bg-cyan-500/30 text-cyan-400'
                        : isDisabled
                          ? 'bg-gray-800 text-gray-600'
                          : 'bg-gray-700 text-gray-400'
                  }`}
                >
                  {isCompleted ? (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>

                {/* Step label (visible on hover or active) */}
                <span className={`ml-1.5 text-xs hidden sm:block ${
                  isActive ? 'text-cyan-400' : isCompleted ? 'text-gray-400' : 'text-gray-600'
                }`}>
                  {step.label}
                </span>

                {/* Connector line */}
                {index < STEPS.length - 1 && (
                  <div className={`w-4 h-0.5 mx-2 ${
                    isCompleted ? 'bg-cyan-500/30' : 'bg-gray-700'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
