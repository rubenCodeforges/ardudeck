/**
 * MAVLink FTP Client
 *
 * Implements the MAVLink FILE_TRANSFER_PROTOCOL for downloading files
 * from a flight controller's virtual filesystem.
 *
 * Uses sequential ReadFile (request/response per chunk) which is simple,
 * reliable, and fast on USB serial where round-trip latency is <1ms.
 *
 * Reference: MissionPlanner MAVFtp.cs, mavlink.io/en/services/ftp.html
 */

import {
  FtpOpcode,
  FtpError,
  FTP_ERROR_NAMES,
  FTP_READ_SIZE,
  FTP_TIMEOUT_MS,
  FTP_MAX_RETRIES,
  type FtpPayload,
  serializeFtpPayload,
  parseFtpPayload,
} from './ftp-types.js';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Callback to send a raw FTP payload over MAVLink */
export type SendFtpPacket = (ftpPayload: Uint8Array) => Promise<void>;

/** Progress callback */
export type FtpProgressCallback = (received: number, total: number) => void;

/** Log callback */
export type FtpLogCallback = (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void;

export interface FtpClientOptions {
  /** Function to send a serialized FTP payload via FILE_TRANSFER_PROTOCOL */
  sendPacket: SendFtpPacket;
  /** Log callback */
  log?: FtpLogCallback;
  /** Read chunk size (default: 110, matching Mission Planner) */
  readSize?: number;
}

// ─── FTP Client ──────────────────────────────────────────────────────────────

export class MavlinkFtpClient {
  private sendPacket: SendFtpPacket;
  private log: FtpLogCallback;
  private readSize: number;
  private seqNumber = 0;
  private sessionId = 0;

  /** Pending response resolver - set by sendRequest(), resolved by handleResponse() */
  private pendingResolve: ((payload: FtpPayload | null) => void) | null = null;
  private pendingTimer: NodeJS.Timeout | null = null;

  constructor(options: FtpClientOptions) {
    this.sendPacket = options.sendPacket;
    this.log = options.log ?? (() => {});
    this.readSize = options.readSize ?? FTP_READ_SIZE;
  }

  /**
   * Handle an incoming FTP response from the flight controller.
   * Called by the MAVLink message router when FILE_TRANSFER_PROTOCOL (110) is received.
   */
  handleResponse(rawPayload: Uint8Array): void {
    const payload = parseFtpPayload(rawPayload);

    if (this.pendingResolve) {
      if (this.pendingTimer) {
        clearTimeout(this.pendingTimer);
        this.pendingTimer = null;
      }
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve(payload);
    }
  }

  // ─── High-level API ──────────────────────────────────────────────────────

  /**
   * Download a file from the FC's virtual filesystem.
   * Uses sequential ReadFile (one request per chunk, waits for response).
   * Returns the file contents as a Uint8Array, or null on failure.
   */
  async downloadFile(
    path: string,
    progress?: FtpProgressCallback,
  ): Promise<Uint8Array | null> {
    try {
      // Reset sessions to clean any stale state
      await this.resetSessions();

      // Open file and get size
      const fileSize = await this.openFileRO(path);
      if (fileSize === null) {
        this.log('warn', `FTP: file not found or open failed: ${path}`);
        return null;
      }

      this.log('info', `FTP: opened ${path} (${fileSize} bytes)`);

      if (fileSize === 0) {
        await this.terminateSession();
        return new Uint8Array(0);
      }

      // Download using sequential reads
      const data = await this.sequentialDownload(fileSize, progress);

      // Cleanup session
      await this.terminateSession();

      if (!data) {
        this.log('warn', 'FTP: download failed');
        return null;
      }

      return data;
    } catch (err) {
      this.log('error', `FTP error: ${err instanceof Error ? err.message : String(err)}`);
      try { await this.terminateSession(); } catch { /* ignore */ }
      return null;
    }
  }

  /** Cleanup: reset all sessions on the FC */
  async cleanup(): Promise<void> {
    try {
      await this.resetSessions();
    } catch { /* ignore */ }
    this.clearPending();
  }

  // ─── Download Logic ──────────────────────────────────────────────────────

  /**
   * Sequential download: send ReadFile, wait for ACK, advance offset, repeat.
   * Simple and reliable. Fast on USB serial (<1ms round-trip per chunk).
   */
  private async sequentialDownload(
    fileSize: number,
    progress?: FtpProgressCallback,
  ): Promise<Uint8Array | null> {
    const result = new Uint8Array(fileSize);
    let offset = 0;

    while (offset < fileSize) {
      const remaining = fileSize - offset;
      const chunkSize = Math.min(this.readSize, remaining);

      const chunk = await this.readFileChunk(offset, chunkSize);
      if (!chunk) {
        this.log('warn', `FTP: read failed at offset ${offset}/${fileSize}`);
        return null;
      }

      // chunk may be shorter than requested (near end of file)
      if (chunk.length === 0) break;

      result.set(chunk, offset);
      offset += chunk.length;

      if (progress) {
        progress(offset, fileSize);
      }
    }

    return result;
  }

  // ─── Low-level Protocol ──────────────────────────────────────────────────

  private async resetSessions(): Promise<void> {
    const resp = await this.sendRequest({
      opcode: FtpOpcode.ResetSessions,
      session: 0,
      size: 0,
      offset: 0,
      data: new Uint8Array(0),
    });

    if (resp && resp.opcode === FtpOpcode.Nak) {
      const errCode = resp.data[0];
      if (errCode !== FtpError.UnknownCommand) {
        this.log('debug', `FTP: ResetSessions NAK: ${FTP_ERROR_NAMES[errCode ?? 0] ?? 'unknown'}`);
      }
    }
  }

  private async openFileRO(path: string): Promise<number | null> {
    const pathBytes = new TextEncoder().encode(path);
    const data = new Uint8Array(pathBytes.length + 1); // null-terminated
    data.set(pathBytes);

    for (let retry = 0; retry < FTP_MAX_RETRIES; retry++) {
      const resp = await this.sendRequest({
        opcode: FtpOpcode.OpenFileRO,
        session: 0,
        size: pathBytes.length,
        offset: 0,
        data,
      });

      if (!resp) {
        this.log('debug', `FTP: OpenFileRO timeout (attempt ${retry + 1}/${FTP_MAX_RETRIES})`);
        continue;
      }

      if (resp.opcode === FtpOpcode.Ack) {
        this.sessionId = resp.session;
        const view = new DataView(resp.data.buffer, resp.data.byteOffset, resp.data.byteLength);
        return view.getUint32(0, true);
      }

      if (resp.opcode === FtpOpcode.Nak) {
        const errCode = resp.data[0];
        if (errCode === FtpError.FileNotFound || errCode === FtpError.UnknownCommand) {
          return null;
        }
        if (errCode === FtpError.NoSessionsAvailable) {
          await this.resetSessions();
          continue;
        }
        this.log('debug', `FTP: OpenFileRO NAK: ${FTP_ERROR_NAMES[errCode ?? 0] ?? 'unknown'}`);
      }
    }

    return null;
  }

  private async readFileChunk(offset: number, size: number): Promise<Uint8Array | null> {
    for (let retry = 0; retry < FTP_MAX_RETRIES; retry++) {
      const resp = await this.sendRequest({
        opcode: FtpOpcode.ReadFile,
        session: this.sessionId,
        size,
        offset,
        data: new Uint8Array(0),
      });

      if (!resp) continue;

      if (resp.opcode === FtpOpcode.Ack) {
        return resp.data.slice(0, resp.size);
      }

      if (resp.opcode === FtpOpcode.Nak) {
        const errCode = resp.data[0];
        if (errCode === FtpError.EOF) {
          return new Uint8Array(0);
        }
        this.log('debug', `FTP: ReadFile NAK at offset ${offset}: ${FTP_ERROR_NAMES[errCode ?? 0] ?? 'unknown'}`);
      }
    }
    return null;
  }

  private async terminateSession(): Promise<void> {
    await this.sendRequest({
      opcode: FtpOpcode.TerminateSession,
      session: this.sessionId,
      size: 0,
      offset: 0,
      data: new Uint8Array(0),
    });
  }

  // ─── Request/Response ────────────────────────────────────────────────────

  private sendRequest(fields: {
    opcode: number;
    session: number;
    size: number;
    offset: number;
    data: Uint8Array;
  }): Promise<FtpPayload | null> {
    return new Promise<FtpPayload | null>((resolve) => {
      this.clearPending();

      this.pendingResolve = resolve;

      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        const r = this.pendingResolve;
        this.pendingResolve = null;
        r?.(null);
      }, FTP_TIMEOUT_MS);

      const payload = this.buildPayload(fields);
      this.sendPacket(payload).catch(() => {
        if (this.pendingTimer) {
          clearTimeout(this.pendingTimer);
          this.pendingTimer = null;
        }
        const r = this.pendingResolve;
        this.pendingResolve = null;
        r?.(null);
      });
    });
  }

  private buildPayload(fields: {
    opcode: number;
    session: number;
    size: number;
    offset: number;
    data: Uint8Array;
  }): Uint8Array {
    this.seqNumber = (this.seqNumber + 1) & 0xffff;

    return serializeFtpPayload({
      seqNumber: this.seqNumber,
      session: fields.session,
      opcode: fields.opcode,
      size: fields.size,
      reqOpcode: 0,
      burstComplete: 0,
      offset: fields.offset,
      data: fields.data,
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private clearPending(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (this.pendingResolve) {
      this.pendingResolve(null);
      this.pendingResolve = null;
    }
  }
}
