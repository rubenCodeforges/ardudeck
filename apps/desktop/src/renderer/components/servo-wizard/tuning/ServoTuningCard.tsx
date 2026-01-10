/**
 * ServoTuningCard
 *
 * Visual card for fine-tuning a single servo.
 * Features live position bar, draggable endpoints, reverse toggle, and test buttons.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ControlSurfaceAssignment, CONTROL_SURFACE_INFO } from '../presets/servo-presets';

// Surface icons for visual flair
const SURFACE_ICONS: Record<string, string> = {
  aileron_left: '↙️',
  aileron_right: '↗️',
  elevator: '↕️',
  rudder: '↔️',
  elevon_left: '⬅️',
  elevon_right: '➡️',
  vtail_left: '↖️',
  vtail_right: '↗️',
  yaw_servo: '🔄',
  gimbal_pan: '↔️',
  gimbal_tilt: '↕️',
};

// Color palette for servos (consistent across diagram and cards)
const SERVO_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#84CC16', // lime
];

interface ServoTuningCardProps {
  assignment: ControlSurfaceAssignment;
  index: number;
  currentValue: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdateEndpoints: (endpoints: { min: number; center: number; max: number }) => void;
  onReverse: () => void;
  onTestPosition?: (position: 'min' | 'center' | 'max') => void;
  /** Valid servo range limits (old iNav: 750-2250, modern: 500-2500) */
  rangeLimits?: { min: number; max: number };
}

export default function ServoTuningCard({
  assignment,
  index,
  currentValue,
  isSelected,
  onSelect,
  onUpdateEndpoints,
  onReverse,
  onTestPosition,
  rangeLimits = { min: 500, max: 2500 },
}: ServoTuningCardProps) {
  const [dragging, setDragging] = useState<'min' | 'center' | 'max' | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const info = CONTROL_SURFACE_INFO[assignment.surface];
  const color = SERVO_COLORS[index % SERVO_COLORS.length];
  const icon = SURFACE_ICONS[assignment.surface] || '⚙️';

  const { min, center, max } = assignment;

  // Calculate range span for percentage conversion
  const rangeSpan = rangeLimits.max - rangeLimits.min;

  // Convert PWM to percentage (rangeLimits mapped to 0-100%)
  const toPercent = (v: number) => ((v - rangeLimits.min) / rangeSpan) * 100;
  const fromPercent = (p: number) => Math.round((p / 100) * rangeSpan + rangeLimits.min);
  const snap = (v: number) => Math.round(v / 10) * 10;

  const minPercent = toPercent(min);
  const centerPercent = toPercent(center);
  const maxPercent = toPercent(max);
  const valuePercent = toPercent(Math.max(rangeLimits.min, Math.min(rangeLimits.max, currentValue)));

  const inRange = currentValue >= min && currentValue <= max;

  // Handle mouse/touch drag
  const handlePointerDown = useCallback(
    (handle: 'min' | 'center' | 'max') => (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(handle);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging || !trackRef.current) return;

      const rect = trackRef.current.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      const value = snap(fromPercent(Math.max(0, Math.min(100, percent))));

      if (dragging === 'min') {
        const newMin = Math.min(value, center - 50);
        onUpdateEndpoints({ min: Math.max(rangeLimits.min, newMin), center, max });
      } else if (dragging === 'center') {
        const newCenter = Math.max(min + 50, Math.min(max - 50, value));
        onUpdateEndpoints({ min, center: newCenter, max });
      } else if (dragging === 'max') {
        const newMax = Math.max(value, center + 50);
        onUpdateEndpoints({ min, center, max: Math.min(rangeLimits.max, newMax) });
      }
    },
    [dragging, min, center, max, onUpdateEndpoints, rangeLimits]
  );

  const handlePointerUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Glow effect for selected card
  const glowStyle = isSelected
    ? { boxShadow: `0 0 0 2px ${color}40, 0 0 20px ${color}30` }
    : {};

  return (
    <div
      onClick={onSelect}
      className={`relative p-4 rounded-xl border-2 transition-all cursor-pointer ${
        isSelected
          ? 'border-opacity-100 bg-zinc-800/80'
          : 'border-zinc-700/50 bg-zinc-800/40 hover:border-zinc-600'
      }`}
      style={{
        borderColor: isSelected ? color : undefined,
        ...glowStyle,
      }}
    >
      {/* Header: Icon, Name, Servo number, Reverse button */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{icon}</span>
          <div>
            <div className="text-sm font-medium text-white">{info.name}</div>
            <div className="text-xs text-zinc-500">Servo {assignment.servoIndex}</div>
          </div>
        </div>

        {/* Reverse toggle */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReverse();
          }}
          className={`px-2 py-1 rounded-lg text-xs font-medium transition-all ${
            assignment.reversed
              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/50'
              : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600 border border-zinc-600'
          }`}
          title={assignment.reversed ? 'Servo reversed' : 'Click to reverse'}
        >
          {assignment.reversed ? '↔️ REV' : '↔️'}
        </button>
      </div>

      {/* Live position bar with draggable endpoints */}
      <div
        ref={trackRef}
        className="relative h-8 mb-2"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* Track background */}
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
          {/* Active range highlight */}
          <div
            className="absolute h-full rounded-full"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`,
              backgroundColor: `${color}30`,
            }}
          />
        </div>

        {/* Min handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-6 rounded cursor-ew-resize transition-transform ${
            dragging === 'min' ? 'scale-110' : 'hover:scale-105'
          }`}
          style={{
            left: `${minPercent}%`,
            marginLeft: -6,
            backgroundColor: '#52525b',
            border: '2px solid #71717a',
          }}
          onPointerDown={handlePointerDown('min')}
        />

        {/* Center handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-6 rounded cursor-ew-resize transition-transform ${
            dragging === 'center' ? 'scale-110' : 'hover:scale-105'
          }`}
          style={{
            left: `${centerPercent}%`,
            marginLeft: -6,
            backgroundColor: '#22c55e',
            border: '2px solid #4ade80',
          }}
          onPointerDown={handlePointerDown('center')}
        />

        {/* Max handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-6 rounded cursor-ew-resize transition-transform ${
            dragging === 'max' ? 'scale-110' : 'hover:scale-105'
          }`}
          style={{
            left: `${maxPercent}%`,
            marginLeft: -6,
            backgroundColor: '#52525b',
            border: '2px solid #71717a',
          }}
          onPointerDown={handlePointerDown('max')}
        />

        {/* Live position indicator */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all duration-75"
          style={{
            left: `${valuePercent}%`,
            marginLeft: -8,
            backgroundColor: inRange ? color : '#ef4444',
            boxShadow: `0 0 10px ${inRange ? color : '#ef4444'}`,
          }}
        />
      </div>

      {/* Value labels */}
      <div className="flex justify-between text-[10px] text-zinc-500 px-1 mb-3">
        <span>{min}µs</span>
        <span
          className="font-mono font-medium"
          style={{ color: inRange ? color : '#ef4444' }}
        >
          {currentValue}µs
        </span>
        <span>{max}µs</span>
      </div>

      {/* Test buttons */}
      {onTestPosition && (
        <div className="flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTestPosition('min');
            }}
            className="flex-1 py-1.5 text-xs bg-zinc-700/50 text-zinc-400 rounded hover:bg-zinc-700 transition-colors"
          >
            ← Min
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTestPosition('center');
            }}
            className="flex-1 py-1.5 text-xs bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
          >
            Center
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onTestPosition('max');
            }}
            className="flex-1 py-1.5 text-xs bg-zinc-700/50 text-zinc-400 rounded hover:bg-zinc-700 transition-colors"
          >
            Max →
          </button>
        </div>
      )}
    </div>
  );
}

// Export color palette for use in diagrams
export { SERVO_COLORS };
