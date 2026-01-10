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
import { Cog, Plus, Trash2, RotateCcw, Download, RefreshCw } from 'lucide-react';

interface MotorMix {
  index: number;
  throttle: number;
  roll: number;
  pitch: number;
  yaw: number;
}

// Common motor mixer presets
const MOTOR_PRESETS: Record<string, {
  name: string;
  description: string;
  motors: Omit<MotorMix, 'index'>[];
}> = {
  quadX: {
    name: 'Quad X',
    description: 'Standard X configuration',
    motors: [
      { throttle: 1.0, roll: -1.0, pitch: 1.0, yaw: -1.0 },
      { throttle: 1.0, roll: -1.0, pitch: -1.0, yaw: 1.0 },
      { throttle: 1.0, roll: 1.0, pitch: 1.0, yaw: 1.0 },
      { throttle: 1.0, roll: 1.0, pitch: -1.0, yaw: -1.0 },
    ],
  },
  quadPlus: {
    name: 'Quad +',
    description: 'Plus configuration',
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 1.0, yaw: -1.0 },
      { throttle: 1.0, roll: -1.0, pitch: 0.0, yaw: 1.0 },
      { throttle: 1.0, roll: 0.0, pitch: -1.0, yaw: -1.0 },
      { throttle: 1.0, roll: 1.0, pitch: 0.0, yaw: 1.0 },
    ],
  },
  hex: {
    name: 'Hex X',
    description: '6 motors, X configuration',
    motors: [
      { throttle: 1.0, roll: -0.5, pitch: 1.0, yaw: -1.0 },
      { throttle: 1.0, roll: -1.0, pitch: 0.0, yaw: 1.0 },
      { throttle: 1.0, roll: -0.5, pitch: -1.0, yaw: -1.0 },
      { throttle: 1.0, roll: 0.5, pitch: -1.0, yaw: 1.0 },
      { throttle: 1.0, roll: 1.0, pitch: 0.0, yaw: -1.0 },
      { throttle: 1.0, roll: 0.5, pitch: 1.0, yaw: 1.0 },
    ],
  },
  twinMotor: {
    name: 'Twin Motor',
    description: 'Dual motor plane/VTOL',
    motors: [
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: 0.5 },
      { throttle: 1.0, roll: 0.0, pitch: 0.0, yaw: -0.5 },
    ],
  },
};

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

export default function MotorMixerTab({ modified, setModified }: Props) {
  const connectionState = useConnectionStore((s) => s.connectionState);
  const [motors, setMotors] = useState<MotorMix[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'rebooting' | 'reconnecting' | 'done' | 'error'>('idle');

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
        setMotors(result.map((m, i) => ({ ...m, index: i })));
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
        <div className="w-16 h-16 rounded-xl bg-blue-500/20 flex items-center justify-center">
          {saveState === 'error' ? (
            <span className="text-3xl">❌</span>
          ) : (
            <Cog className={`w-8 h-8 text-blue-400 ${saveState !== 'error' ? 'animate-spin' : ''}`} />
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

      {/* Quick Presets */}
      <div className="bg-zinc-800/30 rounded-xl border border-zinc-700/50 p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Quick Presets</h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(MOTOR_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key)}
              className="px-3 py-2 bg-zinc-700/50 hover:bg-zinc-700 rounded-lg text-sm text-zinc-300 hover:text-white transition-colors"
            >
              <span className="font-medium">{preset.name}</span>
              <span className="text-zinc-500 ml-2">{preset.motors.length}M</span>
            </button>
          ))}
          <button
            onClick={resetAll}
            className="px-3 py-2 bg-zinc-700/50 hover:bg-red-500/20 rounded-lg text-sm text-zinc-400 hover:text-red-400 transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset All
          </button>
        </div>
      </div>

      {/* Motor Cards */}
      {motors.length === 0 ? (
        <div className="text-center py-12 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
          <Cog className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-zinc-300 mb-2">No Motor Mixer Rules</h3>
          <p className="text-sm text-zinc-500 max-w-md mx-auto mb-4">
            Motor mixer rules define how each motor responds to throttle, roll, pitch, and yaw commands.
            Use a preset or add motors manually.
          </p>
          <button
            onClick={addMotor}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Motor
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {motors.map((motor) => (
              <div
                key={motor.index}
                className="bg-zinc-800/50 rounded-xl border border-zinc-700/50 overflow-hidden"
              >
                {/* Motor Header */}
                <div className="px-4 py-3 border-b border-zinc-700/50 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold">
                      M{motor.index}
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">Motor {motor.index}</h3>
                      <p className="text-xs text-zinc-500">Output {motor.index + 1}</p>
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
            ))}
          </div>

          {/* Add Motor Button */}
          {motors.length < MAX_MOTORS && (
            <div className="flex justify-center">
              <button
                onClick={addMotor}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Motor ({motors.length}/{MAX_MOTORS})
              </button>
            </div>
          )}
        </>
      )}

      {/* Info */}
      <div className="bg-zinc-800/30 rounded-xl border border-zinc-700/50 p-4">
        <h4 className="font-medium text-zinc-300 mb-2">About Motor Mixer</h4>
        <ul className="text-sm text-zinc-500 space-y-1 list-disc list-inside">
          <li><strong>Throttle</strong> - Base motor output (0 to 1.0, usually 1.0 for all motors)</li>
          <li><strong>Roll</strong> - Motor response to roll commands (-1.0 to 1.0)</li>
          <li><strong>Pitch</strong> - Motor response to pitch commands (-1.0 to 1.0)</li>
          <li><strong>Yaw</strong> - Motor response to yaw commands (-1.0 to 1.0)</li>
        </ul>
        <p className="text-xs text-zinc-600 mt-3">
          For standard frames, use a preset. Custom mixing is for non-standard motor layouts.
        </p>
      </div>
    </div>
  );
}
