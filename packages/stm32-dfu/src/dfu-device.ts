/**
 * DfuDevice - Main class for interacting with STM32 DFU devices
 */

import * as usb from 'usb';
import type { Device, Interface as UsbInterface, InterfaceDescriptor } from 'usb';
import {
  STM32_VID,
  ALL_STM32_DFU_PIDS,
  DFU_INTERFACE_CLASS,
  DFU_INTERFACE_SUBCLASS,
  DFU_INTERFACE_PROTOCOL,
  DFU_PROTOCOL_DFU_MODE,
  DFU_TRANSFER_SIZE,
  DfuState,
} from './constants.js';
import {
  dfuGetStatus,
  dfuClearStatus,
  dfuAbort,
  dfuResetToIdle,
  parseDfuFunctionalDescriptor,
} from './dfu-protocol.js';
import {
  dfuseSetAddress,
  dfuseEraseSector,
  dfuseDownload,
  dfuseUpload,
  dfuseLeave,
  dfuseEraseRange,
  dfuseMassErase,
  dfuseReadUnprotect,
  dfuseVerify,
  parseMemoryLayout,
} from './dfuse-protocol.js';
import type {
  DfuDeviceInfo,
  DfuStatusResponse,
  DfuFunctionalDescriptor,
  FirmwareImage,
  FlashOptions,
  ProgressCallback,
  MemoryLayout,
} from './types.js';
import { DfuError, UsbError } from './types.js';

/**
 * Main class for STM32 DFU device interaction
 */
export class DfuDevice {
  private device: Device;
  private iface: UsbInterface | null = null;
  private _isOpen: boolean = false;
  private _info: DfuDeviceInfo;
  private _funcDescriptor: DfuFunctionalDescriptor | null = null;
  private _memoryLayout: MemoryLayout | null = null;

  private constructor(device: Device, info: DfuDeviceInfo) {
    this.device = device;
    this._info = info;
  }

  /**
   * Find all DFU devices
   * @param vendorId Optional vendor ID filter (default: STM32)
   * @returns Array of DfuDevice instances
   */
  static findAll(vendorId?: number): DfuDevice[] {
    const devices = usb.getDeviceList();
    const dfuDevices: DfuDevice[] = [];

    for (const device of devices) {
      const descriptor = device.deviceDescriptor;

      // Filter by vendor ID if specified
      if (vendorId !== undefined && descriptor.idVendor !== vendorId) {
        continue;
      }

      // Check if it's a known STM32 DFU device
      if (vendorId === undefined && descriptor.idVendor !== STM32_VID) {
        // Not STM32, but check if it has DFU interface anyway
        const dfuInterfaces = DfuDevice.findDfuInterfaces(device);
        if (dfuInterfaces.length === 0) {
          continue;
        }
      }

      // Find DFU interfaces
      const dfuInterfaces = DfuDevice.findDfuInterfaces(device);
      for (const ifaceInfo of dfuInterfaces) {
        dfuDevices.push(new DfuDevice(device, ifaceInfo));
      }
    }

    return dfuDevices;
  }

  /**
   * Find a specific DFU device by VID/PID
   * @param vid Vendor ID
   * @param pid Product ID
   * @returns DfuDevice or null
   */
  static findByIds(vid: number, pid: number): DfuDevice | null {
    const devices = DfuDevice.findAll(vid);
    return devices.find(d => d.info.productId === pid) || null;
  }

  /**
   * Find first STM32 DFU device
   * @returns DfuDevice or null
   */
  static findFirst(): DfuDevice | null {
    const devices = DfuDevice.findAll(STM32_VID);
    return devices[0] || null;
  }

  /**
   * Wait for a DFU device to appear (useful after reset)
   * BSOD FIX: Increased polling interval from 200ms to 500ms to reduce USB enumeration stress
   * @param timeout Timeout in milliseconds
   * @param vid Optional vendor ID filter
   * @returns DfuDevice or null
   */
  static async waitForDevice(timeout: number = 5000, vid?: number): Promise<DfuDevice | null> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const devices = DfuDevice.findAll(vid);
      if (devices.length > 0) {
        // BSOD FIX: Add delay after finding device to let driver stabilize
        await new Promise(resolve => setTimeout(resolve, 100));
        return devices[0]!;
      }
      // BSOD FIX: Increased from 200ms to 500ms to reduce USB enumeration stress
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    return null;
  }

  /**
   * Find DFU interfaces on a USB device
   */
  private static findDfuInterfaces(device: Device): DfuDeviceInfo[] {
    const interfaces: DfuDeviceInfo[] = [];
    const descriptor = device.deviceDescriptor;

    try {
      device.open();
    } catch {
      // Device may already be open or inaccessible
      return interfaces;
    }

    try {
      // Get configuration descriptor
      const config = device.configDescriptor;
      if (!config) {
        device.close();
        return interfaces;
      }

      for (const iface of config.interfaces) {
        for (const alt of iface) {
          // Check for DFU interface class
          if (
            alt.bInterfaceClass === DFU_INTERFACE_CLASS &&
            alt.bInterfaceSubClass === DFU_INTERFACE_SUBCLASS &&
            (alt.bInterfaceProtocol === DFU_INTERFACE_PROTOCOL ||
             alt.bInterfaceProtocol === DFU_PROTOCOL_DFU_MODE)
          ) {
            // Interface string will be retrieved when device is opened
            interfaces.push({
              vendorId: descriptor.idVendor,
              productId: descriptor.idProduct,
              interfaceNumber: alt.bInterfaceNumber,
              alternateSetting: alt.bAlternateSetting,
              // Store iInterface index for later retrieval
            });
          }
        }
      }
    } catch {
      // Ignore errors reading descriptors
    }

    try {
      device.close();
    } catch {
      // Ignore close errors
    }

    return interfaces;
  }

  /**
   * Device information
   */
  get info(): DfuDeviceInfo {
    return this._info;
  }

  /**
   * Whether device is open
   */
  get isOpen(): boolean {
    return this._isOpen;
  }

  /**
   * DFU functional descriptor (available after open)
   */
  get functionalDescriptor(): DfuFunctionalDescriptor | null {
    return this._funcDescriptor;
  }

  /**
   * Memory layout (available after open, if device reports it)
   */
  get memoryLayout(): MemoryLayout | null {
    return this._memoryLayout;
  }

  /**
   * Transfer size for DFU operations
   */
  get transferSize(): number {
    return this._funcDescriptor?.transferSize || DFU_TRANSFER_SIZE;
  }

  /**
   * Open device for communication
   */
  async open(): Promise<void> {
    if (this._isOpen) {
      return;
    }

    try {
      this.device.open();
    } catch (e) {
      throw new UsbError(`Failed to open device: ${(e as Error).message}`);
    }

    try {
      // Get the DFU interface
      const config = this.device.configDescriptor;
      if (!config) {
        throw new UsbError('No configuration descriptor');
      }

      // Find our interface
      const ifaceArray = config.interfaces[this._info.interfaceNumber];
      if (!ifaceArray) {
        throw new UsbError(`Interface ${this._info.interfaceNumber} not found`);
      }

      // Get interface reference
      this.iface = this.device.interface(this._info.interfaceNumber);

      // Detach kernel driver if attached (Linux)
      if (this.iface.isKernelDriverActive()) {
        try {
          this.iface.detachKernelDriver();
        } catch {
          // May fail on some platforms
        }
      }

      // Claim interface
      this.iface.claim();

      // Set alternate setting if needed
      if (this._info.alternateSetting !== 0) {
        await new Promise<void>((resolve, reject) => {
          this.iface!.setAltSetting(this._info.alternateSetting, (err) => {
            if (err) reject(new UsbError(`Failed to set alternate setting: ${err.message}`));
            else resolve();
          });
        });
      }

      // Find the alt descriptor for this alternate setting (used for string + functional descriptor)
      const altDescriptor = ifaceArray.find(
        (a: InterfaceDescriptor) => a.bAlternateSetting === this._info.alternateSetting
      );

      // Read interface string descriptor for memory layout (e.g. "@Internal Flash /0x08000000/04*016Kg,01*064Kg,07*128Kg")
      if (!this._info.interfaceName && altDescriptor && altDescriptor.iInterface > 0) {
        try {
          const ifaceString = await new Promise<string | undefined>((resolve, reject) => {
            this.device.getStringDescriptor(altDescriptor.iInterface, (err, str) => {
              if (err) reject(err);
              else resolve(str);
            });
          });
          if (ifaceString) {
            this._info.interfaceName = ifaceString;
          }
        } catch {
          // Some devices don't support string descriptors
        }
      }

      // Try to get interface string for memory layout
      if (this._info.interfaceName) {
        this._memoryLayout = parseMemoryLayout(this._info.interfaceName);
      }

      // Try to parse functional descriptor from extra descriptors
      if (altDescriptor?.extra) {
        this._funcDescriptor = parseDfuFunctionalDescriptor(altDescriptor.extra);
      }

      this._isOpen = true;
    } catch (e) {
      try {
        this.device.close();
      } catch {
        // Ignore
      }
      throw e;
    }
  }

  /**
   * Close device
   */
  async close(): Promise<void> {
    if (!this._isOpen) {
      return;
    }

    try {
      if (this.iface) {
        this.iface.release();
      }
    } catch {
      // Ignore release errors
    }

    try {
      this.device.close();
    } catch {
      // Ignore close errors
    }

    this.iface = null;
    this._isOpen = false;
  }

  /**
   * Get current DFU status
   */
  async getStatus(): Promise<DfuStatusResponse> {
    this.ensureOpen();
    return await dfuGetStatus(this.device, this._info.interfaceNumber);
  }

  /**
   * Clear error status
   */
  async clearStatus(): Promise<void> {
    this.ensureOpen();
    await dfuClearStatus(this.device, this._info.interfaceNumber);
  }

  /**
   * Abort current operation
   */
  async abort(): Promise<void> {
    this.ensureOpen();
    await dfuAbort(this.device, this._info.interfaceNumber);
  }

  /**
   * Reset device to idle state
   */
  async resetToIdle(): Promise<void> {
    this.ensureOpen();
    await dfuResetToIdle(this.device, this._info.interfaceNumber);
  }

  /**
   * Set flash address pointer
   * @param address Target address
   */
  async setAddress(address: number): Promise<void> {
    this.ensureOpen();
    await dfuseSetAddress(this.device, this._info.interfaceNumber, address);
  }

  /**
   * Erase a flash sector
   * @param address Address within sector to erase
   */
  async eraseSector(address: number): Promise<void> {
    this.ensureOpen();
    await dfuseEraseSector(this.device, this._info.interfaceNumber, address);
  }

  /**
   * Download data to flash
   * @param data Data to write
   * @param address Target address
   * @param onProgress Optional progress callback
   */
  async download(
    data: Uint8Array,
    address: number,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    this.ensureOpen();
    await dfuseDownload(this.device, this._info.interfaceNumber, address, data, this.transferSize, onProgress);
  }

  /**
   * Upload (read) data from flash
   * @param address Source address
   * @param length Number of bytes to read
   * @returns Read data
   */
  async upload(address: number, length: number): Promise<Uint8Array> {
    this.ensureOpen();
    return await dfuseUpload(this.device, this._info.interfaceNumber, address, length, this.transferSize);
  }

  /**
   * Leave DFU mode and reset device
   */
  async leave(): Promise<void> {
    this.ensureOpen();
    await dfuseLeave(this.device, this._info.interfaceNumber);
  }

  /**
   * Flash firmware image
   * @param firmware Firmware image to flash
   * @param options Flash options
   */
  async flash(firmware: FirmwareImage, options: FlashOptions = {}): Promise<void> {
    this.ensureOpen();

    const {
      verify = true,
      forceFullErase = false,
      leaveInDfuMode = false,
      onProgress,
    } = options;

    // Reset to idle state first
    await this.resetToIdle();

    // Phase 1: Erase flash
    // Strategy: try sector erase → mass erase → read unprotect (each handles more failure modes)
    await this.eraseForFlash(firmware, forceFullErase, onProgress);

    // Phase 2: Download and verify each segment
    for (let i = 0; i < firmware.segments.length; i++) {
      const segment = firmware.segments[i]!;
      await this.download(segment.data, segment.address, onProgress);

      if (verify) {
        try {
          await dfuseVerify(this.device, this._info.interfaceNumber, segment.address, segment.data, this.transferSize, onProgress);
        } catch {
          // Verify failed — likely read protection (RDP) blocking flash readback
          // This is non-fatal: the download succeeded, we just can't read it back
          // Recover device state for next segment
          try { await this.resetToIdle(); } catch { /* ignore */ }
        }
      }
    }

    // Manifest - leave DFU mode and reset
    if (!leaveInDfuMode) {
      if (onProgress) {
        onProgress({
          phase: 'manifest',
          current: 1,
          total: 1,
          percent: 100,
          message: 'Resetting device...',
        });
      }
      await this.leave();
    }
  }

  /**
   * Erase flash for firmware download.
   * Tries sector erase first, then mass erase, then read-unprotect as last resort.
   */
  private async eraseForFlash(
    firmware: FirmwareImage,
    forceFullErase: boolean,
    onProgress?: ProgressCallback,
  ): Promise<void> {
    const iface = this._info.interfaceNumber;

    // Step 1: Try sector erase (fastest when flash isn't write-protected)
    if (this._memoryLayout && !forceFullErase) {
      try {
        for (const segment of firmware.segments) {
          await dfuseEraseRange(this.device, iface, this._memoryLayout, segment.address, segment.data.length, onProgress);
        }
        return;
      } catch {
        // Sector erase failed (write protection?) — fall through to mass erase
        try { await this.resetToIdle(); } catch { /* ignore */ }
        try { await dfuClearStatus(this.device, iface); } catch { /* ignore */ }
        try { await this.resetToIdle(); } catch { /* ignore */ }
      }
    }

    // Step 2: Try mass erase (handles mixed sector sizes, but fails if write-protected)
    try {
      if (onProgress) {
        onProgress({ phase: 'erase', current: 0, total: 1, percent: 0, message: 'Mass erasing flash...' });
      }
      await dfuseMassErase(this.device, iface);
      if (onProgress) {
        onProgress({ phase: 'erase', current: 1, total: 1, percent: 100 });
      }
      return;
    } catch {
      // Mass erase failed (write protection?) — fall through to read unprotect
      try { await this.resetToIdle(); } catch { /* ignore */ }
      try { await dfuClearStatus(this.device, iface); } catch { /* ignore */ }
      try { await this.resetToIdle(); } catch { /* ignore */ }
    }

    // Step 3: Read unprotect — nuclear option, removes all protection + mass erases
    // WARNING: This resets the device, so we must re-open it
    if (onProgress) {
      onProgress({ phase: 'erase', current: 0, total: 1, percent: 0, message: 'Removing flash protection...' });
    }

    try {
      await dfuseReadUnprotect(this.device, iface);
    } catch {
      // Expected — device resets during unprotect, USB transfer may fail
    }

    // Device has reset — close our handle and wait for it to re-enumerate
    try { await this.close(); } catch { /* ignore */ }
    this._isOpen = false;
    this.iface = null;

    // Wait for device to come back (typically 2-4 seconds)
    await new Promise(resolve => setTimeout(resolve, 3000));

    const reappeared = await DfuDevice.waitForDevice(10000, this._info.vendorId);
    if (!reappeared) {
      throw new DfuError('Device did not re-appear after read unprotect. Reconnect and retry.');
    }

    // Take ownership of the new device handle
    this.device = (reappeared as any).device;
    await this.open();

    if (onProgress) {
      onProgress({ phase: 'erase', current: 1, total: 1, percent: 100, message: 'Flash protection removed' });
    }
  }

  /**
   * Ensure device is open
   */
  private ensureOpen(): void {
    if (!this._isOpen || !this.iface) {
      throw new DfuError('Device not open');
    }
  }
}

/**
 * Check if a USB device is an STM32 in DFU mode
 * @param vid Vendor ID
 * @param pid Product ID
 * @returns true if it appears to be STM32 DFU
 */
export function isStm32DfuDevice(vid: number, pid: number): boolean {
  return vid === STM32_VID && ALL_STM32_DFU_PIDS.includes(pid);
}

/**
 * Get human-readable device description
 * @param info Device info
 * @returns Description string
 */
export function getDeviceDescription(info: DfuDeviceInfo): string {
  const parts: string[] = [];

  if (info.manufacturer) {
    parts.push(info.manufacturer);
  }

  if (info.productName) {
    parts.push(info.productName);
  }

  if (parts.length === 0) {
    parts.push(`USB Device ${info.vendorId.toString(16).padStart(4, '0')}:${info.productId.toString(16).padStart(4, '0')}`);
  }

  if (info.interfaceName) {
    const layout = parseMemoryLayout(info.interfaceName);
    if (layout) {
      parts.push(`- ${layout.name}`);
    }
  }

  return parts.join(' ');
}
