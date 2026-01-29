/**
 * CountdownTimer - Display countdown for timed calibrations
 */

interface CountdownTimerProps {
  seconds: number;
  total: number;
}

export function CountdownTimer({ seconds, total }: CountdownTimerProps) {
  const progress = total > 0 ? ((total - seconds) / total) * 100 : 0;
  const size = 160;
  const strokeWidth = 8;
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
          stroke="url(#countdown-gradient)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-1000 ease-linear"
        />
        <defs>
          <linearGradient id="countdown-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-white font-mono">
          {seconds}
        </span>
        <span className="text-xs text-gray-400 mt-1">seconds</span>
      </div>

      {/* Pulsing ring animation */}
      {seconds > 0 && (
        <div
          className="absolute inset-0 rounded-full animate-ping"
          style={{
            background: `radial-gradient(circle at center, rgba(6, 182, 212, 0.1) 0%, transparent 60%)`,
            animationDuration: '2s',
          }}
        />
      )}
    </div>
  );
}
