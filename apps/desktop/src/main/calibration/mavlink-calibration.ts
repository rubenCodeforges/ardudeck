/**
 * MAVLink Calibration
 *
 * Handles sensor calibration for ArduPilot via MAVLink protocol.
 * Uses MAV_CMD_PREFLIGHT_CALIBRATION (241) and tracks progress via STATUSTEXT.
 *
 * Reference: MissionPlanner ConfigAccelerometerCalibration.cs
 */

import type {
  CalibrationTypeId,
  CalibrationFirmware,
  CalibrationProgressEvent,
  CalibrationCompleteEvent,
  CalibrationData,
} from '../../shared/calibration-types.js';
import { t } from '../../shared/i18n/index.js';

// =============================================================================
// MAVLink Constants
// =============================================================================

const MAV_CMD_PREFLIGHT_CALIBRATION = 241;
// ArduPilot onboard compass ("wave it around") calibration. NOT
// PREFLIGHT_CALIBRATION param2 — AP dropped mag cal from that command and
// answers MAV_RESULT_UNSUPPORTED, so the whole compass flow must use this.
const MAV_CMD_DO_START_MAG_CAL = 42424;
const MAV_CMD_SET_MESSAGE_INTERVAL = 511;
// MAG_CAL_PROGRESS/REPORT ride STREAM_EXTRA3. A vehicle with SRn_EXTRA3 at 0
// sends neither, and the calibration then looks frozen with no coverage
// sphere, so ask for them by message id instead of trusting stream rates.
const MSG_ID_MAG_CAL_PROGRESS = 191;
const MSG_ID_MAG_CAL_REPORT = 192;
// Tells ArduPilot to abandon a running onboard mag cal without saving.
const MAV_CMD_DO_CANCEL_MAG_CAL = 42426;

// MAG_CAL_STATUS enum (from MAG_CAL_PROGRESS / MAG_CAL_REPORT cal_status field)
const MAG_CAL_SUCCESS = 4;
const MAG_CAL_FAILED = 5;
const MAG_CAL_BAD_ORIENTATION = 6;
const MAG_CAL_BAD_RADIUS = 7;
const MAV_CMD_ACCELCAL_VEHICLE_POS = 42429;
const MAV_CMD_FIXED_MAG_CAL_YAW = 42006;

// ACCELCAL_VEHICLE_POS enum values (ArduPilot)
const ACCELCAL_POS = {
  LEVEL: 1,
  LEFT: 2,
  RIGHT: 3,
  NOSEDOWN: 4,
  NOSEUP: 5,
  BACK: 6, // Inverted / top down
  SUCCESS: 16777215,
  FAILED: 16777216,
} as const;

// Map ArduPilot position enum to our 0-5 index. Index order MATCHES AP's
// request order so the user-facing step number ("position N/6") corresponds
// to the order AP actually walks through the poses. AP order:
// Level(1), Left(2), Right(3), NoseDown(4), NoseUp(5), Back/Inverted(6)
const ARDU_POS_TO_INDEX: Record<number, number> = {
  [ACCELCAL_POS.LEVEL]: 0,
  [ACCELCAL_POS.LEFT]: 1,
  [ACCELCAL_POS.RIGHT]: 2,
  [ACCELCAL_POS.NOSEDOWN]: 3,
  [ACCELCAL_POS.NOSEUP]: 4,
  [ACCELCAL_POS.BACK]: 5,
};

// Reverse: our index to ArduPilot position enum
const INDEX_TO_ARDU_POS: Record<number, number> = {
  0: ACCELCAL_POS.LEVEL,
  1: ACCELCAL_POS.LEFT,
  2: ACCELCAL_POS.RIGHT,
  3: ACCELCAL_POS.NOSEDOWN,
  4: ACCELCAL_POS.NOSEUP,
  5: ACCELCAL_POS.BACK,
};

const POSITION_NAMES = [
  'Level (Top Up)', // i18n-exempt
  'Left Side Down', // i18n-exempt
  'Right Side Down', // i18n-exempt
  'Nose Down', // i18n-exempt
  'Nose Up', // i18n-exempt
  'Inverted (Top Down)', // i18n-exempt
];

// =============================================================================
// PX4 constants
// =============================================================================

// PX4 names its accel-cal sides by which side of the vehicle faces DOWN,
// narrated via "[cal] <side> orientation detected" / "[cal] <side> side done".
// Mapped onto the same 0-5 position indices the UI diagram uses.
const PX4_SIDE_TO_INDEX: Record<string, number> = {
  down: 0,  // level, belly down
  left: 1,  // left side down
  right: 2, // right side down
  front: 3, // nose down
  back: 4,  // nose up (tail down)
  up: 5,    // inverted
};

const PX4_SIDE_LABEL: Record<string, string> = {
  down: 'Level (Top Up)', // i18n-exempt
  left: 'Left Side Down', // i18n-exempt
  right: 'Right Side Down', // i18n-exempt
  front: 'Nose Down', // i18n-exempt
  back: 'Nose Up', // i18n-exempt
  up: 'Inverted (Top Down)', // i18n-exempt
};

const px4SideLabel = (side: string): string => t(`main:mavlinkCalibration.sides.${side}`, { defaultValue: PX4_SIDE_LABEL[side] });

// Overall PX4 run timeouts. PX4 gives no MAG_CAL-style keepalive, so a run
// that stops narrating is dead. Rotation-driven cals get generous windows
// (six sides, one pilot, big airframes); one-shots are quick.
const PX4_CAL_TIMEOUT_MS: Record<string, number> = {
  'compass': 300_000,
  'accel-6point': 300_000,
  'accel-level': 60_000,
  'accel-quick': 60_000,
  'gyro': 60_000,
};

// =============================================================================
// Types
// =============================================================================

export interface MavlinkCalibrationDeps {
  /** Send a MAVLink COMMAND_LONG to the FC. Returns true if packet was sent. */
  sendCommandLong: (command: number, params: {
    param1: number; param2: number; param3: number; param4: number;
    param5: number; param6: number; param7: number;
  }) => Promise<boolean>;
  /** Send a MAVLink COMMAND_ACK to the FC. Returns true if packet was sent. */
  sendCommandAck: (command: number, result: number) => Promise<boolean>;
  sendLog: (level: 'info' | 'warn' | 'error', message: string, details?: string) => void;
  sendProgress: (event: CalibrationProgressEvent) => void;
  sendComplete: (event: CalibrationCompleteEvent) => void;
}

/** One calibration state machine per link: the GUI uses the shared instance, production bays one each. */
export function createMavlinkCalibration() {
// =============================================================================
// State
// =============================================================================

let deps: MavlinkCalibrationDeps | null = null;
let activeCalType: CalibrationTypeId | null = null;
// Which MAVLink dialect the active calibration speaks. Set at start time from
// the connection's firmware; every protocol decision branches on this, never
// on heuristics.
let activeFirmware: CalibrationFirmware = 'ardupilot';
// Fails the cal if it never converges (unhealthy compass / heavy interference /
// insufficient rotation) instead of sitting at 95% forever. A healthy compass
// finishes in 30-90s even rotating slowly.
let compassCalTimeoutId: ReturnType<typeof setTimeout> | null = null;
/** No progress for this long ends the run. Re-armed on every advance. */
const COMPASS_CAL_STALL_MS = 150000;

// PX4 whole-run watchdog (armed for every PX4 cal type) and 6-point side
// bookkeeping driven by "[cal] <side> side done" messages.
let px4TimeoutId: ReturnType<typeof setTimeout> | null = null;
let px4SidesDone: Set<number> = new Set();
let px4LastProgressPct = 0;
// DO_START_MAG_CAL calibrates every compass in the mask and emits one
// MAG_CAL_REPORT per compass. Track which compass_ids reported SUCCESS so we
// only complete once the whole batch is done (the report's cal_mask tells us
// how many to expect).
const magCalSuccesses = new Set<number>();

// A compass that failed its fit, by 0-based id, with the reason. ArduPilot
// calibrates and autosaves each compass independently, so one bad fit must not
// discard the good ones: the run completes with whatever converged.
const magCalFailures = new Map<number, string>();

// Live per-compass completion percentage from MAG_CAL_PROGRESS, keyed by
// 0-based compass_id. Drives the per-compass progress bars; the overall bar
// shows the LAGGING compass (min), because the cal only finishes when every
// compass in the mask converges.
const magCalPcts = new Map<number, number>();

// Per-compass fitness + orientation, keyed by the 0-based compass instance
// (same numbering as MAG_CAL_REPORT's compass_id and AP's "Mag(N)"). Sourced
// from MAG_CAL_REPORT and, more reliably on FCs that don't deliver 192, the
// "Mag(N) ... orientation: X <fitness>" STATUSTEXT. Surfaced on completion so
// the UI can flag a poor fit instead of a bare "success".
const magCalResults = new Map<number, { fitness: number; orientation: number | null }>();

function collectedCompassResults(): CalibrationData['compassResults'] {
  return Array.from(magCalResults.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([compass, r]) => ({ compass, fitness: r.fitness, orientation: r.orientation }));
}

// 6-point state
let expectedPosition = -1; // ArduPilot position enum value from FC
let positionStatus = [false, false, false, false, false, false];
// Safety-net timer fired after the user confirms the last position
// (in case AP's "Calibration successful" STATUSTEXT is dropped or never sent)
let sixPointFallbackTimerId: ReturnType<typeof setTimeout> | null = null;

// Hard timeout for synchronous one-shot calibrations (accel-level/gyro).
// AP runs these in <2s and either returns COMMAND_ACK or emits a failure
// STATUSTEXT. If neither arrives within this window the FC has gone silent
// (USB stall, FC reboot mid-cal, etc.) and we should fail rather than hang.
let oneShotTimeoutId: ReturnType<typeof setTimeout> | null = null;
const ONE_SHOT_TIMEOUT_MS = 15000;

// Pending ACK resolver for FIXED_MAG_CAL_YAW (42006). This command is fully
// synchronous on the FC: AP samples the current mag readings using the
// supplied yaw + GPS-derived earth-field vector, writes COMPASS_OFS_*, and
// returns COMMAND_ACK with ACCEPTED on success or FAILED if no GPS lock.
let pendingFixedMagCalYawResolver: ((result: { success: boolean; error?: string }) => void) | null = null;
let pendingFixedMagCalYawTimeoutId: ReturnType<typeof setTimeout> | null = null;
const FIXED_MAG_CAL_YAW_TIMEOUT_MS = 10000;

// Compass/motor calibration (compassmot). Runs outside the activeCalType state
// machine: the FC does not ACK the start command, it just enters the loop and
// streams COMPASSMOT_STATUS (decoded renderer-side). Finishing is a COMMAND_ACK
// for PREFLIGHT_CALIBRATION, which tells the FC to write COMPASS_MOT_* and exit.
let compassMotActive = false;

// =============================================================================
// Init
// =============================================================================

function initMavlinkCalibration(context: MavlinkCalibrationDeps): void {
  deps = context;
}

function cleanupMavlinkCalibration(): void {
  cancelMavlinkCalibration();
  deps = null;
}

// =============================================================================
// Public API
// =============================================================================

function isMavlinkCalibrationActive(): boolean {
  return activeCalType !== null;
}

/**
 * Large Vehicle MagCal — sends MAV_CMD_FIXED_MAG_CAL_YAW (42006).
 *
 * For aircraft too large to rotate through all axes for a normal compass
 * calibration. The user supplies the current true heading (degrees) and
 * GPS lock provides the local earth-field vector. AP solves for the offsets
 * in a single shot and writes COMPASS_OFS_*. Reboot recommended afterward.
 */
async function sendFixedMagCalYaw(headingDeg: number): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInitialized') };
  if (pendingFixedMagCalYawResolver) {
    return { success: false, error: t('main:mavlinkCalibration.magCalInProgress') };
  }

  // Normalize heading to [0, 360)
  let yaw = headingDeg % 360;
  if (yaw < 0) yaw += 360;

  deps.sendLog('info', `Starting Large Vehicle MagCal (FIXED_MAG_CAL_YAW yaw=${yaw}°)`);

  const sent = await deps.sendCommandLong(MAV_CMD_FIXED_MAG_CAL_YAW, {
    param1: yaw,    // yaw in degrees (true, not magnetic)
    param2: 0,      // compassmask (0 = all compasses)
    param3: 0,      // latitude (0 = use GPS)
    param4: 0,      // longitude (0 = use GPS)
    param5: 0, param6: 0, param7: 0,
  });

  if (!sent) {
    return { success: false, error: t('main:mavlinkCalibration.sendCommandFailed') };
  }

  return new Promise((resolve) => {
    pendingFixedMagCalYawResolver = resolve;
    pendingFixedMagCalYawTimeoutId = setTimeout(() => {
      const r = pendingFixedMagCalYawResolver;
      pendingFixedMagCalYawResolver = null;
      pendingFixedMagCalYawTimeoutId = null;
      if (r) {
        deps?.sendLog('error', 'Large Vehicle MagCal timed out — no COMMAND_ACK from FC');
        r({ success: false, error: t('main:mavlinkCalibration.noResponse') });
      }
    }, FIXED_MAG_CAL_YAW_TIMEOUT_MS);
  });
}

/**
 * Start compass/motor calibration (compassmot).
 *
 * Sends MAV_CMD_PREFLIGHT_CALIBRATION with param6=1. ArduPilot enters a mode
 * where raising the throttle spins the motors and it samples the compass
 * interference against throttle/current, streaming COMPASSMOT_STATUS (177) the
 * whole time. There is no start ACK - the running state is confirmed by the
 * arrival of COMPASSMOT_STATUS frames, which the renderer decodes directly.
 */
async function startCompassMot(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInitialized') };
  if (compassMotActive) return { success: false, error: t('main:mavlinkCalibration.compassMotInProgress') };

  deps.sendLog('info', 'Starting CompassMot (PREFLIGHT_CALIBRATION param6=1)');

  const sent = await deps.sendCommandLong(MAV_CMD_PREFLIGHT_CALIBRATION, {
    param1: 0, param2: 0, param3: 0, param4: 0,
    param5: 0,
    param6: 1, // compass/motor calibration
    param7: 0,
  });

  if (!sent) {
    return { success: false, error: t('main:mavlinkCalibration.sendCommandFailed') };
  }

  compassMotActive = true;
  return { success: true };
}

/**
 * Finish compassmot. ArduPilot exits its calibration loop and writes the
 * computed COMPASS_MOT_* offsets when it receives a COMMAND_ACK for
 * PREFLIGHT_CALIBRATION. Mission Planner sends it twice for reliability over
 * lossy links, so we do the same.
 */
async function stopCompassMot(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInitialized') };

  deps.sendLog('info', 'Finishing CompassMot (COMMAND_ACK for PREFLIGHT_CALIBRATION)'); // i18n-exempt

  const sent = await deps.sendCommandAck(MAV_CMD_PREFLIGHT_CALIBRATION, 0);
  await deps.sendCommandAck(MAV_CMD_PREFLIGHT_CALIBRATION, 0);
  compassMotActive = false;

  if (!sent) {
    return { success: false, error: t('main:mavlinkCalibration.sendFinishFailed') };
  }
  return { success: true };
}

async function startMavlinkCalibration(
  type: CalibrationTypeId,
  firmware: CalibrationFirmware = 'ardupilot',
): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInitialized') };
  if (activeCalType) return { success: false, error: t('main:calibration.alreadyInProgress') };

  activeCalType = type;
  activeFirmware = firmware;

  if (firmware === 'px4') {
    return startPx4Calibration(type);
  }

  switch (type) {
    case 'accel-level':
      return startAccelLevel();
    case 'accel-quick':
      return startAccelQuick();
    case 'accel-6point':
      return startAccel6Point();
    case 'gyro':
      return startGyro();
    case 'compass':
      return startCompass();
    default:
      activeCalType = null;
      return { success: false, error: t('main:mavlinkCalibration.unsupportedType', { type }) };
  }
}

async function confirmMavlinkPosition(position: number): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInitialized') };
  if (activeCalType !== 'accel-6point') return { success: false, error: t('main:calibration.sixPointNotInProgress') };
  // PX4 detects orientations automatically and has no confirm step; the UI
  // never shows the button on PX4, this is a belt-and-braces guard.
  if (activeFirmware === 'px4') return { success: false, error: t('main:mavlinkCalibration.px4AutoPositions') };

  // Convert our position index to ArduPilot enum
  const arduPos = INDEX_TO_ARDU_POS[position];
  if (arduPos === undefined) return { success: false, error: t('main:mavlinkCalibration.invalidPosition', { position }) };

  // ArduPilot only accepts position confirmations when its AccelCal state
  // machine is in WAITING_FOR_ORIENTATION. AP signals readiness by sending
  // a COMMAND_LONG with ACCELCAL_VEHICLE_POS to the GCS (handled by
  // handleIncomingCommandLong, which sets expectedPosition). If we send a
  // confirmation before AP asks for it, AP returns MAV_RESULT_FAILED.
  // Mission Planner also waits for this request before enabling the button.
  if (expectedPosition === -1) {
    return { success: false, error: t('main:mavlinkCalibration.waitingForPositionRequest') };
  }

  deps.sendLog('info', `Confirming position ${position} (${POSITION_NAMES[position]}) — sending ACCELCAL_VEHICLE_POS`);

  const sent = await deps.sendCommandLong(MAV_CMD_ACCELCAL_VEHICLE_POS, {
    param1: arduPos,
    param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
  });

  if (!sent) {
    deps.sendLog('error', `Position ${position}: failed to send ACCELCAL_VEHICLE_POS`);
    return { success: false, error: t('main:mavlinkCalibration.positionConfirmFailed') };
  }

  // Mark this position as captured locally and reset expectedPosition so
  // we wait for AP to request the NEXT position before allowing another
  // confirm. AP re-enters COLLECTING_SAMPLE after each confirmation and
  // won't accept the next position until it transitions back to
  // WAITING_FOR_ORIENTATION (signalled by a new COMMAND_LONG request).
  positionStatus[position] = true;
  expectedPosition = -1;

  // After ALL 6 positions are confirmed, arm a fallback timer in case the
  // FC's "Calibration successful" STATUSTEXT is dropped or never sent.
  // AP processes the 6 samples synchronously and saves to params; this
  // typically takes <2s. We give it 8s of grace before checking via the
  // diff guard. Driving this off positionStatus.every (instead of a
  // hardcoded `position === 5`) is correct regardless of which index the
  // last AP-requested pose maps to.
  if (positionStatus.every(Boolean)) {
    if (sixPointFallbackTimerId) clearTimeout(sixPointFallbackTimerId);
    sixPointFallbackTimerId = setTimeout(() => {
      sixPointFallbackTimerId = null;
      if (!deps || activeCalType !== 'accel-6point') return;
      // Silence is NOT success. Report completion as unconfirmed and let the
      // post-cal param diff (the only reliable witness) decide the outcome -
      // an optimistic success here once masked a cal the FC never wrote.
      deps.sendLog('warn', 'No completion message from FC after 8s, result unconfirmed, verifying against parameters');
      deps.sendComplete({
        type: 'accel-6point',
        success: true,
        unconfirmed: true,
      });
      cancelMavlinkCalibration();
    }, 8000);
  }

  return { success: true };
}

function cancelMavlinkCalibration(): void {
  // Hand the mag cal messages back to the vehicle's own stream rates.
  if (activeCalType === 'compass' && activeFirmware === 'ardupilot') {
    void requestMagCalStreams(-1);
  }
  if (compassCalTimeoutId) {
    clearTimeout(compassCalTimeoutId);
    compassCalTimeoutId = null;
  }
  if (sixPointFallbackTimerId) {
    clearTimeout(sixPointFallbackTimerId);
    sixPointFallbackTimerId = null;
  }
  if (oneShotTimeoutId) {
    clearTimeout(oneShotTimeoutId);
    oneShotTimeoutId = null;
  }
  if (px4TimeoutId) {
    clearTimeout(px4TimeoutId);
    px4TimeoutId = null;
  }
  activeCalType = null;
  activeFirmware = 'ardupilot';
  compassMotActive = false;
  expectedPosition = -1;
  positionStatus = [false, false, false, false, false, false];
  magCalSuccesses.clear();
  magCalFailures.clear();
  magCalResults.clear();
  magCalPcts.clear();
  px4SidesDone = new Set();
  px4LastProgressPct = 0;
}

/**
 * Ask the vehicle to abandon an in-flight calibration. ArduPilot compass cal
 * has a dedicated cancel command; PX4 cancels any running calibration when it
 * receives PREFLIGHT_CALIBRATION with every param zero (the QGC convention).
 * Fire-and-forget: local state is torn down regardless.
 */
function abortVehicleCalibration(): void {
  if (!deps || !activeCalType) return;
  if (activeFirmware === 'px4') {
    void deps.sendCommandLong(MAV_CMD_PREFLIGHT_CALIBRATION, {
      param1: 0, param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
    });
  } else if (activeCalType === 'compass') {
    void deps.sendCommandLong(MAV_CMD_DO_CANCEL_MAG_CAL, {
      param1: 0, param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
    });
  }
}

/**
 * Arm the safety-net timer for accel-level and gyro. If the FC neither
 * ACKs nor emits a recognizable STATUSTEXT, we fail the cal so the UI
 * doesn't hang at "Calibrating..." forever.
 */
function armOneShotTimeout(type: 'accel-level' | 'accel-quick' | 'gyro'): void {
  if (oneShotTimeoutId) clearTimeout(oneShotTimeoutId);
  oneShotTimeoutId = setTimeout(() => {
    oneShotTimeoutId = null;
    if (!deps || activeCalType !== type) return;
    deps.sendLog('error', `${type} calibration timed out — no response from flight controller after ${ONE_SHOT_TIMEOUT_MS / 1000}s`);
    deps.sendComplete({
      type,
      success: false,
      error: t('main:mavlinkCalibration.noResponse'),
    });
    cancelMavlinkCalibration();
  }, ONE_SHOT_TIMEOUT_MS);
}

// =============================================================================
// STATUSTEXT handler — called from ipc-handlers when STATUSTEXT is received
// =============================================================================

function handleCalibrationStatusText(text: string, severity: number): void {
  if (!deps || !activeCalType) return;

  const lower = text.toLowerCase();

  // PX4 speaks an entirely different dialect and gets its own state machine.
  // Never let PX4 text fall through to the ArduPilot matchers below.
  if (activeFirmware === 'px4') {
    handlePx4CalStatusText(text, lower);
    return;
  }

  // Completion detection — match the exact strings ArduPilot emits.
  // AP_AccelCal sends "Calibration successful" / "Calibration FAILED" /
  // "Calibration cancelled" via _printf (MAV_SEVERITY_CRITICAL).
  if (lower.includes('calibration successful') || lower.includes('calibration done') || lower.includes('calibration complete')) {
    deps.sendLog('info', `Calibration completed successfully`); // i18n-exempt
    deps.sendComplete({
      type: activeCalType,
      success: true,
    });
    cancelMavlinkCalibration();
    return;
  }

  if (lower.includes('calibration failed') || lower.includes('cal failed') || lower.includes('calibration cancelled')) {
    deps.sendLog('error', `Calibration failed: ${text}`);
    deps.sendComplete({
      type: activeCalType,
      success: false,
      error: text,
    });
    cancelMavlinkCalibration();
    return;
  }

  // ArduPilot accel-level failure: AP_InertialSensor::calibrate_trim() emits
  // "trim over maximum of 10 degrees" and returns false when the vehicle is
  // tilted more than 10° from horizontal. AP also returns MAV_RESULT_FAILED
  // afterward, but the COMMAND_ACK can be missed if the FC reinitializes,
  // so this STATUSTEXT match is the reliable signal.
  if (activeCalType === 'accel-level' && (lower.includes('trim over') || lower.includes('trim failed'))) {
    deps.sendLog('error', `Level calibration rejected: ${text}`);
    deps.sendComplete({
      type: 'accel-level',
      success: false,
      error: t('main:mavlinkCalibration.tiltedLevel'),
    });
    cancelMavlinkCalibration();
    return;
  }

  // Note: we previously detected "Initialising ArduPilot" STATUSTEXT as a
  // mid-cal reboot signal, but this caused false aborts: AP sends the boot
  // message on connect and it can arrive seconds later (buffered/delayed),
  // racing with a cal command that already got COMMAND_ACK ACCEPTED. Now
  // that the COMMAND_ACK parser is fixed (command@0, result@2 regardless
  // of v1/v2), the ACK path is the reliable signal and the 15s safety-net
  // timeout catches genuinely unresponsive FCs. No need for "Initialising"
  // detection.

  // "Trim OK: ..." is what AP emits after a successful level/trim cal — but
  // for accel-level we already complete on COMMAND_ACK ACCEPTED above.
  // Kept here as a defensive fallback in case the ACK is missed.
  if (activeCalType === 'accel-level' && lower.includes('trim ok')) {
    deps.sendLog('info', `Level calibration completed: ${text}`);
    deps.sendComplete({
      type: 'accel-level',
      success: true,
    });
    cancelMavlinkCalibration();
    return;
  }

  // Gyro-specific completion
  if (activeCalType === 'gyro' && lower.includes('gyro offsets')) {
    deps.sendLog('info', `Gyro calibration completed: ${text}`);
    deps.sendComplete({
      type: 'gyro',
      success: true,
    });
    cancelMavlinkCalibration();
    return;
  }

  // Compass completion/progress from STATUSTEXT. This is the RELIABLE path:
  // the MAG_CAL_REPORT (192) message is not always delivered, but ArduPilot
  // always narrates the result. Strings below are what ArduCopter 4.6 actually
  // emits (verified on a MatekH743): the old "compass cal complete" /
  // "mag cal complete" matches never fired because AP emits no such text.
  if (activeCalType === 'compass') {
    // Failure: "Compass N calibration FAILED" is caught by the generic failure
    // matcher above; these two are compass-specific and are not.
    if (lower.includes('bad orientation') || lower.includes('bad radius')) {
      const reason = lower.includes('bad orientation')
        ? t('main:mavlinkCalibration.badOrientationMounting')
        : t('main:mavlinkCalibration.badRadiusInterference');
      deps.sendLog('error', `Compass calibration failed: ${text}`);
      deps.sendComplete({ type: 'compass', success: false, error: t('main:mavlinkCalibration.compassFailedReason', { reason }) });
      cancelMavlinkCalibration();
      return;
    }

    // Per-compass fit result, e.g. "Mag(1) good orientation: 4 1.0" or
    // "Mag(1) new orientation: 8 was 4 7.9". Capture compass number, detected
    // orientation, and fitness (the trailing float) so we can surface quality.
    const orientMatch = /mag\((\d+)\)\s+(?:new|good)\s+orientation:\s+(\d+)(?:\s+was\s+\d+)?\s+([\d.]+)/i.exec(text);
    if (orientMatch) {
      const compass = parseInt(orientMatch[1]!, 10);
      const orientation = parseInt(orientMatch[2]!, 10);
      const fitness = parseFloat(orientMatch[3]!);
      magCalResults.set(compass, { fitness, orientation });
      deps.sendLog('info', text);
      return;
    }

    // Success: AP writes the offsets and, on the next prearm cycle, reports
    // "Compass calibrated requires reboot". A reboot is mandatory for the new
    // offsets to take effect (until then the EKF reports yaw inconsistent).
    if (lower.includes('calibrated requires reboot') || lower.includes('compass cal successful')) {
      deps.sendLog('info', 'Compass calibration complete — reboot required for the new offsets to take effect');
      deps.sendComplete({ type: 'compass', success: true, rebootRequired: true, data: { compassResults: collectedCompassResults() } });
      cancelMavlinkCalibration();
      return;
    }

    // Live progress percentage, if the FC sends one.
    const compassMatch = /(\d+)%/.exec(text);
    if (compassMatch) {
      const pct = parseInt(compassMatch[1]!, 10);
      deps.sendProgress({
        type: 'compass',
        progress: Math.min(pct, 99),
        statusText: text,
      });
      return;
    }
  }

  // 6-point accel position messages
  if (activeCalType === 'accel-6point' && lower.includes('place vehicle')) {
    deps.sendLog('info', text);
  }

  // Forward all calibration-related STATUSTEXT as progress
  if (lower.includes('calibrat') || lower.includes('place vehicle') || lower.includes('accel') || lower.includes('gyro') || lower.includes('compass') || lower.includes('mag')) {
    deps.sendLog('info', text);
  }
}

// =============================================================================
// PX4 calibration: PREFLIGHT_CALIBRATION + "[cal] ..." STATUSTEXT protocol
// =============================================================================

/**
 * PX4's commander narrates every calibration through STATUSTEXT lines with a
 * "[cal] " prefix (calibration message protocol v2, unchanged since 2015 and
 * what QGC parses):
 *
 *   [cal] calibration started: 2 <sensor>
 *   [cal] pending: <side> <side> ...
 *   [cal] <side> orientation detected
 *   [cal] <side> side done, rotate to a different side
 *   [cal] progress <pct>
 *   [cal] calibration done: <sensor>
 *   [cal] calibration failed: <reason>   /  [cal] calibration cancelled
 *
 * Sides are named by which side of the vehicle faces down (down/up/left/
 * right/front/back). Orientation is detected automatically, there is no
 * GCS confirm step, so none of these status texts may start with
 * "Place vehicle" (that exact prefix is what shows the ArduPilot confirm
 * button in the UI).
 */
function handlePx4CalStatusText(text: string, lower: string): void {
  if (!deps || !activeCalType) return;

  const cal = /^\[cal\]\s*(.*)$/i.exec(text.trim());
  if (!cal) return; // non-[cal] chatter, nothing else is protocol on PX4
  const body = cal[1]!;
  const bodyLower = body.toLowerCase();

  if (bodyLower.startsWith('calibration started')) {
    deps.sendLog('info', `PX4 calibration started (${activeCalType})`);
    deps.sendProgress({
      type: activeCalType,
      progress: 0,
      statusText: activeCalType === 'compass'
        ? t('main:mavlinkCalibration.px4CompassStart')
        : activeCalType === 'accel-6point'
          ? t('main:mavlinkCalibration.px4AccelStart')
          : activeCalType === 'accel-level'
            ? t('main:mavlinkCalibration.px4LevelStart')
            : t('main:mavlinkCalibration.px4GyroStart'),
      ...(activeCalType === 'accel-6point' || activeCalType === 'compass'
        ? { positionStatus: [...positionStatus] }
        : {}),
    });
    return;
  }

  // "[cal] progress <pct>", the vehicle's own overall percentage. The only
  // number the progress bar is allowed to show.
  const prog = /^progress\s+<?(\d+)>?/.exec(bodyLower);
  if (prog) {
    const pct = Math.min(parseInt(prog[1]!, 10), 99);
    px4LastProgressPct = Math.max(px4LastProgressPct, pct);
    deps.sendProgress({
      type: activeCalType,
      progress: px4LastProgressPct,
      statusText: activeCalType === 'compass'
        ? t('main:mavlinkCalibration.px4CompassRotate')
        : t('main:mavlinkCalibration.holdStill'),
      ...(activeCalType === 'accel-6point' || activeCalType === 'compass'
        ? { positionStatus: [...positionStatus] }
        : {}),
    });
    return;
  }

  // "[cal] <side> orientation detected"
  const detected = /^(down|up|left|right|front|back)\s+orientation detected/.exec(bodyLower);
  if (detected) {
    const side = detected[1]!;
    const idx = PX4_SIDE_TO_INDEX[side]!;
    deps.sendLog('info', `PX4: ${PX4_SIDE_LABEL[side]} detected`);
    deps.sendProgress({
      type: activeCalType,
      progress: px4LastProgressPct,
      statusText: t('main:mavlinkCalibration.sideDetected', { side: px4SideLabel(side) }),
      currentPosition: idx as 0 | 1 | 2 | 3 | 4 | 5,
      positionStatus: [...positionStatus],
    });
    return;
  }

  // "[cal] <side> side done, rotate to a different side"
  const sideDone = /^(down|up|left|right|front|back)\s+side done/.exec(bodyLower);
  if (sideDone) {
    const side = sideDone[1]!;
    const idx = PX4_SIDE_TO_INDEX[side]!;
    px4SidesDone.add(idx);
    positionStatus[idx] = true;
    deps.sendLog('info', `PX4: ${PX4_SIDE_LABEL[side]} done (${px4SidesDone.size}/6)`);
    deps.sendProgress({
      type: activeCalType,
      progress: px4LastProgressPct,
      statusText: px4SidesDone.size >= 6
        ? t('main:mavlinkCalibration.allSidesCaptured')
        : t('main:mavlinkCalibration.sideDone', { side: px4SideLabel(side) }),
      currentPosition: idx as 0 | 1 | 2 | 3 | 4 | 5,
      positionStatus: [...positionStatus],
    });
    return;
  }

  if (bodyLower.startsWith('calibration done')) {
    deps.sendLog('info', `PX4 calibration complete: ${body}`);
    // PX4 writes CAL_* params immediately and applies them live, no reboot.
    deps.sendComplete({ type: activeCalType, success: true });
    cancelMavlinkCalibration();
    return;
  }

  if (bodyLower.startsWith('calibration failed') || bodyLower.startsWith('calibration cancelled')) {
    deps.sendLog('error', `PX4 calibration failed: ${body}`);
    deps.sendComplete({
      type: activeCalType,
      success: false,
      error: bodyLower.startsWith('calibration cancelled')
        ? t('main:mavlinkCalibration.cancelledByVehicle')
        : t('main:mavlinkCalibration.px4Failed', {
            reason: body.replace(/^calibration failed:?\s*/i, '') || t('main:mavlinkCalibration.vehicleRejectedData'),
            hint: activeCalType === 'compass'
              ? t('main:mavlinkCalibration.hintCompass')
              : t('main:mavlinkCalibration.hintAccel'),
          }),
    });
    cancelMavlinkCalibration();
    return;
  }

  // Everything else ("pending: ...", detection hints) is narration, log it.
  deps.sendLog('info', `PX4: ${body}`);
}

/**
 * Start a PX4 calibration. Every type is PREFLIGHT_CALIBRATION with the
 * appropriate param slot; the run is asynchronous and narrated via [cal]
 * STATUSTEXT regardless of type (including gyro/level, unlike ArduPilot,
 * the ACK arrives immediately and does NOT mean the work is done).
 */
async function startPx4Calibration(type: CalibrationTypeId): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInit') };

  const params = { param1: 0, param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0 };
  switch (type) {
    case 'gyro': params.param1 = 1; break;
    case 'compass': params.param2 = 1; break;
    case 'accel-6point': params.param5 = 1; break;
    case 'accel-level': params.param5 = 2; break;
    case 'accel-quick': params.param5 = 4; break;
    default:
      activeCalType = null;
      return { success: false, error: t('main:mavlinkCalibration.unsupportedPx4Type', { type }) };
  }

  px4SidesDone = new Set();
  px4LastProgressPct = 0;
  positionStatus = [false, false, false, false, false, false];

  deps.sendLog('info', `Starting PX4 ${type} calibration (PREFLIGHT_CALIBRATION ${JSON.stringify(params)})`);

  const sent = await deps.sendCommandLong(MAV_CMD_PREFLIGHT_CALIBRATION, params);
  if (!sent) {
    activeCalType = null;
    return { success: false, error: t('main:mavlinkCalibration.sendCalCommandFailed') };
  }

  deps.sendProgress({
    type,
    progress: 0,
    statusText: t('main:mavlinkCalibration.waitingVehicleStart'),
    ...(type === 'accel-6point' || type === 'compass' ? { positionStatus: [...positionStatus] } : {}),
  });

  // Whole-run watchdog: PX4 either narrates or it is dead/stuck. On expiry,
  // tell the vehicle to abandon the run, then fail loudly.
  const timeoutMs = PX4_CAL_TIMEOUT_MS[type] ?? 120_000;
  if (px4TimeoutId) clearTimeout(px4TimeoutId);
  px4TimeoutId = setTimeout(() => {
    px4TimeoutId = null;
    if (!deps || activeCalType !== type) return;
    deps.sendLog('error', `PX4 ${type} calibration timed out after ${timeoutMs / 1000}s`);
    abortVehicleCalibration();
    deps.sendComplete({
      type,
      success: false,
      error: t('main:mavlinkCalibration.stoppedResponding'),
    });
    cancelMavlinkCalibration();
  }, timeoutMs);

  return { success: true };
}

// =============================================================================
// MAG_CAL_PROGRESS / MAG_CAL_REPORT handlers — DO_START_MAG_CAL feedback
// =============================================================================

function popcount(mask: number): number {
  let m = mask & 0xff;
  let count = 0;
  while (m) {
    count += m & 1;
    m >>= 1;
  }
  return count;
}

/** MAG_CAL_PROGRESS (191): live completion percentage while rotating. */
function handleMagCalProgress(compassId: number, _calStatus: number, completionPct: number): void {
  if (!deps || activeCalType !== 'compass') return;
  // Cap below 100 until MAG_CAL_REPORT confirms the fit — the pct hits 100
  // before the FC has judged fitness.
  const pct = Math.max(0, Math.min(completionPct, 99));
  if (pct > (magCalPcts.get(compassId) ?? -1)) armCompassStallTimer();
  magCalPcts.set(compassId, pct);

  // Dense per-compass array for the UI (ids are contiguous from 0 in the mask
  // ArduPilot calibrates). Overall = the compass furthest behind.
  const maxId = Math.max(...magCalPcts.keys());
  const compassProgress: number[] = [];
  for (let id = 0; id <= maxId; id++) compassProgress.push(magCalPcts.get(id) ?? 0);
  const overall = Math.min(...compassProgress);

  deps.sendProgress({
    type: 'compass',
    progress: overall,
    statusText: t('main:mavlinkCalibration.rotateAllOrientations'),
    compassProgress,
  });
}

/** MAG_CAL_REPORT (192): per-compass result. One arrives for each compass. */
function handleMagCalReport(compassId: number, calMask: number, calStatus: number, fitness: number): void {
  if (!deps || activeCalType !== 'compass') return;

  const label = `Compass ${compassId + 1}`;

  if (calStatus === MAG_CAL_SUCCESS) {
    magCalSuccesses.add(compassId);
    const prev = magCalResults.get(compassId);
    magCalResults.set(compassId, { fitness, orientation: prev?.orientation ?? null });
    deps.sendLog('info', `${label} calibrated (fitness ${fitness.toFixed(1)} mGauss)`);
    finishMagCalIfDone(popcount(calMask));
    return;
  }

  if (calStatus === MAG_CAL_FAILED || calStatus === MAG_CAL_BAD_ORIENTATION || calStatus === MAG_CAL_BAD_RADIUS) {
    const reason =
      calStatus === MAG_CAL_BAD_ORIENTATION
        ? t('main:mavlinkCalibration.badOrientation')
        : calStatus === MAG_CAL_BAD_RADIUS
          ? t('main:mavlinkCalibration.badRadius')
          : t('main:mavlinkCalibration.fitNotConverged');
    magCalFailures.set(compassId, reason);
    deps.sendLog('error', `${label} calibration failed: ${reason}`);
    finishMagCalIfDone(popcount(calMask));
  }
}

/**
 * Complete once every compass in the batch has reported. Any compass that
 * converged has already been saved by the firmware, so a mixed result is a
 * success with a named casualty, not a failed run.
 */
function finishMagCalIfDone(expected: number): void {
  if (!deps) return;
  const reported = magCalSuccesses.size + magCalFailures.size;
  if (expected <= 0 || reported < expected) return;

  const failed = [...magCalFailures.entries()]
    .map(([id, reason]) => t('main:mavlinkCalibration.compassFailure', { n: id + 1, reason }))
    .join(', ');

  if (magCalSuccesses.size === 0) {
    deps.sendComplete({
      type: 'compass',
      success: false,
      error: t('main:mavlinkCalibration.noCompassCalibrated', { failed }),
    });
  } else {
    deps.sendComplete({
      type: 'compass',
      success: true,
      rebootRequired: true,
      error: failed
        ? t('main:mavlinkCalibration.partialSuccess', { done: magCalSuccesses.size, expected, failed })
        : undefined,
      data: { compassResults: collectedCompassResults() },
    });
  }
  cancelMavlinkCalibration();
}

// =============================================================================
// COMMAND_ACK handler — called from ipc-handlers
// =============================================================================

function handleCalibrationCommandAck(command: number, result: number): void {
  if (!deps) return;

  // FIXED_MAG_CAL_YAW runs independently of the activeCalType state machine,
  // so handle it before the activeCalType guard.
  if (command === MAV_CMD_FIXED_MAG_CAL_YAW && pendingFixedMagCalYawResolver) {
    const resolver = pendingFixedMagCalYawResolver;
    pendingFixedMagCalYawResolver = null;
    if (pendingFixedMagCalYawTimeoutId) {
      clearTimeout(pendingFixedMagCalYawTimeoutId);
      pendingFixedMagCalYawTimeoutId = null;
    }
    if (result === 0) {
      deps.sendLog('info', 'Large Vehicle MagCal accepted — compass offsets written. Reboot recommended.');
      resolver({ success: true });
    } else {
      const names = ['ACCEPTED', 'TEMPORARILY_REJECTED', 'DENIED', 'UNSUPPORTED', 'FAILED', 'IN_PROGRESS'];
      const name = names[result] ?? `UNKNOWN(${result})`;
      const userError = result === 4
        ? t('main:mavlinkCalibration.magCalGpsFailed')
        : t('main:mavlinkCalibration.rejectedCommand', { name });
      deps.sendLog('error', `Large Vehicle MagCal rejected: ${name}`);
      resolver({ success: false, error: userError });
    }
    return;
  }

  if (!activeCalType) return;

  if (command === MAV_CMD_PREFLIGHT_CALIBRATION && activeFirmware === 'px4') {
    // PX4 acknowledges IMMEDIATELY and runs the calibration asynchronously -
    // for every type, including gyro and level. ACCEPTED means "started",
    // never "done"; completion only ever arrives via "[cal] calibration done".
    if (result === 0 || result === 5) {
      deps.sendLog('info', 'PX4 accepted the calibration command');
    } else {
      const names = ['ACCEPTED', 'TEMPORARILY_REJECTED', 'DENIED', 'UNSUPPORTED', 'FAILED', 'IN_PROGRESS'];
      const name = names[result] ?? `UNKNOWN(${result})`;
      deps.sendLog('error', `PX4 rejected the calibration: ${name}`);
      deps.sendComplete({
        type: activeCalType,
        success: false,
        error: result === 2
          ? t('main:mavlinkCalibration.vehicleRefused')
          : t('main:mavlinkCalibration.vehicleRejected', { name }),
      });
      cancelMavlinkCalibration();
    }
    return;
  }

  if (command === MAV_CMD_PREFLIGHT_CALIBRATION) {
    if (result === 0) {
      // ACCEPTED
      // For synchronous one-shot calibrations (accel-level/gyro), ArduPilot
      // performs the work BEFORE returning the ACK. So ACCEPTED == done.
      // (calibrate_trim() and calibrate_gyros() in AP_InertialSensor return
      //  MAV_RESULT_ACCEPTED only after the calibration completes; they emit
      //  no STATUSTEXT. Mission Planner's doCommand() relies on this same
      //  semantic — see ConfigAccelerometerCalibration.cs BUT_level_Click.)
      if (activeCalType === 'accel-level' || activeCalType === 'accel-quick' || activeCalType === 'gyro') {
        deps.sendLog('info', `${activeCalType} calibration accepted by FC — completion confirmed`);
        deps.sendComplete({
          type: activeCalType,
          success: true,
        });
        cancelMavlinkCalibration();
        return;
      }
      // For 6-point and compass, ACCEPTED only means "calibration started"
      deps.sendLog('info', 'Calibration command accepted by flight controller'); // i18n-exempt
    } else if (result === 5) {
      // IN_PROGRESS — already calibrating
      deps.sendLog('info', 'Calibration in progress'); // i18n-exempt
    } else {
      // REJECTED/DENIED/UNSUPPORTED/FAILED
      const names = ['ACCEPTED', 'TEMPORARILY_REJECTED', 'DENIED', 'UNSUPPORTED', 'FAILED', 'IN_PROGRESS'];
      const name = names[result] ?? `UNKNOWN(${result})`;
      deps.sendLog('error', `Calibration command rejected: ${name}`);

      // Provide human-readable errors for known rejection codes.
      // TEMPORARILY_REJECTED (1) for level/gyro means a prerequisite isn't
      // met — AP checks ins.calibrated() before accepting trim cal, which
      // requires a prior 6-point accel calibration.
      let userError: string;
      if (result === 1 && (activeCalType === 'accel-quick' || activeCalType === 'accel-level')) {
        // AP (4.5+) refuses accel and trim cal within 5 s of boot or of the last accel cal, or while one runs.
        userError = t('main:mavlinkCalibration.stillBusy');
      } else if (result === 1) {
        userError = t('main:mavlinkCalibration.notReady');
      } else {
        userError = t('main:mavlinkCalibration.rejectedCalibration', { name });
      }
      deps.sendComplete({
        type: activeCalType,
        success: false,
        error: userError,
      });
      cancelMavlinkCalibration();
    }
  }

  if (command === MAV_CMD_DO_START_MAG_CAL && activeCalType === 'compass') {
    if (result === 0 || result === 5) {
      // ACCEPTED / IN_PROGRESS — calibration has started. Completion is driven
      // by MAG_CAL_REPORT, not this ACK, so just log.
      deps.sendLog('info', 'Compass calibration started — rotate the vehicle through all orientations');
    } else {
      const names = ['ACCEPTED', 'TEMPORARILY_REJECTED', 'DENIED', 'UNSUPPORTED', 'FAILED', 'IN_PROGRESS'];
      const name = names[result] ?? `UNKNOWN(${result})`;
      deps.sendLog('error', `Compass calibration rejected: ${name}`);
      deps.sendComplete({
        type: 'compass',
        success: false,
        error: result === 1
          ? t('main:mavlinkCalibration.fcBusy')
          : result === 4
            // start_calibration_all() returns false when every compass was
            // skipped, and it skips any that is unhealthy or switched off.
            ? t('main:mavlinkCalibration.compassRefusedStart')
            : t('main:mavlinkCalibration.rejectedCompass', { name }),
      });
      cancelMavlinkCalibration();
    }
  }

  if (command === MAV_CMD_ACCELCAL_VEHICLE_POS && activeCalType === 'accel-6point') {
    if (result !== 0) {
      deps.sendLog('error', `Position confirmation rejected (result=${result})`);
    }
  }
}

// =============================================================================
// Incoming COMMAND_LONG handler — ArduPilot sends ACCELCAL_VEHICLE_POS to GCS
// =============================================================================

function handleIncomingCommandLong(command: number, param1: number): void {
  if (!deps || activeCalType !== 'accel-6point') return;
  // ACCELCAL_VEHICLE_POS is ArduPilot's pose-request protocol. PX4 never
  // sends it; during a PX4 run such a frame is stray traffic, not protocol.
  if (activeFirmware === 'px4') return;

  if (command === MAV_CMD_ACCELCAL_VEHICLE_POS) {
    // Always log incoming position requests so we can diagnose stuck calibrations.
    deps.sendLog('info', `FC sent ACCELCAL_VEHICLE_POS param1=${param1}`);

    if (param1 === ACCELCAL_POS.SUCCESS) {
      // All positions done successfully — AP sends this once per second
      // after AP_AccelCal::success() is called.
      deps.sendLog('info', 'All calibration positions captured successfully'); // i18n-exempt
      deps.sendComplete({
        type: 'accel-6point',
        success: true,
      });
      cancelMavlinkCalibration();
      return;
    }

    if (param1 === ACCELCAL_POS.FAILED) {
      deps.sendLog('error', 'Accelerometer calibration failed'); // i18n-exempt
      deps.sendComplete({
        type: 'accel-6point',
        success: false,
        error: t('main:mavlinkCalibration.accelFailed'),
      });
      cancelMavlinkCalibration();
      return;
    }

    // FC is requesting a position
    expectedPosition = param1;
    const posIndex = ARDU_POS_TO_INDEX[param1];
    if (posIndex === undefined) {
      deps.sendLog('warn', `Unknown position enum: ${param1}`);
      return;
    }

    deps.sendLog('info', `Place vehicle ${POSITION_NAMES[posIndex]} (position ${posIndex + 1}/6)`);
    deps.sendProgress({
      type: 'accel-6point',
      progress: (positionStatus.filter(Boolean).length / 6) * 100,
      statusText: `Place vehicle ${POSITION_NAMES[posIndex]}`, // i18n-exempt
      currentPosition: posIndex as 0 | 1 | 2 | 3 | 4 | 5,
      positionStatus: [...positionStatus],
    });
  }
}

// =============================================================================
// Calibration starters
// =============================================================================

async function startAccelLevel(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInit') };

  deps.sendLog('info', 'Starting MAVLink level calibration (MAV_CMD_PREFLIGHT_CALIBRATION param5=2)');
  deps.sendProgress({
    type: 'accel-level',
    progress: 0,
    statusText: t('main:mavlinkCalibration.sendingLevel'),
  });

  // param5=2 = simple level calibration (AHRS trim)
  const sent = await deps.sendCommandLong(MAV_CMD_PREFLIGHT_CALIBRATION, {
    param1: 0, // no gyro
    param2: 0, // no compass
    param3: 0, // no ground pressure
    param4: 0, // no radio
    param5: 2, // accel level (simple)
    param6: 0, // no compass motor
    param7: 0, // no airspeed
  });

  if (!sent) {
    activeCalType = null;
    return { success: false, error: t('main:mavlinkCalibration.sendCalCommandFailed') };
  }

  deps.sendProgress({
    type: 'accel-level',
    progress: 0,
    statusText: t('main:mavlinkCalibration.calibratingLevel'),
  });
  armOneShotTimeout('accel-level');

  return { success: true };
}

/**
 * One-position accelerometer calibration (param5=4). ArduPilot averages the
 * accelerometers with the vehicle level and still, then saves INS_ACCOFFS_*
 * and the existing scales, which is exactly what `accel_calibrated_ok_all()`
 * wants. It clears "3D Accel calibration needed" without turning a rover, a
 * boat or a large aircraft onto each of its faces.
 */
async function startAccelQuick(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInit') };

  deps.sendLog('info', 'Starting MAVLink quick accel calibration (MAV_CMD_PREFLIGHT_CALIBRATION param5=4)');
  deps.sendProgress({
    type: 'accel-quick',
    progress: 0,
    statusText: t('main:mavlinkCalibration.sendingQuick'),
  });

  const sent = await deps.sendCommandLong(MAV_CMD_PREFLIGHT_CALIBRATION, {
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    param5: 4, // simple (single position) accel calibration
    param6: 0,
    param7: 0,
  });

  if (!sent) {
    activeCalType = null;
    return { success: false, error: t('main:mavlinkCalibration.sendCalCommandFailed') };
  }

  deps.sendProgress({
    type: 'accel-quick',
    progress: 0,
    statusText: t('main:mavlinkCalibration.calibratingQuick'),
  });
  armOneShotTimeout('accel-quick');

  return { success: true };
}

async function startAccel6Point(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInit') };

  positionStatus = [false, false, false, false, false, false];
  expectedPosition = -1;

  deps.sendLog('info', 'Starting MAVLink 6-point accel calibration (MAV_CMD_PREFLIGHT_CALIBRATION param5=1)');

  // param5=1 = full 6-point accelerometer calibration
  const sent = await deps.sendCommandLong(MAV_CMD_PREFLIGHT_CALIBRATION, {
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    param5: 1, // accel 6-point
    param6: 0,
    param7: 0,
  });

  if (!sent) {
    activeCalType = null;
    return { success: false, error: t('main:mavlinkCalibration.sendCalCommandFailed') };
  }

  // ArduPilot will send COMMAND_LONG with ACCELCAL_VEHICLE_POS to request first position
  deps.sendProgress({
    type: 'accel-6point',
    progress: 0,
    statusText: t('main:mavlinkCalibration.waitingFc'),
    currentPosition: 0,
    positionStatus: [false, false, false, false, false, false],
  });

  return { success: true };
}

async function startGyro(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInit') };

  deps.sendLog('info', 'Starting MAVLink gyro calibration (MAV_CMD_PREFLIGHT_CALIBRATION param1=1)');
  deps.sendProgress({
    type: 'gyro',
    progress: 0,
    statusText: t('main:mavlinkCalibration.sendingGyro'),
  });

  // param1=1 = gyro calibration
  const sent = await deps.sendCommandLong(MAV_CMD_PREFLIGHT_CALIBRATION, {
    param1: 1, // gyro
    param2: 0,
    param3: 0,
    param4: 0,
    param5: 0,
    param6: 0,
    param7: 0,
  });

  if (!sent) {
    activeCalType = null;
    return { success: false, error: t('main:mavlinkCalibration.sendCalCommandFailed') };
  }

  deps.sendProgress({
    type: 'gyro',
    progress: 0,
    statusText: t('main:mavlinkCalibration.calibratingGyro'),
  });
  armOneShotTimeout('gyro');

  return { success: true };
}

async function startCompass(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: t('main:mavlinkCalibration.notInit') };

  deps.sendLog('info', 'Starting compass calibration (MAV_CMD_DO_START_MAG_CAL, all compasses)'); // i18n-exempt

  magCalSuccesses.clear();
  magCalFailures.clear();

  // Before the start command, so no progress is missed.
  if (activeFirmware === 'ardupilot') await requestMagCalStreams(200_000);

  const sent = await deps.sendCommandLong(MAV_CMD_DO_START_MAG_CAL, {
    param1: 0, // mag_mask: 0 = calibrate all enabled compasses
    param2: 0, // no retry: the firmware's retry has no attempt limit and hides the failure reason
    param3: 1, // autosave offsets when the fit succeeds
    param4: 0, // delay before start (s)
    param5: 0, // autoreboot
    param6: 0,
    param7: 0,
  });

  if (!sent) {
    activeCalType = null;
    return { success: false, error: t('main:mavlinkCalibration.sendCalCommandFailed') };
  }

  // Convergence timeout: if no MAG_CAL_REPORT / "calibrated" STATUSTEXT arrives
  // in time, the fit isn't converging (unhealthy compass, interference, or too
  // little rotation). Fail with a clear message instead of hanging at 95%.
  armCompassStallTimer();

  // The ONLY progress source from here on is the vehicle itself
  // (MAG_CAL_PROGRESS / STATUSTEXT percentages). No synthetic time-based
  // progress, no fake countdown: a bar that moves on its own while the fit
  // is stalled tells the pilot a lie precisely when the truth matters most.
  deps.sendProgress({
    type: 'compass',
    progress: 0,
    statusText: t('main:mavlinkCalibration.rotateSlowly'),
  });

  return { success: true };
}

/** intervalUs < 0 restores the vehicle's own default for that message. */
async function requestMagCalStreams(intervalUs: number): Promise<void> {
  if (!deps) return;
  for (const msgid of [MSG_ID_MAG_CAL_PROGRESS, MSG_ID_MAG_CAL_REPORT]) {
    await deps.sendCommandLong(MAV_CMD_SET_MESSAGE_INTERVAL, {
      param1: msgid,
      param2: intervalUs,
      param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
    });
  }
}

function armCompassStallTimer(): void {
  if (compassCalTimeoutId) clearTimeout(compassCalTimeoutId);
  compassCalTimeoutId = setTimeout(() => {
    compassCalTimeoutId = null;
    if (!deps || activeCalType !== 'compass') return;
    deps.sendLog('error', 'Compass calibration did not converge within the time limit'); // i18n-exempt
    deps.sendComplete({
      type: 'compass',
      success: false,
      error: t('main:mavlinkCalibration.compassNotConverging'),
    });
    cancelMavlinkCalibration();
  }, COMPASS_CAL_STALL_MS);
}


return {
  initMavlinkCalibration,
  cleanupMavlinkCalibration,
  isMavlinkCalibrationActive,
  sendFixedMagCalYaw,
  startCompassMot,
  stopCompassMot,
  startMavlinkCalibration,
  confirmMavlinkPosition,
  cancelMavlinkCalibration,
  abortVehicleCalibration,
  handleCalibrationStatusText,
  handleMagCalProgress,
  handleMagCalReport,
  handleCalibrationCommandAck,
  handleIncomingCommandLong,
};
}

export type MavlinkCalibration = ReturnType<typeof createMavlinkCalibration>;

const shared = createMavlinkCalibration();
export const initMavlinkCalibration = shared.initMavlinkCalibration;
export const cleanupMavlinkCalibration = shared.cleanupMavlinkCalibration;
export const isMavlinkCalibrationActive = shared.isMavlinkCalibrationActive;
export const sendFixedMagCalYaw = shared.sendFixedMagCalYaw;
export const startCompassMot = shared.startCompassMot;
export const stopCompassMot = shared.stopCompassMot;
export const startMavlinkCalibration = shared.startMavlinkCalibration;
export const confirmMavlinkPosition = shared.confirmMavlinkPosition;
export const cancelMavlinkCalibration = shared.cancelMavlinkCalibration;
export const abortVehicleCalibration = shared.abortVehicleCalibration;
export const handleCalibrationStatusText = shared.handleCalibrationStatusText;
export const handleMagCalProgress = shared.handleMagCalProgress;
export const handleMagCalReport = shared.handleMagCalReport;
export const handleCalibrationCommandAck = shared.handleCalibrationCommandAck;
export const handleIncomingCommandLong = shared.handleIncomingCommandLong;
