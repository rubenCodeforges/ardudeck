/**
 * StickTestPanel - injects synthetic RC stick positions via RC_CHANNELS_OVERRIDE
 * so the ArduPlane mixer drives outputs the same way real sticks would. This
 * is the correct way to bench-test mixer-assigned outputs (Aileron/Elevator/
 * Throttle), since DO_SET_SERVO is overwritten by the mixer every cycle.
 *
 * "Start" handles the whole bench setup: switch to MANUAL, force-arm (bypassing
 * pre-arm checks - safe on a bench, props off), then stream override at 10Hz.
 * "Release" undoes it: stop override, force-disarm.
 *
 * ArduPlane gates outputs on armed state, so without arming the mixer computes
 * outputs internally but doesn't drive the pins. There's no plane equivalent
 * of MAV_CMD_DO_MOTOR_TEST, so a force-armed MANUAL mode is the cleanest
 * "test the mixer" path.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Gamepad2, Square, AlertTriangle } from 'lucide-react';
import { useParameterStore } from '../../../stores/parameter-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';

// 50 Hz so we can outpace ELRS-MAVLink's RC stream when the GCS connection is
// over ELRS. At 10Hz we lose the race; at 50Hz our values dominate.
const SEND_INTERVAL_MS = 20;
const PLANE_MANUAL_MODE = 0;  // ArduPlane custom_mode for MANUAL

interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  center: number;
  onChange: (v: number) => void;
}

interface SliderRowExtProps extends SliderRowProps {
  fcValue: number;
}

const SliderRow: React.FC<SliderRowExtProps> = ({ label, value, min, max, center, onChange, fcValue }) => {
  const matches = Math.abs(fcValue - value) < 30; // within RC deadzone
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-sm text-content-secondary font-medium">{label}</div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(center)}
        className="flex-1 accent-pink-500"
      />
      <div className="w-16 text-right text-sm font-mono text-content">{value}</div>
      <div className={`w-20 text-right text-xs font-mono ${fcValue === 0 ? 'text-content-tertiary' : matches ? 'text-emerald-400' : 'text-amber-400'}`}>
        FC: {fcValue || '—'}
      </div>
    </div>
  );
};

export const StickTestPanel: React.FC = () => {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roll, setRoll] = useState(1500);
  const [pitch, setPitch] = useState(1500);
  const [throttle, setThrottle] = useState(1100);
  const [yaw, setYaw] = useState(1500);

  // Track the original ARMING_CHECK so we can restore it on Release. We zero
  // it during the test because RC_CHANNELS_OVERRIDE doesn't satisfy ArduPilot's
  // "RC found" pre-arm gate even with force=21196.
  const savedArmingCheckRef = useRef<number | null>(null);

  const parameters = useParameterStore((s) => s.parameters);
  const setParameter = useParameterStore((s) => s.setParameter);

  // Live RC values as the FC sees them (msg 65 RC_CHANNELS). Diagnostic for
  // whether our RC_CHANNELS_OVERRIDE is winning at the FC's input layer.
  const rcChannels = useTelemetryStore((s) => s.rcChannels);
  const fcCh = (idx: number) => rcChannels?.channels[idx] ?? 0;

  // Look up FLTMODE_CH so we can pin it to FLTMODE1's PWM band during the
  // test. Without this, ArduPlane keeps reading the unconnected RX as trim
  // (1500us) and switches OUT of MANUAL into whatever FLTMODE4 is set to.
  const fltmodeChannel = parameters.get('FLTMODE_CH')?.value;

  const valuesRef = useRef({ roll, pitch, throttle, yaw });
  valuesRef.current = { roll, pitch, throttle, yaw };

  // Stream the override at 50Hz while active.
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const v = valuesRef.current;
      // PWM 1000 falls in the FLTMODE1 band (<=1230) which the user has set
      // to MANUAL. Sending it on the FLTMODE channel keeps the FC out of
      // STABILIZE for the duration of the test.
      void window.electronAPI?.rcOverrideSet?.(v.roll, v.pitch, v.throttle, v.yaw, fltmodeChannel, 1000);
    };
    tick();
    const id = setInterval(tick, SEND_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, fltmodeChannel]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    let preArmInterval: NodeJS.Timeout | null = null;
    try {
      // 1. Save and zero ARMING_CHECK. RC_CHANNELS_OVERRIDE does not satisfy
      //    the "RC present" pre-arm gate (even with force=21196), so we have
      //    to relax it for the duration of the test. Restored on Release.
      const currentCheck = parameters.get('ARMING_CHECK')?.value;
      if (currentCheck !== undefined && currentCheck !== 0) {
        savedArmingCheckRef.current = currentCheck;
        const ok = await setParameter('ARMING_CHECK', 0);
        if (!ok) {
          setError('Failed to relax ARMING_CHECK');
          setBusy(false);
          return;
        }
      }

      // 2. Set mode to MANUAL so the mixer just passes sticks through with no
      //    autopilot stabilization fighting our demands.
      const modeOk = await window.electronAPI?.mavlinkSetMode?.(PLANE_MANUAL_MODE);
      if (!modeOk) {
        setError('Failed to set MANUAL mode');
        setBusy(false);
        return;
      }

      // 3. Stream centered RC override BEFORE arming so ArduPilot sees stable
      //    "RC present" values. Throttle at 1100 (matches typical RC3_MIN) so
      //    the 0-throttle arming check passes regardless of stick deadzone.
      const sendCentered = () => {
        void window.electronAPI?.rcOverrideSet?.(1500, 1500, 1100, 1500, fltmodeChannel, 1000);
      };
      sendCentered();
      preArmInterval = setInterval(sendCentered, SEND_INTERVAL_MS);
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 4. Force-arm.
      const armOk = await window.electronAPI?.mavlinkArmDisarm?.(true, true);
      if (!armOk) {
        setError('Failed to arm vehicle - check Messages for PreArm reason');
        setBusy(false);
        if (preArmInterval) clearInterval(preArmInterval);
        void window.electronAPI?.rcOverrideRelease?.();
        return;
      }

      // 5. Hand off streaming from the prearm interval to the active useEffect.
      if (preArmInterval) clearInterval(preArmInterval);
      setActive(true);
    } catch (e) {
      if (preArmInterval) clearInterval(preArmInterval);
      void window.electronAPI?.rcOverrideRelease?.();
      setError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }, [parameters, setParameter, fltmodeChannel]);

  const release = useCallback(async () => {
    setBusy(true);
    setActive(false);
    setThrottle(1000);
    setRoll(1500);
    setPitch(1500);
    setYaw(1500);
    try {
      await window.electronAPI?.rcOverrideRelease?.();
      await window.electronAPI?.mavlinkArmDisarm?.(false, true);
      // Restore ARMING_CHECK if we changed it.
      if (savedArmingCheckRef.current !== null) {
        await setParameter('ARMING_CHECK', savedArmingCheckRef.current);
        savedArmingCheckRef.current = null;
      }
    } finally {
      setBusy(false);
    }
  }, [setParameter]);

  // Safety: release on unmount so we don't leave the FC armed with overrides
  // and ARMING_CHECK relaxed if the user navigates away or closes the app.
  useEffect(() => {
    return () => {
      void window.electronAPI?.rcOverrideRelease?.();
      void window.electronAPI?.mavlinkArmDisarm?.(false, true);
      const saved = savedArmingCheckRef.current;
      if (saved !== null) {
        void setParameter('ARMING_CHECK', saved);
        savedArmingCheckRef.current = null;
      }
    };
  }, [setParameter]);

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
          <Gamepad2 className="w-5 h-5 text-pink-400" />
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-content">Stick Test</h3>
          <p className="text-sm text-content-secondary">
            Inject synthetic RC input. Mixer drives outputs as if you moved real sticks. Double-click a slider to recenter.
          </p>
        </div>
        {active ? (
          <button
            type="button"
            disabled={busy}
            onClick={release}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-lg border border-amber-500/40 text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 text-sm font-medium"
          >
            <Square className="w-4 h-4" /> Release
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={start}
            className="h-9 px-4 inline-flex items-center gap-2 rounded-lg border border-pink-500/40 text-pink-300 bg-pink-500/10 hover:bg-pink-500/20 disabled:opacity-50 text-sm font-medium"
          >
            <Gamepad2 className="w-4 h-4" /> Start
          </button>
        )}
      </div>

      {!active && !busy && (
        <div className="mb-4 text-xs text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            Start sets MANUAL mode and force-arms the vehicle (bypassing pre-arm checks). Bench use only - remove propellers before pressing Start.
          </div>
        </div>
      )}

      <div className="space-y-2">
        <SliderRow label="Roll"     value={roll}     min={1100} max={1900} center={1500} onChange={setRoll}     fcValue={fcCh(0)} />
        <SliderRow label="Pitch"    value={pitch}    min={1100} max={1900} center={1500} onChange={setPitch}    fcValue={fcCh(1)} />
        <SliderRow label="Throttle" value={throttle} min={1100} max={1900} center={1100} onChange={setThrottle} fcValue={fcCh(2)} />
        <SliderRow label="Yaw"      value={yaw}      min={1100} max={1900} center={1500} onChange={setYaw}      fcValue={fcCh(3)} />
      </div>

      <div className="mt-2 text-[11px] text-content-tertiary">
        FC column shows what the autopilot currently reads on RC1-4 (msg 65). Green = matches your slider (override winning). Amber = mismatch. Dash = FC isn't reporting RC at all.
      </div>

      {active && (
        <div className="mt-4 text-xs text-pink-400/80 bg-pink-500/5 border border-pink-500/20 rounded-lg p-3">
          Armed in MANUAL mode. Override streaming at {Math.round(1000 / SEND_INTERVAL_MS)}Hz. Click Release to stop and disarm.
        </div>
      )}

      {error && (
        <div className="mt-4 text-xs text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          {error}
        </div>
      )}
    </div>
  );
};
