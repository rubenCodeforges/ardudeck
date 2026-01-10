/**
 * BatteryTab
 *
 * Battery monitor configuration with visual helpers.
 * Makes it easy to set up voltage/current sensing.
 */

import React, { useMemo } from 'react';
import { useParameterStore } from '../../stores/parameter-store';
import { BATTERY_MONITORS, getLiPoVoltages } from './presets/mavlink-presets';

const BatteryTab: React.FC = () => {
  const { parameters, setParameter, modifiedCount } = useParameterStore();

  // Get current battery values
  const batteryValues = useMemo(() => ({
    // Monitor type
    battMonitor: parameters.get('BATT_MONITOR')?.value ?? 4,
    // Capacity
    battCapacity: parameters.get('BATT_CAPACITY')?.value ?? 0,
    // Voltage settings
    battArmVolt: parameters.get('BATT_ARM_VOLT')?.value ?? 0,
    battCrtVolt: parameters.get('BATT_CRT_VOLT')?.value ?? 0,
    battLowVolt: parameters.get('BATT_LOW_VOLT')?.value ?? 0,
    // Calibration
    battVoltMult: parameters.get('BATT_VOLT_MULT')?.value ?? 10.1,
    battAmpPervlt: parameters.get('BATT_AMP_PERVLT')?.value ?? 17,
    battAmpOffset: parameters.get('BATT_AMP_OFFSET')?.value ?? 0,
  }), [parameters]);

  // Common LiPo cell counts
  const cellCounts = [2, 3, 4, 5, 6];

  // Get recommended voltages for selected cell count
  const getRecommendedVoltages = (cells: number) => {
    const v = getLiPoVoltages(cells);
    return {
      arm: v.storage,
      low: v.low,
      critical: v.critical,
    };
  };

  // Apply cell count preset
  const applyCellPreset = (cells: number) => {
    const recommended = getRecommendedVoltages(cells);
    setParameter('BATT_ARM_VOLT', recommended.arm);
    setParameter('BATT_LOW_VOLT', recommended.low);
    setParameter('BATT_CRT_VOLT', recommended.critical);
  };

  // Estimate cell count from arm voltage
  const estimatedCells = useMemo(() => {
    if (batteryValues.battArmVolt <= 0) return 0;
    return Math.round(batteryValues.battArmVolt / 3.7);
  }, [batteryValues.battArmVolt]);

  const modified = modifiedCount();

  return (
    <div className="p-6 space-y-6">
      {/* Help Card */}
      <div className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4 flex items-start gap-4">
        <span className="text-2xl">🔋</span>
        <div>
          <p className="text-blue-400 font-medium">Battery Monitoring</p>
          <p className="text-sm text-zinc-400 mt-1">
            Configure your battery monitor to track voltage, current, and remaining capacity.
            Accurate monitoring is essential for safe flying.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Monitor Type Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <span className="text-xl">📊</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Monitor Type</h3>
              <p className="text-xs text-zinc-500">How is battery connected?</p>
            </div>
          </div>

          <select
            value={batteryValues.battMonitor}
            onChange={(e) => setParameter('BATT_MONITOR', Number(e.target.value))}
            className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {Object.entries(BATTERY_MONITORS).map(([num, monitor]) => (
              <option key={num} value={num}>
                {monitor.name}
              </option>
            ))}
          </select>

          <div className="bg-zinc-800/50 rounded-lg p-3">
            <p className="text-xs text-zinc-500">
              {BATTERY_MONITORS[batteryValues.battMonitor]?.description || 'Select a monitor type'}
            </p>
          </div>

          {batteryValues.battMonitor === 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
              <p className="text-xs text-amber-400">
                Battery monitoring disabled. You won't see voltage or remaining capacity!
              </p>
            </div>
          )}
        </div>

        {/* Capacity Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <span className="text-xl">⚡</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Battery Capacity</h3>
              <p className="text-xs text-zinc-500">For accurate mAh remaining</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Capacity (mAh)</label>
            <input
              type="number"
              value={batteryValues.battCapacity}
              onChange={(e) => setParameter('BATT_CAPACITY', Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              step={100}
              min={0}
              max={50000}
              placeholder="e.g. 5000"
            />
          </div>

          {/* Common capacity presets */}
          <div className="flex flex-wrap gap-2">
            {[1300, 2200, 3000, 4000, 5000, 6000].map((cap) => (
              <button
                key={cap}
                onClick={() => setParameter('BATT_CAPACITY', cap)}
                className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                  batteryValues.battCapacity === cap
                    ? 'bg-blue-500 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                }`}
              >
                {cap} mAh
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* LiPo Cell Configuration */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <span className="text-xl">🔌</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">LiPo Cell Count</h3>
              <p className="text-xs text-zinc-500">Auto-calculate voltage thresholds</p>
            </div>
          </div>
          {estimatedCells > 0 && (
            <span className="px-2 py-1 text-xs bg-zinc-800 rounded text-zinc-400">
              Currently: ~{estimatedCells}S
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {cellCounts.map((cells) => {
            const voltages = getLiPoVoltages(cells);
            const isActive = estimatedCells === cells;
            return (
              <button
                key={cells}
                onClick={() => applyCellPreset(cells)}
                className={`flex-1 p-3 rounded-lg border text-center transition-all ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-zinc-800/50 border-zinc-700 text-zinc-300 hover:border-zinc-600'
                }`}
              >
                <div className="text-lg font-bold">{cells}S</div>
                <div className="text-[10px] text-zinc-500 mt-1">
                  {voltages.nominal.toFixed(1)}V nom
                </div>
              </button>
            );
          })}
        </div>

        {/* Voltage Reference */}
        {estimatedCells > 0 && (
          <div className="bg-zinc-800/50 rounded-lg p-3">
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { label: 'Full', voltage: getLiPoVoltages(estimatedCells).full, color: 'text-green-400' },
                { label: 'Storage', voltage: getLiPoVoltages(estimatedCells).storage, color: 'text-blue-400' },
                { label: 'Low', voltage: getLiPoVoltages(estimatedCells).low, color: 'text-amber-400' },
                { label: 'Critical', voltage: getLiPoVoltages(estimatedCells).critical, color: 'text-red-400' },
              ].map((v) => (
                <div key={v.label}>
                  <div className={`text-sm font-mono ${v.color}`}>{v.voltage.toFixed(1)}V</div>
                  <div className="text-[10px] text-zinc-500">{v.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Voltage Thresholds */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
            <span className="text-xl">⚠️</span>
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Voltage Thresholds</h3>
            <p className="text-xs text-zinc-500">When to warn and take action</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Minimum Arm (V)</label>
            <input
              type="number"
              value={batteryValues.battArmVolt}
              onChange={(e) => setParameter('BATT_ARM_VOLT', Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              step={0.1}
              min={0}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Won't arm below this</p>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Low Warning (V)</label>
            <input
              type="number"
              value={batteryValues.battLowVolt}
              onChange={(e) => setParameter('BATT_LOW_VOLT', Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              step={0.1}
              min={0}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Warning alert</p>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Critical (V)</label>
            <input
              type="number"
              value={batteryValues.battCrtVolt}
              onChange={(e) => setParameter('BATT_CRT_VOLT', Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              step={0.1}
              min={0}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Failsafe triggers</p>
          </div>
        </div>

        {/* Visual voltage bar */}
        <div className="relative h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="h-full bg-red-500/50" style={{ width: '15%' }} />
            <div className="h-full bg-amber-500/50" style={{ width: '15%' }} />
            <div className="h-full bg-green-500/50" style={{ width: '70%' }} />
          </div>
          {batteryValues.battCrtVolt > 0 && estimatedCells > 0 && (
            <div
              className="absolute top-0 w-0.5 h-full bg-red-400"
              style={{ left: `${(batteryValues.battCrtVolt / (estimatedCells * 4.2)) * 100}%` }}
            />
          )}
          {batteryValues.battLowVolt > 0 && estimatedCells > 0 && (
            <div
              className="absolute top-0 w-0.5 h-full bg-amber-400"
              style={{ left: `${(batteryValues.battLowVolt / (estimatedCells * 4.2)) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Calibration (Advanced) */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <span className="text-xl">🔧</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Calibration</h3>
              <p className="text-xs text-zinc-500">Fine-tune voltage/current readings</p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] bg-zinc-700/50 text-zinc-400 rounded">Advanced</span>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Voltage Multiplier</label>
            <input
              type="number"
              value={batteryValues.battVoltMult}
              onChange={(e) => setParameter('BATT_VOLT_MULT', Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              step={0.01}
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Amps Per Volt</label>
            <input
              type="number"
              value={batteryValues.battAmpPervlt}
              onChange={(e) => setParameter('BATT_AMP_PERVLT', Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              step={0.1}
            />
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Current Offset</label>
            <input
              type="number"
              value={batteryValues.battAmpOffset}
              onChange={(e) => setParameter('BATT_AMP_OFFSET', Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              step={0.01}
            />
          </div>
        </div>

        <div className="bg-zinc-800/50 rounded-lg p-3">
          <p className="text-xs text-zinc-500">
            <span className="text-blue-400">Tip:</span> To calibrate voltage, measure your battery with a
            multimeter and adjust the multiplier until readings match. For current, compare with a watt
            meter during a hover test.
          </p>
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

export default BatteryTab;
