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
  CalibrationProgressEvent,
  CalibrationCompleteEvent,
} from '../../shared/calibration-types.js';

// =============================================================================
// MAVLink Constants
// =============================================================================

const MAV_CMD_PREFLIGHT_CALIBRATION = 241;
const MAV_CMD_ACCELCAL_VEHICLE_POS = 42424;

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

// Map ArduPilot position enum to our 0-5 index
// ArduPilot order: Level(1), Left(2), Right(3), NoseDown(4), NoseUp(5), Back/Inverted(6)
// Our order:       Level(0), Inverted(1), LeftSide(2), RightSide(3), NoseDown(4), NoseUp(5)
const ARDU_POS_TO_INDEX: Record<number, number> = {
  [ACCELCAL_POS.LEVEL]: 0,
  [ACCELCAL_POS.BACK]: 1,
  [ACCELCAL_POS.LEFT]: 2,
  [ACCELCAL_POS.RIGHT]: 3,
  [ACCELCAL_POS.NOSEDOWN]: 4,
  [ACCELCAL_POS.NOSEUP]: 5,
};

// Reverse: our index to ArduPilot position enum
const INDEX_TO_ARDU_POS: Record<number, number> = {
  0: ACCELCAL_POS.LEVEL,
  1: ACCELCAL_POS.BACK,
  2: ACCELCAL_POS.LEFT,
  3: ACCELCAL_POS.RIGHT,
  4: ACCELCAL_POS.NOSEDOWN,
  5: ACCELCAL_POS.NOSEUP,
};

const POSITION_NAMES = [
  'Level (Top Up)',
  'Inverted (Top Down)',
  'Left Side Down',
  'Right Side Down',
  'Nose Down',
  'Nose Up',
];

// =============================================================================
// Types
// =============================================================================

export interface MavlinkCalibrationDeps {
  /** Send a MAVLink COMMAND_LONG to the FC. Returns true if packet was sent. */
  sendCommandLong: (command: number, params: {
    param1: number; param2: number; param3: number; param4: number;
    param5: number; param6: number; param7: number;
  }) => Promise<boolean>;
  sendLog: (level: 'info' | 'warn' | 'error', message: string, details?: string) => void;
  sendProgress: (event: CalibrationProgressEvent) => void;
  sendComplete: (event: CalibrationCompleteEvent) => void;
}

// =============================================================================
// State
// =============================================================================

let deps: MavlinkCalibrationDeps | null = null;
let activeCalType: CalibrationTypeId | null = null;
let compassTimerId: ReturnType<typeof setInterval> | null = null;
let compassStartTime = 0;

// 6-point state
let expectedPosition = -1; // ArduPilot position enum value from FC
let positionStatus = [false, false, false, false, false, false];
// Safety-net timer fired after the user confirms the last position
// (in case AP's "Calibration successful" STATUSTEXT is dropped or never sent)
let sixPointFallbackTimerId: ReturnType<typeof setTimeout> | null = null;

// =============================================================================
// Init
// =============================================================================

export function initMavlinkCalibration(context: MavlinkCalibrationDeps): void {
  deps = context;
}

export function cleanupMavlinkCalibration(): void {
  cancelMavlinkCalibration();
  deps = null;
}

// =============================================================================
// Public API
// =============================================================================

export function isMavlinkCalibrationActive(): boolean {
  return activeCalType !== null;
}

export async function startMavlinkCalibration(type: CalibrationTypeId): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: 'MAVLink calibration not initialized' };
  if (activeCalType) return { success: false, error: 'Another calibration is already in progress' };

  activeCalType = type;

  switch (type) {
    case 'accel-level':
      return startAccelLevel();
    case 'accel-6point':
      return startAccel6Point();
    case 'gyro':
      return startGyro();
    case 'compass':
      return startCompass();
    default:
      activeCalType = null;
      return { success: false, error: `Unsupported MAVLink calibration type: ${type}` };
  }
}

export async function confirmMavlinkPosition(position: number): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: 'MAVLink calibration not initialized' };
  if (activeCalType !== 'accel-6point') return { success: false, error: '6-point calibration not in progress' };

  // Convert our position index to ArduPilot enum
  const arduPos = INDEX_TO_ARDU_POS[position];
  if (arduPos === undefined) return { success: false, error: `Invalid position index: ${position}` };

  deps.sendLog('info', `Confirming position ${position} (${POSITION_NAMES[position]}) — sending ACCELCAL_VEHICLE_POS`);

  const sent = await deps.sendCommandLong(MAV_CMD_ACCELCAL_VEHICLE_POS, {
    param1: arduPos,
    param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
  });

  if (!sent) {
    deps.sendLog('error', `Position ${position}: failed to send ACCELCAL_VEHICLE_POS`);
    return { success: false, error: 'Failed to send position confirmation — ensure FC is connected' };
  }

  // Mark this position as captured locally
  positionStatus[position] = true;

  // After the LAST position is confirmed, arm a fallback timer in case the
  // FC's "Calibration successful" STATUSTEXT is dropped or never sent.
  // AP processes the 6 samples synchronously and saves to params; this
  // typically takes <2s. We give it 8s of grace before assuming success.
  if (position === 5) {
    if (sixPointFallbackTimerId) clearTimeout(sixPointFallbackTimerId);
    sixPointFallbackTimerId = setTimeout(() => {
      sixPointFallbackTimerId = null;
      if (!deps || activeCalType !== 'accel-6point') return;
      deps.sendLog('warn', 'No completion message from FC after 8s — assuming calibration succeeded (fallback)');
      deps.sendComplete({
        type: 'accel-6point',
        success: true,
      });
      cancelMavlinkCalibration();
    }, 8000);
  }

  return { success: true };
}

export function cancelMavlinkCalibration(): void {
  if (compassTimerId) {
    clearInterval(compassTimerId);
    compassTimerId = null;
  }
  if (sixPointFallbackTimerId) {
    clearTimeout(sixPointFallbackTimerId);
    sixPointFallbackTimerId = null;
  }
  activeCalType = null;
  expectedPosition = -1;
  positionStatus = [false, false, false, false, false, false];
}

// =============================================================================
// STATUSTEXT handler — called from ipc-handlers when STATUSTEXT is received
// =============================================================================

export function handleCalibrationStatusText(text: string, severity: number): void {
  if (!deps || !activeCalType) return;

  const lower = text.toLowerCase();

  // Completion detection — match the exact strings ArduPilot emits.
  // AP_AccelCal sends "Calibration successful" / "Calibration FAILED" /
  // "Calibration cancelled" via _printf (MAV_SEVERITY_CRITICAL).
  if (lower.includes('calibration successful') || lower.includes('calibration done') || lower.includes('calibration complete')) {
    deps.sendLog('info', `Calibration completed successfully`);
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

  // Compass progress from STATUSTEXT
  if (activeCalType === 'compass') {
    // ArduPilot sends "Compass N calibration X% complete" style messages
    const compassMatch = /(\d+)%/.exec(text);
    if (compassMatch) {
      const pct = parseInt(compassMatch[1]!, 10);
      deps.sendProgress({
        type: 'compass',
        progress: pct,
        statusText: text,
      });
      return;
    }

    if (lower.includes('compass cal complete') || lower.includes('mag cal complete')) {
      deps.sendLog('info', `Compass calibration completed`);
      deps.sendComplete({
        type: 'compass',
        success: true,
      });
      cancelMavlinkCalibration();
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
// COMMAND_ACK handler — called from ipc-handlers
// =============================================================================

export function handleCalibrationCommandAck(command: number, result: number): void {
  if (!deps || !activeCalType) return;

  if (command === MAV_CMD_PREFLIGHT_CALIBRATION) {
    if (result === 0) {
      // ACCEPTED
      // For synchronous one-shot calibrations (accel-level/gyro), ArduPilot
      // performs the work BEFORE returning the ACK. So ACCEPTED == done.
      // (calibrate_trim() and calibrate_gyros() in AP_InertialSensor return
      //  MAV_RESULT_ACCEPTED only after the calibration completes; they emit
      //  no STATUSTEXT. Mission Planner's doCommand() relies on this same
      //  semantic — see ConfigAccelerometerCalibration.cs BUT_level_Click.)
      if (activeCalType === 'accel-level' || activeCalType === 'gyro') {
        deps.sendLog('info', `${activeCalType} calibration accepted by FC — completion confirmed`);
        deps.sendComplete({
          type: activeCalType,
          success: true,
        });
        cancelMavlinkCalibration();
        return;
      }
      // For 6-point and compass, ACCEPTED only means "calibration started"
      deps.sendLog('info', 'Calibration command accepted by flight controller');
    } else if (result === 5) {
      // IN_PROGRESS — already calibrating
      deps.sendLog('info', 'Calibration in progress');
    } else {
      // REJECTED/DENIED/UNSUPPORTED/FAILED
      const names = ['ACCEPTED', 'TEMPORARILY_REJECTED', 'DENIED', 'UNSUPPORTED', 'FAILED', 'IN_PROGRESS'];
      const name = names[result] ?? `UNKNOWN(${result})`;
      deps.sendLog('error', `Calibration command rejected: ${name}`);
      deps.sendComplete({
        type: activeCalType,
        success: false,
        error: `Flight controller rejected calibration: ${name}`,
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

export function handleIncomingCommandLong(command: number, param1: number): void {
  if (!deps || activeCalType !== 'accel-6point') return;

  if (command === MAV_CMD_ACCELCAL_VEHICLE_POS) {
    // Always log incoming position requests so we can diagnose stuck calibrations.
    deps.sendLog('info', `FC sent ACCELCAL_VEHICLE_POS param1=${param1}`);

    if (param1 === ACCELCAL_POS.SUCCESS) {
      // All positions done successfully — AP sends this once per second
      // after AP_AccelCal::success() is called.
      deps.sendLog('info', 'All calibration positions captured successfully');
      deps.sendComplete({
        type: 'accel-6point',
        success: true,
      });
      cancelMavlinkCalibration();
      return;
    }

    if (param1 === ACCELCAL_POS.FAILED) {
      deps.sendLog('error', 'Accelerometer calibration failed');
      deps.sendComplete({
        type: 'accel-6point',
        success: false,
        error: 'Accelerometer calibration failed',
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
      statusText: `Place vehicle ${POSITION_NAMES[posIndex]}`,
      currentPosition: posIndex as 0 | 1 | 2 | 3 | 4 | 5,
      positionStatus: [...positionStatus],
    });
  }
}

// =============================================================================
// Calibration starters
// =============================================================================

async function startAccelLevel(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: 'Not initialized' };

  deps.sendLog('info', 'Starting MAVLink level calibration (MAV_CMD_PREFLIGHT_CALIBRATION param5=2)');
  deps.sendProgress({
    type: 'accel-level',
    progress: 10,
    statusText: 'Sending level calibration command...',
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
    return { success: false, error: 'Failed to send calibration command — ensure FC is connected' };
  }

  deps.sendProgress({
    type: 'accel-level',
    progress: 30,
    statusText: 'Calibrating... keep vehicle level and still',
  });

  return { success: true };
}

async function startAccel6Point(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: 'Not initialized' };

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
    return { success: false, error: 'Failed to send calibration command — ensure FC is connected' };
  }

  // ArduPilot will send COMMAND_LONG with ACCELCAL_VEHICLE_POS to request first position
  deps.sendProgress({
    type: 'accel-6point',
    progress: 0,
    statusText: 'Waiting for flight controller...',
    currentPosition: 0,
    positionStatus: [false, false, false, false, false, false],
  });

  return { success: true };
}

async function startGyro(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: 'Not initialized' };

  deps.sendLog('info', 'Starting MAVLink gyro calibration (MAV_CMD_PREFLIGHT_CALIBRATION param1=1)');
  deps.sendProgress({
    type: 'gyro',
    progress: 10,
    statusText: 'Sending gyro calibration command...',
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
    return { success: false, error: 'Failed to send calibration command — ensure FC is connected' };
  }

  deps.sendProgress({
    type: 'gyro',
    progress: 30,
    statusText: 'Calibrating gyroscope... keep vehicle still',
  });

  return { success: true };
}

async function startCompass(): Promise<{ success: boolean; error?: string }> {
  if (!deps) return { success: false, error: 'Not initialized' };

  deps.sendLog('info', 'Starting MAVLink compass calibration (MAV_CMD_PREFLIGHT_CALIBRATION param2=1)');

  // param2=1 = compass calibration
  const sent = await deps.sendCommandLong(MAV_CMD_PREFLIGHT_CALIBRATION, {
    param1: 0,
    param2: 1, // compass
    param3: 0,
    param4: 0,
    param5: 0,
    param6: 0,
    param7: 0,
  });

  if (!sent) {
    activeCalType = null;
    return { success: false, error: 'Failed to send calibration command — ensure FC is connected' };
  }

  compassStartTime = Date.now();

  // Compass calibration can take 30-60s with user rotating vehicle
  deps.sendProgress({
    type: 'compass',
    progress: 0,
    statusText: 'Rotate vehicle slowly in all directions...',
    countdown: 60,
  });

  // Countdown timer for compass
  let elapsed = 0;
  compassTimerId = setInterval(() => {
    if (!deps || activeCalType !== 'compass') {
      if (compassTimerId) clearInterval(compassTimerId);
      compassTimerId = null;
      return;
    }
    elapsed++;
    deps.sendProgress({
      type: 'compass',
      progress: Math.min(elapsed / 60 * 100, 95), // Cap at 95% until actual completion
      statusText: 'Rotate vehicle slowly in all directions...',
      countdown: Math.max(60 - elapsed, 0),
    });
  }, 1000);

  return { success: true };
}
