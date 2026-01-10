/**
 * AVR Flasher
 * Wrapper around avrdude for flashing AVR/ATmega boards (APM 2.5/2.6)
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { DetectedBoard, FlashProgress, FlashResult } from '../../shared/firmware-types.js';

/**
 * Get path to bundled avrdude binary
 */
export function getAvrdudePath(): string {
  const platform = process.platform;

  let binaryName = 'avrdude';
  if (platform === 'win32') {
    binaryName = 'avrdude.exe';
  }

  // Get the correct resource path
  // In production, app.getAppPath() returns the asar path
  // We need to use app.asar.unpacked for executables
  const appPath = app.getAppPath();
  const isAsar = appPath.includes('app.asar');

  const basePaths = isAsar
    ? [
        // Production: use unpacked resources
        path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin', platform, binaryName),
      ]
    : [
        // Development: look in project resources
        path.join(appPath, 'resources', 'bin', platform, binaryName),
        path.join(appPath, '..', 'resources', 'bin', platform, binaryName),
      ];

  // Always add fallback to PATH
  basePaths.push(binaryName);

  for (const binPath of basePaths) {
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  }

  // Return default and let it fail with a clear error
  return binaryName;
}

/**
 * Get path to avrdude config file
 */
function getAvrdudeConfigPath(): string | null {
  const platform = process.platform;

  // Get the correct resource path
  const appPath = app.getAppPath();
  const isAsar = appPath.includes('app.asar');

  const configPaths = isAsar
    ? [
        // Production: use unpacked resources
        path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin', platform, 'avrdude.conf'),
      ]
    : [
        // Development: look in project resources
        path.join(appPath, 'resources', 'bin', platform, 'avrdude.conf'),
        path.join(appPath, '..', 'resources', 'bin', platform, 'avrdude.conf'),
      ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * Send progress update to renderer
 */
function sendProgress(window: BrowserWindow | null, progress: FlashProgress): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.FIRMWARE_PROGRESS, progress);
  }
}

/**
 * Get MCU type for avrdude from board info
 */
function getMcuType(board: DetectedBoard): string {
  const mcu = board.mcuType.toLowerCase();

  // Map common MCU types to avrdude part names
  if (mcu.includes('atmega2560')) return 'atmega2560';
  if (mcu.includes('atmega328p')) return 'atmega328p';
  if (mcu.includes('atmega328')) return 'atmega328';
  if (mcu.includes('atmega32u4')) return 'atmega32u4';
  if (mcu.includes('atmega1280')) return 'atmega1280';

  // Default for APM boards
  return 'atmega2560';
}

/**
 * Get programmer type for avrdude
 */
function getProgrammerType(board: DetectedBoard): string {
  // APM 2.5/2.6 uses Arduino-compatible bootloader
  if (board.boardId.toLowerCase().includes('apm')) {
    return 'wiring';  // Wiring protocol (like Arduino Mega)
  }

  // Default to wiring for most Arduino-compatible boards
  return 'wiring';
}

/**
 * Parse avrdude output for progress
 */
function parseAvrdudeProgress(line: string): { progress: number; stage: string } | null {
  // avrdude output: "Writing | ################################################## | 100%"
  // or: "Reading | ###############                                   |  30%"
  const match = line.match(/(\w+)\s+\|\s*[#\s]*\|\s+(\d+)%/);
  if (match) {
    return {
      stage: match[1].toLowerCase(),
      progress: parseInt(match[2], 10),
    };
  }

  // Also check for simpler progress
  const simpleMatch = line.match(/(\d+)%/);
  if (simpleMatch) {
    return {
      stage: 'flashing',
      progress: parseInt(simpleMatch[1], 10),
    };
  }

  return null;
}

/**
 * Flash firmware using avrdude
 */
export async function flashWithAvrdude(
  firmwarePath: string,
  board: DetectedBoard,
  window: BrowserWindow | null,
  abortController?: AbortController
): Promise<FlashResult> {
  const avrdudePath = getAvrdudePath();
  const configPath = getAvrdudeConfigPath();
  const startTime = Date.now();

  return new Promise((resolve) => {
    // Validate port
    if (!board.port) {
      resolve({
        success: false,
        error: 'No serial port specified for AVR board. Please ensure the board is connected.',
        duration: 0,
      });
      return;
    }

    sendProgress(window, {
      state: 'flashing',
      progress: 0,
      message: 'Starting AVR flash...',
    });

    // Build avrdude arguments
    const args: string[] = [];

    // Add config file if found
    if (configPath) {
      args.push('-C', configPath);
    }

    // MCU type
    args.push('-p', getMcuType(board));

    // Programmer type
    args.push('-c', getProgrammerType(board));

    // Serial port
    args.push('-P', board.port);

    // Baud rate (115200 is standard for Arduino Mega bootloader)
    args.push('-b', '115200');

    // Disable auto-erase (we'll erase explicitly)
    args.push('-D');

    // Write flash memory
    args.push('-U', `flash:w:${firmwarePath}:i`);

    // Verbose output for better progress tracking
    args.push('-v');

    console.log(`Running: ${avrdudePath} ${args.join(' ')}`);

    const proc = spawn(avrdudePath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let lastProgress = 0;
    let errorOutput = '';
    let writeStarted = false;

    const handleOutput = (data: Buffer) => {
      const lines = data.toString().split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        console.log('[avrdude]', trimmed);

        // Check for progress
        const progressInfo = parseAvrdudeProgress(trimmed);
        if (progressInfo && progressInfo.progress > lastProgress) {
          lastProgress = progressInfo.progress;

          let state: FlashProgress['state'] = 'flashing';
          let message = 'Flashing...';

          if (progressInfo.stage === 'reading') {
            state = 'verifying';
            message = `Verifying: ${progressInfo.progress}%`;
          } else if (progressInfo.stage === 'writing') {
            state = 'flashing';
            message = `Writing: ${progressInfo.progress}%`;
            writeStarted = true;
          }

          sendProgress(window, {
            state,
            progress: progressInfo.progress,
            message,
          });
        }

        // Check for specific stages
        if (trimmed.includes('erasing chip')) {
          sendProgress(window, {
            state: 'erasing',
            progress: lastProgress,
            message: 'Erasing chip...',
          });
        }

        if (trimmed.includes('writing flash')) {
          sendProgress(window, {
            state: 'flashing',
            progress: lastProgress,
            message: 'Writing flash memory...',
          });
        }

        if (trimmed.includes('verifying flash')) {
          sendProgress(window, {
            state: 'verifying',
            progress: lastProgress,
            message: 'Verifying flash memory...',
          });
        }

        // Collect error output
        if (
          trimmed.toLowerCase().includes('error') ||
          trimmed.toLowerCase().includes('failed') ||
          trimmed.toLowerCase().includes('can\'t open device') ||
          trimmed.toLowerCase().includes('stk500') // Common bootloader errors
        ) {
          errorOutput += trimmed + '\n';
        }
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;

      if (code === 0) {
        sendProgress(window, {
          state: 'complete',
          progress: 100,
          message: 'Flash complete!',
        });

        resolve({
          success: true,
          message: 'Firmware flashed and verified successfully',
          duration,
          verified: true,
        });
      } else {
        // Common error messages
        let friendlyError = errorOutput;

        if (errorOutput.includes('can\'t open device')) {
          friendlyError = `Cannot open ${board.port}. Make sure no other program is using the port and the board is connected.`;
        } else if (errorOutput.includes('stk500_recv')) {
          friendlyError = 'Bootloader communication failed. Try pressing the reset button just before flashing.';
        } else if (errorOutput.includes('not in sync')) {
          friendlyError = 'Board not responding. Make sure the correct port is selected and try again.';
        }

        resolve({
          success: false,
          error: friendlyError || `avrdude exited with code ${code}`,
          duration,
        });
      }
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        error: `Failed to start avrdude: ${err.message}. Make sure avrdude is installed.`,
        duration: Date.now() - startTime,
      });
    });

    // Handle abort
    if (abortController) {
      abortController.signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
        resolve({
          success: false,
          error: 'Flash operation aborted',
          duration: Date.now() - startTime,
        });
      });
    }
  });
}

/**
 * Check if avrdude is available
 */
export async function isAvrdudeAvailable(): Promise<boolean> {
  const avrdudePath = getAvrdudePath();

  return new Promise((resolve) => {
    const proc = spawn(avrdudePath, ['-?'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    proc.on('close', () => {
      // avrdude returns non-zero for -? but still means it works
      resolve(true);
    });

    proc.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * List available serial ports (for AVR boards)
 */
export async function listSerialPorts(): Promise<string[]> {
  // This is handled by the comms package
  // Just return empty array here as a stub
  return [];
}
