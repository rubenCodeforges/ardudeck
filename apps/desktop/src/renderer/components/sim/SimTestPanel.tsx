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
import { useTranslation } from 'react-i18next';
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
const ENGINE_FAULT_KINDS: { id: EngineFaultKind; labelKey: string }[] = [
  { id: 'motor_out', labelKey: 'sim:testPanel.faults.motorOut' },
  { id: 'thrust_loss', labelKey: 'sim:testPanel.faults.thrustLoss' },
  { id: 'imbalance', labelKey: 'sim:testPanel.faults.vibration' },
  { id: 'brownout', labelKey: 'sim:testPanel.faults.brownout' },
  { id: 'bearing_drag', labelKey: 'sim:testPanel.faults.bearingDrag' },
  { id: 'asym_drag', labelKey: 'sim:testPanel.faults.asymDrag' },
];

export default function SimTestPanel() {
  const { t } = useTranslation();
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const [open, setOpen] = useState(false);
  // Expanded panel defaults to the right side, clear of the fleet picker rail
  // on the left edge (the collapsed button stays at top-left). 332 = panel
  // width (w-80) + 12 px margin; the view fills its window, so innerWidth works.
  const { pos, handleProps } = useDraggablePanel({ x: Math.max(12, window.innerWidth - 332), y: 56 });

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
        data-tip={t('sim:testPanel.openTip')}
        className="absolute top-14 left-3 z-30 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-subtle text-content-secondary hover:text-content shadow-lg"
      >
        {t('sim:testPanel.title')}
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
          <span className="text-sm font-semibold">{t('sim:testPanel.title')}</span>
          <span
            data-tip={
              engineActive
                ? t('sim:testPanel.engineTip')
                : t('sim:testPanel.builtinTip')
            }
            className={`px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide rounded ${
              engineActive
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-surface-raised text-content-tertiary border border-subtle'
            }`}
          >
            {engineActive ? t('sim:testPanel.engine') : t('sim:testPanel.builtin')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetAll}
            disabled={!isConnected || !anyFailure}
            data-tip={t('sim:testPanel.resetAllTip')}
            className={`px-2 py-0.5 text-[11px] font-medium rounded-md border transition-colors ${
              anyFailure && isConnected
                ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-600/30'
                : 'border-subtle text-content-tertiary'
            }`}
          >
            {t('sim:testPanel.resetAll')}
          </button>
          <button onClick={() => setOpen(false)} className="text-content-tertiary hover:text-content text-xs">
            ✕
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {!isConnected && <div className="text-[11px] text-amber-400">{t('sim:testPanel.connectToApply')}</div>}

        {/* One-click scenarios */}
        <Section label={t('sim:testPanel.scenarios')} />
        <div className="grid grid-cols-3 gap-1.5">
          {SIM_PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPatch(p.patch)}
              disabled={!isConnected}
              data-tip={t(p.tipKey)}
              className="px-1.5 py-1.5 text-[11px] font-medium rounded-md border border-subtle bg-surface-raised text-content-secondary hover:text-content hover:border-red-500/40 disabled:opacity-40 transition-colors"
            >
              {t(p.labelKey)}
            </button>
          ))}
        </div>

        {/* Motors: engine schematic when the engine drives the sim, else SIM bits */}
        <Section label={t('common:motors')} />
        {engineActive ? (
          <div className="space-y-2">
            <p className="text-[11px] text-content-tertiary">
              {t('sim:testPanel.clickArmHint')}
            </p>
            <MotorSchematic
              motors={vehicle?.motors}
              failed={engineFailed}
              onFail={failMotorEngine}
              motorCount={vehicle?.motorThrust?.length ?? MOTOR_COUNT}
            />
            <div className={row}>
              <span className="w-16 text-content-secondary shrink-0">{t('sim:testPanel.fault')}</span>
              <select
                value={faultKind}
                onChange={(e) => setFaultKind(e.target.value as EngineFaultKind)}
                className="flex-1 bg-surface-raised border border-subtle rounded-md px-2 py-1 text-xs text-content"
              >
                {ENGINE_FAULT_KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {t(k.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            {faultKind !== 'motor_out' && (
              <div className={row}>
                <span className="w-24 text-content-secondary">{t('sim:testPanel.severity', { pct: Math.round(faultSeverity * 100) })}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={faultSeverity}
                  onChange={(e) => setFaultSeverity(Number(e.target.value))}
                  data-tip={t('sim:testPanel.severityTip')}
                  className={slider}
                />
              </div>
            )}
            {engineFailed.size > 0 && (
              <button
                onClick={() => clearFaults()}
                className="w-full px-2 py-1 text-[11px] font-medium rounded-md border border-emerald-500/40 bg-emerald-600/15 text-emerald-300 hover:bg-emerald-600/25"
              >
                {t('sim:testPanel.clearAllFaults')}
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={row}>
              <span className="w-16 text-content-secondary shrink-0">{t('sim:testPanel.fail')}</span>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: MOTOR_COUNT }, (_, i) => i + 1).map((n) => {
                  const on = cond.failedMotors.includes(n);
                  return (
                    <button
                      key={n}
                      onClick={() => toggleMotorSim(n)}
                      disabled={!isConnected}
                      data-tip={t('sim:testPanel.toggleMotorTip', { n, bit: n - 1 })}
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
                <span className="w-24 text-content-secondary">{t('sim:testPanel.thrust', { pct: Math.round(cond.engineMul * 100) })}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={cond.engineMul}
                  disabled={!isConnected}
                  onChange={(e) => applyPatch({ engineMul: Number(e.target.value) }, 120)}
                  data-tip={t('sim:testPanel.thrustTip')}
                  className={slider}
                />
              </div>
            )}
          </>
        )}

        {/* Payload: engine-only, live-attached slung load */}
        {engineActive && (
          <>
            <Section label={t('sim:testPanel.payload')} />
            <div className={row}>
              <span className="w-24 text-content-secondary">{t('sim:testPanel.mass', { kg: loadMass.toFixed(0) })}</span>
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
              <span className="w-24 text-content-secondary">{t('sim:testPanel.cable', { m: cableLength.toFixed(1) })}</span>
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
                data-tip={t('sim:testPanel.attachTip')}
                className="flex-1 px-2 py-1 text-[11px] font-medium rounded-md border border-sky-500/40 bg-sky-600/15 text-sky-300 hover:bg-sky-600/25"
              >
                {load?.attached ? t('sim:testPanel.updateLoad') : t('sim:testPanel.attachLoad')}
              </button>
              <button
                onClick={() => releaseLoad()}
                disabled={!load?.attached}
                data-tip={t('sim:testPanel.releaseTip')}
                className="flex-1 px-2 py-1 text-[11px] font-medium rounded-md border border-amber-500/40 bg-amber-600/15 text-amber-300 hover:bg-amber-600/25 disabled:opacity-40"
              >
                {t('common:release')}
              </button>
            </div>
            <div className="flex gap-1.5">
              <WinchButton label={t('sim:testPanel.lower')} onClick={() => setWinch(0.5)} tip={t('sim:testPanel.lowerTip')} />
              <WinchButton label={t('common:hold')} onClick={() => setWinch(0)} tip={t('sim:testPanel.holdTip')} />
              <WinchButton label={t('sim:testPanel.raise')} onClick={() => setWinch(-0.5)} tip={t('sim:testPanel.raiseTip')} />
            </div>
            {load?.attached ? (
              <div className="text-[11px] text-content-secondary grid grid-cols-3 gap-1 pt-0.5">
                <span>{t('sim:testPanel.cable', { m: load.cableLength.toFixed(1) })}</span>
                <span>{t('sim:testPanel.tension', { n: load.tension.toFixed(0) })}</span>
                <span>{t('sim:testPanel.alt', { m: (-load.position[2]).toFixed(1) })}</span>
              </div>
            ) : (
              <p className="text-[11px] text-content-tertiary">{t('sim:testPanel.noLoad')}</p>
            )}
          </>
        )}

        {/* Power */}
        <Section label={t('common:power')} />
        <div className={row}>
          <span className="w-24 text-content-secondary">{t('sim:testPanel.batt', { v: (battV ?? battNominal).toFixed(1) })}</span>
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
            data-tip={t('sim:testPanel.battTip')}
            className={slider}
          />
        </div>

        {/* GPS / navigation (flight-controller level; works in both modes) */}
        <Section label={t('sim:testPanel.gpsNav')} />
        <div className="grid grid-cols-1 gap-1.5">
          <FailToggle
            label={t('sim:testPanel.gpsFix')}
            active={cond.gpsEnable}
            okWhenActive
            onClick={() => applyPatch({ gpsEnable: !cond.gpsEnable })}
            tip={t('sim:testPanel.gpsFixTip')}
          />
          <FailToggle
            label={t('sim:testPanel.gpsJamming')}
            active={cond.gpsJam}
            onClick={() => applyPatch({ gpsJam: !cond.gpsJam })}
            tip={t('sim:testPanel.gpsJammingTip')}
          />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">{t('sim:testPanel.glitch', { m: cond.gpsGlitch })}</span>
          <input
            type="range"
            min={0}
            max={50}
            step={1}
            value={cond.gpsGlitch}
            disabled={!isConnected}
            onChange={(e) => applyPatch({ gpsGlitch: Number(e.target.value) }, 120)}
            data-tip={t('sim:testPanel.glitchTip')}
            className={slider}
          />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">{t('sim:testPanel.sats', { n: cond.gpsSats })}</span>
          <input
            type="range"
            min={0}
            max={20}
            step={1}
            value={cond.gpsSats}
            disabled={!isConnected}
            onChange={(e) => applyPatch({ gpsSats: Number(e.target.value) }, 120)}
            data-tip={t('sim:testPanel.satsTip')}
            className={slider}
          />
        </div>

        {/* Sensors */}
        <Section label={t('common:sensors')} />
        <div className="grid grid-cols-2 gap-1.5">
          <FailToggle
            label={t('sim:testPanel.baro')}
            active={cond.baroDisable}
            onClick={() => applyPatch({ baroDisable: !cond.baroDisable })}
            tip={t('sim:testPanel.baroTip')}
          />
          <FailToggle
            label={t('sim:testPanel.compass1')}
            active={cond.mag1Fail}
            onClick={() => applyPatch({ mag1Fail: !cond.mag1Fail })}
            tip={t('sim:testPanel.compass1Tip')}
          />
          <FailToggle
            label={t('sim:testPanel.compass2')}
            active={cond.mag2Fail}
            onClick={() => applyPatch({ mag2Fail: !cond.mag2Fail })}
            tip={t('sim:testPanel.compass2Tip')}
          />
        </div>
        <div className={row}>
          <span className="w-24 text-content-secondary">{t('sim:testPanel.vibe', { n: cond.vibe.toFixed(0) })}</span>
          <input
            type="range"
            min={0}
            max={60}
            step={1}
            value={cond.vibe}
            disabled={!isConnected}
            onChange={(e) => applyPatch({ vibe: Number(e.target.value) }, 120)}
            data-tip={t('sim:testPanel.vibeTip')}
            className={slider}
          />
        </div>

        {/* Comms */}
        <Section label={t('sim:testPanel.rcComms')} />
        <FailToggle
          label={t('sim:testPanel.rcLoss')}
          active={cond.rcFail}
          onClick={() => applyPatch({ rcFail: !cond.rcFail })}
          tip={t('sim:testPanel.rcLossTip')}
        />

        {/* Weather (live to the engine, else SIM_WIND_*) */}
        <Section label={t('common:weather')} />
        <div className={row}>
          <span className="w-24 text-content-secondary">{t('sim:testPanel.windSpeed', { v: cond.windSpd })}</span>
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
          <span className="w-24 text-content-secondary">{t('sim:testPanel.dir', { deg: cond.windDir })}</span>
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
          <span className="w-24 text-content-secondary">{t('sim:testPanel.gust', { v: cond.windTurb.toFixed(2) })}</span>
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
  const { t } = useTranslation();
  if (!motors || motors.length === 0) {
    return (
      <div className="text-[11px] text-content-tertiary py-3 text-center">
        {t('sim:testPanel.waitingLayout', { count: motorCount })}
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
              <title>{t(dead ? 'sim:testPanel.motorSpinsFailed' : 'sim:testPanel.motorSpinsClick', { n: i + 1, spin: m.spin.toUpperCase() })}</title>
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
  const { t } = useTranslation();
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
        {okWhenActive ? (active ? t('sim:testPanel.ok') : t('sim:testPanel.lost')) : active ? t('sim:testPanel.failed') : t('sim:testPanel.ok')}
      </span>
    </button>
  );
}
