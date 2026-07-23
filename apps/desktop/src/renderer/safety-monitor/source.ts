/**
 * Safety Monitor data source (renderer).
 *
 * Self-contained: it decodes every message it needs straight from the raw
 * MAVLink packet stream (the same stream the MAVLink Inspector taps), so it
 * does not depend on the curated telemetry store and behaves identically for
 * live links and replayed .tlog frames. The only difference between live and
 * replay is who calls feedRawPacket()/evaluateAt():
 *   - live:   onPacket subscription + a 10 Hz wall-clock tick
 *   - replay: a driver pushes decoded log packets and steps log time
 *
 * Decoded messages: HEARTBEAT, ATTITUDE, VFR_HUD, SERVO_OUTPUT_RAW,
 * PID_TUNING, EXTENDED_SYS_STATE, STATUSTEXT.
 */

import { getMessageInfo } from '@ardudeck/mavlink-ts/registry';
import { SafetyMonitorEngine } from '../../shared/safety-monitor/engine';
import {
  DEFAULT_PROFILE,
  landedStateFromMavlink,
  type LandedState,
  type MonitorContext,
  type MonitorFrame,
  type MonitorProfile,
  type PidSample,
} from '../../shared/safety-monitor/types';
import { useSafetyMonitorStore } from '../stores/safety-monitor-store';
import { useActiveVehicleStore } from '../stores/active-vehicle-store';
import { probeTime } from '../lib/perf-probe';

const MSG = {
  HEARTBEAT: 0,
  ATTITUDE: 30,
  SERVO_OUTPUT_RAW: 36,
  VFR_HUD: 74,
  PID_TUNING: 194,
  EXTENDED_SYS_STATE: 245,
  STATUSTEXT: 253,
} as const;

const MAV_MODE_FLAG_SAFETY_ARMED = 0x80;
const RAD2DEG = 180 / Math.PI;
/** GCS_PID_MASK roll+pitch bits (bit0=roll, bit1=pitch). */
const PID_MASK_ROLL = 1;
const PID_MASK_PITCH = 2;
/** A decoded value older than this (ms) is treated as gone. */
const STALE_MS = 3000;
const PID_AXIS_ROLL = 1;
const PID_AXIS_PITCH = 2;

interface RawPacket {
  msgid: number;
  sysid: number;
  compid: number;
  payload: number[];
}

interface Stamped<T> {
  v: T;
  t: number;
}

/** Latest decoded values for the locked vehicle. */
interface LatestValues {
  armed?: Stamped<boolean>;
  attitude?: Stamped<{ roll: number; pitch: number; rollSpeed: number; pitchSpeed: number }>;
  vfr?: Stamped<{ throttle: number; climb: number; alt: number }>;
  servo?: Stamped<number[]>;
  pidRoll?: Stamped<PidSample>;
  pidPitch?: Stamped<PidSample>;
  landed?: Stamped<LandedState>;
}

const engine = new SafetyMonitorEngine(DEFAULT_PROFILE, {
  pidStreamingAvailable: false,
});
let latest: LatestValues = {};
let lockedSysid: number | null = null;
let lockedCompid: number | null = null;
let hasFlown = false;
let armAlt: number | null = null;
let prevOverall: string = 'nominal';

let unsubPacket: (() => void) | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;
let started = false;
let replayMode = false;

function decode(p: RawPacket): Record<string, unknown> | null {
  const info = getMessageInfo(p.msgid);
  if (!info) return null;
  const bytes = new Uint8Array(p.payload);
  // MAVLink v2 truncates trailing zero bytes; pad back so fixed-offset reads
  // do not throw (same trick the inspector uses).
  const full =
    bytes.length < info.maxLength
      ? (() => {
          const b = new Uint8Array(info.maxLength);
          b.set(bytes);
          return b;
        })()
      : bytes;
  try {
    return info.deserialize(full) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The sysid/compid we are watching: the active vehicle if known, else locked. */
function resolveTarget(): { sysid: number | null; compid: number | null } {
  const av = useActiveVehicleStore.getState();
  if (av.activeVehicleKey) {
    const info = av.knownVehicles[av.activeVehicleKey];
    if (info) return { sysid: info.sysid, compid: info.compid };
  }
  return { sysid: lockedSysid, compid: lockedCompid };
}

/**
 * Feed one raw packet. Used by both the live onPacket subscription and the
 * replay driver. `t` is the wall-clock (live) or log (replay) timestamp.
 */
export function feedRawPacket(p: RawPacket, t: number): void {
  // Lock onto the first autopilot we see so a single-vehicle link works even
  // before the active-vehicle store has promoted anything.
  if (lockedSysid === null && p.compid === 1) {
    lockedSysid = p.sysid;
    lockedCompid = p.compid;
  }
  const target = resolveTarget();
  if (target.sysid !== null && (p.sysid !== target.sysid || p.compid !== target.compid)) return;

  switch (p.msgid) {
    case MSG.HEARTBEAT: {
      const d = decode(p);
      if (!d) return;
      const armed = ((d.baseMode as number) & MAV_MODE_FLAG_SAFETY_ARMED) !== 0;
      const wasArmed = latest.armed?.v ?? false;
      if (armed && !wasArmed) {
        // Fresh arm: reset the inferred-flight tracking for the new takeoff.
        hasFlown = false;
        armAlt = latest.vfr?.v.alt ?? null;
      }
      latest.armed = { v: armed, t };
      break;
    }
    case MSG.ATTITUDE: {
      const d = decode(p);
      if (!d) return;
      latest.attitude = {
        v: {
          roll: (d.roll as number) * RAD2DEG,
          pitch: (d.pitch as number) * RAD2DEG,
          rollSpeed: (d.rollspeed as number) * RAD2DEG,
          pitchSpeed: (d.pitchspeed as number) * RAD2DEG,
        },
        t,
      };
      break;
    }
    case MSG.VFR_HUD: {
      const d = decode(p);
      if (!d) return;
      latest.vfr = {
        v: { throttle: d.throttle as number, climb: d.climb as number, alt: d.alt as number },
        t,
      };
      break;
    }
    case MSG.SERVO_OUTPUT_RAW: {
      const d = decode(p);
      if (!d) return;
      const outputs: number[] = [];
      for (let i = 1; i <= 8; i++) outputs.push((d[`servo${i}Raw`] as number) ?? 0);
      latest.servo = { v: outputs, t };
      break;
    }
    case MSG.PID_TUNING: {
      const d = decode(p);
      if (!d) return;
      const sample: PidSample = {
        desired: d.desired as number,
        achieved: d.achieved as number,
        p: d.p as number,
        i: d.i as number,
        d: d.d as number,
        ff: d.ff as number,
      };
      if (d.axis === PID_AXIS_ROLL) latest.pidRoll = { v: sample, t };
      else if (d.axis === PID_AXIS_PITCH) latest.pidPitch = { v: sample, t };
      break;
    }
    case MSG.EXTENDED_SYS_STATE: {
      const d = decode(p);
      if (!d) return;
      latest.landed = { v: landedStateFromMavlink(d.landedState as number), t };
      break;
    }
    case MSG.STATUSTEXT: {
      const d = decode(p);
      if (!d) return;
      engine.recordStatusText(d.severity as number, String(d.text ?? ''), t);
      break;
    }
    default:
      break;
  }
}

function fresh<T>(s: Stamped<T> | undefined, t: number): T | undefined {
  if (!s) return undefined;
  return t - s.t <= STALE_MS ? s.v : undefined;
}

/** Resolve the landed-state, falling back to inference when EXTENDED_SYS_STATE is absent. */
function resolveLanded(t: number, armed: boolean, climb: number | undefined, alt: number | undefined): {
  landed: LandedState;
  source: 'mavlink' | 'inferred' | 'none';
} {
  const fromMsg = fresh(latest.landed, t);
  if (fromMsg) return { landed: fromMsg, source: 'mavlink' };
  // Infer: a craft that has not yet gained altitude after arming is on the
  // ground / spooling for takeoff. The pre-liftoff window is exactly what the
  // tip-over logic needs, so a coarse heuristic is enough here.
  if (climb !== undefined && climb > 0.6) hasFlown = true;
  if (alt !== undefined && armAlt !== null && alt - armAlt > 3) hasFlown = true;
  if (!armed) return { landed: 'on-ground', source: 'inferred' };
  return { landed: hasFlown ? 'in-air' : 'on-ground', source: 'inferred' };
}

/** Build a frame from the latest decoded values and run the engine. */
export function evaluateAt(t: number): void {
  const armed = fresh(latest.armed, t) ?? false;
  const att = fresh(latest.attitude, t);
  const vfr = fresh(latest.vfr, t);
  const servo = fresh(latest.servo, t);
  const pidRoll = fresh(latest.pidRoll, t);
  const pidPitch = fresh(latest.pidPitch, t);

  const { landed, source } = resolveLanded(t, armed, vfr?.climb, vfr?.alt);

  const frame: MonitorFrame = {
    t,
    armed,
    landedState: landed,
    roll: att?.roll,
    pitch: att?.pitch,
    rollSpeed: att?.rollSpeed,
    pitchSpeed: att?.pitchSpeed,
    throttle: vfr?.throttle,
    climb: vfr?.climb,
    servoOutputs: servo,
    pidRoll,
    pidPitch,
  };

  const state = engine.update(frame);
  const store = useSafetyMonitorStore.getState();
  store.setMonitor(state);
  if (store.landedSource !== source) store.setLandedSource(source);

  // Edge-trigger on DANGER entry: flash + audio.
  if (state.overall === 'danger' && prevOverall !== 'danger') {
    store.bumpFlash();
    if (store.audioEnabled) playDangerCue();
  }
  prevOverall = state.overall;
}

export function setProfile(profile: MonitorProfile): void {
  engine.setProfile(profile);
  useSafetyMonitorStore.getState().setProfile(profile);
}

export function setContext(ctx: MonitorContext): void {
  engine.setContext(ctx);
  useSafetyMonitorStore.getState().setPidStreamingAvailable(ctx.pidStreamingAvailable);
}

export function clearLatch(): void {
  engine.clearLatch(replayMode ? lastReplayT : Date.now());
  // Re-emit so the banner updates immediately.
  useSafetyMonitorStore.getState().setMonitor(engine.getState());
  prevOverall = engine.getState().overall;
}

/**
 * Read the slowly-changing parameters that give the engine its context:
 * IMAX (for integrator %), AHRS_TRIM (tilt-not-accounted check), and
 * GCS_PID_MASK (whether PID_TUNING is even being streamed).
 */
export async function refreshContext(): Promise<void> {
  const api = (window as unknown as { electronAPI?: ElectronParamApi }).electronAPI;
  if (!api?.readParameterBatch) return;
  try {
    const res = await api.readParameterBatch([
      'GCS_PID_MASK',
      'ATC_RAT_RLL_IMAX',
      'ATC_RAT_PIT_IMAX',
      'AHRS_TRIM_X',
      'AHRS_TRIM_Y',
    ]);
    const values = res?.values ?? {};
    const mask = values.GCS_PID_MASK ?? 0;
    const pidStreamingAvailable = (mask & PID_MASK_ROLL) !== 0 && (mask & PID_MASK_PITCH) !== 0;
    setContext({
      pidStreamingAvailable,
      imaxRoll: values.ATC_RAT_RLL_IMAX,
      imaxPitch: values.ATC_RAT_PIT_IMAX,
      ahrsTrimX: values.AHRS_TRIM_X,
      ahrsTrimY: values.AHRS_TRIM_Y,
    });
  } catch {
    // Leave the previous context in place on read failure.
  }
}

/** Enable PID_TUNING streaming by setting the roll+pitch bits of GCS_PID_MASK. */
export async function enablePidStreaming(): Promise<boolean> {
  const api = (window as unknown as { electronAPI?: ElectronParamApi }).electronAPI;
  if (!api?.readParameterBatch || !api.setParameter) return false;
  try {
    const res = await api.readParameterBatch(['GCS_PID_MASK']);
    const current = res?.values?.GCS_PID_MASK ?? 0;
    const next = current | PID_MASK_ROLL | PID_MASK_PITCH;
    await api.setParameter('GCS_PID_MASK', next);
    await refreshContext();
    return true;
  } catch {
    return false;
  }
}

interface ElectronParamApi {
  readParameterBatch?: (ids: string[]) => Promise<{ values?: Record<string, number> }>;
  setParameter?: (id: string, value: number) => Promise<unknown>;
  onPacket?: (cb: (p: RawPacket & { rxtime: number }) => void) => () => void;
}

export function startSafetyMonitor(): void {
  if (started) return;
  started = true;
  replayMode = false;
  const api = (window as unknown as { electronAPI?: ElectronParamApi }).electronAPI;
  unsubPacket = api?.onPacket?.((p) => {
    if (replayMode) return;
    // TEMP perf probe: attribute per-packet safety-decode cost (remove with perf-probe).
    probeTime('safety', () => feedRawPacket({ msgid: p.msgid, sysid: p.sysid, compid: p.compid, payload: p.payload }, Date.now()));
  }) ?? null;
  tickHandle = setInterval(() => {
    if (!replayMode) evaluateAt(Date.now());
  }, 100);
  void refreshContext();
}

export function stopSafetyMonitor(): void {
  unsubPacket?.();
  if (tickHandle) clearInterval(tickHandle);
  unsubPacket = null;
  tickHandle = null;
  started = false;
}

// --- replay ---------------------------------------------------------------

let lastReplayT = 0;

/** Switch the engine to replay mode and reset accumulated state. */
export function beginReplay(): void {
  replayMode = true;
  engine.reset();
  latest = {};
  lockedSysid = null;
  lockedCompid = null;
  hasFlown = false;
  armAlt = null;
  prevOverall = 'nominal';
}

export function endReplay(): void {
  replayMode = false;
}

/** Feed one replayed packet at log time `t` (ms). */
export function feedReplayPacket(p: RawPacket, t: number): void {
  lastReplayT = t;
  feedRawPacket(p, t);
}

/** Evaluate at log time `t` (ms) during replay. */
export function evaluateReplayAt(t: number): void {
  lastReplayT = t;
  evaluateAt(t);
}

// --- audio ----------------------------------------------------------------

let audioCtx: AudioContext | null = null;

function playDangerCue(): void {
  try {
    audioCtx = audioCtx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    // Two short urgent beeps.
    for (let k = 0; k < 2; k++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = 880;
      const start = now + k * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.15);
    }
  } catch {
    // Audio is best-effort.
  }
}
