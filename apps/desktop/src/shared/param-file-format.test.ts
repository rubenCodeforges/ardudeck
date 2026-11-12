import { describe, expect, it } from 'vitest';
import { formatFromPath, formatParamFile, parseParamFile } from './param-file-format';

const QGC = `# Onboard parameters for Vehicle 1
#
# Stack: ArduPilot
# Vehicle: Multi-Rotor
# Version: 4.5.7
#
# Vehicle-Id Component-Id Name Value Type
1\t1\tACRO_BAL_PITCH\t1.000000000000000000\t9
1\t1\tFRAME_CLASS\t1\t2
1\t1\tATC_RAT_RLL_P\t0.135000005364418030\t9
`;

describe('parseParamFile', () => {
  it('reads a QGroundControl .params file by name, not by the id columns', () => {
    const r = parseParamFile(QGC);
    expect(r.format).toBe('qgc');
    expect(r.vehicleType).toBe('Multi-Rotor');
    expect(r.params).toEqual([
      { id: 'ACRO_BAL_PITCH', value: 1, type: 9 },
      { id: 'FRAME_CLASS', value: 1, type: 2 },
      { id: 'ATC_RAT_RLL_P', value: 0.13500000536441803, type: 9 },
    ]);
  });

  it('reads Mission Planner comma and space separated files', () => {
    const r = parseParamFile('# Vehicle: ArduCopter\nACRO_BAL_PITCH,1\nATC_RAT_RLL_P 0.135\n\nbad line\n');
    expect(r.format).toBe('mp');
    expect(r.vehicleType).toBe('ArduCopter');
    expect(r.params).toEqual([{ id: 'ACRO_BAL_PITCH', value: 1 }, { id: 'ATC_RAT_RLL_P', value: 0.135 }]);
  });

  it('skips rows whose value is not a number', () => {
    expect(parseParamFile('FOO,abc\n1\t1\tBAR\tnan\t9\n').params).toEqual([]);
  });
});

describe('formatParamFile', () => {
  const params = [{ id: 'FRAME_CLASS', value: 1, type: 2 }, { id: 'ATC_RAT_RLL_P', value: 0.13500000536441803 }];
  const date = new Date('2026-11-12T10:00:00Z');

  it('writes QGC rows with ids, cleaned values and types, and reads them back', () => {
    const text = formatParamFile(params, { format: 'qgc', sysid: 3, compid: 1, vehicleType: 'ArduCopter', date });
    expect(text).toContain('3\t1\tFRAME_CLASS\t1\t2');
    expect(text).toContain('3\t1\tATC_RAT_RLL_P\t0.135\t9');
    const back = parseParamFile(text);
    expect(back.format).toBe('qgc');
    expect(back.params.map((p) => [p.id, p.value])).toEqual([['FRAME_CLASS', 1], ['ATC_RAT_RLL_P', 0.135]]);
  });

  it('writes the Mission Planner format', () => {
    const text = formatParamFile(params, { format: 'mp', date });
    expect(text).toContain('FRAME_CLASS,1\nATC_RAT_RLL_P,0.135');
    expect(parseParamFile(text).params).toHaveLength(2);
  });

  it('picks the format from the file extension', () => {
    expect(formatFromPath('/x/vehicle.params')).toBe('qgc');
    expect(formatFromPath('/x/vehicle.param')).toBe('mp');
    expect(formatFromPath('/x/vehicle.txt')).toBe('mp');
  });
});
