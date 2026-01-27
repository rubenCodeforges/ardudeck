/**
 * MotorMixerTab
 *
 * Motor mixer configuration for modern iNav boards.
 * Uses MSP2_COMMON_MOTOR_MIXER for modern boards, CLI fallback for legacy.
 * Includes background reconnect handling similar to platform change.
 */

import { useState, useEffect, useCallback } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { CompactSlider } from '../ui/DraggableSlider';
import {
  Cog, Plus, Trash2, RotateCcw, RotateCw, Download, RefreshCw, XCircle,
  Lightbulb, HelpCircle, ChevronDown, ChevronUp, Sparkles, Plane
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface MotorMix {
  index: number;
  throttle: number;
  roll: number;
  pitch: number;
  yaw: number;
}

// Motor position in the visual diagram (relative coordinates 0-100)
interface MotorPosition {
  x: number;
  y: number;
  rotation: 'cw' | 'ccw'; // Clockwise or counter-clockwise
}

// Platform types for filtering presets
type PlatformCategory = 'multirotor' | 'airplane';

// Common motor mixer presets with visual positions
const MOTOR_PRESETS: Record<string, {
  name: string;
  description: string;
  beginner: string;
  icon: LucideIcon;
  recommended?: boolean;
  platform: PlatformCategory;
  positions: MotorPosition[];
  motors: Omit<MotorMix, 'index'>[];
}> = {
  // === MULTIROTOR PRESETS ===
  quadX: {
    name: 'Quad X',
    description: 'Most common drone layout',
    beginner: 'This is what most racing and freestyle drones use. The X shape gives balanced control in all directions.',
    icon: Sparkles,
    recommended: true,
    platform: 'multirotor',
    positions: [
      { x: 25, y: 35, rotation: 'ccw' },  // Front-left (M0)
      { x: 75, y: 75, rotation: 'ccw' },  // Rear-right (M1)
      { x: 75, y: 35, rotation: 'cw' },   // Front-right (M2)
      { x: 25, y: 75, rotation: 'cw' },   // Rear-left (M3)
    ],
    motors: [
      { throttle: 1.0, roll: -1.0, pitch: 1.0, yaw: -1.0 },
      { throttle: 1.0, roll: -1.0, pitch: -1.0, yaw: 1.0 },
      { throttle: 1.0, roll: 1.0, pitch: 1.0, yaw: 1.0 },
      { throttle: 1.0, roll: 1.0, pitch: -1.0, yaw: -1.0 },
    ],
  },
  quadPlus: {
    name: 'Quad +',
    description: 'Plus-shaped layout',
    beginner: 'Motors are arranged in a + shape. One motor points forward. Less common but works well for some frames.',
    icon: Plus,
    platform: 'multirotor',
    positions: [
      { x: 50, y: 32, rotation: 'ccw' },  // Front (M0)
      { x: 15, y: 55, rotation: 'cw' },   // Left (M1)
      { x: 50, y: 78, rotation: 'ccw' },  // Rear (M2)
      { x: 85, y: 55, rotation: 'cw' },   // Right (M3)
    ],
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 1.0, yaw: -1.0 },
      { throttle: 1.0, roll: -1.0, pitch: 0.0, yaw: 1.0 },
      { throttle: 1.0, roll: 0.0, pitch: -1.0, yaw: -1.0 },
      { throttle: 1.0, roll: 1.0, pitch: 0.0, yaw: 1.0 },
    ],
  },
  hex: {
    name: 'Hex X',
    description: '6 motors for heavy lifting',
    beginner: 'Six motors provide more power and redundancy. If one motor fails, you might still be able to land safely.',
    icon: Cog,
    platform: 'multirotor',
    positions: [
      { x: 30, y: 32, rotation: 'ccw' },  // Front-left
      { x: 15, y: 55, rotation: 'cw' },   // Left
      { x: 30, y: 78, rotation: 'ccw' },  // Rear-left
      { x: 70, y: 78, rotation: 'cw' },   // Rear-right
      { x: 85, y: 55, rotation: 'ccw' },  // Right
      { x: 70, y: 32, rotation: 'cw' },   // Front-right
    ],
    motors: [
      { throttle: 1.0, roll: -0.5, pitch: 1.0, yaw: -1.0 },
      { throttle: 1.0, roll: -1.0, pitch: 0.0, yaw: 1.0 },
      { throttle: 1.0, roll: -0.5, pitch: -1.0, yaw: -1.0 },
      { throttle: 1.0, roll: 0.5, pitch: -1.0, yaw: 1.0 },
      { throttle: 1.0, roll: 1.0, pitch: 0.0, yaw: -1.0 },
      { throttle: 1.0, roll: 0.5, pitch: 1.0, yaw: 1.0 },
    ],
  },

  // === AIRPLANE PRESETS ===
  singleMotor: {
    name: 'Single Motor',
    description: 'Standard airplane with one motor',
    beginner: 'Most airplanes have one motor at the front (tractor) or back (pusher). Control surfaces handle steering.',
    icon: Plane,
    recommended: true,
    platform: 'airplane',
    positions: [
      { x: 50, y: 50, rotation: 'cw' },   // Center - single motor
    ],
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.0 },
    ],
  },
  twinMotorDiff: {
    name: 'Twin Motor (Diff Thrust)',
    description: 'Yaw via motor speed difference',
    beginner: 'Two wing motors spinning opposite directions. Yaw is controlled by speeding up one motor and slowing the other.',
    icon: Plane,
    platform: 'airplane',
    positions: [
      { x: 25, y: 50, rotation: 'ccw' },  // Left motor - CCW
      { x: 75, y: 50, rotation: 'cw' },   // Right motor - CW
    ],
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.5 },
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: -0.5 },
    ],
  },
  twinMotorRudder: {
    name: 'Twin Motor (Rudder)',
    description: 'Yaw via rudder servo',
    beginner: 'Two wing motors at equal speed. Use this if your plane has a rudder/tail for yaw control.',
    icon: Plane,
    platform: 'airplane',
    positions: [
      { x: 25, y: 50, rotation: 'ccw' },  // Left motor - CCW
      { x: 75, y: 50, rotation: 'cw' },   // Right motor - CW
    ],
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.0 },
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.0 },
    ],
  },
  quadPlaneVTOL: {
    name: 'QuadPlane VTOL',
    description: '4 quad motors + 1 pusher',
    beginner: 'VTOL aircraft: 4 lifting motors (like a quad) plus 1 pusher motor for forward flight. Most popular VTOL setup.',
    icon: Plane,
    platform: 'airplane',
    positions: [
      { x: 25, y: 35, rotation: 'ccw' },  // Front-left quad motor
      { x: 75, y: 35, rotation: 'cw' },   // Front-right quad motor
      { x: 25, y: 58, rotation: 'cw' },   // Rear-left quad motor
      { x: 75, y: 58, rotation: 'ccw' },  // Rear-right quad motor
      { x: 50, y: 80, rotation: 'cw' },   // Pusher motor (rear)
    ],
    motors: [
      { throttle: 1.0, roll: -1.0, pitch: 1.0, yaw: -1.0 },  // FL
      { throttle: 1.0, roll: 1.0, pitch: 1.0, yaw: 1.0 },    // FR
      { throttle: 1.0, roll: -1.0, pitch: -1.0, yaw: 1.0 },  // RL
      { throttle: 1.0, roll: 1.0, pitch: -1.0, yaw: -1.0 },  // RR
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.0 },    // Pusher
    ],
  },
  triVTOL: {
    name: 'Tricopter VTOL',
    description: '3 tilt/lift motors',
    beginner: 'VTOL with 3 motors that tilt for transition. Lighter than QuadPlane but more complex mechanically.',
    icon: Plane,
    platform: 'airplane',
    positions: [
      { x: 25, y: 42, rotation: 'ccw' },  // Left motor
      { x: 75, y: 42, rotation: 'cw' },   // Right motor
      { x: 50, y: 75, rotation: 'cw' },   // Rear motor (tilts for yaw)
    ],
    motors: [
      { throttle: 1.0, roll: -1.0, pitch: 0.5, yaw: 0.0 },
      { throttle: 1.0, roll: 1.0, pitch: 0.5, yaw: 0.0 },
      { throttle: 1.0, roll: 0.0, pitch: -1.0, yaw: 0.0 },   // Yaw via servo tilt
    ],
  },
};

// Visual motor layout diagram component - bigger and clearer
function MotorLayoutDiagram({
  positions,
  size = 140,
  showLabels = true,
}: {
  positions: MotorPosition[];
  size?: number;
  showLabels?: boolean;
}) {
  // Scale motor size based on diagram size
  const motorSize = size >= 140 ? 'w-8 h-8 text-sm' : 'w-6 h-6 text-xs';
  const labelSize = size >= 140 ? 'text-[10px]' : 'text-[8px]';
  const iconSize = size >= 140 ? 'w-3 h-3' : 'w-2.5 h-2.5';

  return (
    <div
      className="relative bg-zinc-900/80 rounded-xl"
      style={{ width: size, height: size }}
    >
      {/* Front indicator */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex flex-col items-center">
        <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-emerald-500" />
        <span className="text-[10px] text-emerald-400 font-semibold mt-1">FRONT</span>
      </div>

      {/* Motors */}
      {positions.map((pos, idx) => (
        <div
          key={idx}
          className="absolute flex flex-col items-center"
          style={{
            left: `${pos.x}%`,
            top: `${pos.y}%`,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {/* Motor circle */}
          <div
            className={`${motorSize} rounded-full border-2 flex items-center justify-center font-bold shadow-lg ${
              pos.rotation === 'cw'
                ? 'border-orange-500 bg-orange-500/30 text-orange-100'
                : 'border-blue-500 bg-blue-500/30 text-blue-100'
            }`}
          >
            {showLabels && idx}
          </div>
          {/* Direction label with icon */}
          <div className={`flex items-center gap-0.5 mt-1 ${
            pos.rotation === 'cw' ? 'text-orange-400' : 'text-blue-400'
          }`}>
            {pos.rotation === 'cw' ? (
              <RotateCw className={iconSize} />
            ) : (
              <RotateCcw className={iconSize} />
            )}
            <span className={`${labelSize} font-semibold`}>
              {pos.rotation.toUpperCase()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const MAX_MOTORS = 8;

// Mixing value bar visualization
function MixBar({ value, color, label }: { value: number; color: string; label: string }) {
  const percentage = Math.abs(value) * 100;
  const isNegative = value < 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono" style={{ color }}>{value.toFixed(3)}</span>
      </div>
      <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className="absolute top-0 h-full rounded-full transition-all"
          style={{
            left: isNegative ? `${50 - percentage / 2}%` : '50%',
            width: `${percentage / 2}%`,
            backgroundColor: color,
          }}
        />
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600" />
      </div>
    </div>
  );
}

interface Props {
  modified: boolean;
  setModified: (v: boolean) => void;
}

// Helper to determine platform category from vehicle type
function getPlatformCategory(vehicleType?: string): PlatformCategory {
  if (!vehicleType) return 'multirotor';
  const lower = vehicleType.toLowerCase();
  if (lower.includes('plane') || lower.includes('airplane') || lower.includes('wing') || lower === 'airplane') {
    return 'airplane';
  }
  return 'multirotor';
}

export default function MotorMixerTab({ modified, setModified }: Props) {
  const connectionState = useConnectionStore((s) => s.connectionState);
  const [motors, setMotors] = useState<MotorMix[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'rebooting' | 'reconnecting' | 'done' | 'error'>('idle');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMorePresets, setShowMorePresets] = useState(false);

  // Determine current platform and filter presets
  const currentPlatform = getPlatformCategory(connectionState.vehicleType);
  const filteredPresets = Object.entries(MOTOR_PRESETS).filter(
    ([, preset]) => preset.platform === currentPlatform
  );
  const defaultPreset = currentPlatform === 'airplane' ? 'singleMotor' : 'quadX';

  // Split presets: first 3 are "main", rest go in accordion
  const mainPresets = filteredPresets.slice(0, 3);
  const morePresets = filteredPresets.slice(3);

  // Load motor mixer from FC via MSP (with CLI fallback)
  const loadMotorMixer = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try MSP first (modern boards)
      let result = await window.electronAPI?.mspGetMotorMixer();

      if (!result) {
        // CLI fallback for legacy boards
        const cliResult = await window.electronAPI?.mspReadMmixCli();
        if (cliResult) {
          result = cliResult.map(m => ({
            throttle: m.throttle,
            roll: m.roll,
            pitch: m.pitch,
            yaw: m.yaw,
          }));
        }
      }

      if (result && result.length > 0) {
        // Limit to MAX_MOTORS to prevent garbage data issues
        const validMotors = result.slice(0, MAX_MOTORS).map((m, i) => ({ ...m, index: i }));
        setMotors(validMotors);
      } else {
        setMotors([]);
      }
    } catch (err) {
      console.error('[MotorMixer] Load failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load motor mixer');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-load on mount
  useEffect(() => {
    if (connectionState.isConnected) {
      loadMotorMixer();
    }
  }, [connectionState.isConnected, loadMotorMixer]);

  // Clear save state after reconnect
  useEffect(() => {
    if (saveState === 'reconnecting' && connectionState.isConnected) {
      setSaveState('done');
      setTimeout(() => setSaveState('idle'), 1500);
      // Reload after reconnect
      loadMotorMixer();
    }
  }, [connectionState.isConnected, saveState, loadMotorMixer]);

  // Update a motor's mix values
  const updateMotor = (index: number, updates: Partial<MotorMix>) => {
    setMotors(prev => prev.map(m =>
      m.index === index ? { ...m, ...updates } : m
    ));
    setModified(true);
  };

  // Add a new motor
  const addMotor = () => {
    if (motors.length >= MAX_MOTORS) return;
    const newIndex = motors.length;
    setMotors(prev => [...prev, {
      index: newIndex,
      throttle: 1.0,
      roll: 0,
      pitch: 0,
      yaw: 0,
    }]);
    setModified(true);
  };

  // Remove a motor
  const removeMotor = (index: number) => {
    setMotors(prev => {
      const filtered = prev.filter(m => m.index !== index);
      return filtered.map((m, i) => ({ ...m, index: i }));
    });
    setModified(true);
  };

  // Apply a preset
  const applyPreset = (presetKey: string) => {
    const preset = MOTOR_PRESETS[presetKey];
    if (!preset) return;
    setMotors(preset.motors.map((m, i) => ({ ...m, index: i })));
    setModified(true);
  };

  // Reset all motors
  const resetAll = () => {
    setMotors([]);
    setModified(true);
  };

  // Save to FC with background reconnect handling
  const saveToFC = async () => {
    setSaving(true);
    setSaveState('saving');
    setError(null);

    try {
      const rules = motors.map(m => ({
        throttle: m.throttle,
        roll: m.roll,
        pitch: m.pitch,
        yaw: m.yaw,
      }));

      // Try MSP first, falls back to CLI internally
      const success = await window.electronAPI?.mspSetMotorMixer(rules);
      if (!success) {
        throw new Error('Failed to save motor mixer');
      }

      // Save to EEPROM
      await window.electronAPI?.mspSaveEeprom();

      // Reboot board
      setSaveState('rebooting');
      window.electronAPI?.mspReboot().catch(() => {});

      // Wait for reboot
      await new Promise(r => setTimeout(r, 3000));

      // Reconnect
      setSaveState('reconnecting');
      // The connection store should handle auto-reconnect
      // If not, we can manually reconnect here

      setModified(false);
    } catch (err) {
      console.error('[MotorMixer] Save failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to save motor mixer');
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  };

  // Show save overlay during save/reboot/reconnect
  if (saveState !== 'idle' && saveState !== 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-6">
        <div className={`w-16 h-16 rounded-xl flex items-center justify-center ${
          saveState === 'error' ? 'bg-red-500/20' : 'bg-blue-500/20'
        }`}>
          {saveState === 'error' ? (
            <XCircle className="w-8 h-8 text-red-400" />
          ) : (
            <Cog className="w-8 h-8 text-blue-400 animate-spin" />
          )}
        </div>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-white mb-1">
            {saveState === 'saving' && 'Saving Motor Mixer'}
            {saveState === 'rebooting' && 'Rebooting Board'}
            {saveState === 'reconnecting' && 'Reconnecting'}
            {saveState === 'error' && 'Save Failed'}
          </h3>
          <p className="text-sm text-zinc-400">
            {saveState === 'saving' && 'Writing configuration...'}
            {saveState === 'rebooting' && 'Waiting for board to restart...'}
            {saveState === 'reconnecting' && 'Connecting to board...'}
            {saveState === 'error' && (error || 'An error occurred')}
          </p>
        </div>
        {saveState !== 'error' && (
          <div className="flex gap-2">
            <div className={`w-2 h-2 rounded-full ${saveState === 'saving' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
            <div className={`w-2 h-2 rounded-full ${saveState === 'rebooting' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
            <div className={`w-2 h-2 rounded-full ${saveState === 'reconnecting' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
          </div>
        )}
        {saveState === 'error' && (
          <button
            onClick={() => setSaveState('idle')}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm"
          >
            Dismiss
          </button>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
        <p className="text-sm text-zinc-500">Loading motor mixer...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-rose-500/20 flex items-center justify-center">
            <Cog className="w-5 h-5 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Motor Mixer</h2>
            <p className="text-sm text-zinc-400">Configure motor output mixing</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadMotorMixer}
            disabled={loading}
            className="px-3 py-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Reload
          </button>
          <button
            onClick={saveToFC}
            disabled={saving || !modified}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              modified
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            <Download className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save to FC'}
          </button>
        </div>
      </div>

      {/* Error */}
      {error && saveState === 'idle' && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-300 flex items-center gap-2">
          <span>Error:</span> {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-200">×</button>
        </div>
      )}

      {/* Beginner Help */}
      <div className="bg-blue-500/10 rounded-xl border border-blue-500/20 p-4">
        <div className="flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-medium text-blue-300 mb-1">What is Motor Mixer?</h3>
            <p className="text-sm text-blue-200/70">
              {currentPlatform === 'airplane'
                ? 'Motor mixer controls how your motor(s) respond to throttle. Most airplanes have one motor - control surfaces handle steering.'
                : 'Motor mixer tells your flight controller how each motor should respond when you move the sticks. Pick a preset that matches your frame shape.'}
            </p>
          </div>
        </div>
      </div>

      {/* Frame Selection - Visual Presets */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">
            {currentPlatform === 'airplane' ? 'How many motors does your airplane have?' : 'What type of frame do you have?'}
          </h3>
          <button
            onClick={resetAll}
            className="px-3 py-1.5 text-xs bg-zinc-700/50 hover:bg-red-500/20 rounded-lg text-zinc-400 hover:text-red-400 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3 h-3" />
            Clear All
          </button>
        </div>

        {/* Preset Cards - all same size, expandable grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(showMorePresets ? filteredPresets : mainPresets).map(([key, preset]) => {
            const IconComponent = preset.icon;
            const isSelected = motors.length === preset.motors.length &&
              motors.every((m, i) =>
                Math.abs(m.throttle - preset.motors[i].throttle) < 0.01 &&
                Math.abs(m.roll - preset.motors[i].roll) < 0.01 &&
                Math.abs(m.pitch - preset.motors[i].pitch) < 0.01 &&
                Math.abs(m.yaw - preset.motors[i].yaw) < 0.01
              );

            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`rounded-xl border text-left transition-all overflow-hidden ${
                  isSelected
                    ? 'bg-emerald-500/10 border-emerald-500/50 ring-2 ring-emerald-500/30'
                    : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-500'
                }`}
              >
                {/* Diagram Header - Full Width, Bigger */}
                <div className={`flex items-center justify-center py-8 ${
                  isSelected ? 'bg-emerald-500/10' : 'bg-zinc-900/50'
                }`}>
                  <MotorLayoutDiagram positions={preset.positions} size={140} />
                </div>

                {/* Content */}
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2">
                    <IconComponent className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-zinc-400'}`} />
                    <span className={`font-semibold ${isSelected ? 'text-emerald-300' : 'text-white'}`}>
                      {preset.name}
                    </span>
                    {preset.recommended && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded font-medium">
                        Popular
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-xs text-zinc-400 mb-3">{preset.description}</p>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
                    }`}>
                      {preset.motors.length} {preset.motors.length === 1 ? 'motor' : 'motors'}
                    </span>
                    {isSelected && (
                      <span className="text-xs text-emerald-400 font-medium">Selected</span>
                    )}
                  </div>

                  {/* Beginner tip */}
                  <p className="mt-3 pt-3 border-t border-zinc-700/50 text-[11px] text-zinc-500">
                    {preset.beginner}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Show More / Show Less Button */}
        {morePresets.length > 0 && (
          <div className="flex justify-center">
            <button
              onClick={() => setShowMorePresets(!showMorePresets)}
              className="px-4 py-2 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 transition-colors flex items-center gap-2"
            >
              {showMorePresets ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Show More ({morePresets.length} more)
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Motor Cards */}
      {motors.length === 0 ? (
        <div className="text-center py-12 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
          <HelpCircle className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">
            {currentPlatform === 'airplane' ? 'No Motor Configuration' : 'No Frame Selected'}
          </h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto mb-4">
            {currentPlatform === 'airplane'
              ? 'Pick a motor setup above. Most airplanes have a single motor - control surfaces handle steering.'
              : 'Pick a frame type above to get started. Most drones use "Quad X" - the standard layout with 4 motors in an X shape.'}
          </p>
          <button
            onClick={() => applyPreset(defaultPreset)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            {currentPlatform === 'airplane' ? (
              <>
                <Plane className="w-4 h-4" />
                Use Single Motor (Recommended)
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Use Quad X (Recommended)
              </>
            )}
          </button>
        </div>
      ) : (
        <>
          {/* Current Configuration Summary */}
          <div className="bg-emerald-500/10 rounded-xl border border-emerald-500/20 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                  <Cog className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-medium text-emerald-300">
                    {motors.length} Motor Configuration
                  </h3>
                  <p className="text-sm text-emerald-200/60">
                    {Object.entries(MOTOR_PRESETS).find(([, p]) =>
                      p.motors.length === motors.length &&
                      motors.every((m, i) =>
                        Math.abs(m.throttle - p.motors[i].throttle) < 0.01 &&
                        Math.abs(m.roll - p.motors[i].roll) < 0.01 &&
                        Math.abs(m.pitch - p.motors[i].pitch) < 0.01 &&
                        Math.abs(m.yaw - p.motors[i].yaw) < 0.01
                      )
                    )?.[1]?.name || 'Custom configuration'}
                  </p>
                </div>
              </div>
              {modified && (
                <span className="px-3 py-1 text-xs bg-amber-500/20 text-amber-400 rounded-full">
                  Unsaved changes
                </span>
              )}
            </div>
          </div>

          {/* Collapsible Advanced Section */}
          <div className="bg-zinc-800/30 rounded-xl border border-zinc-700/50 overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Cog className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-300">Advanced: Individual Motor Values</span>
                <span className="text-xs text-zinc-500">(for custom configurations)</span>
              </div>
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            {showAdvanced && (
              <div className="p-4 border-t border-zinc-700/50 space-y-4">
                {/* Info about direction inference */}
                <div className="flex items-start gap-2 p-3 bg-zinc-800/50 rounded-lg text-xs text-zinc-400">
                  <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    <span className="text-zinc-300 font-medium">Rotation direction</span> is inferred from mixing values:
                    motors with positive roll mix spin CW (orange), negative roll spin CCW (blue).
                    For airplanes, yaw mixing is used instead.
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  {motors.map((motor) => {
                    // Infer rotation direction from mixing values:
                    // - For multirotors: negative roll = CCW, positive roll = CW
                    // - For airplanes (roll=0): positive yaw = CCW, negative yaw = CW
                    // - Default (single motor, no mixing): CW
                    let isCW = true;
                    if (Math.abs(motor.roll) > 0.01) {
                      isCW = motor.roll > 0;
                    } else if (Math.abs(motor.yaw) > 0.01) {
                      isCW = motor.yaw < 0;
                    }
                    const rotation = isCW ? 'cw' : 'ccw';

                    return (
                    <div
                      key={motor.index}
                      className={`bg-zinc-900/50 rounded-xl border overflow-hidden ${
                        isCW ? 'border-orange-500/30' : 'border-blue-500/30'
                      }`}
                    >
                      {/* Motor Header */}
                      <div className={`px-4 py-3 border-b flex items-center justify-between ${
                        isCW ? 'bg-orange-500/10 border-orange-500/20' : 'bg-blue-500/10 border-blue-500/20'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center font-bold ${
                            isCW
                              ? 'border-orange-500 bg-orange-500/30 text-orange-100'
                              : 'border-blue-500 bg-blue-500/30 text-blue-100'
                          }`}>
                            M{motor.index}
                          </div>
                          <div>
                            <h3 className="font-semibold text-white">Motor {motor.index}</h3>
                            <div className={`flex items-center gap-1 text-xs ${
                              isCW ? 'text-orange-400' : 'text-blue-400'
                            }`}>
                              {isCW ? <RotateCw className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                              <span className="font-medium">{rotation.toUpperCase()}</span>
                              <span className="text-zinc-500 ml-1">· Output {motor.index + 1}</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => removeMotor(motor.index)}
                          className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Mix Bars */}
                      <div className="p-4 space-y-3">
                        <MixBar value={motor.throttle} color="#F59E0B" label="Throttle" />
                        <MixBar value={motor.roll} color="#EF4444" label="Roll" />
                        <MixBar value={motor.pitch} color="#22C55E" label="Pitch" />
                        <MixBar value={motor.yaw} color="#3B82F6" label="Yaw" />
                      </div>

                      {/* Edit Controls */}
                      <div className="px-4 pb-4 space-y-3 border-t border-zinc-700/50 pt-3">
                        <CompactSlider
                          label="Throttle"
                          value={motor.throttle * 1000}
                          onChange={(v) => updateMotor(motor.index, { throttle: v / 1000 })}
                          min={0}
                          max={1000}
                          step={10}
                          formatValue={(v) => (v / 1000).toFixed(2)}
                        />
                        <CompactSlider
                          label="Roll"
                          value={(motor.roll + 1) * 500}
                          onChange={(v) => updateMotor(motor.index, { roll: (v / 500) - 1 })}
                          min={0}
                          max={1000}
                          step={10}
                          formatValue={(v) => ((v / 500) - 1).toFixed(2)}
                        />
                        <CompactSlider
                          label="Pitch"
                          value={(motor.pitch + 1) * 500}
                          onChange={(v) => updateMotor(motor.index, { pitch: (v / 500) - 1 })}
                          min={0}
                          max={1000}
                          step={10}
                          formatValue={(v) => ((v / 500) - 1).toFixed(2)}
                        />
                        <CompactSlider
                          label="Yaw"
                          value={(motor.yaw + 1) * 500}
                          onChange={(v) => updateMotor(motor.index, { yaw: (v / 500) - 1 })}
                          min={0}
                          max={1000}
                          step={10}
                          formatValue={(v) => ((v / 500) - 1).toFixed(2)}
                        />
                      </div>
                    </div>
                    );
                  })}
                </div>

                {/* Add Motor Button */}
                {motors.length < MAX_MOTORS && (
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={addMotor}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Add Motor ({motors.length}/{MAX_MOTORS})
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Legend */}
      <div className="bg-zinc-800/30 rounded-xl border border-zinc-700/50 p-4">
        <h4 className="font-medium text-zinc-300 mb-3">Understanding the Diagram</h4>
        <div className="flex flex-wrap gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full border-2 border-orange-500 bg-orange-500/30 flex items-center justify-center">
              <span className="text-[10px] font-bold text-orange-100">0</span>
            </div>
            <div className="flex items-center gap-1 text-orange-400">
              <RotateCw className="w-3.5 h-3.5" />
              <span className="font-medium">CW</span>
            </div>
            <span className="text-zinc-500">Clockwise</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full border-2 border-blue-500 bg-blue-500/30 flex items-center justify-center">
              <span className="text-[10px] font-bold text-blue-100">1</span>
            </div>
            <div className="flex items-center gap-1 text-blue-400">
              <RotateCcw className="w-3.5 h-3.5" />
              <span className="font-medium">CCW</span>
            </div>
            <span className="text-zinc-500">Counter-clockwise</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-emerald-500" />
            <span className="text-emerald-400 font-medium">FRONT</span>
            <span className="text-zinc-500">Front of aircraft</span>
          </div>
        </div>
        <p className="text-xs text-zinc-500 mt-3">
          Numbers in the diagram match motor outputs on your flight controller (M0, M1, etc.). Opposite motors spin in opposite directions to cancel torque.
        </p>
      </div>
    </div>
  );
}
