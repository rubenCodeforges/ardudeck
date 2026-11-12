import { describe, it, expect } from 'vitest';
import { parseTlog } from './tlog-replay.js';
import { frameTlogRecord } from './tlog-recorder.js';

function v2Packet(msgid: number, payloadLen: number, signed = false): Uint8Array {
  const p = new Uint8Array(10 + payloadLen + 2 + (signed ? 13 : 0));
  p[0] = 0xfd;
  p[1] = payloadLen;
  p[2] = signed ? 1 : 0;
  p[5] = 1;
  p[7] = msgid & 0xff;
  p[8] = (msgid >> 8) & 0xff;
  p[9] = (msgid >> 16) & 0xff;
  return p;
}

function v1Packet(msgid: number, payloadLen: number): Uint8Array {
  const p = new Uint8Array(6 + payloadLen + 2);
  p[0] = 0xfe;
  p[1] = payloadLen;
  p[5] = msgid;
  return p;
}

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};

describe('parseTlog', () => {
  it('reads v1, v2 and signed v2 records with times relative to the first', () => {
    const buf = concat([
      frameTlogRecord(v2Packet(0, 9), 1_000_000),
      frameTlogRecord(v1Packet(30, 28), 1_000_100),
      frameTlogRecord(v2Packet(33, 28, true), 1_000_250),
    ]);
    const recs = parseTlog(buf);
    expect(recs.map((r) => r.msgid)).toEqual([0, 30, 33]);
    expect(recs.map((r) => r.t)).toEqual([0, 100, 250]);
    expect(recs[2]!.packet.length).toBe(10 + 28 + 2 + 13);
  });

  it('skips junk and a truncated tail without losing good records', () => {
    const good = frameTlogRecord(v2Packet(0, 9), 5_000);
    const truncated = frameTlogRecord(v2Packet(24, 30), 5_100).subarray(0, 20);
    const buf = concat([new Uint8Array([1, 2, 3]), good, good, truncated]);
    const recs = parseTlog(buf);
    expect(recs).toHaveLength(2);
  });

  it('never goes back in time when the clock steps backwards', () => {
    const buf = concat([frameTlogRecord(v2Packet(0, 9), 2_000), frameTlogRecord(v2Packet(0, 9), 1_000)]);
    expect(parseTlog(buf).map((r) => r.t)).toEqual([0, 0]);
  });
});
