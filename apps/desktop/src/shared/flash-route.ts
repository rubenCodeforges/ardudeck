import type { DetectedBoard } from './firmware-types.js';

export type FlashRoute = 'ardupilot' | 'dfu' | 'serial' | 'avrdude' | 'unsupported';

/** Which flasher a board and image go through. The FIRMWARE_FLASH handler and the Flash screen both read this. */
export function flashRoute(board: Pick<DetectedBoard, 'flasher' | 'detectionMethod' | 'port' | 'usbVid'>, firmwarePath: string): FlashRoute {
  const isApj = firmwarePath.toLowerCase().endsWith('.apj');
  const isArduPilotBoard = board.flasher === 'ardupilot' || board.detectionMethod === 'mavlink';
  // .apj only hints ArduPilot on an unidentified board, never on an MSP one (iNav/Betaflight lack its bootloader).
  const apjOnUnidentified = isApj && board.detectionMethod !== 'msp';
  if (board.port && (isArduPilotBoard || apjOnUnidentified)) return 'ardupilot';

  const hasSerialPort = !!board.port && (board.detectionMethod === 'msp' || board.detectionMethod === 'bootloader');
  if (hasSerialPort) {
    const vid = board.usbVid;
    if (vid === 0x0483) return 'dfu';
    if (vid === 0x10c4 || vid === 0x0403 || vid === 0x1a86 || board.detectionMethod === 'bootloader') return 'serial';
    return 'dfu';
  }
  if (board.flasher === 'dfu' || board.flasher === 'ardupilot') return 'dfu';
  if (board.flasher === 'avrdude') return 'avrdude';
  if (board.flasher === 'serial' && board.port) return 'serial';
  return 'unsupported';
}

/** An image that carries its own bootloader, so a full erase does not leave the board without one. */
export function hasBootloaderImage(firmwarePath: string): boolean {
  return /_with_bl\.hex$/i.test(firmwarePath);
}

// The ArduPilot bootloader erases only the app area; ROM serial always mass-erases; DFU mass erase also removes the bootloader.
export type FullEraseMode = 'unavailable' | 'always' | 'optional' | 'needs-bl-image';

export function fullEraseMode(route: FlashRoute, firmwarePath: string): FullEraseMode {
  if (route === 'serial') return 'always';
  if (route === 'dfu') return hasBootloaderImage(firmwarePath) ? 'optional' : 'needs-bl-image';
  return 'unavailable';
}
