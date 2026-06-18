import { describe, it, expect } from 'vitest';
import { serializeParamSet, deserializeParamValue } from '@ardudeck/mavlink-ts';
import { MavParamType } from '../shared/parameter-types.js';
import { decodePx4ParamValue, encodePx4ParamSetValue } from './px4-param-bytewise.js';

// Build a PARAM_VALUE-shaped payload from a PARAM_SET payload so the decode
// path sees realistic wire bytes: both messages carry param_value as the
// little-endian 4 bytes at offset 0, which is all the decoder reads.
function setPayloadFor(value: number, type: number): Uint8Array {
  const payload = serializeParamSet({
    targetSystem: 1,
    targetComponent: 1,
    paramId: 'TEST_PARAM',
    paramValue: value,
    paramType: type,
  });
  encodePx4ParamSetValue(payload, value, type);
  return payload;
}

describe('PX4 bytewise param value encoding', () => {
  it('round-trips an INT32 bytewise and diverges from the float convention', () => {
    const value = 12345;
    const payload = setPayloadFor(value, MavParamType.INT32);

    // PX4 (bytewise) read returns the true integer.
    expect(decodePx4ParamValue(payload, MavParamType.INT32)).toBe(value);

    // ArduPilot (by-value / float) read of the SAME bytes yields garbage:
    // the two conventions must diverge.
    const asFloat = deserializeParamValue(payload).paramValue;
    expect(asFloat).not.toBe(value);
  });

  it('round-trips a negative INT32 bytewise', () => {
    const value = -7;
    const payload = setPayloadFor(value, MavParamType.INT32);
    expect(decodePx4ParamValue(payload, MavParamType.INT32)).toBe(value);

    const asFloat = deserializeParamValue(payload).paramValue;
    // -7 as int32 bits is 0xFFFFFFF9, which read as float32 is NaN.
    expect(Number.isNaN(asFloat) || asFloat !== value).toBe(true);
  });

  it('round-trips UINT8 / INT8 / UINT16 / INT16 with zero-padded high bytes', () => {
    const cases: Array<[number, number]> = [
      [MavParamType.UINT8, 200],
      [MavParamType.INT8, -5],
      [MavParamType.UINT16, 60000],
      [MavParamType.INT16, -1234],
      [MavParamType.UINT32, 4000000000],
    ];
    for (const [type, value] of cases) {
      const payload = setPayloadFor(value, type);
      expect(decodePx4ParamValue(payload, type)).toBe(value);
    }
  });

  it('keeps REAL32 correct under both conventions', () => {
    const value = 3.25;
    const payload = setPayloadFor(value, MavParamType.REAL32);

    // encodePx4ParamSetValue must leave REAL32 untouched (still float bytes).
    expect(decodePx4ParamValue(payload, MavParamType.REAL32)).toBeCloseTo(value, 6);
    expect(deserializeParamValue(payload).paramValue).toBeCloseTo(value, 6);
  });
});
