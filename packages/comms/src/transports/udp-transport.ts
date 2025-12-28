/**
 * UDP Transport
 * Implementation of Transport interface for UDP socket communication
 */

import { createSocket, Socket as DgramSocket } from 'dgram';
import { BaseTransport, UdpOptions } from '../interfaces/transport.js';

/**
 * UDP socket transport for MAVLink communication
 * Supports both unicast and broadcast modes
 */
export class UdpTransport extends BaseTransport {
  private socket: DgramSocket | null = null;
  private rxBuffer: Uint8Array[] = [];
  private _localPort: number;
  private _remoteHost: string | undefined;
  private _remotePort: number | undefined;
  private _isOpen = false;

  constructor(options: UdpOptions = {}) {
    super();
    this._localPort = options.localPort ?? 14550;
    this._remoteHost = options.remoteHost;
    this._remotePort = options.remotePort;
    this.readTimeout = options.readTimeout ?? 5000;
    this.writeTimeout = options.writeTimeout ?? 5000;
  }

  get isOpen(): boolean {
    return this._isOpen && this.socket !== null;
  }

  get bytesToRead(): number {
    return this.rxBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  get bytesToWrite(): number {
    return 0; // UDP doesn't buffer
  }

  get portName(): string {
    if (this._remoteHost && this._remotePort) {
      return `udp://${this._remoteHost}:${this._remotePort}`;
    }
    return `udp://0.0.0.0:${this._localPort}`;
  }

  /**
   * Set remote endpoint for sending
   */
  setRemoteEndpoint(host: string, port: number): void {
    this._remoteHost = host;
    this._remotePort = port;
  }

  async open(): Promise<void> {
    if (this.isOpen) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.socket = createSocket('udp4');

      this.socket.on('message', (msg: Buffer, rinfo) => {
        const uint8 = new Uint8Array(msg);
        this.rxBuffer.push(uint8);
        this.emit('data', uint8);

        // Auto-learn remote endpoint from first message
        if (!this._remoteHost) {
          this._remoteHost = rinfo.address;
          this._remotePort = rinfo.port;
        }
      });

      this.socket.on('error', (err: Error) => {
        this.emit('error', err);
        if (!this._isOpen) {
          reject(err);
        }
      });

      this.socket.on('close', () => {
        this._isOpen = false;
        this.emit('close');
      });

      this.socket.bind(this._localPort, () => {
        this._isOpen = true;
        this.emit('open');
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (!this.socket) {
      return;
    }

    return new Promise((resolve) => {
      this.socket!.close(() => {
        this._isOpen = false;
        this.socket = null;
        resolve();
      });
    });
  }

  async read(buffer: Uint8Array, offset: number, count: number): Promise<number> {
    if (!this.isOpen) {
      throw new Error('Socket is not bound');
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
      throw new Error('Socket is not bound');
    }

    if (!this._remoteHost || !this._remotePort) {
      throw new Error('Remote endpoint not set. Use setRemoteEndpoint() or wait for incoming message.');
    }

    return new Promise((resolve, reject) => {
      this.socket!.send(Buffer.from(data), this._remotePort!, this._remoteHost!, (err) => {
        if (err) {
          reject(new Error(`Write failed: ${err.message}`));
          return;
        }
        resolve();
      });
    });
  }

  async discardInBuffer(): Promise<void> {
    this.rxBuffer = [];
  }
}
