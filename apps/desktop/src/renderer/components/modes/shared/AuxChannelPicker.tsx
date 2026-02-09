/**
 * AuxChannelPicker
 *
 * Dropdown for selecting AUX channel (AUX1-AUX4).
 * Shows live RC value next to each option.
 */

import React, { useState, useRef, useEffect } from 'react';
import { AUX_CHANNELS } from '../presets/mode-presets';

interface AuxChannelPickerProps {
  selected: number;
  onChange: (auxChannel: number) => void;
  rcChannels: number[];
  disabled?: boolean;
}

export const AuxChannelPicker: React.FC<AuxChannelPickerProps> = ({
  selected,
  onChange,
  rcChannels,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Get RC value for AUX channel (AUX1 = RC channel 5 = index 4)
  const getRcValue = (auxIndex: number) => rcChannels[auxIndex + 4] || 1500;

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedChannel = AUX_CHANNELS[selected];
  const currentRcValue = getRcValue(selected);

  return (
    <div ref={containerRef} className="relative">
      {/* Selected value button */}
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full px-4 py-3 bg-zinc-800 rounded-lg border ${
          isOpen ? 'border-blue-500' : 'border-zinc-700'
        } text-left transition-colors hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-medium text-zinc-200">{selectedChannel!.name}</div>
            <div className="text-xs text-zinc-500">{selectedChannel!.description}</div>
          </div>
          <div className="flex items-center gap-3">
            {/* Live RC value */}
            <div className="text-right">
              <div className="text-xs text-zinc-500">Current</div>
              <div className="font-mono text-sm text-yellow-400">{currentRcValue}</div>
            </div>
            {/* Dropdown arrow */}
            <svg
              className={`w-4 h-4 text-zinc-400 transition-transform ${
                isOpen ? 'rotate-180' : ''
              }`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl overflow-hidden">
          {AUX_CHANNELS.map((channel) => {
            const rcValue = getRcValue(channel.index);
            const isSelected = channel.index === selected;

            return (
              <button
                key={channel.index}
                onClick={() => {
                  onChange(channel.index);
                  setIsOpen(false);
                }}
                className={`w-full px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? 'bg-blue-500/20 border-l-2 border-blue-500'
                    : 'hover:bg-zinc-700 border-l-2 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div
                      className={`font-medium ${
                        isSelected ? 'text-blue-300' : 'text-zinc-200'
                      }`}
                    >
                      {channel.name}
                    </div>
                    <div className="text-xs text-zinc-500">{channel.description}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Live RC value with visual bar */}
                    <div className="w-20">
                      <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-500/60 transition-all duration-75"
                          style={{
                            width: `${((rcValue - 900) / 1200) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="w-12 text-right font-mono text-sm text-yellow-400">
                      {rcValue}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AuxChannelPicker;
