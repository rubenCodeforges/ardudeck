/**
 * BatteryTab
 *
 * Battery monitor configuration with visual helpers.
 * Makes it easy to set up voltage/current sensing.
 * Uses Lucide icons (no emojis) and DraggableSliders.
 */

import React, { useMemo } from 'react';
import {
  Battery,
  BarChart3,
  Zap,
  Plug,
  AlertTriangle,
  Wrench,
  Save,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
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
      <InfoCard title="Battery Monitoring" variant="info">
        Configure your battery monitor to track voltage, current, and remaining capacity.
        Accurate monitoring is essential for safe flying.
      </InfoCard>

      <div className="grid grid-cols-2 gap-4">
        {/* Monitor Type Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-400" />
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
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
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
              <Zap className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Battery Capacity</h3>
              <p className="text-xs text-zinc-500">For accurate mAh remaining</p>
            </div>
          </div>

          <DraggableSlider
            label="Capacity (mAh)"
            value={batteryValues.battCapacity}
            onChange={(v) => setParameter('BATT_CAPACITY', v)}
            min={0}
            max={20000}
            step={100}
            color="#22C55E"
            hint="Match your battery pack capacity"
          />

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
              <Plug className="w-5 h-5 text-amber-400" />
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
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Voltage Thresholds</h3>
            <p className="text-xs text-zinc-500">When to warn and take action</p>
          </div>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label="Minimum Arm Voltage (V)"
            value={Math.round(batteryValues.battArmVolt * 10)}
            onChange={(v) => setParameter('BATT_ARM_VOLT', v / 10)}
            min={0}
            max={260}
            step={1}
            color="#3B82F6"
            hint="Won't arm below this voltage"
          />

          <DraggableSlider
            label="Low Warning Voltage (V)"
            value={Math.round(batteryValues.battLowVolt * 10)}
            onChange={(v) => setParameter('BATT_LOW_VOLT', v / 10)}
            min={0}
            max={260}
            step={1}
            color="#F59E0B"
            hint="Warning alert triggers here"
          />

          <DraggableSlider
            label="Critical Voltage (V)"
            value={Math.round(batteryValues.battCrtVolt * 10)}
            onChange={(v) => setParameter('BATT_CRT_VOLT', v / 10)}
            min={0}
            max={260}
            step={1}
            color="#EF4444"
            hint="Failsafe triggers here"
          />
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
              <Wrench className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Calibration</h3>
              <p className="text-xs text-zinc-500">Fine-tune voltage/current readings</p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] bg-zinc-700/50 text-zinc-400 rounded">Advanced</span>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label="Voltage Multiplier"
            value={Math.round(batteryValues.battVoltMult * 100)}
            onChange={(v) => setParameter('BATT_VOLT_MULT', v / 100)}
            min={500}
            max={2000}
            step={1}
            color="#8B5CF6"
            hint="Adjusts voltage reading accuracy"
          />

          <DraggableSlider
            label="Amps Per Volt"
            value={Math.round(batteryValues.battAmpPervlt * 10)}
            onChange={(v) => setParameter('BATT_AMP_PERVLT', v / 10)}
            min={0}
            max={500}
            step={1}
            color="#8B5CF6"
            hint="Current sensor calibration"
          />

          <DraggableSlider
            label="Current Offset"
            value={Math.round(batteryValues.battAmpOffset * 100)}
            onChange={(v) => setParameter('BATT_AMP_OFFSET', v / 100)}
            min={-100}
            max={100}
            step={1}
            color="#8B5CF6"
            hint="Zero-point adjustment"
          />
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
          <Save className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            You have unsaved changes. Click <span className="font-medium">"Write to Flash"</span> in the header to save.
          </p>
        </div>
      )}
    </div>
  );
};

export default BatteryTab;
