import { describe, it, expect } from 'vitest';
import { decodeServoOutputRaw } from './servo-output-decode';

function u16le(v: number): [number, number] {
  return [v & 0xff, (v >> 8) & 0xff];
}

/** Build a full (untruncated) SERVO_OUTPUT_RAW payload. */
function buildServoOutputRaw(servos: number[], port = 0): Uint8Array {
  const bytes: number[] = [0xaa, 0xbb, 0xcc, 0xdd]; // time_usec (nonzero)
  for (let i = 0; i < 8; i++) bytes.push(...u16le(servos[i] ?? 0));
  bytes.push(port);
  for (let i = 8; i < 16; i++) bytes.push(...u16le(servos[i] ?? 0));
  return new Uint8Array(bytes);
}

/** Simulate MAVLink v2 trailing-zero-byte truncation. */
function truncateV2(payload: Uint8Array): Uint8Array {
  let end = payload.length;
  while (end > 0 && payload[end - 1] === 0) end--;
  return payload.slice(0, end);
}

describe('decodeServoOutputRaw', () => {
  it('decodes a truncated quad payload that the old >= 21 guard dropped', () => {
    // A quad: 4 active outputs, the rest zero. port=0. After v2 truncation the
    // port byte and high servos are stripped, leaving a 12-byte payload - which
    // the previous `payload.length >= 21` guard rejected, killing the live view.
    const full = buildServoOutputRaw([1000, 1100, 1200, 1300]);
    const wire = truncateV2(full);

    expect(wire.length).toBeLessThan(21); // would have been dropped before

    const decoded = decodeServoOutputRaw(wire);
    expect(decoded).not.toBeNull();
    expect(decoded!.outputs).toEqual([1000, 1100, 1200, 1300, 0, 0, 0, 0]);
  });

  it('decodes all 8 main outputs when present but port byte is truncated', () => {
    const wire = truncateV2(buildServoOutputRaw([1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800]));
    // Eight nonzero servos + port=0 → port and extension truncated to 20 bytes.
    expect(wire.length).toBe(20);
    const decoded = decodeServoOutputRaw(wire);
    expect(decoded!.outputs).toEqual([1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800]);
  });

  it('decodes the v2 extension channels 9-16 when present', () => {
    const servos = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000, 0, 0, 0, 0, 0];
    const wire = truncateV2(buildServoOutputRaw(servos));
    const decoded = decodeServoOutputRaw(wire);
    expect(decoded!.outputs).toEqual(servos);
  });

  it('ignores AUX ports (port != 0)', () => {
    const wire = buildServoOutputRaw([1000, 1100, 1200, 1300], 1);
    expect(decodeServoOutputRaw(wire)).toBeNull();
  });

  it('returns null for a payload too short to carry a servo value', () => {
    expect(decodeServoOutputRaw(new Uint8Array([0xaa, 0xbb, 0xcc, 0xdd]))).toBeNull();
    expect(decodeServoOutputRaw(new Uint8Array([]))).toBeNull();
  });

  it('decodes a full untruncated 37-byte payload', () => {
    const servos = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1810, 1910, 1210, 1310, 1410, 1510, 1610, 1710];
    const decoded = decodeServoOutputRaw(buildServoOutputRaw(servos));
    expect(decoded!.outputs).toEqual(servos);
  });
});
