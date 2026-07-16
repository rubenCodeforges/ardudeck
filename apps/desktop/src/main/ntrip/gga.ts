/**
 * NMEA GGA sentence builder for NTRIP position uploads (issue #60).
 * VRS / network mountpoints use the uploaded GGA to synthesize corrections
 * for the rover's location, so the sentence is built from the vehicle's own
 * GPS_RAW_INT data rather than any GCS-side position.
 */

import type { GpsData } from '../../shared/telemetry-types.js';

/** MAVLink GPS_FIX_TYPE -> NMEA GGA fix quality field. */
function fixQuality(fixType: number): number {
  switch (fixType) {
    case 4: return 2; // DGPS
    case 5: return 5; // RTK float
    case 6: return 4; // RTK fixed
    default: return fixType >= 2 ? 1 : 0; // 2D/3D -> GPS fix, else invalid
  }
}

/** 12.3456 degrees -> "1220.73600" (ddmm.mmmmm as NMEA wants it). */
function toNmeaCoord(deg: number, width: number): string {
  const abs = Math.abs(deg);
  const d = Math.floor(abs);
  const m = (abs - d) * 60;
  const minutes = m.toFixed(5).padStart(8, '0'); // "mm.mmmmm"
  return `${String(d).padStart(width, '0')}${minutes}`;
}

function nmeaChecksum(body: string): string {
  let cs = 0;
  for (let i = 0; i < body.length; i++) cs ^= body.charCodeAt(i);
  return cs.toString(16).toUpperCase().padStart(2, '0');
}

/**
 * Build a GGA sentence from vehicle GPS data, or null when there is no fix
 * worth reporting (casters ignore quality-0 positions anyway).
 */
export function buildGgaSentence(gps: GpsData, now: Date = new Date()): string | null {
  const quality = fixQuality(gps.fixType);
  if (quality === 0) return null;
  if (!Number.isFinite(gps.lat) || !Number.isFinite(gps.lon)) return null;
  if (gps.lat === 0 && gps.lon === 0) return null;

  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  const ss = String(now.getUTCSeconds()).padStart(2, '0');
  const cc = String(Math.floor(now.getUTCMilliseconds() / 10)).padStart(2, '0');

  const lat = toNmeaCoord(gps.lat, 2);
  const latHemi = gps.lat >= 0 ? 'N' : 'S';
  const lon = toNmeaCoord(gps.lon, 3);
  const lonHemi = gps.lon >= 0 ? 'E' : 'W';

  const sats = String(Math.min(Math.max(gps.satellites, 0), 99)).padStart(2, '0');
  const hdop = Number.isFinite(gps.hdop) && gps.hdop > 0 ? gps.hdop.toFixed(1) : '1.0';
  const alt = gps.alt.toFixed(1); // GPS_RAW_INT alt is MSL, which is what GGA wants

  const body =
    `GPGGA,${hh}${mm}${ss}.${cc},${lat},${latHemi},${lon},${lonHemi},` +
    `${quality},${sats},${hdop},${alt},M,0.0,M,,`;

  return `$${body}*${nmeaChecksum(body)}\r\n`;
}
