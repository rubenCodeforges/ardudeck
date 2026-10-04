import { describe, expect, it } from 'vitest';
import { parsePeriphMetadata } from './periph-param-metadata';

describe('parsePeriphMetadata', () => {
  const store = parsePeriphMetadata({
    AP_Periph: {
      CAN_NODE: { DisplayName: 'DroneCAN node ID', Description: 'Node id', Range: { low: '0', high: '127' }, RebootRequired: 'True' },
      CAN_TERMINATE: { DisplayName: 'Termination', Values: { '0': 'Disabled', '1': 'Enabled' } },
    },
    NTF_: {
      NTF_LED_TYPES: { DisplayName: 'LED Driver Types', Bitmask: { '0': 'Built-in LED', '5': 'DroneCAN' } },
    },
    json: { version: 0 },
  });

  it('flattens groups into one store keyed by full name', () => {
    expect(Object.keys(store).sort()).toEqual(['CAN_NODE', 'CAN_TERMINATE', 'NTF_LED_TYPES']);
  });

  it('converts ranges, flags, values and bitmasks', () => {
    expect(store.CAN_NODE).toMatchObject({ humanName: 'DroneCAN node ID', range: { min: 0, max: 127 }, rebootRequired: true });
    expect(store.CAN_TERMINATE!.values).toEqual({ 0: 'Disabled', 1: 'Enabled' });
    expect(store.NTF_LED_TYPES!.bitmask).toEqual({ 0: 'Built-in LED', 5: 'DroneCAN' });
  });

  it('ignores garbage', () => {
    expect(parsePeriphMetadata(null)).toEqual({});
    expect(parsePeriphMetadata('x')).toEqual({});
  });
});
