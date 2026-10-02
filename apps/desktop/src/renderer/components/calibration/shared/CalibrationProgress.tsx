/**
 * CalibrationProgress - Circular progress indicator
 */

import { useTranslation } from 'react-i18next';

interface CalibrationProgressProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
  /**
   * The vehicle has not reported a percentage (yet). Renders a spinning arc
   * with a label instead of a misleading "0%", synchronous calibrations
   * (ArduPilot level/gyro) finish without ever reporting one.
   */
  indeterminate?: boolean;
  /** Label under the center value; defaults to Calibrating/Complete. */
  label?: string;
}

export function CalibrationProgress({
  progress,
  size = 160,
  strokeWidth = 8,
  indeterminate = false,
  label,
}: CalibrationProgressProps) {
  const { t } = useTranslation();
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  if (indeterminate) {
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="absolute top-0 left-0" width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-content-tertiary"
          />
        </svg>
        <svg
          className="absolute top-0 left-0 animate-spin"
          style={{ animationDuration: '1.4s' }}
          width={size}
          height={size}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="url(#calGradientIndet)"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * 0.75}
          />
          <defs>
            <linearGradient id="calGradientIndet" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#06b6d4" />
              <stop offset="100%" stopColor="#3b82f6" />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-sm font-medium text-content text-center px-4">
            {label ?? t('calibration:calibrationProgress.calibrating')}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Background circle */}
      <svg className="absolute top-0 left-0" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-content-tertiary"
        />
      </svg>

      {/* Progress circle */}
      <svg
        className="absolute top-0 left-0 -rotate-90"
        width={size}
        height={size}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="url(#gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-300 ease-out"
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-content">
          {Math.round(progress)}%
        </span>
        <span className="text-xs text-content-secondary mt-1">
          {label ?? (progress < 100 ? t('calibration:calibrationProgress.calibrating') : t('calibration:calibrationProgress.complete'))}
        </span>
      </div>

      {/* Animated glow effect when in progress */}
      {progress > 0 && progress < 100 && (
        <div
          className="absolute inset-0 rounded-full animate-pulse"
          style={{
            background: `radial-gradient(circle at center, rgba(6, 182, 212, 0.1) 0%, transparent 70%)`,
          }}
        />
      )}
    </div>
  );
}
