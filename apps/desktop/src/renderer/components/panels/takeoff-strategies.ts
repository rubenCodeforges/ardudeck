/**
 * Takeoff strategies — one self-contained procedure per ArduPilot vehicle
 * class. Each vehicle's takeoff is fundamentally different at the FC level
 * (different MAV_CMD, different mode, different prearm requirements,
 * different param dependencies) so we keep the procedures separate rather
 * than cramming them into a single "smart" function.
 *
 *   copter  : GUIDED + NAV_TAKEOFF (22). Vertical hover, GPS-required.
 *   plane   : TAKEOFF mode (13). Hand-launch / runway / catapult assumed.
 *             FC rejects NAV_TAKEOFF in GUIDED — has to be the dedicated mode.
 *   vtol    : GUIDED + Q_GUIDED_MODE=1 + NAV_VTOL_TAKEOFF (84). Hover up
 *             vertically using Q-motors; manual transition to forward flight
 *             after.
 *   rover   : N/A — surface vehicle.
 *   sub     : N/A — descent commands aren't a "takeoff" in the user sense.
 *
 * Helicopter (MAV_TYPE 4) classifies as 'copter' here — ArduCopter's
 * NAV_TAKEOFF handles the RSC interlock internally as long as the user has
 * `H_RSC_MODE` configured. We don't try to second-guess that on the GCS side.
 */

import type {
  ArduPilotVehicleClass,
  VehicleCapabilities,
  FlightState,
  GpsData,
  PositionData,
  VfrHudData,
} from '../../../shared/telemetry-types';

type StatusType = 'info' | 'success' | 'error';

/**
 * Context handed to every strategy. Exposes the bare minimum each procedure
 * needs — no full Zustand store dependency so the strategies stay pure and
 * testable.
 */
export interface TakeoffContext {
  altitudeM: number;
  forceArm: boolean;
  vehicleClass: ArduPilotVehicleClass;
  capabilities: VehicleCapabilities;
  /** True when we're driving the bundled SITL simulator (vs real FC). Lets
   *  strategies fall back to virtual-RC throttle ramping when upstream's
   *  tailsitter physics state-machine fires Position2 instantly and
   *  NAV_VTOL_TAKEOFF never actually starts a climb. Real hardware doesn't
   *  hit that bug; simulator does. */
  isSitl: boolean;

  /** Live telemetry snapshots (read on demand, not at call time). */
  getFlight:   () => FlightState;
  getGps:      () => GpsData;
  getPosition: () => PositionData;
  /** VFR HUD (climb m/s) — optional; improves “climb finished” detection before Loiter. */
  getVfrHud?: () => VfrHudData | undefined;
  /** Live parameter cache. */
  getParam: (id: string) => { value: number; type: number } | undefined;

  /** IPC bridge — typed against the shapes we actually use. */
  api: {
    mavlinkSetMode:     (modeNum: number) => Promise<boolean>;
    mavlinkArmDisarm:   (arm: boolean, force?: boolean) => Promise<boolean>;
    mavlinkTakeoff:     (alt: number, pitchDeg?: number) => Promise<boolean>;
    mavlinkDoChangeClimbSpeed: (speedMs: number) => Promise<boolean>;
    mavlinkVtolTakeoff: (alt: number) => Promise<boolean>;
    setParameter:       (id: string, value: number, type: number) => Promise<unknown>;
    /** Virtual RC sender control (SITL only — sends UDP RC frames). */
    sitlRcStart:        () => Promise<{ success: boolean }>;
    sitlRcSend:         (state: { throttle?: number; roll?: number; pitch?: number; yaw?: number; aux1?: number; aux2?: number; aux3?: number; aux4?: number }) => Promise<void>;
  };

  /** UI feedback channel. */
  setStatus: (status: { text: string; type: StatusType } | null) => void;

  /** Polls a predicate until it's true or the timeout elapses. */
  waitForState: (check: () => boolean, timeoutMs: number, intervalMs?: number) => Promise<boolean>;
}

export type TakeoffOutcome =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Surface-level metadata each vehicle exposes to the takeoff button + dialog
 * so the UI doesn't need its own switch statement to label things.
 */
export interface TakeoffPresentation {
  /** Button label (e.g. "Vertical Takeoff…", "Auto-Launch…"). */
  buttonLabel: string;
  /** Tooltip on the button. */
  buttonHint: string;
  /** Prompt above the altitude input (e.g. "Climb vertically to"). */
  dialogPrompt: string;
  /** Optional small note under the input — explains the procedure. */
  dialogNote?: string;
}

export function presentTakeoff(vehicleClass: ArduPilotVehicleClass): TakeoffPresentation {
  switch (vehicleClass) {
    case 'copter':
      return {
        buttonLabel: 'Takeoff…',
        buttonHint:  'Arm, switch to GUIDED, climb vertically (NAV_TAKEOFF)',
        dialogPrompt: 'Climb to',
      };
    case 'plane':
      return {
        buttonLabel: 'Auto-Launch…',
        buttonHint:  'Set TKOFF_ALT, switch to TAKEOFF mode, hand-launch / runway',
        dialogPrompt: 'Auto-launch and climb to',
        dialogNote:  'Plane goes into TAKEOFF mode — needs hand-launch, runway, or catapult to start the roll.',
      };
    case 'vtol':
      return {
        buttonLabel: 'Vertical Takeoff…',
        buttonHint:  'Arm in QSTABILIZE, switch to GUIDED with Q_GUIDED_MODE, hover up (NAV_VTOL_TAKEOFF)',
        dialogPrompt: 'Climb vertically to',
        dialogNote:  'Hovers up using Q-modes (NAV_VTOL_TAKEOFF). Forward-flight transition is manual after.',
      };
    case 'rover':
      return {
        buttonLabel: 'Takeoff (n/a)',
        buttonHint:  'Rover does not support takeoff',
        dialogPrompt: '—',
      };
    case 'sub':
      return {
        buttonLabel: 'Takeoff (n/a)',
        buttonHint:  'Sub does not use a takeoff command',
        dialogPrompt: '—',
      };
  }
}

// =============================================================================
// Dispatch
// =============================================================================

export async function executeTakeoff(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  if (!ctx.capabilities.takeoff.supported) {
    return { ok: false, reason: `${ctx.vehicleClass} does not support takeoff` };
  }
  switch (ctx.vehicleClass) {
    case 'copter': return takeoffCopter(ctx);
    case 'plane':  return takeoffPlane(ctx);
    case 'vtol':   return takeoffVtol(ctx);
    case 'rover':
    case 'sub':
      return { ok: false, reason: `${ctx.vehicleClass} does not take off` };
  }
}

// =============================================================================
// Shared helpers
// =============================================================================

const GPS_TIMEOUT_MS = 25_000;
const ARM_TIMEOUT_MS = 5_000;
const MODE_TIMEOUT_MS = 2_500;

/** GPS/EKF readiness wait with rolling status updates. Used by air vehicles
 *  that need a 3D fix to hold position (anything that hovers). */
async function ensureGpsReady(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  const ready = () => {
    const g = ctx.getGps();
    return g.fixType >= 3 && g.hdop < 2.5;
  };
  if (ready()) return { ok: true };

  const start = Date.now();
  let lastShown = -1;
  const tick = setInterval(() => {
    const waited = Math.round((Date.now() - start) / 1000);
    if (waited !== lastShown) {
      lastShown = waited;
      const g = ctx.getGps();
      ctx.setStatus({
        text: `Waiting for GPS/EKF (${waited}s) — fix=${g.fixType} sats=${g.satellites} hdop=${g.hdop.toFixed(1)}`,
        type: 'info',
      });
    }
  }, 500);
  const ok = await ctx.waitForState(ready, GPS_TIMEOUT_MS, 250);
  clearInterval(tick);
  return ok
    ? { ok: true }
    : { ok: false, reason: 'GPS/EKF not ready — check sats/HDOP' };
}

/** Switch to a target mode with one retry. Used for the pre-arm prep phase
 *  where the FCU sometimes needs a beat to accept the change. */
async function switchMode(
  ctx: TakeoffContext, modeNum: number, label: string,
): Promise<TakeoffOutcome> {
  if (ctx.getFlight().modeNum === modeNum) return { ok: true };
  ctx.setStatus({ text: `Switching to ${label}...`, type: 'info' });
  await ctx.api.mavlinkSetMode(modeNum);
  if (await ctx.waitForState(() => ctx.getFlight().modeNum === modeNum, MODE_TIMEOUT_MS)) {
    return { ok: true };
  }
  // One retry — first SET_MODE sometimes lost on a busy link.
  await ctx.api.mavlinkSetMode(modeNum);
  if (await ctx.waitForState(() => ctx.getFlight().modeNum === modeNum, MODE_TIMEOUT_MS)) {
    return { ok: true };
  }
  return { ok: false, reason: `Failed to switch to ${label}` };
}

/** ArduPlane mode 13 — must not switch to Loiter mid-launch. */
const PLANE_TAKEOFF_MODE_NUM = 13;

/** SITL UDP RC can still command climb after SET_MODE until sticks are centred. */
async function neutralSitlRcIfNeeded(ctx: TakeoffContext): Promise<void> {
  if (!ctx.isSitl) return;
  if (ctx.vehicleClass !== 'copter' && ctx.vehicleClass !== 'vtol') return;
  try {
    await ctx.api.sitlRcSend({
      roll: 0, pitch: 0, yaw: 0, throttle: 0,
      aux1: 0, aux2: 0, aux3: 0, aux4: 0,
    });
    await new Promise((r) => setTimeout(r, 120));
  } catch {
    /* best-effort */
  }
}

/**
 * Put the vehicle into a mode that holds altitude and (where GPS allows) position.
 *
 * ArduCopter **AltHold** (mode 2) only locks baro altitude — the pilot still moves XY.
 * For “hang on the spot” after a GPS-backed takeoff we use **Loiter** (5) / **QLoiter** (19).
 */
export async function altHold(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  await neutralSitlRcIfNeeded(ctx);
  switch (ctx.vehicleClass) {
    case 'copter': {
      const r = await switchMode(ctx, 5, 'Loiter');
      if (r.ok) ctx.setStatus({ text: 'Loiter — holding position & altitude', type: 'success' });
      return r;
    }
    case 'vtol': {
      const r = await switchMode(ctx, 19, 'QLoiter');
      if (r.ok) ctx.setStatus({ text: 'QLoiter — holding position & altitude', type: 'success' });
      return r;
    }
    case 'plane': {
      if (ctx.getFlight().modeNum === PLANE_TAKEOFF_MODE_NUM) {
        return {
          ok: false,
          reason: 'Still in TAKEOFF — wait for climb/launch to finish before Loiter hold',
        };
      }
      const r = await switchMode(ctx, 12, 'Loiter');
      if (r.ok) ctx.setStatus({ text: 'Loiter — holding pattern at altitude', type: 'success' });
      return r;
    }
    case 'rover': {
      const r = await switchMode(ctx, 4, 'Hold');
      if (r.ok) ctx.setStatus({ text: 'Hold — stopped', type: 'success' });
      return r;
    }
    case 'sub': {
      const r = await switchMode(ctx, 2, 'AltHold');
      if (r.ok) ctx.setStatus({ text: 'AltHold — depth/altitude hold', type: 'success' });
      return r;
    }
    default:
      return { ok: false, reason: 'Alt hold not defined for this vehicle class' };
  }
}

/** Last metres before NAV_TAKEOFF target — cap climb rate to damp overshoot. */
const TAKEOFF_CLIMB_SLOW_ZONE_M = 3;
const TAKEOFF_APPROACH_CLIMB_MS = 0.65;
const TAKEOFF_CLIMB_WATCH_POLL_MS = 150;
const TAKEOFF_CLIMB_WATCH_MAX_MS = 120_000;

/**
 * Copter/heli: MAV_CMD_DO_CHANGE_SPEED (climb m/s) sent **before** NAV_TAKEOFF so the
 * default WPNAV climb (~2.5 m/s typical) is not used for the whole ascent.
 */
const TAKEOFF_COPTER_INITIAL_CLIMB_MS = 1.05;

/**
 * VTOL SITL QHover climb: normalized throttle (−1…1). Was 0.7 (~1850 µs); lower = slower
 * vertical rate. Too low (below ~0.3) may not reach target before timeout.
 */
const TAKEOFF_VTOL_SITL_CLIMB_THROTTLE = 0.42;

/** VTOL SITL: extra wait when climb stick is reduced (ms). */
const TAKEOFF_VTOL_SITL_ALT_WAIT_MS = 90_000;

const TAKEOFF_ALT_MILESTONE_POLL_MS = 200;
const TAKEOFF_ALT_MILESTONE_MAX_MS = 120_000;
/** Fraction-of-target milestones; skipped if the height in metres is below this (avoids spam on very low targets). */
const TAKEOFF_ALT_MILESTONE_MIN_M = 1.5;

/** Before Loiter/QLoiter after NAV_TAKEOFF: vertical rates must stay under this (m/s). */
const SETTLE_VZ_MS = 0.55;
const SETTLE_CLIMB_MS = 0.55;
const HOLD_SETTLE_POLL_MS = 150;
/** Require rates in-band this long before switching modes (FC still climbing NAV_TAKEOFF otherwise). */
const HOLD_SETTLE_STABLE_MS = 1000;

function delayMs(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isVerticalRateSettled(ctx: TakeoffContext, targetRelM: number): boolean {
  const p = ctx.getPosition();
  const vz = p.vz;
  const hud = ctx.getVfrHud?.();
  const climb = hud != null && Number.isFinite(hud.climb) ? hud.climb : Number.NaN;

  const vzLive = Number.isFinite(vz) && Math.abs(vz) > 0.05;
  const climbLive = Number.isFinite(climb) && Math.abs(climb) > 0.05;

  if (vzLive || climbLive) {
    const vzOk = !Number.isFinite(vz) || Math.abs(vz) < SETTLE_VZ_MS;
    const climbOk = !Number.isFinite(climb) || Math.abs(climb) < SETTLE_CLIMB_MS;
    return vzOk && climbOk;
  }

  const absRel = Math.abs(p.relativeAlt);
  if (!Number.isFinite(absRel)) return false;
  return absRel >= targetRelM - 0.12;
}

/**
 * Wait until near target altitude and vertical speed has decayed (NAV_TAKEOFF
 * climb essentially finished). Switching to Loiter while still commanding climb
 * leaves the craft drifting up in practice.
 */
async function waitForVerticalSettleNearTarget(
  ctx: TakeoffContext,
  targetRelM: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  let stableSince: number | null = null;
  while (Date.now() < deadline) {
    const p = ctx.getPosition();
    const rel = p.relativeAlt;
    if (!Number.isFinite(rel)) {
      await delayMs(HOLD_SETTLE_POLL_MS);
      continue;
    }
    const absRel = Math.abs(rel);
    const inBand =
      absRel >= targetRelM - 0.5 &&
      absRel <= targetRelM + 5;
    if (inBand && isVerticalRateSettled(ctx, targetRelM)) {
      if (stableSince == null) stableSince = Date.now();
      else if (Date.now() - stableSince >= HOLD_SETTLE_STABLE_MS) return true;
    } else {
      stableSince = null;
    }
    await delayMs(HOLD_SETTLE_POLL_MS);
  }
  return false;
}

/**
 * Background watcher: once remaining climb-to-target ≤ slow-zone, send DO_CHANGE_SPEED (climb).
 * Does not block takeoff success — NAV_TAKEOFF already fired.
 */
function scheduleTakeoffClimbApproachSlowdown(ctx: TakeoffContext, targetRelM: number): void {
  void (async () => {
    try {
      const deadline = Date.now() + TAKEOFF_CLIMB_WATCH_MAX_MS;
      let eased = false;
      while (Date.now() < deadline) {
        const rel = ctx.getPosition().relativeAlt;
        if (!Number.isFinite(rel)) {
          await delayMs(TAKEOFF_CLIMB_WATCH_POLL_MS);
          continue;
        }
        const remaining = targetRelM - rel;
        if (!eased && remaining <= TAKEOFF_CLIMB_SLOW_ZONE_M && remaining > -0.75) {
          eased = await ctx.api.mavlinkDoChangeClimbSpeed(TAKEOFF_APPROACH_CLIMB_MS);
          if (!eased) break;
        }
        if (rel >= targetRelM - 0.35) break;
        await delayMs(TAKEOFF_CLIMB_WATCH_POLL_MS);
      }
    } catch {
      /* best-effort */
    }
  })();
}

/**
 * Background watcher: reports climb progress vs target relative altitude (home)
 * and a single completion line when `relativeAlt` reaches the completion threshold.
 * Does not affect takeoff outcome — informational only.
 *
 * @param completionRelM — announce done when `relativeAlt >= completionRelM` (default ~target−0.35m).
 * @param options.holdOnComplete — after target height, call {@link altHold} (copter/VTOL from takeoff; not plane auto-takeoff).
 */
function scheduleTakeoffAltitudeMilestones(
  ctx: TakeoffContext,
  targetRelM: number,
  completionRelM?: number,
  options?: { holdOnComplete?: boolean },
): void {
  if (!(targetRelM > 0) || !Number.isFinite(targetRelM)) return;
  const doneAt =
    completionRelM !== undefined && Number.isFinite(completionRelM)
      ? completionRelM
      : targetRelM - 0.35;

  void (async () => {
    try {
      const fracs = [0.25, 0.5, 0.75] as const;
      const pending = new Set(
        fracs.filter((f) => targetRelM * f >= TAKEOFF_ALT_MILESTONE_MIN_M),
      );
      const deadline = Date.now() + TAKEOFF_ALT_MILESTONE_MAX_MS;
      let done = false;
      while (Date.now() < deadline && !done) {
        const rel = ctx.getPosition().relativeAlt;
        if (!Number.isFinite(rel)) {
          await delayMs(TAKEOFF_ALT_MILESTONE_POLL_MS);
          continue;
        }
        const absRel = Math.abs(rel);
        for (const f of [...pending]) {
          const need = targetRelM * f;
          if (absRel >= need - 0.25) {
            pending.delete(f);
            ctx.setStatus({
              text: `Takeoff climb — ~${Math.round(need)}m (${Math.round(f * 100)}% of ${Math.round(targetRelM)}m target)`,
              type: 'info',
            });
          }
        }

        if (absRel >= doneAt) {
          done = true;
          if (options?.holdOnComplete) {
            ctx.setStatus({
              text: 'Near target — waiting for climb to finish before Loiter…',
              type: 'info',
            });
            const settledOk = await waitForVerticalSettleNearTarget(ctx, targetRelM, 45_000);
            if (!settledOk) {
              ctx.setStatus({
                text: 'Climb settle timeout — switching to Loiter anyway',
                type: 'info',
              });
            }
            ctx.setStatus({
              text: `Reached target altitude (~${Math.round(targetRelM)}m above home)`,
              type: 'success',
            });
            const hold = await altHold(ctx);
            if (!hold.ok) {
              ctx.setStatus({ text: hold.reason, type: 'error' });
            }
          } else {
            ctx.setStatus({
              text: `Reached target altitude (~${Math.round(targetRelM)}m above home)`,
              type: 'success',
            });
          }
          break;
        }
        await delayMs(TAKEOFF_ALT_MILESTONE_POLL_MS);
      }
    } catch {
      /* best-effort */
    }
  })();
}

async function armIfNeeded(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  if (ctx.getFlight().armed) return { ok: true };
  ctx.setStatus({ text: 'Arming...', type: 'info' });
  const sent = await ctx.api.mavlinkArmDisarm(true, ctx.forceArm);
  if (!sent) return { ok: false, reason: 'Arm failed — not connected' };
  const armed = await ctx.waitForState(() => ctx.getFlight().armed, ARM_TIMEOUT_MS);
  return armed
    ? { ok: true }
    : { ok: false, reason: 'Arm timed out — check pre-arm' };
}

// =============================================================================
// Per-vehicle strategies
// =============================================================================

/**
 * Multirotor + helicopter takeoff:
 *   GPS → STABILIZE → ARM → GUIDED → NAV_TAKEOFF only.
 *
 * Do **not** chain DO_REPOSITION / Loiter here: yaw=0° on reposition fights the current
 * heading (side‑to‑side swash), and mode/command changes mid‑climb confuse AP/SITL
 * (overshoot, 10m interpreted as runaway climb). Optional DO_CHANGE_SPEED (climb) near
 * target only eases vertical rate — no lateral goto.
 */
async function takeoffCopter(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  const gps = await ensureGpsReady(ctx);
  if (!gps.ok) return gps;

  const stab = await switchMode(ctx, ctx.capabilities.stabilizeModeNum, 'Stabilize');
  if (!stab.ok) return stab;

  const arm = await armIfNeeded(ctx);
  if (!arm.ok) return arm;

  const guided = await switchMode(ctx, ctx.capabilities.guidedModeNum, 'Guided');
  if (!guided.ok) return guided;

  if (!ctx.getFlight().armed) {
    return { ok: false, reason: 'Auto-disarmed before takeoff — retry' };
  }

  ctx.setStatus({ text: `Taking off to ${ctx.altitudeM}m above home (Guided)…`, type: 'info' });
  await ctx.api.mavlinkDoChangeClimbSpeed(TAKEOFF_COPTER_INITIAL_CLIMB_MS);
  await delayMs(120);
  const ok = await ctx.api.mavlinkTakeoff(ctx.altitudeM);
  if (!ok) return { ok: false, reason: 'Takeoff command failed' };
  scheduleTakeoffClimbApproachSlowdown(ctx, ctx.altitudeM);
  scheduleTakeoffAltitudeMilestones(ctx, ctx.altitudeM, undefined, { holdOnComplete: true });
  return { ok: true };
}

/**
 * Fixed-wing takeoff:
 *   ARM (in current mode) → set TKOFF_ALT → switch to TAKEOFF mode (13).
 * No NAV_TAKEOFF command — ArduPlane rejects it in GUIDED. The dedicated
 * TAKEOFF mode handles the launch detect (hand throw / runway / catapult)
 * and climbs to the param-driven altitude. Skips the GPS wait because plane
 * can manual-takeoff without a fix.
 *   https://ardupilot.org/plane/docs/automatic-takeoff.html
 */
async function takeoffPlane(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  const arm = await armIfNeeded(ctx);
  if (!arm.ok) return arm;

  const cap = ctx.capabilities.takeoff;
  if (cap.method !== 'mode' || cap.modeNum === undefined) {
    return { ok: false, reason: 'Plane takeoff misconfigured — no TAKEOFF mode set' };
  }

  if (cap.altParam) {
    ctx.setStatus({ text: `Setting ${cap.altParam}=${ctx.altitudeM}m...`, type: 'info' });
    try {
      // MAV_PARAM_TYPE_REAL32 = 9
      await ctx.api.setParameter(cap.altParam, ctx.altitudeM, 9);
    } catch {
      // Non-fatal — TAKEOFF mode falls back to whatever value is already on
      // the FC. Worth logging but not aborting on.
    }
  }

  const into = await switchMode(ctx, cap.modeNum, 'TAKEOFF');
  if (!into.ok) return into;

  ctx.setStatus({ text: `Taking off to ${ctx.altitudeM}m...`, type: 'success' });
  scheduleTakeoffAltitudeMilestones(ctx, ctx.altitudeM, undefined, { holdOnComplete: false });
  return { ok: true };
}

/**
 * VTOL / quadplane / tailsitter takeoff. Two distinct paths:
 *
 * - **Real hardware** (`isSitl=false`): GUIDED + NAV_VTOL_TAKEOFF (84).
 *   FCU reads `Q_GUIDED_MODE`, takes the command, hovers up to alt. Standard
 *   ArduPilot protocol; works on real motors.
 *
 * - **SITL** (`isSitl=true`): QHOVER + virtual-RC throttle ramp. Bypasses
 *   NAV_VTOL_TAKEOFF entirely because upstream's tailsitter SITL physics
 *   fires the Position1→Position2 transition the instant the command lands
 *   (vehicle never climbs, throttle stays at 0). QHOVER + sustained-high
 *   stick climbs cleanly through the simulator's intended control path —
 *   same way real tailsitter pilots take off in the field.
 */
async function takeoffVtol(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  return ctx.isSitl ? takeoffVtolSitl(ctx) : takeoffVtolRealHw(ctx);
}

/**
 * Real-FC path. QSTABILIZE pre-arm because tail-stand attitude breaks
 * fixed-wing arming checks. GUIDED + Q_GUIDED_MODE=1 so the FCU honors
 * NAV_VTOL_TAKEOFF (otherwise it silently ignores the command and the
 * vehicle sits armed at 0% throttle).
 *   https://ardupilot.org/plane/docs/parameters.html#q-guided-mode
 */
async function takeoffVtolRealHw(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  const gps = await ensureGpsReady(ctx);
  if (!gps.ok) return gps;

  const stab = await switchMode(ctx, ctx.capabilities.stabilizeModeNum, 'QStabilize');
  if (!stab.ok) return stab;

  const arm = await armIfNeeded(ctx);
  if (!arm.ok) return arm;

  const guided = await switchMode(ctx, ctx.capabilities.guidedModeNum, 'Guided');
  if (!guided.ok) return guided;

  const cur = ctx.getParam('Q_GUIDED_MODE');
  const isOn = cur && typeof cur.value === 'number' && cur.value >= 1;
  if (!isOn) {
    ctx.setStatus({ text: 'Enabling Q_GUIDED_MODE…', type: 'info' });
    try {
      await ctx.api.setParameter('Q_GUIDED_MODE', 1, 2); // MAV_PARAM_TYPE_INT8
      await new Promise((r) => setTimeout(r, 250));
    } catch {
      /* best-effort — VTOL takeoff may still work if param was already set */
    }
  }

  if (!ctx.getFlight().armed) {
    return { ok: false, reason: 'Auto-disarmed before takeoff — retry' };
  }

  ctx.setStatus({ text: `Vertical takeoff to ${ctx.altitudeM}m…`, type: 'info' });
  const ok = await ctx.api.mavlinkVtolTakeoff(ctx.altitudeM);
  if (!ok) return { ok: false, reason: 'VTOL takeoff command failed' };
  scheduleTakeoffAltitudeMilestones(ctx, ctx.altitudeM, undefined, { holdOnComplete: true });
  return { ok: true };
}

/**
 * SITL path. Pre-arm via QSTABILIZE → arm → switch to QHOVER → start the
 * virtual RC sender → ramp throttle stick high to climb → wait for target
 * altitude → drop stick to mid (= hover hold). This path is also closer to
 * how real tailsitter pilots take off (with their own TX), so even if the
 * physics bug gets fixed upstream, this remains a reasonable default for
 * tailsitter classes.
 */
async function takeoffVtolSitl(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  const gps = await ensureGpsReady(ctx);
  if (!gps.ok) return gps;

  // Send a FULL stick state on every transmission. The sender keeps state
  // between calls — if the user fiddled with sliders before clicking
  // Takeoff, partial updates would let stale roll/pitch/yaw values leak in
  // and cause the vehicle to drift / yaw / pitch on its own. Explicit zeros
  // give the FCU a clean neutral pose.
  const sticks = (overrides: { throttle: number }) => ({
    throttle: overrides.throttle,
    roll: 0, pitch: 0, yaw: 0,
    aux1: -1, aux2: -1, aux3: -1, aux4: -1,
  });

  // Throttle MUST start low before arm — Q-modes refuse to arm if
  // throttle stick is high (interpreted as "pilot wants instant climb").
  await ctx.api.sitlRcStart();
  await ctx.api.sitlRcSend(sticks({ throttle: -1 }));

  const stab = await switchMode(ctx, ctx.capabilities.stabilizeModeNum, 'QStabilize');
  if (!stab.ok) return stab;

  const arm = await armIfNeeded(ctx);
  if (!arm.ok) return arm;

  const qhover = await switchMode(ctx, 18, 'QHover');
  if (!qhover.ok) return qhover;

  if (!ctx.getFlight().armed) {
    return { ok: false, reason: 'Auto-disarmed before takeoff — retry' };
  }

  // Climb in QHOVER via throttle stick; magnitude sets vertical rate (see TAKEOFF_VTOL_SITL_CLIMB_THROTTLE).
  ctx.setStatus({ text: `Climbing to ${ctx.altitudeM}m…`, type: 'info' });
  await ctx.api.sitlRcSend(sticks({ throttle: TAKEOFF_VTOL_SITL_CLIMB_THROTTLE }));

  const TARGET_FRAC = 0.9;
  scheduleTakeoffAltitudeMilestones(ctx, ctx.altitudeM, ctx.altitudeM * TARGET_FRAC, {
    holdOnComplete: true,
  });

  // Wait for relative altitude to reach 90% of target. Reads from
  // PositionData.relativeAlt (m above home) which is the same field the
  // panel surfaces as "Rel".
  const reached = await ctx.waitForState(() => {
    return Math.abs(ctx.getPosition().relativeAlt) >= ctx.altitudeM * TARGET_FRAC;
  }, TAKEOFF_VTOL_SITL_ALT_WAIT_MS, 250);

  // Hold altitude regardless of outcome — mid-stick = QHover position hold.
  // Keep all other channels centered so the vehicle doesn't yaw/drift on
  // stale stick state.
  await ctx.api.sitlRcSend(sticks({ throttle: 0 }));

  if (!reached) {
    return {
      ok: false,
      reason: `Did not reach ${ctx.altitudeM}m — vehicle still armed in QHover, take RC control`,
    };
  }
  return { ok: true };
}
