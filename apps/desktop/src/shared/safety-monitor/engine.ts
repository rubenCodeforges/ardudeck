/**
 * Takeoff / Attitude Safety Monitor - pure evaluation engine.
 *
 * Stateful but side-effect-free: feed it MonitorFrame snapshots, read back a
 * MonitorState. It debounces each signal, runs the compound tip-over state
 * machine, latches DANGER, and keeps a small timeline of events. The same
 * instance drives a live MAVLink stream or a replayed .tlog - only the frame
 * producer differs.
 */

import { t as translate } from '../i18n/index.js';
import {
  ABORT_ACTION,
  SIGNAL_LABELS,
  emptyMonitorState,
  type LandedState,
  type MonitorContext,
  type MonitorFrame,
  type MonitorProfile,
  type MonitorState,
  type PidSample,
  type Severity,
  type SignalBand,
  type SignalId,
  type SignalResult,
  type TimelineEvent,
  type TimelineEventKind,
} from './types';

interface DebounceState {
  reported: Severity;
  pendingSev: Severity | null;
  pendingSince: number;
}

interface AttitudeSample {
  t: number;
  maxAtt: number;
}

const MAX_EVENTS = 50;

function sign(x: number): number {
  return x > 0 ? 1 : x < 0 ? -1 : 0;
}

function bandSeverity(value: number, band: SignalBand): Severity {
  if (value > band.danger) return 'danger';
  if (value > band.caution) return 'caution';
  return 'nominal';
}

function onGround(landed: LandedState): boolean {
  return landed === 'on-ground' || landed === 'takeoff';
}

export class SafetyMonitorEngine {
  private profile: MonitorProfile;
  private context: MonitorContext;
  private debounce = new Map<SignalId, DebounceState>();
  private dangerPendingSince: number | null = null;
  private dangerLatchedAt: number | null = null;
  private events: TimelineEvent[] = [];
  private attHistory: AttitudeSample[] = [];
  private lastState: MonitorState;

  constructor(profile: MonitorProfile, context: MonitorContext) {
    this.profile = profile;
    this.context = context;
    this.lastState = this.emptyState();
  }

  setProfile(p: MonitorProfile): void {
    this.profile = p;
  }

  setContext(c: MonitorContext): void {
    this.context = c;
  }

  getState(): MonitorState {
    // events and the latch can change between frames (recordStatusText,
    // clearLatch), so reflect their current values rather than the snapshot
    // captured by the last update().
    return { ...this.lastState, events: [...this.events], dangerLatchedAt: this.dangerLatchedAt };
  }

  reset(): void {
    this.debounce.clear();
    this.dangerPendingSince = null;
    this.dangerLatchedAt = null;
    this.events = [];
    this.attHistory = [];
    this.lastState = this.emptyState();
  }

  /** Manually clear a latched DANGER. */
  clearLatch(t: number): void {
    if (this.dangerLatchedAt !== null) {
      this.pushEvent({ t, kind: 'cleared', text: translate('shared:safetyMonitor.latchCleared') });
    }
    this.dangerLatchedAt = null;
    this.dangerPendingSince = null;
  }

  /** Fold a STATUSTEXT into the timeline (crash / disarm / failsafe markers). */
  recordStatusText(_severity: number, text: string, t: number): void {
    const lower = text.toLowerCase();
    let kind: TimelineEventKind | null = null;
    if (lower.includes('crash')) kind = 'crash';
    else if (lower.includes('disarm')) kind = 'disarm';
    else if (lower.includes('failsafe') || lower.includes('prearm')) kind = 'failsafe';
    if (kind) this.pushEvent({ t, kind, text });
  }

  update(frame: MonitorFrame): MonitorState {
    const p = this.profile;
    const tipoverArmed = frame.armed && onGround(frame.landedState);

    // --- per-signal instantaneous evaluation -------------------------------
    const signals: SignalResult[] = [];

    // 1. Resting attitude offset (deg) while on the ground.
    const attVal = maxAbs(frame.roll, frame.pitch);
    const attInst: Severity = tipoverArmed && attVal !== null ? bandSeverity(attVal, p.restingAttitudeDeg) : 'nominal';
    const trimAccounted = Math.abs(this.context.ahrsTrimX ?? 0) > 0.02 || Math.abs(this.context.ahrsTrimY ?? 0) > 0.02;
    let attDetail: string | undefined;
    if (attVal !== null && attVal > p.restingAttitudeDeg.caution && tipoverArmed) {
      attDetail = `Takeoff will demand a ${attVal.toFixed(0)}° rotation - confirm intended.`;
      if (!trimAccounted) {
        attDetail += ' AHRS_TRIM ≈ 0, so this tilt is not accounted for.';
      }
    }
    signals.push(
      this.makeSignal('restingAttitude', attInst, frame.t, {
        unit: '°',
        value: attVal,
        nominalMax: p.restingAttitudeDeg.caution,
        cautionMax: p.restingAttitudeDeg.danger,
        detail: attDetail,
        available: true,
      }),
    );

    // 2. Body rates on the ground (deg/s).
    const rateVal = maxAbs(frame.rollSpeed, frame.pitchSpeed);
    const rateInst: Severity = tipoverArmed && rateVal !== null ? bandSeverity(rateVal, p.bodyRateDegS) : 'nominal';
    signals.push(
      this.makeSignal('bodyRates', rateInst, frame.t, {
        unit: '°/s',
        value: rateVal,
        nominalMax: p.bodyRateDegS.caution,
        cautionMax: p.bodyRateDegS.danger,
        available: true,
      }),
    );

    // 3. Integrator load = |I| / IMAX per axis.
    const pidAvail = this.context.pidStreamingAvailable;
    const rollPct = pidAvail ? integratorPct(frame.pidRoll, this.context.imaxRoll) : null;
    const pitchPct = pidAvail ? integratorPct(frame.pidPitch, this.context.imaxPitch) : null;
    const intVal = maxAbs(rollPct, pitchPct);
    const intInst: Severity = intVal !== null ? bandSeverity(intVal, p.integratorPct) : 'nominal';
    signals.push(
      this.makeSignal('integratorLoad', intInst, frame.t, {
        unit: '%',
        value: intVal,
        nominalMax: p.integratorPct.caution,
        cautionMax: p.integratorPct.danger,
        available: pidAvail,
        unavailableReason: pidAvail ? undefined : translate('shared:safetyMonitor.enablePidStreaming'),
      }),
    );

    // 4. Throttle-vs-climb coherence: spooled throttle while not climbing.
    const straining =
      tipoverArmed &&
      frame.throttle !== undefined &&
      frame.throttle > p.throttleRisingPct &&
      frame.climb !== undefined &&
      Math.abs(frame.climb) < p.climbDeadbandMs;
    const tcInst: Severity = straining ? 'caution' : 'nominal';
    signals.push(
      this.makeSignal('throttleClimbCoherence', tcInst, frame.t, {
        unit: '%',
        value: frame.throttle ?? null,
        nominalMax: p.throttleRisingPct,
        cautionMax: 100,
        available: true,
        detail: straining ? translate('shared:safetyMonitor.throttleNotLifting') : undefined,
      }),
    );

    // 5. Controller fighting itself: net command opposes the demanded rate.
    const fightRoll = controllerFighting(frame.pidRoll, p.rateErrorThreshRadS);
    const fightPitch = controllerFighting(frame.pidPitch, p.rateErrorThreshRadS);
    const fighting = pidAvail && (fightRoll.fighting || fightPitch.fighting);
    const fightVal = pidAvail ? Math.max(fightRoll.error, fightPitch.error) : null;
    const cfInst: Severity = fighting ? 'caution' : 'nominal';
    signals.push(
      this.makeSignal('controllerFighting', cfInst, frame.t, {
        unit: 'rad/s',
        value: fightVal,
        nominalMax: p.rateErrorThreshRadS,
        cautionMax: p.rateErrorThreshRadS * 3,
        available: pidAvail,
        unavailableReason: pidAvail ? undefined : translate('shared:safetyMonitor.enablePidStreaming'),
        detail: fighting ? translate('shared:safetyMonitor.controllerFighting') : undefined,
      }),
    );

    // 6. On-ground motor spread (us).
    const spread = onGround(frame.landedState) ? motorSpread(frame.servoOutputs) : null;
    const msInst: Severity = spread !== null ? bandSeverity(spread, p.motorSpreadUs) : 'nominal';
    signals.push(
      this.makeSignal('motorSpread', msInst, frame.t, {
        unit: 'µs',
        value: spread,
        nominalMax: p.motorSpreadUs.caution,
        cautionMax: p.motorSpreadUs.danger,
        available: true,
      }),
    );

    // --- attitude growth tracking -----------------------------------------
    if (attVal !== null) {
      this.attHistory.push({ t: frame.t, maxAtt: attVal });
      const cutoff = frame.t - 600;
      while (this.attHistory.length > 1 && this.attHistory[0]!.t < cutoff) this.attHistory.shift();
    }
    const attitudeGrowing = this.isAttitudeGrowing(attVal);

    // --- compound tip-over DANGER -----------------------------------------
    const integratorDanger = intVal !== null && intVal >= p.integratorPct.danger;
    const rateSpike = rateInst === 'danger';
    const attitudeBad = (attVal !== null && attVal > p.restingAttitudeDeg.caution) || attitudeGrowing;
    const compound = tipoverArmed && straining && (attitudeBad || integratorDanger || fighting || rateSpike);

    if (compound) {
      if (this.dangerPendingSince === null) this.dangerPendingSince = frame.t;
      if (this.dangerLatchedAt === null && frame.t - this.dangerPendingSince >= p.debounceMs) {
        this.dangerLatchedAt = frame.t;
        this.pushEvent({
          t: frame.t,
          kind: 'danger',
          text: translate('shared:safetyMonitor.tipoverDetected'),
        });
      }
    } else {
      this.dangerPendingSince = null;
    }

    // --- overall severity --------------------------------------------------
    let overall: Severity = 'nominal';
    if (this.dangerLatchedAt !== null) {
      overall = 'danger';
    } else if (signals.some((s) => s.available && s.severity !== 'nominal')) {
      overall = 'caution';
    }

    const state: MonitorState = {
      overall,
      action: overall === 'danger' ? ABORT_ACTION : null,
      signals,
      dangerLatchedAt: this.dangerLatchedAt,
      integrator: { roll: rollPct, pitch: pitchPct },
      events: [...this.events],
      tipoverArmed,
    };
    this.lastState = state;
    return state;
  }

  private isAttitudeGrowing(current: number | null): boolean {
    if (current === null || this.attHistory.length < 2) return false;
    let min = Infinity;
    for (const s of this.attHistory) min = Math.min(min, s.maxAtt);
    // Growing by more than the nominal band over the window, and currently
    // already past the nominal resting threshold.
    return current - min > this.profile.restingNominalDeg && current > this.profile.restingNominalDeg;
  }

  private makeSignal(
    id: SignalId,
    inst: Severity,
    t: number,
    rest: Omit<SignalResult, 'id' | 'label' | 'severity'>,
  ): SignalResult {
    const reported = rest.available ? this.applyDebounce(id, inst, t) : 'nominal';
    return { id, label: translate(`shared:safetyMonitor.signal.${id}`, { defaultValue: SIGNAL_LABELS[id] }), severity: reported, ...rest };
  }

  private applyDebounce(id: SignalId, inst: Severity, t: number): Severity {
    let d = this.debounce.get(id);
    if (!d) {
      d = { reported: 'nominal', pendingSev: null, pendingSince: t };
      this.debounce.set(id, d);
    }
    if (inst === d.reported) {
      d.pendingSev = null;
      return d.reported;
    }
    if (d.pendingSev === inst) {
      if (t - d.pendingSince >= this.profile.debounceMs) {
        d.reported = inst;
        d.pendingSev = null;
      }
    } else {
      d.pendingSev = inst;
      d.pendingSince = t;
    }
    return d.reported;
  }

  private pushEvent(e: TimelineEvent): void {
    this.events.push(e);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  private emptyState(): MonitorState {
    return emptyMonitorState();
  }
}

function maxAbs(a: number | undefined | null, b: number | undefined | null): number | null {
  const vals: number[] = [];
  if (a !== undefined && a !== null) vals.push(Math.abs(a));
  if (b !== undefined && b !== null) vals.push(Math.abs(b));
  if (vals.length === 0) return null;
  return Math.max(...vals);
}

function integratorPct(sample: PidSample | undefined, imax: number | undefined): number | null {
  if (!sample || imax === undefined || imax <= 0) return null;
  return (Math.abs(sample.i) / imax) * 100;
}

function controllerFighting(
  sample: PidSample | undefined,
  thresh: number,
): { fighting: boolean; error: number } {
  if (!sample) return { fighting: false, error: 0 };
  const rateError = sample.desired - sample.achieved;
  const net = sample.p + sample.i + sample.d + sample.ff;
  const fighting =
    Math.abs(rateError) > thresh && sign(net) !== 0 && sign(rateError) !== 0 && sign(net) !== sign(rateError);
  return { fighting, error: Math.abs(rateError) };
}

function motorSpread(outputs: number[] | undefined): number | null {
  if (!outputs || outputs.length === 0) return null;
  const active = outputs.filter((v) => v > 900);
  if (active.length < 2) return null;
  return Math.max(...active) - Math.min(...active);
}
