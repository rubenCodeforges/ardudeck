/**
 * CalibrationResultCard - Display calibration results/offsets
 */

import { type CalibrationData, type CalibrationTypeId } from '../../../../shared/calibration-types';

interface CalibrationResultCardProps {
  data: CalibrationData;
  type: CalibrationTypeId;
}

export function CalibrationResultCard({ data, type }: CalibrationResultCardProps) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-5 border border-gray-700/50 space-y-4">
      {/* Accelerometer data */}
      {(type === 'accel-level' || type === 'accel-6point') && (
        <>
          {data.accZero && (
            <div>
              <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Accelerometer Zero Offset
              </h5>
              <div className="grid grid-cols-3 gap-3">
                <ValueBox label="X" value={data.accZero.x} />
                <ValueBox label="Y" value={data.accZero.y} />
                <ValueBox label="Z" value={data.accZero.z} />
              </div>
            </div>
          )}

          {data.accGain && (
            <div>
              <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Accelerometer Gain
              </h5>
              <div className="grid grid-cols-3 gap-3">
                <ValueBox label="X" value={data.accGain.x} />
                <ValueBox label="Y" value={data.accGain.y} />
                <ValueBox label="Z" value={data.accGain.z} />
              </div>
            </div>
          )}
        </>
      )}

      {/* Magnetometer data */}
      {type === 'compass' && (
        <>
          {data.magZero && (
            <div>
              <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Magnetometer Zero Offset
              </h5>
              <div className="grid grid-cols-3 gap-3">
                <ValueBox label="X" value={data.magZero.x} />
                <ValueBox label="Y" value={data.magZero.y} />
                <ValueBox label="Z" value={data.magZero.z} />
              </div>
            </div>
          )}

          {data.magGain && (
            <div>
              <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Magnetometer Gain
              </h5>
              <div className="grid grid-cols-3 gap-3">
                <ValueBox label="X" value={data.magGain.x} />
                <ValueBox label="Y" value={data.magGain.y} />
                <ValueBox label="Z" value={data.magGain.z} />
              </div>
            </div>
          )}

          {data.compassFitness !== undefined && (
            <div>
              <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
                Compass Fitness
              </h5>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      data.compassFitness < 10
                        ? 'bg-green-500'
                        : data.compassFitness < 20
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(100, data.compassFitness * 5)}%` }}
                  />
                </div>
                <span className={`text-sm font-mono ${
                  data.compassFitness < 10
                    ? 'text-green-400'
                    : data.compassFitness < 20
                      ? 'text-yellow-400'
                      : 'text-red-400'
                }`}>
                  {data.compassFitness.toFixed(2)}
                </span>
                <span className="text-xs text-gray-500">
                  ({data.compassFitness < 10 ? 'Excellent' : data.compassFitness < 20 ? 'Good' : 'Poor'})
                </span>
              </div>
            </div>
          )}
        </>
      )}

      {/* Optical flow data */}
      {type === 'opflow' && data.opflowScale !== undefined && (
        <div>
          <h5 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
            Optical Flow Scale
          </h5>
          <div className="bg-gray-900/50 rounded-lg px-4 py-3">
            <span className="text-2xl font-mono text-white">{data.opflowScale.toFixed(4)}</span>
          </div>
        </div>
      )}

      {/* Gyro - typically no calibration data to display */}
      {type === 'gyro' && (
        <div className="text-center py-4">
          <svg className="w-12 h-12 text-green-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-gray-400">Gyroscope calibrated successfully.</p>
          <p className="text-xs text-gray-500 mt-1">Bias offsets have been updated internally.</p>
        </div>
      )}
    </div>
  );
}

// Helper component for displaying values
function ValueBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-gray-900/50 rounded-lg px-3 py-2 text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="text-lg font-mono text-white">
        {typeof value === 'number' ? value.toFixed(0) : value}
      </div>
    </div>
  );
}
