/** The values to record for a finished calibration: the settled re-read where it answered, else the first read. */
export function settledCalibrationValues(
  rows: Array<{ paramId: string; after?: number | null }>,
  settled: Record<string, number> | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const later = settled?.[row.paramId];
    if (typeof later === 'number' && Number.isFinite(later)) out[row.paramId] = later;
    else if (typeof row.after === 'number') out[row.paramId] = row.after;
  }
  return out;
}
