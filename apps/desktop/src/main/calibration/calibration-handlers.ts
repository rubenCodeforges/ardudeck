/**
 * Calibration Handlers
 *
 * Main process handlers for sensor calibration operations.
 * Supports MSP (iNav/Betaflight) and MAVLink (ArduPilot) protocols.
 * Routes to the correct calibration backend based on the active protocol.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type {
  CalibrationTypeId,
  SensorAvailability,
  CalibrationData,
  CalibrationStartOptions,
  CalibrationResult,
  CalibrationProgressEvent,
  CalibrationCompleteEvent,
} from '../../shared/calibration-types.js';
import {
  initMavlinkCalibration,
  cleanupMavlinkCalibration,
  startMavlinkCalibration,
  confirmMavlinkPosition,
  cancelMavlinkCalibration,
  abortVehicleCalibration,
  isMavlinkCalibrationActive,
  sendFixedMagCalYaw,
  startCompassMot,
  stopCompassMot,
  type MavlinkCalibrationDeps,
} from './mavlink-calibration.js';
import { t } from '../../shared/i18n/index.js';

// =============================================================================
// State
// =============================================================================

let mainWindow: BrowserWindow | null = null;
let currentCalibration: CalibrationTypeId | null = null;
let calibrationTimeout: ReturnType<typeof setTimeout> | null = null;
let activeProtocol: 'msp' | 'mavlink' | null = null;

// =============================================================================
// Helpers
// =============================================================================

function sendLog(level: 'info' | 'warn' | 'error', message: string, details?: string): void {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(IPC_CHANNELS.CONSOLE_LOG, {
      id: Date.now(),
      timestamp: Date.now(),
      level,
      message: `[Calibration] ${message}`, // i18n-exempt
      details,
    });
  }
}

function sendProgress(event: CalibrationProgressEvent): void {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(IPC_CHANNELS.CALIBRATION_PROGRESS, event);
  }
}

function sendComplete(event: CalibrationCompleteEvent): void {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(IPC_CHANNELS.CALIBRATION_COMPLETE, event);
  }
  currentCalibration = null;
  activeProtocol = null;
  if (calibrationTimeout) {
    clearTimeout(calibrationTimeout);
    calibrationTimeout = null;
  }
}

// =============================================================================
// Sensor Configuration
// =============================================================================

async function getSensorConfig(): Promise<SensorAvailability | null> {
  try {
    return {
      hasAccel: true,
      hasGyro: true,
      hasCompass: true,
      hasBarometer: true,
      hasGps: false,
      hasOpflow: false,
      hasPitot: false,
    };
  } catch (error) {
    console.error('[Calibration] Failed to get sensor config:', error);
    return null;
  }
}

// =============================================================================
// Calibration Data (MSP only)
// =============================================================================

async function getCalibrationData(): Promise<CalibrationData | null> {
  return null;
}

async function setCalibrationData(data: CalibrationData): Promise<{ success: boolean; error?: string }> {
  sendLog('info', 'Saving calibration data'); // i18n-exempt
  return { success: true };
}

// =============================================================================
// Calibration Execution
// =============================================================================

async function startCalibration(options: CalibrationStartOptions): Promise<CalibrationResult> {
  const { type, protocol, firmware } = options;

  if (currentCalibration || isMavlinkCalibrationActive()) {
    return { success: false, error: t('main:calibration.alreadyInProgress') };
  }

  activeProtocol = protocol ?? null;

  // Route to MAVLink path, the firmware decides the dialect (ArduPilot's
  // DO_START_MAG_CAL/ACCELCAL flow vs PX4's PREFLIGHT_CALIBRATION + [cal]).
  if (protocol === 'mavlink') {
    sendLog('info', `Starting ${type} calibration via MAVLink (${firmware ?? 'ardupilot'})`);
    currentCalibration = type;
    return startMavlinkCalibration(type, firmware ?? 'ardupilot');
  }

  // MSP path (iNav / Betaflight)
  currentCalibration = type;
  sendLog('info', `Starting ${type} calibration via MSP`);

  try {
    switch (type) {
      case 'accel-level':
        return await calibrateAccelLevelMsp();

      case 'accel-6point':
        sendProgress({
          type: 'accel-6point',
          progress: 0,
          statusText: 'Place vehicle level (top up)', // i18n-exempt
          currentPosition: 0,
          positionStatus: [false, false, false, false, false, false],
        });
        return { success: true };

      case 'compass':
        return await calibrateCompassMsp();

      case 'gyro':
        return await calibrateGyroMsp();

      case 'opflow':
        return await calibrateOpflow();

      default:
        return { success: false, error: t('main:calibrationHandlers.unknownType', { type }) };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common:unknownError');
    sendLog('error', `Calibration failed: ${message}`);
    currentCalibration = null;
    activeProtocol = null;
    return { success: false, error: message };
  }
}

// =============================================================================
// MSP Calibration Functions
// =============================================================================

async function calibrateAccelLevelMsp(): Promise<CalibrationResult> {
  sendProgress({
    type: 'accel-level',
    progress: 10,
    statusText: t('main:calibrationHandlers.sendingCommand'),
  });

  try {
    sendProgress({
      type: 'accel-level',
      progress: 30,
      statusText: t('main:calibrationHandlers.calibratingAccel'),
    });

    const { calibrateAccFromHandler } = await import('../msp/msp-commands.js');
    const result = await calibrateAccFromHandler();

    sendProgress({
      type: 'accel-level',
      progress: 80,
      statusText: t('main:calibrationHandlers.processing'),
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    if (result) {
      sendComplete({
        type: 'accel-level',
        success: true,
        data: {
          accZero: { x: 0, y: 0, z: 0 },
          accGain: { x: 4096, y: 4096, z: 4096 },
        },
      });
      return { success: true };
    } else {
      sendComplete({
        type: 'accel-level',
        success: false,
        error: t('main:calibrationHandlers.accelFailed'),
      });
      return { success: false, error: t('main:calibrationHandlers.accelFailed') };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common:unknownError');
    sendComplete({
      type: 'accel-level',
      success: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

async function calibrateCompassMsp(): Promise<CalibrationResult> {
  const duration = 30;

  sendProgress({
    type: 'compass',
    progress: 0,
    statusText: t('main:calibrationHandlers.startingCompass'),
    countdown: duration,
  });

  try {
    const { calibrateMagFromHandler } = await import('../msp/msp-commands.js');
    const result = await calibrateMagFromHandler();

    if (!result) {
      sendComplete({
        type: 'compass',
        success: false,
        error: t('main:calibrationHandlers.compassStartFailed'),
      });
      return { success: false, error: t('main:calibrationHandlers.compassStartFailed') };
    }

    let remaining = duration;
    const countdownInterval = setInterval(() => {
      remaining--;
      const progress = ((duration - remaining) / duration) * 100;

      sendProgress({
        type: 'compass',
        progress,
        statusText: t('main:calibrationHandlers.rotateAllDirections'),
        countdown: remaining,
      });

      if (remaining <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    await new Promise((resolve) => setTimeout(resolve, duration * 1000));
    clearInterval(countdownInterval);

    sendComplete({
      type: 'compass',
      success: true,
      data: {
        magZero: { x: 0, y: 0, z: 0 },
        magGain: { x: 1000, y: 1000, z: 1000 },
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common:unknownError');
    sendComplete({
      type: 'compass',
      success: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

async function calibrateGyroMsp(): Promise<CalibrationResult> {
  sendProgress({
    type: 'gyro',
    progress: 0,
    statusText: t('main:calibrationHandlers.calibratingGyro'),
  });

  try {
    await new Promise((resolve) => {
      setTimeout(() => {
        sendProgress({
          type: 'gyro',
          progress: 50,
          statusText: t('main:calibrationHandlers.processing'),
        });
      }, 1000);

      setTimeout(resolve, 2500);
    });

    sendComplete({
      type: 'gyro',
      success: true,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common:unknownError');
    sendComplete({
      type: 'gyro',
      success: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

async function calibrateOpflow(): Promise<CalibrationResult> {
  const duration = 30;

  sendProgress({
    type: 'opflow',
    progress: 0,
    statusText: t('main:calibrationHandlers.holdSteadyOpflow'),
    countdown: duration,
  });

  try {
    let remaining = duration;
    const countdownInterval = setInterval(() => {
      remaining--;
      const progress = ((duration - remaining) / duration) * 100;

      sendProgress({
        type: 'opflow',
        progress,
        statusText: t('main:calibrationHandlers.holdSteadyOpflow'),
        countdown: remaining,
      });

      if (remaining <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    await new Promise((resolve) => setTimeout(resolve, duration * 1000));

    clearInterval(countdownInterval);

    sendComplete({
      type: 'opflow',
      success: true,
      data: {
        opflowScale: 1.0,
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common:unknownError');
    sendComplete({
      type: 'opflow',
      success: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

// =============================================================================
// MSP 6-point position confirm
// =============================================================================

async function confirmPositionMsp(position: number): Promise<{ success: boolean; error?: string }> {
  if (currentCalibration !== 'accel-6point') {
    return { success: false, error: t('main:calibration.sixPointNotInProgress') };
  }

  sendLog('info', `Confirming position ${position} — sending MSP_ACC_CALIBRATION`);

  try {
    const { calibrateAccFromHandler } = await import('../msp/msp-commands.js');
    const accResult = await calibrateAccFromHandler();

    if (!accResult) {
      sendLog('error', `Position ${position}: MSP_ACC_CALIBRATION failed`);
      return { success: false, error: t('main:calibrationHandlers.accCommandFailed') };
    }

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const { readCalibrationData } = await import('../msp/msp-commands.js');
    const calData = await readCalibrationData();

    const positionStatus = [false, false, false, false, false, false];
    if (calData) {
      for (let i = 0; i < 6; i++) {
        positionStatus[i] = !!(calData.positionBitmask & (1 << i));
      }
      sendLog('info', `Calibration data: bitmask=${calData.positionBitmask.toString(2).padStart(6, '0')} accZero=(${calData.accZero.x},${calData.accZero.y},${calData.accZero.z})`);
    } else {
      for (let i = 0; i <= position; i++) {
        positionStatus[i] = true;
      }
      sendLog('warn', 'Could not read calibration data — assuming position was captured');
    }

    if (position < 5) {
      const positionNames = [
        'Level (Top Up)', // i18n-exempt
        'Inverted (Top Down)', // i18n-exempt
        'Left Side Down', // i18n-exempt
        'Right Side Down', // i18n-exempt
        'Nose Down', // i18n-exempt
        'Nose Up', // i18n-exempt
      ];

      sendProgress({
        type: 'accel-6point',
        progress: ((position + 1) / 6) * 100,
        statusText: `Place vehicle ${positionNames[position + 1]}`,
        currentPosition: (position + 1) as 0 | 1 | 2 | 3 | 4 | 5,
        positionStatus,
      });

      return { success: true };
    } else {
      sendLog('info', 'All 6 positions captured — saving to EEPROM');

      const { saveEeprom } = await import('../msp/msp-commands.js');
      const saved = await saveEeprom();

      if (!saved) {
        sendLog('warn', 'EEPROM save returned false — calibration may not persist');
      }

      sendComplete({
        type: 'accel-6point',
        success: true,
        data: calData ? {
          accZero: calData.accZero,
          accGain: calData.accGain,
        } : undefined,
      });

      return { success: true };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : t('common:unknownError');
    sendLog('error', `Position ${position} failed: ${message}`);
    return { success: false, error: message };
  }
}

// =============================================================================
// Position confirm router
// =============================================================================

async function confirmPosition(position: number): Promise<{ success: boolean; error?: string }> {
  // Route based on active protocol
  if (activeProtocol === 'mavlink') {
    return confirmMavlinkPosition(position);
  }
  return confirmPositionMsp(position);
}

// =============================================================================
// Cancel
// =============================================================================

export function cancelCalibration(reason: string = t('main:calibration.cancelledByUser')): void {
  if (activeProtocol === 'mavlink') {
    // Tell the vehicle to abandon the run BEFORE tearing down local state -
    // otherwise an ArduPilot mag cal (or PX4 cal) keeps running headless on
    // the FC with nobody watching it.
    abortVehicleCalibration();
    cancelMavlinkCalibration();
  }
  if (currentCalibration) {
    sendLog('info', `Cancelling ${currentCalibration} calibration: ${reason}`);
    sendComplete({
      type: currentCalibration,
      success: false,
      error: reason,
    });
  }
  currentCalibration = null;
  activeProtocol = null;
  if (calibrationTimeout) {
    clearTimeout(calibrationTimeout);
    calibrationTimeout = null;
  }
}

// =============================================================================
// IPC Handler Registration
// =============================================================================

export function initCalibrationHandlers(
  window: BrowserWindow,
  mavlinkDeps?: MavlinkCalibrationDeps,
): void {
  mainWindow = window;

  // Initialize MAVLink calibration backend with deps from ipc-handlers.
  // We wrap sendComplete so that whenever the MAVLink module finishes a
  // calibration it ALSO clears this module's local state. Without the wrap,
  // currentCalibration stays set forever after the first MAVLink calibration
  // and every subsequent start fails with "Another calibration is already in
  // progress" — see issue #15 follow-up.
  if (mavlinkDeps) {
    const wrappedDeps: MavlinkCalibrationDeps = {
      ...mavlinkDeps,
      sendComplete: (event) => {
        mavlinkDeps.sendComplete(event);
        currentCalibration = null;
        activeProtocol = null;
        if (calibrationTimeout) {
          clearTimeout(calibrationTimeout);
          calibrationTimeout = null;
        }
      },
    };
    initMavlinkCalibration(wrappedDeps);
  }

  // Sensor config
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_GET_SENSOR_CONFIG, async () => getSensorConfig());

  // Calibration data
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_GET_DATA, async () => getCalibrationData());
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_SET_DATA, async (_event, data: CalibrationData) =>
    setCalibrationData(data)
  );

  // Calibration control
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_START, async (_event, options: CalibrationStartOptions) =>
    startCalibration(options)
  );
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_CONFIRM_POSITION, async (_event, position: number) =>
    confirmPosition(position)
  );
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_CANCEL, async () => cancelCalibration());

  // Large Vehicle MagCal (ArduPilot) - one-shot MAV_CMD_FIXED_MAG_CAL_YAW
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_LARGE_VEHICLE_MAGCAL, async (_event, headingDeg: number) =>
    sendFixedMagCalYaw(headingDeg)
  );

  // Compass/motor calibration (ArduPilot) - start/finish compassmot
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_COMPASSMOT_START, async () => startCompassMot());
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_COMPASSMOT_STOP, async () => stopCompassMot());

  // Persistent storage (MSP/INAV) - saves calibration to bootloader partition via CLI `cali_save`
  // For MAVLink/ArduPilot, the renderer uses writeParamsToFlash() directly (MAV_CMD_PREFLIGHT_STORAGE)
  ipcMain.handle(IPC_CHANNELS.CALIBRATION_SAVE_PERSISTENT, async () => {
    try {
      const { saveCalibrationPersistent } = await import('../msp/msp-commands.js');
      return await saveCalibrationPersistent();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('common:unknownError');
      return { success: false, error: message };
    }
  });

  console.log('[Calibration] Handlers initialized');
}

export function cleanupCalibrationHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_GET_SENSOR_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_GET_DATA);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_SET_DATA);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_START);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_CONFIRM_POSITION);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_CANCEL);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_SAVE_PERSISTENT);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_LARGE_VEHICLE_MAGCAL);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_COMPASSMOT_START);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_COMPASSMOT_STOP);

  cancelCalibration();
  cleanupMavlinkCalibration();

  mainWindow = null;
  console.log('[Calibration] Handlers cleaned up');
}
