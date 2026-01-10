/**
 * SafetyTab
 *
 * Configures failsafes, arming checks, and geofence settings.
 * Beginner-friendly cards instead of raw parameter editing.
 */

import React, { useMemo } from 'react';
import { useParameterStore } from '../../stores/parameter-store';
import {
  SAFETY_PRESETS,
  FAILSAFE_ACTIONS,
  ARMING_CHECKS,
  FENCE_TYPES,
  type SafetyPreset,
} from './presets/mavlink-presets';

const SafetyTab: React.FC = () => {
  const { parameters, setParameter, modifiedCount } = useParameterStore();

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
  const applyPreset = (preset: SafetyPreset) => {
    Object.entries(preset.params).forEach(([param, value]) => {
      setParameter(param, value);
    });
  };

  // Check if current config matches a preset
  const matchesPreset = (preset: SafetyPreset): boolean => {
    return Object.entries(preset.params).every(
      ([param, value]) => parameters.get(param)?.value === value
    );
  };

  const modified = modifiedCount();

  return (
    <div className="p-6 space-y-6">
      {/* Help Card */}
      <div className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4 flex items-start gap-4">
        <span className="text-2xl">🛡️</span>
        <div>
          <p className="text-blue-400 font-medium">Safety Features</p>
          <p className="text-sm text-zinc-400 mt-1">
            Configure what happens when things go wrong. Failsafes can save your aircraft
            from flyaways and crashes. Beginners should use Maximum Safety preset.
          </p>
        </div>
      </div>

      {/* Safety Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Safety Presets</h3>
          <span className="text-xs text-zinc-500">Click to apply all settings</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(SAFETY_PRESETS).map(([key, preset]) => {
            const isActive = matchesPreset(preset);
            return (
              <button
                key={key}
                onClick={() => applyPreset(preset)}
                className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.02] ${
                  isActive
                    ? 'bg-gradient-to-br border-blue-500/50 shadow-lg shadow-blue-500/20 ' + preset.color
                    : 'bg-gradient-to-br border-zinc-700/50 hover:border-zinc-600 ' + preset.color
                }`}
              >
                <div className="text-2xl mb-2">{preset.icon}</div>
                <div className={`font-medium ${isActive ? 'text-blue-300' : 'text-white'}`}>
                  {preset.name}
                </div>
                <div className="text-xs text-zinc-400 mt-1">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Failsafe Settings Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* RC Failsafe Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <span className="text-xl">📡</span>
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

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">
                Trigger PWM Threshold
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={safetyValues.fsThrValue}
                  onChange={(e) => setParameter('FS_THR_VALUE', Number(e.target.value))}
                  className="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  min={900}
                  max={1100}
                />
                <span className="text-xs text-zinc-500">PWM</span>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1">
                Failsafe triggers when throttle drops below this value
              </p>
            </div>
          </div>
        </div>

        {/* GCS Failsafe Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <span className="text-xl">💻</span>
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
              <span className="text-xl">🔋</span>
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Low Voltage (V)</label>
                <input
                  type="number"
                  value={safetyValues.fsBattVoltage}
                  onChange={(e) => setParameter('FS_BATT_VOLTAGE', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  step={0.1}
                  min={0}
                />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1.5">Low mAh Used</label>
                <input
                  type="number"
                  value={safetyValues.fsBattMah}
                  onChange={(e) => setParameter('FS_BATT_MAH', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  step={100}
                  min={0}
                />
              </div>
            </div>
            <p className="text-[10px] text-zinc-600">
              Set to 0 to use only voltage or only mAh consumed
            </p>
          </div>
        </div>

        {/* Geofence Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <span className="text-xl">🚧</span>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">Max Altitude (m)</label>
                  <input
                    type="number"
                    value={safetyValues.fenceAltMax}
                    onChange={(e) => setParameter('FENCE_ALT_MAX', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                    min={10}
                    max={1000}
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">Max Radius (m)</label>
                  <input
                    type="number"
                    value={safetyValues.fenceRadius}
                    onChange={(e) => setParameter('FENCE_RADIUS', Number(e.target.value))}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                    min={30}
                    max={10000}
                  />
                </div>
              </div>

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
              <span className="text-xl">✅</span>
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
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            <p className="text-xs text-red-400">
              <span className="font-medium">Warning:</span> Disabling arming checks is dangerous!
              Your aircraft could arm with faulty sensors or no GPS lock.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {Object.entries(ARMING_CHECKS)
            .filter(([num]) => Number(num) !== 1) // Skip "All" entry
            .slice(0, 10)
            .map(([num, check]) => {
              const checkNum = Number(num);
              const isEnabled = safetyValues.armingCheck === 1 || (safetyValues.armingCheck & checkNum) !== 0;
              return (
                <div
                  key={num}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                    isEnabled ? 'bg-green-500/10 text-green-400' : 'bg-zinc-800/50 text-zinc-500'
                  }`}
                >
                  <span>{isEnabled ? '✓' : '○'}</span>
                  <span>{check.name}</span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <span className="text-xl">💾</span>
          <p className="text-sm text-amber-400">
            You have unsaved changes. Click <span className="font-medium">"Write to Flash"</span> in the header to save.
          </p>
        </div>
      )}
    </div>
  );
};

export default SafetyTab;
