/**
 * DFU Protocol - Low-level USB DFU 1.1 operations
 */

import type { Interface as UsbInterface, Device } from 'usb';
import {
  DFU_DETACH,
  DFU_DNLOAD,
  DFU_UPLOAD,
  DFU_GETSTATUS,
  DFU_CLRSTATUS,
  DFU_GETSTATE,
  DFU_ABORT,
  DFU_REQUEST_OUT,
  DFU_REQUEST_IN,
  DFU_TIMEOUT,
  DfuState,
  DfuStatus,
  DFU_STATUS_MESSAGES,
  DFU_STATE_NAMES,
} from './constants.js';
import type { DfuStatusResponse, DfuFunctionalDescriptor } from './types.js';
import { DfuError, UsbError } from './types.js';

/**
 * Perform USB control transfer (promisified)
 */
export async function controlTransfer(
  device: Device,
  bmRequestType: number,
  bRequest: number,
  wValue: number,
  wIndex: number,
  dataOrLength: Buffer | number,
  timeout: number = DFU_TIMEOUT,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    device.timeout = timeout;
    device.controlTransfer(
      bmRequestType,
      bRequest,
      wValue,
      wIndex,
      dataOrLength,
      (error, data) => {
        if (error) {
          reject(new UsbError(`USB control transfer failed: ${error.message}`, (error as NodeJS.ErrnoException).code));
        } else {
          resolve(data as Buffer);
        }
      }
    );
  });
}

/**
 * DFU_DETACH - Request device to leave app mode and enter DFU mode
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param timeout Detach timeout in ms
 */
export async function dfuDetach(device: Device, interfaceNumber: number, timeout: number = 1000): Promise<void> {
  await controlTransfer(
    device,
    DFU_REQUEST_OUT,
    DFU_DETACH,
    timeout,
    interfaceNumber,
    Buffer.alloc(0),
  );
}

/**
 * DFU_DNLOAD - Download a block of data to device
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param blockNum Block number (0 for DfuSe commands, 2+ for data)
 * @param data Data to download
 */
export async function dfuDownload(
  device: Device,
  interfaceNumber: number,
  blockNum: number,
  data: Uint8Array,
): Promise<void> {
  await controlTransfer(
    device,
    DFU_REQUEST_OUT,
    DFU_DNLOAD,
    blockNum,
    interfaceNumber,
    Buffer.from(data),
  );
}

/**
 * DFU_UPLOAD - Upload (read) a block of data from device
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param blockNum Block number
 * @param length Number of bytes to read
 * @returns Uploaded data
 */
export async function dfuUpload(
  device: Device,
  interfaceNumber: number,
  blockNum: number,
  length: number,
): Promise<Buffer> {
  return await controlTransfer(
    device,
    DFU_REQUEST_IN,
    DFU_UPLOAD,
    blockNum,
    interfaceNumber,
    length,
  );
}

/**
 * DFU_GETSTATUS - Get device status (6 bytes)
 * @param device USB device
 * @param interfaceNumber Interface number
 * @returns Status response
 */
export async function dfuGetStatus(device: Device, interfaceNumber: number): Promise<DfuStatusResponse> {
  const data = await controlTransfer(
    device,
    DFU_REQUEST_IN,
    DFU_GETSTATUS,
    0,
    interfaceNumber,
    6,
  );

  if (data.length < 6) {
    throw new DfuError(`Invalid status response length: ${data.length}`);
  }

  return {
    status: data.readUInt8(0) as DfuStatus,
    pollTimeout: data.readUInt8(1) | (data.readUInt8(2) << 8) | (data.readUInt8(3) << 16),
    state: data.readUInt8(4) as DfuState,
    stringIndex: data.readUInt8(5),
  };
}

/**
 * DFU_CLRSTATUS - Clear error status
 * @param device USB device
 * @param interfaceNumber Interface number
 */
export async function dfuClearStatus(device: Device, interfaceNumber: number): Promise<void> {
  await controlTransfer(
    device,
    DFU_REQUEST_OUT,
    DFU_CLRSTATUS,
    0,
    interfaceNumber,
    Buffer.alloc(0),
  );
}

/**
 * DFU_GETSTATE - Get current state (1 byte)
 * @param device USB device
 * @param interfaceNumber Interface number
 * @returns Current DFU state
 */
export async function dfuGetState(device: Device, interfaceNumber: number): Promise<DfuState> {
  const data = await controlTransfer(
    device,
    DFU_REQUEST_IN,
    DFU_GETSTATE,
    0,
    interfaceNumber,
    1,
  );

  if (data.length < 1) {
    throw new DfuError('Invalid state response');
  }

  return data.readUInt8(0) as DfuState;
}

/**
 * DFU_ABORT - Abort current operation
 * @param device USB device
 * @param interfaceNumber Interface number
 */
export async function dfuAbort(device: Device, interfaceNumber: number): Promise<void> {
  await controlTransfer(
    device,
    DFU_REQUEST_OUT,
    DFU_ABORT,
    0,
    interfaceNumber,
    Buffer.alloc(0),
  );
}

/**
 * Wait for device to reach a specific state
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param targetStates Array of acceptable target states
 * @param timeout Maximum wait time in ms
 * @returns Final status response
 */
export async function dfuWaitForState(
  device: Device,
  interfaceNumber: number,
  targetStates: DfuState[],
  timeout: number = DFU_TIMEOUT,
): Promise<DfuStatusResponse> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await dfuGetStatus(device, interfaceNumber);

    // Check for error state
    if (status.state === DfuState.dfuERROR) {
      const errorMsg = DFU_STATUS_MESSAGES[status.status] || 'Unknown error';
      throw new DfuError(
        `DFU error: ${errorMsg}`,
        status.status,
        status.state,
      );
    }

    // Check if we've reached target state
    if (targetStates.includes(status.state)) {
      return status;
    }

    // Wait for poll timeout before retrying
    const waitTime = Math.max(status.pollTimeout, 10);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  throw new DfuError(`Timeout waiting for state ${targetStates.map(s => DFU_STATE_NAMES[s]).join('/')}`);
}

/**
 * Clear any error state and return to idle
 * @param device USB device
 * @param interfaceNumber Interface number
 */
export async function dfuClearError(device: Device, interfaceNumber: number): Promise<void> {
  const status = await dfuGetStatus(device, interfaceNumber);

  if (status.state === DfuState.dfuERROR) {
    await dfuClearStatus(device, interfaceNumber);
    // Get status again to transition to dfuIDLE
    await dfuGetStatus(device, interfaceNumber);
  }
}

/**
 * Abort any operation and return to idle
 * @param device USB device
 * @param interfaceNumber Interface number
 */
export async function dfuResetToIdle(device: Device, interfaceNumber: number): Promise<void> {
  const status = await dfuGetStatus(device, interfaceNumber);

  if (status.state === DfuState.dfuERROR) {
    await dfuClearStatus(device, interfaceNumber);
    await dfuGetStatus(device, interfaceNumber);
    return;
  }

  if (status.state !== DfuState.dfuIDLE) {
    await dfuAbort(device, interfaceNumber);
    await dfuGetStatus(device, interfaceNumber);
  }
}

/**
 * Parse DFU functional descriptor from raw descriptor data
 * @param data Raw descriptor data
 * @returns Parsed functional descriptor
 */
export function parseDfuFunctionalDescriptor(data: Buffer): DfuFunctionalDescriptor | null {
  // DFU functional descriptor format:
  // bLength(1) bDescriptorType(1) bmAttributes(1) wDetachTimeout(2) wTransferSize(2) bcdDFUVersion(2)
  if (data.length < 9) {
    return null;
  }

  const bLength = data.readUInt8(0);
  const bDescriptorType = data.readUInt8(1);

  // DFU functional descriptor type is 0x21
  if (bDescriptorType !== 0x21 || bLength < 9) {
    return null;
  }

  const bmAttributes = data.readUInt8(2);
  const wDetachTimeout = data.readUInt16LE(3);
  const wTransferSize = data.readUInt16LE(5);
  const bcdDFUVersion = data.readUInt16LE(7);

  return {
    attributes: bmAttributes,
    detachTimeout: wDetachTimeout,
    transferSize: wTransferSize,
    dfuVersion: bcdDFUVersion,
    canDownload: (bmAttributes & 0x01) !== 0,
    canUpload: (bmAttributes & 0x02) !== 0,
    manifestTolerant: (bmAttributes & 0x04) !== 0,
    willDetach: (bmAttributes & 0x08) !== 0,
  };
}

/**
 * Get human-readable status description
 */
export function getStatusDescription(status: DfuStatus): string {
  return DFU_STATUS_MESSAGES[status] || `Unknown status: 0x${status.toString(16)}`;
}

/**
 * Get human-readable state name
 */
export function getStateName(state: DfuState): string {
  return DFU_STATE_NAMES[state] || `Unknown state: ${state}`;
}
