/** Elapsed time as HH:MM:SS, zero padded (24 hour style, no ambiguous m:ss.s), e.g. 00:05:20. */
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return `${p(hh)}:${p(mm)}:${p(ss)}`;
}

const GPS_EPOCH_MS = Date.UTC(1980, 0, 6);
const WEEK_MS = 7 * 24 * 3600 * 1000;
/** GPS time runs ahead of UTC by the leap seconds added since 1980 (18 s since 2017). */
const GPS_UTC_LEAP_MS = 18_000;

/**
 * Milliseconds to add to a log timestamp (microseconds since boot, divided by 1000) to get the UTC wall clock,
 * from one GPS record: GWk (GPS week) and GMS (ms into the week) taken at log time `timeUs`.
 * Returns null when the record carries no GPS time (no fix yet reports week 0).
 */
export function wallClockOffsetMs(timeUs: number, gpsWeek: number, gpsMsOfWeek: number): number | null {
  if (!(gpsWeek > 1000) || !(gpsMsOfWeek >= 0)) return null;
  const utcMs = GPS_EPOCH_MS + gpsWeek * WEEK_MS + gpsMsOfWeek - GPS_UTC_LEAP_MS;
  return utcMs - timeUs / 1000;
}

/** Wall clock as 24 hour HH:MM:SS in the viewer's own time zone. */
export function formatWallClock(utcMs: number): string {
  const d = new Date(utcMs);
  const p = (n: number) => (n < 10 ? '0' : '') + n;
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
