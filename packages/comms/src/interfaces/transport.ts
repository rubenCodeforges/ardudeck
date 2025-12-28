/**
 * Transport Interface
 * Abstraction for MAVLink communication channels
 * Ported from MissionPlanner/ExtLibs/Interfaces/ICommsSerial.cs
 */

import { EventEmitter } from 'events';

/**
 * Transport connection options
 */
export interface TransportOptions {
  /** Baud rate for serial connections */
  baudRate?: number;
  /** Data bits (5, 6, 7, or 8) */
  dataBits?: 5 | 6 | 7 | 8;
  /** Enable DTR signal */
  dtrEnable?: boolean;
  /** Enable RTS signal */
  rtsEnable?: boolean;
  /** Read timeout in milliseconds */
  readTimeout?: number;
  /** Write timeout in milliseconds */
  writeTimeout?: number;
}

/**
 * Transport events
 */
export interface TransportEvents {
  data: (data: Uint8Array) => void;
  error: (error: Error) => void;
  open: () => void;
  close: () => void;
}

/**
 * Abstract transport interface for MAVLink communication
 * Supports serial, TCP, UDP connections
 */
export interface Transport {
  /** Whether the transport is currently open */
  readonly isOpen: boolean;

  /** Number of bytes available to read */
  readonly bytesToRead: number;

  /** Number of bytes waiting to be sent */
  readonly bytesToWrite: number;

  /** Connection identifier (port name, address:port, etc.) */
  readonly portName: string;

  /** Current baud rate (serial only) */
  baudRate: number;

  /** DTR signal state (serial only) */
  dtrEnable: boolean;

  /** RTS signal state (serial only) */
  rtsEnable: boolean;

  /** Read timeout in milliseconds */
  readTimeout: number;

  /** Write timeout in milliseconds */
  writeTimeout: number;

  /**
   * Open the transport connection
   */
  open(): Promise<void>;

  /**
   * Close the transport connection
   */
  close(): Promise<void>;

  /**
   * Read data from the transport
   * @param buffer - Buffer to read into
   * @param offset - Offset in buffer to start writing
   * @param count - Maximum number of bytes to read
   * @returns Number of bytes actually read
   */
  read(buffer: Uint8Array, offset: number, count: number): Promise<number>;

  /**
   * Read a single byte from the transport
   * @returns The byte read, or -1 if no data available
   */
  readByte(): Promise<number>;

  /**
   * Write data to the transport
   * @param data - Data to write
   */
  write(data: Uint8Array): Promise<void>;

  /**
   * Write a string to the transport
   * @param text - Text to write
   */
  writeString(text: string): Promise<void>;

  /**
   * Discard all data in the input buffer
   */
  discardInBuffer(): Promise<void>;

  /**
   * Toggle DTR signal (serial only)
   */
  toggleDTR(): Promise<void>;

  /**
   * Subscribe to data events
   */
  on(event: 'data', listener: (data: Uint8Array) => void): this;

  /**
   * Subscribe to error events
   */
  on(event: 'error', listener: (error: Error) => void): this;

  /**
   * Subscribe to open event
   */
  on(event: 'open', listener: () => void): this;

  /**
   * Subscribe to close event
   */
  on(event: 'close', listener: () => void): this;

  /**
   * Remove event listener
   */
  off(event: string, listener: (...args: unknown[]) => void): this;
}

/**
 * Base transport class with common functionality
 */
export abstract class BaseTransport extends EventEmitter implements Transport {
  abstract readonly isOpen: boolean;
  abstract readonly bytesToRead: number;
  abstract readonly bytesToWrite: number;
  abstract readonly portName: string;

  baudRate = 115200;
  dtrEnable = false;
  rtsEnable = false;
  readTimeout = 5000;
  writeTimeout = 5000;

  abstract open(): Promise<void>;
  abstract close(): Promise<void>;
  abstract read(buffer: Uint8Array, offset: number, count: number): Promise<number>;
  abstract readByte(): Promise<number>;
  abstract write(data: Uint8Array): Promise<void>;
  abstract discardInBuffer(): Promise<void>;

  async writeString(text: string): Promise<void> {
    const encoder = new TextEncoder();
    await this.write(encoder.encode(text));
  }

  async toggleDTR(): Promise<void> {
    this.dtrEnable = !this.dtrEnable;
  }
}

/**
 * Serial port info returned by port listing
 */
export interface SerialPortInfo {
  /** Port path (e.g., COM3, /dev/ttyUSB0) */
  path: string;
  /** Manufacturer name */
  manufacturer?: string;
  /** Serial number */
  serialNumber?: string;
  /** Product ID */
  productId?: string;
  /** Vendor ID */
  vendorId?: string;
  /** Friendly name */
  friendlyName?: string;
}

/**
 * TCP connection options
 */
export interface TcpOptions extends TransportOptions {
  host: string;
  port: number;
}

/**
 * UDP connection options
 */
export interface UdpOptions extends TransportOptions {
  /** Local port to bind to */
  localPort?: number;
  /** Remote host for sending */
  remoteHost?: string;
  /** Remote port for sending */
  remotePort?: number;
}
