/**
 * Px4BatteryConfig
 *
 * PX4 battery setup that mirrors the ArduPilot BatteryTab UX (same cards,
 * icon boxes, DraggableSliders and Tailwind tokens) but bound to PX4
 * BAT1_* / BAT_*_THR parameters. Enum labels (cell count, source) resolve
 * from the bundled PX4 metadata when present, with sensible fallbacks.
 *
 * Params that are absent on the connected vehicle render disabled so the
 * UI never crashes (BAT1_V_DIV / BAT1_A_PER_V are not in current PX4
 * metadata and only appear when the board actually exposes them).
 */

import React, { useMemo } from 'react';
import {
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
import { Trans, useTranslation } from 'react-i18next';

// Fallback enum labels used when metadata for the param is not loaded.
const SOURCE_LABEL_KEYS: Record<number, string> = {
  [-1]: 'mavlink-config:px4BatteryConfig.sourceDisabled',
  0: 'mavlink-config:px4BatteryConfig.sourcePowerModule',
  1: 'mavlink-config:px4BatteryConfig.sourceExternal',
  2: 'mavlink-config:px4BatteryConfig.sourceEscs',
};

const Px4BatteryConfig: React.FC = () => {
  const { t } = useTranslation();
  const { parameters, setParameter, modifiedCount, getParameterMetadata } =
    useParameterStore();

  const has = (id: string) => parameters.has(id);
  const getVal = (id: string, fallback: number) =>
    parameters.get(id)?.value ?? fallback;

  const values = useMemo(
    () => ({
      nCells: getVal('BAT1_N_CELLS', 0),
      capacity: getVal('BAT1_CAPACITY', -1),
      vCharged: getVal('BAT1_V_CHARGED', 4.2),
      vEmpty: getVal('BAT1_V_EMPTY', 3.5),
      rInternal: getVal('BAT1_R_INTERNAL', -1),
      source: getVal('BAT1_SOURCE', 0),
      vDiv: getVal('BAT1_V_DIV', -1),
      aPerV: getVal('BAT1_A_PER_V', -1),
      lowThr: getVal('BAT_LOW_THR', 0.15),
      critThr: getVal('BAT_CRIT_THR', 0.07),
      emergThr: getVal('BAT_EMERGEN_THR', 0.05),
    }),
    [parameters],
  );

  // Source enum: prefer metadata, fall back to known PX4 values.
  const sourceMeta = getParameterMetadata('BAT1_SOURCE');
  const sourceOptions = useMemo(() => {
    if (sourceMeta?.values) {
      return Object.entries(sourceMeta.values).map(([v, label]) => ({
        value: Number(v),
        label,
      }));
    }
    return Object.entries(SOURCE_LABEL_KEYS).map(([v, labelKey]) => ({
      value: Number(v),
      label: t(labelKey),
    }));
  }, [sourceMeta, t]);

  // Cell-count enum max from metadata (PX4 ships 0..16), fall back to 16.
  const cellMeta = getParameterMetadata('BAT1_N_CELLS');
  const maxCells = useMemo(() => {
    if (cellMeta?.values) {
      const nums = Object.keys(cellMeta.values).map(Number);
      return nums.length ? Math.max(...nums) : 16;
    }
    return 16;
  }, [cellMeta]);

  const cellPresets = [3, 4, 6, 8, 12].filter((c) => c <= maxCells);

  // Pack-level nominal/full estimates for the reference strip.
  const packFull =
    values.nCells > 0 ? values.nCells * values.vCharged : 0;
  const packEmpty =
    values.nCells > 0 ? values.nCells * values.vEmpty : 0;

  const modified = modifiedCount();

  const capacityKnown = values.capacity > 0;

  return (
    <div className="p-6 space-y-6">
      <InfoCard title={t('mavlink-config:px4BatteryConfig.infoTitle')} variant="info">
        {t('mavlink-config:px4BatteryConfig.infoBody')}
      </InfoCard>

      <div className="grid grid-cols-2 gap-4">
        {/* Source Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">
                {t('mavlink-config:px4BatteryConfig.sourceTitle')}
              </h3>
              <p className="text-xs text-content-secondary">
                {t('mavlink-config:px4BatteryConfig.sourceSubtitle')}
              </p>
            </div>
          </div>

          <select
            value={values.source}
            disabled={!has('BAT1_SOURCE')}
            onChange={(e) => setParameter('BAT1_SOURCE', Number(e.target.value))}
            className="w-full px-3 py-2.5 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {sourceOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="bg-surface-raised rounded-lg p-3">
            <p className="text-xs text-content-secondary">
              {t('mavlink-config:px4BatteryConfig.sourceHint')}
            </p>
          </div>
        </div>

        {/* Capacity Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">
                {t('mavlink-config:px4BatteryConfig.capacityTitle')}
              </h3>
              <p className="text-xs text-content-secondary">
                {t('mavlink-config:px4BatteryConfig.capacitySubtitle')}
              </p>
            </div>
          </div>

          <DraggableSlider
            label={t('mavlink-config:px4BatteryConfig.capacityLabel')}
            value={Math.max(0, values.capacity)}
            onChange={(v) => setParameter('BAT1_CAPACITY', v)}
            min={0}
            max={100000}
            step={100}
            color="#22C55E"
            disabled={!has('BAT1_CAPACITY')}
            hint={t('mavlink-config:px4BatteryConfig.capacityHint')}
          />

          {!capacityKnown && (
            <div className="bg-amber-500/10 border-amber-500/30 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-400">
                {t('mavlink-config:px4BatteryConfig.capacityUnknown')}
              </p>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1.5">
              {t('mavlink-config:px4BatteryConfig.commonCapacities')}
            </div>
            <div className="flex flex-wrap gap-2">
              {[2200, 3000, 5000, 8000, 16000, 22000].map((cap) => (
                <button
                  key={cap}
                  onClick={() => setParameter('BAT1_CAPACITY', cap)}
                  disabled={!has('BAT1_CAPACITY')}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
                    values.capacity === cap
                      ? 'bg-blue-500 text-white'
                      : 'bg-surface-raised text-content-secondary hover:bg-surface-raised'
                  }`}
                >
                  {cap >= 1000
                    ? `${(cap / 1000).toFixed(cap % 1000 ? 1 : 0)} Ah` // i18n-exempt
                    : `${cap} mAh`}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Cell Count & Per-Cell Voltages */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Plug className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">
                {t('mavlink-config:px4BatteryConfig.cellTitle')}
              </h3>
              <p className="text-xs text-content-secondary">
                {t('mavlink-config:px4BatteryConfig.cellSubtitle')}
              </p>
            </div>
          </div>
          {values.nCells > 0 && (
            <span className="px-2 py-1 text-xs bg-surface-raised rounded text-content-secondary">
              {values.nCells}S
            </span>
          )}
        </div>

        {/* Cell-count quick presets */}
        <div className="flex gap-2">
          {cellPresets.map((cells) => {
            const isActive = values.nCells === cells;
            return (
              <button
                key={cells}
                onClick={() => setParameter('BAT1_N_CELLS', cells)}
                disabled={!has('BAT1_N_CELLS')}
                className={`flex-1 p-3 rounded-lg border text-center transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                  isActive
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                    : 'bg-surface border text-content hover:border'
                }`}
              >
                <div className="text-lg font-bold">{cells}S</div>
                <div className="text-[10px] text-content-secondary mt-1">
                  {t('mavlink-config:px4BatteryConfig.voltsFull', { volts: (cells * values.vCharged).toFixed(1) })}
                </div>
              </button>
            );
          })}
        </div>

        <DraggableSlider
          label={t('mavlink-config:px4BatteryConfig.cellCountLabel')}
          value={values.nCells}
          onChange={(v) => setParameter('BAT1_N_CELLS', v)}
          min={0}
          max={maxCells}
          step={1}
          color="#F59E0B"
          disabled={!has('BAT1_N_CELLS')}
          hint={t('mavlink-config:px4BatteryConfig.cellCountHint')}
        />

        <div className="grid grid-cols-2 gap-4">
          <DraggableSlider
            label={t('mavlink-config:px4BatteryConfig.fullCellLabel')}
            value={values.vCharged}
            onChange={(v) => setParameter('BAT1_V_CHARGED', v)}
            min={3.6}
            max={4.4}
            step={0.01}
            color="#22C55E"
            disabled={!has('BAT1_V_CHARGED')}
            hint={t('mavlink-config:px4BatteryConfig.fullCellHint')}
          />
          <DraggableSlider
            label={t('mavlink-config:px4BatteryConfig.emptyCellLabel')}
            value={values.vEmpty}
            onChange={(v) => setParameter('BAT1_V_EMPTY', v)}
            min={2.8}
            max={3.8}
            step={0.01}
            color="#EF4444"
            disabled={!has('BAT1_V_EMPTY')}
            hint={t('mavlink-config:px4BatteryConfig.emptyCellHint')}
          />
        </div>

        {values.nCells > 0 && (
          <div className="bg-surface-raised rounded-lg p-3">
            <div className="grid grid-cols-2 gap-3 text-center">
              <div>
                <div className="text-sm font-mono text-green-400">
                  {packFull.toFixed(1)}V
                </div>
                <div className="text-[10px] text-content-secondary">
                  {t('mavlink-config:px4BatteryConfig.packFull')}
                </div>
              </div>
              <div>
                <div className="text-sm font-mono text-red-400">
                  {packEmpty.toFixed(1)}V
                </div>
                <div className="text-[10px] text-content-secondary">
                  {t('mavlink-config:px4BatteryConfig.packEmpty')}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="bg-blue-500/5 border-blue-500/20 rounded-lg p-3">
          <p className="text-xs text-content-secondary">
            <Trans i18nKey="mavlink-config:px4BatteryConfig.socNote" components={{ b: <span className="text-blue-400" /> }} />
          </p>
        </div>
      </div>

      {/* Warning Thresholds */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">
              {t('mavlink-config:px4BatteryConfig.thresholdsTitle')}
            </h3>
            <p className="text-xs text-content-secondary">
              {t('mavlink-config:px4BatteryConfig.thresholdsSubtitle')}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label={t('mavlink-config:px4BatteryConfig.lowLabel')}
            value={Math.round(values.lowThr * 100)}
            onChange={(v) => setParameter('BAT_LOW_THR', v / 100)}
            min={12}
            max={50}
            step={1}
            color="#F59E0B"
            disabled={!has('BAT_LOW_THR')}
            hint={t('mavlink-config:px4BatteryConfig.lowHint')}
          />
          <DraggableSlider
            label={t('mavlink-config:px4BatteryConfig.critLabel')}
            value={Math.round(values.critThr * 100)}
            onChange={(v) => setParameter('BAT_CRIT_THR', v / 100)}
            min={5}
            max={50}
            step={1}
            color="#EF4444"
            disabled={!has('BAT_CRIT_THR')}
            hint={t('mavlink-config:px4BatteryConfig.critHint')}
          />
          <DraggableSlider
            label={t('mavlink-config:px4BatteryConfig.emergLabel')}
            value={Math.round(values.emergThr * 100)}
            onChange={(v) => setParameter('BAT_EMERGEN_THR', v / 100)}
            min={3}
            max={50}
            step={1}
            color="#DC2626"
            disabled={!has('BAT_EMERGEN_THR')}
            hint={t('mavlink-config:px4BatteryConfig.emergHint')}
          />
        </div>

        {/* Visual threshold bar (low > crit > emergency) */}
        <div className="relative h-3 bg-surface-inset rounded-full overflow-hidden">
          <div className="absolute inset-0 flex">
            <div className="h-full bg-red-500/50" style={{ width: '15%' }} />
            <div className="h-full bg-amber-500/50" style={{ width: '15%' }} />
            <div className="h-full bg-green-500/50" style={{ width: '70%' }} />
          </div>
          {values.emergThr > 0 && (
            <div
              className="absolute top-0 w-0.5 h-full bg-red-600"
              style={{ left: `${Math.min(100, values.emergThr * 100)}%` }}
            />
          )}
          {values.critThr > 0 && (
            <div
              className="absolute top-0 w-0.5 h-full bg-red-400"
              style={{ left: `${Math.min(100, values.critThr * 100)}%` }}
            />
          )}
          {values.lowThr > 0 && (
            <div
              className="absolute top-0 w-0.5 h-full bg-amber-400"
              style={{ left: `${Math.min(100, values.lowThr * 100)}%` }}
            />
          )}
        </div>
      </div>

      {/* Advanced calibration */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Wrench className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">
                {t('common:calibration')}
              </h3>
              <p className="text-xs text-content-secondary">
                {t('mavlink-config:px4BatteryConfig.calibrationSubtitle')}
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 text-[10px] bg-surface-raised text-content-secondary rounded">
            {t('common:advanced')}
          </span>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label={t('mavlink-config:px4BatteryConfig.rInternalLabel')}
            value={values.rInternal}
            onChange={(v) => setParameter('BAT1_R_INTERNAL', v)}
            min={-1}
            max={0.2}
            step={0.001}
            color="#8B5CF6"
            disabled={!has('BAT1_R_INTERNAL')}
            hint={t('mavlink-config:px4BatteryConfig.rInternalHint')}
          />

          {/* Voltage divider / amps-per-volt only exist on boards that expose
              them; render disabled when the param is absent. */}
          <DraggableSlider
            label={t('mavlink-config:px4BatteryConfig.vDivLabel')}
            value={Math.max(0, values.vDiv)}
            onChange={(v) => setParameter('BAT1_V_DIV', v)}
            min={0}
            max={50}
            step={0.001}
            color="#8B5CF6"
            disabled={!has('BAT1_V_DIV')}
            hint={
              has('BAT1_V_DIV')
                ? t('mavlink-config:px4BatteryConfig.vDivHint')
                : t('mavlink-config:px4BatteryConfig.notExposed')
            }
          />

          <DraggableSlider
            label={t('mavlink-config:px4BatteryConfig.aPerVLabel')}
            value={Math.max(0, values.aPerV)}
            onChange={(v) => setParameter('BAT1_A_PER_V', v)}
            min={0}
            max={200}
            step={0.01}
            color="#8B5CF6"
            disabled={!has('BAT1_A_PER_V')}
            hint={
              has('BAT1_A_PER_V')
                ? t('mavlink-config:px4BatteryConfig.aPerVHint')
                : t('mavlink-config:px4BatteryConfig.notExposed')
            }
          />
        </div>

        <div className="bg-surface-raised rounded-lg p-3">
          <p className="text-xs text-content-secondary">
            <Trans i18nKey="mavlink-config:px4BatteryConfig.calibrationTip" components={{ b: <span className="text-blue-400" /> }} />
          </p>
        </div>
      </div>

      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border-amber-500/30 p-4 flex items-center gap-3">
          <Save className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            {t('mavlink-config:px4BatteryConfig.unsavedNote')}
          </p>
        </div>
      )}
    </div>
  );
};

export default Px4BatteryConfig;
