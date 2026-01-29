/**
 * CalibrationProgress - Circular progress indicator
 */

interface CalibrationProgressProps {
  progress: number; // 0-100
  size?: number;
  strokeWidth?: number;
}

export function CalibrationProgress({
  progress,
  size = 160,
  strokeWidth = 8,
}: CalibrationProgressProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

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
          className="text-gray-700"
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
        <span className="text-3xl font-bold text-white">
          {Math.round(progress)}%
        </span>
        <span className="text-xs text-gray-400 mt-1">
          {progress < 100 ? 'Calibrating...' : 'Complete'}
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
