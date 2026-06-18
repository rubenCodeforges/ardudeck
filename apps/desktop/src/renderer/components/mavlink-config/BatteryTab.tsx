/**
 * BatteryTab
 *
 * Battery monitor configuration with visual helpers.
 * Makes it easy to set up voltage/current sensing.
 * Uses Lucide icons (no emojis) and DraggableSliders.
 */

import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Zap,
  Plug,
  AlertTriangle,
  Wrench,
  Save,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
import Px4ConfigNotice from './Px4ConfigNotice';
import {
  BATTERY_MONITORS,
  getCellVoltages,
  BATTERY_CHEMISTRIES,
  type BatteryChemistry,
} from './presets/mavlink-presets';

const BatteryTab: React.FC = () => {
  const { parameters, setParameter, modifiedCount } = useParameterStore();
  const firmware = useConnectionStore((s) => s.connectionState.firmware);

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
    // Pin assignments
    battVoltPin: parameters.get('BATT_VOLT_PIN')?.value ?? -1,
    battCurrPin: parameters.get('BATT_CURR_PIN')?.value ?? -1,
  }), [parameters]);

  // Battery chemistry state
  const [chemistry, setChemistry] = useState<BatteryChemistry>('lipo');
  const chemInfo = BATTERY_CHEMISTRIES[chemistry];

  // Cell counts: hobby (2-6S), prosumer (7-12S), industrial / heavy-lift (14S+)
  const cellCountsLow = [2, 3, 4, 5, 6];
  const cellCountsHigh = [7, 8, 10, 12];
  const cellCountsIndustrial = [14, 16, 18, 20, 24];

  // Get recommended voltages for selected cell count + chemistry
  const getRecommendedVoltages = (cells: number) => {
    const v = getCellVoltages(cells, chemistry);
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
    return Math.round(batteryValues.battArmVolt / chemInfo.cellNominal);
  }, [batteryValues.battArmVolt, chemInfo.cellNominal]);

  // Max voltage for sliders - based on 24S full charge of current chemistry + margin.
  // 24S covers heavy-lift industrial multirotors up to ~108V (24S Li-Ion HV).
  const maxVoltageSlider = Math.ceil(24 * chemInfo.cellFull * 10) + 10;

  const modified = modifiedCount();

  if (firmware === 'px4') {
    return (
      <Px4ConfigNotice message="PX4 battery configuration is available in the Parameters tab (BAT1_* parameters)." />
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Help Card */}
      <InfoCard title="Battery Monitoring" variant="info">
        Configure your battery monitor to track voltage, current, and remaining capacity.
        Accurate monitoring is essential for safe flying.
      </InfoCard>

      <div className="grid grid-cols-2 gap-4">
        {/* Monitor Type Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Monitor Type</h3>
              <p className="text-xs text-content-secondary">How is battery connected?</p>
            </div>
          </div>

          <select
            value={batteryValues.battMonitor}
            onChange={(e) => setParameter('BATT_MONITOR', Number(e.target.value))}
            className="w-full px-3 py-2.5 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
          >
            {Object.entries(BATTERY_MONITORS).map(([num, monitor]) => (
              <option key={num} value={num}>
                {monitor.name}
              </option>
            ))}
          </select>

          <div className="bg-surface-raised rounded-lg p-3">
            <p className="text-xs text-content-secondary">
              {BATTERY_MONITORS[batteryValues.battMonitor]?.description || 'Select a monitor type'}
            </p>
          </div>

          {batteryValues.battMonitor === 0 && (
            <div className="bg-amber-500/10 border-amber-500/30 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">
                Battery monitoring disabled. You won't see voltage or remaining capacity!
              </p>
            </div>
          )}
        </div>

        {/* Capacity Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Battery Capacity</h3>
              <p className="text-xs text-content-secondary">For accurate mAh remaining</p>
            </div>
          </div>

          <DraggableSlider
            label="Capacity (mAh)"
            value={batteryValues.battCapacity}
            onChange={(v) => setParameter('BATT_CAPACITY', v)}
            min={0}
            max={200000}
            step={100}
            color="#22C55E"
            hint="Match your battery pack capacity. Heavy-lift industrial multirotors typically 20–100 Ah."
          />

          {/* Hobby / racing / cinema capacity presets */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1.5">Hobby / cinema</div>
            <div className="flex flex-wrap gap-2">
              {[1300, 2200, 3000, 5000, 8000, 10000, 16000].map((cap) => (
                <button
                  key={cap}
                  onClick={() => setParameter('BATT_CAPACITY', cap)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    batteryValues.battCapacity === cap
                      ? 'bg-blue-500 text-white'
                      : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                  }`}
                >
                  {cap >= 1000 ? `${(cap / 1000).toFixed(cap % 1000 ? 1 : 0)} Ah` : `${cap} mAh`}
                </button>
              ))}
            </div>
          </div>

          {/* Heavy-lift / industrial capacity presets */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1.5">Heavy lift / industrial</div>
            <div className="flex flex-wrap gap-2">
              {[22000, 30000, 44000, 56000, 80000, 100000].map((cap) => (
                <button
                  key={cap}
                  onClick={() => setParameter('BATT_CAPACITY', cap)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    batteryValues.battCapacity === cap
                      ? 'bg-blue-500 text-white'
                      : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                  }`}
                >
                  {(cap / 1000).toFixed(0)} Ah
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Battery Chemistry & Cell Configuration */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Plug className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Battery Chemistry & Cell Count</h3>
              <p className="text-xs text-content-secondary">Select chemistry, then cell count to auto-calculate thresholds</p>
            </div>
          </div>
          {estimatedCells > 0 && (
            <span className="px-2 py-1 text-xs bg-surface-raised rounded text-content-secondary">
              Currently: ~{estimatedCells}S {chemInfo.name}
            </span>
          )}
        </div>

        {/* Chemistry Selector */}
        <div className="flex gap-2">
          {(Object.entries(BATTERY_CHEMISTRIES) as [BatteryChemistry, typeof chemInfo][]).map(([key, chem]) => (
            <button
              key={key}
              onClick={() => setChemistry(key)}
              className={`flex-1 p-2.5 rounded-lg border text-center transition-all ${
                chemistry === key
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                  : 'bg-surface border text-content hover:border'
              }`}
            >
              <div className="text-sm font-medium">{chem.name}</div>
              <div className="text-[10px] text-content-secondary mt-0.5">
                {chem.cellNominal}V/cell
              </div>
            </button>
          ))}
        </div>

        {/* Chemistry description */}
        <div className="bg-surface-raised rounded-lg p-2.5">
          <p className="text-xs text-content-secondary">{chemInfo.description}</p>
        </div>

        {/* Cell Count - Low range */}
        <div className="flex gap-2">
          {cellCountsLow.map((cells) => {
            const voltages = getCellVoltages(cells, chemistry);
            const isActive = estimatedCells === cells;
            return (
              <button
                key={cells}
                onClick={() => applyCellPreset(cells)}
                className={`flex-1 p-3 rounded-lg border text-center transition-all ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-surface border text-content hover:border'
                }`}
              >
                <div className="text-lg font-bold">{cells}S</div>
                <div className="text-[10px] text-content-secondary mt-1">
                  {voltages.nominal.toFixed(1)}V
                </div>
              </button>
            );
          })}
        </div>

        {/* Cell Count - High range */}
        <div className="flex gap-2">
          {cellCountsHigh.map((cells) => {
            const voltages = getCellVoltages(cells, chemistry);
            const isActive = estimatedCells === cells;
            return (
              <button
                key={cells}
                onClick={() => applyCellPreset(cells)}
                className={`flex-1 p-3 rounded-lg border text-center transition-all ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-surface border text-content hover:border'
                }`}
              >
                <div className="text-lg font-bold">{cells}S</div>
                <div className="text-[10px] text-content-secondary mt-1">
                  {voltages.nominal.toFixed(1)}V
                </div>
              </button>
            );
          })}
        </div>

        {/* Cell Count - Industrial / heavy-lift (14S+) */}
        <div className="flex gap-2">
          {cellCountsIndustrial.map((cells) => {
            const voltages = getCellVoltages(cells, chemistry);
            const isActive = estimatedCells === cells;
            return (
              <button
                key={cells}
                onClick={() => applyCellPreset(cells)}
                className={`flex-1 p-3 rounded-lg border text-center transition-all ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-surface border text-content hover:border'
                }`}
              >
                <div className="text-lg font-bold">{cells}S</div>
                <div className="text-[10px] text-content-secondary mt-1">
                  {voltages.nominal.toFixed(1)}V
                </div>
              </button>
            );
          })}
        </div>

        {/* Voltage Reference */}
        {estimatedCells > 0 && (
          <div className="bg-surface-raised rounded-lg p-3">
            <div className="grid grid-cols-4 gap-3 text-center">
              {[
                { label: 'Full', voltage: getCellVoltages(estimatedCells, chemistry).full, color: 'text-green-400' },
                { label: 'Storage', voltage: getCellVoltages(estimatedCells, chemistry).storage, color: 'text-blue-400' },
                { label: 'Low (RTL)', voltage: getCellVoltages(estimatedCells, chemistry).low, color: 'text-amber-400' },
                { label: 'Critical', voltage: getCellVoltages(estimatedCells, chemistry).critical, color: 'text-red-400' },
              ].map((v) => (
                <div key={v.label}>
                  <div className={`text-sm font-mono ${v.color}`}>{v.voltage.toFixed(1)}V</div>
                  <div className="text-[10px] text-content-secondary">{v.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ArduPilot threshold philosophy note */}
        <div className="bg-blue-500/5 border-blue-500/20 rounded-lg p-3">
          <p className="text-xs text-content-secondary">
            <span className="text-blue-400">ArduPilot note:</span> Thresholds are set conservatively to ensure enough
            battery remains for RTL. Low triggers RTL warning, Critical triggers emergency land. Unlike Betaflight,
            these must account for the energy needed to fly home.
          </p>
        </div>
      </div>

      {/* Voltage Thresholds */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">Voltage Thresholds</h3>
            <p className="text-xs text-content-secondary">When to warn and take action</p>
          </div>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label="Minimum Arm Voltage (V)"
            value={Math.round(batteryValues.battArmVolt * 10)}
            onChange={(v) => setParameter('BATT_ARM_VOLT', v / 10)}
            min={0}
            max={maxVoltageSlider}
            step={1}
            color="#3B82F6"
            hint="Won't arm below this voltage"
          />

          <DraggableSlider
            label="Low Warning Voltage (V)"
            value={Math.round(batteryValues.battLowVolt * 10)}
            onChange={(v) => setParameter('BATT_LOW_VOLT', v / 10)}
            min={0}
            max={maxVoltageSlider}
            step={1}
            color="#F59E0B"
            hint="RTL warning triggers here"
          />

          <DraggableSlider
            label="Critical Voltage (V)"
            value={Math.round(batteryValues.battCrtVolt * 10)}
            onChange={(v) => setParameter('BATT_CRT_VOLT', v / 10)}
            min={0}
            max={maxVoltageSlider}
            step={1}
            color="#EF4444"
            hint="Emergency land triggers here"
          />
        </div>

        {/* Visual voltage bar */}
        <div className="relative h-3 bg-surface-inset rounded-full overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="h-full bg-red-500/50" style={{ width: '15%' }} />
            <div className="h-full bg-amber-500/50" style={{ width: '15%' }} />
            <div className="h-full bg-green-500/50" style={{ width: '70%' }} />
          </div>
          {batteryValues.battCrtVolt > 0 && estimatedCells > 0 && (
            <div
              className="absolute top-0 w-0.5 h-full bg-red-400"
              style={{ left: `${(batteryValues.battCrtVolt / (estimatedCells * chemInfo.cellFull)) * 100}%` }}
            />
          )}
          {batteryValues.battLowVolt > 0 && estimatedCells > 0 && (
            <div
              className="absolute top-0 w-0.5 h-full bg-amber-400"
              style={{ left: `${(batteryValues.battLowVolt / (estimatedCells * chemInfo.cellFull)) * 100}%` }}
            />
          )}
        </div>
      </div>

      {/* Calibration (Advanced) */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Calibration</h3>
              <p className="text-xs text-content-secondary">Fine-tune voltage/current readings</p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] bg-surface-raised text-content-secondary rounded">Advanced</span>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label="Voltage Multiplier"
            value={batteryValues.battVoltMult}
            onChange={(v) => setParameter('BATT_VOLT_MULT', v)}
            min={0}
            max={200}
            step={0.01}
            color="#8B5CF6"
            hint="Adjusts voltage reading accuracy. Range covers high-voltage industrial setups (up to 200)."
          />

          <DraggableSlider
            label="Amps Per Volt"
            value={batteryValues.battAmpPervlt}
            onChange={(v) => setParameter('BATT_AMP_PERVLT', v)}
            min={0}
            max={500}
            step={0.1}
            color="#8B5CF6"
            hint="Current sensor calibration. Range covers high-current industrial setups (up to 500 A/V)."
          />

          <DraggableSlider
            label="Current Offset"
            value={batteryValues.battAmpOffset}
            onChange={(v) => setParameter('BATT_AMP_OFFSET', v)}
            min={-1}
            max={1}
            step={0.01}
            color="#8B5CF6"
            hint="Zero-point adjustment"
          />
        </div>

        {/* Pin assignments — board-specific analog input pins */}
        <div className="border-t border-subtle pt-4 space-y-3">
          <div>
            <h4 className="text-xs font-medium text-content uppercase tracking-wide">Analog Pin Assignments</h4>
            <p className="text-[11px] text-content-secondary mt-0.5">
              Required for analog monitor types. Pin numbers are board-specific (Cube Orange, SITL, Pixhawk variants all differ). Set -1 to disable.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-content-secondary mb-1">Voltage Pin (BATT_VOLT_PIN)</label>
              <input
                type="number"
                value={batteryValues.battVoltPin}
                onChange={(e) => setParameter('BATT_VOLT_PIN', Number(e.target.value))}
                className="w-full px-2 py-1.5 bg-surface-input border border-subtle rounded text-sm font-mono text-content focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-content-secondary mb-1">Current Pin (BATT_CURR_PIN)</label>
              <input
                type="number"
                value={batteryValues.battCurrPin}
                onChange={(e) => setParameter('BATT_CURR_PIN', Number(e.target.value))}
                className="w-full px-2 py-1.5 bg-surface-input border border-subtle rounded text-sm font-mono text-content focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="bg-surface-raised rounded-lg p-2.5 space-y-1">
            <p className="text-[11px] text-content-secondary"><span className="text-blue-400 font-medium">Common values:</span></p>
            <ul className="text-[11px] text-content-secondary pl-3 space-y-0.5 list-disc">
              <li>SITL: VOLT 13, CURR 12</li>
              <li>Cube Orange (default carrier): VOLT 14, CURR 15</li>
              <li>Pixhawk 1/2.1: VOLT 2, CURR 3</li>
              <li>Pixhawk 4/5/6: VOLT 16, CURR 17</li>
              <li>Disabled: -1</li>
            </ul>
          </div>
        </div>

        <div className="bg-surface-raised rounded-lg p-3">
          <p className="text-xs text-content-secondary">
            <span className="text-blue-400">Tip:</span> To calibrate voltage, measure your battery with a
            multimeter and adjust the multiplier until readings match. For current, compare with a watt
            meter during a hover test.
          </p>
        </div>
      </div>

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border-amber-500/30 p-4 flex items-center gap-3">
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
