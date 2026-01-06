/**
 * Legacy Rates Tab
 *
 * Rate configuration for legacy F3 boards via CLI commands.
 * Uses set roll_rate, pitch_rate, yaw_rate, rc_expo, etc.
 */

import { useLegacyConfigStore } from '../../stores/legacy-config-store';

export default function LegacyRatesTab() {
  const { rates, updateRates } = useLegacyConfigStore();

  if (!rates) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No rates data loaded. Run dump command first.
      </div>
    );
  }

  const handleChange = (field: keyof typeof rates, value: number, paramName: string) => {
    const updated = { ...rates, [field]: value };
    updateRates(updated);
    window.electronAPI.cliSendCommand(`set ${paramName} = ${value}`);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
        <p className="text-sm text-blue-300">
          <strong>Legacy CLI Mode:</strong> Changes are sent immediately via CLI commands.
          Click "Save to EEPROM" when done to persist changes.
        </p>
      </div>

      {/* Rates */}
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Axis Rates (°/sec)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Roll Rate</label>
            <input
              type="number"
              value={rates.rollRate}
              onChange={(e) => handleChange('rollRate', parseInt(e.target.value) || 0, 'roll_rate')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
            <span className="text-xs text-zinc-600 mt-1 block">{rates.rollRate * 10}°/s</span>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Pitch Rate</label>
            <input
              type="number"
              value={rates.pitchRate}
              onChange={(e) => handleChange('pitchRate', parseInt(e.target.value) || 0, 'pitch_rate')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
            <span className="text-xs text-zinc-600 mt-1 block">{rates.pitchRate * 10}°/s</span>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Yaw Rate</label>
            <input
              type="number"
              value={rates.yawRate}
              onChange={(e) => handleChange('yawRate', parseInt(e.target.value) || 0, 'yaw_rate')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
            <span className="text-xs text-zinc-600 mt-1 block">{rates.yawRate * 10}°/s</span>
          </div>
        </div>
      </div>

      {/* Expo */}
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Expo (Stick Curve)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">RC Expo</label>
            <input
              type="number"
              min="0"
              max="100"
              value={rates.rcExpo}
              onChange={(e) => handleChange('rcExpo', parseInt(e.target.value) || 0, 'rc_expo')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">RC Yaw Expo</label>
            <input
              type="number"
              min="0"
              max="100"
              value={rates.rcYawExpo}
              onChange={(e) => handleChange('rcYawExpo', parseInt(e.target.value) || 0, 'rc_yaw_expo')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">RC Rate</label>
            <input
              type="number"
              value={rates.rcRate}
              onChange={(e) => handleChange('rcRate', parseInt(e.target.value) || 0, 'rc_rate')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
          </div>
        </div>
      </div>

      {/* Throttle */}
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Throttle</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Throttle Mid</label>
            <input
              type="number"
              min="0"
              max="100"
              value={rates.throttleMid}
              onChange={(e) => handleChange('throttleMid', parseInt(e.target.value) || 0, 'thr_mid')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Throttle Expo</label>
            <input
              type="number"
              min="0"
              max="100"
              value={rates.throttleExpo}
              onChange={(e) => handleChange('throttleExpo', parseInt(e.target.value) || 0, 'thr_expo')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
          </div>
        </div>
      </div>

      {/* TPA */}
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Throttle PID Attenuation (TPA)</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">TPA Rate (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={rates.tpaRate}
              onChange={(e) => handleChange('tpaRate', parseInt(e.target.value) || 0, 'tpa_rate')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">TPA Breakpoint</label>
            <input
              type="number"
              min="1000"
              max="2000"
              value={rates.tpaBreakpoint}
              onChange={(e) => handleChange('tpaBreakpoint', parseInt(e.target.value) || 0, 'tpa_breakpoint')}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-white"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
