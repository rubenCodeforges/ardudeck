import { describe, it, expect } from 'vitest';
import { parsePx4ParameterMetadata } from './px4-parameter-metadata.js';

describe('parsePx4ParameterMetadata', () => {
  it('maps a full entry with range, units, reboot, and increment', () => {
    const store = parsePx4ParameterMetadata({
      parameters: [
        {
          name: 'MC_ROLLRATE_P',
          type: 'Float',
          shortDesc: 'Roll rate P gain',
          longDesc: 'Roll rate proportional gain.',
          min: 0.01,
          max: 0.5,
          units: 'norm',
          increment: 0.01,
          decimalPlaces: 3,
          rebootRequired: true,
        },
      ],
    });

    expect(store.MC_ROLLRATE_P).toEqual({
      name: 'MC_ROLLRATE_P',
      humanName: 'Roll rate P gain',
      description: 'Roll rate proportional gain.',
      range: { min: 0.01, max: 0.5 },
      units: 'norm',
      increment: 0.01,
      rebootRequired: true,
    });
  });

  it('maps values[] to a Record and skips decimalPlaces', () => {
    const store = parsePx4ParameterMetadata({
      parameters: [
        {
          name: 'ADSB_EMERGC',
          shortDesc: 'ADSB-Out Emergency State',
          min: 0,
          max: 6,
          decimalPlaces: 2,
          values: [
            { value: 0, description: 'NoEmergency' },
            { value: 1, description: 'General' },
          ],
        },
      ],
    });

    const entry = store.ADSB_EMERGC;
    expect(entry).toBeDefined();
    expect(entry?.values).toEqual({ 0: 'NoEmergency', 1: 'General' });
    expect(entry?.increment).toBeUndefined();
    expect(entry?.range).toEqual({ min: 0, max: 6 });
  });

  it('maps bitmask[] (index) to a Record and volatile to readOnly', () => {
    const store = parsePx4ParameterMetadata({
      parameters: [
        {
          name: 'SIM_GZ_EC_MIXER',
          shortDesc: 'Mixer',
          volatile: true,
          bitmask: [
            { index: 0, description: 'SIM Channel 1' },
            { index: 1, description: 'SIM Channel 2' },
          ],
        },
      ],
    });

    const entry = store.SIM_GZ_EC_MIXER;
    expect(entry?.bitmask).toEqual({ 0: 'SIM Channel 1', 1: 'SIM Channel 2' });
    expect(entry?.readOnly).toBe(true);
  });

  it('handles a minimal entry and falls back humanName to name, description to empty', () => {
    const store = parsePx4ParameterMetadata({
      parameters: [{ name: 'BARE_PARAM', type: 'Int32' }],
    });

    expect(store.BARE_PARAM).toEqual({
      name: 'BARE_PARAM',
      humanName: 'BARE_PARAM',
      description: '',
    });
  });

  it('falls back description to shortDesc when longDesc absent', () => {
    const store = parsePx4ParameterMetadata({
      parameters: [{ name: 'P', shortDesc: 'Short only' }],
    });
    expect(store.P?.description).toBe('Short only');
    expect(store.P?.humanName).toBe('Short only');
  });

  it('skips entries with no name and tolerates non-object entries', () => {
    const store = parsePx4ParameterMetadata({
      parameters: [{ shortDesc: 'no name' }, null, 42, { name: 'OK' }],
    });
    expect(Object.keys(store)).toEqual(['OK']);
  });

  it('omits range when only one of min/max is present, and omits empty units', () => {
    const store = parsePx4ParameterMetadata({
      parameters: [{ name: 'X', min: 0, units: '' }],
    });
    expect(store.X?.range).toBeUndefined();
    expect(store.X?.units).toBeUndefined();
  });

  it('accepts a bare array (not wrapped in parameters)', () => {
    const store = parsePx4ParameterMetadata([{ name: 'ARR_PARAM' }]);
    expect(store.ARR_PARAM).toBeDefined();
  });

  it('returns an empty store for malformed top-level input', () => {
    expect(parsePx4ParameterMetadata(null)).toEqual({});
    expect(parsePx4ParameterMetadata({})).toEqual({});
    expect(parsePx4ParameterMetadata('nope')).toEqual({});
  });
});
