/**
 * BatteryTab
 *
 * Battery monitor configuration with visual helpers.
 * Makes it easy to set up voltage/current sensing.
 * Uses Lucide icons (no emojis) and DraggableSliders.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useTranslation, Trans } from 'react-i18next';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
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
import Px4BatteryConfig from './Px4BatteryConfig';
import {
  BATTERY_MONITORS,
  getCellVoltages,
  BATTERY_CHEMISTRIES,
  type BatteryChemistry,
} from './presets/mavlink-presets';
import { SitlBatteryCard } from './SitlBatteryCard';

const BatteryTab: React.FC = () => {
  const { t } = useTranslation();
  const { parameters, setParameter, modifiedCount } = useParameterStore();
  const firmware = useConnectionStore((s) => s.connectionState.firmware);

  // ArduPilot battery instances: BATT_* is battery 1, BATT2_*..BATT9_* the
  // rest (#126). Every card below reads and writes the selected instance.
  const [instance, setInstance] = useState(1);
  const bp = useCallback(
    (name: string) => (instance === 1 ? `BATT_${name}` : `BATT${instance}_${name}`),
    [instance],
  );
  // Fixed instance names on purpose: these describe EVERY chip, never the
  // currently selected instance.
  const instanceMonitorParam = (i: number): string => (i === 1 ? 'BATT_MONITOR' : `BATT${i}_MONITOR`);
  const availableInstances = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= 9; i++) {
      if (parameters.has(instanceMonitorParam(i))) out.push(i);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parameters]);
  const monitorOf = (i: number): number => parameters.get(instanceMonitorParam(i))?.value ?? 0;
  // ArduPilot creates the rest of a BATTn_ family on BOOT after the monitor
  // is enabled; until then only BATTn_MONITOR exists and writing the others
  // fails. CAPACITY is the canary for the whole family.
  const instanceReady = parameters.has(bp('CAPACITY'));

  // Get current battery values
  const batteryValues = useMemo(() => ({
    // Monitor type
    battMonitor: parameters.get(bp('MONITOR'))?.value ?? 4,
    // Capacity
    battCapacity: parameters.get(bp('CAPACITY'))?.value ?? 0,
    // Voltage settings
    battArmVolt: parameters.get(bp('ARM_VOLT'))?.value ?? 0,
    battCrtVolt: parameters.get(bp('CRT_VOLT'))?.value ?? 0,
    battLowVolt: parameters.get(bp('LOW_VOLT'))?.value ?? 0,
    // Calibration
    battVoltMult: parameters.get(bp('VOLT_MULT'))?.value ?? 10.1,
    battAmpPervlt: parameters.get(bp('AMP_PERVLT'))?.value ?? 17,
    battAmpOffset: parameters.get(bp('AMP_OFFSET'))?.value ?? 0,
    // Pin assignments
    battVoltPin: parameters.get(bp('VOLT_PIN'))?.value ?? -1,
    battCurrPin: parameters.get(bp('CURR_PIN'))?.value ?? -1,
  }), [parameters, bp]);

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
    setParameter(bp('ARM_VOLT'), recommended.arm);
    setParameter(bp('LOW_VOLT'), recommended.low);
    setParameter(bp('CRT_VOLT'), recommended.critical);
  };

  // Estimate cell count from whichever threshold the FC actually has set.
  // BATT_ARM_VOLT is 0 by default on most vehicles (arm-voltage check off), so
  // fall back to the low/critical thresholds using their per-cell references.
  // Without this, the tab shows no detected pack for a correctly-configured FC.
  const estimatedCells = useMemo(() => {
    if (batteryValues.battArmVolt > 0) return Math.round(batteryValues.battArmVolt / chemInfo.cellNominal);
    if (batteryValues.battLowVolt > 0) return Math.round(batteryValues.battLowVolt / chemInfo.cellLow);
    if (batteryValues.battCrtVolt > 0) return Math.round(batteryValues.battCrtVolt / chemInfo.cellCritical);
    return 0;
  }, [batteryValues.battArmVolt, batteryValues.battLowVolt, batteryValues.battCrtVolt, chemInfo]);

  // Max voltage for sliders - based on 24S full charge of current chemistry + margin.
  // 24S covers heavy-lift industrial multirotors up to ~108V (24S Li-Ion HV).
  const maxVoltageSlider = Math.ceil(24 * chemInfo.cellFull) + 1;

  const modified = modifiedCount();

  if (firmware === 'px4') {
    return <Px4BatteryConfig />;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Help Card */}
      <InfoCard title={t('mavlink-config:batteryTab.helpTitle')} variant="info">
        {t('mavlink-config:batteryTab.helpBody')}
      </InfoCard>

      {availableInstances.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-content-secondary">{t('mavlink-config:batteryTab.batteryInstance')}</span>
          {availableInstances.map((i) => {
            const active = instance === i;
            const enabled = monitorOf(i) > 0;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setInstance(i)}
                data-tip={enabled ? t('mavlink-config:batteryTab.configureBattery', { n: i }) : t('mavlink-config:batteryTab.batteryDisabledTip', { n: i })}
                className={
                  'px-2.5 py-1 rounded-md border text-xs transition-colors ' +
                  (active
                    ? 'border-blue-500/60 bg-blue-500/10 text-blue-400'
                    : 'border-subtle text-content-secondary hover:border-default hover:text-content hover:bg-surface-raised')
                }
              >
                {t('mavlink-config:batteryTab.batteryN', { n: i })}
                {!enabled && <span className="ml-1 text-[10px] uppercase tracking-wide text-content-tertiary">{t('mavlink-config:batteryTab.off')}</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Monitor Type Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">{t('mavlink-config:batteryTab.monitorType')}</h3>
              <p className="text-xs text-content-secondary">{t('mavlink-config:batteryTab.monitorTypeHint')}</p>
            </div>
          </div>

          <select
            value={batteryValues.battMonitor}
            onChange={(e) => setParameter(bp('MONITOR'), Number(e.target.value))}
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
              {(BATTERY_MONITORS[batteryValues.battMonitor] ? t(BATTERY_MONITORS[batteryValues.battMonitor]!.descriptionKey) : '') || t('mavlink-config:batteryTab.selectMonitorType')}
            </p>
          </div>

          {batteryValues.battMonitor === 0 && (
            <div className="bg-amber-500/10 border-amber-500/30 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">
                {t('mavlink-config:batteryTab.monitoringDisabled')}
              </p>
            </div>
          )}
        </div>

        {/* Capacity Card */}
        {instanceReady && (
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">{t('mavlink-config:batteryTab.batteryCapacity')}</h3>
              <p className="text-xs text-content-secondary">{t('mavlink-config:batteryTab.batteryCapacityHint')}</p>
            </div>
          </div>

          <DraggableSlider
            label={t('mavlink-config:batteryTab.capacityLabel')}
            value={batteryValues.battCapacity}
            onChange={(v) => setParameter(bp('CAPACITY'), v)}
            min={0}
            max={200000}
            step={100}
            color="#22C55E"
            hint={t('mavlink-config:batteryTab.capacitySliderHint')}
          />

          {/* Hobby / racing / cinema capacity presets */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1.5">{t('mavlink-config:batteryTab.hobbyCinema')}</div>
            <div className="flex flex-wrap gap-2">
              {[1300, 2200, 3000, 5000, 8000, 10000, 16000].map((cap) => (
                <button
                  key={cap}
                  onClick={() => setParameter(bp('CAPACITY'), cap)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    batteryValues.battCapacity === cap
                      ? 'bg-blue-500 text-white'
                      : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                  }`}
                >
                  {cap >= 1000 ? `${(cap / 1000).toFixed(cap % 1000 ? 1 : 0)} Ah` : `${cap} mAh`}{/* i18n-exempt */}
                </button>
              ))}
            </div>
          </div>

          {/* Heavy-lift / industrial capacity presets */}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1.5">{t('mavlink-config:batteryTab.heavyLiftIndustrial')}</div>
            <div className="flex flex-wrap gap-2">
              {[22000, 30000, 44000, 56000, 80000, 100000].map((cap) => (
                <button
                  key={cap}
                  onClick={() => setParameter(bp('CAPACITY'), cap)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    batteryValues.battCapacity === cap
                      ? 'bg-blue-500 text-white'
                      : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                  }`}
                >
                  {(cap / 1000).toFixed(0)} Ah{/* i18n-exempt */}
                </button>
              ))}
            </div>
          </div>
        </div>
        )}
      </div>

      {!instanceReady && (
        <InfoCard title={t('mavlink-config:batteryTab.notCreatedTitle', { n: instance })} variant="warning">
          {t('mavlink-config:batteryTab.notCreatedBody', { suffix: instance === 1 ? '' : instance })}
        </InfoCard>
      )}

      {instanceReady && (<>
      {/* Battery Chemistry & Cell Configuration */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Plug className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">{t('mavlink-config:batteryTab.chemistryTitle')}</h3>
              <p className="text-xs text-content-secondary">{t('mavlink-config:batteryTab.chemistryHint')}</p>
            </div>
          </div>
          {estimatedCells > 0 && (
            <span className="px-2 py-1 text-xs bg-surface-raised rounded text-content-secondary">
              {t('mavlink-config:batteryTab.currently', { cells: estimatedCells, chem: chemInfo.name })}
            </span>
          )}
        </div>

        {/* Renders itself away unless SIM_BATT_* exist, i.e. unless this is SITL. */}
        <div className="mb-4">
          <SitlBatteryCard
            cells={estimatedCells}
            cellFull={chemInfo.cellFull}
            capacityMah={batteryValues.battCapacity as number}
          />
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
                {t('mavlink-config:batteryTab.voltsPerCell', { v: chem.cellNominal })}
              </div>
            </button>
          ))}
        </div>

        {/* Chemistry description */}
        <div className="bg-surface-raised rounded-lg p-2.5">
          <p className="text-xs text-content-secondary">{t(chemInfo.descriptionKey)}</p>
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
                { label: t('mavlink-config:batteryTab.full'), voltage: getCellVoltages(estimatedCells, chemistry).full, color: 'text-green-400' },
                { label: t('mavlink-config:batteryTab.storage'), voltage: getCellVoltages(estimatedCells, chemistry).storage, color: 'text-blue-400' },
                { label: t('mavlink-config:batteryTab.lowRtl'), voltage: getCellVoltages(estimatedCells, chemistry).low, color: 'text-amber-400' },
                { label: t('mavlink-config:batteryTab.critical'), voltage: getCellVoltages(estimatedCells, chemistry).critical, color: 'text-red-400' },
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
            <Trans i18nKey="mavlink-config:batteryTab.ardupilotNote" components={{ b: <span className="text-blue-400" /> }} />
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
            <h3 className="text-sm font-medium text-content">{t('mavlink-config:batteryTab.voltageThresholds')}</h3>
            <p className="text-xs text-content-secondary">{t('mavlink-config:batteryTab.voltageThresholdsHint')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label={t('mavlink-config:batteryTab.minArmVoltage')}
            value={batteryValues.battArmVolt}
            onChange={(v) => setParameter(bp('ARM_VOLT'), v)}
            min={0}
            max={maxVoltageSlider}
            step={0.1}
            color="#3B82F6"
            hint={t('mavlink-config:batteryTab.minArmVoltageHint')}
          />

          <DraggableSlider
            label={t('mavlink-config:batteryTab.lowWarningVoltage')}
            value={batteryValues.battLowVolt}
            onChange={(v) => setParameter(bp('LOW_VOLT'), v)}
            min={0}
            max={maxVoltageSlider}
            step={0.1}
            color="#F59E0B"
            hint={t('mavlink-config:batteryTab.lowWarningVoltageHint')}
          />

          <DraggableSlider
            label={t('mavlink-config:batteryTab.criticalVoltage')}
            value={batteryValues.battCrtVolt}
            onChange={(v) => setParameter(bp('CRT_VOLT'), v)}
            min={0}
            max={maxVoltageSlider}
            step={0.1}
            color="#EF4444"
            hint={t('mavlink-config:batteryTab.criticalVoltageHint')}
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
              <h3 className="text-sm font-medium text-content">{t('common:calibration')}</h3>
              <p className="text-xs text-content-secondary">{t('mavlink-config:batteryTab.calibrationHint')}</p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] bg-surface-raised text-content-secondary rounded">{t('common:advanced')}</span>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label={t('mavlink-config:batteryTab.voltageMultiplier')}
            value={batteryValues.battVoltMult}
            onChange={(v) => setParameter(bp('VOLT_MULT'), v)}
            min={0}
            max={200}
            step={0.01}
            color="#8B5CF6"
            hint={t('mavlink-config:batteryTab.voltageMultiplierHint')}
          />

          <DraggableSlider
            label={t('mavlink-config:batteryTab.ampsPerVolt')}
            value={batteryValues.battAmpPervlt}
            onChange={(v) => setParameter(bp('AMP_PERVLT'), v)}
            min={0}
            max={500}
            step={0.1}
            color="#8B5CF6"
            hint={t('mavlink-config:batteryTab.ampsPerVoltHint')}
          />

          <DraggableSlider
            label={t('mavlink-config:batteryTab.currentOffset')}
            value={batteryValues.battAmpOffset}
            onChange={(v) => setParameter(bp('AMP_OFFSET'), v)}
            min={-1}
            max={1}
            step={0.01}
            color="#8B5CF6"
            hint={t('mavlink-config:batteryTab.currentOffsetHint')}
          />
        </div>

        {/* Pin assignments — board-specific analog input pins */}
        <div className="border-t border-subtle pt-4 space-y-3">
          <div>
            <h4 className="text-xs font-medium text-content uppercase tracking-wide">{t('mavlink-config:batteryTab.analogPins')}</h4>
            <p className="text-[11px] text-content-secondary mt-0.5">
              {t('mavlink-config:batteryTab.analogPinsHint')}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('mavlink-config:batteryTab.voltagePin', { param: bp('VOLT_PIN') })}</label>
              <DraftNumberInput
                integer
                value={batteryValues.battVoltPin}
                onCommit={(v) => setParameter(bp('VOLT_PIN'), v)}
                className="w-full px-2 py-1.5 bg-surface-input border border-subtle rounded text-sm font-mono text-content focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('mavlink-config:batteryTab.currentPin', { param: bp('CURR_PIN') })}</label>
              <DraftNumberInput
                integer
                value={batteryValues.battCurrPin}
                onCommit={(v) => setParameter(bp('CURR_PIN'), v)}
                className="w-full px-2 py-1.5 bg-surface-input border border-subtle rounded text-sm font-mono text-content focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="bg-surface-raised rounded-lg p-2.5 space-y-1">
            <p className="text-[11px] text-content-secondary"><span className="text-blue-400 font-medium">{t('mavlink-config:batteryTab.commonValues')}</span></p>
            <ul className="text-[11px] text-content-secondary pl-3 space-y-0.5 list-disc">
              <li>SITL: VOLT 13, CURR 12</li>{/* i18n-exempt */}
              <li>{t('mavlink-config:batteryTab.cubeOrangePins')}</li>
              <li>Pixhawk 1/2.1: VOLT 2, CURR 3</li>{/* i18n-exempt */}
              <li>Pixhawk 4/5/6: VOLT 16, CURR 17</li>{/* i18n-exempt */}
              <li>{t('mavlink-config:batteryTab.disabledPin')}</li>
            </ul>
          </div>
        </div>

        <div className="bg-surface-raised rounded-lg p-3">
          <p className="text-xs text-content-secondary">
            <Trans i18nKey="mavlink-config:batteryTab.calibrationTip" components={{ b: <span className="text-blue-400" /> }} />
          </p>
        </div>
      </div>

      </>)}

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <Save className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            <Trans i18nKey="mavlink-config:batteryTab.unsavedHint" components={{ b: <span className="font-medium" /> }} />
          </p>
        </div>
      )}
    </div>
  );
};

export default BatteryTab;
