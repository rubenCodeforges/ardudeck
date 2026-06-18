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

import type { ArduPilotVehicleClass, VehicleCapabilities, FlightState, GpsData, PositionData } from '../../../shared/telemetry-types';
import type { FirmwareSource } from '../../../shared/firmware-types';
import { encodePx4CustomMode } from '../../../shared/telemetry-types';

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
  /** Detected firmware family. PX4 takes a completely separate, standard-MAVLink
   *  takeoff path (see takeoffPx4); ArduPilot and unknown fall through to the
   *  per-vehicle ArduPilot strategies unchanged. */
  firmware?: FirmwareSource;
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
  /** Live parameter cache. */
  getParam: (id: string) => { value: number; type: number } | undefined;

  /** IPC bridge — typed against the shapes we actually use. */
  api: {
    mavlinkSetMode:     (modeNum: number) => Promise<boolean>;
    mavlinkArmDisarm:   (arm: boolean, force?: boolean) => Promise<boolean>;
    mavlinkTakeoff:     (alt: number, pitchDeg?: number) => Promise<boolean>;
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

export function presentTakeoff(
  vehicleClass: ArduPilotVehicleClass,
  firmware?: FirmwareSource,
): TakeoffPresentation {
  // PX4 vehicles run the separate takeoffPx4 path (AUTO_TAKEOFF mode +
  // MIS_TAKEOFF_ALT), so the copy must not reference ArduPilot concepts like
  // GUIDED or TKOFF_ALT. Surface vehicles still read "n/a" regardless.
  if (firmware === 'px4' && vehicleClass !== 'rover' && vehicleClass !== 'sub') {
    return {
      buttonLabel: 'Auto Takeoff…',
      buttonHint:  'Arm, switch to AUTO_TAKEOFF, climb to MIS_TAKEOFF_ALT',
      dialogPrompt: 'Climb to',
      dialogNote:  'PX4 auto-takeoff: sets MIS_TAKEOFF_ALT and switches to AUTO_TAKEOFF at the current position.',
    };
  }
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
  // PX4 vehicles use a separate, standard-MAVLink takeoff path. The ArduPilot
  // strategies below send ArduPilot mode numbers and AP-specific logic which is
  // wrong (and unsafe) on a PX4 craft, so gate strictly on firmware first.
  if (ctx.firmware === 'px4') {
    return takeoffPx4(ctx);
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
 *   GPS ready → STABILIZE → ARM → GUIDED → verify armed → NAV_TAKEOFF.
 * STABILIZE first because GUIDED arms can be rejected on the first try and
 * STABILIZE is the most permissive arm-from mode for copter.
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

  ctx.setStatus({ text: `Taking off to ${ctx.altitudeM}m...`, type: 'info' });
  const ok = await ctx.api.mavlinkTakeoff(ctx.altitudeM);
  return ok
    ? { ok: true }
    : { ok: false, reason: 'Takeoff command failed' };
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
    } catch (err) {
      console.warn('[Takeoff] Q_GUIDED_MODE write failed:', err);
    }
  }

  if (!ctx.getFlight().armed) {
    return { ok: false, reason: 'Auto-disarmed before takeoff — retry' };
  }

  ctx.setStatus({ text: `Vertical takeoff to ${ctx.altitudeM}m…`, type: 'info' });
  const ok = await ctx.api.mavlinkVtolTakeoff(ctx.altitudeM);
  return ok
    ? { ok: true }
    : { ok: false, reason: 'VTOL takeoff command failed' };
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

  // Climb. ~0.7 normalized = ~1850 PWM = strong climb command in QHOVER.
  ctx.setStatus({ text: `Climbing to ${ctx.altitudeM}m…`, type: 'info' });
  await ctx.api.sitlRcSend(sticks({ throttle: 0.7 }));

  // Wait for relative altitude to reach 90% of target. Reads from
  // PositionData.relativeAlt (m above home) which is the same field the
  // panel surfaces as "Rel".
  const TARGET_FRAC = 0.9;
  const reached = await ctx.waitForState(() => {
    return Math.abs(ctx.getPosition().relativeAlt) >= ctx.altitudeM * TARGET_FRAC;
  }, 25_000, 250);

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

// =============================================================================
// PX4 strategy
// =============================================================================

/**
 * PX4 auto-takeoff (firmware-agnostic vehicle class). Standard PX4/MAVLink GCS
 * takeoff, deliberately separate from the ArduPilot strategies above so none of
 * the ArduPilot mode numbers or AP-specific logic ever touch a PX4 craft.
 *
 * Procedure (conservative, standard PX4):
 *   1. GPS/EKF wait (PX4 auto-takeoff needs a position estimate to climb).
 *   2. Set MIS_TAKEOFF_ALT to the UI-selected altitude so the climb target is
 *      honored (PX4 AUTO_TAKEOFF reads this param, not a commanded altitude).
 *      Non-fatal: falls back to the on-FC value if the write is rejected.
 *   3. ARM via the generic, vendor-neutral MAV_CMD_COMPONENT_ARM_DISARM (400),
 *      reusing the existing arm flow (forceArm honored).
 *   4. Switch to AUTO_TAKEOFF (PX4 main mode AUTO=4, sub mode TAKEOFF=2) via the
 *      generic mavlinkSetMode IPC, which carries the PX4 custom_mode bitfield.
 *
 * Why mode-switch instead of MAV_CMD_NAV_TAKEOFF (22): the only renderer-side
 * takeoff IPC (mavlinkTakeoff) hard-codes ArduPilot-oriented params, pitch=15
 * and lat/lon=0. On PX4 a NAV_TAKEOFF with lat/lon=0 is a valid coordinate
 * (Gulf of Guinea), so the craft could try to fly there. PX4 expects NaN
 * lat/lon for "use current position", which that IPC cannot express, and we are
 * not allowed to touch the ArduPilot takeoff handler. AUTO_TAKEOFF mode is the
 * documented PX4 trigger, takes off at the current position, and rides entirely
 * on already-generic, vendor-neutral IPCs (no new main-process handler needed).
 */
async function takeoffPx4(ctx: TakeoffContext): Promise<TakeoffOutcome> {
  const gps = await ensureGpsReady(ctx);
  if (!gps.ok) return gps;

  // PX4 AUTO_TAKEOFF climbs to MIS_TAKEOFF_ALT. Push the UI altitude there so
  // the firmware-agnostic altitude selector stays meaningful. MAV_PARAM_TYPE
  // for PX4 floats is REAL32 = 9.
  ctx.setStatus({ text: `Setting MIS_TAKEOFF_ALT=${ctx.altitudeM}m...`, type: 'info' });
  try {
    await ctx.api.setParameter('MIS_TAKEOFF_ALT', ctx.altitudeM, 9);
  } catch (err) {
    // Non-fatal: PX4 falls back to the value already on the FC.
    console.warn('[Takeoff] MIS_TAKEOFF_ALT write failed:', err);
  }

  const arm = await armIfNeeded(ctx);
  if (!arm.ok) return arm;

  if (!ctx.getFlight().armed) {
    return { ok: false, reason: 'Auto-disarmed before takeoff, retry' };
  }

  // AUTO_TAKEOFF: PX4 main mode AUTO (4), sub mode TAKEOFF (2). The mode switch
  // itself initiates the auto-takeoff on PX4.
  const takeoffMode = encodePx4CustomMode(4, 2);
  ctx.setStatus({ text: `PX4 auto-takeoff to ${ctx.altitudeM}m...`, type: 'info' });
  const into = await switchMode(ctx, takeoffMode, 'Takeoff');
  if (!into.ok) return into;

  return { ok: true };
}
