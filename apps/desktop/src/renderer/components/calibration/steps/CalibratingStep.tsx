/**
 * CalibratingStep - Active calibration display
 *
 * Shows progress, countdown timer, and position indicators during calibration.
 */

import { useCalibrationStore } from '../../../stores/calibration-store';
import { CALIBRATION_TYPES, ACCEL_6POINT_POSITIONS } from '../../../../shared/calibration-types';
import { CalibrationProgress } from '../shared/CalibrationProgress';
import { PositionDiagram } from '../shared/PositionDiagram';
import { CountdownTimer } from '../shared/CountdownTimer';

export function CalibratingStep() {
  const {
    calibrationType,
    progress,
    statusText,
    currentPosition,
    positionStatus,
    countdown,
    compassProgress,
    confirmPosition,
    cancelCalibration,
  } = useCalibrationStore();

  const calTypeInfo = calibrationType
    ? CALIBRATION_TYPES.find((t) => t.id === calibrationType)
    : null;

  if (!calibrationType || !calTypeInfo) {
    return null;
  }

  // For 6-point calibration, check if current position is done and waiting for user
  const isWaitingForConfirm = calibrationType === 'accel-6point' && !positionStatus[currentPosition];

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Calibration type header */}
      <div className="text-center">
        <h3 className="text-2xl font-semibold text-white mb-2">
          {calTypeInfo.name}
        </h3>
        <p className="text-gray-400">{statusText}</p>
      </div>

      {/* Main progress display */}
      <div className="flex justify-center py-8">
        {/* Countdown timer for timed calibrations */}
        {(calibrationType === 'compass' || calibrationType === 'opflow') && (
          <CountdownTimer seconds={countdown} total={calTypeInfo.estimatedDuration} />
        )}

        {/* Circular progress for simple calibrations */}
        {(calibrationType === 'accel-level' || calibrationType === 'gyro') && (
          <CalibrationProgress progress={progress} />
        )}

        {/* 6-point position display */}
        {calibrationType === 'accel-6point' && (
          <div className="w-full space-y-6">
            {/* Position diagram */}
            <div className="flex justify-center">
              <PositionDiagram position={currentPosition} isActive={true} />
            </div>

            {/* Position progress indicators */}
            <div className="flex justify-center gap-3">
              {positionStatus.map((done, index) => (
                <div
                  key={index}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                    done
                      ? 'bg-green-500/20 text-green-400 border border-green-500/50'
                      : index === currentPosition
                        ? 'bg-cyan-500/20 text-cyan-400 border-2 border-cyan-500 animate-pulse'
                        : 'bg-gray-800 text-gray-500 border border-gray-700'
                  }`}
                  title={ACCEL_6POINT_POSITIONS[index]}
                >
                  {done ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
              ))}
            </div>

            {/* Position name */}
            <p className="text-center text-lg text-white">
              Position {currentPosition + 1}: <span className="text-cyan-400">{ACCEL_6POINT_POSITIONS[currentPosition]}</span>
            </p>
          </div>
        )}
      </div>

      {/* Multi-compass progress (MAVLink) */}
      {compassProgress.length > 0 && (
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <h4 className="text-sm font-medium text-gray-300 mb-3">Compass Progress</h4>
          <div className="space-y-2">
            {compassProgress.map((prog, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20">Compass {index + 1}</span>
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 transition-all duration-300"
                    style={{ width: `${prog}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 w-10 text-right">{prog}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress bar for overall progress */}
      {calibrationType !== 'accel-6point' && (
        <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Progress</span>
            <span className="text-cyan-400">{Math.round(progress)}%</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-center gap-4 pt-4">
        {/* Confirm position button for 6-point */}
        {isWaitingForConfirm && (
          <button
            onClick={confirmPosition}
            className="px-6 py-3 bg-cyan-500 hover:bg-cyan-400 rounded-lg text-white font-medium transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Position Ready
          </button>
        )}

        {/* Cancel button */}
        <button
          onClick={cancelCalibration}
          className="px-4 py-2.5 bg-gray-700 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-gray-400 transition-colors flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>
      </div>

      {/* Instructions reminder */}
      <p className="text-center text-xs text-gray-500">
        {calibrationType === 'compass' && 'Keep rotating your vehicle in all directions...'}
        {calibrationType === 'accel-level' && 'Keep your vehicle still on the level surface...'}
        {calibrationType === 'accel-6point' && 'Hold the position steady, then click "Position Ready"'}
        {calibrationType === 'gyro' && 'Keep your vehicle completely still...'}
        {calibrationType === 'opflow' && 'Hold steady over the textured surface...'}
      </p>
    </div>
  );
}
