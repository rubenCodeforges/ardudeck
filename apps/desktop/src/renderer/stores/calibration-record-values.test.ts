import { describe, expect, it } from 'vitest';
import { settledCalibrationValues } from './calibration-record-values';

describe('settledCalibrationValues (#159)', () => {
  it('records the settled re-read over the first read', () => {
    // First read caught the FC mid-write: X new, Y still old.
    const rows = [
      { paramId: 'COMPASS_OFS_X', after: 112 },
      { paramId: 'COMPASS_OFS_Y', after: 0 },
    ];
    expect(settledCalibrationValues(rows, { COMPASS_OFS_X: 112, COMPASS_OFS_Y: -48 })).toEqual({
      COMPASS_OFS_X: 112,
      COMPASS_OFS_Y: -48,
    });
  });

  it('falls back to the first read for values the re-read did not return', () => {
    const rows = [
      { paramId: 'INS_ACCOFFS_X', after: 0.31 },
      { paramId: 'INS_ACCOFFS_Y', after: -0.2 },
    ];
    expect(settledCalibrationValues(rows, { INS_ACCOFFS_X: 0.3 })).toEqual({ INS_ACCOFFS_X: 0.3, INS_ACCOFFS_Y: -0.2 });
    expect(settledCalibrationValues(rows, undefined)).toEqual({ INS_ACCOFFS_X: 0.31, INS_ACCOFFS_Y: -0.2 });
  });

  it('skips rows with no value at all', () => {
    expect(settledCalibrationValues([{ paramId: 'A', after: null }], {})).toEqual({});
  });
});
