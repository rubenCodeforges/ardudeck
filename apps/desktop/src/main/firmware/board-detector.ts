/**
 * Board Detector
 * Enumerates serial ports and matches against known board VID/PID.
 * Uses listSerialPorts() from @ardudeck/comms (wraps the serialport npm library)
 * instead of platform-specific CLI commands for reliable cross-platform detection.
 *
 * Any board with a serial port is detectable — KNOWN_BOARDS provides enrichment
 * (nicer names, flasher hints), but unmatched ports are still included as candidates
 * for auto-detection via MAVLink/MSP.
 */

import { listSerialPorts } from '@ardudeck/comms';
import { KNOWN_BOARDS, type DetectedBoard } from '../../shared/firmware-types.js';
import { detectSTM32Chip } from './stm32-bootloader.js';

/**
 * Detect connected flight controller boards by enumerating serial ports
 * and matching VID/PID against KNOWN_BOARDS.
 *
 * Flow:
 * 1. List all serial ports (with VID/PID metadata from serialport library)
 * 2. For each port with VID/PID, look up KNOWN_BOARDS
 * 3. If match → create DetectedBoard from KNOWN_BOARDS entry
 * 4. If no match but VID is 1209 (ArduPilot pid.codes) → create ArduPilot ChibiOS entry
 * 5. If no match at all → include as unidentified board for auto-detection
 * 6. Ports without VID/PID (e.g. Bluetooth, built-in) are skipped
 */
export async function detectBoards(): Promise<DetectedBoard[]> {
  const ports = await listSerialPorts();
  const detectedBoards: DetectedBoard[] = [];

  // Deduplicate by VID:PID — composite USB devices may enumerate multiple serial
  // interfaces (e.g. MAVLink + SLCAN) sharing the same VID:PID.
  // Keep the first port path encountered per VID:PID pair.
  const seenVidPid = new Set<string>();

  for (const port of ports) {
    // Skip ports without VID/PID — these are typically built-in serial ports,
    // Bluetooth SPP, or virtual ports that aren't USB flight controllers
    if (!port.vendorId || !port.productId) continue;

    const vid = port.vendorId.toLowerCase();
    const pid = port.productId.toLowerCase();
    const key = `${vid}:${pid}`;

    // Deduplicate composite USB devices
    if (seenVidPid.has(key)) continue;
    seenVidPid.add(key);

    // Look up in KNOWN_BOARDS
    let knownBoard = KNOWN_BOARDS[key];

    // Fallback: VID 0x1209 is ArduPilot's registered pid.codes vendor ID.
    // Any device with this VID is an ArduPilot ChibiOS board, even with unknown PIDs.
    if (!knownBoard && vid === '1209') {
      knownBoard = {
        name: port.manufacturer || port.friendlyName || 'ArduPilot ChibiOS',
        boardId: 'ChibiOS',
        mcuType: 'STM32',
        flasher: 'ardupilot',
        inBootloader: false,
      };
    }

    if (knownBoard) {
      // Matched via KNOWN_BOARDS or ArduPilot VID fallback
      const board: DetectedBoard = {
        name: knownBoard.name || port.friendlyName || port.manufacturer || 'Unknown Board',
        boardId: knownBoard.boardId || key,
        mcuType: knownBoard.mcuType || 'Unknown',
        flasher: knownBoard.flasher || 'dfu',
        port: port.path,
        usbVid: parseInt(vid, 16),
        usbPid: parseInt(pid, 16),
        inBootloader: knownBoard.inBootloader || false,
        detectionMethod: 'vid-pid',
      };

      // If board has COM port but unknown MCU, try STM32 bootloader query
      if (board.mcuType === 'Unknown') {
        try {
          const stm32Result = await detectSTM32Chip(port.path);
          if (stm32Result) {
            board.chipId = stm32Result.chipId;
            board.detectedMcu = stm32Result.chipInfo?.mcu;
            board.mcuType = stm32Result.chipInfo?.mcu || board.mcuType;
            board.detectionMethod = 'bootloader';
            board.inBootloader = true;

            if (stm32Result.chipInfo) {
              board.name = `${knownBoard.name?.split(' (')[0]} → ${stm32Result.chipInfo.mcu}`;
            }

            if (stm32Result.chipInfo?.family) {
              board.flasher = 'dfu';
            }
          }
        } catch {
          // Bootloader query failed, continue with VID/PID info only
        }
      }

      detectedBoards.push(board);
    } else {
      // No match in KNOWN_BOARDS and not ArduPilot VID — include as unidentified
      // board so the auto-detect step can probe it via MAVLink/MSP
      const board: DetectedBoard = {
        name: port.friendlyName || port.manufacturer || `USB Serial (${key})`,
        boardId: 'unknown',
        mcuType: 'Unknown',
        flasher: 'unknown',
        port: port.path,
        usbVid: parseInt(vid, 16),
        usbPid: parseInt(pid, 16),
        inBootloader: false,
        detectionMethod: 'vid-pid',
      };

      detectedBoards.push(board);
    }
  }

  return detectedBoards;
}

/**
 * Check if a specific board is in DFU/bootloader mode
 */
export async function isInBootloaderMode(board: DetectedBoard): Promise<boolean> {
  // STM32 DFU mode has specific VID/PID
  if (board.usbVid === 0x0483 && board.usbPid === 0xdf11) {
    return true;
  }

  // Check known boards
  const key = `${board.usbVid?.toString(16).padStart(4, '0')}:${board.usbPid?.toString(16).padStart(4, '0')}`;
  const knownBoard = KNOWN_BOARDS[key];

  return knownBoard?.inBootloader || false;
}

/**
 * Get list of all known board types (for UI display)
 */
export function getKnownBoards(): Array<{ key: string; name: string; mcu: string; flasher: string }> {
  return Object.entries(KNOWN_BOARDS)
    .filter(([, board]) => !board.inBootloader) // Don't show bootloader entries
    .map(([key, board]) => ({
      key,
      name: board.name || 'Unknown',
      mcu: board.mcuType || 'Unknown',
      flasher: board.flasher || 'dfu',
    }));
}
