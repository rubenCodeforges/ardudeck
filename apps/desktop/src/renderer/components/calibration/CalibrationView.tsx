/**
 * CalibrationView - Sensor Calibration Screen
 *
 * Full-screen view for calibrating flight controller sensors.
 * Supports MSP (iNav/Betaflight) and MAVLink (ArduPilot) protocols.
 */

import { useEffect } from 'react';
import { useCalibrationStore } from '../../stores/calibration-store';
import { CalibrationHeader } from './CalibrationHeader';
import { SelectCalibrationStep } from './steps/SelectCalibrationStep';
import { PrepareCalibrationStep } from './steps/PrepareCalibrationStep';
import { CalibratingStep } from './steps/CalibratingStep';
import { CalibrationCompleteStep } from './steps/CalibrationCompleteStep';

export function CalibrationView() {
  const { currentStep, open } = useCalibrationStore();

  // Initialize calibration state when view mounts
  useEffect(() => {
    open();
  }, [open]);

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-gray-900/50 via-gray-900/30 to-gray-800/50">
      {/* Header */}
      <CalibrationHeader />

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {currentStep === 'select' && <SelectCalibrationStep />}
          {currentStep === 'prepare' && <PrepareCalibrationStep />}
          {currentStep === 'calibrating' && <CalibratingStep />}
          {currentStep === 'complete' && <CalibrationCompleteStep />}
        </div>
      </div>
    </div>
  );
}

export default CalibrationView;
