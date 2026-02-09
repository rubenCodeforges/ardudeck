/**
 * STM32 Serial Bootloader Flasher
 * Implements STM32 USART bootloader protocol (AN3155)
 * For boards connected via USB-serial adapter (not native USB)
 */

import { SerialTransport } from '@ardudeck/comms';
import * as fs from 'fs/promises';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { DetectedBoard, FlashProgress, FlashResult, FlashOptions } from '../../shared/firmware-types.js';
import { rebootToBootloader } from './msp-detector.js';
import { acquireFlashLock, releaseFlashLock } from './flash-guard.js';

// Inline firmware image type to avoid import issues
interface FirmwareImage {
  segments: { address: number; data: Uint8Array }[];
  totalSize: number;
}

// STM32 Bootloader commands
const CMD_GET = 0x00;
const CMD_GET_VERSION = 0x01;
const CMD_GET_ID = 0x02;
const CMD_READ_MEMORY = 0x11;
const CMD_GO = 0x21;
const CMD_WRITE_MEMORY = 0x31;
const CMD_ERASE = 0x43;
const CMD_EXTENDED_ERASE = 0x44;

// Response codes
const ACK = 0x79;
const NACK = 0x1F;
const SYNC_ECHO = 0x7F; // Bootloader echoes 0x7F during auto-baud

// STM32 Flash start address
const FLASH_START = 0x08000000;

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
function sendLog(window: BrowserWindow | null, level: 'info' | 'warn' | 'error', message: string): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.CONSOLE_LOG, {
      id: ++logId,
      timestamp: Date.now(),
      level,
      message,
    });
  }
}

/**
 * Calculate XOR checksum for bootloader commands
 */
function checksum(data: number[]): number {
  return data.reduce((a, b) => a ^ b, 0);
}

/**
 * STM32 Serial Bootloader class
 */
class STM32SerialBootloader {
  private transport: SerialTransport;
  private window: BrowserWindow | null;

  constructor(port: string, window: BrowserWindow | null, baudRate: number = 115200) {
    // STM32 bootloader requires 8E1 (8 data bits, Even parity, 1 stop bit)
    this.transport = new SerialTransport(port, {
      baudRate,
      dataBits: 8,
      parity: 'even',
      stopBits: 1,
    });
    this.window = window;
  }

  async open(): Promise<void> {
    await this.transport.open();
  }

  async close(): Promise<void> {
    await this.transport.close();
  }

  /**
   * Response type from waitForResponse
   */
  private lastResponseWasNack = false;

  /**
   * Wait for ACK or sync response using polling (more reliable than events)
   * @param acceptSyncEcho If true, also accept 0x7F as valid (for initial sync)
   */
  private async waitForAck(timeout: number = 1000, acceptSyncEcho: boolean = false): Promise<boolean> {
    this.lastResponseWasNack = false;
    const startTime = Date.now();
    // BSOD FIX: Increased from 5ms to 25ms to reduce USB-serial driver stress
    // Aggressive polling can cause IRQ overload on CH340/CP210x/FTDI drivers
    const pollInterval = 25;

    while (Date.now() - startTime < timeout) {
      const byte = await this.transport.readByte();

      if (byte >= 0) {
        if (byte === ACK) {
          return true;
        } else if (byte === SYNC_ECHO && acceptSyncEcho) {
          sendLog(this.window, 'info', 'Got sync echo (0x7F) - bootloader detected!');
          return true;
        } else if (byte === NACK) {
          sendLog(this.window, 'warn', 'Got NACK (0x1F) - bootloader is responding');
          this.lastResponseWasNack = true;
          return false;
        }
        // Ignore other bytes
      }

      // Small delay before next poll
      await new Promise(r => setTimeout(r, pollInterval));
    }

    sendLog(this.window, 'warn', `No response within ${timeout}ms`);
    return false;
  }

  /**
   * Check if last response was NACK (means bootloader IS there, just rejected command)
   */
  hadNackResponse(): boolean {
    return this.lastResponseWasNack;
  }

  /**
   * Try to reset the board into bootloader mode using DTR/RTS
   * This works on some boards where DTR->RESET and RTS->BOOT0
   */
  async tryDtrReset(): Promise<void> {
    sendLog(this.window, 'info', 'Trying DTR/RTS reset sequence...');

    try {
      // Set BOOT0 high via RTS (if connected)
      await this.setRts(true);
      await new Promise(r => setTimeout(r, 100));

      // Pulse DTR to reset (if connected to RESET pin)
      await this.setDtr(true);
      // BSOD FIX: Increased from 100ms to 150ms for signal propagation
      await new Promise(r => setTimeout(r, 150));
      await this.setDtr(false);
      await new Promise(r => setTimeout(r, 150));

      // Wait for bootloader to start
      // BSOD FIX: Increased from 500ms to 750ms to let driver settle
      await new Promise(r => setTimeout(r, 750));
    } catch (e) {
      sendLog(this.window, 'warn', `DTR/RTS control failed: ${e}`);
    }
  }

  /**
   * Set DTR signal state
   */
  private async setDtr(state: boolean): Promise<void> {
    const port = (this.transport as unknown as { port: { set: (opts: object, cb: (err?: Error) => void) => void } }).port;
    if (port?.set) {
      return new Promise((resolve) => {
        port.set({ dtr: state }, () => resolve());
      });
    }
  }

  /**
   * Set RTS signal state
   */
  private async setRts(state: boolean): Promise<void> {
    const port = (this.transport as unknown as { port: { set: (opts: object, cb: (err?: Error) => void) => void } }).port;
    if (port?.set) {
      return new Promise((resolve) => {
        port.set({ rts: state }, () => resolve());
      });
    }
  }

  /**
   * Check if bootloader is already synchronized by sending GET command
   */
  private async checkAlreadySynced(): Promise<boolean> {
    sendLog(this.window, 'info', 'Checking if bootloader is already synchronized...');

    // Send GET command (0x00 + 0xFF checksum)
    await this.transport.write(new Uint8Array([CMD_GET, ~CMD_GET & 0xFF]));

    // Wait for response using polling
    const startTime = Date.now();
    const timeout = 500;

    while (Date.now() - startTime < timeout) {
      const byte = await this.transport.readByte();

      if (byte >= 0) {
        if (byte === ACK) {
          sendLog(this.window, 'info', 'Bootloader already synchronized (GET command accepted)');
          // Wait for full GET response then discard
          await new Promise(r => setTimeout(r, 100));
          await this.transport.discardInBuffer();
          return true;
        } else if (byte === NACK) {
          return false;
        }
      }

      await new Promise(r => setTimeout(r, 5));
    }

    return false;
  }

  /**
   * Synchronize with bootloader by sending 0x7F
   * Based on Betaflight Configurator's webstm32.js implementation
   */
  async sync(): Promise<boolean> {
    sendLog(this.window, 'info', 'Synchronizing with STM32 bootloader (8E1)...');

    // First try DTR/RTS reset to enter bootloader
    await this.tryDtrReset();

    // Discard any garbage in the buffer
    await this.transport.discardInBuffer();

    // First, check if bootloader is already synced (from previous probe or wizard)
    // This handles the case where the wizard already synchronized the bootloader
    if (await this.checkAlreadySynced()) {
      return true;
    }

    // Discard buffer again after the check
    await this.transport.discardInBuffer();

    // Betaflight uses: 4 attempts, 250ms timeout, accept 0x7F/0x79/0x1F
    for (let attempt = 0; attempt < 4; attempt++) {
      sendLog(this.window, 'info', `Sync attempt ${attempt + 1}/4 - sending 0x7F...`);

      // Send sync byte (auto-baud detection)
      await this.transport.write(new Uint8Array([0x7F]));

      // Wait for ACK, NACK, or sync echo (0x7F)
      const response = await this.waitForAck(250, true);

      if (response) {
        sendLog(this.window, 'info', 'Bootloader synchronized!');
        return true;
      }

      // If we got NACK, the bootloader IS responding but rejected the sync
      // This can happen if it's already synced - try GET command again
      if (attempt === 0) {
        await this.transport.discardInBuffer();
        if (await this.checkAlreadySynced()) {
          return true;
        }
      }

      // Small delay between attempts (Betaflight retries every 250ms)
      await new Promise(r => setTimeout(r, 100));
    }

    return false;
  }

  /**
   * Send command and wait for ACK
   */
  private async sendCommand(cmd: number): Promise<boolean> {
    await this.transport.write(new Uint8Array([cmd, ~cmd & 0xFF]));
    return this.waitForAck();
  }

  /**
   * Get bootloader version and supported commands using polling
   */
  async getVersion(): Promise<{ version: number; commands: number[] } | null> {
    if (!await this.sendCommand(CMD_GET)) {
      return null;
    }

    // Read response: [numBytes] [version] [commands...] [ACK]
    const startTime = Date.now();
    const timeout = 1000;
    const buffer: number[] = [];

    // First read the length byte
    while (Date.now() - startTime < timeout && buffer.length === 0) {
      const byte = await this.transport.readByte();
      if (byte >= 0) {
        buffer.push(byte);
      } else {
        await new Promise(r => setTimeout(r, 5));
      }
    }

    if (buffer.length === 0) return null;

    const numBytes = buffer[0]!;
    const expectedLength = numBytes + 2; // length + version + commands + ACK

    // Read remaining bytes
    while (Date.now() - startTime < timeout && buffer.length < expectedLength) {
      const byte = await this.transport.readByte();
      if (byte >= 0) {
        buffer.push(byte);
      } else {
        await new Promise(r => setTimeout(r, 5));
      }
    }

    if (buffer.length >= 2) {
      const version = buffer[1]!;
      const commands = buffer.slice(2, 2 + numBytes - 1);
      return { version, commands };
    }

    return null;
  }

  /**
   * Get chip ID using polling
   */
  async getChipId(): Promise<number | null> {
    if (!await this.sendCommand(CMD_GET_ID)) {
      return null;
    }

    // Read response: [length] [chip_id_high] [chip_id_low] [ACK]
    const startTime = Date.now();
    const timeout = 1000;
    const buffer: number[] = [];

    while (Date.now() - startTime < timeout && buffer.length < 4) {
      const byte = await this.transport.readByte();
      if (byte >= 0) {
        buffer.push(byte);
      } else {
        await new Promise(r => setTimeout(r, 5));
      }
    }

    if (buffer.length >= 3) {
      // buffer[0] is length (usually 1), buffer[1] and buffer[2] are chip ID
      const chipId = (buffer[1]! << 8) | buffer[2]!;
      return chipId;
    }

    return null;
  }

  /**
   * Erase flash memory
   */
  async eraseFlash(pages?: number[]): Promise<boolean> {
    sendLog(this.window, 'info', 'Erasing flash...');

    if (!await this.sendCommand(CMD_ERASE)) {
      // Try extended erase
      if (!await this.sendCommand(CMD_EXTENDED_ERASE)) {
        return false;
      }

      // Mass erase for extended erase
      await this.transport.write(new Uint8Array([0xFF, 0xFF, 0x00]));
      return this.waitForAck(30000); // Erase can take a while
    }

    // Standard erase - mass erase
    await this.transport.write(new Uint8Array([0xFF, 0x00]));
    return this.waitForAck(30000);
  }

  /**
   * Write memory block (max 256 bytes)
   * STM32 flash programming can take up to 400ms per 256-byte block
   */
  async writeMemory(address: number, data: Uint8Array): Promise<boolean> {
    if (data.length > 256 || data.length === 0) {
      return false;
    }

    // Send WRITE_MEMORY command with longer timeout
    await this.transport.write(new Uint8Array([CMD_WRITE_MEMORY, ~CMD_WRITE_MEMORY & 0xFF]));
    if (!await this.waitForAck(2000)) {
      return false;
    }

    // Send address with checksum
    const addrBytes = [
      (address >> 24) & 0xFF,
      (address >> 16) & 0xFF,
      (address >> 8) & 0xFF,
      address & 0xFF
    ];
    await this.transport.write(new Uint8Array([...addrBytes, checksum(addrBytes)]));

    // Wait for address ACK
    if (!await this.waitForAck(2000)) {
      return false;
    }

    // Send data with length and checksum
    const len = data.length - 1; // N-1 format
    const dataArray = Array.from(data);
    const dataChecksum = checksum([len, ...dataArray]);
    await this.transport.write(new Uint8Array([len, ...dataArray, dataChecksum]));

    // Wait for write ACK - flash programming can take time
    // STM32F3 flash write: ~40-70us per half-word, 256 bytes = ~5-10ms typical
    // But with page boundaries and busy flash, can take much longer
    return this.waitForAck(5000);
  }

  /**
   * Jump to application
   */
  async go(address: number = FLASH_START): Promise<boolean> {
    sendLog(this.window, 'info', `Jumping to application at 0x${address.toString(16)}...`);

    if (!await this.sendCommand(CMD_GO)) {
      return false;
    }

    const addrBytes = [
      (address >> 24) & 0xFF,
      (address >> 16) & 0xFF,
      (address >> 8) & 0xFF,
      address & 0xFF
    ];
    await this.transport.write(new Uint8Array([...addrBytes, checksum(addrBytes)]));

    return this.waitForAck();
  }

  /**
   * Flash firmware image
   */
  async flash(firmware: FirmwareImage, onProgress?: (percent: number) => void): Promise<void> {
    const totalBytes = firmware.totalSize;
    let written = 0;
    let consecutiveFailures = 0;
    const maxRetries = 3;
    let blockCount = 0;

    for (const segment of firmware.segments) {
      let offset = 0;
      const data = segment.data;

      while (offset < data.length) {
        const chunkSize = Math.min(256, data.length - offset);
        const chunk = data.slice(offset, offset + chunkSize);
        const address = segment.address + offset;

        let success = false;
        for (let retry = 0; retry < maxRetries; retry++) {
          if (retry > 0) {
            sendLog(this.window, 'warn', `Retrying write at 0x${address.toString(16)} (attempt ${retry + 1}/${maxRetries})...`);
            // Discard any garbage and wait before retry
            await this.transport.discardInBuffer();
            await new Promise(r => setTimeout(r, 100));
          }

          success = await this.writeMemory(address, chunk);
          if (success) {
            consecutiveFailures = 0;
            break;
          }
          consecutiveFailures++;
        }

        if (!success) {
          throw new Error(`Write failed at address 0x${address.toString(16)} after ${maxRetries} retries`);
        }

        offset += chunkSize;
        written += chunkSize;
        blockCount++;

        if (onProgress) {
          onProgress(Math.round((written / totalBytes) * 100));
        }

        // BSOD FIX: Increased from 15ms to 25ms
        // Delay between writes to let bootloader and serial buffers settle
        // CP2102 and similar USB-serial adapters need time to flush their buffers
        // Too fast = buffer overflow = lost data = bootloader stops responding
        // Also prevents IRQ overload that can cause Windows BSOD
        await new Promise(r => setTimeout(r, 25));

        // Every 64 blocks (16KB), take a longer pause to let everything settle
        // This helps prevent buffer overflow on longer flashes
        if (blockCount % 64 === 0) {
          sendLog(this.window, 'info', `Written ${Math.round(written / 1024)}KB...`);
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }
  }
}

/**
 * Check if content is Intel HEX format
 */
function isHexFile(content: string): boolean {
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  return lines.length > 0 && lines[0]!.startsWith(':');
}

/**
 * Parse Intel HEX file
 */
function parseHexFile(content: string): FirmwareImage {
  const segments: { address: number; data: number[] }[] = [];
  let extendedAddress = 0;
  let currentSegment: { address: number; data: number[] } | null = null;

  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (!line.startsWith(':')) continue;

    const bytes = [];
    for (let i = 1; i < line.length; i += 2) {
      bytes.push(parseInt(line.substr(i, 2), 16));
    }

    const byteCount = bytes[0]!;
    const address = (bytes[1]! << 8) | bytes[2]!;
    const recordType = bytes[3];
    const data = bytes.slice(4, 4 + byteCount);

    switch (recordType) {
      case 0x00: // Data record
        const fullAddress = extendedAddress + address;
        if (!currentSegment || fullAddress !== currentSegment.address + currentSegment.data.length) {
          if (currentSegment) segments.push(currentSegment);
          currentSegment = { address: fullAddress, data: [...data] };
        } else {
          currentSegment.data.push(...data);
        }
        break;
      case 0x01: // EOF
        if (currentSegment) segments.push(currentSegment);
        break;
      case 0x02: // Extended segment address
        extendedAddress = ((data[0]! << 8) | data[1]!) << 4;
        break;
      case 0x04: // Extended linear address
        extendedAddress = ((data[0]! << 8) | data[1]!) << 16;
        break;
    }
  }

  const totalSize = segments.reduce((sum, seg) => sum + seg.data.length, 0);

  return {
    segments: segments.map(s => ({ address: s.address, data: new Uint8Array(s.data) })),
    totalSize,
  };
}

/**
 * Load firmware from file
 */
async function loadFirmware(firmwarePath: string): Promise<FirmwareImage> {
  const buffer = await fs.readFile(firmwarePath);

  if (firmwarePath.toLowerCase().endsWith('.hex')) {
    const content = buffer.toString('utf-8');
    if (isHexFile(content)) {
      return parseHexFile(content);
    }
  }

  // Raw binary - assume flash start address
  return {
    segments: [{ address: FLASH_START, data: new Uint8Array(buffer) }],
    totalSize: buffer.length,
  };
}

/**
 * Flash firmware via STM32 serial bootloader
 */
export async function flashWithSerialBootloader(
  firmwarePath: string,
  board: DetectedBoard,
  window: BrowserWindow | null,
  abortController?: AbortController,
  options?: FlashOptions
): Promise<FlashResult> {
  const startTime = Date.now();
  let bootloader: STM32SerialBootloader | null = null;

  if (!board.port) {
    return {
      success: false,
      error: 'No serial port specified',
      duration: Date.now() - startTime,
    };
  }

  // BSOD FIX: Acquire flash lock to prevent concurrent operations
  if (!acquireFlashLock('serial')) {
    return {
      success: false,
      error: 'Another flash operation is already in progress. Please wait for it to complete.',
      duration: Date.now() - startTime,
    };
  }

  sendLog(window, 'info', `Starting serial bootloader flash: ${firmwarePath}`);
  sendLog(window, 'info', `Port: ${board.port}`);

  try {
    sendProgress(window, {
      state: 'preparing',
      progress: 0,
      message: 'Loading firmware...',
    });

    const firmware = await loadFirmware(firmwarePath);
    sendLog(window, 'info', `Loaded firmware: ${firmware.totalSize} bytes`);

    // If detected via MSP and no reboot sequence is not set, try to reboot into bootloader
    if (board.detectionMethod === 'msp' && !options?.noRebootSequence) {
      sendProgress(window, {
        state: 'entering-bootloader',
        progress: 5,
        message: 'Rebooting into bootloader mode...',
      });

      // Try both bootloader types - ROM first (more compatible), then flash
      sendLog(window, 'info', 'Sending MSP reboot to bootloader (ROM mode)...');
      const rebooted = await rebootToBootloader(board.port, 115200, false);

      if (rebooted) {
        sendLog(window, 'info', 'Reboot command sent!');
        sendLog(window, 'info', 'Waiting 4s for board to enter bootloader...');
        await new Promise(r => setTimeout(r, 4000));
      } else {
        sendLog(window, 'warn', 'MSP reboot command failed');
      }
    } else if (options?.noRebootSequence) {
      sendLog(window, 'info', 'Skipping reboot sequence - assuming board is already in bootloader');
    }

    // STM32 ROM bootloader auto-detects baud from 0x7F sync byte
    // Standard rates - same as detection code
    const baudRates = [115200, 57600, 38400, 19200, 9600];
    let synced = false;
    let foundResponsiveBaudRate = false;

    for (const baudRate of baudRates) {
      sendProgress(window, {
        state: 'preparing',
        progress: 10,
        message: `Trying bootloader at ${baudRate} baud...`,
      });
      sendLog(window, 'info', `Trying bootloader connection at ${baudRate} baud...`);

      try {
        bootloader = new STM32SerialBootloader(board.port, window, baudRate);
        await bootloader.open();

        synced = await bootloader.sync();
        if (synced) {
          sendLog(window, 'info', `Connected at ${baudRate} baud`);
          break;
        }

        // If we got NACK, the bootloader IS responding at this baud rate
        // Don't try other baud rates - keep trying at this one
        if (bootloader.hadNackResponse()) {
          sendLog(window, 'info', `Bootloader responded with NACK at ${baudRate} - trying additional sync methods...`);
          foundResponsiveBaudRate = true;

          // Try a few more times with delays - bootloader might need time to reset
          // BSOD FIX: Increased delays to prevent driver stress from rapid port cycling
          for (let retry = 0; retry < 3; retry++) {
            await new Promise(r => setTimeout(r, 1000)); // Was 500ms
            await bootloader.close();
            await new Promise(r => setTimeout(r, 1000));  // BSOD FIX: Was 500ms, increased for full driver release

            bootloader = new STM32SerialBootloader(board.port, window, baudRate);
            await bootloader.open();

            synced = await bootloader.sync();
            if (synced) {
              sendLog(window, 'info', `Connected at ${baudRate} baud (retry ${retry + 1})`);
              break;
            }
          }

          if (synced) break;
        }

        await bootloader.close();
        bootloader = null;

        // If we found a responsive baud rate but still can't sync, don't try others
        if (foundResponsiveBaudRate) {
          sendLog(window, 'warn', `Bootloader responded at ${baudRate} but sync failed`);
          break;
        }
      } catch (e) {
        sendLog(window, 'warn', `Failed at ${baudRate}: ${e}`);
        if (bootloader) {
          try { await bootloader.close(); } catch {}
          bootloader = null;
        }
      }
    }

    if (!synced || !bootloader) {
      return {
        success: false,
        error: `Could not connect to bootloader. For boards with USB-serial adapter (CP2102/FTDI):

1. Disconnect USB
2. Short the BOOT pads on the board (use tweezers or a jumper wire)
3. While holding BOOT pads shorted, connect USB
4. Click Flash again (keep boot pads shorted until flashing starts)
5. Release boot pads once "Erasing flash..." appears

The BOOT pads are usually labeled "BOOT" or "BT" near the MCU.`,
        duration: Date.now() - startTime,
      };
    }

    // Get chip info and validate firmware size
    const chipId = await bootloader.getChipId();
    let flashSizeKb = 0;
    if (chipId) {
      sendLog(window, 'info', `Chip ID: 0x${chipId.toString(16)}`);

      // Look up chip info to get flash size
      const { getSTM32ChipInfo } = await import('../../shared/firmware-types.js');
      const chipInfo = getSTM32ChipInfo(chipId);
      if (chipInfo) {
        sendLog(window, 'info', `Detected: ${chipInfo.mcu} (${chipInfo.flashKb || '?'}KB flash)`);
        flashSizeKb = chipInfo.flashKb || 0;

        // Validate firmware fits in flash
        if (flashSizeKb > 0) {
          const flashSizeBytes = flashSizeKb * 1024;
          if (firmware.totalSize > flashSizeBytes) {
            const firmwareSizeKb = Math.round(firmware.totalSize / 1024);
            await bootloader.close();
            return {
              success: false,
              error: `Firmware too large! The ${chipInfo.mcu} has ${flashSizeKb}KB flash, but the firmware is ${firmwareSizeKb}KB.\n\nPlease select a firmware build that matches your board's flash size.`,
              duration: Date.now() - startTime,
            };
          }
        }
      }
    }

    if (abortController?.signal.aborted) {
      return { success: false, error: 'Aborted', duration: Date.now() - startTime };
    }

    // Erase flash
    sendProgress(window, {
      state: 'erasing',
      progress: 10,
      message: 'Erasing flash...',
    });

    const erased = await bootloader.eraseFlash();
    if (!erased) {
      return {
        success: false,
        error: 'Flash erase failed',
        duration: Date.now() - startTime,
      };
    }
    sendLog(window, 'info', 'Flash erased');

    if (abortController?.signal.aborted) {
      return { success: false, error: 'Aborted', duration: Date.now() - startTime };
    }

    // Write firmware
    sendProgress(window, {
      state: 'flashing',
      progress: 20,
      message: 'Writing firmware...',
    });

    await bootloader.flash(firmware, (percent) => {
      sendProgress(window, {
        state: 'flashing',
        progress: 20 + Math.round(percent * 0.7),
        message: `Writing firmware... ${percent}%`,
      });
    });
    sendLog(window, 'info', 'Firmware written');

    // Jump to application
    sendProgress(window, {
      state: 'rebooting',
      progress: 95,
      message: 'Starting application...',
    });

    await bootloader.go();
    await bootloader.close();

    sendProgress(window, {
      state: 'complete',
      progress: 100,
      message: 'Flash complete!',
    });

    const duration = Date.now() - startTime;
    sendLog(window, 'info', `Flash complete in ${(duration / 1000).toFixed(1)}s`);

    return {
      success: true,
      message: 'Firmware flashed successfully',
      duration,
      verified: false, // Serial bootloader doesn't easily support verify
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendLog(window, 'error', `Flash failed: ${message}`);
    return {
      success: false,
      error: message,
      duration: Date.now() - startTime,
    };
  } finally {
    // BSOD FIX: Always release flash lock
    releaseFlashLock();

    if (bootloader) {
      try {
        await bootloader.close();
      } catch {
        // Ignore
      }
    }
  }
}
