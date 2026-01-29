/**
 * CalibrationCompleteStep - Shows calibration results
 *
 * Displays success/failure status, calibration data, and save option.
 * Auto-redirects to select screen after successful save.
 */

import { useEffect } from 'react';
import { useCalibrationStore } from '../../../stores/calibration-store';
import { CALIBRATION_TYPES } from '../../../../shared/calibration-types';
import { CalibrationResultCard } from '../shared/CalibrationResultCard';

export function CalibrationCompleteStep() {
  const {
    calibrationType,
    calibrationSuccess,
    calibrationData,
    error,
    isSaving,
    saveSuccess,
    saveError,
    setStep,
    saveCalibrationData,
    selectCalibrationType,
  } = useCalibrationStore();

  const calTypeInfo = calibrationType
    ? CALIBRATION_TYPES.find((t) => t.id === calibrationType)
    : null;

  const handleRecalibrate = () => {
    if (calibrationType) {
      selectCalibrationType(calibrationType);
    }
  };

  const handleStartNew = () => {
    setStep('select');
  };

  // Auto-redirect to select screen after successful save
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => {
        setStep('select');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess, setStep]);

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Success/Failure Banner */}
      <div className={`rounded-xl p-6 text-center ${
        calibrationSuccess
          ? 'bg-green-500/10 border border-green-500/30'
          : 'bg-red-500/10 border border-red-500/30'
      }`}>
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full mb-4 ${
          calibrationSuccess ? 'bg-green-500/20' : 'bg-red-500/20'
        }`}>
          {calibrationSuccess ? (
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </div>

        <h3 className={`text-xl font-semibold mb-2 ${
          calibrationSuccess ? 'text-green-400' : 'text-red-400'
        }`}>
          {calibrationSuccess ? 'Calibration Complete!' : 'Calibration Failed'}
        </h3>

        <p className="text-gray-400">
          {calibrationSuccess
            ? `${calTypeInfo?.name} calibration was successful.`
            : error || 'An error occurred during calibration. Please try again.'}
        </p>
      </div>

      {/* Calibration Results */}
      {calibrationSuccess && calibrationData && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-gray-300 uppercase tracking-wide">
            Calibration Results
          </h4>

          <CalibrationResultCard data={calibrationData} type={calibrationType!} />
        </div>
      )}

      {/* Save Error */}
      {saveError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
          <p className="text-red-400 text-sm">{saveError}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-4">
        <button
          onClick={handleStartNew}
          className="px-4 py-2.5 text-gray-400 hover:text-gray-300 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>

        <div className="flex gap-3">
          {!calibrationSuccess && (
            <button
              onClick={handleRecalibrate}
              className="px-4 py-2.5 bg-yellow-500/20 hover:bg-yellow-500/30 rounded-lg text-yellow-400 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>
          )}

          {calibrationSuccess && !saveSuccess && (
            <button
              onClick={saveCalibrationData}
              disabled={isSaving}
              className="px-6 py-2.5 bg-cyan-500 hover:bg-cyan-400 disabled:bg-cyan-500/50 disabled:cursor-not-allowed rounded-lg text-white font-medium transition-colors flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  Save to FC
                </>
              )}
            </button>
          )}

          {saveSuccess && (
            <div className="px-6 py-2.5 bg-green-500/20 rounded-lg text-green-400 font-medium flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved successfully
            </div>
          )}
        </div>
      </div>

      {/* Info note */}
      {calibrationSuccess && !saveSuccess && (
        <p className="text-center text-xs text-gray-500">
          Calibration data has been applied. Click "Save to FC" to persist changes to flash memory.
        </p>
      )}
      {saveSuccess && (
        <p className="text-center text-xs text-green-500/70">
          Calibration saved to flash memory. Returning to calibration menu...
        </p>
      )}
    </div>
  );
}
