/**
 * STM32 DFU Type Definitions
 */

import { DfuState, DfuStatus } from './constants.js';

/**
 * DFU device status response (6 bytes)
 */
export interface DfuStatusResponse {
  /** Status code indicating success or error type */
  status: DfuStatus;
  /** Minimum time in ms to wait before next request */
  pollTimeout: number;
  /** Current DFU state */
  state: DfuState;
  /** Index of string descriptor for status */
  stringIndex: number;
}

/**
 * Memory segment - a contiguous region of firmware data
 */
export interface MemorySegment {
  /** Start address in device memory */
  address: number;
  /** Firmware data for this segment */
  data: Uint8Array;
}

/**
 * Complete firmware image, potentially with multiple segments
 */
export interface FirmwareImage {
  /** Memory segments to flash */
  segments: MemorySegment[];
  /** Total size of all segments */
  totalSize: number;
  /** Optional target name from DfuSe file */
  targetName?: string;
  /** Optional target alternate setting from DfuSe file */
  targetAlt?: number;
}

/**
 * Progress callback phases
 */
export type FlashPhase = 'erase' | 'download' | 'verify' | 'manifest';

/**
 * Progress information passed to callbacks
 */
export interface FlashProgress {
  /** Current phase of the flash operation */
  phase: FlashPhase;
  /** Current byte/block being processed */
  current: number;
  /** Total bytes/blocks to process */
  total: number;
  /** Progress percentage (0-100) */
  percent: number;
  /** Optional status message */
  message?: string;
}

/**
 * Progress callback function type
 */
export type ProgressCallback = (progress: FlashProgress) => void;

/**
 * DFU device information
 */
export interface DfuDeviceInfo {
  /** USB vendor ID */
  vendorId: number;
  /** USB product ID */
  productId: number;
  /** Serial number if available */
  serialNumber?: string;
  /** Product name if available */
  productName?: string;
  /** Manufacturer name if available */
  manufacturer?: string;
  /** DFU interface number */
  interfaceNumber: number;
  /** Alternate setting number */
  alternateSetting: number;
  /** Interface name (often contains memory layout info) */
  interfaceName?: string;
}

/**
 * DFU functional descriptor
 */
export interface DfuFunctionalDescriptor {
  /** bmAttributes - DFU capabilities */
  attributes: number;
  /** wDetachTimeout */
  detachTimeout: number;
  /** wTransferSize - max bytes per transfer */
  transferSize: number;
  /** bcdDFUVersion */
  dfuVersion: number;
  /** Parsed capabilities */
  canDownload: boolean;
  canUpload: boolean;
  manifestTolerant: boolean;
  willDetach: boolean;
}

/**
 * DfuSe memory layout segment descriptor
 * Parsed from interface string like "@Internal Flash /0x08000000/04*016Kg,01*064Kg,07*128Kg"
 */
export interface MemoryLayoutSegment {
  /** Segment start address */
  address: number;
  /** Number of pages in segment */
  pageCount: number;
  /** Size of each page */
  pageSize: number;
  /** Memory type: 'r' = readable, 'w' = writable, 'e' = erasable */
  memoryType: string;
}

/**
 * DfuSe memory layout parsed from interface string
 */
export interface MemoryLayout {
  /** Memory name (e.g., "Internal Flash") */
  name: string;
  /** Memory segments */
  segments: MemoryLayoutSegment[];
  /** Total memory size */
  totalSize: number;
}

/**
 * DfuSe file target element header
 */
export interface DfuseTargetHeader {
  /** Signature "Target" */
  signature: string;
  /** Alternate setting */
  alternateSetting: number;
  /** Is target named */
  isNamed: boolean;
  /** Target name if present */
  name?: string;
  /** Target size */
  targetSize: number;
  /** Number of elements */
  elementCount: number;
}

/**
 * DfuSe file image element
 */
export interface DfuseElement {
  /** Element address */
  address: number;
  /** Element data */
  data: Uint8Array;
}

/**
 * DfuSe file prefix (11 bytes)
 */
export interface DfusePrefix {
  /** Signature "DfuSe" */
  signature: string;
  /** File version */
  version: number;
  /** Total file size */
  dfuImageSize: number;
  /** Number of targets */
  targetCount: number;
}

/**
 * DfuSe file suffix (16 bytes)
 */
export interface DfuseSuffix {
  /** bcdDevice - Device version */
  deviceVersion: number;
  /** idProduct */
  productId: number;
  /** idVendor */
  vendorId: number;
  /** bcdDFU - DFU specification version */
  dfuSpecVersion: number;
  /** Signature "UFD" (reversed) */
  signature: string;
  /** Suffix length */
  length: number;
  /** CRC32 */
  crc: number;
}

/**
 * Flash options
 */
export interface FlashOptions {
  /** Verify after flashing (default: true) */
  verify?: boolean;
  /** Force erase entire flash before writing (default: false) */
  forceFullErase?: boolean;
  /** Leave device in DFU mode after flash (default: false, triggers reset) */
  leaveInDfuMode?: boolean;
  /** Override transfer size (default: device reported or 2048) */
  transferSize?: number;
  /** Progress callback */
  onProgress?: ProgressCallback;
}

/**
 * DFU error class for specific DFU-related errors
 */
export class DfuError extends Error {
  constructor(
    message: string,
    public readonly status?: DfuStatus,
    public readonly state?: DfuState,
  ) {
    super(message);
    this.name = 'DfuError';
  }
}

/**
 * USB communication error
 */
export class UsbError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'UsbError';
  }
}

/**
 * File parsing error
 */
export class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParseError';
  }
}
