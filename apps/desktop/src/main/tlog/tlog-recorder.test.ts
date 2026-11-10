import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, utimesSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { TlogRecorder, frameTlogRecord, tlogFileName, TLOG_STAMP_BYTES } from './tlog-recorder';

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'tlog-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const packet = (n: number): Uint8Array => Uint8Array.from([0xfd, 1, 0, 0, n, 1, 1, 0, 0, 0, 7, 0xaa, 0xbb]);

describe('frameTlogRecord', () => {
  it('prefixes the packet with big-endian microseconds', () => {
    const rec = frameTlogRecord(packet(1), 1_700_000_000_123);
    expect(rec.length).toBe(TLOG_STAMP_BYTES + packet(1).length);
    expect(rec.readBigUInt64BE(0)).toBe(1_700_000_000_123_000n);
    expect([...rec.subarray(TLOG_STAMP_BYTES)]).toEqual([...packet(1)]);
  });

  it('clamps a negative timestamp to zero', () => {
    expect(frameTlogRecord(packet(1), -5).readBigUInt64BE(0)).toBe(0n);
  });
});

describe('tlogFileName', () => {
  it('is a sortable local date and time', () => {
    expect(tlogFileName(new Date(2026, 10, 8, 9, 5, 3))).toBe('2026-11-08_09-05-03.tlog');
  });
});

describe('TlogRecorder', () => {
  it('writes every packet of a session to one file in order', async () => {
    const dir = tmp();
    const rec = new TlogRecorder({ dir, flushMs: 5 });
    rec.record(packet(1), 1000);
    rec.record(packet(2), 2000);
    await rec.end();
    const files = readdirSync(dir).filter((n) => n.endsWith('.tlog'));
    expect(files).toHaveLength(1);
    const bytes = readFileSync(join(dir, files[0]!));
    const size = TLOG_STAMP_BYTES + packet(1).length;
    expect(bytes.length).toBe(size * 2);
    expect(bytes.readBigUInt64BE(0)).toBe(1_000_000n);
    expect(bytes[TLOG_STAMP_BYTES + 4]).toBe(1);
    expect(bytes.readBigUInt64BE(size)).toBe(2_000_000n);
    expect(bytes[size + TLOG_STAMP_BYTES + 4]).toBe(2);
  });

  it('records nothing while disabled', async () => {
    const dir = tmp();
    const rec = new TlogRecorder({ dir, enabled: () => false, flushMs: 5 });
    rec.record(packet(1));
    await rec.end();
    expect(readdirSync(dir)).toHaveLength(0);
  });

  it('starts a new file after the idle gap', async () => {
    const dir = tmp();
    let t = new Date(2026, 10, 8, 10, 0, 0).getTime();
    const rec = new TlogRecorder({ dir, flushMs: 5, now: () => t });
    rec.record(packet(1));
    await rec.end();
    t += 5000;
    rec.record(packet(2));
    await rec.end();
    expect(readdirSync(dir).filter((n) => n.endsWith('.tlog'))).toHaveLength(2);
  });

  it('keeps only the newest files when over the file cap', async () => {
    const dir = tmp();
    for (let i = 1; i <= 4; i++) {
      const p = join(dir, `2026-01-0${i}_00-00-00.tlog`);
      writeFileSync(p, Buffer.alloc(10));
      utimesSync(p, i, i);
    }
    const rec = new TlogRecorder({ dir, maxFiles: 2 });
    await rec.prune();
    expect(readdirSync(dir).sort()).toEqual(['2026-01-03_00-00-00.tlog', '2026-01-04_00-00-00.tlog']);
  });

  it('trims the oldest files when over the size cap', async () => {
    const dir = tmp();
    for (let i = 1; i <= 3; i++) writeFileSync(join(dir, `2026-01-0${i}_00-00-00.tlog`), Buffer.alloc(100));
    const rec = new TlogRecorder({ dir, maxTotalBytes: 150 });
    await rec.prune();
    expect(readdirSync(dir)).toEqual(['2026-01-03_00-00-00.tlog']);
  });

  it('drops packets instead of queueing past the backlog cap', async () => {
    const dir = tmp();
    const rec = new TlogRecorder({ dir, flushMs: 60_000, maxBacklogBytes: 40 });
    for (let i = 0; i < 20; i++) rec.record(packet(i));
    await rec.end();
    const file = readdirSync(dir).find((n) => n.endsWith('.tlog'))!;
    const size = TLOG_STAMP_BYTES + packet(0).length;
    expect(readFileSync(join(dir, file)).length).toBeLessThan(20 * size);
  });
});
