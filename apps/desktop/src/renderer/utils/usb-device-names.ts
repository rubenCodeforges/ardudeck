/**
 * USB VID/PID to display name mapping for serial port dropdown.
 * Used as fallback when OS-provided friendlyName is unavailable.
 *
 * VID/PID keys are lowercase hex without 0x prefix: "vid:pid"
 */

import type { SerialPortInfo } from '@ardudeck/comms';

const USB_DEVICE_NAMES: Record<string, string> = {
  // ArduPilot ChibiOS (generic)
  '1209:5740': 'ArduPilot',
  '1209:5741': 'ArduPilot',

  // Pixhawk family (3D Robotics)
  '26ac:0011': 'Pixhawk 1',
  '26ac:0032': 'Pixhawk 4',
  '26ac:0033': 'Pixhawk 4',

  // Cube series (Hex/ProfiCNC)
  '2dae:1011': 'CubeBlack',
  '2dae:1012': 'CubeBlack',
  '2dae:1016': 'CubeOrange',
  '2dae:1017': 'CubeOrange',
  '2dae:1058': 'CubeOrange+',
  '2dae:1059': 'CubeOrange+',

  // SpeedyBee
  '3162:004b': 'SpeedyBee F405',
  '3162:004c': 'SpeedyBee H7',

  // Holybro Pixhawk 6
  '3185:0038': 'Pixhawk 6X',
  '3185:0039': 'Pixhawk 6C',

  // Matek (commonly uses STM32 VID in normal mode)
  '0483:5741': 'Matek FC',

  // STM32 DFU / Virtual COM port
  '0483:df11': 'STM32 DFU Bootloader',
  '0483:5740': 'STM32 Virtual COM',
  '0483:5742': 'STM32 FC',

  // iNav / Betaflight boards (common)
  '2e3c:df11': 'AT32 DFU Bootloader',

  // Arduino-based (legacy APM, old Pixhawk USB chips)
  '2341:0042': 'APM 2.x (Mega 2560)',
  '2341:0010': 'Arduino Mega 2560',
  '2341:0043': 'Arduino Uno',
  '2341:0001': 'Arduino Mega',
  '2a03:0042': 'Arduino Mega 2560',
  '2a03:0043': 'Arduino Uno',

  // CH340 serial (common clone boards)
  '1a86:7523': 'CH340 Serial Adapter',
  '1a86:55d4': 'CH9102 Serial Adapter',

  // Silicon Labs CP210x
  '10c4:ea60': 'CP2102 Serial Adapter',
  '10c4:ea70': 'CP2105 Serial Adapter',

  // FTDI
  '0403:6001': 'FTDI Serial Adapter',
  '0403:6010': 'FTDI Dual Serial',
  '0403:6015': 'FTDI FT231X',

  // Prolific
  '067b:2303': 'PL2303 Serial Adapter',
  '067b:23a3': 'PL2303 Serial Adapter',
};

/**
 * Format a serial port for display in the connection dropdown.
 *
 * Priority:
 * 1. OS-provided friendlyName (Windows registry, most accurate)
 * 2. Known USB VID/PID match → "DeviceName (path)"
 * 3. Fallback → "path (manufacturer)" or just "path"
 */
export function formatPortDisplayName(port: SerialPortInfo): string {
  // Priority 1: OS-provided friendly name
  if (port.friendlyName) {
    return port.friendlyName;
  }

  // Priority 2: VID/PID lookup
  if (port.vendorId && port.productId) {
    const key = `${port.vendorId.toLowerCase()}:${port.productId.toLowerCase()}`;
    const deviceName = USB_DEVICE_NAMES[key];
    if (deviceName) {
      return `${deviceName} (${port.path})`;
    }
  }

  // Priority 3: Fallback with manufacturer
  if (port.manufacturer) {
    return `${port.path} (${port.manufacturer})`;
  }

  return port.path;
}
