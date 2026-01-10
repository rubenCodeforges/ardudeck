/**
 * RangeSlider
 *
 * Draggable range editor with:
 * - Two handles for start/end
 * - Snaps to 25us increments (MSP step size)
 * - Live RC value indicator
 * - Zone indicators (LOW/MID/HIGH)
 * - Scale markers
 */

import React, { useCallback, useRef, useState } from 'react';
import { PWM, pwmToStep, stepToPwm } from '../presets/mode-presets';

interface RangeSliderProps {
  rangeStart: number;
  rangeEnd: number;
  rcValue?: number;
  onChange: (start: number, end: number) => void;
  disabled?: boolean;
}

// Scale markers for the slider
const SCALE_MARKERS = [
  { value: 900, label: '900' },
  { value: 1200, label: '1200' },
  { value: 1500, label: '1500' },
  { value: 1800, label: '1800' },
  { value: 2100, label: '2100' },
];

// Zone definitions for visual indicators
const ZONES = [
  { start: 900, end: 1300, label: 'LOW', color: 'bg-blue-500/10' },
  { start: 1300, end: 1700, label: 'MID', color: 'bg-purple-500/10' },
  { start: 1700, end: 2100, label: 'HIGH', color: 'bg-orange-500/10' },
];

export const RangeSlider: React.FC<RangeSliderProps> = ({
  rangeStart,
  rangeEnd,
  rcValue,
  onChange,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | 'range' | null>(null);

  // Use refs for drag state to avoid React closure bugs
  const dragRef = useRef({ startX: 0, startVal: 0, endVal: 0 });

  // Snap to 25us increments
  const snapToStep = (pwm: number): number => {
    const step = pwmToStep(pwm);
    return stepToPwm(Math.round(step));
  };

  // Calculate positions as percentages
  const pwmToPercent = (value: number) =>
    ((value - PWM.MIN) / (PWM.MAX - PWM.MIN)) * 100;

  const startPercent = pwmToPercent(rangeStart);
  const endPercent = pwmToPercent(rangeEnd);
  const rcPercent = rcValue !== undefined ? pwmToPercent(rcValue) : null;
  const isActive = rcValue !== undefined && rcValue >= rangeStart && rcValue <= rangeEnd;

  // Account for container padding (px-3 = 12px on each side)
  const CONTAINER_PADDING = 12;

  const handleMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'range') => {
    if (disabled) return;
    e.preventDefault();
    setDragging(type);

    // Store in ref - no closure issues
    dragRef.current = {
      startX: e.clientX,
      startVal: rangeStart,
      endVal: rangeEnd,
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      // Calculate based on the inner track width (excluding padding)
      const trackWidth = rect.width - (CONTAINER_PADDING * 2);

      // Read from ref - always has current values
      const { startX, startVal, endVal } = dragRef.current;
      const deltaPercent = (e.clientX - startX) / trackWidth;
      const deltaPwm = deltaPercent * (PWM.MAX - PWM.MIN);

      if (type === 'start') {
        let newStart = snapToStep(startVal + deltaPwm);
        newStart = Math.max(PWM.MIN, Math.min(endVal - 50, newStart));
        onChange(newStart, endVal);
      } else if (type === 'end') {
        let newEnd = snapToStep(endVal + deltaPwm);
        newEnd = Math.max(startVal + 50, Math.min(PWM.MAX, newEnd));
        onChange(startVal, newEnd);
      } else if (type === 'range') {
        const rangeWidth = endVal - startVal;
        let newStart = snapToStep(startVal + deltaPwm);
        let newEnd = newStart + rangeWidth;

        if (newStart < PWM.MIN) {
          newStart = PWM.MIN;
          newEnd = PWM.MIN + rangeWidth;
        }
        if (newEnd > PWM.MAX) {
          newEnd = PWM.MAX;
          newStart = PWM.MAX - rangeWidth;
        }

        onChange(newStart, newEnd);
      }
    };

    const handleMouseUp = () => {
      setDragging(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Quick position buttons
  const setPosition = (position: 'low' | 'mid' | 'high' | 'always') => {
    if (disabled) return;
    switch (position) {
      case 'low':
        onChange(PWM.LOW.start, PWM.LOW.end);
        break;
      case 'mid':
        onChange(PWM.MID.start, PWM.MID.end);
        break;
      case 'high':
        onChange(PWM.HIGH.start, PWM.HIGH.end);
        break;
      case 'always':
        onChange(PWM.ALWAYS.start, PWM.ALWAYS.end);
        break;
    }
  };

  // Check if current range matches a preset
  const isPreset = (preset: 'low' | 'mid' | 'high' | 'always') => {
    const presetRange = {
      low: PWM.LOW,
      mid: PWM.MID,
      high: PWM.HIGH,
      always: PWM.ALWAYS,
    }[preset];
    return rangeStart === presetRange.start && rangeEnd === presetRange.end;
  };

  return (
    <div className="space-y-3">
      {/* Quick position buttons with labels */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wide font-medium">Switch Position</span>
          <span className="text-[10px] text-zinc-600">Click to set range</span>
        </div>
        <div className="flex gap-1.5">
          {(['low', 'mid', 'high', 'always'] as const).map((preset) => {
            const isSelected = isPreset(preset);
            const isAlways = preset === 'always';
            const hints: Record<string, string> = {
              low: 'Switch DOWN',
              mid: 'Switch MID',
              high: 'Switch UP',
              always: 'Always ON',
            };
            return (
              <button
                key={preset}
                onClick={() => setPosition(preset)}
                disabled={disabled}
                title={hints[preset]}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all duration-200 flex flex-col items-center gap-0.5 ${
                  isSelected
                    ? isAlways
                      ? 'bg-green-500/20 border-2 border-green-500/60 text-green-300 shadow-sm shadow-green-500/20'
                      : 'bg-blue-500/20 border-2 border-blue-500/60 text-blue-300 shadow-sm shadow-blue-500/20'
                    : 'bg-zinc-800/80 border-2 border-zinc-700/50 text-zinc-400 hover:bg-zinc-700/80 hover:border-zinc-600 hover:text-zinc-300'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span>{preset.toUpperCase()}</span>
                <span className={`text-[9px] ${isSelected ? '' : 'text-zinc-500'}`}>{hints[preset]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Slider container - with padding for handles */}
      <div
        ref={containerRef}
        className={`relative h-14 bg-zinc-900 rounded-xl border border-zinc-700/50 px-3 ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {/* Inner track area - this is where percentage calculations apply */}
        <div className="relative h-full">
          {/* Zone indicators (LOW/MID/HIGH backgrounds) */}
          {ZONES.map((zone) => (
            <div
              key={zone.label}
              className={`absolute top-0 bottom-0 ${zone.color} border-r border-zinc-700/30 first:rounded-l last:rounded-r`}
              style={{
                left: `${pwmToPercent(zone.start)}%`,
                width: `${pwmToPercent(zone.end) - pwmToPercent(zone.start)}%`,
              }}
            >
              <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-medium text-zinc-600 uppercase tracking-wider">
                {zone.label}
              </span>
            </div>
          ))}

          {/* Track */}
          <div className="absolute inset-x-0 top-1/2 h-1.5 bg-zinc-700/50 rounded-full -translate-y-1/2" />

          {/* Active range (draggable) */}
          <div
            className={`absolute top-1/2 h-3 rounded-full -translate-y-1/2 cursor-grab transition-colors ${
              isActive
                ? 'bg-gradient-to-r from-green-500 to-green-400 shadow-lg shadow-green-500/30'
                : 'bg-gradient-to-r from-blue-500 to-blue-400 shadow-lg shadow-blue-500/30'
            } ${dragging === 'range' ? 'cursor-grabbing' : ''}`}
            style={{
              left: `${startPercent}%`,
              width: `${endPercent - startPercent}%`,
            }}
            onMouseDown={(e) => handleMouseDown(e, 'range')}
          />

          {/* Start handle */}
          <div
            className={`absolute top-1/2 w-4 h-9 rounded-full -translate-y-1/2 -translate-x-1/2 cursor-ew-resize z-10 ${
              dragging === 'start'
                ? 'scale-110 bg-white shadow-xl shadow-black/30'
                : 'bg-gradient-to-b from-zinc-200 to-zinc-300 hover:from-white hover:to-zinc-200 hover:scale-105 shadow-lg shadow-black/20'
            } border-2 border-zinc-400/50 ${
              dragging ? '' : 'transition-[transform,background,box-shadow] duration-150'
            }`}
            style={{ left: `${startPercent}%` }}
            onMouseDown={(e) => handleMouseDown(e, 'start')}
          >
            {/* Grip lines */}
            <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
              <div className="h-px bg-zinc-400/60 rounded-full" />
              <div className="h-px bg-zinc-400/60 rounded-full" />
              <div className="h-px bg-zinc-400/60 rounded-full" />
            </div>
          </div>

          {/* End handle */}
          <div
            className={`absolute top-1/2 w-4 h-9 rounded-full -translate-y-1/2 -translate-x-1/2 cursor-ew-resize z-10 ${
              dragging === 'end'
                ? 'scale-110 bg-white shadow-xl shadow-black/30'
                : 'bg-gradient-to-b from-zinc-200 to-zinc-300 hover:from-white hover:to-zinc-200 hover:scale-105 shadow-lg shadow-black/20'
            } border-2 border-zinc-400/50 ${
              dragging ? '' : 'transition-[transform,background,box-shadow] duration-150'
            }`}
            style={{ left: `${endPercent}%` }}
            onMouseDown={(e) => handleMouseDown(e, 'end')}
          >
            {/* Grip lines */}
            <div className="absolute inset-x-1 top-1/2 -translate-y-1/2 flex flex-col gap-0.5">
              <div className="h-px bg-zinc-400/60 rounded-full" />
              <div className="h-px bg-zinc-400/60 rounded-full" />
              <div className="h-px bg-zinc-400/60 rounded-full" />
            </div>
          </div>

          {/* RC value indicator */}
          {rcPercent !== null && (
            <div
              className={`absolute top-2 bottom-5 w-0.5 z-20 ${
                isActive ? 'bg-yellow-400' : 'bg-yellow-600/70'
              }`}
              style={{ left: `${rcPercent}%` }}
            >
              {/* Arrow head */}
              <div
                className={`absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-l-transparent border-r-4 border-r-transparent border-t-[5px] ${
                  isActive ? 'border-t-yellow-400' : 'border-t-yellow-600/70'
                }`}
              />
              {/* Value tooltip */}
              <div
                className={`absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium whitespace-nowrap ${
                  isActive
                    ? 'bg-yellow-400 text-yellow-900'
                    : 'bg-zinc-700 text-zinc-300'
                }`}
              >
                {rcValue}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scale markers */}
      <div className="relative h-4 mx-3">
        {SCALE_MARKERS.map((marker) => (
          <div
            key={marker.value}
            className="absolute -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${pwmToPercent(marker.value)}%` }}
          >
            <div className="w-px h-1.5 bg-zinc-600" />
            <span className="text-[10px] text-zinc-500 font-mono">{marker.label}</span>
          </div>
        ))}
      </div>

      {/* Range values and legend */}
      <div className="space-y-2">
        <div className="flex justify-between items-center px-1">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Start:</span>
            <span className="px-2 py-0.5 bg-zinc-800 rounded font-mono text-sm text-zinc-200">{rangeStart}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">End:</span>
            <span className="px-2 py-0.5 bg-zinc-800 rounded font-mono text-sm text-zinc-200">{rangeEnd}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 pt-1 border-t border-zinc-800">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-gradient-to-b from-zinc-200 to-zinc-300 border border-zinc-400/50" />
            <span className="text-[10px] text-zinc-500">Drag handles</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-0.5 h-3 bg-yellow-400 rounded-full" />
            <span className="text-[10px] text-zinc-500">Your transmitter</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-2 rounded-full bg-gradient-to-r from-blue-500 to-blue-400" />
            <span className="text-[10px] text-zinc-500">Active range</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RangeSlider;
