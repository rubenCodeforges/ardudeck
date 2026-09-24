import { describe, it, expect } from 'vitest';
import { buildCrsfFrame, CRSF_FRAMETYPE_LINK_STATISTICS } from '../link-doctor/crsf-protocol.js';
import { CRSF_FRAMETYPE_FLIGHT_MODE, CRSF_FRAMETYPE_GPS } from './crsf-telemetry.js';
import { CrsfReceiver, CRSF_STALE_MS } from './crsf-receiver.js';

function gpsFrame(sats = 12): Uint8Array {
  const payload = new Uint8Array(15);
  const v = new DataView(payload.buffer);
  v.setInt32(0, 525200000, false);
  v.setInt32(4, 134050000, false);
  v.setUint16(8, 360, false);
  v.setUint16(10, 9000, false);
  v.setUint16(12, 1100, false);
  payload[14] = sats;
  return buildCrsfFrame(CRSF_FRAMETYPE_GPS, payload);
}

const linkFrame = buildCrsfFrame(
  CRSF_FRAMETYPE_LINK_STATISTICS,
  new Uint8Array([60, 70, 100, 8, 0, 2, 3, 65, 99, 0]),
);

function join(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

describe('CrsfReceiver', () => {
  it('decodes several frames from one datagram', () => {
    const rx = new CrsfReceiver();
    const decoded = rx.feed(join(gpsFrame(), linkFrame, buildCrsfFrame(CRSF_FRAMETYPE_FLIGHT_MODE, new Uint8Array([0x41, 0x4e, 0x47, 0x4c, 0]))), 1000);
    expect(decoded).toBe(2);
    expect(rx.batch().gps?.satellites).toBe(12);
    expect(rx.batch().flight?.mode).toBe('ANGL');
    expect(rx.linkLine()).toContain('LQ 100%');
  });

  it('reassembles a frame split across two datagrams', () => {
    const rx = new CrsfReceiver();
    const frame = gpsFrame();
    expect(rx.feed(frame.slice(0, 5), 1000)).toBe(0);
    expect(rx.feed(frame.slice(5), 1010)).toBe(1);
    expect(rx.batch().gps?.lat).toBeCloseTo(52.52, 6);
  });

  it('skips junk ahead of a valid frame', () => {
    const rx = new CrsfReceiver();
    expect(rx.feed(join(new Uint8Array([0x01, 0x02, 0x03]), gpsFrame()), 1000)).toBe(1);
  });

  it('counts the link as dead before any telemetry arrives', () => {
    const rx = new CrsfReceiver();
    expect(rx.hasTelemetry).toBe(false);
    expect(rx.isStale(1000)).toBe(true);
  });

  it('does not come alive on link statistics alone', () => {
    const rx = new CrsfReceiver();
    expect(rx.feed(linkFrame, 1000)).toBe(0);
    expect(rx.hasTelemetry).toBe(false);
    expect(rx.isStale(1000)).toBe(true);
    expect(rx.batch().radioStatus).toBeDefined();
  });

  it('goes stale once telemetry stops', () => {
    const rx = new CrsfReceiver();
    rx.feed(gpsFrame(), 1000);
    expect(rx.isStale(1000 + CRSF_STALE_MS)).toBe(false);
    expect(rx.isStale(1001 + CRSF_STALE_MS)).toBe(true);
  });

  it('caps the tail so a junk stream cannot grow memory', () => {
    const rx = new CrsfReceiver();
    // 0xC8 is a sync byte, so every one of these looks like a frame start.
    for (let i = 0; i < 20; i++) rx.feed(new Uint8Array(1000).fill(0xc8), 1000 + i);
    expect(rx.feed(gpsFrame(), 2000)).toBe(1);
  });
});
