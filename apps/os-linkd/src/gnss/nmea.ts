import { nmeaChecksumOk } from './sniff.js';

export interface GnssFix {
  /** GGA fix quality: 0 none, 1 GPS, 2 DGPS/SBAS, 4 RTK fixed, 5 RTK float, 6 dead reckoning. */
  quality: number;
  satellitesUsed: number;
  satellitesInView: number;
  hdop: number | null;
  lat: number | null;
  lon: number | null;
  altMsl: number | null;
  valid: boolean;
  updatedAt: number;
}

export const EMPTY_FIX: GnssFix = {
  quality: 0, satellitesUsed: 0, satellitesInView: 0, hdop: null, lat: null, lon: null, altMsl: null, valid: false, updatedAt: 0,
};

function coord(value: string, hemi: string): number | null {
  if (!value) return null;
  const dot = value.indexOf('.');
  if (dot < 3) return null;
  const deg = Number(value.slice(0, dot - 2));
  const min = Number(value.slice(dot - 2));
  const v = deg + min / 60;
  return hemi === 'S' || hemi === 'W' ? -v : v;
}

/** Incremental NMEA reader keeping the latest position fix (GGA, RMC, GSV). */
export class NmeaFixReader {
  fix: GnssFix = { ...EMPTY_FIX };
  private text = '';
  private gsv = new Map<string, number>();

  push(chunk: Uint8Array, now = Date.now()): void {
    this.text += Buffer.from(chunk).toString('latin1');
    let nl: number;
    while ((nl = this.text.indexOf('\n')) >= 0) {
      const line = this.text.slice(0, nl).trim();
      this.text = this.text.slice(nl + 1);
      const start = line.lastIndexOf('$');
      if (start >= 0) this.sentence(line.slice(start), now);
    }
    if (this.text.length > 2048) this.text = this.text.slice(-512);
  }

  private sentence(s: string, now: number): void {
    if (!nmeaChecksumOk(s)) return;
    const f = s.slice(1, s.lastIndexOf('*')).split(',');
    const type = f[0]!.slice(2);
    if (type === 'GGA' && f.length > 9) {
      this.fix = {
        ...this.fix,
        quality: Number(f[6]) || 0,
        satellitesUsed: Number(f[7]) || 0,
        hdop: f[8] ? Number(f[8]) : null,
        lat: coord(f[2]!, f[3]!),
        lon: coord(f[4]!, f[5]!),
        altMsl: f[9] ? Number(f[9]) : null,
        updatedAt: now,
      };
    } else if (type === 'RMC' && f.length > 2) {
      this.fix = { ...this.fix, valid: f[2] === 'A', updatedAt: now };
    } else if (type === 'GSV' && f.length > 3) {
      this.gsv.set(f[0]!.slice(0, 2), Number(f[3]) || 0);
      this.fix = { ...this.fix, satellitesInView: [...this.gsv.values()].reduce((a, b) => a + b, 0) };
    }
  }
}
