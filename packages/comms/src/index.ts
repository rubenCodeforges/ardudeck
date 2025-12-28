/**
 * @ardudeck/comms
 * Communication transport layer for MAVLink connections
 */

// Interfaces
export type {
  Transport,
  TransportOptions,
  TransportEvents,
  SerialPortInfo,
  TcpOptions,
  UdpOptions,
} from './interfaces/transport.js';

export { BaseTransport } from './interfaces/transport.js';

// Transports
export { SerialTransport, listSerialPorts } from './transports/serial-transport.js';
export { TcpTransport } from './transports/tcp-transport.js';
export { UdpTransport } from './transports/udp-transport.js';

// Utilities
export type { ScanResult, ScanOptions } from './utils/port-scanner.js';
export { scanPorts, scanPort, checkPort } from './utils/port-scanner.js';
