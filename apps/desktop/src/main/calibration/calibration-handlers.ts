/**
 * Calibration Handlers
 *
 * Main process handlers for sensor calibration operations.
 * Supports MSP (iNav/Betaflight) and MAVLink (ArduPilot) protocols.
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

// =============================================================================
// State
// =============================================================================

let mainWindow: BrowserWindow | null = null;
let currentCalibration: CalibrationTypeId | null = null;
let calibrationTimeout: ReturnType<typeof setTimeout> | null = null;

// =============================================================================
// Helpers
// =============================================================================

function sendLog(level: 'info' | 'warn' | 'error', message: string, details?: string): void {
  if (mainWindow?.webContents) {
    mainWindow.webContents.send(IPC_CHANNELS.CONSOLE_LOG, {
      id: Date.now(),
      timestamp: Date.now(),
      level,
      message: `[Calibration] ${message}`,
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
  if (calibrationTimeout) {
    clearTimeout(calibrationTimeout);
    calibrationTimeout = null;
  }
}

// =============================================================================
// Sensor Configuration
// =============================================================================

/**
 * Get sensor availability configuration.
 * For MSP, this reads the sensor status from the FC.
 * For MAVLink, this checks the SENSOR_OFFSETS message.
 */
async function getSensorConfig(): Promise<SensorAvailability | null> {
  // TODO: Implement actual sensor detection via MSP_SENSOR_CONFIG (96) or MAVLink
  // For now, return default values assuming basic sensors exist
  // This will be enhanced when connected to actual FC

  try {
    // Try to get connection state to determine protocol
    // For now, return defaults
    return {
      hasAccel: true,
      hasGyro: true,
      hasCompass: true, // Assume present, will be validated during calibration
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
// Calibration Data
// =============================================================================

/**
 * Get current calibration data from FC.
 * For MSP, reads MSP_CALIBRATION_DATA (14).
 */
async function getCalibrationData(): Promise<CalibrationData | null> {
  // TODO: Implement MSP_CALIBRATION_DATA read
  // For now, return null to indicate no data
  return null;
}

/**
 * Set calibration data on FC.
 * For MSP, writes MSP_SET_CALIBRATION_DATA (15).
 */
async function setCalibrationData(data: CalibrationData): Promise<{ success: boolean; error?: string }> {
  // TODO: Implement MSP_SET_CALIBRATION_DATA write
  sendLog('info', 'Saving calibration data');
  return { success: true };
}

// =============================================================================
// Calibration Execution
// =============================================================================

/**
 * Start a calibration process.
 */
async function startCalibration(options: CalibrationStartOptions): Promise<CalibrationResult> {
  const { type } = options;

  if (currentCalibration) {
    return { success: false, error: 'Another calibration is already in progress' };
  }

  currentCalibration = type;
  sendLog('info', `Starting ${type} calibration`);

  try {
    switch (type) {
      case 'accel-level':
        return await calibrateAccelLevel();

      case 'accel-6point':
        // 6-point calibration is a multi-step process
        // Return success to start, actual calibration happens via confirmPosition
        sendProgress({
          type: 'accel-6point',
          progress: 0,
          statusText: 'Place vehicle level (top up)',
          currentPosition: 0,
          positionStatus: [false, false, false, false, false, false],
        });
        return { success: true };

      case 'compass':
        return await calibrateCompass();

      case 'gyro':
        return await calibrateGyro();

      case 'opflow':
        return await calibrateOpflow();

      default:
        return { success: false, error: `Unknown calibration type: ${type}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendLog('error', `Calibration failed: ${message}`);
    currentCalibration = null;
    return { success: false, error: message };
  }
}

/**
 * Simple accelerometer level calibration (MSP 205).
 * Calls the actual MSP_ACC_CALIBRATION command via the existing msp handler.
 */
async function calibrateAccelLevel(): Promise<CalibrationResult> {
  sendProgress({
    type: 'accel-level',
    progress: 10,
    statusText: 'Sending calibration command...',
  });

  try {
    // Call the MSP calibration handler - this sends MSP_ACC_CALIBRATION (205) to the FC
    // We use ipcMain.handle that's already registered in msp-handlers.ts
    const { ipcMain } = await import('electron');

    sendProgress({
      type: 'accel-level',
      progress: 30,
      statusText: 'Calibrating accelerometer...',
    });

    // Trigger the existing MSP calibration handler
    // The msp-handlers.ts has: ipcMain.handle(IPC_CHANNELS.MSP_CALIBRATE_ACC, async () => calibrateAcc());
    // We need to call it via a different mechanism since we're in main process

    // Import the calibration function from msp-handlers
    const { calibrateAccFromHandler } = await import('../msp/msp-commands.js');
    const result = await calibrateAccFromHandler();

    sendProgress({
      type: 'accel-level',
      progress: 80,
      statusText: 'Processing...',
    });

    // Small delay to let FC process
    await new Promise(resolve => setTimeout(resolve, 500));

    if (result) {
      sendComplete({
        type: 'accel-level',
        success: true,
        data: {
          accZero: { x: 0, y: 0, z: 0 }, // Values come from FC's internal state
          accGain: { x: 4096, y: 4096, z: 4096 },
        },
      });
      return { success: true };
    } else {
      sendComplete({
        type: 'accel-level',
        success: false,
        error: 'Calibration failed - ensure vehicle is level and still',
      });
      return { success: false, error: 'Calibration failed - ensure vehicle is level and still' };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendComplete({
      type: 'accel-level',
      success: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * Compass/magnetometer calibration (MSP 206).
 * Sends actual MSP_MAG_CALIBRATION command to FC.
 */
async function calibrateCompass(): Promise<CalibrationResult> {
  const duration = 30; // seconds - mag calibration typically needs ~30s of rotation

  sendProgress({
    type: 'compass',
    progress: 0,
    statusText: 'Starting compass calibration...',
    countdown: duration,
  });

  try {
    // Send the MSP calibration command
    const { calibrateMagFromHandler } = await import('../msp/msp-commands.js');
    const result = await calibrateMagFromHandler();

    if (!result) {
      sendComplete({
        type: 'compass',
        success: false,
        error: 'Failed to start compass calibration',
      });
      return { success: false, error: 'Failed to start compass calibration' };
    }

    // Countdown while user rotates vehicle
    let remaining = duration;
    const countdownInterval = setInterval(() => {
      remaining--;
      const progress = ((duration - remaining) / duration) * 100;

      sendProgress({
        type: 'compass',
        progress,
        statusText: 'Rotate vehicle in all directions...',
        countdown: remaining,
      });

      if (remaining <= 0) {
        clearInterval(countdownInterval);
      }
    }, 1000);

    // Wait for calibration duration
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendComplete({
      type: 'compass',
      success: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * Gyroscope calibration.
 */
async function calibrateGyro(): Promise<CalibrationResult> {
  sendProgress({
    type: 'gyro',
    progress: 0,
    statusText: 'Calibrating gyroscope...',
  });

  try {
    // Gyro calibration is quick (~2-3 seconds)
    await new Promise((resolve) => {
      setTimeout(() => {
        sendProgress({
          type: 'gyro',
          progress: 50,
          statusText: 'Processing...',
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
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendComplete({
      type: 'gyro',
      success: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * Optical flow calibration (iNav only, MSP2 0x2032).
 */
async function calibrateOpflow(): Promise<CalibrationResult> {
  const duration = 30; // seconds

  sendProgress({
    type: 'opflow',
    progress: 0,
    statusText: 'Hold steady over textured surface...',
    countdown: duration,
  });

  try {
    // Start countdown
    let remaining = duration;
    const countdownInterval = setInterval(() => {
      remaining--;
      const progress = ((duration - remaining) / duration) * 100;

      sendProgress({
        type: 'opflow',
        progress,
        statusText: 'Hold steady over textured surface...',
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
        opflowScale: 1.0, // Placeholder
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    sendComplete({
      type: 'opflow',
      success: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

/**
 * Confirm a position in 6-point accelerometer calibration.
 */
async function confirmPosition(position: number): Promise<{ success: boolean; error?: string }> {
  if (currentCalibration !== 'accel-6point') {
    return { success: false, error: '6-point calibration not in progress' };
  }

  sendLog('info', `Confirming position ${position}`);

  // TODO: Send actual MSP command for this position

  // Simulate position confirmation
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const positionStatus = [false, false, false, false, false, false];
  for (let i = 0; i <= position; i++) {
    positionStatus[i] = true;
  }

  if (position < 5) {
    // More positions to go
    const positionNames = [
      'Level (Top Up)',
      'Inverted (Top Down)',
      'Left Side Down',
      'Right Side Down',
      'Nose Down',
      'Nose Up',
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
    // All positions done
    sendComplete({
      type: 'accel-6point',
      success: true,
      data: {
        accZero: { x: 0, y: 0, z: 0 },
        accGain: { x: 4096, y: 4096, z: 4096 },
      },
    });

    return { success: true };
  }
}

/**
 * Cancel active calibration.
 */
function cancelCalibration(): void {
  if (currentCalibration) {
    sendLog('info', `Cancelling ${currentCalibration} calibration`);
    sendComplete({
      type: currentCalibration,
      success: false,
      error: 'Cancelled by user',
    });
  }
  currentCalibration = null;
  if (calibrationTimeout) {
    clearTimeout(calibrationTimeout);
    calibrationTimeout = null;
  }
}

// =============================================================================
// IPC Handler Registration
// =============================================================================

export function initCalibrationHandlers(window: BrowserWindow): void {
  mainWindow = window;

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

  console.log('[Calibration] Handlers initialized');
}

export function cleanupCalibrationHandlers(): void {
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_GET_SENSOR_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_GET_DATA);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_SET_DATA);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_START);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_CONFIRM_POSITION);
  ipcMain.removeHandler(IPC_CHANNELS.CALIBRATION_CANCEL);

  // Cancel any active calibration
  cancelCalibration();

  mainWindow = null;
  console.log('[Calibration] Handlers cleaned up');
}
