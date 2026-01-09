/**
 * CLI Terminal Handlers
 *
 * Provides raw CLI access to iNav/Betaflight flight controllers.
 * Uses the same transport as MSP but bypasses the MSP protocol layer.
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { writeFile } from 'fs/promises';
import type { Transport } from '@ardudeck/comms';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

// =============================================================================
// State
// =============================================================================

let mainWindow: BrowserWindow | null = null;
let currentTransport: Transport | null = null;
let cliModeActive = false;
let cliDataListener: ((data: Uint8Array) => void) | null = null;

// Callback to notify MSP handlers when CLI mode changes
let onCliModeChange: ((active: boolean) => void) | null = null;


// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize CLI handlers with the main window reference
 */
export function initCliHandlers(window: BrowserWindow): void {
  mainWindow = window;
  registerIpcHandlers();
}

/**
 * Set the transport for CLI communication (called from MSP handlers)
 */
export function setCliTransport(transport: Transport | null): void {
  // Cleanup old listener if transport changes
  if (cliDataListener && currentTransport) {
    currentTransport.off('data', cliDataListener);
    cliDataListener = null;
  }
  currentTransport = transport;

  // If we had CLI mode active and transport changed, reset state
  if (!transport && cliModeActive) {
    cliModeActive = false;
    onCliModeChange?.(false);
  }
}

/**
 * Set callback for CLI mode changes (so MSP can pause telemetry)
 */
export function setCliModeChangeCallback(callback: (active: boolean) => void): void {
  onCliModeChange = callback;
}

/**
 * Check if CLI mode is currently active
 */
export function isCliModeActive(): boolean {
  return cliModeActive;
}

/**
 * Exit CLI mode if active (call before disconnect to leave board in MSP mode)
 * Uses timeout to prevent hanging if board is in bad state
 */
export async function exitCliModeIfActive(): Promise<void> {
  if (cliModeActive && currentTransport?.isOpen) {
    console.log('[CLI] Exiting CLI mode before disconnect...');
    try {
      // Use timeout to prevent hanging - if write takes > 1 second, skip it
      const writePromise = currentTransport.write(new TextEncoder().encode('exit\n'));
      const timeoutPromise = new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('CLI exit write timeout')), 1000)
      );

      await Promise.race([writePromise, timeoutPromise]);
      await delay(300);
      console.log('[CLI] Sent exit command');
    } catch (err) {
      console.warn('[CLI] Failed to send exit command (continuing with disconnect):', err);
      // Don't block disconnect on CLI exit failure
    }
  }
  // Reset state regardless - ALWAYS clean up even if write failed
  if (cliDataListener && currentTransport) {
    try {
      currentTransport.off('data', cliDataListener);
    } catch {
      // Ignore errors removing listener
    }
  }
  cliDataListener = null;
  cliModeActive = false;
  onCliModeChange?.(false);
  console.log('[CLI] CLI state cleaned up');
}

/**
 * Clean up CLI state (called on disconnect)
 */
export function cleanupCli(): void {
  console.log('[CLI] cleanupCli: resetting CLI state');
  if (cliDataListener && currentTransport) {
    currentTransport.off('data', cliDataListener);
  }
  cliDataListener = null;
  cliModeActive = false;
  currentTransport = null;
  console.log('[CLI] cleanupCli: done');
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Send data to the renderer process
 */
function safeSend(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Wait for a specified duration
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Filter out MSP binary data from CLI output.
 * MSP frames that arrive after CLI mode is entered (in-flight responses)
 * should not be displayed as garbage text.
 *
 * MSP v1: $M< (response), $M> (request), $M! (error)
 * MSP v2: $X< (response), $X> (request), $X! (error)
 */
function filterMspFromData(data: Uint8Array): Uint8Array {
  if (data.length === 0) return data;

  // Quick check: if no '$' (0x24) in data, it's pure CLI text
  let hasDollar = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === 0x24) {
      hasDollar = true;
      break;
    }
  }
  if (!hasDollar) return data;

  // Filter out MSP frames
  const result: number[] = [];
  let i = 0;

  while (i < data.length) {
    // Check for MSP v1/v2 header: $ followed by M or X
    if (data[i] === 0x24 && i + 2 < data.length) {
      const second = data[i + 1];
      const third = data[i + 2];

      // MSP v1: $M followed by <, >, or !
      if (second === 0x4D && (third === 0x3C || third === 0x3E || third === 0x21)) {
        // MSP v1 frame: $M + dir + len + cmd + payload + checksum
        if (i + 4 < data.length) {
          const payloadLen = data[i + 3] ?? 0;
          const frameLen = 6 + payloadLen;
          i += Math.min(frameLen, data.length - i);
          continue;
        } else {
          // Incomplete frame, skip rest
          break;
        }
      }

      // MSP v2: $X followed by <, >, or !
      if (second === 0x58 && (third === 0x3C || third === 0x3E || third === 0x21)) {
        // MSP v2 frame: $X + dir + flag + cmd(2) + len(2) + payload + crc
        if (i + 8 < data.length) {
          const payloadLen = (data[i + 6] ?? 0) | ((data[i + 7] ?? 0) << 8);
          const frameLen = 9 + payloadLen;
          i += Math.min(frameLen, data.length - i);
          continue;
        } else {
          // Incomplete frame, skip rest
          break;
        }
      }
    }

    // Not MSP, keep this byte
    result.push(data[i]!);
    i++;
  }

  return new Uint8Array(result);
}

// =============================================================================
// CLI Operations
// =============================================================================

/**
 * Enter CLI mode by sending '#' character
 */
async function enterCliMode(): Promise<boolean> {
  console.log('[CLI] enterCliMode: transport open?', currentTransport?.isOpen, 'already active?', cliModeActive);

  if (!currentTransport?.isOpen) {
    console.log('[CLI] enterCliMode: no transport, returning false');
    return false;
  }

  if (cliModeActive) {
    console.log('[CLI] enterCliMode: already active, returning true');
    return true;
  }

  try {
    console.log('[CLI] enterCliMode: activating CLI mode...');

    // CRITICAL: Set CLI mode active FIRST to stop MSP handler from processing data
    cliModeActive = true;
    onCliModeChange?.(true);

    // Small delay to let MSP telemetry stop
    await delay(100);

    // NOW set up data listener - MSP handler is already skipping
    // Filter out any MSP frames that arrive (in-flight responses)
    cliDataListener = (data: Uint8Array) => {
      const filtered = filterMspFromData(data);
      if (filtered.length > 0) {
        const text = new TextDecoder().decode(filtered);
        safeSend(IPC_CHANNELS.CLI_DATA_RECEIVED, text);
      }
    };
    currentTransport.on('data', cliDataListener);

    // Send '#' to enter CLI mode
    await currentTransport.write(new Uint8Array([0x23])); // '#'

    // Wait for CLI prompt
    await delay(500);

    console.log('[CLI] enterCliMode: success');
    return true;
  } catch (err) {
    console.error('[CLI] enterCliMode: error', err);
    // Cleanup on error
    if (cliDataListener && currentTransport) {
      currentTransport.off('data', cliDataListener);
      cliDataListener = null;
    }
    cliModeActive = false;
    onCliModeChange?.(false);
    return false;
  }
}

/**
 * Exit CLI mode by sending 'exit' command
 */
async function exitCliMode(): Promise<boolean> {
  if (!currentTransport?.isOpen) {
    cliModeActive = false;
    onCliModeChange?.(false);
    return true;
  }

  if (!cliModeActive) {
    return true;
  }

  try {
    // Send 'exit' command
    await currentTransport.write(new TextEncoder().encode('exit\n'));

    // Wait for exit to complete
    await delay(500);

    // Remove data listener
    if (cliDataListener && currentTransport) {
      currentTransport.off('data', cliDataListener);
      cliDataListener = null;
    }

    cliModeActive = false;
    onCliModeChange?.(false);

    return true;
  } catch {
    // Force cleanup on error
    if (cliDataListener && currentTransport) {
      currentTransport.off('data', cliDataListener);
      cliDataListener = null;
    }
    cliModeActive = false;
    onCliModeChange?.(false);
    return false;
  }
}

/**
 * Exit CLI mode silently - for programmatic dumps
 * Does NOT trigger the onCliModeChange callback to avoid race conditions
 * with telemetry restart. The caller is responsible for any timing.
 */
async function exitCliModeSilent(): Promise<boolean> {
  if (!currentTransport?.isOpen) {
    cliModeActive = false;
    // NO callback - silent exit
    return true;
  }

  if (!cliModeActive) {
    return true;
  }

  try {
    // Send 'exit' command
    await currentTransport.write(new TextEncoder().encode('exit\n'));

    // Wait longer for FC to fully exit CLI mode
    await delay(1000);

    // Remove data listener
    if (cliDataListener && currentTransport) {
      currentTransport.off('data', cliDataListener);
      cliDataListener = null;
    }

    cliModeActive = false;
    // NO callback - telemetry will restart naturally or caller handles it

    console.log('[CLI] Silent exit complete');
    return true;
  } catch {
    // Force cleanup on error
    if (cliDataListener && currentTransport) {
      currentTransport.off('data', cliDataListener);
      cliDataListener = null;
    }
    cliModeActive = false;
    return false;
  }
}

/**
 * Send a command to the CLI
 * Command should NOT include trailing newline - we add it
 */
async function sendCliCommand(command: string): Promise<void> {
  console.log('[CLI] sendCliCommand:', command);

  if (!currentTransport?.isOpen) {
    console.error('[CLI] Transport not connected, cannot send command');
    throw new Error('Transport not connected');
  }

  if (!cliModeActive) {
    console.log('[CLI] Not in CLI mode, auto-entering...');
    // Auto-enter CLI mode if not already in it
    const entered = await enterCliMode();
    if (!entered) {
      console.error('[CLI] Failed to auto-enter CLI mode');
      throw new Error('Failed to enter CLI mode');
    }
    console.log('[CLI] Auto-entered CLI mode successfully');
  }

  // Verify listener is still attached (defensive)
  if (!cliDataListener) {
    console.log('[CLI] Re-attaching data listener');
    cliDataListener = (data: Uint8Array) => {
      const filtered = filterMspFromData(data);
      if (filtered.length > 0) {
        const text = new TextDecoder().decode(filtered);
        safeSend(IPC_CHANNELS.CLI_DATA_RECEIVED, text);
      }
    };
    currentTransport.on('data', cliDataListener);
  }

  // Send command with newline (NOT \r\n - causes parse errors!)
  await currentTransport.write(new TextEncoder().encode(command + '\n'));
  console.log('[CLI] Command sent');
}

/**
 * Send raw data to the CLI (for special characters like Ctrl+C)
 */
async function sendCliRaw(data: string): Promise<void> {
  if (!currentTransport?.isOpen) {
    throw new Error('Transport not connected');
  }

  if (!cliModeActive) {
    throw new Error('Not in CLI mode');
  }

  try {
    await currentTransport.write(new TextEncoder().encode(data));
  } catch (err) {
    console.error('[CLI] Failed to send raw data:', err);
    throw err;
  }
}

/**
 * Get full config dump for autocomplete
 * Returns the accumulated output from 'dump' command
 */
async function getCliDump(): Promise<string> {
  if (!currentTransport?.isOpen) {
    throw new Error('Transport not connected');
  }

  const wasInCliMode = cliModeActive;

  try {
    // Enter CLI mode if not already
    if (!wasInCliMode) {
      console.log('[CLI] getCliDump: entering CLI mode...');
      const entered = await enterCliMode();
      if (!entered) {
        throw new Error('Failed to enter CLI mode');
      }
    } else {
      console.log('[CLI] getCliDump: already in CLI mode');
    }

    // Accumulate dump output
    let dumpOutput = '';
    let lastDataTime = Date.now();
    const dumpListener = (data: Uint8Array) => {
      dumpOutput += new TextDecoder().decode(data);
      lastDataTime = Date.now();
    };

    // Temporarily replace the data listener to capture dump
    if (cliDataListener && currentTransport) {
      currentTransport.off('data', cliDataListener);
    }
    currentTransport.on('data', dumpListener);

    // Send dump command
    console.log('[CLI] Sending dump command...');
    await currentTransport.write(new TextEncoder().encode('dump\n'));

    // Wait for dump to complete with dynamic timeout
    // Keep waiting as long as data is still coming in
    const startTime = Date.now();
    const maxWait = 10000; // 10 seconds max
    const idleTimeout = 500; // Stop after 500ms of no data

    while (Date.now() - startTime < maxWait) {
      await delay(200);
      // If no data received for idleTimeout, dump is complete
      if (Date.now() - lastDataTime > idleTimeout && dumpOutput.length > 0) {
        console.log('[CLI] Dump complete (idle timeout), received', dumpOutput.length, 'chars');
        break;
      }
    }

    if (Date.now() - startTime >= maxWait) {
      console.log('[CLI] Dump reached max wait time, received', dumpOutput.length, 'chars');
    }

    // Restore normal listener
    currentTransport.off('data', dumpListener);
    if (cliDataListener) {
      currentTransport.on('data', cliDataListener);
    }

    // Exit CLI mode if we entered it for this dump
    // Use silent exit - don't trigger telemetry restart callback (causes race condition)
    if (!wasInCliMode) {
      console.log('[CLI] getCliDump: exiting CLI mode silently...');
      await exitCliModeSilent();
    }

    // NOTE: We intentionally do NOT send dump output to terminal here.
    // This is a programmatic dump (for legacy config / autocomplete).
    // If user types 'dump' manually in CLI, it goes through normal flow.

    console.log('[CLI] Dump returned:', dumpOutput.length, 'chars');
    return dumpOutput;
  } catch (err) {
    console.error('[CLI] Failed to get dump:', err);
    // Make sure to exit CLI mode on error too
    if (!wasInCliMode && cliModeActive) {
      try {
        await exitCliMode();
      } catch {
        // Ignore exit errors
      }
    }
    throw err;
  }
}

// =============================================================================
// IPC Handler Registration
// =============================================================================

function registerIpcHandlers(): void {
  // Enter CLI mode
  ipcMain.handle(IPC_CHANNELS.CLI_ENTER_MODE, async () => {
    return enterCliMode();
  });

  // Exit CLI mode
  ipcMain.handle(IPC_CHANNELS.CLI_EXIT_MODE, async () => {
    return exitCliMode();
  });

  // Send CLI command
  ipcMain.handle(IPC_CHANNELS.CLI_SEND_COMMAND, async (_, command: string) => {
    await sendCliCommand(command);
  });

  // Send raw data
  ipcMain.handle(IPC_CHANNELS.CLI_SEND_RAW, async (_, data: string) => {
    await sendCliRaw(data);
  });

  // Get config dump
  ipcMain.handle(IPC_CHANNELS.CLI_GET_DUMP, async () => {
    return getCliDump();
  });

  // Save CLI output to file
  ipcMain.handle(IPC_CHANNELS.CLI_SAVE_OUTPUT, async (_, content: string): Promise<boolean> => {
    if (!mainWindow) return false;

    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save CLI Output',
      defaultPath: `cli-dump-${new Date().toISOString().slice(0, 10)}.txt`,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    if (result.canceled || !result.filePath) {
      return false;
    }

    try {
      await writeFile(result.filePath, content, 'utf-8');
      console.log('[CLI] Output saved to:', result.filePath);
      return true;
    } catch (err) {
      console.error('[CLI] Failed to save output:', err);
      return false;
    }
  });
}
