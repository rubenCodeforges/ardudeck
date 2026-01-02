/**
 * RangeSlider
 *
 * Draggable range editor with:
 * - Two handles for start/end
 * - Snaps to 25us increments (MSP step size)
 * - Live RC value indicator
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

export const RangeSlider: React.FC<RangeSliderProps> = ({
  rangeStart,
  rangeEnd,
  rcValue,
  onChange,
  disabled = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'start' | 'end' | 'range' | null>(null);
  const [dragStartX, setDragStartX] = useState(0);
  const [dragStartValues, setDragStartValues] = useState({ start: 0, end: 0 });

  // Snap to 25us increments
  const snapToStep = (pwm: number): number => {
    const step = pwmToStep(pwm);
    return stepToPwm(Math.round(step));
  };

  // Convert pixel position to PWM value
  const pixelToPwm = useCallback((clientX: number): number => {
    if (!containerRef.current) return PWM.CENTER;
    const rect = containerRef.current.getBoundingClientRect();
    const percent = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round(PWM.MIN + percent * (PWM.MAX - PWM.MIN));
  }, []);

  // Calculate positions as percentages
  const pwmToPercent = (value: number) =>
    ((value - PWM.MIN) / (PWM.MAX - PWM.MIN)) * 100;

  const startPercent = pwmToPercent(rangeStart);
  const endPercent = pwmToPercent(rangeEnd);
  const rcPercent = rcValue !== undefined ? pwmToPercent(rcValue) : null;
  const isActive = rcValue !== undefined && rcValue >= rangeStart && rcValue <= rangeEnd;

  const handleMouseDown = (e: React.MouseEvent, type: 'start' | 'end' | 'range') => {
    if (disabled) return;
    e.preventDefault();
    setDragging(type);
    setDragStartX(e.clientX);
    setDragStartValues({ start: rangeStart, end: rangeEnd });

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const deltaPercent = (e.clientX - dragStartX) / rect.width;
      const deltaPwm = deltaPercent * (PWM.MAX - PWM.MIN);

      if (type === 'start') {
        let newStart = snapToStep(dragStartValues.start + deltaPwm);
        newStart = Math.max(PWM.MIN, Math.min(rangeEnd - 50, newStart));
        onChange(newStart, rangeEnd);
      } else if (type === 'end') {
        let newEnd = snapToStep(dragStartValues.end + deltaPwm);
        newEnd = Math.max(rangeStart + 50, Math.min(PWM.MAX, newEnd));
        onChange(rangeStart, newEnd);
      } else if (type === 'range') {
        const rangeWidth = dragStartValues.end - dragStartValues.start;
        let newStart = snapToStep(dragStartValues.start + deltaPwm);
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

  return (
    <div className="space-y-3">
      {/* Quick position buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => setPosition('low')}
          disabled={disabled}
          className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
            rangeStart === PWM.LOW.start && rangeEnd === PWM.LOW.end
              ? 'bg-blue-500/30 border border-blue-500/50 text-blue-300'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700'
          } disabled:opacity-50`}
        >
          LOW
        </button>
        <button
          onClick={() => setPosition('mid')}
          disabled={disabled}
          className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
            rangeStart === PWM.MID.start && rangeEnd === PWM.MID.end
              ? 'bg-blue-500/30 border border-blue-500/50 text-blue-300'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700'
          } disabled:opacity-50`}
        >
          MID
        </button>
        <button
          onClick={() => setPosition('high')}
          disabled={disabled}
          className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
            rangeStart === PWM.HIGH.start && rangeEnd === PWM.HIGH.end
              ? 'bg-blue-500/30 border border-blue-500/50 text-blue-300'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700'
          } disabled:opacity-50`}
        >
          HIGH
        </button>
        <button
          onClick={() => setPosition('always')}
          disabled={disabled}
          className={`flex-1 px-2 py-1.5 text-xs rounded-lg transition-colors ${
            rangeStart === PWM.ALWAYS.start && rangeEnd === PWM.ALWAYS.end
              ? 'bg-green-500/30 border border-green-500/50 text-green-300'
              : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700'
          } disabled:opacity-50`}
        >
          ALWAYS
        </button>
      </div>

      {/* Slider container */}
      <div
        ref={containerRef}
        className={`relative h-10 bg-zinc-800 rounded-lg overflow-visible ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {/* Track lines */}
        <div className="absolute inset-x-4 top-1/2 h-1 bg-zinc-700 rounded -translate-y-1/2" />

        {/* Active range (draggable) */}
        <div
          className={`absolute top-1/2 h-2 ${
            isActive ? 'bg-green-500' : 'bg-blue-500'
          } rounded -translate-y-1/2 cursor-grab ${
            dragging === 'range' ? 'cursor-grabbing' : ''
          }`}
          style={{
            left: `calc(${startPercent}% + 0.5rem)`,
            width: `calc(${endPercent - startPercent}%)`,
          }}
          onMouseDown={(e) => handleMouseDown(e, 'range')}
        />

        {/* Start handle */}
        <div
          className={`absolute top-1/2 w-4 h-8 rounded bg-zinc-300 border-2 border-zinc-500 shadow-lg -translate-y-1/2 -translate-x-1/2 cursor-ew-resize hover:bg-white hover:scale-110 transition-transform ${
            dragging === 'start' ? 'scale-110 bg-white' : ''
          }`}
          style={{ left: `calc(${startPercent}% + 0.5rem)` }}
          onMouseDown={(e) => handleMouseDown(e, 'start')}
        >
          <div className="absolute inset-1 flex flex-col justify-center gap-0.5">
            <div className="h-0.5 bg-zinc-400 rounded" />
            <div className="h-0.5 bg-zinc-400 rounded" />
          </div>
        </div>

        {/* End handle */}
        <div
          className={`absolute top-1/2 w-4 h-8 rounded bg-zinc-300 border-2 border-zinc-500 shadow-lg -translate-y-1/2 -translate-x-1/2 cursor-ew-resize hover:bg-white hover:scale-110 transition-transform ${
            dragging === 'end' ? 'scale-110 bg-white' : ''
          }`}
          style={{ left: `calc(${endPercent}% + 0.5rem)` }}
          onMouseDown={(e) => handleMouseDown(e, 'end')}
        >
          <div className="absolute inset-1 flex flex-col justify-center gap-0.5">
            <div className="h-0.5 bg-zinc-400 rounded" />
            <div className="h-0.5 bg-zinc-400 rounded" />
          </div>
        </div>

        {/* RC value indicator */}
        {rcPercent !== null && (
          <div
            className={`absolute top-0 bottom-0 w-0.5 ${
              isActive ? 'bg-yellow-400' : 'bg-yellow-600'
            } transition-all duration-75`}
            style={{ left: `calc(${rcPercent}% + 0.5rem)` }}
          >
            {/* Marker head */}
            <div
              className={`absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 ${
                isActive ? 'bg-yellow-400' : 'bg-yellow-600'
              }`}
            />
          </div>
        )}
      </div>

      {/* Range values */}
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">
          Start: <span className="font-mono text-zinc-200">{rangeStart}</span>
        </span>
        <span className="text-zinc-400">
          End: <span className="font-mono text-zinc-200">{rangeEnd}</span>
        </span>
      </div>
    </div>
  );
};

export default RangeSlider;
