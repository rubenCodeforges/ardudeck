/**
 * SimTestPanel — the one "Test Conditions" bench for rehearsing a flight.
 *
 * It adapts to whichever physics is driving the sim:
 *  - Built-in ArduPilot SITL: conditions are set via SIM_* params over MAVLink
 *    (PARAM_SET), so the real failsafes fire on the real flight code.
 *  - ArduDeck physics engine (when its state WS is connected): physics-level
 *    conditions (motor faults, wind, a slung payload) are driven LIVE over the
 *    engine control channel, because the engine owns the physics and ignores
 *    SIM_*. Flight-controller-level conditions (GPS, baro, compass, RC) still go
 *    through SIM_* and work in both modes.
 *
 * The panel is movable (drag the header) and collapsible.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useSimStateStore, type EngineFaultKind, type SimStateMessage } from '../../stores/sim-state-store';
import { useDraggablePanel } from '../../hooks/useDraggablePanel';
import {
  PARAM_REAL32,
  engineFailMask,
  SIM_DEFAULTS,
  SIM_PRESETS,
  type SimConditions,
  type SimPatch,
} from './sim-test-conditions';

const MOTOR_COUNT = 8; // covers up to an octocopter; extra bits are ignored by SITL

/** Human labels for the engine's injectable physical faults. */
const ENGINE_FAULT_KINDS: { id: EngineFaultKind; label: string }[] = [
  { id: 'motor_out', label: 'Motor out' },
  { id: 'thrust_loss', label: 'Thrust loss' },
  { id: 'imbalance', label: 'Vibration' },
  { id: 'brownout', label: 'ESC brownout' },
  { id: 'bearing_drag', label: 'Bearing drag' },
  { id: 'asym_drag', label: 'Asym drag' },
];

export default function SimTestPanel() {
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const [open, setOpen] = useState(false);
  const { pos, handleProps } = useDraggablePanel({ x: 12, y: 56 });

  // The engine drives the sim iff its state WS is connected. Its live telemetry
  // (motors, faults, load) comes from the first vehicle in the store.
  const engineActive = useSimStateStore((s) => s.status === 'connected');
  const updateCount = useSimStateStore((s) => s.updateCount);
  const vehicle = useMemo<SimStateMessage | undefined>(() => {
    const vs = useSimStateStore.getState().vehicles;
    return vs.values().next().value as SimStateMessage | undefined;
    // Re-read on every ingest so live faults / load stay fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateCount, engineActive]);
  const injectFault = useSimStateStore((s) => s.injectFault);
  const clearFaults = useSimStateStore((s) => s.clearFaults);
  const attachLoad = useSimStateStore((s) => s.attachLoad);
  const releaseLoad = useSimStateStore((s) => s.releaseLoad);
  const setWinch = useSimStateStore((s) => s.setWinch);
  const setWind = useSimStateStore((s) => s.setWind);

  const [cond, setCond] = useState<SimConditions>(SIM_DEFAULTS);
  // Battery slider range keys off the vehicle's actual pack voltage.
  const [battNominal, setBattNominal] = useState(16.8);
  const [battV, setBattV] = useState<number | null>(null); // null = untouched

  // Engine fault authoring: what a motor click injects.
  const [faultKind, setFaultKind] = useState<EngineFaultKind>('motor_out');
  const [faultSeverity, setFaultSeverity] = useState(1);
  // Engine payload authoring.
  const [loadMass, setLoadMass] = useState(8);
  const [cableLength, setCableLength] = useState(3);

  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const fire = useCallback((paramId: string, value: number, debounce = 0) => {
    const send = () => void window.electronAPI?.setParameter?.(paramId, value, PARAM_REAL32);
    if (debounce <= 0) {
      send();
      return;
    }
    clearTimeout(timers.current[paramId]);
    timers.current[paramId] = setTimeout(send, debounce);
  }, []);

  // Read the live pack voltage once connected so the battery slider auto-ranges.
  useEffect(() => {
    if (!isConnected) return;
    let cancelled = false;
    void window.electronAPI?.readParameterBatch?.(['SIM_BATT_VOLTAGE'])
      .then((res) => {
        const v = res?.values?.['SIM_BATT_VOLTAGE'];
        if (!cancelled && typeof v === 'number' && v > 0) setBattNominal(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  /** Merge a patch into local state and push the SIM_* param(s) for each field. */
  const applyPatch = useCallback(
    (patch: SimPatch, debounce = 0) => {
      setCond((c) => ({ ...c, ...patch }));
      if (patch.failedMotors !== undefined) fire('SIM_ENGINE_FAIL', engineFailMask(patch.failedMotors));
      if (patch.engineMul !== undefined) fire('SIM_ENGINE_MUL', patch.engineMul);
      if (patch.gpsEnable !== undefined) fire('SIM_GPS1_ENABLE', patch.gpsEnable ? 1 : 0);
      if (patch.gpsJam !== undefined) fire('SIM_GPS1_JAM', patch.gpsJam ? 1 : 0);
      if (patch.gpsGlitch !== undefined) {
        fire('SIM_GPS1_GLTCH_X', patch.gpsGlitch, debounce);
        fire('SIM_GPS1_GLTCH_Y', patch.gpsGlitch, debounce);
      }
      if (patch.gpsSats !== undefined) fire('SIM_GPS1_NUMSATS', patch.gpsSats, debounce);
      if (patch.baroDisable !== undefined) fire('SIM_BARO_DISABLE', patch.baroDisable ? 1 : 0);
      if (patch.mag1Fail !== undefined) fire('SIM_MAG1_FAIL', patch.mag1Fail ? 1 : 0);
      if (patch.mag2Fail !== undefined) fire('SIM_MAG2_FAIL', patch.mag2Fail ? 1 : 0);
      if (patch.vibe !== undefined) fire('SIM_VIB_MOT_MAX', patch.vibe, debounce);
      if (patch.rcFail !== undefined) fire('SIM_RC_FAIL', patch.rcFail ? 1 : 0);
      // Wind is routed by pushWind() below so it can target the engine live; the
      // preset patches still carry wind fields, so forward them there too.
      if (patch.windSpd !== undefined || patch.windDir !== undefined || patch.windTurb !== undefined) {
        pushWind({
          windSpd: patch.windSpd ?? cond.windSpd,
          windDir: patch.windDir ?? cond.windDir,
          windTurb: patch.windTurb ?? cond.windTurb,
        }, debounce);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fire, cond.windSpd, cond.windDir, cond.windTurb, engineActive],
  );

  /** Wind: to the engine (live NED vector) when it drives the sim, else SIM_*. */
  const pushWind = useCallback(
    (w: { windSpd: number; windDir: number; windTurb: number }, debounce = 0) => {
      if (engineActive) {
        const run = () => {
          // SIM_WIND_DIR is the direction the wind blows FROM; the engine steady
          // vector points where it blows TO, so add 180 deg. NED: n=cos, e=sin.
          const a = ((w.windDir + 180) * Math.PI) / 180;
          setWind({
            steady: [w.windSpd * Math.cos(a), w.windSpd * Math.sin(a), 0],
            intensity: w.windTurb * w.windSpd, // gust up to the steady magnitude
          });
        };
        if (debounce <= 0) run();
        else {
          clearTimeout(timers.current['engineWind']);
          timers.current['engineWind'] = setTimeout(run, debounce);
        }
      } else {
        fire('SIM_WIND_SPD', w.windSpd, debounce);
        fire('SIM_WIND_DIR', w.windDir, debounce);
        fire('SIM_WIND_TURB', w.windTurb, debounce);
      }
    },
    [engineActive, setWind, fire],
  );

  // ─── Motor faults ────────────────────────────────────────────────────────────
  // Built-in SITL uses SIM_ENGINE_FAIL bits; the engine takes per-motor physical
  // faults over its control channel and echoes the active set back in telemetry.
  const engineFailed = useMemo(() => {
    const s = new Set<number>();
    for (const f of vehicle?.faults ?? []) s.add(f.motor); // 0-based
    return s;
  }, [vehicle?.faults]);

  const failMotorEngine = useCallback(
    (index0: number) => {
      if (engineFailed.has(index0)) return; // already failed; Clear all recovers
      injectFault(index0, faultKind, faultKind === 'motor_out' ? 1 : faultSeverity);
    },
    [engineFailed, injectFault, faultKind, faultSeverity],
  );

  const toggleMotorSim = useCallback(
    (n: number) => {
      setCond((c) => {
        const failed = c.failedMotors.includes(n)
          ? c.failedMotors.filter((m) => m !== n)
          : [...c.failedMotors, n];
        fire('SIM_ENGINE_FAIL', engineFailMask(failed));
        let engineMul = c.engineMul;
        if (failed.length > 0 && c.failedMotors.length === 0) {
          engineMul = 0;
          fire('SIM_ENGINE_MUL', 0);
        }
        if (failed.length === 0) {
          engineMul = 1;
          fire('SIM_ENGINE_MUL', 1);
        }
        return { ...c, failedMotors: failed, engineMul };
      });
    },
    [fire],
  );

  const resetAll = useCallback(() => {
    applyPatch(SIM_DEFAULTS);
    setBattV(null);
    fire('SIM_BATT_VOLTAGE', battNominal);
    if (engineActive) {
      clearFaults();
      releaseLoad();
    }
  }, [applyPatch, fire, battNominal, engineActive, clearFaults, releaseLoad]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-tip="Rehearse a flight: inject motor faults, payload, wind, GPS/nav and sensor failures"
        className="absolute top-14 left-3 z-30 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-subtle text-content-secondary hover:text-content shadow-lg"
      >
        Test Conditions
      </button>
    );
  }

  const row = 'flex items-center justify-between gap-3 text-xs';
  const slider = 'flex-1 accent-sky-500';
  const load = vehicle?.load;
  const anyFailure =
    cond.failedMotors.length > 0 ||
    !cond.gpsEnable ||
    cond.gpsJam ||
    cond.gpsGlitch > 0 ||
    cond.gpsSats < 10 ||
    cond.baroDisable ||
    cond.mag1Fail ||
    cond.mag2Fail ||
    cond.vibe > 0 ||
    cond.rcFail ||
    (battV !== null && battV < battNominal * 0.98) ||
    engineFailed.size > 0 ||
    Boolean(load?.attached);

  return (
    <div
      style={{ left: pos.x, top: pos.y }}
      className="absolute z-30 w-80 max-h-[86vh] overflow-y-auto bg-surface-overlay backdrop-blur-sm border border-subtle rounded-xl shadow-2xl text-content"
    >
      <div
        {...handleProps}
        className="sticky top-0 z-10 flex items-center justify-between px-3 py-2 border-b border-subtle bg-surface-solid cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Test Conditions</span>
          <span
            data-tip={
              engineActive
                ? 'ArduDeck physics engine is driving the sim: motors, wind and payload are set live'
                : 'Built-in ArduPilot SITL physics: conditions set via SIM_* parameters'
            }
            className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide rounded ${
              engineActive
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-surface-raised text-content-tertiary border border-subtle'
            }`}
          >
            {engineActive ? 'Engine' : 'Built-in'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAll}
            disabled={!isConnected || !anyFailure}
            data-tip="Restore all conditions to safe defaults"
            className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors ${
              anyFailure && isConnected
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                : 'border-subtle text-content-tertiary'
            }`}
          >
            Reset all
          </button>
          <button onClick={() => setOpen(false)} className="text-content-tertiary hover:text-content text-xs">
            ✕
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {!isConnected && <div className="text-[11px] text-amber-400">Connect to SITL to apply.</div>}

        {/* One-click scenarios */}
        <Section label="Scenarios" />
        <div className="grid grid-cols-3 gap-1.5">
          {SIM_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPatch(p.patch)}
              disabled={!isConnected}
              data-tip={p.tip}
              className="px-1.5 py-1.5 text-[11px] font-medium rounded-md border border-subtle bg-surface-raised text-content-secondary hover:text-content hover:border-red-500/40 disabled:opacity-40 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Motors: engine schematic when the engine drives the sim, else SIM bits */}
        <Section label="Motors" />
        {engineActive ? (
          <div className="space-y-2">
            <p className="text-[11px] text-content-tertiary">
              Click an arm to fail that motor. Live faults are echoed from the engine.
            </p>
            <MotorSchematic
              motors={vehicle?.motors}
              failed={engineFailed}
              onFail={failMotorEngine}
              motorCount={vehicle?.motorThrust?.length ?? MOTOR_COUNT}
            />
            <div className={row}>
              <span className="w-16 text-content-secondary shrink-0">Fault</span>
              <select
                value={faultKind}
                onChange={(e) => setFaultKind(e.target.value as EngineFaultKind)}
                className="flex-1 bg-surface-raised border border-subtle rounded-md px-2 py-1 text-xs text-content"
              >
                {ENGINE_FAULT_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            {faultKind !== 'motor_out' && (
              <div className={row}>
                <span className="w-24 text-content-secondary">Severity {Math.round(faultSeverity * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={faultSeverity}
                  onChange={(e) => setFaultSeverity(Number(e.target.value))}
                  data-tip="How bad the next injected fault is (0-100%)"
                  className={slider}
                />
              </div>
            )}
            {engineFailed.size > 0 && (
              <button
                onClick={() => clearFaults()}
                className="w-full px-2 py-1 text-[11px] font-medium rounded-md border border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25"
              >
                Clear all faults
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={row}>
              <span className="w-16 text-content-secondary shrink-0">Fail</span>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: MOTOR_COUNT }, (_, i) => i + 1).map((n) => {
                  const on = cond.failedMotors.includes(n);
                  return (
                    <button
                      key={n}
                      onClick={() => toggleMotorSim(n)}
                      disabled={!isConnected}
                      data-tip={`Toggle motor ${n} failure (SIM_ENGINE_FAIL bit ${n - 1})`}
                      className={`w-6 h-6 text-[11px] font-medium rounded border transition-colors ${
                        on
                          ? 'bg-red-600/25 border-red-500/50 text-red-300'
                          : 'bg-surface-raised border-subtle text-content-tertiary hover:text-content'
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
            </div>
            {cond.failedMotors.length > 0 && (
              <div className={row}>
                <span className="w-24 text-content-secondary">Thrust {Math.round(cond.engineMul * 100)}%</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={cond.engineMul}
                  disabled={!isConnected}
                  onChange={(e) => applyPatch({ engineMul: Number(e.target.value) }, 120)}
                  data-tip="Remaining thrust on failed motors (SIM_ENGINE_MUL): 0% = dead, else partial loss"
                  className={slider}
                />
              </div>
            )}
          </>
        )}

        {/* Payload: engine-only, live-attached slung load */}
        {engineActive && (
          <>
            <Section label="Payload" />
            <div className={row}>
              <span className="w-24 text-content-secondary">Mass {loadMass.toFixed(0)} kg</span>
              <input
                type="range"
                min={0}
                max={40}
                step={0.5}
                value={loadMass}
                onChange={(e) => setLoadMass(Number(e.target.value))}
                className={slider}
              />
            </div>
            <div className={row}>
              <span className="w-24 text-content-secondary">Cable {cableLength.toFixed(1)} m</span>
              <input
                type="range"
                min={0.5}
                max={8}
                step={0.1}
                value={cableLength}
                onChange={(e) => setCableLength(Number(e.target.value))}
                className={slider}
              />
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={() => attachLoad({ loadMass, cableLength })}
                data-tip="Attach (or update) a slung load on a cable below the aircraft"
                className="flex-1 px-2 py-1 text-[11px] font-medium rounded-md border border-sky-500/40 bg-sky-600/15 text-sky-300 hover:bg-sky-600/25"
              >
                {load?.attached ? 'Update load' : 'Attach load'}
              </button>
              <button
                onClick={() => releaseLoad()}
                disabled={!load?.attached}
                data-tip="Drop the load (ballistic release)"
                className="flex-1 px-2 py-1 text-[11px] font-medium rounded-md border border-amber-500/40 bg-amber-600/15 text-amber-300 hover:bg-amber-600/25 disabled:opacity-40"
              >
                Release
              </button>
            </div>
            <div className="flex gap-1.5">
              <WinchButton label="Lower" onClick={() => setWinch(0.5)} tip="Pay out the winch (lower the load)" />
              <WinchButton label="Hold" onClick={() => setWinch(0)} tip="Hold the winch" />
              <WinchButton label="Raise" onClick={() => setWinch(-0.5)} tip="Reel in the winch (raise the load)" />
            </div>
            {load?.attached ? (
              <div className="text-[11px] text-content-secondary grid grid-cols-3 gap-1 pt-0.5">
                <span>Cable {load.cableLength.toFixed(1)} m</span>
                <span>Tension {load.tension.toFixed(0)} N</span>
                <span>Alt {(-load.position[2]).toFixed(1)} m</span>
              </div>
            ) : (
              <p className="text-[11px] text-content-tertiary">No load attached.</p>
            )}
          </>
        )}

        {/* Power */}
        <Section label="Power" />
        <div className={row}>
          <span className="w-24 text-content-secondary">Batt {(battV ?? battNominal).toFixed(1)} V</span>
          <input
            type="range"
            min={Math.round(battNominal * 0.5)}
            max={Math.max(1, Math.round(battNominal * 1.05))}
            step={0.1}
            value={battV ?? battNominal}
            disabled={!isConnected}
            onChange={(e) => {
              const v = Number(e.target.value);
              setBattV(v);
              fire('SIM_BATT_VOLTAGE', v, 120);
            }}
            data-tip="Pack voltage (SIM_BATT_VOLTAGE) - drop toward the failsafe threshold to test low-battery actions"
            className={slider}
          />
        </div>

        {/* GPS / navigation (flight-controller level; works in both modes) */}
        <Section label="GPS / Nav" />
        <div className="grid grid-cols-1 gap-1.5">
          <FailToggle
            label="GPS fix"
            active={cond.gpsEnable}
            okWhenActive
            onClick={() => applyPatch({ gpsEnable: !cond.gpsEnable })}
            tip="Disable to test the GPS-loss failsafe / EKF fallback (SIM_GPS1_ENABLE)"
          />
          <FailToggle
            label="GPS jamming"
            active={cond.gpsJam}
            onClick={() => applyPatch({ gpsJam: !cond.gpsJam })}
            tip="Simulate GPS jamming (SIM_GPS1_JAM)"
          />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Glitch {cond.gpsGlitch} m</span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={cond.gpsGlitch}
            disabled={!isConnected}
            onChange={(e) => applyPatch({ gpsGlitch: Number(e.target.value) }, 120)}
            data-tip="Inject a horizontal position offset (SIM_GPS1_GLTCH_X/Y) to test glitch rejection / flyaway"
            className={slider}
          />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Sats {cond.gpsSats}</span>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={cond.gpsSats}
            disabled={!isConnected}
            onChange={(e) => applyPatch({ gpsSats: Number(e.target.value) }, 120)}
            data-tip="Reported satellite count (SIM_GPS1_NUMSATS); drop below the arming minimum to degrade the fix"
            className={slider}
          />
        </div>

        {/* Sensors */}
        <Section label="Sensors" />
        <div className="grid grid-cols-2 gap-1.5">
          <FailToggle
            label="Baro"
            active={cond.baroDisable}
            onClick={() => applyPatch({ baroDisable: !cond.baroDisable })}
            tip="Disable the barometer (SIM_BARO_DISABLE)"
          />
          <FailToggle
            label="Compass 1"
            active={cond.mag1Fail}
            onClick={() => applyPatch({ mag1Fail: !cond.mag1Fail })}
            tip="Fail the primary compass (SIM_MAG1_FAIL)"
          />
          <FailToggle
            label="Compass 2"
            active={cond.mag2Fail}
            onClick={() => applyPatch({ mag2Fail: !cond.mag2Fail })}
            tip="Fail the secondary compass (SIM_MAG2_FAIL)"
          />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Vibe {cond.vibe.toFixed(0)}</span>
          <input
            type="range"
            min={0}
            max={60}
            step={1}
            value={cond.vibe}
            disabled={!isConnected}
            onChange={(e) => applyPatch({ vibe: Number(e.target.value) }, 120)}
            data-tip="Motor-driven vibration amplitude (SIM_VIB_MOT_MAX, m/s/s) - high values clip the IMU"
            className={slider}
          />
        </div>

        {/* Comms */}
        <Section label="RC / Comms" />
        <FailToggle
          label="RC loss"
          active={cond.rcFail}
          onClick={() => applyPatch({ rcFail: !cond.rcFail })}
          tip="Drop RC to trigger the radio failsafe (SIM_RC_FAIL)"
        />

        {/* Weather (live to the engine, else SIM_WIND_*) */}
        <Section label="Weather" />
        <div className={row}>
          <span className="w-24 text-content-secondary">Wind {cond.windSpd} m/s</span>
          <input
            type="range"
            min={0}
            max={25}
            step={0.5}
            value={cond.windSpd}
            disabled={!isConnected && !engineActive}
            onChange={(e) => applyPatch({ windSpd: Number(e.target.value) }, 120)}
            className={slider}
          />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Dir {cond.windDir}°</span>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={cond.windDir}
            disabled={!isConnected && !engineActive}
            onChange={(e) => applyPatch({ windDir: Number(e.target.value) }, 120)}
            className={slider}
          />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">Gust {cond.windTurb.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={cond.windTurb}
            disabled={!isConnected && !engineActive}
            onChange={(e) => applyPatch({ windTurb: Number(e.target.value) }, 120)}
            className={slider}
          />
        </div>
      </div>
    </div>
  );
}

/** Top-down motor layout from the engine's authoritative geometry. Click an arm
 *  to fail that motor; a failed motor is red. Numbering is MOT_1..N (1-based
 *  label, 0-based on the wire). */
function MotorSchematic({
  motors,
  failed,
  onFail,
  motorCount,
}: {
  motors: { x: number; y: number; spin: 'cw' | 'ccw' }[] | undefined;
  failed: Set<number>;
  onFail: (index0: number) => void;
  motorCount: number;
}) {
  if (!motors || motors.length === 0) {
    return (
      <div className="text-[11px] text-content-tertiary py-3 text-center">
        Waiting for the motor layout from the engine ({motorCount} motors)...
      </div>
    );
  }
  // Body frame is FRD (x forward, y right). Screen: forward = up, right = right,
  // so screenX = y, screenY = -x. Normalise the layout to a padded square.
  const maxR = Math.max(0.001, ...motors.map((m) => Math.hypot(m.x, m.y)));
  const CX = 50;
  const CY = 53;
  const R = 33; // arm length in viewBox units
  const DISC = 7;
  const ARC = 10; // rotation-arrow radius around a disc
  // Explicit colours (not Tailwind fill-* utilities) so the diagram renders in
  // both themes: sky for a live motor, red for a failed one, a mid slate for
  // arms / arrows / labels that reads on light and dark.
  const LIVE = '#0ea5e9';
  const DEAD = '#ef4444';
  const MUTED = '#94a3b8';
  const rad = (d: number) => (d * Math.PI) / 180;

  /** A ~260 deg rotation arc + arrowhead around (cx,cy). `cw` picks the sweep so
   *  the arrowhead points the way the prop actually spins (top-down view). */
  const spinArrow = (cx: number, cy: number, cw: boolean) => {
    const a0 = cw ? -50 : 210;
    const a1 = cw ? 210 : -50;
    const psx = cx + ARC * Math.cos(rad(a0));
    const psy = cy + ARC * Math.sin(rad(a0));
    const pex = cx + ARC * Math.cos(rad(a1));
    const pey = cy + ARC * Math.sin(rad(a1));
    const d = `M ${psx.toFixed(2)} ${psy.toFixed(2)} A ${ARC} ${ARC} 0 1 ${cw ? 1 : 0} ${pex.toFixed(2)} ${pey.toFixed(2)}`;
    // Unit tangent at the end point (direction of travel), then a small arrowhead.
    const tx = cw ? -Math.sin(rad(a1)) : Math.sin(rad(a1));
    const ty = cw ? Math.cos(rad(a1)) : -Math.cos(rad(a1));
    const nx = -ty;
    const ny = tx;
    const tipx = pex + tx * 3;
    const tipy = pey + ty * 3;
    const w1x = pex + nx * 1.9;
    const w1y = pey + ny * 1.9;
    const w2x = pex - nx * 1.9;
    const w2y = pey - ny * 1.9;
    const head = `${tipx.toFixed(2)},${tipy.toFixed(2)} ${w1x.toFixed(2)},${w1y.toFixed(2)} ${w2x.toFixed(2)},${w2y.toFixed(2)}`;
    return { d, head };
  };

  return (
    <svg viewBox="0 0 100 100" className="w-full max-w-[200px] mx-auto block">
      {/* Nose marker (FWD) */}
      <polygon points="50,3 47,8 53,8" style={{ fill: MUTED }} />
      {/* Arms */}
      {motors.map((m, i) => (
        <line
          key={`arm-${i}`}
          x1={CX}
          y1={CY}
          x2={CX + (m.y / maxR) * R}
          y2={CY - (m.x / maxR) * R}
          stroke={MUTED}
          strokeOpacity={0.35}
          strokeWidth="0.7"
        />
      ))}
      {/* Motors */}
      {motors.map((m, i) => {
        const cx = CX + (m.y / maxR) * R;
        const cy = CY - (m.x / maxR) * R;
        const dead = failed.has(i);
        const cw = m.spin === 'cw';
        const arrow = spinArrow(cx, cy, cw);
        // Radial direction outward from the hub, for the CW/CCW text label.
        const dx = cx - CX;
        const dy = cy - CY;
        const dl = Math.max(0.001, Math.hypot(dx, dy));
        const lx = cx + (dx / dl) * (DISC + 5.5);
        const ly = cy + (dy / dl) * (DISC + 5.5);
        return (
          <g key={`mot-${i}`}>
            {/* Rotation arrow (dimmed for a dead motor) */}
            <path d={arrow.d} fill="none" stroke={dead ? DEAD : MUTED} strokeOpacity={dead ? 0.5 : 0.75} strokeWidth="0.7" />
            <polygon points={arrow.head} style={{ fill: dead ? DEAD : MUTED, opacity: dead ? 0.5 : 0.85 }} />
            <g onClick={() => onFail(i)} style={{ cursor: dead ? 'default' : 'pointer' }}>
              <title>{`Motor ${i + 1} spins ${m.spin.toUpperCase()}${dead ? ' - FAILED' : ' - click to fail'}`}</title>
              <circle cx={cx} cy={cy} r={DISC} style={{ fill: dead ? DEAD : LIVE, opacity: dead ? 0.95 : 0.9 }} />
              <text
                x={cx}
                y={cy + 2.4}
                textAnchor="middle"
                style={{ fontSize: 6.5, fontWeight: 700, fill: '#ffffff', pointerEvents: 'none' }}
              >
                {i + 1}
              </text>
            </g>
            <text x={lx} y={ly + 1.2} textAnchor="middle" style={{ fontSize: 3.4, fontWeight: 600, fill: MUTED, pointerEvents: 'none' }}>
              {m.spin.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function WinchButton({ label, onClick, tip }: { label: string; onClick: () => void; tip: string }) {
  return (
    <button
      onClick={onClick}
      data-tip={tip}
      className="flex-1 px-2 py-1 text-[11px] font-medium rounded-md border border-subtle bg-surface-raised text-content-secondary hover:text-content"
    >
      {label}
    </button>
  );
}

function Section({ label }: { label: string }) {
  return (
    <div className="text-[11px] font-medium text-content-tertiary uppercase tracking-wide pt-1">{label}</div>
  );
}

function FailToggle({
  label,
  active,
  okWhenActive,
  onClick,
  tip,
}: {
  label: string;
  active: boolean;
  okWhenActive?: boolean;
  onClick: () => void;
  tip: string;
}) {
  // "active" colouring: red when a failure is engaged. For GPS fix, active=healthy.
  const bad = okWhenActive ? !active : active;
  return (
    <button
      onClick={onClick}
      data-tip={tip}
      className={`flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
        bad
          ? 'bg-red-600/20 border-red-500/40 text-red-300'
          : 'bg-surface-raised border-subtle text-content-secondary hover:text-content'
      }`}
    >
      <span>{label}</span>
      <span className="text-[10px] font-medium">
        {okWhenActive ? (active ? 'OK' : 'LOST') : active ? 'FAILED' : 'OK'}
      </span>
    </button>
  );
}
