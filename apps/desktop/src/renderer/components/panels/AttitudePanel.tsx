import { useTelemetryStore } from '../../stores/telemetry-store';
import { PanelContainer, formatNumber } from './panel-utils';

// Exported for reuse in MapPanel
export function AttitudeIndicator({ roll, pitch, heading, size = 200 }: { roll: number; pitch: number; heading: number; size?: number }) {
  const clampedPitch = Math.max(-45, Math.min(45, pitch));

  // All dimensions proportional to size
  const scale = size / 200; // Base scale (200px is the reference size)
  const ringWidth = 30 * scale; // Compass ring width
  const innerSize = size - (ringWidth * 2);
  const pitchOffset = (clampedPitch / 45) * (innerSize / 4);

  // Compass tick marks
  const compassTicks = [];
  const directions = ['N', 'E', 'S', 'W'];
  for (let i = 0; i < 360; i += 10) {
    const isMajor = i % 30 === 0;
    const isCardinal = i % 90 === 0;
    const angle = i - heading;
    const tickLength = (isCardinal ? 10 : isMajor ? 6 : 3) * scale;
    const tickStart = 18 * scale; // Push ticks inward to make room for letters

    compassTicks.push(
      <g key={i} transform={`rotate(${angle} ${size/2} ${size/2})`}>
        <line
          x1={size/2}
          y1={tickStart}
          x2={size/2}
          y2={tickStart + tickLength}
          stroke={isCardinal ? '#fff' : isMajor ? '#9ca3af' : '#4b5563'}
          strokeWidth={isCardinal ? 2 : 1}
        />
        {isCardinal && (
          <text
            x={size/2}
            y={13 * scale}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#fff"
            fontSize={10 * scale}
            fontWeight="600"
          >
            {directions[i / 90]}
          </text>
        )}
      </g>
    );
  }

  // Aircraft symbol dimensions
  const aircraftDotSize = 12 * scale;
  const aircraftWingWidth = 64 * scale;
  const aircraftTailHeight = 24 * scale;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Compass ring */}
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={size/2} cy={size/2} r={size/2 - 2} fill="none" stroke="#374151" strokeWidth="1" />
        {compassTicks}
        {/* Heading marker triangle - positioned above the N */}
        <polygon
          points={`${size/2},${2*scale} ${size/2 - 5*scale},${8*scale} ${size/2 + 5*scale},${8*scale}`}
          fill="#f59e0b"
        />
      </svg>

      {/* Inner attitude indicator */}
      <div
        className="absolute rounded-full overflow-hidden border-2 border-gray-600"
        style={{ left: ringWidth, top: ringWidth, width: innerSize, height: innerSize }}
      >
        <div className="absolute inset-0" style={{ transform: `rotate(${-roll}deg)` }}>
          <div className="absolute inset-0 bg-gradient-to-b from-blue-600 to-blue-500" style={{ transform: `translateY(${pitchOffset}px)` }} />
          <div className="absolute inset-0 bg-gradient-to-b from-amber-700 to-amber-800" style={{ transform: `translateY(${innerSize / 2 + pitchOffset}px)` }} />
          <div className="absolute left-0 right-0 bg-white/90" style={{ top: `calc(50% + ${pitchOffset}px)`, height: Math.max(1, 2 * scale) }} />
          {[-20, -10, 10, 20].map(p => (
            <div
              key={p}
              className="absolute left-1/4 right-1/4 bg-white/40"
              style={{
                top: `calc(50% + ${pitchOffset + (p / 45) * innerSize / 4}px)`,
                height: Math.max(1, 1 * scale)
              }}
            />
          ))}
        </div>

        {/* Aircraft symbol */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="relative" style={{ width: aircraftWingWidth, height: aircraftTailHeight }}>
            {/* Center dot */}
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border-2 border-yellow-400 rounded-full bg-yellow-400/30"
              style={{ width: aircraftDotSize, height: aircraftDotSize }}
            />
            {/* Wings */}
            <div
              className="absolute top-1/2 left-0 right-0 -translate-y-1/2 bg-yellow-400"
              style={{ height: Math.max(2, 2 * scale) }}
            />
            {/* Tail */}
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 bg-yellow-400"
              style={{ width: Math.max(2, 2 * scale), height: aircraftTailHeight * 0.6, transform: 'translateX(-50%) translateY(-20%)' }}
            />
          </div>
        </div>
      </div>

      {/* Roll scale */}
      <svg className="absolute pointer-events-none" width={size} height={size}>
        {[-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60].map(angle => (
          <g key={angle} transform={`rotate(${angle} ${size/2} ${size/2})`}>
            <line
              x1={size/2}
              y1={ringWidth + 2 * scale}
              x2={size/2}
              y2={ringWidth + (angle % 30 === 0 ? 12 : 8) * scale}
              stroke="#9ca3af"
              strokeWidth={angle === 0 ? 2 : 1}
            />
          </g>
        ))}
        <g transform={`rotate(${roll} ${size/2} ${size/2})`}>
          <polygon
            points={`${size/2},${ringWidth} ${size/2 - 5*scale},${ringWidth + 10*scale} ${size/2 + 5*scale},${ringWidth + 10*scale}`}
            fill="#fff"
          />
        </g>
      </svg>
    </div>
  );
}

export function AttitudePanel() {
  const { attitude, vfrHud } = useTelemetryStore();

  return (
    <PanelContainer className="flex flex-col items-center justify-center">
      <AttitudeIndicator
        roll={attitude.roll}
        pitch={attitude.pitch}
        heading={vfrHud.heading}
        size={200}
      />

      <div className="flex gap-6 mt-4 text-sm">
        <div className="text-center">
          <div className="text-gray-500 text-xs mb-0.5">Roll</div>
          <div className="font-mono text-white">{formatNumber(attitude.roll, 1)}°</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-xs mb-0.5">Pitch</div>
          <div className="font-mono text-white">{formatNumber(attitude.pitch, 1)}°</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-xs mb-0.5">Yaw</div>
          <div className="font-mono text-white">{formatNumber(attitude.yaw, 1)}°</div>
        </div>
      </div>
    </PanelContainer>
  );
}
