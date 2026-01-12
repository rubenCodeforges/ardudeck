/**
 * MSP (MultiWii Serial Protocol) Detector
 * Detects Betaflight/iNav/Cleanflight boards via MSP protocol
 */

import { SerialTransport } from '@ardudeck/comms';

// MSP command IDs
const MSP_FC_VARIANT = 2;
const MSP_FC_VERSION = 3;
const MSP_BOARD_INFO = 4;
const MSP_SET_REBOOT = 68;

// Reboot types (from Betaflight)
const REBOOT_FIRMWARE = 0;
const REBOOT_BOOTLOADER_ROM = 1;   // Enter ROM bootloader (DFU via native USB)
const REBOOT_MSC = 2;              // Mass Storage Class mode
const REBOOT_MSC_UTC = 3;          // MSC with UTC time
const REBOOT_BOOTLOADER_FLASH = 4; // Enter flash bootloader (custom bootloader)

export interface MSPBoardInfo {
  fcVariant: string;      // "BTFL" = Betaflight, "INAV" = iNav, "CLFL" = Cleanflight
  fcVersion: string;      // e.g., "4.5.1"
  boardId: string;        // e.g., "SPRACINGH7"
  boardName?: string;     // Human readable name
  targetName?: string;    // Build target name
  apiVersion?: string;
}

/**
 * Calculate MSP checksum (XOR of all bytes)
 */
function mspChecksum(data: number[]): number {
  return data.reduce((a, b) => a ^ b, 0);
}

/**
 * Build MSP v1 request packet
 */
function buildMspRequest(command: number): Uint8Array {
  const data = [0, command]; // length=0, command
  const checksum = mspChecksum(data);
  const packet = new Uint8Array([
    0x24, 0x4D, 0x3C, // $M<
    0,                 // payload length
    command,
    checksum
  ]);
  return packet;
}

/**
 * Parse MSP response
 */
function parseMspResponse(buffer: Uint8Array): { command: number; payload: Uint8Array } | null {
  // Find $M> header
  let headerIdx = -1;
  for (let i = 0; i < buffer.length - 5; i++) {
    if (buffer[i] === 0x24 && buffer[i + 1] === 0x4D && buffer[i + 2] === 0x3E) {
      headerIdx = i;
      break;
    }
  }

  if (headerIdx === -1) return null;

  const length = buffer[headerIdx + 3];
  const command = buffer[headerIdx + 4];

  if (headerIdx + 5 + length >= buffer.length) return null;

  const payload = buffer.slice(headerIdx + 5, headerIdx + 5 + length);
  return { command, payload };
}

/**
 * Query MSP board info
 */
export async function queryMSPBoard(port: string, baudRate: number = 115200): Promise<MSPBoardInfo | null> {
  let transport: SerialTransport | null = null;

  try {
    transport = new SerialTransport(port, { baudRate });
    await transport.open();

    let rxBuffer = Buffer.alloc(0);
    const result: MSPBoardInfo = {
      fcVariant: '',
      fcVersion: '',
      boardId: '',
    };
    let gotVariant = false;
    let gotVersion = false;
    let gotBoardInfo = false;

    return await Promise.race([
      new Promise<MSPBoardInfo | null>((resolve) => {
        const handler = (data: Uint8Array) => {
          rxBuffer = Buffer.concat([rxBuffer, Buffer.from(data)]);

          // Try to parse responses
          const response = parseMspResponse(new Uint8Array(rxBuffer));
          if (response) {
            const { command, payload } = response;

            if (command === MSP_FC_VARIANT && payload.length >= 4) {
              result.fcVariant = String.fromCharCode(...payload.slice(0, 4));
              gotVariant = true;
            } else if (command === MSP_FC_VERSION && payload.length >= 3) {
              result.fcVersion = `${payload[0]}.${payload[1]}.${payload[2]}`;
              gotVersion = true;
            } else if (command === MSP_BOARD_INFO && payload.length >= 4) {
              result.boardId = String.fromCharCode(...payload.slice(0, 4)).trim();
              if (payload.length > 4) {
                const nameLength = payload[4];
                if (nameLength && nameLength > 0 && payload.length >= 5 + nameLength) {
                  result.boardName = String.fromCharCode(...payload.slice(5, 5 + nameLength));
                }
              }
              gotBoardInfo = true;
            }

            if (gotVariant && gotVersion && gotBoardInfo) {
              transport?.off('data', handler);
              transport?.close().catch(() => {});
              resolve(result);
            }
            rxBuffer = Buffer.alloc(0);
          }
        };

        transport!.on('data', handler);

        // Send MSP requests with small delays
        const requests = [
          buildMspRequest(MSP_FC_VARIANT),
          buildMspRequest(MSP_FC_VERSION),
          buildMspRequest(MSP_BOARD_INFO),
        ];

        let idx = 0;
        const sendNext = async () => {
          if (idx < requests.length && transport) {
            await transport.write(requests[idx]!);
            idx++;
            setTimeout(sendNext, 50);
          }
        };
        sendNext().catch(() => {});
      }),
      // Timeout after 2 seconds
      new Promise<MSPBoardInfo | null>((resolve) => {
        setTimeout(async () => {
          await transport?.close().catch(() => {});
          if (gotVariant || gotBoardInfo) {
            resolve(result);
          } else {
            resolve(null);
          }
        }, 2000);
      }),
    ]);
  } catch {
    await transport?.close().catch(() => {});
    return null;
  }
}

/**
 * Map MSP board ID to ArduPilot-compatible board name
 */
export function mapMspBoardToArduPilot(mspBoardId: string): string | null {
  const upperBoardId = mspBoardId.toUpperCase();

  // Exact matches first (full board ID)
  const exactMapping: Record<string, string> = {
    // SPRacing F3 variants
    'SRF3': 'SPRacingF3',
    'SPRF3': 'SPRacingF3',
    'SPF3': 'SPRacingF3',
    'SPRACINGF3': 'SPRacingF3',
    // SPRacing H7 variants
    'SRH7': 'SPRacingH7',
    'SPRH7': 'SPRacingH7',
    'SPH7': 'SPRacingH7',
    'SPRACINGH7': 'SPRacingH7',
    // SPRacing F4 variants
    'SRF4': 'SPRacingF4',
    'SPRF4': 'SPRacingF4',
    'SPF4': 'SPRacingF4',
    'SPRACINGF4': 'SPRacingF4',
  };

  if (exactMapping[upperBoardId]) {
    return exactMapping[upperBoardId];
  }

  // Prefix-based mapping (4 chars)
  const prefixMapping: Record<string, string> = {
    // SPRacing
    'SPRA': 'SPRacingH7',

    // SpeedyBee
    'SBF4': 'speedybeef4',
    'SBF7': 'SpeedyBeeF7V3',
    'SF40': 'SpeedyBeeF405Wing',
    'SPED': 'speedybeef4',

    // Matek
    'MTK4': 'MatekF405',
    'MTK7': 'MatekH743',
    'MTWG': 'MatekF405-Wing',
    'MATE': 'MatekF405',

    // Kakute
    'KKF4': 'KakuteF4',
    'KKF7': 'KakuteF7',
    'KKH7': 'KakuteH7',
    'KAKU': 'KakuteF7',

    // Generic mappings
    'OMNI': 'omnibusf4',
    'FFLY': 'FlywooF745',
    'FLYW': 'FlywooF745',
  };

  const prefix = upperBoardId.substring(0, 4);
  return prefixMapping[prefix] || null;
}

/**
 * Get firmware type name from FC variant
 */
export function getFirmwareTypeName(fcVariant: string): string {
  const names: Record<string, string> = {
    'BTFL': 'Betaflight',
    'INAV': 'iNav',
    'CLFL': 'Cleanflight',
    'EMUF': 'EmuFlight',
    'QUIK': 'Quicksilver',
  };
  return names[fcVariant] || fcVariant;
}

/**
 * Build MSP v1 request packet with payload
 */
function buildMspRequestWithPayload(command: number, payload: number[]): Uint8Array {
  const data = [payload.length, command, ...payload];
  const checksum = mspChecksum(data);
  const packet = new Uint8Array([
    0x24, 0x4D, 0x3C, // $M<
    payload.length,
    command,
    ...payload,
    checksum
  ]);
  return packet;
}

/**
 * Reboot into DFU/bootloader mode via MSP
 * This sends MSP_SET_REBOOT with bootloader flag
 * @param port Serial port path
 * @param baudRate Baud rate (default 115200)
 * @param useFlashBootloader Use flash bootloader (4) instead of ROM/DFU (1). Try this for serial boards.
 */
export async function rebootToBootloader(
  port: string,
  baudRate: number = 115200,
  useFlashBootloader: boolean = false
): Promise<boolean> {
  let transport: SerialTransport | null = null;

  const rebootType = useFlashBootloader ? REBOOT_BOOTLOADER_FLASH : REBOOT_BOOTLOADER_ROM;
  const rebootTypeName = useFlashBootloader ? 'FLASH bootloader' : 'ROM bootloader (DFU)';

  try {
    transport = new SerialTransport(port, { baudRate });
    await transport.open();

    // Send MSP_SET_REBOOT with specified bootloader type
    const rebootPacket = buildMspRequestWithPayload(MSP_SET_REBOOT, [rebootType]);
    await transport.write(rebootPacket);

    // Give it a moment to process
    await new Promise(resolve => setTimeout(resolve, 100));

    // Close port before board reboots
    await transport.close();
    transport = null;


    // Wait for board to reboot - typically takes 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, 2000));

    return true;
  } catch (error) {
    console.error('[MSP] Failed to reboot to bootloader:', error);
    if (transport) {
      await transport.close().catch(() => {});
    }
    return false;
  }
}
