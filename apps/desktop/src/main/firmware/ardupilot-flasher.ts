/**
 * ArduPilot Bootloader Flasher
 * Implements the ArduPilot/PX4 custom serial bootloader protocol
 * Reference: MissionPlanner-ref/ExtLibs/px4uploader/Uploader.cs
 *
 * Protocol: command/response over serial 115200 8N1
 * NOT STM32 DFU or STM32 ROM bootloader — this is ArduPilot's own bootloader
 */

import { SerialTransport } from '@ardudeck/comms';
import * as fs from 'fs/promises';
import * as zlib from 'zlib';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { DetectedBoard, FlashProgress, FlashResult, FlashOptions } from '../../shared/firmware-types.js';
import { rebootToBootloaderMavlink } from './msp-detector.js';
import { acquireFlashLock, releaseFlashLock } from './flash-guard.js';

// ArduPilot bootloader response codes
const INSYNC = 0x12;
const OK = 0x10;
const FAILED = 0x11;
const INVALID = 0x13;

// ArduPilot bootloader commands (each terminated with EOC)
const EOC = 0x20;
const GET_SYNC = 0x21;
const GET_DEVICE = 0x22;
const CHIP_ERASE = 0x23;
const PROG_MULTI = 0x27;
const GET_CRC = 0x29;
const REBOOT = 0x30;

// GET_DEVICE info params
const INFO_BL_REV = 1;
const INFO_BOARD_ID = 2;
const INFO_BOARD_REV = 3;
const INFO_FLASH_SIZE = 4;

// Max bytes per PROG_MULTI (must be multiple of 4, protocol max 255)
const PROG_MULTI_MAX = 252;

/**
 * CRC32 lookup table — standard polynomial 0xEDB88320 (reflected)
 * ArduPilot bootloader uses initial value 0x00000000 (NOT standard 0xFFFFFFFF)
 */
const CRC32_TABLE = new Uint32Array(256);
{
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 1) ? ((crc >>> 1) ^ 0xEDB88320) : (crc >>> 1);
    }
    CRC32_TABLE[i] = crc;
  }
}

/**
 * Compute CRC32 with ArduPilot's non-standard initial value of 0
 */
function crc32(data: Uint8Array, state: number = 0): number {
  for (let i = 0; i < data.length; i++) {
    const index = ((state ^ data[i]!) & 0xFF);
    state = (CRC32_TABLE[index]! ^ (state >>> 8)) >>> 0;
  }
  return state;
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
 * Send log message to renderer console
 */
let logId = Date.now();
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
 * APJ firmware file content
 */
interface ApjFirmware {
  boardId: number;
  imageSize: number;
  image: Uint8Array; // Decompressed firmware binary
}

/**
 * Parse an APJ firmware file
 * APJ is JSON with base64-encoded, zlib-compressed firmware image
 */
async function parseApjFile(firmwarePath: string): Promise<ApjFirmware> {
  const content = await fs.readFile(firmwarePath, 'utf-8');
  const json = JSON.parse(content) as { board_id?: number; image_size?: number; image?: string };

  if (!json.image || !json.image_size) {
    throw new Error('Invalid APJ file: missing image or image_size field');
  }

  const boardId = json.board_id ?? 0;
  const imageSize = json.image_size;

  // Decode base64 to buffer
  const compressed = Buffer.from(json.image, 'base64');

  // Decompress zlib
  const decompressed = await new Promise<Buffer>((resolve, reject) => {
    zlib.inflate(compressed, (err, result) => {
      if (err) reject(new Error(`APJ decompression failed: ${err.message}`));
      else resolve(result);
    });
  });

  // Pad to 4-byte alignment
  let paddedSize = imageSize;
  if (paddedSize % 4 !== 0) {
    paddedSize += 4 - (paddedSize % 4);
  }

  const image = new Uint8Array(paddedSize);
  image.set(new Uint8Array(decompressed.buffer, decompressed.byteOffset, Math.min(decompressed.length, paddedSize)));

  return { boardId, imageSize, image };
}

/**
 * Read exactly `count` bytes from transport with timeout
 */
async function readBytes(transport: SerialTransport, count: number, timeout: number): Promise<Uint8Array | null> {
  const buf = new Uint8Array(count);
  let offset = 0;
  const deadline = Date.now() + timeout;

  while (offset < count && Date.now() < deadline) {
    const byte = await transport.readByte();
    if (byte >= 0) {
      buf[offset++] = byte;
    } else {
      await new Promise(r => setTimeout(r, 10));
    }
  }

  return offset === count ? buf : null;
}

/**
 * Read INSYNC + OK (or error) response from bootloader
 */
async function getSync(transport: SerialTransport, timeout: number = 1000): Promise<boolean> {
  const resp = await readBytes(transport, 2, timeout);
  if (!resp) return false;

  if (resp[0] !== INSYNC) return false;
  if (resp[1] === OK) return true;
  if (resp[1] === INVALID) throw new Error('Bootloader reports INVALID OPERATION');
  if (resp[1] === FAILED) throw new Error('Bootloader reports OPERATION FAILED');
  return false;
}

/**
 * Synchronize with ArduPilot bootloader
 * Send GET_SYNC + EOC, expect INSYNC + OK
 */
async function ardupilotSync(
  transport: SerialTransport,
  window: BrowserWindow | null,
  maxAttempts: number = 3
): Promise<boolean> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    sendLog(window, 'info', `Sync attempt ${attempt + 1}/${maxAttempts}...`);

    // Flush any stale data
    await transport.discardInBuffer();

    // Send GET_SYNC + EOC
    await transport.write(new Uint8Array([GET_SYNC, EOC]));

    try {
      if (await getSync(transport, 1000)) {
        sendLog(window, 'info', 'Bootloader synchronized');
        return true;
      }
    } catch {
      // Error response means bootloader is there but unhappy — retry
    }

    await new Promise(r => setTimeout(r, 300));
  }

  return false;
}

/**
 * Get device info (4-byte little-endian int)
 */
async function getDeviceInfo(
  transport: SerialTransport,
  infoType: number,
  timeout: number = 2000
): Promise<number> {
  await transport.write(new Uint8Array([GET_DEVICE, infoType, EOC]));

  // Read 4-byte little-endian value
  const data = await readBytes(transport, 4, timeout);
  if (!data) throw new Error(`GET_DEVICE(${infoType}) timeout — no response from bootloader`);

  const value = data[0]! | (data[1]! << 8) | (data[2]! << 16) | ((data[3]! << 24) >>> 0);

  // Then read INSYNC + OK
  if (!await getSync(transport, 1000)) {
    throw new Error(`GET_DEVICE(${infoType}) sync failed after reading value`);
  }

  // Return as signed 32-bit (matching Mission Planner's BitConverter.ToInt32)
  return value | 0;
}

/**
 * Erase flash — takes up to 20s
 */
async function chipErase(
  transport: SerialTransport,
  window: BrowserWindow | null
): Promise<void> {
  sendLog(window, 'info', 'Erasing flash (this may take up to 20 seconds)...');

  // Mission Planner bug fix: sync + getInfo before erase
  await transport.write(new Uint8Array([GET_SYNC, EOC]));
  await getSync(transport, 1000);
  await getDeviceInfo(transport, INFO_BL_REV);

  // Send erase command
  await transport.write(new Uint8Array([CHIP_ERASE, EOC]));

  // Wait up to 20s for response
  if (!await getSync(transport, 20000)) {
    throw new Error('Chip erase failed or timed out');
  }

  sendLog(window, 'info', 'Flash erased');
}

/**
 * Program a single multi-byte chunk
 */
async function programMulti(
  transport: SerialTransport,
  data: Uint8Array
): Promise<void> {
  if (data.length > PROG_MULTI_MAX || data.length === 0) {
    throw new Error(`Invalid PROG_MULTI size: ${data.length}`);
  }

  // Format: [PROG_MULTI, length, ...data, EOC]
  const packet = new Uint8Array(2 + data.length + 1);
  packet[0] = PROG_MULTI;
  packet[1] = data.length;
  packet.set(data, 2);
  packet[packet.length - 1] = EOC;

  await transport.write(packet);

  if (!await getSync(transport, 5000)) {
    throw new Error('PROG_MULTI failed — bootloader did not acknowledge write');
  }
}

/**
 * Program entire firmware image in 252-byte chunks
 */
async function programFirmware(
  transport: SerialTransport,
  firmware: Uint8Array,
  window: BrowserWindow | null,
  abortSignal?: AbortSignal
): Promise<void> {
  const totalChunks = Math.ceil(firmware.length / PROG_MULTI_MAX);
  let chunk = 0;

  for (let offset = 0; offset < firmware.length; offset += PROG_MULTI_MAX) {
    if (abortSignal?.aborted) throw new Error('Flash operation aborted');

    const end = Math.min(offset + PROG_MULTI_MAX, firmware.length);
    const data = firmware.slice(offset, end);

    await programMulti(transport, data);
    chunk++;

    const percent = Math.round((chunk / totalChunks) * 100);
    sendProgress(window, {
      state: 'flashing',
      progress: 20 + Math.round(percent * 0.6),
      message: `Writing firmware... ${percent}% (${Math.round(offset / 1024)}/${Math.round(firmware.length / 1024)} KB)`,
      bytesWritten: offset + data.length,
      totalBytes: firmware.length,
    });

    // Small delay between writes to let serial buffers flush
    await new Promise(r => setTimeout(r, 5));

    // Every 64 chunks, log progress
    if (chunk % 64 === 0) {
      sendLog(window, 'info', `Written ${Math.round((offset + data.length) / 1024)} KB...`);
    }
  }
}

/**
 * Verify firmware via CRC32 (bootloader revision >= 3)
 *
 * The bootloader CRCs the entire flash: image bytes + 0xFF padding up to flashSize-1
 * ArduPilot CRC32: polynomial 0xEDB88320, initial value 0 (NOT standard)
 */
async function verifyCrc(
  transport: SerialTransport,
  firmware: Uint8Array,
  flashSize: number,
  window: BrowserWindow | null
): Promise<boolean> {
  sendLog(window, 'info', 'Verifying firmware CRC...');

  // Compute expected CRC: firmware data + 0xFF padding to flashSize - 1
  let expectedCrc = crc32(firmware);

  // Pad remaining space with 0xFF (erased flash value)
  // Mission Planner pads to flashSize - 1, in 4-byte chunks
  const padBlock = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF]);
  for (let i = firmware.length; i < flashSize - 1; i += 4) {
    expectedCrc = crc32(padBlock, expectedCrc);
  }

  // Send GET_CRC command
  await transport.write(new Uint8Array([GET_CRC, EOC]));

  // Read 4-byte CRC from bootloader (may take a moment for large flash)
  const crcData = await readBytes(transport, 4, 10000);
  if (!crcData) throw new Error('CRC verification timeout — no response from bootloader');

  const deviceCrc = (crcData[0]! | (crcData[1]! << 8) | (crcData[2]! << 16) | ((crcData[3]! << 24) >>> 0)) >>> 0;

  if (!await getSync(transport, 1000)) {
    throw new Error('CRC verification sync failed');
  }

  const expectedUnsigned = expectedCrc >>> 0;
  sendLog(window, 'info', `CRC: device=0x${deviceCrc.toString(16).padStart(8, '0')}, expected=0x${expectedUnsigned.toString(16).padStart(8, '0')}`);

  if (deviceCrc !== expectedUnsigned) {
    sendLog(window, 'error', 'CRC MISMATCH — firmware verification failed');
    return false;
  }

  sendLog(window, 'info', 'CRC verified — firmware matches');
  return true;
}

/**
 * Reboot the board back into the application
 */
async function reboot(transport: SerialTransport, window: BrowserWindow | null): Promise<void> {
  sendLog(window, 'info', 'Rebooting into application...');
  try {
    await transport.write(new Uint8Array([REBOOT, EOC]));
    await transport.discardInBuffer();
  } catch {
    // Reboot may cause the port to disconnect — that's expected
  }
}

/**
 * Reboot into bootloader via NSH shell (fallback method from uploader.py)
 * Opens serial, sends '\r\r\r' to get an NSH prompt, then 'reboot -b\n' to enter bootloader.
 * This works when MAVLink reboot fails (e.g. board not in MAVLink mode).
 */
async function rebootToBootloaderNsh(
  port: string,
  window: BrowserWindow | null,
): Promise<boolean> {
  let transport: SerialTransport | null = null;
  try {
    transport = new SerialTransport(port, {
      baudRate: 115200,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
    });
    await transport.open();

    // Send carriage returns to get NSH prompt (like uploader.py)
    sendLog(window, 'info', 'NSH: sending prompt request...');
    await transport.write(new Uint8Array([0x0D, 0x0D, 0x0D])); // \r\r\r
    await new Promise(r => setTimeout(r, 500));

    // Send 'reboot -b\n' to reboot into bootloader
    sendLog(window, 'info', 'NSH: sending reboot -b...');
    const cmd = new TextEncoder().encode('reboot -b\n');
    await transport.write(cmd);
    await new Promise(r => setTimeout(r, 200));

    await transport.close();
    transport = null;
    return true;
  } catch {
    if (transport) {
      await transport.close().catch(() => {});
    }
    return false;
  }
}

/**
 * Flash firmware using ArduPilot's custom serial bootloader protocol
 *
 * @param firmwarePath Path to .apj or .bin firmware file
 * @param board Detected board info (must have port)
 * @param window BrowserWindow for progress/log IPC
 * @param abortController Optional abort controller
 * @param options Flash options
 */
export async function flashWithArduPilotBootloader(
  firmwarePath: string,
  board: DetectedBoard,
  window: BrowserWindow | null,
  abortController?: AbortController,
  options?: FlashOptions
): Promise<FlashResult> {
  const startTime = Date.now();
  let transport: SerialTransport | null = null;

  if (!board.port) {
    return {
      success: false,
      error: 'No serial port specified for ArduPilot bootloader flash',
      duration: Date.now() - startTime,
    };
  }

  if (!acquireFlashLock('ardupilot')) {
    return {
      success: false,
      error: 'Another flash operation is already in progress. Please wait for it to complete.',
      duration: Date.now() - startTime,
    };
  }

  sendLog(window, 'info', `Starting ArduPilot bootloader flash: ${firmwarePath}`);
  sendLog(window, 'info', `Port: ${board.port}, Board: ${board.name}`);

  try {
    // Step 1: Load firmware
    sendProgress(window, {
      state: 'preparing',
      progress: 0,
      message: 'Loading firmware file...',
    });

    let firmware: Uint8Array;
    let apjBoardId: number | undefined;

    if (firmwarePath.toLowerCase().endsWith('.apj')) {
      const apj = await parseApjFile(firmwarePath);
      firmware = apj.image;
      apjBoardId = apj.boardId;
      sendLog(window, 'info', `APJ firmware: board_id=${apj.boardId}, image_size=${apj.imageSize}, padded=${firmware.length}`);
    } else {
      // Raw .bin file
      const buf = await fs.readFile(firmwarePath);
      firmware = new Uint8Array(buf);
      // Pad to 4-byte alignment
      if (firmware.length % 4 !== 0) {
        const padded = new Uint8Array(firmware.length + (4 - (firmware.length % 4)));
        padded.set(firmware);
        firmware = padded;
      }
      sendLog(window, 'info', `Binary firmware: ${firmware.length} bytes`);
    }

    if (abortController?.signal.aborted) {
      sendLog(window, 'warn', 'Flash aborted by user');
      return { success: false, error: 'Aborted', duration: Date.now() - startTime };
    }

    // Step 2: Reboot board into bootloader if needed
    // ArduPilot boards detected via VID/PID are running application firmware, NOT bootloader.
    // We must reboot them into bootloader mode first (same as Mission Planner / uploader.py).
    const needsReboot = !options?.noRebootSequence && !board.inBootloader;
    if (needsReboot) {
      sendProgress(window, {
        state: 'entering-bootloader',
        progress: 3,
        message: 'Rebooting board into bootloader mode...',
      });

      // Try MAVLink reboot command first (works on all ArduPilot boards)
      sendLog(window, 'info', 'Sending MAVLink reboot-to-bootloader command...');
      const rebooted = await rebootToBootloaderMavlink(board.port);
      if (rebooted) {
        sendLog(window, 'info', 'Reboot command sent, waiting for bootloader to start...');
        await new Promise(r => setTimeout(r, 3000));
      } else {
        // Fallback: NSH shell reboot (like uploader.py does)
        sendLog(window, 'info', 'MAVLink reboot failed, trying NSH shell reboot...');
        const nshRebooted = await rebootToBootloaderNsh(board.port, window);
        if (nshRebooted) {
          sendLog(window, 'info', 'NSH reboot sent, waiting for bootloader to start...');
          await new Promise(r => setTimeout(r, 3000));
        } else {
          sendLog(window, 'warn', 'All reboot methods failed — board may already be in bootloader');
        }
      }
    } else if (options?.noRebootSequence) {
      sendLog(window, 'info', 'Skipping reboot — assuming board is already in bootloader');
    }

    // Step 3: Connect to bootloader
    sendProgress(window, {
      state: 'preparing',
      progress: 5,
      message: 'Connecting to ArduPilot bootloader...',
    });

    // ArduPilot bootloader uses 115200 8N1 (NOT 8E1 like STM32 ROM bootloader)
    transport = new SerialTransport(board.port, {
      baudRate: 115200,
      dataBits: 8,
      parity: 'none',
      stopBits: 1,
    });

    await transport.open();
    sendLog(window, 'info', 'Serial port opened at 115200 8N1');

    // Step 4: Sync with bootloader
    sendProgress(window, {
      state: 'preparing',
      progress: 8,
      message: 'Synchronizing with bootloader...',
    });

    let synced = await ardupilotSync(transport, window);
    if (!synced) {
      // If initial sync fails, the board may not be in bootloader mode yet.
      // Try rebooting into bootloader and syncing again.
      sendLog(window, 'warn', 'Initial sync failed, attempting bootloader reboot...');
      await transport.close();
      transport = null;

      // Try MAVLink reboot (works even without prior connection)
      sendLog(window, 'info', 'Attempting MAVLink reboot to bootloader...');
      let rebooted = await rebootToBootloaderMavlink(board.port);
      if (!rebooted) {
        sendLog(window, 'info', 'Attempting NSH shell reboot to bootloader...');
        rebooted = await rebootToBootloaderNsh(board.port, window);
      }

      if (rebooted) {
        sendLog(window, 'info', 'Reboot sent, waiting for bootloader...');
        await new Promise(r => setTimeout(r, 4000));
      } else {
        // No reboot method worked, wait a bit in case bootloader is still starting
        await new Promise(r => setTimeout(r, 2000));
      }

      transport = new SerialTransport(board.port, {
        baudRate: 115200,
        dataBits: 8,
        parity: 'none',
        stopBits: 1,
      });
      await transport.open();

      synced = await ardupilotSync(transport, window, 5);
      if (!synced) {
        return {
          success: false,
          error: `Could not connect to ArduPilot bootloader on ${board.port}.\n\nMake sure:\n1. The board is running ArduPilot firmware (not Betaflight/iNav)\n2. The board has the ArduPilot bootloader installed\n3. No other application is using the serial port\n\nIf the board does not respond, try disconnecting and reconnecting USB.`,
          duration: Date.now() - startTime,
        };
      }
    }

    if (abortController?.signal.aborted) {
      sendLog(window, 'warn', 'Flash aborted by user');
      return { success: false, error: 'Aborted', duration: Date.now() - startTime };
    }

    // Step 5: Get device info
    sendProgress(window, {
      state: 'preparing',
      progress: 10,
      message: 'Reading board info...',
    });

    const blRev = await getDeviceInfo(transport, INFO_BL_REV);
    const boardId = await getDeviceInfo(transport, INFO_BOARD_ID);
    const boardRev = await getDeviceInfo(transport, INFO_BOARD_REV);
    const flashSize = await getDeviceInfo(transport, INFO_FLASH_SIZE);

    sendLog(window, 'info', `Bootloader rev: ${blRev}`);
    sendLog(window, 'info', `Board ID: ${boardId}, Board rev: ${boardRev}`);
    sendLog(window, 'info', `Flash size: ${flashSize} bytes (${Math.round(flashSize / 1024)} KB)`);

    // Validate bootloader revision
    if (blRev < 2 || blRev > 20) {
      sendLog(window, 'error', `Unsupported bootloader revision: ${blRev} (expected 2-20)`);
      return {
        success: false,
        error: `Unsupported bootloader revision: ${blRev} (expected 2-20)`,
        duration: Date.now() - startTime,
      };
    }

    // Validate board ID matches APJ (if available)
    if (apjBoardId !== undefined && apjBoardId !== 0 && apjBoardId !== boardId) {
      sendLog(window, 'error', `Board ID mismatch: firmware board_id=${apjBoardId}, device board_id=${boardId}`);
      return {
        success: false,
        error: `Board ID mismatch: firmware is for board ${apjBoardId}, but connected board reports ID ${boardId}.\n\nPlease select the correct firmware for your board.`,
        duration: Date.now() - startTime,
      };
    }

    // Validate firmware fits in flash
    if (firmware.length > flashSize) {
      sendLog(window, 'error', `Firmware too large: ${firmware.length} bytes > flash ${flashSize} bytes`);
      return {
        success: false,
        error: `Firmware too large: ${Math.round(firmware.length / 1024)} KB, but board flash is ${Math.round(flashSize / 1024)} KB`,
        duration: Date.now() - startTime,
      };
    }

    if (abortController?.signal.aborted) {
      sendLog(window, 'warn', 'Flash aborted by user');
      return { success: false, error: 'Aborted', duration: Date.now() - startTime };
    }

    // Step 6: Erase flash
    sendProgress(window, {
      state: 'erasing',
      progress: 12,
      message: 'Erasing flash...',
    });

    await chipErase(transport, window);

    if (abortController?.signal.aborted) {
      sendLog(window, 'warn', 'Flash aborted by user');
      return { success: false, error: 'Aborted', duration: Date.now() - startTime };
    }

    // Step 7: Program firmware
    sendProgress(window, {
      state: 'flashing',
      progress: 20,
      message: 'Writing firmware...',
    });

    await programFirmware(transport, firmware, window, abortController?.signal);

    sendLog(window, 'info', `Firmware written: ${firmware.length} bytes`);

    // Step 8: Verify CRC (bootloader rev >= 3)
    let verified = false;
    if (blRev >= 3) {
      sendProgress(window, {
        state: 'verifying',
        progress: 85,
        message: 'Verifying firmware CRC...',
      });

      verified = await verifyCrc(transport, firmware, flashSize, window);
      if (!verified) {
        return {
          success: false,
          error: 'Firmware CRC verification failed — the written data does not match. Please try again.',
          duration: Date.now() - startTime,
          verified: false,
        };
      }
    } else {
      sendLog(window, 'info', `Bootloader rev ${blRev} does not support CRC verification — skipping`);
    }

    // Step 9: Reboot
    sendProgress(window, {
      state: 'rebooting',
      progress: 95,
      message: 'Rebooting board...',
    });

    await reboot(transport, window);
    await transport.close();
    transport = null;

    sendProgress(window, {
      state: 'complete',
      progress: 100,
      message: 'Flash complete!',
    });

    const duration = Date.now() - startTime;
    sendLog(window, 'info', `Flash complete in ${(duration / 1000).toFixed(1)}s`);

    return {
      success: true,
      message: 'Firmware flashed successfully via ArduPilot bootloader',
      duration,
      verified,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendLog(window, 'error', `ArduPilot flash failed: ${message}`);
    return {
      success: false,
      error: message,
      duration: Date.now() - startTime,
    };
  } finally {
    releaseFlashLock();

    if (transport) {
      try {
        await transport.close();
      } catch {
        // Ignore close errors
      }
    }
  }
}
