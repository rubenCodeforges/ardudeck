/**
 * Port Scanner
 * Auto-detect MAVLink devices on serial ports
 * Ported from MissionPlanner/ExtLibs/Utilities/CommsSerialScan.cs
 */

import { SerialTransport, listSerialPorts } from '../transports/serial-transport.js';
import { SerialPortInfo } from '../interfaces/transport.js';
import { MAVLinkParser, type MAVLinkPacket } from '@ardudeck/mavlink-ts';

/**
 * Baud rates to try when scanning (order matters - most common first)
 */
const SCAN_BAUD_RATES = [115200, 57600, 38400, 19200, 9600];

/**
 * Default timeout for each scan attempt in milliseconds
 */
const SCAN_TIMEOUT_MS = 2000;

/**
 * Result of a successful port scan
 */
export interface ScanResult {
  /** Port path */
  port: string;
  /** Detected baud rate */
  baudRate: number;
  /** Port info */
  portInfo: SerialPortInfo;
  /** System ID of the first detected MAVLink device */
  systemId?: number;
  /** Component ID of the first detected MAVLink device */
  componentId?: number;
}

/**
 * Scan options
 */
export interface ScanOptions {
  /** Baud rates to try (default: [115200, 57600, 38400, 19200, 9600]) */
  baudRates?: number[];
  /** Timeout per scan attempt in ms (default: 2000) */
  timeout?: number;
  /** Stop after finding first valid port (default: false) */
  stopOnFirst?: boolean;
  /** Ports to exclude from scanning */
  excludePorts?: string[];
  /** Progress callback */
  onProgress?: (port: string, baudRate: number, status: 'scanning' | 'found' | 'failed') => void;
}

/**
 * Scan a single port at a specific baud rate
 * @returns ScanResult if MAVLink detected, null otherwise
 */
async function scanPortAtBaud(
  port: SerialPortInfo,
  baudRate: number,
  timeout: number,
  onProgress?: ScanOptions['onProgress']
): Promise<ScanResult | null> {
  const transport = new SerialTransport(port.path, { baudRate });

  try {
    onProgress?.(port.path, baudRate, 'scanning');
    await transport.open();
    await transport.discardInBuffer();

    // Create a MAVLink parser
    const parser = new MAVLinkParser();

    // Wait for data to accumulate
    await new Promise((resolve) => setTimeout(resolve, timeout));

    // Read available data
    const available = transport.bytesToRead;
    if (available === 0) {
      return null;
    }

    const buffer = new Uint8Array(available);
    const bytesRead = await transport.read(buffer, 0, available);

    if (bytesRead === 0) {
      return null;
    }

    // Try to parse MAVLink packets using async generator
    const packets: MAVLinkPacket[] = [];
    for await (const packet of parser.parse(buffer.slice(0, bytesRead))) {
      packets.push(packet);
    }

    if (packets.length > 0) {
      const firstPacket = packets[0]!;
      onProgress?.(port.path, baudRate, 'found');

      return {
        port: port.path,
        baudRate,
        portInfo: port,
        systemId: firstPacket.sysid,
        componentId: firstPacket.compid,
      };
    }

    return null;
  } catch (error) {
    onProgress?.(port.path, baudRate, 'failed');
    return null;
  } finally {
    try {
      await transport.close();
    } catch {
      // Ignore close errors
    }
  }
}

/**
 * Scan all serial ports for MAVLink devices
 * @param options - Scan configuration options
 * @returns Array of detected MAVLink ports
 */
export async function scanPorts(options: ScanOptions = {}): Promise<ScanResult[]> {
  const {
    baudRates = SCAN_BAUD_RATES,
    timeout = SCAN_TIMEOUT_MS,
    stopOnFirst = false,
    excludePorts = [],
    onProgress,
  } = options;

  // Get list of available ports
  const allPorts = await listSerialPorts();
  const ports = allPorts.filter((p) => !excludePorts.includes(p.path));

  const results: ScanResult[] = [];

  // Scan ports in parallel (one port at a time for each baud rate)
  const scanPromises = ports.map(async (port) => {
    for (const baudRate of baudRates) {
      if (stopOnFirst && results.length > 0) {
        return;
      }

      const result = await scanPortAtBaud(port, baudRate, timeout, onProgress);
      if (result) {
        results.push(result);
        if (stopOnFirst) {
          return;
        }
        break; // Found on this port, skip remaining baud rates
      }
    }
  });

  await Promise.all(scanPromises);

  return results;
}

/**
 * Scan a specific port for MAVLink
 * @param portPath - Port path (e.g., COM3, /dev/ttyUSB0)
 * @param options - Scan options
 * @returns ScanResult if found, null otherwise
 */
export async function scanPort(portPath: string, options: ScanOptions = {}): Promise<ScanResult | null> {
  const { baudRates = SCAN_BAUD_RATES, timeout = SCAN_TIMEOUT_MS, onProgress } = options;

  const ports = await listSerialPorts();
  const port = ports.find((p) => p.path === portPath);

  if (!port) {
    throw new Error(`Port ${portPath} not found`);
  }

  for (const baudRate of baudRates) {
    const result = await scanPortAtBaud(port, baudRate, timeout, onProgress);
    if (result) {
      return result;
    }
  }

  return null;
}

/**
 * Check if a specific port/baud combination has a MAVLink device
 * @param portPath - Port path
 * @param baudRate - Baud rate to use
 * @param timeout - Scan timeout in ms
 * @returns true if MAVLink device detected
 */
export async function checkPort(portPath: string, baudRate: number, timeout = SCAN_TIMEOUT_MS): Promise<boolean> {
  const ports = await listSerialPorts();
  const port = ports.find((p) => p.path === portPath);

  if (!port) {
    return false;
  }

  const result = await scanPortAtBaud(port, baudRate, timeout);
  return result !== null;
}
