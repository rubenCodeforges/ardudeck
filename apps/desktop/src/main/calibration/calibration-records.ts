import Store from 'electron-store';
import { verifyCalibrationPersisted, type CalibrationRecordIpc } from '../../shared/calibration-quality.js';

export type CalibrationRecord = CalibrationRecordIpc;

const store = new Store<{ boards: Record<string, CalibrationRecord[]> }>({
  name: 'calibration-records',
  defaults: { boards: {} },
});

/** Latest run per type wins; a record whose every param a newer run rewrote is retired too. */
export function saveCalibrationRecord(boardUid: string, record: CalibrationRecord): void {
  const boards = store.get('boards');
  const names = new Set(Object.keys(record.written));
  const existing = (boards[boardUid] ?? []).filter(
    (r) => r.type !== record.type && !Object.keys(r.written).every((n) => names.has(n)),
  );
  boards[boardUid] = [record, ...existing].slice(0, 12);
  store.set('boards', boards);
}

export function listCalibrationRecords(boardUid: string): CalibrationRecord[] {
  return store.get('boards')[boardUid] ?? [];
}

/** Settle whether unchecked records survived the reboot. `readParams` must read the FC, never a cache. */
export async function verifyCalibrationRecords(
  boardUid: string,
  readParams: (names: string[]) => Promise<Record<string, number>>,
  onSettled?: (record: CalibrationRecord, verified: boolean) => void,
): Promise<CalibrationRecord[]> {
  const boards = store.get('boards');
  const records = (boards[boardUid] ?? []).filter((r, i, all) =>
    !all.some(
      (other, j) =>
        j !== i &&
        other.completedAt > r.completedAt &&
        Object.keys(r.written).every((n) => n in other.written),
    ),
  );
  if (records.length !== (boards[boardUid] ?? []).length) {
    boards[boardUid] = records;
    store.set('boards', boards);
  }

  const unchecked = records.filter((r) => r.persistence === null);
  if (unchecked.length === 0) return records;

  const names = [...new Set(unchecked.flatMap((r) => Object.keys(r.written)))];
  const readBack = await readParams(names);
  const checkedAt = Date.now();

  boards[boardUid] = records.map((record) => {
    if (record.persistence !== null) return record;
    const result = verifyCalibrationPersisted(record.written, readBack);
    if (result.state === 'unverified') return record;
    const settled = { ...record, persistence: { ...result, checkedAt } };
    onSettled?.(settled, result.state === 'verified');
    return settled;
  });
  store.set('boards', boards);
  return boards[boardUid]!;
}
