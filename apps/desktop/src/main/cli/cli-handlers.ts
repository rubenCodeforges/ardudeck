/**
 * CLI Terminal Handlers
 *
 * Provides raw CLI access to iNav/Betaflight flight controllers.
 * Uses the same transport as MSP but bypasses the MSP protocol layer.
 */

import { ipcMain, BrowserWindow } from 'electron';
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
 * Clean up CLI state (called on disconnect)
 */
export function cleanupCli(): void {
  if (cliDataListener && currentTransport) {
    currentTransport.off('data', cliDataListener);
  }
  cliDataListener = null;
  cliModeActive = false;
  currentTransport = null;
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

// =============================================================================
// CLI Operations
// =============================================================================

/**
 * Enter CLI mode by sending '#' character
 */
async function enterCliMode(): Promise<boolean> {
  if (!currentTransport?.isOpen) {
    return false;
  }

  if (cliModeActive) {
    return true;
  }

  try {

    // CRITICAL: Set CLI mode active FIRST to stop MSP handler from processing data
    cliModeActive = true;
    onCliModeChange?.(true);

    // Small delay to let MSP telemetry stop
    await delay(100);

    // NOW set up data listener - MSP handler is already skipping
    cliDataListener = (data: Uint8Array) => {
      const text = new TextDecoder().decode(data);
      safeSend(IPC_CHANNELS.CLI_DATA_RECEIVED, text);
    };
    currentTransport.on('data', cliDataListener);

    // Send '#' to enter CLI mode
    await currentTransport.write(new Uint8Array([0x23])); // '#'

    // Wait for CLI prompt
    await delay(500);

    return true;
  } catch (err) {
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
 * Send a command to the CLI
 * Command should NOT include trailing newline - we add it
 */
async function sendCliCommand(command: string): Promise<void> {
  if (!currentTransport?.isOpen) {
    throw new Error('Transport not connected');
  }

  if (!cliModeActive) {
    // Auto-enter CLI mode if not already in it
    const entered = await enterCliMode();
    if (!entered) {
      throw new Error('Failed to enter CLI mode');
    }
  }

  // Verify listener is still attached (defensive)
  if (!cliDataListener) {
    cliDataListener = (data: Uint8Array) => {
      const text = new TextDecoder().decode(data);
      safeSend(IPC_CHANNELS.CLI_DATA_RECEIVED, text);
    };
    currentTransport.on('data', cliDataListener);
  }

  // Send command with newline (NOT \r\n - causes parse errors!)
  await currentTransport.write(new TextEncoder().encode(command + '\n'));
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
      const entered = await enterCliMode();
      if (!entered) {
        throw new Error('Failed to enter CLI mode');
      }
    }

    // Accumulate dump output
    let dumpOutput = '';
    const dumpListener = (data: Uint8Array) => {
      dumpOutput += new TextDecoder().decode(data);
    };

    // Temporarily replace the data listener to capture dump
    if (cliDataListener && currentTransport) {
      currentTransport.off('data', cliDataListener);
    }
    currentTransport.on('data', dumpListener);

    // Send dump command
    await currentTransport.write(new TextEncoder().encode('dump\n'));

    // Wait for dump to complete (can be large)
    await delay(3000);

    // Restore normal listener
    currentTransport.off('data', dumpListener);
    if (cliDataListener) {
      currentTransport.on('data', cliDataListener);
    }

    // Also send to renderer for display
    safeSend(IPC_CHANNELS.CLI_DATA_RECEIVED, dumpOutput);

    return dumpOutput;
  } catch (err) {
    console.error('[CLI] Failed to get dump:', err);
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
}
