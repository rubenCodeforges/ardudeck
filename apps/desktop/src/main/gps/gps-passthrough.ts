// GPS passthrough over SERIAL_CONTROL, as Mission Planner's MAVLinkSerialPort does it.

import net from 'node:net';
import { serializeSerialControl, type SerialControl } from '@ardudeck/mavlink-ts';
import { UBX, UbxParser, decodeMonRf, decodeMonVer, decodeNavPvt, decodeNavSat, ubxPoll } from './ubx.js';
import type { GpsDiagEvent } from '../../shared/gps-diagnostics-types.js';

export const SERIAL_CONTROL_FLAG = { REPLY: 1, RESPOND: 2, EXCLUSIVE: 4, BLOCKING: 8, MULTI: 16 } as const;
export const SERIAL_CONTROL_DEV_GPS1 = 2;

const CHUNK = 70;
const POLL_MS = 20;
const UBX_POLL_MS = 1000;

export type GpsPassthroughEvent = GpsDiagEvent;

export interface GpsPassthroughDeps {
  /** Sends one SERIAL_CONTROL payload to the vehicle. */
  send: (payload: Uint8Array) => Promise<void>;
  emit: (e: GpsPassthroughEvent) => void;
}

export function serialControlPayload(flags: number, bytes: Uint8Array = new Uint8Array(0), timeout = 0, device = SERIAL_CONTROL_DEV_GPS1): Uint8Array {
  const data = new Array<number>(CHUNK).fill(0);
  bytes.forEach((b, i) => { data[i] = b; });
  return serializeSerialControl({ baudrate: 0, timeout, device, flags, count: bytes.length, data });
}

export class GpsPassthrough {
  private open = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private ubxTimer: NodeJS.Timeout | null = null;
  private queue: Promise<void> = Promise.resolve();
  private parser = new UbxParser();
  private rxBytes = 0;
  private server: net.Server | null = null;
  private clients = new Set<net.Socket>();

  constructor(private readonly deps: GpsPassthroughDeps) {}

  get isOpen(): boolean {
    return this.open;
  }

  private enqueue(payload: Uint8Array, gapMs = 0): Promise<void> {
    this.queue = this.queue
      .then(() => this.deps.send(payload))
      .then(() => (gapMs ? new Promise<void>((r) => setTimeout(r, gapMs)) : undefined))
      .catch(() => undefined);
    return this.queue;
  }

  private poll(): void {
    const { EXCLUSIVE, RESPOND, MULTI } = SERIAL_CONTROL_FLAG;
    void this.enqueue(serialControlPayload(EXCLUSIVE | RESPOND | MULTI, undefined, 10));
  }

  async start(): Promise<void> {
    if (this.open) return;
    this.open = true;
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), POLL_MS);
    await this.write(ubxPoll(UBX.MON_VER));
    const pollUbx = () => {
      void this.write(new Uint8Array([...ubxPoll(UBX.NAV_SAT), ...ubxPoll(UBX.MON_RF), ...ubxPoll(UBX.NAV_PVT)]));
      this.deps.emit({ kind: 'traffic', rxBytes: this.rxBytes });
    };
    pollUbx();
    this.ubxTimer = setInterval(pollUbx, UBX_POLL_MS);
    this.deps.emit({ kind: 'state', open: true });
  }

  /** Bytes to the GPS, chunked like Mission Planner: RESPOND only on the last chunk, 10 ms apart. */
  write(bytes: Uint8Array): Promise<void> {
    if (!this.open) return Promise.resolve();
    let last: Promise<void> = Promise.resolve();
    for (let off = 0; off < bytes.length; off += CHUNK) {
      const chunk = bytes.slice(off, off + CHUNK);
      const isLast = off + CHUNK >= bytes.length;
      const flags = SERIAL_CONTROL_FLAG.EXCLUSIVE | (isLast ? SERIAL_CONTROL_FLAG.RESPOND : 0);
      last = this.enqueue(serialControlPayload(flags, chunk), 10);
    }
    return last;
  }

  /** Feed every SERIAL_CONTROL the vehicle sends; replies from the GPS port carry its bytes. */
  handleSerialControl(msg: SerialControl): void {
    if (!this.open || !(msg.flags & SERIAL_CONTROL_FLAG.REPLY) || msg.device !== SERIAL_CONTROL_DEV_GPS1) return;
    const n = Math.min(msg.count, CHUNK);
    if (n === 0) return;
    const bytes = Uint8Array.from(msg.data.slice(0, n));
    this.rxBytes += n;
    for (const c of this.clients) c.write(bytes);
    for (const m of this.parser.push(bytes)) this.dispatch(m.cls, m.id, m.payload);
  }

  private dispatch(cls: number, id: number, p: Uint8Array): void {
    const is = (msg: readonly [number, number]) => cls === msg[0] && id === msg[1];
    if (is(UBX.NAV_SAT)) this.deps.emit({ kind: 'sats', sats: decodeNavSat(p) });
    else if (is(UBX.MON_RF)) this.deps.emit({ kind: 'rf', blocks: decodeMonRf(p) });
    else if (is(UBX.NAV_PVT)) {
      const pvt = decodeNavPvt(p);
      if (pvt) this.deps.emit({ kind: 'pvt', pvt });
    } else if (is(UBX.MON_VER)) {
      const version = decodeMonVer(p);
      if (version) this.deps.emit({ kind: 'version', version });
    }
  }

  /** Lets u-center connect over TCP as if the GPS were on a cable. */
  startBridge(port: number): Promise<{ ok: boolean; error?: string }> {
    if (this.server) return Promise.resolve({ ok: true });
    return new Promise((resolve) => {
      const server = net.createServer((sock) => {
        this.clients.add(sock);
        this.emitBridge(port);
        sock.on('data', (d: Buffer) => { void this.write(new Uint8Array(d)); });
        const drop = () => {
          this.clients.delete(sock);
          this.emitBridge(port);
        };
        sock.on('close', drop);
        sock.on('error', drop);
      });
      server.once('error', (err) => {
        this.server = null;
        this.deps.emit({ kind: 'bridge', port: null, clients: 0, error: err.message });
        resolve({ ok: false, error: err.message });
      });
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        this.emitBridge(port);
        resolve({ ok: true });
      });
    });
  }

  private emitBridge(port: number | null): void {
    this.deps.emit({ kind: 'bridge', port, clients: this.clients.size });
  }

  stopBridge(): void {
    for (const c of this.clients) c.destroy();
    this.clients.clear();
    this.server?.close();
    this.server = null;
    this.emitBridge(null);
  }

  /** Hands the GPS back to ArduPilot. */
  async stop(): Promise<void> {
    if (!this.open) return;
    this.open = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.ubxTimer) clearInterval(this.ubxTimer);
    this.pollTimer = null;
    this.ubxTimer = null;
    this.stopBridge();
    await this.enqueue(serialControlPayload(0));
    this.parser = new UbxParser();
    this.rxBytes = 0;
    this.deps.emit({ kind: 'state', open: false });
  }
}
