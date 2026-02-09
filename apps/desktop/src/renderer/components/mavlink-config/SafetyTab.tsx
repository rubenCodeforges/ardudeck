/**
 * SafetyTab
 *
 * Configures failsafes, arming checks, and geofence settings.
 * Beginner-friendly cards with proper icons (no emojis).
 */

import React, { useMemo, useCallback } from 'react';
import {
  Shield,
  Scale,
  Zap,
  Radio,
  Monitor,
  Battery,
  Fence,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Save,
  Lightbulb,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
import { PresetSelector, type Preset } from '../ui/PresetSelector';
import {
  SAFETY_PRESETS,
  FENCE_TYPES,
  type SafetyPreset,
} from './presets/mavlink-presets';

// Convert safety presets to PresetSelector format
const PRESET_SELECTOR_PRESETS: Record<string, Preset> = {
  maximum: {
    name: 'Maximum',
    description: SAFETY_PRESETS.maximum!.description,
    icon: Shield,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
  },
  balanced: {
    name: 'Balanced',
    description: SAFETY_PRESETS.balanced!.description,
    icon: Scale,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
  },
  minimal: {
    name: 'Minimal',
    description: SAFETY_PRESETS.minimal!.description,
    icon: Zap,
    iconColor: 'text-orange-400',
    color: 'from-orange-500/20 to-red-500/10 border-orange-500/30',
  },
};

const SafetyTab: React.FC = () => {
  const { parameters, setParameter, modifiedCount, fetchParameters, isLoading } = useParameterStore();

  // Check if parameters are loaded
  const hasParameters = parameters.size > 0;

  // Get current safety values
  const safetyValues = useMemo(() => ({
    // Throttle failsafe
    fsThrEnable: parameters.get('FS_THR_ENABLE')?.value ?? 1,
    fsThrValue: parameters.get('FS_THR_VALUE')?.value ?? 975,
    // GCS failsafe
    fsGcsEnable: parameters.get('FS_GCS_ENABLE')?.value ?? 0,
    // Battery failsafe
    fsBattEnable: parameters.get('FS_BATT_ENABLE')?.value ?? 0,
    fsBattVoltage: parameters.get('FS_BATT_VOLTAGE')?.value ?? 0,
    fsBattMah: parameters.get('FS_BATT_MAH')?.value ?? 0,
    // Fence
    fenceEnable: parameters.get('FENCE_ENABLE')?.value ?? 0,
    fenceType: parameters.get('FENCE_TYPE')?.value ?? 3,
    fenceAltMax: parameters.get('FENCE_ALT_MAX')?.value ?? 100,
    fenceRadius: parameters.get('FENCE_RADIUS')?.value ?? 300,
    fenceAction: parameters.get('FENCE_ACTION')?.value ?? 1,
    // Arming
    armingCheck: parameters.get('ARMING_CHECK')?.value ?? 1,
  }), [parameters]);

  // Apply preset
  const applyPreset = useCallback(async (presetKey: string) => {
    const preset = SAFETY_PRESETS[presetKey];
    if (preset) {
      for (const [param, value] of Object.entries(preset.params)) {
        await setParameter(param, value);
      }
    }
  }, [setParameter]);

  const modified = modifiedCount();

  return (
    <div className="p-6 space-y-6">
      {/* Parameters not loaded warning */}
      {!hasParameters && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-amber-300 font-medium">Parameters Not Loaded</p>
              <p className="text-xs text-gray-500">Fetch parameters from the FC to use presets</p>
            </div>
          </div>
          <button
            onClick={() => fetchParameters()}
            disabled={isLoading}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Fetch Parameters'}
          </button>
        </div>
      )}

      {/* Help Card */}
      <InfoCard title="Safety Features" variant="info">
        Configure what happens when things go wrong. Failsafes can save your aircraft
        from flyaways and crashes. Beginners should use the Maximum Safety preset.
      </InfoCard>

      {/* Safety Presets */}
      <PresetSelector
        presets={PRESET_SELECTOR_PRESETS}
        onApply={applyPreset}
        label="Safety Presets"
        hint="Click to apply all settings"
      />

      {/* Failsafe Settings Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* RC Failsafe Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">RC Signal Lost</h3>
              <p className="text-xs text-zinc-500">What happens when transmitter signal is lost</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Action</label>
              <select
                value={safetyValues.fsThrEnable}
                onChange={(e) => setParameter('FS_THR_ENABLE', Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value={0}>Disabled (Not Recommended)</option>
                <option value={1}>RTL - Return to Launch</option>
                <option value={2}>Continue Mission</option>
                <option value={3}>Land Immediately</option>
                <option value={4}>SmartRTL or RTL</option>
                <option value={5}>SmartRTL or Land</option>
              </select>
            </div>

            <DraggableSlider
              label="Trigger PWM Threshold"
              value={safetyValues.fsThrValue}
              onChange={(v) => setParameter('FS_THR_VALUE', v)}
              min={900}
              max={1100}
              step={5}
              color="#EF4444"
              hint="Failsafe triggers when throttle drops below this value"
            />
          </div>
        </div>

        {/* GCS Failsafe Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">GCS Connection Lost</h3>
              <p className="text-xs text-zinc-500">What happens when ground station disconnects</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Action</label>
            <select
              value={safetyValues.fsGcsEnable}
              onChange={(e) => setParameter('FS_GCS_ENABLE', Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value={0}>Disabled</option>
              <option value={1}>RTL - Return to Launch</option>
              <option value={2}>Continue Mission</option>
              <option value={3}>SmartRTL or RTL</option>
              <option value={4}>SmartRTL or Land</option>
              <option value={5}>Land Immediately</option>
            </select>
          </div>

          <div className="bg-zinc-800/50 rounded-lg p-3">
            <p className="text-xs text-zinc-500">
              <span className="text-amber-400">Tip:</span> GCS failsafe requires heartbeat
              from ground station. If flying without GCS, leave disabled.
            </p>
          </div>
        </div>

        {/* Battery Failsafe Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Battery className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Low Battery</h3>
              <p className="text-xs text-zinc-500">Protect against flying home with dead battery</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Action</label>
              <select
                value={safetyValues.fsBattEnable}
                onChange={(e) => setParameter('FS_BATT_ENABLE', Number(e.target.value))}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                <option value={0}>Disabled</option>
                <option value={1}>Land Immediately</option>
                <option value={2}>RTL - Return to Launch</option>
              </select>
            </div>

            <DraggableSlider
              label="Low Voltage (V)"
              value={Math.round(safetyValues.fsBattVoltage * 10)}
              onChange={(v) => setParameter('FS_BATT_VOLTAGE', v / 10)}
              min={0}
              max={260}
              step={1}
              color="#F59E0B"
              hint="Trigger when voltage drops below this"
            />

            <DraggableSlider
              label="Low mAh Used"
              value={safetyValues.fsBattMah}
              onChange={(v) => setParameter('FS_BATT_MAH', v)}
              min={0}
              max={10000}
              step={100}
              color="#F59E0B"
              hint="Trigger when mAh consumed exceeds this"
            />
          </div>
        </div>

        {/* Geofence Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Fence className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">Geofence</h3>
                <p className="text-xs text-zinc-500">Prevent flying out of bounds</p>
              </div>
            </div>
            <button
              onClick={() => setParameter('FENCE_ENABLE', safetyValues.fenceEnable ? 0 : 1)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                safetyValues.fenceEnable ? 'bg-blue-500' : 'bg-zinc-700'
              }`}
            >
              <div
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  safetyValues.fenceEnable ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {safetyValues.fenceEnable ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Fence Type</label>
                <select
                  value={safetyValues.fenceType}
                  onChange={(e) => setParameter('FENCE_TYPE', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  {Object.entries(FENCE_TYPES).map(([num, type]) => (
                    <option key={num} value={num}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <DraggableSlider
                label="Max Altitude (m)"
                value={safetyValues.fenceAltMax}
                onChange={(v) => setParameter('FENCE_ALT_MAX', v)}
                min={10}
                max={1000}
                step={10}
                color="#3B82F6"
              />

              <DraggableSlider
                label="Max Radius (m)"
                value={safetyValues.fenceRadius}
                onChange={(v) => setParameter('FENCE_RADIUS', v)}
                min={30}
                max={10000}
                step={50}
                color="#3B82F6"
              />

              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Breach Action</label>
                <select
                  value={safetyValues.fenceAction}
                  onChange={(e) => setParameter('FENCE_ACTION', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value={0}>Report Only</option>
                  <option value={1}>RTL or Land</option>
                  <option value={2}>Always Land</option>
                  <option value={3}>SmartRTL or RTL</option>
                  <option value={4}>Brake or Land</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-xs text-zinc-500">
                Enable geofence to set altitude and distance limits.
                Your aircraft will RTL or land if it breaches the fence.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Arming Checks */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Arming Checks</h3>
              <p className="text-xs text-zinc-500">What must pass before motors can arm</p>
            </div>
          </div>
          <select
            value={safetyValues.armingCheck === 1 ? 'all' : safetyValues.armingCheck === 0 ? 'none' : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'all') setParameter('ARMING_CHECK', 1);
              else if (e.target.value === 'none') setParameter('ARMING_CHECK', 0);
            }}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Checks (Recommended)</option>
            <option value="none">No Checks (Dangerous!)</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {safetyValues.armingCheck === 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">
              <span className="font-medium">Warning:</span> Disabling arming checks is dangerous!
              Your aircraft could arm with faulty sensors or no GPS lock.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {[
            { name: 'Barometer', bit: 2 },
            { name: 'Compass', bit: 4 },
            { name: 'GPS Lock', bit: 8 },
            { name: 'INS (Gyro/Accel)', bit: 16 },
            { name: 'Parameters', bit: 32 },
            { name: 'RC Channels', bit: 64 },
            { name: 'Board Voltage', bit: 128 },
            { name: 'Battery Level', bit: 256 },
            { name: 'Logging', bit: 1024 },
            { name: 'Safety Switch', bit: 2048 },
          ].map((check) => {
            const isEnabled = safetyValues.armingCheck === 1 || (safetyValues.armingCheck & check.bit) !== 0;
            return (
              <div
                key={check.name}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                  isEnabled ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800/50 text-zinc-500'
                }`}
              >
                {isEnabled ? (
                  <CheckCircle className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                )}
                <span>{check.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <Save className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            You have unsaved changes. Click <span className="font-medium">"Write to Flash"</span> in the header to save.
          </p>
        </div>
      )}
    </div>
  );
};

export default SafetyTab;
