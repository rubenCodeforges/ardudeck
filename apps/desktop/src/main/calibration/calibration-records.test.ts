import { beforeEach, describe, expect, it, vi } from 'vitest';

const data: { boards: Record<string, unknown[]> } = { boards: {} };
vi.mock('electron-store', () => ({
  default: class {
    get(key: 'boards') { return data[key]; }
    set(key: 'boards', value: Record<string, unknown[]>) { data[key] = value; }
  },
}));

import type { CalibrationRecordIpc } from '../../shared/calibration-quality';

const { saveCalibrationRecord, verifyCalibrationRecords, listCalibrationRecords } = await import('./calibration-records');

const record = (persistence: CalibrationRecordIpc['persistence'] = null): CalibrationRecordIpc => ({
  type: 'accel',
  written: { INS_ACCOFFS_X: 0.42, INS_ACCOFFS_Y: -0.11 },
  verdict: 'good',
  summary: '',
  completedAt: 1,
  persistence,
});

describe('verifyCalibrationRecords (#159)', () => {
  beforeEach(() => { data.boards = {}; });

  it('leaves a record unchecked when some values were not read back', async () => {
    saveCalibrationRecord('b', record());
    const out = await verifyCalibrationRecords('b', async () => ({ INS_ACCOFFS_X: 0.42 }));
    expect(out[0]!.persistence).toBeNull();
  });

  it('heals a record that an earlier check wrongly condemned', async () => {
    saveCalibrationRecord('b', record({ state: 'not-persisted', summary: '', mismatched: ['INS_ACCOFFS_Y'], checkedAt: 1 }));
    const settled = vi.fn();
    const out = await verifyCalibrationRecords('b', async () => ({ INS_ACCOFFS_X: 0.42, INS_ACCOFFS_Y: -0.11 }), settled);
    expect(out[0]!.persistence?.state).toBe('verified');
    expect(settled).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('keeps flagging a real loss', async () => {
    saveCalibrationRecord('b', record({ state: 'not-persisted', summary: '', mismatched: ['INS_ACCOFFS_X'], checkedAt: 1 }));
    const out = await verifyCalibrationRecords('b', async () => ({ INS_ACCOFFS_X: 0, INS_ACCOFFS_Y: -0.11 }));
    expect(out[0]!.persistence?.state).toBe('not-persisted');
  });

  it('does not read again once verified', async () => {
    saveCalibrationRecord('b', record({ state: 'verified', summary: '', mismatched: [], checkedAt: 1 }));
    const read = vi.fn(async () => ({}));
    await verifyCalibrationRecords('b', read);
    expect(read).not.toHaveBeenCalled();
    expect(listCalibrationRecords('b')).toHaveLength(1);
  });
});

describe('overlapping calibrations (#159)', () => {
  beforeEach(() => { data.boards = {}; });

  const run = (type: string, written: Record<string, number>, completedAt: number): CalibrationRecordIpc => ({
    type, written, verdict: 'good', summary: '', completedAt, persistence: null,
  });

  it('does not condemn a quick accel whose offsets a later six-point rewrote', async () => {
    saveCalibrationRecord('b', run('accel-quick', { INS_ACCOFFS_X: 0.1, INS_ACCOFFS_Y: 0.2, INS_ACC2OFFS_X: 0.3 }, 1));
    saveCalibrationRecord('b', run('accel-6point', { INS_ACCOFFS_X: 0.5, INS_ACCOFFS_Y: 0.6, INS_ACCSCAL_X: 1.01 }, 2));
    const out = await verifyCalibrationRecords('b', async () => ({
      INS_ACCOFFS_X: 0.5, INS_ACCOFFS_Y: 0.6, INS_ACCSCAL_X: 1.01, INS_ACC2OFFS_X: 0.3,
    }));
    expect(out.map((r) => r.persistence?.state)).toEqual(['verified', 'verified']);
    expect(Object.keys(out.find((r) => r.type === 'accel-quick')!.written)).toEqual(['INS_ACC2OFFS_X']);
  });

  it('heals a stored record that was condemned on values a newer run owns', async () => {
    data.boards = {
      b: [
        run('accel-6point', { INS_ACCOFFS_X: 0.5 }, 2),
        { ...run('accel-quick', { INS_ACCOFFS_X: 0.1, INS_ACC2OFFS_X: 0.3 }, 1), persistence: { state: 'not-persisted', summary: '', mismatched: ['INS_ACCOFFS_X'], checkedAt: 1 } },
      ],
    };
    const out = await verifyCalibrationRecords('b', async () => ({ INS_ACCOFFS_X: 0.5, INS_ACC2OFFS_X: 0.3 }));
    expect(out.find((r) => r.type === 'accel-quick')!.persistence?.state).toBe('verified');
  });

  it('retires an older record once a newer run rewrote all of it', () => {
    saveCalibrationRecord('b', run('accel-quick', { INS_ACCOFFS_X: 0.1 }, 1));
    saveCalibrationRecord('b', run('accel-6point', { INS_ACCOFFS_X: 0.5, INS_ACCSCAL_X: 1 }, 2));
    expect(listCalibrationRecords('b').map((r) => r.type)).toEqual(['accel-6point']);
  });
});
