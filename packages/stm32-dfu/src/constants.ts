/**
 * STM32 DFU Constants
 * USB DFU 1.1 protocol constants and ST's DfuSe extensions
 */

// USB DFU Class Request Codes (bmRequest)
export const DFU_DETACH = 0x00;
export const DFU_DNLOAD = 0x01;
export const DFU_UPLOAD = 0x02;
export const DFU_GETSTATUS = 0x03;
export const DFU_CLRSTATUS = 0x04;
export const DFU_GETSTATE = 0x05;
export const DFU_ABORT = 0x06;

// USB Control Transfer Types
export const USB_REQUEST_TYPE_CLASS = 0x20;
export const USB_REQUEST_TYPE_INTERFACE = 0x01;
export const USB_ENDPOINT_OUT = 0x00;
export const USB_ENDPOINT_IN = 0x80;

// DFU bmRequestType values
export const DFU_REQUEST_OUT = USB_REQUEST_TYPE_CLASS | USB_REQUEST_TYPE_INTERFACE | USB_ENDPOINT_OUT; // 0x21
export const DFU_REQUEST_IN = USB_REQUEST_TYPE_CLASS | USB_REQUEST_TYPE_INTERFACE | USB_ENDPOINT_IN;  // 0xA1

// DFU States
export enum DfuState {
  appIDLE = 0,
  appDETACH = 1,
  dfuIDLE = 2,
  dfuDNLOAD_SYNC = 3,
  dfuDNBUSY = 4,
  dfuDNLOAD_IDLE = 5,
  dfuMANIFEST_SYNC = 6,
  dfuMANIFEST = 7,
  dfuMANIFEST_WAIT_RESET = 8,
  dfuUPLOAD_IDLE = 9,
  dfuERROR = 10,
}

// DFU Status Codes
export enum DfuStatus {
  OK = 0x00,
  errTARGET = 0x01,
  errFILE = 0x02,
  errWRITE = 0x03,
  errERASE = 0x04,
  errCHECK_ERASED = 0x05,
  errPROG = 0x06,
  errVERIFY = 0x07,
  errADDRESS = 0x08,
  errNOTDONE = 0x09,
  errFIRMWARE = 0x0A,
  errVENDOR = 0x0B,
  errUSBR = 0x0C,
  errPOR = 0x0D,
  errUNKNOWN = 0x0E,
  errSTALLEDPKT = 0x0F,
}

// Human-readable status messages
export const DFU_STATUS_MESSAGES: Record<DfuStatus, string> = {
  [DfuStatus.OK]: 'No error',
  [DfuStatus.errTARGET]: 'File is not targeted for this device',
  [DfuStatus.errFILE]: 'File is for this device but fails verification',
  [DfuStatus.errWRITE]: 'Device is unable to write memory',
  [DfuStatus.errERASE]: 'Memory erase failed',
  [DfuStatus.errCHECK_ERASED]: 'Memory erase check failed',
  [DfuStatus.errPROG]: 'Program memory function failed',
  [DfuStatus.errVERIFY]: 'Verification failed',
  [DfuStatus.errADDRESS]: 'Cannot program memory due to address',
  [DfuStatus.errNOTDONE]: 'Received unexpected DFU_DNLOAD-IDLE',
  [DfuStatus.errFIRMWARE]: 'Firmware is corrupt',
  [DfuStatus.errVENDOR]: 'Vendor-specific error',
  [DfuStatus.errUSBR]: 'USB reset detected',
  [DfuStatus.errPOR]: 'Power-on reset detected',
  [DfuStatus.errUNKNOWN]: 'Unknown error',
  [DfuStatus.errSTALLEDPKT]: 'Unexpected request received',
};

// Human-readable state names
export const DFU_STATE_NAMES: Record<DfuState, string> = {
  [DfuState.appIDLE]: 'appIDLE',
  [DfuState.appDETACH]: 'appDETACH',
  [DfuState.dfuIDLE]: 'dfuIDLE',
  [DfuState.dfuDNLOAD_SYNC]: 'dfuDNLOAD-SYNC',
  [DfuState.dfuDNBUSY]: 'dfuDNBUSY',
  [DfuState.dfuDNLOAD_IDLE]: 'dfuDNLOAD-IDLE',
  [DfuState.dfuMANIFEST_SYNC]: 'dfuMANIFEST-SYNC',
  [DfuState.dfuMANIFEST]: 'dfuMANIFEST',
  [DfuState.dfuMANIFEST_WAIT_RESET]: 'dfuMANIFEST-WAIT-RESET',
  [DfuState.dfuUPLOAD_IDLE]: 'dfuUPLOAD-IDLE',
  [DfuState.dfuERROR]: 'dfuERROR',
};

// DfuSe Commands (sent as first byte of download data)
export const DFUSE_COMMAND_SET_ADDRESS = 0x21;
export const DFUSE_COMMAND_ERASE_PAGE = 0x41;
export const DFUSE_COMMAND_READ_UNPROTECT = 0x92;

// STM32 Vendor and Product IDs
export const STM32_VID = 0x0483; // STMicroelectronics

// STM32 DFU PIDs for different chip families
export const STM32_DFU_PIDS: Record<string, number> = {
  'F1': 0xDF11,     // STM32F1xx in DFU mode
  'F3': 0xDF11,     // STM32F3xx in DFU mode
  'F4': 0xDF11,     // STM32F4xx in DFU mode
  'F7': 0xDF11,     // STM32F7xx in DFU mode
  'H7': 0xDF11,     // STM32H7xx in DFU mode
  'G0': 0xDF11,     // STM32G0xx in DFU mode
  'G4': 0xDF11,     // STM32G4xx in DFU mode
  'L4': 0xDF11,     // STM32L4xx in DFU mode
  'WB': 0xDF11,     // STM32WBxx in DFU mode
  'DEFAULT': 0xDF11,
};

// All known STM32 DFU PIDs
export const ALL_STM32_DFU_PIDS = [0xDF11];

// Default flash start address for STM32
export const STM32_FLASH_START = 0x08000000;

// STM32 Flash sector sizes by family (simplified)
export const STM32_SECTOR_SIZES: Record<string, number[]> = {
  'F1': [1024],                                           // 1KB uniform
  'F3': [2048],                                           // 2KB uniform
  'F4': [16384, 16384, 16384, 16384, 65536, 131072],     // Mixed: 16KB x4, 64KB, 128KB+
  'F7': [32768, 32768, 32768, 32768, 131072, 262144],    // Mixed: 32KB x4, 128KB, 256KB+
  'H7': [131072],                                         // 128KB uniform
  'DEFAULT': [2048],
};

// DFU Transfer Size (block size)
export const DFU_TRANSFER_SIZE = 2048;  // Most STM32 DFU implementations use 2KB

// Timeouts (in milliseconds)
export const DFU_TIMEOUT = 5000;        // General DFU operation timeout
export const ERASE_TIMEOUT = 30000;     // Erase can take longer
export const MANIFEST_TIMEOUT = 10000;  // Manifest/reset timeout

// USB interface settings
export const DFU_INTERFACE_CLASS = 0xFE;    // Application Specific
export const DFU_INTERFACE_SUBCLASS = 0x01; // Device Firmware Upgrade
export const DFU_INTERFACE_PROTOCOL = 0x02; // DFU mode protocol

// USB Interface Protocol values
export const DFU_PROTOCOL_RUNTIME = 0x01;   // Runtime protocol
export const DFU_PROTOCOL_DFU_MODE = 0x02;  // DFU mode protocol

// Special block numbers for DfuSe commands
export const DFUSE_COMMAND_BLOCK = 0; // Block 0 is used for special commands

// DfuSe file signature
export const DFUSE_SIGNATURE = 'DfuSe';
export const DFUSE_SUFFIX_LENGTH = 16;
export const DFUSE_PREFIX_LENGTH = 11;
