import { describe, it, expect } from 'vitest';
import {
  formatParamDisplayValue,
  summarizeBitmask,
  isIntegerishParamValue,
  paramValueAsEnumKey,
} from './param-display';
import type { ParameterMetadata } from './parameter-metadata';

describe('isIntegerishParamValue / paramValueAsEnumKey', () => {
  it('accepts clean integers and float32-noisy integers', () => {
    expect(isIntegerishParamValue(5)).toBe(true);
    expect(isIntegerishParamValue(Math.fround(5))).toBe(true);
    // Classic float32 noise around an integer
    expect(isIntegerishParamValue(5.0000002)).toBe(true);
    expect(paramValueAsEnumKey(5.0000002)).toBe(5);
  });

  it('rejects true floats (expo-style)', () => {
    expect(isIntegerishParamValue(0.135)).toBe(false);
    expect(isIntegerishParamValue(1.5)).toBe(false);
  });
});

describe('formatParamDisplayValue', () => {
  const meta: ParameterMetadata = {
    name: 'FLTMODE1',
    humanName: 'Flight Mode 1',
    description: '',
    values: {
      0: 'Stabilize',
      5: 'Loiter',
    },
  };

  it('shows enum label when known', () => {
    expect(formatParamDisplayValue(5, meta)).toBe('5 \u2014 Loiter');
  });

  it('shows enum label under float32 noise', () => {
    expect(formatParamDisplayValue(5.0000002, meta)).toBe('5 \u2014 Loiter');
  });

  it('falls back to number when unknown', () => {
    expect(formatParamDisplayValue(99, meta)).toBe('99');
  });

  it('returns number without meta', () => {
    expect(formatParamDisplayValue(1.5)).toBe('1.5');
  });

  it('summarizes bitmask params', () => {
    const bm: ParameterMetadata = {
      name: 'ARMING_CHECK',
      humanName: 'Arming Check',
      description: '',
      bitmask: { 0: 'All', 1: 'Baro', 2: 'Compass' },
    };
    expect(formatParamDisplayValue(0, bm)).toBe('0');
    expect(formatParamDisplayValue(3, bm)).toBe('All, Baro (3)');
  });

  it('falls through when values map is empty', () => {
    const empty: ParameterMetadata = {
      name: 'X',
      humanName: 'X',
      description: '',
      values: {},
    };
    expect(formatParamDisplayValue(5, empty)).toBe('5');
  });

  it('prefers bitmask over values when both are present', () => {
    const both: ParameterMetadata = {
      name: 'MIXED',
      humanName: 'Mixed',
      description: '',
      values: { 3: 'ShouldNotShow' },
      bitmask: { 0: 'All', 1: 'Baro' },
    };
    // Product rule: bitmask takes precedence (same as formatParamDisplayValue order)
    expect(formatParamDisplayValue(3, both)).toBe('All, Baro (3)');
    expect(formatParamDisplayValue(3, both)).not.toContain('ShouldNotShow');
  });
});

describe('summarizeBitmask', () => {
  it('overflows long flag lists', () => {
    const bitmask = { 0: 'A', 1: 'B', 2: 'C', 3: 'D' };
    expect(summarizeBitmask(15, bitmask, 2)).toBe('A, B +2 (15)');
  });

  it('surfaces unknown set bits', () => {
    const bitmask = { 0: 'All' };
    // bit0 + bit3 set → All, bit3
    expect(summarizeBitmask(0b1001, bitmask)).toBe('All, bit3 (9)');
  });
});
