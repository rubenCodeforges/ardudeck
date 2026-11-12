import { describe, expect, it } from 'vitest';
import { describeParamValue } from './param-value-label';

describe('describeParamValue', () => {
  it('names the set bits of a bitmask', () => {
    const meta = { bitmask: { 0: 'GPS', 1: 'Compass', 7: 'Baro' } };
    expect(describeParamValue(131, meta)).toEqual({ kind: 'bitmask', text: 'GPS, Compass, Baro', bits: ['GPS', 'Compass', 'Baro'] });
    expect(describeParamValue(0, meta)).toEqual({ kind: 'bitmask', text: '', bits: [] });
  });

  it('labels an enum value, float32 noise included', () => {
    const meta = { values: { 0: 'Disabled', 1: 'Enabled' } };
    expect(describeParamValue(1, meta)).toEqual({ kind: 'enum', text: 'Enabled' });
    expect(describeParamValue(Math.fround(1.0000000001), meta)).toEqual({ kind: 'enum', text: 'Enabled' });
    expect(describeParamValue(5, meta)).toBeNull();
  });

  it('says nothing without metadata', () => {
    expect(describeParamValue(3, undefined)).toBeNull();
    expect(describeParamValue(3, {})).toBeNull();
  });
});
