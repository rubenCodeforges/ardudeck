/**
 * UDP Transport
 * Implementation of Transport interface for UDP socket communication
 */

import { createSocket, Socket as DgramSocket } from 'dgram';
import { BaseTransport, UdpOptions } from '../interfaces/transport.js';

const MAVLINK_STX_V1 = 0xfe;
const MAVLINK_STX_V2 = 0xfd;

// Backpack config.cpp mavlinkListenPort; its telemetry comes from another socket.
const ELRS_UPLINK_PORT = 14555;

// ELRS MAVLink at 50 Hz: ~60 B/s up, of which the unmetered heartbeat takes ~21.
const NARROW_UPLINK_BUDGET_BPS = 40;

// ELRS never streams this much down (~110 B/s at 50 Hz); anything that does is wide.
const WIDE_INBOUND_BPS = 3000;
const MAX_QUEUED_BULK = 32;

const MSG_HEARTBEAT = 0;
const MSG_SET_MODE = 11;
const MSG_PARAM_SET = 23;
const MSG_MISSION_SET_CURRENT = 41;
const MSG_MANUAL_CONTROL = 69;
const MSG_RC_CHANNELS_OVERRIDE = 70;
const MSG_COMMAND_INT = 75;
const MSG_COMMAND_LONG = 76;
const CMD_SET_MESSAGE_INTERVAL = 511;

// COMMAND_LONG and COMMAND_INT: uint16 command after the seven floats.
const COMMAND_FIELD_OFFSET = 28;

interface QueuedFrame {
  msgid: number;
  packet: Uint8Array;
  pilot: boolean;
  resolve: () => void;
}

function frameMsgid(packet: Uint8Array): number {
  if (packet[0] === MAVLINK_STX_V2 && packet.length >= 10) {
    return packet[7]! | (packet[8]! << 8) | (packet[9]! << 16);
  }
  if (packet[0] === MAVLINK_STX_V1 && packet.length >= 6) {
    return packet[5]!;
  }
  return -1;
}

function frameCommandId(packet: Uint8Array): number | null {
  const payloadStart = packet[0] === MAVLINK_STX_V2 ? 10 : 6;
  const at = payloadStart + COMMAND_FIELD_OFFSET;
  if (packet.length < at + 2) return null;
  return packet[at]! | (packet[at + 1]! << 8);
}

/** What the pilot pressed, or the sticks: goes ahead of housekeeping. */
function isPilotTraffic(msgid: number, packet: Uint8Array): boolean {
  switch (msgid) {
    case MSG_SET_MODE:
    case MSG_COMMAND_INT:
    case MSG_RC_CHANNELS_OVERRIDE:
    case MSG_MANUAL_CONTROL:
    case MSG_PARAM_SET:
    case MSG_MISSION_SET_CURRENT:
      return true;
    case MSG_COMMAND_LONG:
      return frameCommandId(packet) !== CMD_SET_MESSAGE_INTERVAL;
    default:
      return false;
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

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

  private _explicitRemote: boolean;

  // Metered send queue: an ELRS transmitter's 1 KB FIFO corrupts frames on overflow.
  private _queue: QueuedFrame[] = [];
  private _drainTimer: NodeJS.Timeout | null = null;
  private _freeAt = 0;
  private _inboundBytes = 0;
  private _inboundTimer: NodeJS.Timeout | null = null;
  private _provenWide = false;

  constructor(options: UdpOptions = {}) {
    super();
    this._localPort = options.localPort ?? 14550;
    this._remoteHost = options.remoteHost;
    this._remotePort = options.remotePort;
    this._explicitRemote = !!options.remoteHost && !!options.remotePort;
    this.readTimeout = options.readTimeout ?? 5000;
    this.writeTimeout = options.writeTimeout ?? 5000;
  }

  /** True once there is somewhere to send to: a UDP link that has not heard
   * from the vehicle yet cannot write, and callers should wait rather than
   * retry into an exception. */
  get canWrite(): boolean {
    return this.isOpen && !!this._remoteHost && !!this._remotePort;
  }

  get isOpen(): boolean {
    return this._isOpen && this.socket !== null;
  }

  get bytesToRead(): number {
    return this.rxBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  get bytesToWrite(): number {
    return this._queue.reduce((sum, q) => sum + q.packet.length, 0);
  }

  get portName(): string {
    if (this._remoteHost && this._remotePort) {
      return `udp://${this._remoteHost}:${this._remotePort}`;
    }
    return `udp://0.0.0.0:${this._localPort}`;
  }

  get narrowUplink(): boolean {
    return !this._provenWide;
  }

  /**
   * Set remote endpoint for sending
   */
  setRemoteEndpoint(host: string, port: number): void {
    this._remoteHost = host;
    this._remotePort = port;
    this._explicitRemote = true;
  }

  async open(): Promise<void> {
    if (this.isOpen) {
      return;
    }

    // A previous open() that failed at bind leaves a created-but-dead socket
    // behind; binding a second one while it lingers is how the app ends up
    // fighting itself for the port (EADDRINUSE against its own zombie).
    if (this.socket) {
      try { this.socket.close(); } catch { /* already closed */ }
      this.socket = null;
    }

    this._provenWide = false;
    this._inboundBytes = 0;

    return new Promise((resolve, reject) => {
      // reuseAddr matches standard GCS behavior (QGC binds 14550 shared) and
      // lets a fresh app instance recover the port from a crashed one.
      this.socket = createSocket({ type: 'udp4', reuseAddr: true });

      this.socket.on('message', (msg: Buffer, rinfo) => {
        const uint8 = new Uint8Array(msg);
        this.rxBuffer.push(uint8);
        this._inboundBytes += uint8.length;
        this.emit('data', uint8);

        // Magic-byte gate: other traffic on the port must not hijack replies.
        if (!this._explicitRemote && uint8.length > 0
          && (uint8[0] === MAVLINK_STX_V1 || uint8[0] === MAVLINK_STX_V2)) {
          this._remoteHost = rinfo.address;
          this._remotePort = rinfo.port;
        }
      });

      this.socket.on('error', (err: Error) => {
        this.emit('error', err);
        if (!this._isOpen) {
          // Bind failed: reap the socket so this transport can't hold the
          // port (or a half-created socket) with isOpen reading false.
          try { this.socket?.close(); } catch { /* never bound */ }
          this.socket = null;
          reject(err);
        }
      });

      this.socket.on('close', () => {
        this._isOpen = false;
        this._dropQueue();
        this.emit('close');
      });

      this.socket.bind(this._localPort, () => {
        this._isOpen = true;
        this._inboundTimer = setInterval(() => this._sampleInbound(), 1000);
        this.emit('open');
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (this._inboundTimer) {
      clearInterval(this._inboundTimer);
      this._inboundTimer = null;
    }
    this._dropQueue();
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

    const msgid = frameMsgid(data);
    if (msgid === MSG_HEARTBEAT || this._provenWide) {
      return this._send(data);
    }
    return this._enqueue(msgid, data);
  }

  private _send(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      const host = this._remoteHost;
      const port = this._remotePort;
      if (!socket || !host || !port) {
        reject(new Error('Socket is not bound'));
        return;
      }
      socket.send(Buffer.from(data), port, host, (err) => {
        if (err) {
          reject(new Error(`Write failed: ${err.message}`));
          return;
        }
        resolve();
      });
      // The backpack listens on 14555 only; a closed extra port drops silently.
      if (port !== ELRS_UPLINK_PORT) {
        socket.send(Buffer.from(data), ELRS_UPLINK_PORT, host, () => { /* best effort */ });
      }
    });
  }

  private _enqueue(msgid: number, packet: Uint8Array): Promise<void> {
    const pilot = isPilotTraffic(msgid, packet);
    if (msgid === MSG_MANUAL_CONTROL || msgid === MSG_RC_CHANNELS_OVERRIDE) {
      // Only the newest stick frame is worth the air time.
      for (const q of this._queue) {
        if (q.msgid === msgid) q.resolve();
      }
      this._queue = this._queue.filter((q) => q.msgid !== msgid);
    } else if (!pilot) {
      // A retry of something still waiting to go out adds nothing.
      if (this._queue.some((q) => q.msgid === msgid && sameBytes(q.packet, packet))) {
        return Promise.resolve();
      }
      if (this._queue.filter((q) => !q.pilot).length >= MAX_QUEUED_BULK) {
        return Promise.resolve();
      }
    }
    return new Promise<void>((resolve) => {
      const frame: QueuedFrame = { msgid, packet, pilot, resolve };
      const firstBulk = pilot ? this._queue.findIndex((q) => !q.pilot) : -1;
      if (firstBulk < 0) {
        this._queue.push(frame);
      } else {
        this._queue.splice(firstBulk, 0, frame);
      }
      this._scheduleDrain();
    });
  }

  private _scheduleDrain(): void {
    if (this._drainTimer) return;
    const wait = Math.max(0, this._freeAt - Date.now());
    this._drainTimer = setTimeout(() => this._drain(), wait);
  }

  private _drain(): void {
    this._drainTimer = null;
    const next = this._queue.shift();
    if (!next) return;
    if (!this.isOpen) {
      next.resolve();
      this._dropQueue();
      return;
    }
    const ms = this._provenWide
      ? 0
      : Math.round((next.packet.length * 1000) / NARROW_UPLINK_BUDGET_BPS);
    this._freeAt = Date.now() + ms;
    this._send(next.packet)
      .catch((err: Error) => this.emit('error', err))
      .finally(() => next.resolve());
    if (this._queue.length > 0) this._scheduleDrain();
  }

  private _dropQueue(): void {
    if (this._drainTimer) {
      clearTimeout(this._drainTimer);
      this._drainTimer = null;
    }
    this._freeAt = 0;
    for (const q of this._queue) q.resolve();
    this._queue = [];
  }

  private _sampleInbound(): void {
    if (!this._provenWide && this._inboundBytes > WIDE_INBOUND_BPS) {
      this._provenWide = true;
      this._freeAt = 0;
      if (this._drainTimer) {
        clearTimeout(this._drainTimer);
        this._drainTimer = null;
      }
      if (this._queue.length > 0) this._scheduleDrain();
    }
    this._inboundBytes = 0;
  }

  async discardInBuffer(): Promise<void> {
    this.rxBuffer = [];
  }
}
