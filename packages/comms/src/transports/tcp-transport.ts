/**
 * TCP Transport
 * Implementation of Transport interface for TCP socket communication
 */

import { Socket, createConnection } from 'net';
import { BaseTransport, TcpOptions } from '../interfaces/transport.js';

/**
 * TCP socket transport for MAVLink communication
 */
export class TcpTransport extends BaseTransport {
  private socket: Socket | null = null;
  private rxBuffer: Uint8Array[] = [];
  private _host: string;
  private _port: number;
  private _isOpen = false;

  constructor(options: TcpOptions) {
    super();
    this._host = options.host;
    this._port = options.port;
    this.readTimeout = options.readTimeout ?? 5000;
    this.writeTimeout = options.writeTimeout ?? 5000;
  }

  get isOpen(): boolean {
    return this._isOpen && this.socket !== null && !this.socket.destroyed;
  }

  get bytesToRead(): number {
    return this.rxBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  get bytesToWrite(): number {
    return this.socket?.writableLength ?? 0;
  }

  get portName(): string {
    return `${this._host}:${this._port}`;
  }

  async open(): Promise<void> {
    if (this.isOpen) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = createConnection({ host: this._host, port: this._port });

      const timeoutId = setTimeout(() => {
        this.socket?.destroy();
        reject(new Error(`Connection timeout to ${this.portName}`));
      }, this.readTimeout);

      this.socket.on('connect', () => {
        clearTimeout(timeoutId);
        this._isOpen = true;
        this.emit('open');
        resolve();
      });

      this.socket.on('data', (data: Buffer) => {
        const uint8 = new Uint8Array(data);
        this.rxBuffer.push(uint8);
        this.emit('data', uint8);
      });

      this.socket.on('error', (err: Error) => {
        clearTimeout(timeoutId);
        this.emit('error', err);
        if (!this._isOpen) {
          reject(err);
        }
      });

      this.socket.on('close', () => {
        this._isOpen = false;
        this.emit('close');
      });
    });
  }

  async close(): Promise<void> {
    if (!this.socket) {
      return;
    }

    return new Promise((resolve) => {
      this.socket!.end(() => {
        this._isOpen = false;
        this.socket = null;
        resolve();
      });
    });
  }

  async read(buffer: Uint8Array, offset: number, count: number): Promise<number> {
    if (!this.isOpen) {
      throw new Error('Socket is not connected');
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
    if (!this.socket || !this.isOpen) {
      throw new Error('Socket is not connected');
    }

    return new Promise((resolve, reject) => {
      const success = this.socket!.write(Buffer.from(data), (err) => {
        if (err) {
          reject(new Error(`Write failed: ${err.message}`));
          return;
        }
        resolve();
      });

      if (!success) {
        // Buffer is full, wait for drain
        this.socket!.once('drain', () => resolve());
      }
    });
  }

  async discardInBuffer(): Promise<void> {
    this.rxBuffer = [];
  }
}
