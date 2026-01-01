/**
 * STM32 Bootloader Chip ID Detection
 *
 * Queries the STM32 USART bootloader to detect the chip type.
 * This works when a serial adapter (CP2102, FTDI, etc.) is connected to
 * an STM32 flight controller and the FC is in bootloader mode.
 *
 * Protocol reference: STM32 AN2606 (System memory boot mode)
 *
 * Bootloader entry typically requires:
 * - BOOT0 pin high during reset
 * - Or specific bootloader entry command from running firmware
 */

import { SerialTransport } from '@ardudeck/comms';
import { getSTM32ChipInfo, type STM32ChipInfo } from '../../shared/firmware-types.js';

// STM32 USART bootloader constants
const STM32_SYNC = 0x7f;        // Sync byte to start communication
const STM32_ACK = 0x79;         // Acknowledgment
const STM32_NACK = 0x1f;        // Negative acknowledgment

// Bootloader commands
const CMD_GET = 0x00;           // Get bootloader version and supported commands
const CMD_GET_VERSION = 0x01;   // Get bootloader protocol version
const CMD_GET_ID = 0x02;        // Get chip ID
const CMD_READ_MEMORY = 0x11;   // Read from memory
const CMD_GO = 0x21;            // Jump to user code
const CMD_WRITE_MEMORY = 0x31;  // Write to memory
const CMD_ERASE = 0x43;         // Erase flash (standard)
const CMD_EXTENDED_ERASE = 0x44;// Extended erase (for larger flash)

// Timeouts
const SYNC_TIMEOUT_MS = 500;    // Time to wait for bootloader sync
const CMD_TIMEOUT_MS = 200;     // Time to wait for command response

/**
 * Result of STM32 bootloader query
 */
export interface STM32BootloaderResult {
  chipId: number;
  chipInfo: STM32ChipInfo | null;
  bootloaderVersion?: number;
  protocolVersion?: number;
}

/**
 * Calculate XOR checksum (complement)
 */
function calcChecksum(data: number[]): number {
  let checksum = 0;
  for (const byte of data) {
    checksum ^= byte;
  }
  return checksum ^ 0xff;
}

/**
 * Wait for a single byte with timeout
 */
async function waitForByte(transport: SerialTransport, timeoutMs: number): Promise<number | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const byte = await transport.readByte();
    if (byte >= 0) {
      return byte;
    }
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  return null;
}

/**
 * Send command and wait for ACK
 */
async function sendCommand(transport: SerialTransport, cmd: number): Promise<boolean> {
  // STM32 bootloader expects command + complement
  const checksum = cmd ^ 0xff;
  await transport.write(new Uint8Array([cmd, checksum]));

  const ack = await waitForByte(transport, CMD_TIMEOUT_MS);
  return ack === STM32_ACK;
}

/**
 * Attempt to sync with STM32 bootloader
 *
 * The bootloader auto-detects baud rate from the sync byte (0x7F).
 * We try multiple times as the first attempt may fail.
 */
async function syncWithBootloader(transport: SerialTransport): Promise<boolean> {
  // Try syncing a few times
  for (let attempt = 0; attempt < 3; attempt++) {
    await transport.discardInBuffer();
    await transport.write(new Uint8Array([STM32_SYNC]));

    const response = await waitForByte(transport, SYNC_TIMEOUT_MS);

    if (response === STM32_ACK) {
      return true;
    }

    if (response === STM32_NACK) {
      // Bootloader responded but rejected - might already be synced
      // Try sending a GET command to verify
      if (await sendCommand(transport, CMD_GET)) {
        // Read and discard the response
        await new Promise(resolve => setTimeout(resolve, 50));
        await transport.discardInBuffer();
        return true;
      }
    }

    // Wait before retry
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * Query STM32 chip ID via bootloader
 *
 * @param port Serial port path (e.g., "COM4" or "/dev/ttyUSB0")
 * @param baudRate Baud rate (default 115200, but 57600 also common)
 * @returns Chip ID result or null if detection failed
 */
export async function querySTM32ChipId(
  port: string,
  baudRate: number = 115200
): Promise<STM32BootloaderResult | null> {
  // STM32 bootloader requires 8E1 (8 data bits, Even parity, 1 stop bit)
  const transport = new SerialTransport(port, {
    baudRate,
    dataBits: 8,
    parity: 'even',
    stopBits: 1,
    dtrEnable: false,  // Don't toggle DTR (might reset FC)
    rtsEnable: false,
    readTimeout: 1000,
    writeTimeout: 1000,
  });

  try {
    await transport.open();

    // Clear any pending data
    await transport.discardInBuffer();

    // Try to sync with bootloader
    const synced = await syncWithBootloader(transport);
    if (!synced) {
      return null;
    }

    // Send GET_ID command
    if (!await sendCommand(transport, CMD_GET_ID)) {
      return null;
    }

    // Response format: [length] [chip_id_high] [chip_id_low] [ACK]
    const length = await waitForByte(transport, CMD_TIMEOUT_MS);
    if (length === null) {
      return null;
    }

    const idHigh = await waitForByte(transport, CMD_TIMEOUT_MS);
    const idLow = await waitForByte(transport, CMD_TIMEOUT_MS);

    if (idHigh === null || idLow === null) {
      return null;
    }

    // Wait for final ACK
    const finalAck = await waitForByte(transport, CMD_TIMEOUT_MS);
    if (finalAck !== STM32_ACK) {
      // Some bootloaders don't send final ACK, continue anyway
    }

    const chipId = (idHigh << 8) | idLow;
    const chipInfo = getSTM32ChipInfo(chipId);

    return {
      chipId,
      chipInfo,
    };

  } catch (error) {
    // Silently fail - bootloader detection is optional
    console.debug('STM32 bootloader query failed:', error);
    return null;
  } finally {
    try {
      await transport.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Try to detect STM32 chip using multiple baud rates
 */
export async function detectSTM32Chip(port: string): Promise<STM32BootloaderResult | null> {
  // Try common bootloader baud rates
  const baudRates = [115200, 57600, 38400, 19200, 9600];

  for (const baudRate of baudRates) {
    const result = await querySTM32ChipId(port, baudRate);
    if (result) {
      return result;
    }
  }

  return null;
}

/**
 * Check if an FC on a serial port is in bootloader mode
 * by attempting to query its chip ID
 */
export async function isSTM32InBootloader(port: string): Promise<boolean> {
  const result = await querySTM32ChipId(port, 115200);
  return result !== null;
}
