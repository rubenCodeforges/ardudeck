/**
 * Firmware Flash Module
 * Re-exports all firmware-related functionality
 */

export { detectBoards, isInBootloaderMode, getKnownBoards } from './board-detector.js';
export {
  fetchFirmwareVersions,
  clearManifestCache,
  isVehicleSupported,
  getArduPilotBoards,
  getArduPilotVersions,
  getBetaflightBoards,
  getInavBoards,
  type BoardInfo,
  type VersionGroup,
} from './manifest-fetcher.js';
export {
  downloadFirmware,
  isFirmwareCached,
  getFirmwareCachePath,
  clearFirmwareCache,
  copyCustomFirmware,
} from './firmware-downloader.js';
export { flashWithDfu, getDfuUtilPath, isDfuUtilAvailable, listDfuDevices } from './dfu-flasher.js';
export { flashWithAvrdude, getAvrdudePath, isAvrdudeAvailable } from './avr-flasher.js';
export { flashWithSerialBootloader } from './stm32-serial-flasher.js';
export {
  querySTM32ChipId,
  detectSTM32Chip,
  isSTM32InBootloader,
  type STM32BootloaderResult,
} from './stm32-bootloader.js';
