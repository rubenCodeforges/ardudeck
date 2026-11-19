import Store from 'electron-store';
import { verifyCalibrationPersisted, type CalibrationRecordIpc } from '../../shared/calibration-quality.js';

export type CalibrationRecord = CalibrationRecordIpc;

const store = new Store<{ boards: Record<string, CalibrationRecord[]> }>({
  name: 'calibration-records',
  defaults: { boards: {} },
});

/**
 * A parameter belongs to the newest run that wrote it. Quick and six-point accel share INS_ACCOFFS_*, so after
 * both ran the older record still held the numbers the newer run replaced and the post-reboot check called
 * them lost (#159). Each record keeps only the values no newer run rewrote; a record left with none is retired.
 */
function supersede(records: CalibrationRecord[]): CalibrationRecord[] {
  const taken = new Set<string>();
  const out: CalibrationRecord[] = [];
  const newestFirst = [...records].sort((a, b) => b.completedAt - a.completedAt);
  const latestOfType = new Set<string>();
  for (const record of newestFirst) {
    if (latestOfType.has(record.type)) continue;
    latestOfType.add(record.type);
    const names = Object.keys(record.written);
    const kept = names.filter((n) => !taken.has(n));
    names.forEach((n) => taken.add(n));
    if (kept.length === 0) continue;
    if (kept.length === names.length) {
      out.push(record);
      continue;
    }
    const written = Object.fromEntries(kept.map((n) => [n, record.written[n]!]));
    // A verdict on the dropped values says nothing about the rest: re-check them.
    const persistence = record.persistence?.state === 'verified' ? record.persistence : null;
    out.push({ ...record, written, persistence });
  }
  return out;
}

/** Latest run per type wins, and a newer run owns every parameter it wrote. */
export function saveCalibrationRecord(boardUid: string, record: CalibrationRecord): void {
  const boards = store.get('boards');
  boards[boardUid] = supersede([record, ...(boards[boardUid] ?? []).filter((r) => r.type !== record.type)]).slice(0, 12);
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
  const stored = boards[boardUid] ?? [];
  const records = supersede(stored);
  if (JSON.stringify(records) !== JSON.stringify(stored)) {
    boards[boardUid] = records;
    store.set('boards', boards);
  }

  // Anything not yet verified is read again, failures included: a record wrongly condemned once (a dropped
  // reply, a read taken before the FC finished writing) heals on the next connect, a real loss stays flagged.
  const needsCheck = (r: CalibrationRecord): boolean =>
    r.persistence === null || r.persistence.state !== 'verified' || r.persistence.readBackOnly === true;
  const unchecked = records.filter(needsCheck);
  if (unchecked.length === 0) return records;

  const names = [...new Set(unchecked.flatMap((r) => Object.keys(r.written)))];
  const readBack = await readParams(names);
  const checkedAt = Date.now();

  boards[boardUid] = records.map((record) => {
    if (!needsCheck(record)) return record;
    const result = verifyCalibrationPersisted(record.written, readBack);
    if (result.state === 'unverified') return record;
    // A read-back confirmation that still holds stays as it was: the re-check only speaks up when a value is lost.
    if (record.persistence?.readBackOnly && result.state === 'verified') return record;
    const settled = { ...record, persistence: { ...result, checkedAt } };
    onSettled?.(settled, result.state === 'verified');
    return settled;
  });
  store.set('boards', boards);
  return boards[boardUid]!;
}
