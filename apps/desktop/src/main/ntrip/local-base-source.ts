/**
 * Local base station corrections source: raw RTCM3 from a base receiver on a
 * serial port, feeding the same frame + injection pipeline as ntrip-client.
 */

import { SerialPort } from 'serialport';
import type { NtripConfig, NtripStatus } from '../../shared/ntrip-types.js';
import { INITIAL_NTRIP_STATUS } from '../../shared/ntrip-types.js';
import { RtcmFramer, parseBasePosition, type RtcmFrame } from './rtcm.js';
import { t } from '../../shared/i18n/index.js';

const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;
/** No base bytes for this long while connected -> treat the stream as dead. */
const STREAM_STALL_TIMEOUT_MS = 20000;

/** The slice of SerialPort this source uses; injectable for tests. */
export interface BasePortLike {
  open(cb: (err: Error | null) => void): void;
  close(cb?: (err: Error | null) => void): void;
  on(event: 'data', cb: (data: Buffer) => void): void;
  on(event: 'error', cb: (err: Error) => void): void;
  on(event: 'close', cb: () => void): void;
  removeAllListeners(): void;
}

export interface LocalBaseSourceDeps {
  /** Complete CRC-checked RTCM frame ready for MAVLink injection. */
  onRtcmFrame: (frame: RtcmFrame) => void | Promise<void>;
  onStatus: (status: NtripStatus) => void;
  /** Port factory override for tests; defaults to a real SerialPort. */
  openPort?: (path: string, baudRate: number) => BasePortLike;
}

function defaultOpenPort(path: string, baudRate: number): BasePortLike {
  return new SerialPort({ path, baudRate, autoOpen: false });
}

export class LocalBaseSource {
  private deps: LocalBaseSourceDeps;
  private config: NtripConfig | null = null;
  private port: BasePortLike | null = null;
  private framer = new RtcmFramer();
  private status: NtripStatus = { ...INITIAL_NTRIP_STATUS, rtcmTypeCounts: {}, source: 'serial' };

  /** User intent: keep the stream up (drives auto-reconnect). */
  private enabled = false;
  private everConnected = false;
  private statusTimer: NodeJS.Timeout | null = null;
  private stallTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private bytesThisSecond = 0;

  constructor(deps: LocalBaseSourceDeps) {
    this.deps = deps;
  }

  getStatus(): NtripStatus {
    return { ...this.status, rtcmTypeCounts: { ...this.status.rtcmTypeCounts } };
  }

  isStreaming(): boolean {
    return this.status.state !== 'disconnected' && this.status.state !== 'error';
  }

  connect(config: NtripConfig): { success: boolean; error?: string } {
    if (!config.serialPath) return { success: false, error: t('main:ntrip.baseSerialNotSet') };
    this.teardownPort();
    this.clearReconnect();
    this.enabled = true;
    this.everConnected = false;
    this.config = config;
    this.reconnectAttempt = 0;
    this.status = {
      ...INITIAL_NTRIP_STATUS,
      rtcmTypeCounts: {},
      state: 'connecting',
      ggaState: 'off',
      source: 'serial',
    };
    this.pushStatus();
    this.openStream();
    return { success: true };
  }

  disconnect(): void {
    this.enabled = false;
    this.clearReconnect();
    this.teardownPort();
    this.setStatus({ state: 'disconnected', dataRateBps: 0 });
  }

  noteInjection(forwarded: boolean): void {
    if (forwarded) this.status.rtcmForwarded++;
    else this.status.rtcmDropped++;
  }

  private openStream(): void {
    const config = this.config;
    if (!config || !this.enabled) return;
    this.framer.reset();

    let port: BasePortLike;
    try {
      port = (this.deps.openPort ?? defaultOpenPort)(config.serialPath, config.serialBaud);
    } catch (err) {
      this.failPermanently(err instanceof Error ? err.message : String(err));
      return;
    }
    this.port = port;

    port.on('data', (data) => this.handleData(data));
    port.on('error', (err) => this.handleStreamFailure(err.message));
    port.on('close', () => {
      if (this.port !== port) return;
      if (this.enabled) this.handleStreamFailure(t('main:ntrip.basePortClosed'));
    });
    port.open((err) => {
      if (this.port !== port) return;
      if (err) {
        // First-open failure (missing/busy port) is a config error, not a drop.
        if (!this.everConnected) {
          this.failPermanently(t('main:ntrip.couldNotOpen', { path: config.serialPath, error: err.message }));
        } else {
          this.handleStreamFailure(err.message);
        }
        return;
      }
      this.everConnected = true;
      this.reconnectAttempt = 0;
      this.setStatus({ state: 'connected', connectedAtMs: Date.now() });
      delete this.status.error;
      this.startStatusTicker();
      this.armStallTimer();
    });
  }

  private handleData(data: Buffer): void {
    this.armStallTimer();
    this.status.bytesReceived += data.length;
    this.bytesThisSecond += data.length;
    const frames = this.framer.push(new Uint8Array(data));
    for (const frame of frames) {
      this.status.rtcmTypeCounts[frame.type] = (this.status.rtcmTypeCounts[frame.type] ?? 0) + 1;
      const base = parseBasePosition(frame);
      if (base) this.status.basePosition = base;
      void this.deps.onRtcmFrame(frame);
    }
  }

  private armStallTimer(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = setTimeout(() => {
      if (this.enabled) this.handleStreamFailure(t('main:ntrip.baseNoData'));
    }, STREAM_STALL_TIMEOUT_MS);
  }

  private startStatusTicker(): void {
    this.stopStatusTicker();
    this.statusTimer = setInterval(() => {
      this.status.dataRateBps = this.bytesThisSecond;
      this.bytesThisSecond = 0;
      this.pushStatus();
    }, 1000);
  }

  private stopStatusTicker(): void {
    if (this.statusTimer) clearInterval(this.statusTimer);
    this.statusTimer = null;
  }

  private handleStreamFailure(reason: string): void {
    this.teardownPort();
    if (!this.enabled) return;
    this.clearReconnect();
    this.reconnectAttempt++;
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** (this.reconnectAttempt - 1), RECONNECT_MAX_MS);
    this.setStatus({ state: 'reconnecting', error: reason, dataRateBps: 0 });
    this.reconnectTimer = setTimeout(() => this.openStream(), delay);
  }

  private failPermanently(reason: string): void {
    this.enabled = false;
    this.clearReconnect();
    this.teardownPort();
    this.setStatus({ state: 'error', error: reason, dataRateBps: 0 });
  }

  private teardownPort(): void {
    this.stopStatusTicker();
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
    if (this.port) {
      const p = this.port;
      this.port = null;
      p.removeAllListeners();
      try {
        p.close();
      } catch {
        // already closed
      }
    }
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private setStatus(patch: Partial<NtripStatus>): void {
    Object.assign(this.status, patch);
    this.pushStatus();
  }

  private pushStatus(): void {
    this.deps.onStatus(this.getStatus());
  }
}
