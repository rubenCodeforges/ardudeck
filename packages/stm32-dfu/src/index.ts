/**
 * @ardudeck/stm32-dfu
 *
 * Native TypeScript STM32 DFU flashing library using libusb.
 * No external CLI tools required. Cross-platform (Windows, macOS, Linux).
 *
 * @example
 * ```typescript
 * import { DfuDevice, parseDfuFile, parseHexFile, loadBinFile } from '@ardudeck/stm32-dfu';
 *
 * // Find and flash a device
 * const device = DfuDevice.findFirst();
 * if (device) {
 *   await device.open();
 *
 *   // Load firmware from various formats
 *   const firmware = parseDfuFile(dfuBuffer);
 *   // or: const firmware = parseHexFile(hexContent);
 *   // or: const firmware = loadBinFile(binBuffer, 0x08000000);
 *
 *   // Flash with progress
 *   await device.flash(firmware, {
 *     verify: true,
 *     onProgress: (p) => console.log(`${p.phase}: ${p.percent}%`),
 *   });
 *
 *   await device.close();
 * }
 * ```
 */

// Main device class
export { DfuDevice, isStm32DfuDevice, getDeviceDescription } from './dfu-device.js';

// File parsers
export { parseDfuFile, isDfuFile } from './parsers/dfu-file.js';
export { parseHexFile, isHexFile } from './parsers/hex-file.js';
export { loadBinFile, loadBinFileWithAutoAddress, mergeSegments, padToAlignment } from './parsers/bin-file.js';

// Types and errors
export type {
  DfuStatusResponse,
  MemorySegment,
  FirmwareImage,
  FlashPhase,
  FlashProgress,
  ProgressCallback,
  DfuDeviceInfo,
  DfuFunctionalDescriptor,
  MemoryLayoutSegment,
  MemoryLayout,
  DfusePrefix,
  DfuseSuffix,
  DfuseTargetHeader,
  DfuseElement,
  FlashOptions,
} from './types.js';
export { DfuError, UsbError, ParseError } from './types.js';

// Constants
export {
  DfuState,
  DfuStatus,
  DFU_STATUS_MESSAGES,
  DFU_STATE_NAMES,
  STM32_VID,
  STM32_DFU_PIDS,
  ALL_STM32_DFU_PIDS,
  STM32_FLASH_START,
  STM32_SECTOR_SIZES,
  DFU_TRANSFER_SIZE,
} from './constants.js';

// Low-level protocol (for advanced use)
export {
  controlTransfer,
  dfuDetach,
  dfuDownload,
  dfuUpload,
  dfuGetStatus,
  dfuClearStatus,
  dfuGetState,
  dfuAbort,
  dfuWaitForState,
  dfuClearError,
  dfuResetToIdle,
  parseDfuFunctionalDescriptor,
  getStatusDescription,
  getStateName,
} from './dfu-protocol.js';

// DfuSe extensions (for advanced use)
export {
  dfuseSetAddress,
  dfuseEraseSector,
  dfuseMassErase,
  dfuseReadUnprotect,
  dfuseLeave,
  dfuseDownload,
  dfuseUpload,
  parseMemoryLayout,
  getSectorsToErase,
  dfuseEraseRange,
  dfuseVerify,
} from './dfuse-protocol.js';

// Utilities
export { crc32, updateCrc32, finalizeCrc32, verifyCrc32 } from './utils/crc.js';
export {
  ProgressTracker,
  formatBytes,
  formatSpeed,
  estimateTimeRemaining,
  formatTime,
} from './utils/progress.js';
