import { createWriteStream, mkdirSync, promises as fsp, type WriteStream } from 'fs';
import { join } from 'path';

/** Bytes of timestamp in front of every packet in a .tlog. */
export const TLOG_STAMP_BYTES = 8;

/** One .tlog record: big-endian microseconds since the epoch, then the raw MAVLink packet. */
export function frameTlogRecord(packet: Uint8Array, timestampMs: number): Buffer {
  const out = Buffer.allocUnsafe(TLOG_STAMP_BYTES + packet.length);
  out.writeBigUInt64BE(BigInt(Math.max(0, Math.floor(timestampMs))) * 1000n, 0);
  out.set(packet, TLOG_STAMP_BYTES);
  return out;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Local date and time, sortable: 2026-11-08_10-21-28.tlog */
export function tlogFileName(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}.tlog`;
}

export interface TlogRecorderOptions {
  dir: string;
  enabled?: () => boolean;
  maxFiles?: number;
  maxTotalBytes?: number;
  idleMs?: number;
  flushMs?: number;
  maxBacklogBytes?: number;
  now?: () => number;
}

const DEFAULTS = {
  maxFiles: 50,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  idleMs: 30_000,
  flushMs: 500,
  maxBacklogBytes: 8 * 1024 * 1024,
};

/** One .tlog per connection session; `record` only buffers, a timer writes, so the telemetry path never waits on disk. */
export class TlogRecorder {
  private readonly dir: string;
  private readonly enabled: () => boolean;
  private readonly maxFiles: number;
  private readonly maxTotalBytes: number;
  private readonly idleMs: number;
  private readonly flushMs: number;
  private readonly maxBacklogBytes: number;
  private readonly now: () => number;

  private stream: WriteStream | null = null;
  private currentPath: string | null = null;
  private pending: Buffer[] = [];
  private pendingBytes = 0;
  private flushTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private dirReady = false;
  private closing: Promise<void> = Promise.resolve();

  constructor(opts: TlogRecorderOptions) {
    this.dir = opts.dir;
    this.enabled = opts.enabled ?? (() => true);
    this.maxFiles = opts.maxFiles ?? DEFAULTS.maxFiles;
    this.maxTotalBytes = opts.maxTotalBytes ?? DEFAULTS.maxTotalBytes;
    this.idleMs = opts.idleMs ?? DEFAULTS.idleMs;
    this.flushMs = opts.flushMs ?? DEFAULTS.flushMs;
    this.maxBacklogBytes = opts.maxBacklogBytes ?? DEFAULTS.maxBacklogBytes;
    this.now = opts.now ?? Date.now;
  }

  get folder(): string {
    return this.dir;
  }

  get activeFile(): string | null {
    return this.currentPath;
  }

  record(packet: Uint8Array, timestampMs: number = this.now()): void {
    if (!this.enabled()) {
      if (this.stream || this.pending.length > 0) void this.end();
      return;
    }
    if (this.pendingBytes + this.backlog() > this.maxBacklogBytes) return;
    if (!this.stream) this.open();
    if (!this.stream) return;
    this.pending.push(frameTlogRecord(packet, timestampMs));
    this.pendingBytes += TLOG_STAMP_BYTES + packet.length;
    if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), this.flushMs);
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => void this.end(), this.idleMs);
    this.idleTimer.unref?.();
  }

  private backlog(): number {
    return this.stream?.writableLength ?? 0;
  }

  private open(): void {
    if (!this.dirReady) {
      try {
        mkdirSync(this.dir, { recursive: true });
        this.dirReady = true;
      } catch {
        return;
      }
    }
    const path = join(this.dir, tlogFileName(new Date(this.now())));
    this.currentPath = path;
    const stream = createWriteStream(path, { flags: 'a' });
    stream.on('error', () => {
      if (this.stream === stream) {
        this.stream = null;
        this.currentPath = null;
        this.pending = [];
        this.pendingBytes = 0;
      }
    });
    this.stream = stream;
  }

  private flush(): void {
    this.flushTimer = null;
    if (!this.stream || this.pending.length === 0) return;
    const batch = Buffer.concat(this.pending);
    this.pending = [];
    this.pendingBytes = 0;
    this.stream.write(batch);
  }

  end(): Promise<void> {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    const stream = this.stream;
    if (!stream) return this.closing;
    this.flush();
    this.stream = null;
    this.currentPath = null;
    this.closing = new Promise<void>((resolve) => stream.end(() => resolve())).then(() => this.prune());
    return this.closing;
  }

  async prune(): Promise<void> {
    try {
      const names = (await fsp.readdir(this.dir)).filter((n) => n.endsWith('.tlog')).sort();
      const files: { path: string; size: number }[] = [];
      for (const name of names) {
        const path = join(this.dir, name);
        try {
          files.push({ path, size: (await fsp.stat(path)).size });
        } catch {
        }
      }
      let total = files.reduce((n, f) => n + f.size, 0);
      let count = files.length;
      for (const f of files) {
        if (count <= this.maxFiles && total <= this.maxTotalBytes) break;
        if (f.path === this.currentPath) continue;
        await fsp.unlink(f.path).catch(() => undefined);
        count -= 1;
        total -= f.size;
      }
    } catch {
    }
  }
}
