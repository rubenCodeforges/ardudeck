/**
 * TransmitterVisualizer
 *
 * Shows all RC channels (sticks + AUX) as live horizontal bars.
 * Used in the transmitter check step to verify connection.
 */

import React from 'react';
import { MoveHorizontal, MoveVertical, ArrowUp, RotateCw, ToggleRight, Radio } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface TransmitterVisualizerProps {
  rcChannels: number[];
  channelsDetected?: boolean[];
  compact?: boolean;
}

// Channel names in logical RPYT order (after rxMap reordering)
const CHANNEL_INFO: { name: string; nameKey?: string; Icon: LucideIcon; descriptionKey: string }[] = [
  { name: 'Roll', nameKey: 'common:roll', Icon: MoveHorizontal, descriptionKey: 'modes:transmitterVisualizer.leftHorizontal' },
  { name: 'Pitch', nameKey: 'common:pitch', Icon: MoveVertical, descriptionKey: 'modes:transmitterVisualizer.leftVertical' },
  { name: 'Yaw', nameKey: 'common:yaw', Icon: RotateCw, descriptionKey: 'modes:transmitterVisualizer.rightHorizontal' },
  { name: 'Throttle', nameKey: 'common:throttle', Icon: ArrowUp, descriptionKey: 'modes:transmitterVisualizer.rightVertical' },
  { name: 'AUX 1', Icon: ToggleRight, descriptionKey: 'modes:transmitterVisualizer.aux1' },
  { name: 'AUX 2', Icon: ToggleRight, descriptionKey: 'modes:transmitterVisualizer.aux2' },
  { name: 'AUX 3', Icon: ToggleRight, descriptionKey: 'modes:transmitterVisualizer.additionalSwitch' },
  { name: 'AUX 4', Icon: ToggleRight, descriptionKey: 'modes:transmitterVisualizer.additionalSwitch' },
];

export const TransmitterVisualizer: React.FC<TransmitterVisualizerProps> = ({
  rcChannels,
  channelsDetected = [],
  compact = false,
}) => {
  const { t } = useTranslation();
  // Calculate how many channels to show (at least 8, or all if more)
  const channelCount = Math.max(8, Math.min(rcChannels.length, 16));

  return (
    <div className={`space-y-${compact ? '2' : '3'}`}>
      {Array.from({ length: channelCount }).map((_, index) => {
        const value = rcChannels[index] || 1500;
        const info = CHANNEL_INFO[index] || {
          name: `CH ${index + 1}`,
          nameKey: undefined as string | undefined,
          Icon: Radio,
          descriptionKey: '',
        };
        const IconComponent = info.Icon;
        const isDetected = channelsDetected[index] || false;
        const isStick = index < 4;

        // Calculate bar position (900-2100 -> 0-100%)
        const percent = ((value - 900) / 1200) * 100;
        const clampedPercent = Math.max(0, Math.min(100, percent));

        // Center indicator for sticks
        const isCentered = isStick && Math.abs(value - 1500) < 50;

        return (
          <div
            key={index}
            className={`${
              compact ? 'py-1' : 'py-2'
            } ${isDetected ? 'animate-pulse' : ''}`}
          >
            <div className="flex items-center gap-3">
              {/* Channel label */}
              <div className={`${compact ? 'w-16' : 'w-20'} flex-shrink-0`}>
                <div className="flex items-center gap-1.5">
                  <IconComponent className={`${compact ? 'w-3 h-3' : 'w-4 h-4'} ${isDetected ? 'text-green-400' : 'text-content-secondary'}`} />
                  <span
                    className={`${compact ? 'text-xs' : 'text-sm'} font-medium ${
                      isDetected ? 'text-green-400' : 'text-content'
                    }`}
                  >
                    {info.nameKey ? t(info.nameKey) : info.name}
                  </span>
                </div>
              </div>

              {/* Bar container */}
              <div className="flex-1">
                <div
                  className={`relative ${
                    compact ? 'h-4' : 'h-6'
                  } bg-surface-inset rounded-full overflow-hidden`}
                >
                  {/* Center line for sticks */}
                  {isStick && (
                    <div
                      className="absolute top-0 bottom-0 w-px bg-surface-raised"
                      style={{ left: '50%' }}
                    />
                  )}

                  {/* Value bar */}
                  <div
                    className={`absolute top-0 bottom-0 transition-all duration-75 ${
                      isStick
                        ? // Sticks: grow from center
                          value >= 1500
                          ? 'bg-blue-500 left-1/2'
                          : 'bg-blue-500 right-1/2'
                        : // AUX channels: grow from left
                          'bg-purple-500 left-0'
                    }`}
                    style={
                      isStick
                        ? {
                            width: `${Math.abs(clampedPercent - 50)}%`,
                            [value >= 1500 ? 'left' : 'right']: '50%',
                          }
                        : { width: `${clampedPercent}%` }
                    }
                  />

                  {/* Value indicator dot */}
                  <div
                    className={`absolute top-1/2 w-3 h-3 rounded-full transform -translate-y-1/2 -translate-x-1/2 shadow-lg transition-all duration-75 ${
                      isDetected
                        ? 'bg-green-400 ring-2 ring-green-400/50'
                        : isCentered
                        ? 'bg-zinc-400'
                        : 'bg-yellow-400'
                    }`}
                    style={{ left: `${clampedPercent}%` }}
                  />
                </div>
              </div>

              {/* Value display */}
              <div
                className={`${
                  compact ? 'w-12 text-xs' : 'w-14 text-sm'
                } text-right font-mono ${
                  isDetected ? 'text-green-400' : 'text-content-secondary'
                }`}
              >
                {value}
              </div>
            </div>

            {/* Description (non-compact only) */}
            {!compact && info.descriptionKey && (
              <div className="ml-20 text-xs text-content-tertiary mt-0.5">
                {t(info.descriptionKey)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default TransmitterVisualizer;
