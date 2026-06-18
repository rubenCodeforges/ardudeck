/**
 * Px4FlightModesConfig
 *
 * PX4 flight-mode-slot configuration that mirrors the ArduPilot FlightModesTab
 * UX (same cards, switch-position diagram, live RC slot highlight and Tailwind
 * tokens) but bound to PX4 parameters:
 *
 *   - RC_MAP_FLTMODE  : RC channel (1..18, 0 = unassigned) driving the 6-position
 *                       flight mode switch. RC_MAP_MODE_SW is the legacy name and
 *                       is used as a fallback when RC_MAP_FLTMODE is absent.
 *   - COM_FLTMODE1..6 : the PX4 commander mode assigned to each of the 6 PWM
 *                       ranges of that channel (-1 = Unassigned is valid).
 *
 * Mode-enum labels resolve from the bundled PX4 metadata (COM_FLTMODE1 `values`)
 * with a sensible fallback so the UI never renders empty.
 *
 * The live RC slot highlight reads the firmware-agnostic MAVLink RC_CHANNELS
 * message for the mapped channel and computes which of the 6 equal PWM ranges
 * the value falls into, the same idea as the ArduPilot tab. Params absent on the
 * connected vehicle render disabled so the UI never crashes.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Radio, Activity, AlertTriangle, HelpCircle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { InfoCard } from '../ui/InfoCard';

// The mode switch spans the channel from PWM_MIN to PWM_MAX, split into 6 equal
// ranges (slot 1 = lowest PWM, slot 6 = highest), matching PX4 commander logic.
const PWM_MIN = 1000;
const PWM_MAX = 2000;
const SLOT_COUNT = 6;
const SLOT_SPAN = (PWM_MAX - PWM_MIN) / SLOT_COUNT;

const MODE_SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => {
  const slot = i + 1;
  const min = Math.round(PWM_MIN + i * SLOT_SPAN);
  const max = Math.round(PWM_MIN + (i + 1) * SLOT_SPAN);
  return { slot, paramId: `COM_FLTMODE${slot}`, min, max };
});

const MAX_CHANNEL_MAP = 18;

// Fallback labels mirror the COM_FLTMODE metadata enum (used only when the
// bundled PX4 metadata is unavailable on this build).
const MODE_ENUM_FALLBACK: Record<number, string> = {
  [-1]: 'Unassigned',
  0: 'Manual',
  1: 'Altitude',
  2: 'Position',
  3: 'Mission',
  4: 'Hold',
  5: 'Return',
  6: 'Acro',
  7: 'Offboard',
  8: 'Stabilized',
  9: 'Position Slow',
  10: 'Takeoff',
  11: 'Land',
  12: 'Follow Me',
  13: 'Precision Land',
  16: 'Altitude Cruise',
};

const Px4FlightModesConfig: React.FC = () => {
  const { parameters, setParameter, getParameterMetadata, modifiedCount } = useParameterStore();
  const rcChannels = useTelemetryStore((s) => s.rcChannels);
  const lastRcChannels = useTelemetryStore((s) => s.lastRcChannels);

  // --- Live signal status (same logic as the ArduPilot tab) ---
  const [signalStatus, setSignalStatus] = useState<'none' | 'stale' | 'active'>('none');
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastRcChannels;
      if (lastRcChannels === 0 || rcChannels.chancount === 0) setSignalStatus('none');
      else if (elapsed > 2000) setSignalStatus('stale');
      else setSignalStatus('active');
    }, 250);
    return () => clearInterval(interval);
  }, [lastRcChannels, rcChannels.chancount]);

  // --- Mode-switch channel param (RC_MAP_FLTMODE, legacy RC_MAP_MODE_SW) ---
  const channelParamId = parameters.has('RC_MAP_FLTMODE')
    ? 'RC_MAP_FLTMODE'
    : parameters.has('RC_MAP_MODE_SW')
      ? 'RC_MAP_MODE_SW'
      : 'RC_MAP_FLTMODE';
  const channelPresent = parameters.has(channelParamId);
  const modeChannel = Number(parameters.get(channelParamId)?.value ?? 0);

  // --- Mode enum labels from bundled PX4 metadata, with fallback ---
  const modeOptions = useMemo(() => {
    const src = getParameterMetadata('COM_FLTMODE1')?.values ?? MODE_ENUM_FALLBACK;
    return Object.entries(src)
      .map(([v, label]) => ({ value: Number(v), label }))
      .sort((a, b) => a.value - b.value);
  }, [getParameterMetadata]);

  const labelForMode = (value: number): string => {
    const found = modeOptions.find((o) => o.value === value);
    return found?.label ?? `Mode ${value}`;
  };

  // --- Live RC value for the mapped channel ---
  const liveRcValue = useMemo(() => {
    if (signalStatus !== 'active' || modeChannel <= 0) return null;
    return rcChannels.channels[modeChannel - 1] ?? null;
  }, [rcChannels.channels, modeChannel, signalStatus]);

  // --- Which of the 6 equal PWM ranges is currently active ---
  const activeSlot = useMemo(() => {
    if (liveRcValue === null) return null;
    const clamped = Math.min(PWM_MAX - 1, Math.max(PWM_MIN, liveRcValue));
    const idx = Math.floor((clamped - PWM_MIN) / SLOT_SPAN);
    return Math.min(SLOT_COUNT, Math.max(1, idx + 1));
  }, [liveRcValue]);

  const channelOptions = useMemo(() => {
    const opts: { value: number; label: string }[] = [{ value: 0, label: 'Unassigned' }];
    for (let i = 1; i <= MAX_CHANNEL_MAP; i++) opts.push({ value: i, label: `Channel ${i}` });
    return opts;
  }, []);

  const modified = modifiedCount();

  return (
    <div className="p-6 space-y-6">
      <InfoCard title="Flight Mode Configuration" variant="info">
        Assign a PX4 flight mode to each of the 6 positions of your mode switch. PX4 splits the
        chosen RC channel into 6 equal ranges (slot 1 lowest, slot 6 highest) and applies the mode
        whose range the channel lands in. Unassigned slots are skipped.
      </InfoCard>

      {/* Mode Switch Channel */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-teal-500/20 flex items-center justify-center">
            <Radio className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="font-medium text-content">Mode Switch Channel</h3>
            <p className="text-xs text-content-secondary">Which RC channel selects the flight mode</p>
          </div>
          {signalStatus === 'active' ? (
            <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 text-[10px] bg-green-500/20 text-green-400 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
              LIVE
            </span>
          ) : (
            <span className="ml-auto text-[10px] text-content-tertiary">Connect to see live data</span>
          )}
        </div>
        <div className="max-w-sm">
          <label className="text-xs text-content-secondary mb-2 block">Mode channel ({channelParamId})</label>
          <select
            value={modeChannel}
            disabled={!channelPresent}
            onChange={(e) => setParameter(channelParamId, Number(e.target.value))}
            title={channelPresent ? undefined : 'Not present on this vehicle'}
            className="w-full bg-surface-raised text-content rounded-lg px-3 py-2 text-sm border focus:border-teal-500 focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {channelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {modeChannel > 0 && liveRcValue !== null && (
            <p className="text-[11px] text-content-tertiary mt-2 font-mono">
              Channel {modeChannel}: {liveRcValue} us
              {activeSlot !== null && ` -> slot ${activeSlot}`}
            </p>
          )}
          {modeChannel <= 0 && (
            <p className="text-[11px] text-amber-400/80 mt-2">
              No channel assigned. Select the channel wired to your mode switch.
            </p>
          )}
        </div>
      </div>

      {/* Mode Slots */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-content">Flight Mode Slots (All 6)</h3>
        <div className="grid grid-cols-2 gap-4">
          {MODE_SLOTS.map((slotDef) => {
            const present = parameters.has(slotDef.paramId);
            const value = Number(parameters.get(slotDef.paramId)?.value ?? -1);
            const isActive = activeSlot === slotDef.slot;
            const isUnassigned = value === -1;

            return (
              <div
                key={slotDef.slot}
                className={`bg-surface rounded-xl border p-4 space-y-3 transition-all ${
                  isActive ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10' : 'border-subtle'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isActive ? 'bg-cyan-500/20' : isUnassigned ? 'bg-surface-raised' : 'bg-teal-500/20'
                      }`}
                    >
                      <HelpCircle
                        className={`w-5 h-5 ${
                          isActive ? 'text-cyan-400' : isUnassigned ? 'text-content-tertiary' : 'text-teal-400'
                        }`}
                      />
                    </div>
                    <div>
                      <span className="text-sm font-medium text-content">Slot {slotDef.slot}</span>
                      <div className="text-[10px] text-content-secondary font-mono">
                        {slotDef.min}-{slotDef.max}
                      </div>
                    </div>
                  </div>
                  {isActive && (
                    <span className="px-2 py-0.5 text-[10px] bg-cyan-500/20 text-cyan-400 rounded-full">ACTIVE</span>
                  )}
                </div>

                {/* PWM Range Indicator */}
                <div className="relative h-2 bg-surface-inset rounded-full overflow-hidden">
                  <div
                    className={`absolute h-full rounded-full ${
                      isActive ? 'bg-cyan-500' : 'bg-gradient-to-r from-teal-500 to-teal-400'
                    }`}
                    style={{
                      left: `${((slotDef.min - PWM_MIN) / (PWM_MAX - PWM_MIN)) * 100}%`,
                      width: `${((slotDef.max - slotDef.min) / (PWM_MAX - PWM_MIN)) * 100}%`,
                    }}
                  />
                </div>

                {/* Mode Selector */}
                <select
                  value={value}
                  disabled={!present}
                  onChange={(e) => setParameter(slotDef.paramId, Number(e.target.value))}
                  title={present ? undefined : 'Not present on this vehicle'}
                  className="w-full px-3 py-2.5 bg-surface-input border border-subtle rounded-lg text-sm text-content focus:outline-none focus:border-teal-500 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {modeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

                {isActive && liveRcValue !== null && (
                  <p className="text-[11px] font-mono text-cyan-400/70">
                    Active now ({labelForMode(value)})
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* No live signal hint */}
      {signalStatus !== 'active' && (
        <div className="p-4 rounded-xl bg-surface border border-subtle">
          <div className="flex items-start gap-3">
            <Activity className="w-5 h-5 text-content-tertiary shrink-0 mt-0.5" />
            <p className="text-xs text-content-secondary">
              Connect to the vehicle and move your mode switch to see the active slot highlighted live.
            </p>
          </div>
        </div>
      )}

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border-amber-500/30 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            You have unsaved changes. Click <span className="font-medium">"Write to Flash"</span> in the header to save.
          </p>
        </div>
      )}
    </div>
  );
};

export default Px4FlightModesConfig;
