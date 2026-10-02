/**
 * MotorTestTab — ArduPilot motor test with live vibration + ESC telemetry.
 *
 * Lives as a tab inside MavlinkConfigView. Copter-only in v1. Provides a
 * visual frame diagram with clickable motors, throttle/duration controls,
 * and live monitoring cards for vibration and ESC telemetry.
 *
 * Safety:
 *   - First-use dialog requires the user to confirm props are removed
 *   - Disabled when vehicle is armed
 *   - Auto-stops all motors on unmount
 *   - Soft warning banner when throttle > 25%
 *   - "Stop All" sends throttle=0 to every motor, always reachable
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DraftNumberInput } from '../../../hooks/useNumericDraft';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Play, Square, Zap, Shield } from 'lucide-react';
import { useParameterStore } from '../../../stores/parameter-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useMotorTestStore } from '../../../stores/motor-test-store';
import { FrameDiagram } from './FrameDiagram';
import { VibrationCard } from './VibrationCard';
import { EscTelemetryCard } from './EscTelemetryCard';
import {
  buildGenericLayout,
  buildPx4Layout,
  findFrameLayout,
  getFrameClassType,
  testOrderToLabel,
  frameTypeDisplayName,
} from './motor-layout-utils';

const HIGH_THROTTLE_WARNING = 25;

export const MotorTestTab: React.FC = () => {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const escTelemetry = useTelemetryStore((s) => s.escTelemetry);

  const {
    throttle,
    duration,
    activeMotor,
    sequenceRunning,
    safetyConfirmed,
    lastError,
    setThrottle,
    setDuration,
    setActiveMotor,
    setSequenceRunning,
    confirmSafety,
    setLastError,
  } = useMotorTestStore();

  const [showSafetyDialog, setShowSafetyDialog] = useState(false);

  const isPx4 = connectionState.firmware === 'px4';
  // PX4 refuses ACTUATOR_TEST unless COM_MOT_TEST_EN is 1
  const px4TestDisabled = isPx4 && parameters.get('COM_MOT_TEST_EN')?.value === 0;

  // Resolve the frame layout: PX4 from CA_ROTOR geometry, ArduPilot from
  // FRAME_CLASS / FRAME_TYPE parameters
  const layout = useMemo(() => {
    if (isPx4) {
      return buildPx4Layout((key) => parameters.get(key)?.value) ?? buildGenericLayout(4);
    }
    const frameInfo = getFrameClassType((key) => parameters.get(key)?.value);
    if (!frameInfo) return buildGenericLayout(4);
    const found = findFrameLayout(frameInfo.frameClass, frameInfo.frameType);
    return found ?? buildGenericLayout(4);
  }, [parameters, isPx4]);

  const motorCount = layout.motors.length;

  // Motors sorted by TestOrder so "Test In Sequence" and the buttons follow physical order
  const motorsByTestOrder = useMemo(
    () => layout.motors.slice().sort((a, b) => a.TestOrder - b.TestOrder),
    [layout]
  );

  // Build an RPM-by-motor map for the frame diagram
  const rpmByMotor = useMemo(() => {
    const map = new Map<number, number>();
    if (escTelemetry) {
      escTelemetry.motors.forEach((m, idx) => {
        if (m && m.rpm > 0) map.set(idx + 1, m.rpm);
      });
    }
    return map;
  }, [escTelemetry]);

  // Armed state detection
  const isArmed = connectionState.isConnected && useTelemetryStore.getState().flight.armed;

  // Connection gating
  const canTest =
    connectionState.isConnected &&
    connectionState.protocol === 'mavlink' &&
    !isArmed &&
    !px4TestDisabled &&
    safetyConfirmed;

  // First-use safety dialog
  useEffect(() => {
    if (!safetyConfirmed && connectionState.isConnected && connectionState.protocol === 'mavlink') {
      setShowSafetyDialog(true);
    }
  }, [safetyConfirmed, connectionState.isConnected, connectionState.protocol]);

  // Auto-stop all motors when the view unmounts.
  // We intentionally do not depend on motorCount or connection state — we
  // want the cleanup to capture values at mount time and fire once on unmount.
  const unmountMotorCountRef = React.useRef(motorCount);
  unmountMotorCountRef.current = motorCount;
  useEffect(() => {
    return () => {
      const count = unmountMotorCountRef.current;
      if (count > 0) {
        void window.electronAPI?.motorTestStop?.(count);
      }
    };
  }, []);

  const testMotor = useCallback(
    async (motorNumber: number) => {
      if (!canTest) return;
      setLastError(null);
      setActiveMotor(motorNumber);
      // DO_MOTOR_TEST param1 is ArduPilot's test-order index (param6=0 = default
      // order), not the servo output number. Send the clicked motor's TestOrder so
      // the physical motor that spins matches the labelled/highlighted one; on frames
      // like Betaflight Reversed, Number and TestOrder differ.
      const testOrder = layout.motors.find((m) => m.Number === motorNumber)?.TestOrder ?? motorNumber;
      try {
        const result = await window.electronAPI?.motorTestStart?.({
          motor: testOrder,
          throttle,
          duration,
          throttleType: 'percent',
        });
        if (!result?.success) {
          setLastError(result?.error ?? t('mavlink-config:motorTestTab.commandFailed'));
        }
      } catch (err) {
        setLastError(err instanceof Error ? err.message : String(err));
      }
      // Clear active motor after the test duration + a small buffer
      window.setTimeout(() => setActiveMotor(null), duration * 1000 + 300);
    },
    [canTest, throttle, duration, layout, setActiveMotor, setLastError, t]
  );

  const testAllInSequence = useCallback(async () => {
    if (!canTest) return;
    setLastError(null);
    setSequenceRunning(true);
    try {
      // Start sequence at motor 1 (first in TestOrder), FC walks through motorCount motors
      const result = await window.electronAPI?.motorTestStart?.({
        motor: 1,
        throttle,
        duration,
        throttleType: 'percent',
        motorCount,
      });
      if (!result?.success) {
        setLastError(result?.error ?? t('mavlink-config:motorTestTab.commandFailed'));
        setSequenceRunning(false);
        return;
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
      setSequenceRunning(false);
      return;
    }
    // Release sequence lock after total duration
    window.setTimeout(
      () => {
        setSequenceRunning(false);
        setActiveMotor(null);
      },
      duration * motorCount * 1000 + 500
    );
  }, [canTest, throttle, duration, motorCount, setActiveMotor, setLastError, setSequenceRunning, t]);

  const testAllAtOnce = useCallback(async () => {
    if (!canTest) return;
    setLastError(null);
    setSequenceRunning(true);
    try {
      // Send individual test commands for all motors simultaneously
      const promises = motorsByTestOrder.map((m) =>
        window.electronAPI?.motorTestStart?.({
          motor: m.TestOrder,
          throttle,
          duration,
          throttleType: 'percent' as const,
        })
      );
      const results = await Promise.all(promises);
      const failed = results.find((r) => !r?.success);
      if (failed) {
        setLastError(failed?.error ?? t('mavlink-config:motorTestTab.commandFailed'));
        setSequenceRunning(false);
        return;
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
      setSequenceRunning(false);
      return;
    }
    window.setTimeout(() => {
      setSequenceRunning(false);
      setActiveMotor(null);
    }, duration * 1000 + 500);
  }, [canTest, throttle, duration, motorsByTestOrder, setActiveMotor, setLastError, setSequenceRunning, t]);

  const stopAll = useCallback(async () => {
    setSequenceRunning(false);
    setActiveMotor(null);
    try {
      await window.electronAPI?.motorTestStop?.(motorCount);
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    }
  }, [motorCount, setActiveMotor, setLastError, setSequenceRunning]);

  // Gate: not connected or not MAVLink
  if (!connectionState.isConnected) {
    return (
      <div className="p-8 text-center text-content-secondary">
        {t('mavlink-config:motorTestTab.connectFirst')}
      </div>
    );
  }
  if (connectionState.protocol !== 'mavlink') {
    return (
      <div className="p-8 text-center text-content-secondary">
        {t('mavlink-config:motorTestTab.requiresMavlink')}
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      {/* Safety confirmation dialog */}
      {showSafetyDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-surface-solid border-red-500/40 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-500/15 border-red-500/30 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div>
                <div className="text-lg font-semibold text-content">{t('mavlink-config:motorTestTab.safetyCheck')}</div>
                <div className="text-xs text-content-secondary">{t('mavlink-config:motorTestTab.requiredBefore')}</div>
              </div>
            </div>
            <div className="text-sm text-content mb-5 space-y-2">
              <p>{t('mavlink-config:motorTestTab.mustConfirm')}</p>
              <ul className="list-disc ml-5 space-y-1 text-content-secondary">
                <li>{t('mavlink-config:motorTestTab.propsRemoved')}</li>
                <li>{t('mavlink-config:motorTestTab.frameSecured')}</li>
                <li>{t('mavlink-config:motorTestTab.nobodyNear')}</li>
                <li>{t('mavlink-config:motorTestTab.batteryConnected')}</li>
              </ul>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  confirmSafety();
                  setShowSafetyDialog(false);
                }}
                className="flex-1 px-4 py-2.5 bg-red-500/80 hover:bg-red-500 text-white font-semibold rounded-lg transition-colors"
              >
                {t('mavlink-config:motorTestTab.confirmPropsRemoved')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PX4 motor test disabled by parameter */}
      {px4TestDisabled && (
        <div className="bg-red-500/10 border-red-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-red-300">{t('mavlink-config:motorTestTab.px4DisabledTitle')}</div>
            <div className="text-xs text-red-400/70">
              {t('mavlink-config:motorTestTab.px4DisabledBody')}
            </div>
          </div>
        </div>
      )}

      {/* Armed warning banner */}
      {isArmed && (
        <div className="bg-red-500/10 border-red-500/30 rounded-lg p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-red-300">{t('mavlink-config:motorTestTab.armedTitle')}</div>
            <div className="text-xs text-red-400/70">{t('mavlink-config:motorTestTab.armedBody')}</div>
          </div>
        </div>
      )}

      {/* High-throttle warning banner (soft, non-blocking) */}
      {throttle > HIGH_THROTTLE_WARNING && (
        <div className="bg-amber-500/10 border-amber-500/30 rounded-lg p-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <div className="text-xs text-amber-300">
            {t('mavlink-config:motorTestTab.highThrottle', { throttle })}
          </div>
        </div>
      )}

      {/* Last error banner */}
      {lastError && (
        <div className="bg-red-500/10 border-red-500/30 rounded-lg p-3 flex items-center justify-between gap-3">
          <div className="text-xs text-red-300">{lastError}</div>
          <button
            onClick={() => setLastError(null)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            {t('mavlink-config:motorTestTab.dismiss')}
          </button>
        </div>
      )}

      {/* Main 3-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto,1fr,auto] gap-5">
        {/* LEFT: Frame diagram */}
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <FrameDiagram
            layout={layout}
            activeMotor={activeMotor}
            rpmByMotor={rpmByMotor}
            onMotorClick={canTest ? testMotor : undefined}
          />
        </div>

        {/* CENTER: Controls */}
        <div className="bg-surface rounded-xl border border-subtle p-5 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 border-yellow-500/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-content">{t('mavlink-config:motorTestTab.title')}</div>
              <div className="text-[11px] text-content-secondary">{t('mavlink-config:motorTestTab.motorCount', { count: motorCount })} · {frameTypeDisplayName(layout.TypeName)}</div>
            </div>
          </div>

          {/* Throttle slider */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-content-secondary">
                {t('common:throttle')}
              </label>
              <div className="flex items-baseline gap-1">
                <DraftNumberInput
                  min={0}
                  max={100}
                  integer
                  value={throttle}
                  onCommit={setThrottle}
                  className="w-14 px-1 py-0.5 text-sm text-right font-mono bg-surface border rounded text-content focus:outline-none focus:border-yellow-500"
                />
                <span className="text-sm text-content-secondary">%</span>
              </div>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={throttle}
              onChange={(e) => setThrottle(Number(e.target.value))}
              className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-yellow-500"
            />
          </div>

          {/* Duration input */}
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="text-xs font-semibold uppercase tracking-wider text-content-secondary">
                {t('common:duration')}
              </label>
              <div className="flex items-baseline gap-1">
                <DraftNumberInput
                  min={1}
                  max={60}
                  integer
                  value={duration}
                  onCommit={setDuration}
                  className="w-14 px-1 py-0.5 text-sm text-right font-mono bg-surface border rounded text-content focus:outline-none focus:border-yellow-500"
                />
                <span className="text-sm text-content-secondary">s</span>
              </div>
            </div>
          </div>

          {/* Individual motor buttons (sorted by TestOrder) */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-content-secondary mb-2">
              {t('mavlink-config:motorTestTab.testIndividual')}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {motorsByTestOrder.map((m) => (
                <button
                  key={m.Number}
                  onClick={() => testMotor(m.Number)}
                  disabled={!canTest || sequenceRunning}
                  className={`
                    px-3 py-2 rounded-lg border text-sm font-mono text-left transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed
                    ${
                      activeMotor === m.Number
                        ? 'bg-yellow-500/20 border-yellow-500/40 text-yellow-300'
                        : 'bg-surface border/40 text-content hover:border hover:bg-surface'
                    }
                  `}
                >
                  <div className="font-semibold">
                    {testOrderToLabel(m.TestOrder)} <span className="text-content-secondary">·</span> M{m.Number}
                  </div>
                  <div className="text-[10px] text-content-secondary">{m.Rotation}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Sequence + All At Once + Stop */}
          <div className="space-y-2">
            <button
              onClick={testAllInSequence}
              disabled={!canTest || sequenceRunning}
              className="w-full px-4 py-2.5 bg-emerald-500/15 border-emerald-500/30 hover:bg-emerald-500/25 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-emerald-300 transition-colors flex items-center justify-center gap-2"
            >
              <Play className="w-4 h-4" />
              {t('mavlink-config:motorTestTab.testAllSequence')}
            </button>
            <button
              onClick={testAllAtOnce}
              disabled={!canTest || sequenceRunning}
              className="w-full px-4 py-2.5 bg-blue-500/15 border-blue-500/30 hover:bg-blue-500/25 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-sm font-semibold text-blue-300 transition-colors flex items-center justify-center gap-2"
            >
              <Zap className="w-4 h-4" />
              {t('mavlink-config:motorTestTab.testAllAtOnce')}
            </button>
            <button
              onClick={stopAll}
              className="w-full px-4 py-3 bg-red-500/80 hover:bg-red-500 rounded-lg text-sm font-bold text-white transition-colors flex items-center justify-center gap-2 shadow-lg shadow-red-500/20"
            >
              <Square className="w-4 h-4" />
              {t('mavlink-config:motorTestTab.stopAll')}
            </button>
          </div>

          {/* Reset safety acknowledgment */}
          {safetyConfirmed && (
            <button
              onClick={() => {
                useMotorTestStore.setState({ safetyConfirmed: false });
                setShowSafetyDialog(true);
              }}
              className="w-full text-[11px] text-content-secondary hover:text-content-secondary flex items-center justify-center gap-1.5 py-1"
            >
              <Shield className="w-3 h-3" />
              {t('mavlink-config:motorTestTab.resetSafety')}
            </button>
          )}
        </div>

        {/* RIGHT: Live monitoring */}
        <div className="w-full lg:w-80 space-y-4">
          <VibrationCard />
          <EscTelemetryCard layout={layout} />
        </div>
      </div>
    </div>
  );
};

export default MotorTestTab;
