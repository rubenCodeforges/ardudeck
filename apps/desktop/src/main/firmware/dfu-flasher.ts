/**
 * DFU Flasher
 * Native STM32 DFU flashing using @ardudeck/stm32-dfu
 */

import * as fs from 'fs/promises';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { DetectedBoard, FlashProgress, FlashResult } from '../../shared/firmware-types.js';
import {
  DfuDevice,
  parseDfuFile,
  parseHexFile,
  loadBinFile,
  isDfuFile,
  isHexFile,
  STM32_FLASH_START,
  type FirmwareImage,
  type FlashProgress as DfuProgress,
} from '@ardudeck/stm32-dfu';
import { rebootToBootloader } from './msp-detector.js';
import { acquireFlashLock, releaseFlashLock } from './flash-guard.js';

/**
 * Send progress update to renderer
 */
function sendProgress(window: BrowserWindow | null, progress: FlashProgress): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.FIRMWARE_PROGRESS, progress);
  }
}

/**
 * Send log message to renderer console
 */
let logId = Date.now(); // Use timestamp base to avoid duplicate keys across sessions
function sendLog(window: BrowserWindow | null, level: 'info' | 'warn' | 'error', message: string, details?: string): void {
  const fullMessage = details ? `${message}: ${details}` : message;
  console.log(`[DFU] ${fullMessage}`);
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.CONSOLE_LOG, {
      id: ++logId,
      timestamp: Date.now(),
      level,
      message: fullMessage,
    });
  }
}

/**
 * Convert DFU progress phase to our flash state
 */
function phaseToState(phase: DfuProgress['phase']): FlashProgress['state'] {
  switch (phase) {
    case 'erase':
      return 'erasing';
    case 'download':
      return 'flashing';
    case 'verify':
      return 'verifying';
    case 'manifest':
      return 'rebooting';
    default:
      return 'flashing';
  }
}

/**
 * Load firmware from file based on extension
 */
async function loadFirmware(firmwarePath: string): Promise<FirmwareImage> {
  const buffer = await fs.readFile(firmwarePath);

  // Check for DfuSe .dfu file
  if (firmwarePath.toLowerCase().endsWith('.dfu') || isDfuFile(buffer)) {
    return parseDfuFile(buffer);
  }

  // Check for Intel HEX file
  if (firmwarePath.toLowerCase().endsWith('.hex')) {
    const content = buffer.toString('utf-8');
    if (isHexFile(content)) {
      return parseHexFile(content);
    }
  }

  // Default to raw binary
  return loadBinFile(buffer, STM32_FLASH_START);
}

/**
 * Flash firmware using native DFU library
 */
export async function flashWithDfu(
  firmwarePath: string,
  board: DetectedBoard,
  window: BrowserWindow | null,
  abortController?: AbortController
): Promise<FlashResult> {
  const startTime = Date.now();
  let device: DfuDevice | null = null;

  // BSOD FIX: Acquire flash lock to prevent concurrent operations
  if (!acquireFlashLock('dfu')) {
    return {
      success: false,
      error: 'Another flash operation is already in progress. Please wait for it to complete.',
      duration: Date.now() - startTime,
    };
  }

  sendLog(window, 'info', `Starting DFU flash: ${firmwarePath}`);

  try {
    sendProgress(window, {
      state: 'preparing',
      progress: 0,
      message: 'Loading firmware file...',
    });

    // Load firmware
    const firmware = await loadFirmware(firmwarePath);
    sendLog(window, 'info', `Loaded firmware: ${firmware.totalSize} bytes, ${firmware.segments.length} segment(s)`);

    // Check for abort
    if (abortController?.signal.aborted) {
      return {
        success: false,
        error: 'Flash operation aborted',
        duration: Date.now() - startTime,
      };
    }

    sendProgress(window, {
      state: 'preparing',
      progress: 5,
      message: 'Finding DFU device...',
    });
    sendLog(window, 'info', 'Searching for DFU device...');

    // Find DFU device
    if (board.usbVid && board.usbPid) {
      device = DfuDevice.findByIds(board.usbVid, board.usbPid);
      if (device) {
        sendLog(window, 'info', `Found DFU device by VID:PID ${board.usbVid.toString(16)}:${board.usbPid.toString(16)}`);
      }
    }

    if (!device) {
      device = DfuDevice.findFirst();
      if (device) {
        sendLog(window, 'info', 'Found DFU device (first available)');
      }
    }

    // If no DFU device found and board was detected via MSP, try rebooting into bootloader
    if (!device && board.detectionMethod === 'msp' && board.port) {
      sendLog(window, 'info', `Board detected via MSP - sending reboot to bootloader command on ${board.port}`);
      sendProgress(window, {
        state: 'entering-bootloader',
        progress: 8,
        message: 'Rebooting board into DFU mode...',
      });

      const rebooted = await rebootToBootloader(board.port);
      if (rebooted) {
        sendLog(window, 'info', 'Reboot command sent, waiting for DFU device to appear...');
        sendProgress(window, {
          state: 'preparing',
          progress: 10,
          message: 'Waiting for DFU device...',
        });
        // Wait for device to appear in DFU mode
        device = await DfuDevice.waitForDevice(8000);
        if (device) {
          sendLog(window, 'info', 'DFU device appeared after reboot');
        } else {
          sendLog(window, 'warn', 'DFU device did not appear after reboot');
        }
      } else {
        sendLog(window, 'error', 'Failed to send reboot command');
      }
    }

    if (!device) {
      // Try waiting for device one more time
      sendLog(window, 'info', 'No DFU device found, waiting 5 more seconds...');
      sendProgress(window, {
        state: 'preparing',
        progress: 10,
        message: 'Waiting for DFU device...',
      });
      device = await DfuDevice.waitForDevice(5000);
    }

    if (!device) {
      sendLog(window, 'error', 'No DFU device found - board may need manual bootloader entry');
      return {
        success: false,
        error: 'No STM32 DFU device found. Make sure the board is in DFU/bootloader mode (hold BOOT button while connecting).',
        duration: Date.now() - startTime,
      };
    }

    sendLog(window, 'info', `DFU device ready: VID:PID ${device.info.vendorId.toString(16)}:${device.info.productId.toString(16)}`);

    // Check for abort
    if (abortController?.signal.aborted) {
      return {
        success: false,
        error: 'Flash operation aborted',
        duration: Date.now() - startTime,
      };
    }

    sendProgress(window, {
      state: 'preparing',
      progress: 15,
      message: 'Opening DFU device...',
    });
    sendLog(window, 'info', 'Opening DFU device...');

    // Open device
    await device.open();
    sendLog(window, 'info', `Device opened, transfer size: ${device.transferSize} bytes`);

    if (device.memoryLayout) {
      sendLog(window, 'info', `Memory: ${device.memoryLayout.name}, ${device.memoryLayout.totalSize} bytes`);
    }

    // Flash with progress callback
    sendLog(window, 'info', 'Starting flash operation...');
    await device.flash(firmware, {
      verify: true,
      onProgress: (progress) => {
        // Map progress phases to overall percentage
        let overallProgress = 15;
        switch (progress.phase) {
          case 'erase':
            overallProgress = 15 + (progress.percent * 0.20);
            break;
          case 'download':
            overallProgress = 35 + (progress.percent * 0.45);
            break;
          case 'verify':
            overallProgress = 80 + (progress.percent * 0.15);
            break;
          case 'manifest':
            overallProgress = 95 + (progress.percent * 0.05);
            break;
        }

        sendProgress(window, {
          state: phaseToState(progress.phase),
          progress: Math.round(overallProgress),
          message: progress.message || `${progress.phase}: ${progress.percent}%`,
        });
      },
    });

    // Close device
    await device.close();
    sendLog(window, 'info', 'Flash complete! Rebooting board...');

    sendProgress(window, {
      state: 'rebooting',
      progress: 100,
      message: 'Flash complete, rebooting...',
    });

    const duration = Date.now() - startTime;
    sendLog(window, 'info', `Firmware flashed successfully in ${(duration / 1000).toFixed(1)}s`);

    return {
      success: true,
      message: 'Firmware flashed successfully',
      duration,
      verified: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    sendLog(window, 'error', 'Flash failed', errorMessage);

    return {
      success: false,
      error: `Flash failed: ${errorMessage}`,
      duration: Date.now() - startTime,
    };
  } finally {
    // BSOD FIX: Always release flash lock
    releaseFlashLock();

    // Make sure device is closed
    if (device?.isOpen) {
      try {
        await device.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}

/**
 * List DFU devices
 */
export async function listDfuDevices(): Promise<string[]> {
  try {
    const devices = DfuDevice.findAll();
    return devices.map((d) => {
      const vid = d.info.vendorId.toString(16).padStart(4, '0');
      const pid = d.info.productId.toString(16).padStart(4, '0');
      return `[${vid}:${pid}] alt=${d.info.alternateSetting}`;
    });
  } catch (error) {
    console.error('[DFU] List devices error:', error);
    return [];
  }
}

/**
 * Check if native DFU is available
 * (Always true now since we use the built-in library)
 */
export async function isDfuUtilAvailable(): Promise<boolean> {
  return true;
}
