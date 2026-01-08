/**
 * ServoMixerTab
 *
 * iNav Servo Mixer configuration for fixed-wing aircraft.
 * Configure servo outputs, mixer rules, and control surface assignments.
 */

import { useState, useEffect, useCallback } from 'react';
import { CompactSlider } from '../ui/DraggableSlider';
import { useServoWizardStore } from '../../stores/servo-wizard-store';
import {
  Plane,
  ArrowUpDown,
  ArrowLeftRight,
  TriangleAlert,
  ChevronUp,
  ChevronDown,
  PlaneLanding,
  Info,
  type LucideIcon,
} from 'lucide-react';

// Platform type constants (from msp-ts)
const PLATFORM_TYPE = {
  MULTIROTOR: 0,
  AIRPLANE: 1,
  HELICOPTER: 2,
  TRICOPTER: 3,
  ROVER: 4,
  BOAT: 5,
} as const;

const PLATFORM_NAMES: Record<number, string> = {
  [PLATFORM_TYPE.MULTIROTOR]: 'Multirotor',
  [PLATFORM_TYPE.AIRPLANE]: 'Airplane',
  [PLATFORM_TYPE.HELICOPTER]: 'Helicopter',
  [PLATFORM_TYPE.TRICOPTER]: 'Tricopter',
  [PLATFORM_TYPE.ROVER]: 'Rover',
  [PLATFORM_TYPE.BOAT]: 'Boat',
};

// Types matching msp-ts
interface MSPServoConfig {
  min: number;
  max: number;
  middle: number;
  rate: number;
  forwardFromChannel: number;
  reversedSources: number;
}

interface MSPServoMixerRule {
  targetChannel: number;
  inputSource: number;
  rate: number;
  speed: number;
  min: number;
  max: number;
  box: number;
}

const SERVO_INPUT_SOURCE_NAMES: Record<number, string> = {
  0: 'Stabilized Roll',
  1: 'Stabilized Pitch',
  2: 'Stabilized Yaw',
  3: 'Stabilized Throttle',
  4: 'RC Roll',
  5: 'RC Pitch',
  6: 'RC Yaw',
  7: 'RC Throttle',
  8: 'AUX 1',
  9: 'AUX 2',
  10: 'AUX 3',
  11: 'AUX 4',
  12: 'Gimbal Pitch',
  13: 'Gimbal Roll',
  14: 'Flaperon',
  15: 'Headtracker',
  16: 'Manual RC',
};

// Common fixed-wing servo presets
interface ServoPreset {
  name: string;
  icon: LucideIcon;
  color: string;
  description: string;
  rules: { inputSource: number; rate: number }[];
}

const SERVO_PRESETS: Record<string, ServoPreset> = {
  aileron: {
    name: 'Aileron',
    icon: Plane,
    color: 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30',
    description: 'Standard aileron setup',
    rules: [
      { inputSource: 0, rate: 100 }, // Stabilized Roll
    ],
  },
  elevator: {
    name: 'Elevator',
    icon: ArrowUpDown,
    color: 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30',
    description: 'Standard elevator setup',
    rules: [
      { inputSource: 1, rate: 100 }, // Stabilized Pitch
    ],
  },
  rudder: {
    name: 'Rudder',
    icon: ArrowLeftRight,
    color: 'bg-purple-500/20 text-purple-400 border-purple-500/30 hover:bg-purple-500/30',
    description: 'Standard rudder setup',
    rules: [
      { inputSource: 2, rate: 100 }, // Stabilized Yaw
    ],
  },
  elevon: {
    name: 'Elevon L',
    icon: ChevronUp,
    color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30',
    description: 'Flying wing - left side',
    rules: [
      { inputSource: 0, rate: 100 },  // Roll
      { inputSource: 1, rate: 100 },  // Pitch
    ],
  },
  elevonRight: {
    name: 'Elevon R',
    icon: ChevronDown,
    color: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30 hover:bg-cyan-500/30',
    description: 'Flying wing - right side',
    rules: [
      { inputSource: 0, rate: -100 }, // Roll (inverted)
      { inputSource: 1, rate: 100 },  // Pitch
    ],
  },
  vtail: {
    name: 'V-Tail',
    icon: TriangleAlert,
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30',
    description: 'V-tail mixer',
    rules: [
      { inputSource: 1, rate: 100 },  // Pitch
      { inputSource: 2, rate: 50 },   // Yaw
    ],
  },
  flaperon: {
    name: 'Flaperon',
    icon: PlaneLanding,
    color: 'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30',
    description: 'Aileron with flap function',
    rules: [
      { inputSource: 0, rate: 100 },  // Roll
      { inputSource: 14, rate: 50 },  // Flaperon input
    ],
  },
};

interface Props {
  modified: boolean;
  setModified: (v: boolean) => void;
}

export default function ServoMixerTab({ modified, setModified }: Props) {
  const [servoConfigs, setServoConfigs] = useState<MSPServoConfig[]>([]);
  const [mixerRules, setMixerRules] = useState<MSPServoMixerRule[]>([]);
  const [servoValues, setServoValues] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedServo, setSelectedServo] = useState<number>(0);
  const [pollingEnabled, setPollingEnabled] = useState(false);

  // Get platform type from servo wizard store
  const { msp2PlatformType } = useServoWizardStore();
  const platformType = msp2PlatformType ?? PLATFORM_TYPE.AIRPLANE;
  const isAirplanePlatform = platformType === PLATFORM_TYPE.AIRPLANE;
  const platformName = PLATFORM_NAMES[platformType] ?? 'Unknown';

  // Load servo configuration
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const configs = await window.electronAPI.mspGetServoConfigs();
      if (configs) {
        setServoConfigs(configs as MSPServoConfig[]);
      }

      const mixer = await window.electronAPI.mspGetServoMixer();
      if (mixer) {
        setMixerRules(mixer as MSPServoMixerRule[]);
      }

      const values = await window.electronAPI.mspGetServoValues();
      if (values) {
        setServoValues(values);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load servo config');
    } finally {
      setLoading(false);
    }
  }, []);

  // Poll servo values for live feedback
  useEffect(() => {
    if (!pollingEnabled) return;

    const interval = setInterval(async () => {
      try {
        const values = await window.electronAPI.mspGetServoValues();
        if (values) {
          setServoValues(values);
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 100);

    return () => clearInterval(interval);
  }, [pollingEnabled]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Update servo config
  const updateServoConfig = (index: number, updates: Partial<MSPServoConfig>) => {
    setServoConfigs((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, ...updates };
      return next;
    });
    setModified(true);
  };

  // Update mixer rule
  const updateMixerRule = (index: number, updates: Partial<MSPServoMixerRule>) => {
    setMixerRules((prev) => {
      const next = [...prev];
      next[index] = { ...next[index]!, ...updates };
      return next;
    });
    setModified(true);
  };

  // Add new mixer rule
  const addMixerRule = (servoIndex: number) => {
    setMixerRules((prev) => [
      ...prev,
      {
        targetChannel: servoIndex,
        inputSource: 0,
        rate: 100,
        speed: 0,
        min: 0,
        max: 0,
        box: 0,
      },
    ]);
    setModified(true);
  };

  // Remove mixer rule
  const removeMixerRule = (index: number) => {
    setMixerRules((prev) => prev.filter((_, i) => i !== index));
    setModified(true);
  };

  // Save all changes
  const saveAll = async () => {
    setError(null);
    try {
      console.log('[ServoMixer] Saving servo configs...');

      // Save servo configs
      for (let i = 0; i < servoConfigs.length; i++) {
        const success = await window.electronAPI.mspSetServoConfig(i, servoConfigs[i]);
        if (!success) {
          setError(`Failed to save servo ${i} config`);
          return;
        }
      }

      // Save mixer rules (may fail on old iNav - that's OK)
      console.log('[ServoMixer] Saving mixer rules...');
      for (let i = 0; i < mixerRules.length; i++) {
        const success = await window.electronAPI.mspSetServoMixer(i, mixerRules[i]);
        if (!success) {
          console.log(`[ServoMixer] Mixer rule ${i} save skipped (may not be supported)`);
          // Don't fail - old iNav doesn't support MSP2 mixer commands
        }
      }

      // Save to EEPROM
      console.log('[ServoMixer] Saving to EEPROM...');
      const eepromSuccess = await window.electronAPI.mspSaveEeprom();
      if (!eepromSuccess) {
        setError('Servo config sent but EEPROM save failed');
        return;
      }

      console.log('[ServoMixer] Saved successfully');
      setModified(false);
    } catch (err) {
      console.error('[ServoMixer] Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  // Apply preset to selected servo
  const applyPreset = (preset: keyof typeof SERVO_PRESETS) => {
    const p = SERVO_PRESETS[preset];
    // Remove existing rules for this servo
    const existingRules = mixerRules.filter((r) => r.targetChannel !== selectedServo);
    // Add new rules from preset
    const newRules = p.rules.map((rule) => ({
      targetChannel: selectedServo,
      inputSource: rule.inputSource,
      rate: rule.rate,
      speed: 0,
      min: 0,
      max: 0,
      box: 0,
    }));
    setMixerRules([...existingRules, ...newRules]);
    setModified(true);
  };

  // Get rules for a specific servo
  const getRulesForServo = (servoIndex: number) => {
    return mixerRules
      .map((rule, idx) => ({ ...rule, originalIndex: idx }))
      .filter((r) => r.targetChannel === servoIndex);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-2 mx-auto" />
          <p className="text-gray-400">Loading servo configuration...</p>
        </div>
      </div>
    );
  }

  const currentConfig = servoConfigs[selectedServo];
  const currentRules = getRulesForServo(selectedServo);

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4 flex items-start gap-4">
        <span className="text-2xl">🛫</span>
        <div>
          <p className="text-blue-400 font-medium">Servo Mixer (iNav) — Fixed-Wing Only</p>
          <p className="text-sm text-zinc-400 mt-1">
            Configure how your servos respond to flight controller commands.
            <strong className="text-zinc-300"> Click a preset button</strong> (Aileron, Elevator, etc.) to quickly set up common control surfaces.
          </p>
          <div className="mt-2 text-xs text-zinc-500 space-y-1">
            <p><span className="text-blue-400">✈️ Aileron</span> — Wing surfaces that roll the plane left/right</p>
            <p><span className="text-blue-400">↕️ Elevator</span> — Tail surface that pitches nose up/down</p>
            <p><span className="text-blue-400">↔️ Rudder</span> — Tail surface that yaws left/right</p>
            <p><span className="text-blue-400">🔺🔻 Elevons</span> — Flying wing combo (roll + pitch on same surface)</p>
            <p><span className="text-blue-400">V V-Tail</span> — Combined elevator/rudder for V-tail planes</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* Servo Selector */}
      <div className="flex gap-2">
        {servoConfigs.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setSelectedServo(idx)}
            className={`px-4 py-2 rounded-lg transition-all ${
              selectedServo === idx
                ? 'bg-blue-500/20 border border-blue-500/50 text-blue-400'
                : 'bg-zinc-800/50 border border-zinc-700 text-zinc-400 hover:border-zinc-600'
            }`}
          >
            <div className="text-sm font-medium">Servo {idx}</div>
            <div className="text-xs text-zinc-500">{servoValues[idx] || 1500} us</div>
          </button>
        ))}
      </div>

      {currentConfig && (
        <div className="grid grid-cols-2 gap-6">
          {/* Servo Settings */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <span className="text-xl">⚙️</span>
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">Servo {selectedServo} Settings</h3>
                <p className="text-xs text-zinc-500">PWM output limits</p>
              </div>
            </div>

            {/* PWM Visualization */}
            <div className="relative h-8 bg-zinc-800 rounded-lg overflow-hidden">
              <div
                className="absolute h-full bg-blue-500/30"
                style={{
                  left: `${((currentConfig.min - 750) / 1500) * 100}%`,
                  width: `${((currentConfig.max - currentConfig.min) / 1500) * 100}%`,
                }}
              />
              <div
                className="absolute w-1 h-full bg-blue-400"
                style={{
                  left: `${((servoValues[selectedServo] || currentConfig.middle - 750) / 1500) * 100}%`,
                }}
              />
              <div
                className="absolute w-0.5 h-full bg-green-400"
                style={{
                  left: `${((currentConfig.middle - 750) / 1500) * 100}%`,
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CompactSlider
                label="Min (μs)"
                value={currentConfig.min}
                onChange={(v) => updateServoConfig(selectedServo, { min: v })}
                min={750}
                max={2250}
                step={10}
                color="#3B82F6"
              />
              <CompactSlider
                label="Max (μs)"
                value={currentConfig.max}
                onChange={(v) => updateServoConfig(selectedServo, { max: v })}
                min={750}
                max={2250}
                step={10}
                color="#3B82F6"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <CompactSlider
                label="Center (μs)"
                value={currentConfig.middle}
                onChange={(v) => updateServoConfig(selectedServo, { middle: v })}
                min={750}
                max={2250}
                step={10}
                color="#22C55E"
              />
              <div>
                <CompactSlider
                  label="Rate (%)"
                  value={currentConfig.rate}
                  onChange={(v) => updateServoConfig(selectedServo, { rate: v })}
                  min={-125}
                  max={125}
                  step={5}
                  color="#A855F7"
                />
                <p className="text-[10px] text-zinc-500 mt-1">Negative = reversed</p>
              </div>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1">Forward Channel</label>
              <select
                value={currentConfig.forwardFromChannel}
                onChange={(e) => updateServoConfig(selectedServo, { forwardFromChannel: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value={255}>Disabled</option>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((ch) => (
                  <option key={ch} value={ch}>
                    AUX {ch + 1}
                  </option>
                ))}
              </select>
            </div>

            {/* Live polling toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pollingEnabled}
                onChange={(e) => setPollingEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-blue-500/50"
              />
              <span className="text-sm text-zinc-400">Live servo position</span>
            </label>
          </div>

          {/* Mixer Rules */}
          <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <span className="text-xl">🎛️</span>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-white">Quick Setup Presets</h3>
                  <p className="text-xs text-zinc-500">Click a button to configure this servo</p>
                </div>
              </div>
              <button
                onClick={() => addMixerRule(selectedServo)}
                className="px-3 py-1.5 text-xs bg-zinc-700 text-zinc-400 rounded-lg hover:bg-zinc-600 hover:text-zinc-300"
                title="Advanced: manually add a mixer rule"
              >
                + Add Rule
              </button>
            </div>

            {/* Platform warning for non-airplane setups */}
            {!isAirplanePlatform && (
              <div className="p-2 bg-amber-500/20 border border-amber-500/30 rounded-lg flex items-center gap-2 text-amber-400 text-xs">
                <Info className="w-4 h-4 flex-shrink-0" />
                <span>
                  Platform is <strong>{platformName}</strong>. These presets are for fixed-wing aircraft.
                  Use manual rules below for {platformName.toLowerCase()} servo configuration.
                </span>
              </div>
            )}

            {/* Presets - Grid layout with colored cards (airplane-specific) */}
            {isAirplanePlatform && (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(SERVO_PRESETS).map(([key, preset]) => {
                  const Icon = preset.icon;
                  return (
                    <button
                      key={key}
                      onClick={() => applyPreset(key as keyof typeof SERVO_PRESETS)}
                      className={`px-3 py-2 text-xs rounded-lg border transition-all flex items-center gap-2 ${preset.color}`}
                      title={preset.description}
                    >
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      <span className="font-medium">{preset.name}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Rules list */}
            <div className="space-y-2">
              {currentRules.length === 0 ? (
                <div className="text-center py-4 text-zinc-500 text-sm">
                  No mixer rules for this servo
                </div>
              ) : (
                currentRules.map((rule) => (
                  <div
                    key={rule.originalIndex}
                    className="bg-zinc-800/50 rounded-lg p-3 flex items-center gap-3"
                  >
                    <select
                      value={rule.inputSource}
                      onChange={(e) =>
                        updateMixerRule(rule.originalIndex, { inputSource: Number(e.target.value) })
                      }
                      className="flex-1 px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                    >
                      {Object.entries(SERVO_INPUT_SOURCE_NAMES).map(([val, name]) => (
                        <option key={val} value={val}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <div className="w-20">
                      <input
                        type="number"
                        value={rule.rate}
                        onChange={(e) =>
                          updateMixerRule(rule.originalIndex, { rate: Number(e.target.value) })
                        }
                        className="w-full px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded text-sm text-white text-center focus:outline-none focus:border-blue-500"
                        min={-125}
                        max={125}
                      />
                      <p className="text-[9px] text-zinc-500 text-center">Rate %</p>
                    </div>
                    <button
                      onClick={() => removeMixerRule(rule.originalIndex)}
                      className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded"
                    >
                      🗑️
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={loadConfig}
          className="px-4 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
        >
          Refresh
        </button>
        <button
          onClick={saveAll}
          disabled={!modified}
          className={`px-4 py-2 text-sm rounded-lg ${
            modified
              ? 'bg-blue-500 text-white hover:bg-blue-400'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          Save Servo Config
        </button>
      </div>
    </div>
  );
}
