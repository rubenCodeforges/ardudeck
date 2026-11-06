/** LAS 1.0 to 1.4 header, VLR and GeoTIFF key parsing. Point records are read elsewhere, streamed. */

export interface LasVlr {
  userId: string;
  recordId: number;
  data: Uint8Array;
}

export interface LasHeader {
  versionMajor: number;
  versionMinor: number;
  headerSize: number;
  offsetToPoints: number;
  vlrCount: number;
  /** Point data record format with the LAZ compression bits cleared. */
  pointFormat: number;
  compressed: boolean;
  pointLength: number;
  pointCount: number;
  scale: [number, number, number];
  offset: [number, number, number];
  min: [number, number, number];
  max: [number, number, number];
  globalEncoding: number;
  evlrStart: number;
  evlrCount: number;
}

export const LAS_MIN_HEADER = 227;
export const LAS14_HEADER = 375;

const MIN_RECORD: Record<number, number> = { 0: 20, 1: 28, 2: 26, 3: 34, 4: 57, 5: 63, 6: 30, 7: 36, 8: 38, 9: 59, 10: 67 };
const RGB_OFFSET: Record<number, number> = { 2: 20, 3: 28, 5: 28, 7: 30, 8: 30, 10: 30 };

/** Byte offset of red in a record, or null when the format has no colour. */
export function rgbOffset(format: number): number | null {
  return RGB_OFFSET[format] ?? null;
}

function cstr(b: Uint8Array): string {
  const end = b.indexOf(0);
  return new TextDecoder('latin1').decode(end >= 0 ? b.subarray(0, end) : b).trim();
}

function u64(dv: DataView, at: number): number {
  return Number(dv.getBigUint64(at, true));
}

export class LasFormatError extends Error {
  constructor(readonly code: 'notLas' | 'unsupportedVersion' | 'unsupportedFormat' | 'truncated') {
    super(code);
  }
}

export function parseLasHeader(bytes: Uint8Array): LasHeader {
  if (bytes.length < LAS_MIN_HEADER || cstr(bytes.subarray(0, 4)) !== 'LASF') throw new LasFormatError('notLas');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const versionMajor = dv.getUint8(24);
  const versionMinor = dv.getUint8(25);
  if (versionMajor !== 1 || versionMinor > 4) throw new LasFormatError('unsupportedVersion');
  const headerSize = dv.getUint16(94, true);
  const rawFormat = dv.getUint8(104);
  const pointFormat = rawFormat & 0x3f;
  const pointLength = dv.getUint16(105, true);
  if (!(pointFormat in MIN_RECORD) || pointLength < MIN_RECORD[pointFormat]!) throw new LasFormatError('unsupportedFormat');
  const f64 = (at: number) => dv.getFloat64(at, true);
  let pointCount = dv.getUint32(107, true);
  let evlrStart = 0;
  let evlrCount = 0;
  if (versionMinor >= 4 && headerSize >= LAS14_HEADER) {
    if (bytes.length < LAS14_HEADER) throw new LasFormatError('truncated');
    evlrStart = u64(dv, 235);
    evlrCount = dv.getUint32(243, true);
    const count64 = u64(dv, 247);
    if (count64 > 0) pointCount = count64;
  }
  return {
    versionMajor,
    versionMinor,
    headerSize,
    offsetToPoints: dv.getUint32(96, true),
    vlrCount: dv.getUint32(100, true),
    pointFormat,
    compressed: (rawFormat & 0x80) !== 0,
    pointLength,
    pointCount,
    scale: [f64(131), f64(139), f64(147)],
    offset: [f64(155), f64(163), f64(171)],
    max: [f64(179), f64(195), f64(211)],
    min: [f64(187), f64(203), f64(219)],
    globalEncoding: dv.getUint16(6, true),
    evlrStart,
    evlrCount,
  };
}

/** VLRs between the header and the point data. `bytes` holds the file from 0 up to at least offsetToPoints. */
export function parseVlrs(bytes: Uint8Array, h: LasHeader): LasVlr[] {
  const out: LasVlr[] = [];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = h.headerSize;
  const end = Math.min(h.offsetToPoints, bytes.length);
  for (let i = 0; i < h.vlrCount && p + 54 <= end; i++) {
    const len = dv.getUint16(p + 20, true);
    if (p + 54 + len > end) break;
    out.push({ userId: cstr(bytes.subarray(p + 2, p + 18)), recordId: dv.getUint16(p + 18, true), data: bytes.slice(p + 54, p + 54 + len) });
    p += 54 + len;
  }
  return out;
}

/** One extended VLR from its 60-byte header; the payload is read separately. */
export function parseEvlrHeader(bytes: Uint8Array): { userId: string; recordId: number; length: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { userId: cstr(bytes.subarray(2, 18)), recordId: dv.getUint16(18, true), length: u64(dv, 20) };
}

export interface LasGeoKeys {
  projected?: number;
  geographic?: number;
  vertical?: number;
  /** EPSG unit code (9001 metre, 9002 foot, 9003 US survey foot). */
  verticalUnits?: number;
  linearUnits?: number;
}

/** GeoKeyDirectoryTag (LASF_Projection 34735): the inline SHORT keys. */
export function parseGeoKeys(data: Uint8Array): LasGeoKeys | null {
  if (data.length < 8) return null;
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = dv.getUint16(6, true);
  const keys: LasGeoKeys = {};
  for (let i = 0; i < n; i++) {
    const at = 8 + i * 8;
    if (at + 8 > data.length) break;
    const id = dv.getUint16(at, true);
    const loc = dv.getUint16(at + 2, true);
    const value = dv.getUint16(at + 6, true);
    if (loc !== 0) continue;
    if (id === 3072) keys.projected = value;
    else if (id === 2048) keys.geographic = value;
    else if (id === 4096) keys.vertical = value;
    else if (id === 4099) keys.verticalUnits = value;
    else if (id === 3076) keys.linearUnits = value;
  }
  return keys;
}

const USER_DEFINED = 32767;

export interface LasCrs {
  epsg: number | null;
  /** The horizontal part of the WKT VLR, used only without GeoKeys. */
  wkt: string | null;
  /** The EPSG code the WKT's horizontal CRS names, when the WKT itself does not parse. */
  wktEpsg: number | null;
  /** Heights are above the ellipsoid, not MSL. */
  ellipsoidal: boolean;
  /** Metres per vertical unit. */
  zToMetres: number;
}

const UNIT_METRES: Record<number, number> = { 9001: 1, 9002: 0.3048, 9003: 1200 / 3937 };
const GEOGRAPHIC_3D = new Set([4979, 4937, 7912]);

function isEllipsoidalVertical(code: number | undefined): boolean {
  // GeoTIFF VertCS_*_ellipsoid codes are 5001..5035; geographic 3D codes also mean ellipsoid heights
  return code != null && ((code >= 5001 && code <= 5035) || GEOGRAPHIC_3D.has(code));
}

export function lasCrs(vlrs: LasVlr[]): LasCrs {
  const proj = (v: LasVlr) => v.userId === 'LASF_Projection';
  const gk = vlrs.find((v) => proj(v) && v.recordId === 34735);
  const keys = gk ? parseGeoKeys(gk.data) : null;
  const wktVlr = vlrs.find((v) => proj(v) && v.recordId === 2112);
  const wkt = wktVlr ? new TextDecoder().decode(wktVlr.data).replace(/\0+$/, '').trim() || null : null;
  let epsg: number | null = null;
  if (keys?.projected && keys.projected !== USER_DEFINED) epsg = keys.projected;
  else if (keys?.geographic && keys.geographic !== USER_DEFINED) epsg = keys.geographic;
  const units = keys?.verticalUnits ?? keys?.linearUnits;
  const parts = epsg == null && wkt ? wktParts(wkt) : null;
  return {
    epsg,
    wkt: parts?.horizontal ?? null,
    wktEpsg: parts?.epsg ?? null,
    ellipsoidal: (epsg != null && GEOGRAPHIC_3D.has(epsg)) || isEllipsoidalVertical(keys?.vertical),
    zToMetres: (units != null ? UNIT_METRES[units] : undefined) ?? parts?.zToMetres ?? 1,
  };
}

function bracketed(s: string, from: number): string {
  let depth = 0;
  let quoted = false;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '[' || c === '(')) depth++;
    else if (!quoted && (c === ']' || c === ')') && --depth === 0) return s.slice(from, i + 1);
  }
  return s.slice(from);
}

const UNIT_RE = /(?:LENGTH)?UNIT\["[^"]*",\s*([\d.eE+-]+)/g;

/** The horizontal CRS of a (possibly compound) WKT, its EPSG code and the vertical unit in metres. */
export function wktParts(wkt: string): { horizontal: string; epsg: number | null; zToMetres: number | null } {
  const m = /\b(PROJCS|PROJCRS|GEOGCS|GEOGCRS|GEODCRS)\[/.exec(wkt);
  const horizontal = m ? bracketed(wkt, m.index) : wkt;
  const ids = [...horizontal.matchAll(/(?:AUTHORITY|ID)\["EPSG",\s*"?(\d+)"?\]/g)];
  const last = ids[ids.length - 1];
  const v = /\b(VERT_CS|VERTCRS)\[/.exec(wkt);
  let zToMetres: number | null = null;
  if (v) {
    const u = [...bracketed(wkt, v.index).matchAll(UNIT_RE)][0];
    if (u) zToMetres = Number(u[1]);
  } else if (m && /^PROJ/.test(m[1]!)) {
    const units = [...horizontal.matchAll(UNIT_RE)];
    const u = units[units.length - 1];
    if (u) zToMetres = Number(u[1]);
  }
  return { horizontal, epsg: last ? Number(last[1]) : null, zToMetres: zToMetres && Number.isFinite(zToMetres) && zToMetres > 0 ? zToMetres : null };
}

export interface LaszipVlr {
  compressor: number;
  chunkSize: number;
}

export function parseLaszipVlr(vlrs: LasVlr[]): LaszipVlr | null {
  const v = vlrs.find((r) => r.userId === 'laszip encoded' && r.recordId === 22204);
  if (!v || v.data.length < 16) return null;
  const dv = new DataView(v.data.buffer, v.data.byteOffset, v.data.byteLength);
  return { compressor: dv.getUint16(0, true), chunkSize: dv.getUint32(12, true) };
}
