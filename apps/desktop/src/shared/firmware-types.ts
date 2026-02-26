/**
 * Firmware Flash Types
 * Types for board detection, firmware sources, and flash operations
 */

// Supported firmware sources
export type FirmwareSource = 'ardupilot' | 'px4' | 'betaflight' | 'inav' | 'custom';

// Vehicle types (matches SettingsVehicleType)
export type FirmwareVehicleType = 'copter' | 'plane' | 'vtol' | 'rover' | 'boat' | 'sub';

// Release type
export type ReleaseType = 'stable' | 'beta' | 'dev';

// Flasher type based on MCU
export type FlasherType = 'dfu' | 'avrdude' | 'serial' | 'ardupilot';

// Detection method for board identification
export type DetectionMethod = 'vid-pid' | 'bootloader' | 'mavlink' | 'msp' | 'dfu' | 'manual';

/**
 * Detected board info from USB enumeration
 */
export interface DetectedBoard {
  name: string;                    // e.g., "CubeOrange", "SpeedyBee F405"
  boardId: string;                 // Unique identifier for firmware lookup
  mcuType: string;                 // e.g., "STM32H743", "ATmega2560"
  flasher: FlasherType;            // Which tool to use for flashing
  bootloaderVersion?: string;      // e.g., "v1.2"
  currentFirmware?: string;        // e.g., "ArduCopter V4.5.1"
  port?: string;                   // COM port or USB path
  usbVid?: number;                 // USB Vendor ID
  usbPid?: number;                 // USB Product ID
  flashSize?: number;              // Flash size in bytes
  inBootloader: boolean;           // Is board in bootloader mode?

  // Chip detection (from STM32 bootloader query)
  chipId?: number;                 // Raw chip ID (e.g., 0x0450)
  detectedMcu?: string;            // Parsed MCU (e.g., "STM32H743")
  detectionMethod?: DetectionMethod; // How the board was identified
}

/**
 * Firmware version info from manifest
 */
export interface FirmwareVersion {
  version: string;                 // e.g., "4.5.1"
  releaseType: ReleaseType;
  releaseDate: string;             // ISO date string
  releaseNotes?: string;
  downloadUrl: string;
  fileSize?: number;               // Bytes
  gitHash?: string;
  vehicleType?: string;            // e.g., "Copter", "Plane"
  boardId?: string;                // Target board
}

/**
 * Flash operation state
 */
export type FlashState =
  | 'idle'
  | 'detecting'
  | 'fetching-manifest'
  | 'downloading'
  | 'preparing'
  | 'entering-bootloader'
  | 'erasing'
  | 'flashing'
  | 'verifying'
  | 'rebooting'
  | 'complete'
  | 'error';

/**
 * Flash progress event sent from main to renderer
 */
export interface FlashProgress {
  state: FlashState;
  progress: number;                // 0-100
  message: string;
  bytesWritten?: number;
  totalBytes?: number;
  currentStep?: number;
  totalSteps?: number;
}

/**
 * Flash result
 */
export interface FlashResult {
  success: boolean;
  message?: string;
  error?: string;
  duration?: number;               // Time taken in ms
  verified?: boolean;
}

/**
 * Flash options
 */
export interface FlashOptions {
  noRebootSequence?: boolean;      // Skip MSP reboot, board already in bootloader
  fullChipErase?: boolean;         // Erase entire flash (slower but cleaner)
  verify?: boolean;                // Verify after write
  manualBaudRate?: number;         // Override auto baud rate detection
}

/**
 * ArduPilot manifest entry structure
 */
export interface ArduPilotManifestEntry {
  'mav-firmware-version'?: string;
  'mav-firmware-version-type'?: string;
  'mav-autopilot'?: string;
  'board_id'?: number;
  platform?: string;
  'git-sha'?: string;
  format?: string;
  url?: string;
  latest?: number;
  'mav-type'?: string;
}

/**
 * Parsed firmware manifest
 */
export interface FirmwareManifest {
  source: FirmwareSource;
  fetchedAt: number;               // Timestamp
  versions: FirmwareVersion[];
  error?: string;                  // Error message if vehicle type not supported
}

/**
 * Known USB VID/PID board mappings
 */
export const KNOWN_BOARDS: Record<string, Partial<DetectedBoard>> = {
  // STM32 DFU mode (generic bootloader)
  '0483:df11': {
    name: 'STM32 DFU Bootloader',
    boardId: 'stm32-dfu',
    mcuType: 'STM32',
    flasher: 'dfu',
    inBootloader: true,
  },

  // ArduPilot ChibiOS generic
  '1209:5740': {
    name: 'ArduPilot ChibiOS',
    boardId: 'ChibiOS',
    mcuType: 'STM32',
    flasher: 'ardupilot',
    inBootloader: false,
  },

  // Pixhawk family
  '26ac:0011': {
    name: 'Pixhawk 1',
    boardId: 'Pixhawk1',
    mcuType: 'STM32F427',
    flasher: 'ardupilot',
    inBootloader: false,
  },
  '26ac:0032': {
    name: 'Pixhawk 4',
    boardId: 'Pixhawk4',
    mcuType: 'STM32F765',
    flasher: 'ardupilot',
    inBootloader: false,
  },

  // Cube series
  '2dae:1011': {
    name: 'CubeBlack',
    boardId: 'CubeBlack',
    mcuType: 'STM32F427',
    flasher: 'ardupilot',
    inBootloader: false,
  },
  '2dae:1016': {
    name: 'CubeOrange',
    boardId: 'CubeOrange',
    mcuType: 'STM32H743',
    flasher: 'ardupilot',
    inBootloader: false,
  },
  '2dae:1058': {
    name: 'CubeOrange+',
    boardId: 'CubeOrangePlus',
    mcuType: 'STM32H743',
    flasher: 'ardupilot',
    inBootloader: false,
  },

  // SpeedyBee
  '3162:004b': {
    name: 'SpeedyBee F405 Wing',
    boardId: 'speedybeef4',
    mcuType: 'STM32F405',
    flasher: 'dfu',
    inBootloader: false,
  },
  '0483:5740': {
    // Generic STM32 VCP PID — shared by many F4 boards (SpeedyBee, Matek, etc.)
    name: 'STM32F405 Flight Controller',
    boardId: 'unknown',
    mcuType: 'STM32F405',
    flasher: 'dfu',
    inBootloader: true,
  },

  // Matek
  '0483:5741': {
    name: 'Matek F405',
    boardId: 'MatekF405',
    mcuType: 'STM32F405',
    flasher: 'dfu',
    inBootloader: false,
  },

  // AVR boards (legacy)
  '2341:0042': {
    name: 'APM 2.5/2.6',
    boardId: 'apm2',
    mcuType: 'ATmega2560',
    flasher: 'avrdude',
    inBootloader: false,
  },
  '2341:0010': {
    name: 'Arduino Mega 2560',
    boardId: 'mega2560',
    mcuType: 'ATmega2560',
    flasher: 'avrdude',
    inBootloader: false,
  },
  '1a86:7523': {
    name: 'CH340 Serial (APM clone)',
    boardId: 'apm2',
    mcuType: 'ATmega2560',
    flasher: 'avrdude',
    inBootloader: false,
  },

  // Silicon Labs CP210x (common on many FCs and dev boards)
  '10c4:ea60': {
    name: 'CP2102 Serial (Unknown FC)',
    boardId: 'unknown',
    mcuType: 'Unknown',
    flasher: 'serial',
    inBootloader: false,
  },
  '10c4:ea70': {
    name: 'CP2105 Serial (Unknown FC)',
    boardId: 'unknown',
    mcuType: 'Unknown',
    flasher: 'serial',
    inBootloader: false,
  },

  // FTDI chips (common on older FCs)
  '0403:6001': {
    name: 'FTDI Serial (Unknown FC)',
    boardId: 'unknown',
    mcuType: 'Unknown',
    flasher: 'serial',
    inBootloader: false,
  },
  '0403:6015': {
    name: 'FTDI FT231X (Unknown FC)',
    boardId: 'unknown',
    mcuType: 'Unknown',
    flasher: 'serial',
    inBootloader: false,
  },

  // Holybro/Kakute
  '0483:5742': {
    name: 'Kakute F7',
    boardId: 'KakuteF7',
    mcuType: 'STM32F745',
    flasher: 'dfu',
    inBootloader: false,
  },
  '3162:004c': {
    name: 'Kakute H7',
    boardId: 'KakuteH7',
    mcuType: 'STM32H743',
    flasher: 'dfu',
    inBootloader: false,
  },

  // Pixhawk 6 series
  '3185:0038': {
    name: 'Pixhawk 6X',
    boardId: 'Pixhawk6X',
    mcuType: 'STM32H753',
    flasher: 'dfu',
    inBootloader: false,
  },
  '3185:0039': {
    name: 'Pixhawk 6C',
    boardId: 'Pixhawk6C',
    mcuType: 'STM32H743',
    flasher: 'dfu',
    inBootloader: false,
  },

  // Matek H743
  '0483:5743': {
    name: 'Matek H743',
    boardId: 'MatekH743',
    mcuType: 'STM32H743',
    flasher: 'dfu',
    inBootloader: false,
  },
};

/**
 * Firmware server URLs
 */
export const FIRMWARE_SERVERS = {
  ardupilot: {
    manifest: 'https://firmware.ardupilot.org/manifest.json.gz',
    base: 'https://firmware.ardupilot.org',
  },
  px4: {
    manifest: 'https://px4-travis.s3.amazonaws.com/Firmware/master/px4fmu-v5_default.px4',
    releases: 'https://api.github.com/repos/PX4/PX4-Autopilot/releases',
  },
  betaflight: {
    releases: 'https://api.github.com/repos/betaflight/betaflight/releases',
  },
  inav: {
    releases: 'https://api.github.com/repos/iNavFlight/inav/releases',
  },
} as const;

/**
 * Firmware source display names
 */
export const FIRMWARE_SOURCE_NAMES: Record<FirmwareSource, string> = {
  ardupilot: 'ArduPilot',
  px4: 'PX4',
  betaflight: 'Betaflight',
  inav: 'iNav',
  custom: 'Custom File',
};

/**
 * Vehicle type to ArduPilot firmware name mapping
 */
export const VEHICLE_TO_FIRMWARE: Record<FirmwareVehicleType, string> = {
  copter: 'Copter',
  plane: 'Plane',
  vtol: 'Plane',  // VTOL uses ArduPlane with Q_ params
  rover: 'Rover',
  boat: 'Rover',  // Boats use ArduRover
  sub: 'Sub',
};

/**
 * File extensions by firmware source
 */
export const FIRMWARE_EXTENSIONS: Record<FirmwareSource, string[]> = {
  ardupilot: ['.apj', '.bin', '.px4'],
  px4: ['.px4', '.bin'],
  betaflight: ['.hex'],
  inav: ['.hex'],
  custom: ['.apj', '.bin', '.hex', '.px4'],
};

/**
 * STM32 Chip ID to MCU mapping
 * These IDs are returned by the STM32 bootloader's GET_ID command
 * Reference: STM32 AN2606 (Bootloader documentation)
 */
export interface STM32ChipInfo {
  mcu: string;      // e.g., "STM32F405"
  family: string;   // e.g., "F4"
  flashKb?: number; // Flash size in KB (if known)
}

export const STM32_CHIP_IDS: Record<number, STM32ChipInfo> = {
  // STM32F4 series
  0x0413: { mcu: 'STM32F405/407', family: 'F4', flashKb: 1024 },
  0x0419: { mcu: 'STM32F427/429', family: 'F4', flashKb: 2048 },
  0x0423: { mcu: 'STM32F401xB/C', family: 'F4', flashKb: 256 },
  0x0433: { mcu: 'STM32F401xD/E', family: 'F4', flashKb: 512 },
  0x0431: { mcu: 'STM32F411', family: 'F4', flashKb: 512 },
  0x0441: { mcu: 'STM32F412', family: 'F4', flashKb: 1024 },
  0x0421: { mcu: 'STM32F446', family: 'F4', flashKb: 512 },

  // STM32F7 series
  0x0449: { mcu: 'STM32F745/746', family: 'F7', flashKb: 1024 },
  0x0451: { mcu: 'STM32F765/767/769', family: 'F7', flashKb: 2048 },
  0x0452: { mcu: 'STM32F72x/73x', family: 'F7', flashKb: 512 },

  // STM32H7 series
  0x0450: { mcu: 'STM32H742/743/750/753', family: 'H7', flashKb: 2048 },
  0x0480: { mcu: 'STM32H7A3/7B3', family: 'H7', flashKb: 2048 },
  0x0483: { mcu: 'STM32H723/725/730/733/735', family: 'H7', flashKb: 1024 },

  // STM32F3 series (some older boards)
  0x0432: { mcu: 'STM32F37x', family: 'F3', flashKb: 256 },
  0x0438: { mcu: 'STM32F303x6/8', family: 'F3', flashKb: 64 },
  0x0422: { mcu: 'STM32F30x/F302xB/C', family: 'F3', flashKb: 256 },
  0x0439: { mcu: 'STM32F302x6/8', family: 'F3', flashKb: 64 },
  0x0446: { mcu: 'STM32F303xD/E', family: 'F3', flashKb: 512 },

  // STM32G4 series (newer boards)
  0x0468: { mcu: 'STM32G431/441', family: 'G4', flashKb: 128 },
  0x0469: { mcu: 'STM32G47x/48x', family: 'G4', flashKb: 512 },
};

/**
 * Get MCU info from chip ID
 */
export function getSTM32ChipInfo(chipId: number): STM32ChipInfo | null {
  return STM32_CHIP_IDS[chipId] ?? null;
}

/**
 * Get list of boards that use a specific MCU family
 */
export function getBoardsForMcu(mcuType: string): Partial<DetectedBoard>[] {
  const boards: Partial<DetectedBoard>[] = [];
  for (const board of Object.values(KNOWN_BOARDS)) {
    if (board.mcuType?.includes(mcuType.replace('STM32', ''))) {
      boards.push(board);
    }
  }
  return boards;
}
