/**
 * Board Detector
 * Enumerates USB devices and matches against known board VID/PID
 * Also queries STM32 bootloader to detect chip type when possible
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { KNOWN_BOARDS, type DetectedBoard, getSTM32ChipInfo } from '../../shared/firmware-types.js';
import { detectSTM32Chip } from './stm32-bootloader.js';

const execAsync = promisify(exec);

/**
 * USB device info from system enumeration
 */
interface UsbDevice {
  vid: string;
  pid: string;
  port?: string;
  description?: string;
}

/**
 * Parse Windows wmic output for USB devices
 */
function parseWindowsDevices(output: string): UsbDevice[] {
  const devices: UsbDevice[] = [];
  const lines = output.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Match VID_XXXX&PID_XXXX pattern
    const vidMatch = line.match(/VID_([0-9A-Fa-f]{4})/i);
    const pidMatch = line.match(/PID_([0-9A-Fa-f]{4})/i);

    if (vidMatch && pidMatch) {
      const vid = vidMatch[1].toLowerCase();
      const pid = pidMatch[1].toLowerCase();

      // Try to extract COM port
      const comMatch = line.match(/\((COM\d+)\)/);

      devices.push({
        vid,
        pid,
        port: comMatch?.[1],
        description: line.split('  ').filter(Boolean)[0]?.trim(),
      });
    }
  }

  return devices;
}

/**
 * Parse Linux lsusb output
 */
function parseLinuxDevices(output: string): UsbDevice[] {
  const devices: UsbDevice[] = [];
  const lines = output.split('\n').filter(line => line.trim());

  for (const line of lines) {
    // Bus 001 Device 003: ID 0483:df11 STMicroelectronics STM Device in DFU Mode
    const match = line.match(/ID\s+([0-9a-f]{4}):([0-9a-f]{4})\s+(.+)/i);
    if (match) {
      devices.push({
        vid: match[1].toLowerCase(),
        pid: match[2].toLowerCase(),
        description: match[3].trim(),
      });
    }
  }

  return devices;
}

/**
 * Parse macOS system_profiler output
 */
function parseMacDevices(output: string): UsbDevice[] {
  const devices: UsbDevice[] = [];

  // Parse XML-ish output from system_profiler
  const sections = output.split(/\n\s*\n/);

  for (const section of sections) {
    const vidMatch = section.match(/Vendor ID:\s*0x([0-9a-f]{4})/i);
    const pidMatch = section.match(/Product ID:\s*0x([0-9a-f]{4})/i);
    const nameMatch = section.match(/^\s+(.+):$/m);

    if (vidMatch && pidMatch) {
      devices.push({
        vid: vidMatch[1].toLowerCase(),
        pid: pidMatch[1].toLowerCase(),
        description: nameMatch?.[1]?.trim(),
      });
    }
  }

  return devices;
}

/**
 * Enumerate USB devices on the system
 */
async function enumerateUsbDevices(): Promise<UsbDevice[]> {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      // Use wmic to list USB devices
      const { stdout } = await execAsync(
        'wmic path Win32_PnPEntity where "DeviceID like \'%USB%\'" get DeviceID,Name /format:list',
        { timeout: 5000 }
      );
      return parseWindowsDevices(stdout);
    } else if (platform === 'linux') {
      // Use lsusb
      const { stdout } = await execAsync('lsusb', { timeout: 5000 });
      return parseLinuxDevices(stdout);
    } else if (platform === 'darwin') {
      // Use system_profiler
      const { stdout } = await execAsync(
        'system_profiler SPUSBDataType',
        { timeout: 5000 }
      );
      return parseMacDevices(stdout);
    }
  } catch (error) {
    console.error('Failed to enumerate USB devices:', error);
  }

  return [];
}

/**
 * Find serial port for a USB device
 */
async function findSerialPortForDevice(vid: string, pid: string): Promise<string | undefined> {
  const platform = process.platform;

  try {
    if (platform === 'win32') {
      const { stdout } = await execAsync(
        `wmic path Win32_SerialPort where "PNPDeviceID like '%VID_${vid.toUpperCase()}&PID_${pid.toUpperCase()}%'" get DeviceID /format:list`,
        { timeout: 3000 }
      );

      const match = stdout.match(/DeviceID=(COM\d+)/i);
      return match?.[1];
    } else if (platform === 'darwin') {
      // On macOS, scan /dev for tty.usbmodem* and tty.usbserial* devices
      // and try to match via ioreg USB info
      try {
        // Get list of USB serial devices
        const { stdout: lsOutput } = await execAsync('ls /dev/tty.usb* 2>/dev/null || true', { timeout: 3000 });
        const devices = lsOutput.split('\n').filter(d => d.trim());

        if (devices.length === 0) return undefined;

        // If there's only one device, return it
        if (devices.length === 1) return devices[0];

        // Try to match via ioreg - look for VID/PID
        const { stdout: ioregOutput } = await execAsync(
          `ioreg -r -c IOUSBHostDevice -l | grep -A20 "idVendor.*${parseInt(vid, 16)}" | grep -A10 "idProduct.*${parseInt(pid, 16)}" | grep "IOCalloutDevice" | head -1`,
          { timeout: 5000 }
        );

        const match = ioregOutput.match(/"IOCalloutDevice"\s*=\s*"([^"]+)"/);
        if (match) return match[1];

        // Fallback: return first device if ioreg doesn't find a match
        return devices[0];
      } catch {
        // If ioreg fails, try to find any USB serial device
        try {
          const { stdout } = await execAsync('ls /dev/tty.usb* 2>/dev/null | head -1', { timeout: 2000 });
          return stdout.trim() || undefined;
        } catch {
          return undefined;
        }
      }
    } else if (platform === 'linux') {
      // On Linux, check /dev/ttyACM* and /dev/ttyUSB*
      try {
        const { stdout } = await execAsync('ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null | head -1', { timeout: 2000 });
        return stdout.trim() || undefined;
      } catch {
        return undefined;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
}

/**
 * Detect connected flight controller boards
 */
export async function detectBoards(): Promise<DetectedBoard[]> {
  const usbDevices = await enumerateUsbDevices();
  const detectedBoards: DetectedBoard[] = [];

  for (const device of usbDevices) {
    const key = `${device.vid}:${device.pid}`;
    const knownBoard = KNOWN_BOARDS[key];

    if (knownBoard) {
      // Find serial port if not already found
      let port = device.port;
      if (!port && knownBoard.flasher !== 'dfu') {
        port = await findSerialPortForDevice(device.vid, device.pid);
      }

      const board: DetectedBoard = {
        name: knownBoard.name || device.description || 'Unknown Board',
        boardId: knownBoard.boardId || key,
        mcuType: knownBoard.mcuType || 'Unknown',
        flasher: knownBoard.flasher || 'dfu',
        port,
        usbVid: parseInt(device.vid, 16),
        usbPid: parseInt(device.pid, 16),
        inBootloader: knownBoard.inBootloader || false,
        detectionMethod: 'vid-pid',
      };

      // If board has COM port but unknown MCU, try STM32 bootloader query
      if (port && board.mcuType === 'Unknown') {
        try {
          const stm32Result = await detectSTM32Chip(port);
          if (stm32Result) {
            board.chipId = stm32Result.chipId;
            board.detectedMcu = stm32Result.chipInfo?.mcu;
            board.mcuType = stm32Result.chipInfo?.mcu || board.mcuType;
            board.detectionMethod = 'bootloader';
            board.inBootloader = true;

            // Update board name to include detected MCU
            if (stm32Result.chipInfo) {
              board.name = `${knownBoard.name?.split(' (')[0]} → ${stm32Result.chipInfo.mcu}`;
            }

            // Determine flasher type based on chip family
            if (stm32Result.chipInfo?.family) {
              board.flasher = 'dfu';  // All STM32 use DFU
            }
          }
        } catch {
          // Bootloader query failed, continue with VID/PID info only
        }
      }

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
