import React, { useMemo, useRef, useState, useEffect } from 'react';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { PanelContainer, formatNumber } from './panel-utils';

// Exported for reuse in MapPanel - memoized to prevent unnecessary re-renders
export const AttitudeIndicator = React.memo(function AttitudeIndicator({ roll, pitch, heading, size = 200 }: { roll: number; pitch: number; heading: number; size?: number }) {
  // Clamp pitch but allow more range for display
  const clampedPitch = Math.max(-60, Math.min(60, pitch));

  // All dimensions proportional to size
  const scale = size / 200; // Base scale (200px is the reference size)
  const ringWidth = 30 * scale; // Compass ring width
  const innerSize = size - (ringWidth * 2);
  // Increase pitch sensitivity - move horizon by 40% of inner size at max pitch
  const pitchOffset = (clampedPitch / 60) * (innerSize * 0.4);

  // Compass tick marks - memoized since only scale affects geometry, heading only affects rotation
  const directions = ['N', 'E', 'S', 'W'];
  const compassTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i < 360; i += 10) {
      const isMajor = i % 30 === 0;
      const isCardinal = i % 90 === 0;
      const tickLength = (isCardinal ? 10 : isMajor ? 6 : 3) * scale;
      const tickStart = 18 * scale;

      ticks.push(
        <g key={i} transform={`rotate(${i - heading} ${size/2} ${size/2})`}>
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
    return ticks;
  }, [size, scale, heading]);

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
          {/* Sky - extends above visible area to prevent clipping */}
          <div
            className="absolute bg-gradient-to-b from-blue-600 to-blue-500"
            style={{
              left: 0,
              right: 0,
              top: -innerSize,
              height: innerSize * 1.5,
              transform: `translateY(${pitchOffset}px)`
            }}
          />
          {/* Ground - extends below visible area */}
          <div
            className="absolute bg-gradient-to-b from-amber-700 to-amber-800"
            style={{
              left: 0,
              right: 0,
              top: innerSize / 2,
              height: innerSize * 1.5,
              transform: `translateY(${pitchOffset}px)`
            }}
          />
          {/* Horizon line */}
          <div className="absolute left-0 right-0 bg-white/90" style={{ top: `calc(50% + ${pitchOffset}px)`, height: Math.max(1, 2 * scale) }} />
          {/* Pitch ladder marks */}
          {[-30, -20, -10, 10, 20, 30].map(p => (
            <div
              key={p}
              className="absolute left-1/4 right-1/4 bg-white/40"
              style={{
                top: `calc(50% + ${pitchOffset + (p / 60) * innerSize * 0.4}px)`,
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
});

export const AttitudePanel = React.memo(function AttitudePanel() {
  // Use selective subscriptions to prevent re-renders on unrelated telemetry updates
  const attitude = useTelemetryStore((s) => s.attitude);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);

  // Throttle updates to 5Hz max — SVG DOM manipulation is expensive and
  // attitude changes faster than ~5Hz are imperceptible on a small indicator
  const lastUpdateRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [throttled, setThrottled] = useState({ roll: attitude.roll, pitch: attitude.pitch, yaw: attitude.yaw, heading: vfrHud.heading });

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;
    if (elapsed >= 200) {
      lastUpdateRef.current = now;
      setThrottled({ roll: attitude.roll, pitch: attitude.pitch, yaw: attitude.yaw, heading: vfrHud.heading });
    } else if (!timerRef.current) {
      // Schedule an update for when the throttle window expires
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        lastUpdateRef.current = Date.now();
        setThrottled({ roll: attitude.roll, pitch: attitude.pitch, yaw: attitude.yaw, heading: vfrHud.heading });
      }, 200 - elapsed);
    }
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [attitude.roll, attitude.pitch, attitude.yaw, vfrHud.heading]);

  return (
    <PanelContainer className="flex flex-col items-center justify-center">
      <AttitudeIndicator
        roll={throttled.roll}
        pitch={throttled.pitch}
        heading={throttled.heading}
        size={200}
      />

      <div className="flex gap-6 mt-4 text-sm">
        <div className="text-center">
          <div className="text-gray-500 text-xs mb-0.5">Roll</div>
          <div className="font-mono text-white">{formatNumber(throttled.roll, 1)}°</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-xs mb-0.5">Pitch</div>
          <div className="font-mono text-white">{formatNumber(throttled.pitch, 1)}°</div>
        </div>
        <div className="text-center">
          <div className="text-gray-500 text-xs mb-0.5">Yaw</div>
          <div className="font-mono text-white">{formatNumber(throttled.yaw, 1)}°</div>
        </div>
      </div>
    </PanelContainer>
  );
});
