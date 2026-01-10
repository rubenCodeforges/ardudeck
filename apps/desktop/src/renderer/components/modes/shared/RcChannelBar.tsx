/**
 * RcChannelBar
 *
 * Visual bar showing a PWM range (900-2100) with:
 * - Highlighted active range (green)
 * - Live RC value indicator (yellow marker)
 * - "ACTIVE" badge when RC value is within range
 */

import React from 'react';
import { PWM } from '../presets/mode-presets';

interface RcChannelBarProps {
  rangeStart: number;
  rangeEnd: number;
  rcValue: number;
  color?: string;
  showLabels?: boolean;
  compact?: boolean;
}

export const RcChannelBar: React.FC<RcChannelBarProps> = ({
  rangeStart,
  rangeEnd,
  rcValue,
  color = 'bg-blue-500',
  showLabels = true,
  compact = false,
}) => {
  // Calculate positions as percentages
  const rangeToPercent = (value: number) =>
    ((value - PWM.MIN) / (PWM.MAX - PWM.MIN)) * 100;

  const startPercent = rangeToPercent(rangeStart);
  const endPercent = rangeToPercent(rangeEnd);
  const rcPercent = rangeToPercent(Math.min(Math.max(rcValue, PWM.MIN), PWM.MAX));

  // Check if RC value is within the active range
  const isActive = rcValue >= rangeStart && rcValue <= rangeEnd;

  return (
    <div className={`${compact ? 'space-y-1' : 'space-y-2'}`}>
      {/* Range labels */}
      {showLabels && (
        <div className="flex justify-between text-xs text-zinc-500">
          <span>{PWM.MIN}</span>
          <span className="text-zinc-400">{rangeStart} - {rangeEnd}</span>
          <span>{PWM.MAX}</span>
        </div>
      )}

      {/* Bar container */}
      <div className={`relative ${compact ? 'h-4' : 'h-6'} bg-zinc-800 rounded-full overflow-hidden`}>
        {/* Active range highlight */}
        <div
          className={`absolute top-0 bottom-0 ${color} ${
            isActive ? 'opacity-80 shadow-lg' : 'opacity-40'
          } transition-opacity duration-150`}
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

        {/* Glow effect when active */}
        {isActive && (
          <div
            className={`absolute top-0 bottom-0 ${color} blur-sm opacity-50`}
            style={{
              left: `${startPercent}%`,
              width: `${endPercent - startPercent}%`,
            }}
          />
        )}

        {/* RC value marker */}
        <div
          className={`absolute top-0 bottom-0 w-1 ${
            isActive ? 'bg-yellow-400' : 'bg-yellow-500/50'
          } transform -translate-x-1/2 transition-all duration-75`}
          style={{ left: `${rcPercent}%` }}
        >
          {/* Marker glow */}
          {isActive && (
            <div className="absolute inset-0 bg-yellow-400 blur-sm opacity-60" />
          )}
        </div>

        {/* Center line indicator */}
        <div
          className="absolute top-0 bottom-0 w-px bg-zinc-600"
          style={{ left: '50%' }}
        />
      </div>

      {/* Status row */}
      <div className="flex justify-between items-center">
        <span className={`text-xs ${compact ? 'text-[10px]' : ''} text-zinc-500`}>
          RC: <span className="text-zinc-300 font-mono">{rcValue}</span>
        </span>
        {isActive ? (
          <span
            className={`${
              compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
            } bg-green-500/20 text-green-400 rounded-full font-medium animate-pulse`}
          >
            ACTIVE
          </span>
        ) : (
          <span
            className={`${
              compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-1'
            } bg-zinc-700/50 text-zinc-500 rounded-full`}
          >
            INACTIVE
          </span>
        )}
      </div>
    </div>
  );
};

export default RcChannelBar;
