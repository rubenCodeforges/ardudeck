import { promises as fsp } from 'fs';
import { basename } from 'path';
import { BaseTransport } from '@ardudeck/comms';
import { TLOG_STAMP_BYTES } from './tlog-recorder.js';
import { dataflashToRecords, isDataflash } from './dataflash-replay.js';
import { t } from '../../shared/i18n/index.js';

const MAVLINK_V1_STX = 0xfe;
const MAVLINK_V2_STX = 0xfd;
const MAVLINK_V2_SIGNED = 0x01;
const HEARTBEAT_ID = 0;

export interface TlogRecord {
  /** Milliseconds since the first record. */
  t: number;
  packet: Uint8Array;
  msgid: number;
}

/** Full packet length from a MAVLink header, or null if the bytes there are not a packet start. */
function packetLength(buf: Uint8Array, at: number): number | null {
  const stx = buf[at];
  if (stx === MAVLINK_V1_STX && at + 6 <= buf.length) return 6 + buf[at + 1]! + 2;
  if (stx === MAVLINK_V2_STX && at + 10 <= buf.length) {
    const signed = (buf[at + 2]! & MAVLINK_V2_SIGNED) !== 0;
    return 10 + buf[at + 1]! + 2 + (signed ? 13 : 0);
  }
  return null;
}

function msgIdOf(buf: Uint8Array): number {
  if (buf[0] === MAVLINK_V1_STX) return buf[5]!;
  return buf[7]! | (buf[8]! << 8) | (buf[9]! << 16);
}

/** Split a .tlog into timed records; bytes that are not a packet start are skipped until the stream lines up again. */
export function parseTlog(buf: Uint8Array): TlogRecord[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out: TlogRecord[] = [];
  let firstUs: bigint | null = null;
  let lastT = 0;
  let i = 0;
  while (i + TLOG_STAMP_BYTES < buf.length) {
    const len = packetLength(buf, i + TLOG_STAMP_BYTES);
    if (len === null || i + TLOG_STAMP_BYTES + len > buf.length) { i++; continue; }
    const us = view.getBigUint64(i, false);
    if (firstUs === null) firstUs = us;
    let t = Number(us - firstUs) / 1000;
    // Clock steps backwards or absurd jumps: keep the order, never travel back in time.
    if (!Number.isFinite(t) || t < lastT) t = lastT;
    lastT = t;
    const packet = buf.slice(i + TLOG_STAMP_BYTES, i + TLOG_STAMP_BYTES + len);
    out.push({ t, packet, msgid: msgIdOf(packet) });
    i += TLOG_STAMP_BYTES + len;
  }
  return out;
}

export interface ReplayStatus {
  file: string;
  playing: boolean;
  speed: number;
  positionMs: number;
  durationMs: number;
  ended: boolean;
}

const TICK_MS = 20;
const KEEPALIVE_MS = 1000;
/** Upper bound of packets per tick, so 16x on a busy log cannot starve the event loop. */
const MAX_PACKETS_PER_TICK = 4000;

/** Plays a .tlog with its original timing. Writes are dropped; while paused the last heartbeat repeats so the link watchdog does not reconnect. */
export class TlogReplayTransport extends BaseTransport {
  private records: TlogRecord[] = [];
  private index = 0;
  private open_ = false;
  private playing = false;
  private speed_ = 1;
  /** Log time at the moment `wallStart` was taken. */
  private baseMs = 0;
  private wallStart = 0;
  private timer: NodeJS.Timeout | null = null;
  private keepalive: NodeJS.Timeout | null = null;
  private lastHeartbeat: Uint8Array | null = null;
  private onStatus: ((s: ReplayStatus) => void) | null = null;

  constructor(private readonly path: string) {
    super();
  }

  get isOpen(): boolean { return this.open_; }
  get bytesToRead(): number { return 0; }
  get bytesToWrite(): number { return 0; }
  get portName(): string { return basename(this.path); }

  setStatusListener(fn: ((s: ReplayStatus) => void) | null): void {
    this.onStatus = fn;
  }

  async open(): Promise<void> {
    const buf = await fsp.readFile(this.path);
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    this.records = isDataflash(bytes) ? await dataflashToRecords(bytes) : parseTlog(bytes);
    if (this.records.length === 0) throw new Error(t('main:ipc.replayEmpty'));
    this.open_ = true;
    this.emit('open');
    this.keepalive = setInterval(() => this.sendKeepalive(), KEEPALIVE_MS);
    this.play();
  }

  async close(): Promise<void> {
    if (!this.open_) return;
    this.open_ = false;
    this.stopTimer();
    if (this.keepalive) { clearInterval(this.keepalive); this.keepalive = null; }
    this.emit('close');
  }

  async read(): Promise<number> { return 0; }
  async readByte(): Promise<number> { return -1; }
  async write(): Promise<void> { /* replay never transmits */ }
  async discardInBuffer(): Promise<void> { /* nothing buffered */ }

  get durationMs(): number {
    return this.records.length ? this.records[this.records.length - 1]!.t : 0;
  }

  get positionMs(): number {
    if (!this.playing) return this.baseMs;
    return Math.min(this.durationMs, this.baseMs + (Date.now() - this.wallStart) * this.speed_);
  }

  status(): ReplayStatus {
    return {
      file: this.portName,
      playing: this.playing,
      speed: this.speed_,
      positionMs: this.positionMs,
      durationMs: this.durationMs,
      ended: this.index >= this.records.length,
    };
  }

  play(): void {
    if (!this.open_ || this.playing) return;
    if (this.index >= this.records.length) this.seek(0);
    this.playing = true;
    this.wallStart = Date.now();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.publish();
  }

  pause(): void {
    if (!this.playing) return;
    this.baseMs = this.positionMs;
    this.playing = false;
    this.stopTimer();
    this.publish();
  }

  setSpeed(speed: number): void {
    const s = Math.min(64, Math.max(0.1, speed));
    if (this.playing) { this.baseMs = this.positionMs; this.wallStart = Date.now(); }
    this.speed_ = s;
    this.publish();
  }

  /** Jump to a log time. Going forward fast-forwards silently except for the newest state; the map trail is not rebuilt. */
  seek(ms: number): void {
    const target = Math.min(this.durationMs, Math.max(0, ms));
    let lo = 0;
    let hi = this.records.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.records[mid]!.t < target) lo = mid + 1; else hi = mid;
    }
    this.index = lo;
    this.baseMs = target;
    this.wallStart = Date.now();
    // Replay the last packet of each message type before the target so every gauge shows that moment at once.
    const latest = new Map<string, Uint8Array>();
    for (let i = Math.max(0, lo - 3000); i < lo; i++) {
      const r = this.records[i]!;
      latest.set(`${r.packet[r.packet[0] === MAVLINK_V1_STX ? 3 : 5]}:${r.msgid}`, r.packet);
    }
    for (const p of latest.values()) this.emitPacket(p);
    this.publish();
  }

  private tick(): void {
    const now = this.positionMs;
    let sent = 0;
    while (this.index < this.records.length && this.records[this.index]!.t <= now && sent < MAX_PACKETS_PER_TICK) {
      this.emitPacket(this.records[this.index]!.packet);
      this.index++;
      sent++;
    }
    if (this.index >= this.records.length) {
      this.baseMs = this.durationMs;
      this.playing = false;
      this.stopTimer();
    }
    this.publish();
  }

  private emitPacket(packet: Uint8Array): void {
    if (msgIdOf(packet) === HEARTBEAT_ID) this.lastHeartbeat = packet;
    this.emit('data', packet);
  }

  private sendKeepalive(): void {
    if (this.playing || !this.lastHeartbeat) return;
    this.emit('data', this.lastHeartbeat);
  }

  private stopTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  private lastPublish = 0;
  private publish(): void {
    const now = Date.now();
    // 4 Hz is plenty for a scrub bar; state changes (play, pause, seek) always go out.
    if (this.playing && now - this.lastPublish < 250 && this.index < this.records.length) return;
    this.lastPublish = now;
    this.onStatus?.(this.status());
  }
}
