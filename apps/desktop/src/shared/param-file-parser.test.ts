import { describe, it, expect } from 'vitest';
import {
  parseParamFile,
  compareParams,
  serializeParamFile,
  buildModifiedFromFile,
  detectParamFileFormat,
  extractVehicleTypeFromParamFile,
  shouldOpenParamCompareModal,
  offlineParamTypeFromParsed,
} from './param-file-parser';

describe('parseParamFile', () => {
  it('parses ArduPilot .param file format (space-separated)', () => {
    const text = `ARMING_CHECK 1
BATT_MONITOR 4
RC1_MIN 1100
RC1_MAX 1900`;
    const params = parseParamFile(text);
    expect(params).toHaveLength(4);
    expect(params[0]).toEqual({ name: 'ARMING_CHECK', value: 1 });
    expect(params[1]).toEqual({ name: 'BATT_MONITOR', value: 4 });
    expect(params[3]).toEqual({ name: 'RC1_MAX', value: 1900 });
  });

  it('parses comma-separated format', () => {
    const text = `ARMING_CHECK,1
BATT_MONITOR,4`;
    const params = parseParamFile(text);
    expect(params).toHaveLength(2);
    expect(params[0]).toEqual({ name: 'ARMING_CHECK', value: 1 });
  });

  it('skips comment lines starting with #', () => {
    const text = `# This is a comment
ARMING_CHECK 1
# Another comment
BATT_MONITOR 4`;
    const params = parseParamFile(text);
    expect(params).toHaveLength(2);
  });

  it('handles empty input', () => {
    expect(parseParamFile('')).toEqual([]);
  });

  it('skips blank lines', () => {
    const text = `ARMING_CHECK 1

BATT_MONITOR 4

`;
    const params = parseParamFile(text);
    expect(params).toHaveLength(2);
  });

  it('handles floating point values', () => {
    const text = `ATC_RAT_RLL_P 0.135
ATC_RAT_RLL_I 0.135
ATC_RAT_RLL_D 0.0036`;
    const params = parseParamFile(text);
    expect(params).toHaveLength(3);
    expect(params[0]!.value).toBeCloseTo(0.135);
    expect(params[2]!.value).toBeCloseTo(0.0036);
  });

  it('extracts vehicle type from header', () => {
    const text = `# ArduDeck Parameter File
# Vehicle: Copter
ARMING_CHECK,1`;
    expect(extractVehicleTypeFromParamFile(text)).toBe('Copter');
  });
});

describe('compareParams', () => {
  it('detects changed params', () => {
    const fileParams = [{ name: 'ARMING_CHECK', value: 0 }];
    const fcParams = new Map([['ARMING_CHECK', 1]]);
    const diffs = compareParams(fileParams, fcParams);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.status).toBe('changed');
    expect(diffs[0]!.fileValue).toBe(0);
    expect(diffs[0]!.fcValue).toBe(1);
  });

  it('detects added params (in file but not on FC)', () => {
    const fileParams = [{ name: 'NEW_PARAM', value: 42 }];
    const fcParams = new Map<string, number>();
    const diffs = compareParams(fileParams, fcParams);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.status).toBe('added');
    expect(diffs[0]!.fcValue).toBeNull();
  });

  it('detects unchanged params', () => {
    const fileParams = [{ name: 'ARMING_CHECK', value: 1 }];
    const fcParams = new Map([['ARMING_CHECK', 1]]);
    const diffs = compareParams(fileParams, fcParams);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]!.status).toBe('unchanged');
  });

  it('sorts results: changed first, then added, then unchanged', () => {
    const fileParams = [
      { name: 'UNCHANGED', value: 1 },
      { name: 'CHANGED', value: 2 },
      { name: 'ADDED', value: 3 },
    ];
    const fcParams = new Map([
      ['UNCHANGED', 1],
      ['CHANGED', 99],
    ]);
    const diffs = compareParams(fileParams, fcParams);
    expect(diffs[0]!.status).toBe('changed');
    expect(diffs[1]!.status).toBe('added');
    expect(diffs[2]!.status).toBe('unchanged');
  });
});

describe('QGC and serialize / buildModified', () => {
  it('parses QGC 5-column format', () => {
    const text = `# Onboard parameters
1\t1\tARMING_CHECK\t1\t9
1\t1\tBATT_MONITOR\t4\t9`;
    const params = parseParamFile(text);
    expect(params).toHaveLength(2);
    expect(params[0]).toEqual({ name: 'ARMING_CHECK', value: 1, type: 9 });
  });

  it('skips QGC header lines', () => {
    const text = `QGC WFW 000\n1 1 FLTMODE1 5 9`;
    const params = parseParamFile(text);
    expect(params).toHaveLength(1);
    expect(params[0]!.name).toBe('FLTMODE1');
  });

  it('handles BOM and CRLF', () => {
    const text = '\uFEFFARMING_CHECK 1\r\nBATT_MONITOR 4\r\n';
    expect(parseParamFile(text)).toHaveLength(2);
  });

  it('detects formats', () => {
    expect(detectParamFileFormat('ARMING_CHECK 1')).toBe('mp');
    expect(detectParamFileFormat('QGC WFW 000\n1 1 FLTMODE1 5 9')).toBe('qgc');
    expect(detectParamFileFormat('# only comments')).toBe('unknown');
  });

  it('round-trips MP serialize', () => {
    const rows = [{ name: 'ARMING_CHECK', value: 1 }, { name: 'WP_SPEED', value: 5.5 }];
    const text = serializeParamFile(rows, { format: 'mp' });
    const parsed = parseParamFile(text);
    expect(parsed).toEqual([
      { name: 'ARMING_CHECK', value: 1 },
      { name: 'WP_SPEED', value: 5.5 },
    ]);
  });

  it('round-trips QGC serialize including type', () => {
    const rows = [
      { name: 'ARMING_CHECK', value: 1, type: 6 },
      { name: 'WP_SPEED', value: 5.5, type: 9 },
    ];
    const text = serializeParamFile(rows, { format: 'qgc', systemId: 1, componentId: 1 });
    const parsed = parseParamFile(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ name: 'ARMING_CHECK', value: 1, type: 6 });
    expect(parsed[1]).toEqual({ name: 'WP_SPEED', value: 5.5, type: 9 });
  });

  it('buildModifiedFromFile sets and clears modifications', () => {
    const fc = new Map([['ARMING_CHECK', 1], ['FLTMODE1', 0]]);
    const r1 = buildModifiedFromFile([{ name: 'ARMING_CHECK', value: 2 }], fc);
    expect(r1.modified.get('ARMING_CHECK')).toBe(2);
    expect(r1.applied).toBe(1);
    const r2 = buildModifiedFromFile([{ name: 'ARMING_CHECK', value: 1 }], fc, r1.modified);
    expect(r2.modified.has('ARMING_CHECK')).toBe(false);
  });

  it('buildModifiedFromFile counts unknown names', () => {
    const fc = new Map([['ARMING_CHECK', 1]]);
    const r = buildModifiedFromFile([{ name: 'NOT_ON_FC', value: 9 }], fc);
    expect(r.unknown).toBe(1);
    expect(r.applied).toBe(0);
  });

  it('treats float32 noise as unchanged (f32-aware equality)', () => {
    // Guaranteed same float32: both sides from Math.fround of the same logical value,
    // plus a double that differs in lower bits but frounds to the same f32.
    const logical = 0.135;
    const fcVal = Math.fround(logical);
    // Construct a double that is not === fcVal but shares the same float32.
    const noisyDouble = fcVal + Number.EPSILON * 8;
    expect(Math.fround(noisyDouble)).toBe(fcVal); // precondition always enforced
    expect(noisyDouble === fcVal).toBe(false); // would false-positive with strict !==

    const fc = new Map([['ATC_RAT_RLL_P', fcVal]]);
    const diffs = compareParams([{ name: 'ATC_RAT_RLL_P', value: noisyDouble }], fc);
    expect(diffs[0]!.status).toBe('unchanged');
    const mod = buildModifiedFromFile([{ name: 'ATC_RAT_RLL_P', value: noisyDouble }], fc);
    expect(mod.modified.has('ATC_RAT_RLL_P')).toBe(false);
  });

  it('detects real float changes even with f32 equality', () => {
    const fc = new Map([['ATC_RAT_RLL_P', 0.135]]);
    const diffs = compareParams([{ name: 'ATC_RAT_RLL_P', value: 0.2 }], fc);
    expect(diffs[0]!.status).toBe('changed');
  });

  it('shouldOpenParamCompareModal only for value diffs', () => {
    expect(shouldOpenParamCompareModal(0, 0)).toBe(false);
    expect(shouldOpenParamCompareModal(0, 5)).toBe(false); // skipped-only → toast, no modal
    expect(shouldOpenParamCompareModal(3, 0)).toBe(true);
    expect(shouldOpenParamCompareModal(2, 10)).toBe(true);
  });

  it('offlineParamTypeFromParsed defaults REAL32 and preserves QGC types', () => {
    expect(offlineParamTypeFromParsed(undefined)).toBe(9);
    expect(offlineParamTypeFromParsed(6)).toBe(6);
  });

  it('skips // and ; comment styles and inline comments', () => {
    const text = `// header
; another
ARMING_CHECK 1 # inline
BATT_MONITOR 4 // tail
`;
    expect(parseParamFile(text)).toEqual([
      { name: 'ARMING_CHECK', value: 1 },
      { name: 'BATT_MONITOR', value: 4 },
    ]);
  });

  it('rejects invalid parameter names', () => {
    const text = `123BAD 1
_LEADING 2
GOOD_PARAM 3
`;
    const params = parseParamFile(text);
    expect(params).toHaveLength(1);
    expect(params[0]!.name).toBe('GOOD_PARAM');
  });

  it('returns empty for unrecognized content', () => {
    expect(parseParamFile('not a param file at all\n!!!')).toEqual([]);
    expect(detectParamFileFormat('not a param file')).toBe('unknown');
  });

  it('preserves QGC type through parse for offline type round-trip', () => {
    const text = `1\t1\tARMING_CHECK\t1\t6
1\t1\tWP_SPEED\t5.5\t9`;
    const params = parseParamFile(text);
    expect(params[0]).toEqual({ name: 'ARMING_CHECK', value: 1, type: 6 });
    expect(params[1]!.type).toBe(9);
    // Simulate offline store mapping: type from file or REAL32 default
    const offlineTypes = params.map((p) => p.type ?? 9);
    expect(offlineTypes).toEqual([6, 9]);
  });
});
