/**
 * OrchestrationServerLink - a Transport that connects to an ArduDeck
 * orchestration server (a future commercial coordination engine) over a single
 * WebSocket carrying two logical channels:
 *
 *   - channel 0x00: raw MAVLink passthrough. The server forwards every vehicle's
 *     MAVLink frames; we re-emit them as 'data' so the registry demuxes them by
 *     (sysid, compid) exactly like any other link. This is how the desktop
 *     renders a server-exposed fleet with zero special-casing.
 *   - channel 0x01: a JSON control plane (hello / welcome / intent.* ). The
 *     desktop submits group intents; the server executes the coordination.
 *
 * This is the STUB end of the seam specified in
 * docs/superpowers/specs/2026-06-15-multi-vehicle-design.md (Sub-spec F): it
 * implements the framing, the auth + hello/welcome handshake, MAVLink
 * passthrough, and intent submission. The coordination engine itself is a
 * separate product and is not built here.
 */

import WebSocket from 'ws';
import { BaseTransport } from '@ardudeck/comms';
import type {
  NtripConfig,
  NtripSourcetableResult,
  NtripStatus,
} from '../../shared/ntrip-types.js';

/** Control-plane channel discriminator (first byte of each WS binary frame). */
const CHANNEL_MAVLINK = 0x00;
const CHANNEL_CONTROL = 0x01;
/** Log artifact transfer: `[idLen][jobId][last][bytes...]`. See protocol.md. */
const CHANNEL_LOG = 0x02;

/** Capabilities and fleet the server advertised in `welcome`. */
export interface OrchestrationServerInfo {
  serverName: string;
  serverVersion: string;
  capabilities: string[];
}

/** A group intent submitted to the server (payload is opaque to the desktop). */
export interface OrchestrationIntent {
  kind: string;
  groupId?: string;
  vehicleSysids?: number[];
  payload?: unknown;
}

/** One vehicle in the server's roster (virtual sysid -> durable identity + bearer). */
export interface OrchestrationRosterVehicle {
  uuid: string;
  virtualSysid: number;
  realSysid: number;
  linkId: number;
  bearer: string;
}

export class OrchestrationServerLink extends BaseTransport {
  private ws: WebSocket | null = null;
  private _isOpen = false;
  private nextIntentId = 1;
  private nextLogJobId = 1;
  private nextNtripReqId = 1;
  /** Reassembly buffers for in-flight log artifacts, keyed by jobId. */
  private logChunks = new Map<string, Buffer[]>();
  /** Pending ntrip.sourcetable replies, keyed by request id. */
  private ntripSourcetableWaiters = new Map<string, (result: NtripSourcetableResult) => void>();
  readonly portName: string;
  /** Populated once the server replies to `hello`. */
  serverInfo: OrchestrationServerInfo | null = null;

  constructor(private url: string, private token?: string) {
    super();
    this.portName = `orchestration ${url}`;
  }

  get isOpen(): boolean { return this._isOpen; }
  get bytesToRead(): number { return 0; }
  get bytesToWrite(): number { return 0; }

  async open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : undefined,
      });
      ws.binaryType = 'nodebuffer';
      this.ws = ws;

      const onOpenError = (err: Error) => reject(err);

      ws.once('open', () => {
        this._isOpen = true;
        ws.off('error', onOpenError);
        this.emit('open');
        // Announce ourselves; the server replies with `welcome`.
        this.sendControl({
          v: 1,
          type: 'hello',
          clientName: 'ArduDeck',
          clientVersion: 'desktop',
          supports: ['mavlink-passthrough', 'intents'],
        });
        resolve();
      });

      ws.once('error', onOpenError);

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (!isBinary || data.length < 1) return;
        const channel = data[0];
        const payload = data.subarray(1);
        if (channel === CHANNEL_MAVLINK) {
          // Hand raw MAVLink bytes to the registry's parser via 'data'.
          this.emit('data', new Uint8Array(payload));
        } else if (channel === CHANNEL_CONTROL) {
          this.handleControl(payload);
        } else if (channel === CHANNEL_LOG) {
          this.handleLogArtifact(payload);
        }
      });

      ws.on('error', (err: Error) => this.emit('error', err));
      ws.on('close', () => {
        this._isOpen = false;
        this.emit('close');
      });
    });
  }

  async close(): Promise<void> {
    this._isOpen = false;
    this.ws?.close();
    this.ws = null;
  }

  /** Wrap MAVLink bytes in a channel-0x00 frame and send to the server. */
  async write(data: Uint8Array): Promise<void> {
    if (!this.ws || !this._isOpen) return;
    const frame = Buffer.allocUnsafe(data.length + 1);
    frame[0] = CHANNEL_MAVLINK;
    Buffer.from(data).copy(frame, 1);
    this.ws.send(frame);
  }

  /**
   * Submit a group intent to the server (channel 0x01). The server executes the
   * coordination and streams `intent.status` back. Returns the intent id.
   */
  submitIntent(intent: OrchestrationIntent): string {
    const id = `intent-${this.nextIntentId++}`;
    this.sendControl({ v: 1, type: 'intent.submit', id, intent });
    return id;
  }

  /** Subscribe to the server's welcome (capabilities/fleet). */
  onWelcome(cb: (info: OrchestrationServerInfo) => void): void {
    (this as { on(e: string, l: (...a: unknown[]) => void): unknown }).on('welcome', cb as (...a: unknown[]) => void);
  }

  /** Subscribe to control-plane messages (intent.ack / intent.status / error). */
  onControl(cb: (msg: Record<string, unknown>) => void): void {
    (this as { on(e: string, l: (...a: unknown[]) => void): unknown }).on('control', cb as (...a: unknown[]) => void);
  }

  /** Subscribe to fleet roster updates (virtual sysid -> UUID/bearer identity). */
  onRoster(cb: (vehicles: OrchestrationRosterVehicle[]) => void): void {
    (this as { on(e: string, l: (...a: unknown[]) => void): unknown }).on('roster', cb as (...a: unknown[]) => void);
  }

  /** Subscribe to log-fetch control events (log.list / log.job / log.job.ready). */
  onLogEvent(cb: (msg: Record<string, unknown>) => void): void {
    (this as { on(e: string, l: (...a: unknown[]) => void): unknown }).on('logEvent', cb as (...a: unknown[]) => void);
  }

  /** Subscribe to completed log artifacts (the fully-reassembled .bin bytes). */
  onLogArtifact(cb: (artifact: { jobId: string; bytes: Buffer }) => void): void {
    (this as { on(e: string, l: (...a: unknown[]) => void): unknown }).on('logArtifact', cb as (...a: unknown[]) => void);
  }

  /** Ask the server for a vehicle's onboard log list. Returns the job id. */
  requestLogList(virtualSysid: number): string {
    const id = `lj-${this.nextLogJobId++}`;
    this.sendControl({ v: 1, type: 'log.list.request', id, virtualSysid });
    return id;
  }

  /** Start fetching one log off a vehicle. Returns the job id (echoed in events + artifact). */
  fetchLog(virtualSysid: number, logId: number): string {
    const id = `lj-${this.nextLogJobId++}`;
    this.sendControl({ v: 1, type: 'log.fetch.request', id, virtualSysid, logId });
    return id;
  }

  cancelLogFetch(virtualSysid: number): void {
    this.sendControl({ v: 1, type: 'log.fetch.cancel', virtualSysid });
  }

  // ── NTRIP / RTK corrections (server-owned client, fleet-wide injection) ────
  // The orchestrator owns the caster connection and the GPS_RTCM_DATA fanout;
  // the desktop only configures and monitors it. The password rides on this
  // local control channel at connect time and is never persisted server-side.

  /** Start (or restart) the server's NTRIP stream with the given config. */
  ntripConnect(config: NtripConfig, password: string): void {
    this.sendControl({ v: 1, type: 'ntrip.connect', config: { ...config, password } });
  }

  ntripDisconnect(): void {
    this.sendControl({ v: 1, type: 'ntrip.disconnect' });
  }

  /** Ask for an immediate ntrip.status push (also pushed on change + 1 Hz). */
  ntripRequestStatus(): void {
    this.sendControl({ v: 1, type: 'ntrip.status.request' });
  }

  /** Subscribe to the server's NTRIP status pushes. */
  onNtripStatus(cb: (status: NtripStatus) => void): void {
    (this as { on(e: string, l: (...a: unknown[]) => void): unknown }).on('ntripStatus', cb as (...a: unknown[]) => void);
  }

  /** One-shot sourcetable fetch through the server. Resolves with the result. */
  ntripFetchSourcetable(config: NtripConfig, password: string): Promise<NtripSourcetableResult> {
    const id = `nt-${this.nextNtripReqId++}`;
    this.sendControl({ v: 1, type: 'ntrip.sourcetable.request', id, config: { ...config, password } });
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.ntripSourcetableWaiters.delete(id);
        resolve({ success: false, error: 'Sourcetable request timed out' });
      }, 20000);
      this.ntripSourcetableWaiters.set(id, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });
  }

  /** Reassemble a channel-0x02 artifact frame: `[idLen][jobId][last][bytes...]`. */
  private handleLogArtifact(payload: Buffer): void {
    if (payload.length < 2) return;
    const idLen = payload[0]!;
    if (payload.length < 2 + idLen) return;
    const jobId = payload.subarray(1, 1 + idLen).toString('ascii');
    const last = payload[1 + idLen] === 1;
    const bytes = payload.subarray(2 + idLen);
    const chunks = this.logChunks.get(jobId) ?? [];
    if (bytes.length > 0) chunks.push(Buffer.from(bytes));
    this.logChunks.set(jobId, chunks);
    if (last) {
      this.logChunks.delete(jobId);
      this.emit('logArtifact', { jobId, bytes: Buffer.concat(chunks) });
    }
  }

  private sendControl(message: Record<string, unknown>): void {
    if (!this.ws || !this._isOpen) return;
    const json = Buffer.from(JSON.stringify(message), 'utf8');
    const frame = Buffer.allocUnsafe(json.length + 1);
    frame[0] = CHANNEL_CONTROL;
    json.copy(frame, 1);
    this.ws.send(frame);
  }

  private handleControl(payload: Buffer): void {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(payload.toString('utf8'));
    } catch {
      return;
    }
    switch (msg.type) {
      case 'welcome':
        this.serverInfo = {
          serverName: String(msg.serverName ?? 'unknown'),
          serverVersion: String(msg.serverVersion ?? ''),
          capabilities: Array.isArray(msg.capabilities) ? (msg.capabilities as string[]) : [],
        };
        this.emit('welcome', this.serverInfo);
        break;
      case 'intent.ack':
      case 'intent.status':
      case 'error':
        // Surfaced to listeners; the fleet UI can subscribe when intent UX lands.
        this.emit('control', msg);
        break;
      case 'roster':
        // Identity mapping for the fleet we see on the passthrough channel.
        if (Array.isArray(msg.vehicles)) {
          this.emit('roster', msg.vehicles as OrchestrationRosterVehicle[]);
        }
        break;
      case 'log.list':
      case 'log.job':
      case 'log.job.ready':
        this.emit('logEvent', msg);
        break;
      case 'ntrip.status':
        if (msg.status && typeof msg.status === 'object') {
          this.emit('ntripStatus', msg.status as NtripStatus);
        }
        break;
      case 'ntrip.sourcetable': {
        const waiter = this.ntripSourcetableWaiters.get(String(msg.id));
        if (waiter) {
          this.ntripSourcetableWaiters.delete(String(msg.id));
          waiter({
            success: msg.success === true,
            mountpoints: Array.isArray(msg.mountpoints)
              ? (msg.mountpoints as NtripSourcetableResult['mountpoints'])
              : undefined,
            error: typeof msg.error === 'string' ? msg.error : undefined,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  // ── Unused polling reads (the parser is fed via the 'data' event) ──────────
  async read(): Promise<number> { return 0; }
  async readByte(): Promise<number> { return -1; }
  async discardInBuffer(): Promise<void> { /* no-op */ }
}
