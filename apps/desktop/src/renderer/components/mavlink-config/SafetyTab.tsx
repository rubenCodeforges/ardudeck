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
import { useConnectionStore } from '../../stores/connection-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
import { PresetSelector, type Preset } from '../ui/PresetSelector';
import { SigningSection } from '../settings/SigningSection';
import {
  SAFETY_PRESETS,
  FENCE_TYPES,
  ARMING_CHECKS,
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

// Fallback enum labels for PX4 failsafe/geofence params, used when bundled
// metadata is unavailable. Labels mirror the PX4 parameter metadata values.
const PX4_ENUM_FALLBACK: Record<string, Record<number, string>> = {
  NAV_RCL_ACT: { 1: 'Hold mode', 2: 'Return mode', 3: 'Land mode', 5: 'Terminate', 6: 'Disarm' },
  COM_RC_IN_MODE: {
    0: 'RC only',
    1: 'MAVLink only',
    2: 'RC or MAVLink with fallback',
    3: 'RC or MAVLink keep first',
    4: 'Disable manual control',
    5: 'Prio: RC > MAVL 1 > MAVL 2',
    6: 'Prio: MAVL 1 > MAVL 2 > RC',
    7: 'Prio: RC > MAVL 2 > MAVL 1',
    8: 'Prio: MAVL 2 > MAVL 1 > RC',
  },
  NAV_DLL_ACT: { 0: 'Disabled', 1: 'Hold mode', 2: 'Return mode', 3: 'Land mode', 5: 'Terminate', 6: 'Disarm' },
  COM_LOW_BAT_ACT: { 0: 'Warning', 2: 'Land mode', 3: 'Return at critical level, land at emergency level' },
  GF_ACTION: { 0: 'None', 1: 'Warning', 2: 'Hold mode', 3: 'Return mode', 4: 'Terminate', 5: 'Land mode' },
};

const Px4SafetyConfig: React.FC<{
  parameters: ReturnType<typeof useParameterStore.getState>['parameters'];
  setParameter: (id: string, value: number) => void;
  getParameterMetadata: ReturnType<typeof useParameterStore.getState>['getParameterMetadata'];
}> = ({ parameters, setParameter, getParameterMetadata }) => {
  // Resolve enum options from bundled metadata first, then fall back to known labels.
  const enumOptions = useCallback((paramId: string): Array<{ value: number; label: string }> => {
    const fromMeta = getParameterMetadata(paramId)?.values;
    const source = fromMeta && Object.keys(fromMeta).length > 0 ? fromMeta : PX4_ENUM_FALLBACK[paramId];
    if (!source) return [];
    return Object.entries(source)
      .map(([value, label]) => ({ value: Number(value), label }))
      .sort((a, b) => a.value - b.value);
  }, [getParameterMetadata]);

  const num = useCallback((id: string, fallback: number) => parameters.get(id)?.value ?? fallback, [parameters]);

  const renderEnum = (paramId: string, currentFallback: number) => {
    const options = enumOptions(paramId);
    const value = num(paramId, currentFallback);
    return (
      <select
        value={value}
        onChange={(e) => setParameter(paramId, Number(e.target.value))}
        className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
      >
        {options.length > 0 ? (
          options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ) : (
          <option value={value}>{`Value ${value}`}</option>
        )}
      </select>
    );
  };

  const px4Values = useMemo(() => ({
    navRclAct: num('NAV_RCL_ACT', 2),
    comRcLossT: num('COM_RC_LOSS_T', 0.5),
    comRcInMode: num('COM_RC_IN_MODE', 3),
    navDllAct: num('NAV_DLL_ACT', 0),
    comDlLossT: num('COM_DL_LOSS_T', 10),
    comLowBatAct: num('COM_LOW_BAT_ACT', 0),
    gfAction: num('GF_ACTION', 2),
    gfMaxHorDist: num('GF_MAX_HOR_DIST', 0),
    gfMaxVerDist: num('GF_MAX_VER_DIST', 0),
    comDisarmLand: num('COM_DISARM_LAND', 2),
    comDisarmPrflt: num('COM_DISARM_PRFLT', 10),
  }), [num]);

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* RC Loss Card */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">RC Signal Lost</h3>
            <p className="text-xs text-content-secondary">What happens when manual control signal is lost</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-content-secondary block mb-1.5">Failsafe Action (NAV_RCL_ACT)</label>
            {renderEnum('NAV_RCL_ACT', px4Values.navRclAct)}
          </div>

          <DraggableSlider
            label="Loss Timeout (s)"
            value={Math.round(px4Values.comRcLossT * 10)}
            onChange={(v) => setParameter('COM_RC_LOSS_T', v / 10)}
            min={0}
            max={350}
            step={1}
            color="#EF4444"
            hint="COM_RC_LOSS_T: delay before declaring RC loss"
            formatValue={(v) => (v / 10).toFixed(1)}
          />

          <div>
            <label className="text-xs text-content-secondary block mb-1.5">Manual Control Source (COM_RC_IN_MODE)</label>
            {renderEnum('COM_RC_IN_MODE', px4Values.comRcInMode)}
          </div>
        </div>
      </div>

      {/* Datalink Loss Card */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Monitor className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">Datalink Lost</h3>
            <p className="text-xs text-content-secondary">What happens when the GCS connection is lost</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-content-secondary block mb-1.5">Failsafe Action (NAV_DLL_ACT)</label>
            {renderEnum('NAV_DLL_ACT', px4Values.navDllAct)}
          </div>

          <DraggableSlider
            label="Loss Timeout (s)"
            value={px4Values.comDlLossT}
            onChange={(v) => setParameter('COM_DL_LOSS_T', v)}
            min={5}
            max={300}
            step={1}
            color="#A855F7"
            hint="COM_DL_LOSS_T: delay before declaring datalink loss"
          />
        </div>

        <div className="bg-surface-raised rounded-lg p-3">
          <p className="text-xs text-content-secondary">
            <span className="text-amber-400">Tip:</span> Datalink failsafe needs a telemetry
            heartbeat. If flying without a GCS link, set the action to Disabled.
          </p>
        </div>
      </div>

      {/* Low Battery Card */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Battery className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">Low Battery</h3>
            <p className="text-xs text-content-secondary">Protect against flying with a depleted battery</p>
          </div>
        </div>

        <div>
          <label className="text-xs text-content-secondary block mb-1.5">Failsafe Action (COM_LOW_BAT_ACT)</label>
          {renderEnum('COM_LOW_BAT_ACT', px4Values.comLowBatAct)}
        </div>

        <div className="bg-surface-raised rounded-lg p-3">
          <p className="text-xs text-content-secondary">
            Battery warning, critical, and emergency thresholds are configured on the Battery tab
            (BAT_LOW_THR, BAT_CRIT_THR, BAT_EMERGEN_THR).
          </p>
        </div>
      </div>

      {/* Geofence Card */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Fence className="w-5 h-5 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">Geofence</h3>
            <p className="text-xs text-content-secondary">Limit how far the vehicle can travel from home</p>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-content-secondary block mb-1.5">Violation Action (GF_ACTION)</label>
            {renderEnum('GF_ACTION', px4Values.gfAction)}
          </div>

          <DraggableSlider
            label="Max Horizontal Distance (m)"
            value={px4Values.gfMaxHorDist}
            onChange={(v) => setParameter('GF_MAX_HOR_DIST', v)}
            min={0}
            max={10000}
            step={10}
            color="#3B82F6"
            hint="GF_MAX_HOR_DIST: 0 disables the horizontal limit"
          />

          <DraggableSlider
            label="Max Vertical Distance (m)"
            value={px4Values.gfMaxVerDist}
            onChange={(v) => setParameter('GF_MAX_VER_DIST', v)}
            min={0}
            max={10000}
            step={10}
            color="#3B82F6"
            hint="GF_MAX_VER_DIST: 0 disables the altitude limit"
          />
        </div>
      </div>

      {/* Auto-Disarm Card */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">Auto-Disarm</h3>
            <p className="text-xs text-content-secondary">Automatically disarm after landing or idle on the ground</p>
          </div>
        </div>

        <div className="space-y-3">
          <DraggableSlider
            label="Disarm After Landing (s)"
            value={Math.round(px4Values.comDisarmLand * 10)}
            onChange={(v) => setParameter('COM_DISARM_LAND', v / 10)}
            min={0}
            max={200}
            step={1}
            color="#22C55E"
            hint="COM_DISARM_LAND: 0 disables auto-disarm after landing"
            formatValue={(v) => (v / 10).toFixed(1)}
          />

          <DraggableSlider
            label="Disarm If Not Taking Off (s)"
            value={Math.round(px4Values.comDisarmPrflt * 10)}
            onChange={(v) => setParameter('COM_DISARM_PRFLT', v / 10)}
            min={0}
            max={300}
            step={1}
            color="#22C55E"
            hint="COM_DISARM_PRFLT: 0 disables preflight idle auto-disarm"
            formatValue={(v) => (v / 10).toFixed(1)}
          />
        </div>
      </div>
    </div>
  );
};

const SafetyTab: React.FC = () => {
  const { parameters, setParameter, modifiedCount, fetchParameters, isLoading } = useParameterStore();
  const getParameterMetadata = useParameterStore((s) => s.getParameterMetadata);
  const firmware = useConnectionStore((s) => s.connectionState.firmware);

  // Check if parameters are loaded
  const hasParameters = parameters.size > 0;

  // Get current safety values
  const safetyValues = useMemo(() => ({
    // Throttle failsafe
    fsThrEnable: parameters.get('FS_THR_ENABLE')?.value ?? 1,
    fsThrValue: parameters.get('FS_THR_VALUE')?.value ?? 975,
    // GCS failsafe
    fsGcsEnable: parameters.get('FS_GCS_ENABLE')?.value ?? 0,
    // Battery failsafe (low)
    battFsLowAct: parameters.get('BATT_FS_LOW_ACT')?.value ?? 0,
    battLowVolt: parameters.get('BATT_LOW_VOLT')?.value ?? 0,
    battLowMah: parameters.get('BATT_LOW_MAH')?.value ?? 0,
    // Battery failsafe (critical)
    battFsCrtAct: parameters.get('BATT_FS_CRT_ACT')?.value ?? 0,
    battCrtVolt: parameters.get('BATT_CRT_VOLT')?.value ?? 0,
    battCrtMah: parameters.get('BATT_CRT_MAH')?.value ?? 0,
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

  // Individual arming check entries (exclude bit 1 "All" which is a special flag)
  const armingCheckEntries = useMemo(() =>
    Object.entries(ARMING_CHECKS)
      .filter(([bit]) => Number(bit) !== 1)
      .map(([bit, info]) => ({ bit: Number(bit), ...info }))
      .sort((a, b) => a.bit - b.bit),
    []
  );

  // All individual bits OR'd together (65534 = all checks except the "All" flag)
  const allBitsValue = useMemo(() =>
    armingCheckEntries.reduce((acc, entry) => acc | entry.bit, 0),
    [armingCheckEntries]
  );

  const isCustomMode = safetyValues.armingCheck !== 1 && safetyValues.armingCheck !== 0;

  const toggleArmingCheck = useCallback((bit: number) => {
    const newValue = safetyValues.armingCheck ^ bit;
    setParameter('ARMING_CHECK', newValue);
  }, [safetyValues.armingCheck, setParameter]);

  const modified = modifiedCount();

  if (firmware === 'px4') {
    return (
      <div className="p-6 space-y-6">
        {!hasParameters && (
          <div className="bg-amber-500/10 rounded-xl border-amber-500/30 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <Lightbulb className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-amber-300 font-medium">Parameters Not Loaded</p>
                <p className="text-xs text-content-secondary">Fetch parameters from the FC to configure failsafes</p>
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

        <InfoCard title="Safety Features" variant="info">
          Configure what PX4 does when things go wrong. Failsafes can save your aircraft
          from flyaways and crashes. Each card maps directly to PX4 parameters.
        </InfoCard>

        <Px4SafetyConfig
          parameters={parameters}
          setParameter={setParameter}
          getParameterMetadata={getParameterMetadata}
        />

        <SigningSection />

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
  }

  return (
    <div className="p-6 space-y-6">
      {/* Parameters not loaded warning */}
      {!hasParameters && (
        <div className="bg-amber-500/10 rounded-xl border-amber-500/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-amber-300 font-medium">Parameters Not Loaded</p>
              <p className="text-xs text-content-secondary">Fetch parameters from the FC to use presets</p>
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
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <Radio className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">RC Signal Lost</h3>
              <p className="text-xs text-content-secondary">What happens when transmitter signal is lost</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">Action</label>
              <select
                value={safetyValues.fsThrEnable}
                onChange={(e) => setParameter('FS_THR_ENABLE', Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
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
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">GCS Connection Lost</h3>
              <p className="text-xs text-content-secondary">What happens when ground station disconnects</p>
            </div>
          </div>

          <div>
            <label className="text-xs text-content-secondary block mb-1.5">Action</label>
            <select
              value={safetyValues.fsGcsEnable}
              onChange={(e) => setParameter('FS_GCS_ENABLE', Number(e.target.value))}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
            >
              <option value={0}>Disabled</option>
              <option value={1}>RTL - Return to Launch</option>
              <option value={2}>Continue Mission</option>
              <option value={3}>SmartRTL or RTL</option>
              <option value={4}>SmartRTL or Land</option>
              <option value={5}>Land Immediately</option>
            </select>
          </div>

          <div className="bg-surface-raised rounded-lg p-3">
            <p className="text-xs text-content-secondary">
              <span className="text-amber-400">Tip:</span> GCS failsafe requires heartbeat
              from ground station. If flying without GCS, leave disabled.
            </p>
          </div>
        </div>

        {/* Battery Failsafe Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Battery className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Low Battery</h3>
              <p className="text-xs text-content-secondary">Protect against flying home with dead battery</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">Action</label>
              <select
                value={safetyValues.battFsLowAct}
                onChange={(e) => setParameter('BATT_FS_LOW_ACT', Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              >
                <option value={0}>Disabled</option>
                <option value={1}>Land Immediately</option>
                <option value={2}>RTL - Return to Launch</option>
              </select>
            </div>

            <DraggableSlider
              label="Low Voltage (V)"
              value={Math.round(safetyValues.battLowVolt * 10)}
              onChange={(v) => setParameter('BATT_LOW_VOLT', v / 10)}
              min={0}
              max={260}
              step={1}
              color="#F59E0B"
              hint="Trigger when voltage drops below this"
            />

            <DraggableSlider
              label="Low mAh Remaining"
              value={safetyValues.battLowMah}
              onChange={(v) => setParameter('BATT_LOW_MAH', v)}
              min={0}
              max={10000}
              step={100}
              color="#F59E0B"
              hint="Trigger when remaining mAh drops below this"
            />
          </div>
        </div>

        {/* Critical Battery Failsafe Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Critical Battery</h3>
              <p className="text-xs text-content-secondary">Last resort when battery is dangerously low</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">Action</label>
              <select
                value={safetyValues.battFsCrtAct}
                onChange={(e) => setParameter('BATT_FS_CRT_ACT', Number(e.target.value))}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              >
                <option value={0}>Disabled</option>
                <option value={1}>Land Immediately</option>
                <option value={2}>RTL - Return to Launch</option>
              </select>
            </div>

            <DraggableSlider
              label="Critical Voltage (V)"
              value={Math.round(safetyValues.battCrtVolt * 10)}
              onChange={(v) => setParameter('BATT_CRT_VOLT', v / 10)}
              min={0}
              max={260}
              step={1}
              color="#EF4444"
              hint="Emergency action when voltage drops below this"
            />

            <DraggableSlider
              label="Critical mAh Remaining"
              value={safetyValues.battCrtMah}
              onChange={(v) => setParameter('BATT_CRT_MAH', v)}
              min={0}
              max={10000}
              step={100}
              color="#EF4444"
              hint="Emergency action when remaining mAh drops below this"
            />
          </div>

          <div className="bg-surface-raised rounded-lg p-3">
            <p className="text-xs text-content-secondary">
              <span className="text-red-400">Warning:</span> Critical battery should trigger a more
              aggressive action than low battery (e.g. Land vs RTL). Set voltage lower than the low battery threshold.
            </p>
          </div>
        </div>

        {/* Geofence Card */}
        <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <Fence className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-medium text-content">Geofence</h3>
                <p className="text-xs text-content-secondary">Prevent flying out of bounds</p>
              </div>
            </div>
            <button
              onClick={() => setParameter('FENCE_ENABLE', safetyValues.fenceEnable ? 0 : 1)}
              className={`relative w-12 h-6 rounded-full transition-colors ${
                safetyValues.fenceEnable ? 'bg-blue-500' : 'bg-surface-raised'
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
                <label className="text-xs text-content-secondary block mb-1.5">Fence Type</label>
                <select
                  value={safetyValues.fenceType}
                  onChange={(e) => setParameter('FENCE_TYPE', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
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
                <label className="text-xs text-content-secondary block mb-1.5">Breach Action</label>
                <select
                  value={safetyValues.fenceAction}
                  onChange={(e) => setParameter('FENCE_ACTION', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
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
            <div className="bg-surface-raised rounded-lg p-3">
              <p className="text-xs text-content-secondary">
                Enable geofence to set altitude and distance limits.
                Your aircraft will RTL or land if it breaches the fence.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Arming Checks */}
      <div className="bg-surface rounded-xl border border-subtle p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">Arming Checks</h3>
              <p className="text-xs text-content-secondary">What must pass before motors can arm</p>
            </div>
          </div>
          <select
            value={safetyValues.armingCheck === 1 ? 'all' : safetyValues.armingCheck === 0 ? 'none' : 'custom'}
            onChange={(e) => {
              if (e.target.value === 'all') setParameter('ARMING_CHECK', 1);
              else if (e.target.value === 'none') setParameter('ARMING_CHECK', 0);
              else if (e.target.value === 'custom') setParameter('ARMING_CHECK', allBitsValue);
            }}
            className="px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Checks (Recommended)</option>
            <option value="none">No Checks (Dangerous!)</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {safetyValues.armingCheck === 0 && (
          <div className="bg-red-500/10 border-red-500/30 rounded-lg p-3 flex items-center gap-2">
            <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">
              <span className="font-medium">Warning:</span> Disabling arming checks is dangerous!
              Your aircraft could arm with faulty sensors or no GPS lock.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {armingCheckEntries.map((check) => {
            const isEnabled = safetyValues.armingCheck === 1 || (safetyValues.armingCheck & check.bit) !== 0;
            return (
              <button
                key={check.bit}
                onClick={() => isCustomMode && toggleArmingCheck(check.bit)}
                title={isCustomMode ? check.description : 'Switch to Custom mode to toggle individual checks'}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                  isEnabled ? 'bg-green-500/10 text-green-400' : 'bg-surface-raised text-content-secondary'
                } ${isCustomMode ? 'cursor-pointer hover:bg-surface-overlay-subtle' : 'cursor-default'}`}
              >
                {isEnabled ? (
                  <CheckCircle className="w-3 h-3 shrink-0" />
                ) : (
                  <XCircle className="w-3 h-3 shrink-0" />
                )}
                <span>{check.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MAVLink Signing */}
      <SigningSection />

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

export default SafetyTab;
