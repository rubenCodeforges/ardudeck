/**
 * Serial Transport
 * Implementation of Transport interface for serial port communication
 */

import { SerialPort } from 'serialport';
import { BaseTransport, TransportOptions, SerialPortInfo } from '../interfaces/transport.js';

/**
 * Serial port transport for MAVLink communication
 */
export class SerialTransport extends BaseTransport {
  private port: SerialPort | null = null;
  private rxBuffer: Uint8Array[] = [];
  private _portName: string;
  private _isOpen = false;
  private _dataBits: 5 | 6 | 7 | 8;
  private _parity: 'none' | 'even' | 'odd' | 'mark' | 'space';
  private _stopBits: 1 | 1.5 | 2;

  constructor(portName: string, options: TransportOptions = {}) {
    super();
    this._portName = portName;
    this.baudRate = options.baudRate ?? 115200;
    this._dataBits = options.dataBits ?? 8;
    this._parity = options.parity ?? 'none';
    this._stopBits = options.stopBits ?? 1;
    this.dtrEnable = options.dtrEnable ?? false;
    this.rtsEnable = options.rtsEnable ?? false;
    this.readTimeout = options.readTimeout ?? 5000;
    this.writeTimeout = options.writeTimeout ?? 5000;
  }

  get isOpen(): boolean {
    return this._isOpen && this.port?.isOpen === true;
  }

  get bytesToRead(): number {
    return this.rxBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  get bytesToWrite(): number {
    return 0; // SerialPort doesn't expose this easily
  }

  get portName(): string {
    return this._portName;
  }

  async open(): Promise<void> {
    if (this.isOpen) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: this._portName,
        baudRate: this.baudRate,
        dataBits: this._dataBits,
        parity: this._parity,
        stopBits: this._stopBits,
        autoOpen: false,
      });

      this.port.on('data', (data: Buffer) => {
        const uint8 = new Uint8Array(data);
        this.rxBuffer.push(uint8);
        this.emit('data', uint8);
      });

      this.port.on('error', (err: Error) => {
        // BSOD FIX: Mark port as closed on error to prevent stale state
        this._isOpen = false;
        // BSOD FIX: Remove all listeners to prevent further events after error
        // This prevents zombie event handlers from firing on a dead port
        this.port?.removeAllListeners();
        this.emit('error', err);
      });

      this.port.on('close', () => {
        this._isOpen = false;
        this.emit('close');
      });

      this.port.open((err) => {
        if (err) {
          reject(new Error(`Failed to open port ${this._portName}: ${err.message}`));
          return;
        }

        this._isOpen = true;

        // Set DTR/RTS after opening
        if (this.port) {
          this.port.set({ dtr: this.dtrEnable, rts: this.rtsEnable }, (err) => {
            if (err) {
              console.warn('Failed to set DTR/RTS:', err.message);
            }
          });
        }

        this.emit('open');
        resolve();
      });
    });
  }

  /**
   * Close the serial port with graceful shutdown
   * BSOD FIX: Added drain before close and settling delay to prevent driver stress
   * Added timeout to prevent hanging if port is in bad state
   */
  async close(): Promise<void> {
    if (!this.port) {
      this._isOpen = false;
      return;
    }

    // Mark as closed immediately to prevent new operations
    this._isOpen = false;

    // BSOD FIX: Drain pending writes before closing to prevent driver issues
    // Use timeout to prevent hanging
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          this.port!.drain(() => resolve());
        }),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Drain timeout')), 1000)
        ),
      ]);
    } catch {
      // Ignore drain errors/timeout - port may already be in error state
      console.warn('[SerialTransport] Drain timeout or error, continuing with close');
    }

    // BSOD FIX: Small delay for driver to process drained data
    await new Promise(r => setTimeout(r, 100));

    return new Promise((resolve) => {
      // Timeout for close operation
      const closeTimeout = setTimeout(() => {
        console.warn('[SerialTransport] Close timeout, forcing cleanup');
        this.port = null;
        resolve();
      }, 2000);

      this.port!.close((err) => {
        clearTimeout(closeTimeout);
        if (err) {
          // Don't reject on close errors - port may already be closed
          console.warn(`[SerialTransport] Warning closing port: ${err.message}`);
        }
        this.port = null;
        resolve();
      });
    });
  }

  async read(buffer: Uint8Array, offset: number, count: number): Promise<number> {
    if (!this.isOpen) {
      throw new Error('Port is not open');
    }

    // Wait for data with timeout
    const startTime = Date.now();
    while (this.bytesToRead < count) {
      if (Date.now() - startTime > this.readTimeout) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Collect bytes from buffer
    let bytesRead = 0;
    while (bytesRead < count && this.rxBuffer.length > 0) {
      const chunk = this.rxBuffer[0];
      if (!chunk) break;

      const needed = count - bytesRead;
      if (chunk.length <= needed) {
        buffer.set(chunk, offset + bytesRead);
        bytesRead += chunk.length;
        this.rxBuffer.shift();
      } else {
        buffer.set(chunk.slice(0, needed), offset + bytesRead);
        this.rxBuffer[0] = chunk.slice(needed);
        bytesRead += needed;
      }
    }

    return bytesRead;
  }

  async readByte(): Promise<number> {
    if (this.bytesToRead === 0) {
      return -1;
    }

    const buffer = new Uint8Array(1);
    const read = await this.read(buffer, 0, 1);
    return read > 0 ? buffer[0]! : -1;
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.port || !this.isOpen) {
      throw new Error('Port is not open');
    }

    return new Promise((resolve, reject) => {
      // Timeout to prevent hanging on write
      const timeoutId = setTimeout(() => {
        reject(new Error('Write timeout - port may be in bad state'));
      }, this.writeTimeout);

      this.port!.write(Buffer.from(data), (err) => {
        if (err) {
          clearTimeout(timeoutId);
          reject(new Error(`Write failed: ${err.message}`));
          return;
        }
        this.port!.drain((err) => {
          clearTimeout(timeoutId);
          if (err) {
            reject(new Error(`Drain failed: ${err.message}`));
            return;
          }
          resolve();
        });
      });
    });
  }

  async discardInBuffer(): Promise<void> {
    this.rxBuffer = [];
    if (this.port && this.isOpen) {
      return new Promise((resolve) => {
        this.port!.flush(() => {
          resolve();
        });
      });
    }
  }

  async toggleDTR(): Promise<void> {
    if (!this.port || !this.isOpen) {
      return;
    }

    this.dtrEnable = !this.dtrEnable;
    return new Promise((resolve) => {
      this.port!.set({ dtr: this.dtrEnable }, () => {
        resolve();
      });
    });
  }

  /**
   * Update baud rate on open port
   */
  async setBaudRate(baudRate: number): Promise<void> {
    this.baudRate = baudRate;
    if (this.port && this.isOpen) {
      return new Promise((resolve, reject) => {
        this.port!.update({ baudRate }, (err) => {
          if (err) {
            reject(new Error(`Failed to update baud rate: ${err.message}`));
            return;
          }
          resolve();
        });
      });
    }
  }
}

/**
 * List available serial ports
 */
export async function listSerialPorts(): Promise<SerialPortInfo[]> {
  const ports = await SerialPort.list();
  return ports.map((p) => ({
    path: p.path,
    manufacturer: p.manufacturer,
    serialNumber: p.serialNumber,
    productId: p.productId,
    vendorId: p.vendorId,
    friendlyName: p.friendlyName,
  }));
}
