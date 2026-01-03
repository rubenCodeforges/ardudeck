/**
 * ServoBar
 *
 * Visual bar showing live servo position with min/max/center markers.
 * Used in test and calibration steps.
 */

interface ServoBarProps {
  value: number;          // Current servo position (us)
  min?: number;           // Minimum PWM (default 1000)
  max?: number;           // Maximum PWM (default 2000)
  center?: number;        // Center position (default 1500)
  showLabels?: boolean;   // Show min/max/center labels
  color?: string;         // Bar color (default blue)
  height?: number;        // Bar height in pixels (default 24)
}

export default function ServoBar({
  value,
  min = 1000,
  max = 2000,
  center = 1500,
  showLabels = true,
  color = '#3B82F6',
  height = 24,
}: ServoBarProps) {
  // Calculate percentages for positioning
  const range = 2500 - 500; // Full PWM range (500-2500)
  const toPercent = (v: number) => ((v - 500) / range) * 100;

  const minPercent = toPercent(min);
  const maxPercent = toPercent(max);
  const centerPercent = toPercent(center);
  const valuePercent = toPercent(Math.max(500, Math.min(2500, value)));

  // Determine if value is within configured range
  const inRange = value >= min && value <= max;

  return (
    <div className="relative" style={{ height: height + (showLabels ? 20 : 0) }}>
      {/* Background track */}
      <div
        className="absolute w-full bg-zinc-800 rounded-full overflow-hidden"
        style={{ height }}
      >
        {/* Active range highlight */}
        <div
          className="absolute h-full bg-zinc-700"
          style={{
            left: `${minPercent}%`,
            width: `${maxPercent - minPercent}%`,
          }}
        />

        {/* Center marker */}
        <div
          className="absolute w-0.5 h-full bg-green-500/50"
          style={{ left: `${centerPercent}%` }}
        />

        {/* Min marker */}
        <div
          className="absolute w-0.5 h-full bg-zinc-500"
          style={{ left: `${minPercent}%` }}
        />

        {/* Max marker */}
        <div
          className="absolute w-0.5 h-full bg-zinc-500"
          style={{ left: `${maxPercent}%` }}
        />

        {/* Current value indicator */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 transition-all duration-75"
          style={{
            left: `${valuePercent}%`,
            marginLeft: -6,
            backgroundColor: inRange ? color : '#EF4444',
            borderColor: inRange ? color : '#EF4444',
            boxShadow: `0 0 8px ${inRange ? color : '#EF4444'}`,
          }}
        />
      </div>

      {/* Labels - positioned within bounds */}
      {showLabels && (
        <div
          className="absolute w-full text-[10px] text-zinc-500 px-1"
          style={{ top: height + 4 }}
        >
          <span className="absolute left-0">{min}</span>
          <span className="absolute left-1/2 -translate-x-1/2 text-green-500/70">{center}</span>
          <span className="absolute right-0">{max}</span>
        </div>
      )}

      {/* Current value display */}
      <div
        className="absolute text-xs font-mono"
        style={{
          top: height / 2 - 8,
          left: `${valuePercent}%`,
          transform: 'translateX(-50%) translateY(-100%)',
          marginTop: -4,
          color: inRange ? color : '#EF4444',
        }}
      >
        {value} µs
      </div>
    </div>
  );
}
