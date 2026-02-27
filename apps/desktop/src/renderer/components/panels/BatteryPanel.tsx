import { useTelemetryStore } from '../../stores/telemetry-store';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

function BatteryIcon({ percentage, voltage }: { percentage: number; voltage: number }) {
  const level = Math.max(0, Math.min(100, percentage));

  // Color based on level
  const fillColor = level > 30 ? '#10b981' : level > 15 ? '#f59e0b' : '#ef4444';
  const glowColor = level > 30 ? 'rgba(16, 185, 129, 0.3)' : level > 15 ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.3)';
  const textColor = level > 30 ? 'text-emerald-400' : level > 15 ? 'text-yellow-400' : 'text-red-400';

  // Calculate segments (show 4 segments)
  const segments = 4;
  const filledSegments = Math.ceil((level / 100) * segments);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Battery SVG */}
      <svg width="80" height="140" viewBox="0 0 80 140" className="drop-shadow-lg">
        {/* Glow effect */}
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          <linearGradient id="batteryGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={fillColor} stopOpacity="0.8"/>
            <stop offset="50%" stopColor={fillColor} stopOpacity="1"/>
            <stop offset="100%" stopColor={fillColor} stopOpacity="0.8"/>
          </linearGradient>
        </defs>

        {/* Battery terminal (top cap) */}
        <rect x="25" y="2" width="30" height="10" rx="3" fill="#4b5563" stroke="#6b7280" strokeWidth="1"/>

        {/* Battery body outline */}
        <rect x="10" y="12" width="60" height="120" rx="6" fill="#1f2937" stroke="#4b5563" strokeWidth="2"/>

        {/* Inner background */}
        <rect x="14" y="16" width="52" height="112" rx="4" fill="#0f172a"/>

        {/* Battery segments */}
        {[0, 1, 2, 3].map((i) => {
          const segmentHeight = 24;
          const segmentGap = 4;
          const yPos = 16 + 4 + (3 - i) * (segmentHeight + segmentGap);
          const isFilled = i < filledSegments;

          return (
            <rect
              key={i}
              x="18"
              y={yPos}
              width="44"
              height={segmentHeight}
              rx="2"
              fill={isFilled ? `url(#batteryGradient)` : '#1e293b'}
              filter={isFilled ? 'url(#glow)' : undefined}
              style={{
                transition: 'fill 0.3s ease-out',
              }}
            />
          );
        })}

        {/* Percentage text inside battery */}
        <text
          x="40"
          y="80"
          textAnchor="middle"
          fill={level >= 0 ? fillColor : '#6b7280'}
          fontSize="20"
          fontWeight="bold"
          fontFamily="monospace"
        >
          {level >= 0 ? `${level}%` : '—'}
        </text>
      </svg>

      {/* Voltage display below battery */}
      <div className="text-center">
        <span className={`text-3xl font-bold font-mono ${textColor}`}>
          {formatNumber(voltage, 1)}
        </span>
        <span className="text-gray-500 text-lg ml-1">V</span>
      </div>
    </div>
  );
}

export function BatteryPanel() {
  const battery = useTelemetryStore((s) => s.battery);

  const textColor = battery.remaining > 30 ? 'text-emerald-400' : battery.remaining > 15 ? 'text-yellow-400' : 'text-red-400';

  return (
    <PanelContainer className="flex flex-col items-center justify-center">
      <BatteryIcon percentage={battery.remaining} voltage={battery.voltage} />

      <div className="w-full mt-4 space-y-1">
        <StatRow label="Current" value={formatNumber(Math.abs(battery.current), 1)} unit="A" />
        {battery.remaining >= 0 && (
          <StatRow label="Remaining" value={battery.remaining} unit="%" />
        )}
      </div>
    </PanelContainer>
  );
}
