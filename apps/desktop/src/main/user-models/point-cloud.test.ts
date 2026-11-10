import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { createLazPerf } from 'laz-perf';

vi.mock('electron', () => ({
  app: { getAppPath: () => path.resolve(__dirname, '../../..'), getPath: () => os.tmpdir() },
}));

import { lasCrs, parseGeoKeys, parseLasHeader, parseVlrs, rgbOffset, wktParts } from './las';
import { openLasSource } from './las-source';
import { colorsTo8Bit, decimationStride, pointsFootprint, PointCloudError, readLasPointCloud } from './point-cloud';
import { encodePly, parsePlyHeader } from './ply';
import { UserModelLibrary } from './user-model-library';
import { sceneMeshByKey } from '../terrain/scene-mesh-registry';
import { USER_MODELS_SLUG, type UserModel } from '../../shared/scene-models/user-models';

interface Pt { x: number; y: number; z: number; rgb?: [number, number, number] }

interface LasSpec {
  minor: 2 | 4;
  format: number;
  pointLength: number;
  points: Pt[];
  scale?: [number, number, number];
  offset?: [number, number, number];
  /** Key entries after the directory header, 4 shorts each. */
  geoKeys?: number[];
  wkt?: string;
  /** LAS 1.4 only: write 0 in the legacy count so the 64-bit count must be used. */
  legacyZero?: boolean;
}

function vlr(user: string, recordId: number, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(54 + data.length);
  const dv = new DataView(out.buffer);
  out.set(new TextEncoder().encode(user), 2);
  dv.setUint16(18, recordId, true);
  dv.setUint16(20, data.length, true);
  out.set(new TextEncoder().encode('ArduDeck Locus'), 22);
  out.set(data, 54);
  return out;
}

function geoKeyVlr(keys: number[]): Uint8Array {
  const shorts = [1, 1, 0, keys.length / 4, ...keys];
  const data = new Uint8Array(shorts.length * 2);
  const dv = new DataView(data.buffer);
  shorts.forEach((s, i) => dv.setUint16(i * 2, s, true));
  return vlr('LASF_Projection', 34735, data);
}

/** The layout ArduDeck Locus writes (las_writer.cpp) for minor 2, format 3; LAS 1.4 adds the 64-bit count. */
function buildLas(spec: LasSpec): Uint8Array {
  const headerSize = spec.minor === 4 ? 375 : 227;
  const scale = spec.scale ?? [0.001, 0.001, 0.001];
  const offset = spec.offset ?? [0, 0, 0];
  const vlrs: Uint8Array[] = [];
  if (spec.geoKeys) vlrs.push(geoKeyVlr(spec.geoKeys));
  if (spec.wkt) vlrs.push(vlr('LASF_Projection', 2112, new TextEncoder().encode(`${spec.wkt}\0`)));
  const vlrBytes = vlrs.reduce((s, v) => s + v.length, 0);
  const offsetToPoints = headerSize + vlrBytes;
  const out = new Uint8Array(offsetToPoints + spec.points.length * spec.pointLength);
  const dv = new DataView(out.buffer);
  out.set(new TextEncoder().encode('LASF'), 0);
  dv.setUint16(6, 1, true);
  dv.setUint8(24, 1);
  dv.setUint8(25, spec.minor);
  dv.setUint16(94, headerSize, true);
  dv.setUint32(96, offsetToPoints, true);
  dv.setUint32(100, vlrs.length, true);
  dv.setUint8(104, spec.format);
  dv.setUint16(105, spec.pointLength, true);
  dv.setUint32(107, spec.legacyZero ? 0 : spec.points.length, true);
  for (let i = 0; i < 3; i++) {
    dv.setFloat64(131 + i * 8, scale[i]!, true);
    dv.setFloat64(155 + i * 8, offset[i]!, true);
  }
  if (spec.minor === 4) dv.setBigUint64(247, BigInt(spec.points.length), true);
  let p = headerSize;
  for (const v of vlrs) {
    out.set(v, p);
    p += v.length;
  }
  const rgbAt = rgbOffset(spec.format);
  spec.points.forEach((pt, i) => {
    const at = offsetToPoints + i * spec.pointLength;
    dv.setInt32(at, Math.round((pt.x - offset[0]) / scale[0]), true);
    dv.setInt32(at + 4, Math.round((pt.y - offset[1]) / scale[1]), true);
    dv.setInt32(at + 8, Math.round((pt.z - offset[2]) / scale[2]), true);
    if (rgbAt != null && pt.rgb) pt.rgb.forEach((c, k) => dv.setUint16(at + rgbAt + k * 2, c, true));
  });
  return out;
}

const LOCUS_KEYS = (epsg: number) => [1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, epsg];
// cs2cs EPSG:32633 EPSG:4326: 501234.567 5200000.125 -> 46.9535291776 15.0162247756
const UTM33 = { x: 501234.567, y: 5200000.125, lat: 46.9535291776, lng: 15.0162247756 };
// cs2cs EPSG:25832 EPSG:4326: 691000.5 5335000.25 -> 48.1395604468 11.5675080556
const ETRS32 = { x: 691000.5, y: 5335000.25, lat: 48.1395604468, lng: 11.5675080556 };

const noCrs = async () => null;
let root: string;

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'ardudeck-pc-'));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(name: string, bytes: Uint8Array): string {
  const p = path.join(root, name);
  writeFileSync(p, bytes);
  return p;
}

describe('LAS header and GeoKeys', () => {
  it('reads a Locus-layout LAS 1.2 point format 3 file with EPSG in the GeoKeys', () => {
    const bytes = buildLas({
      minor: 2, format: 3, pointLength: 34, offset: [500000, 5200000, 0], geoKeys: LOCUS_KEYS(32633),
      points: [{ x: UTM33.x, y: UTM33.y, z: 412.345, rgb: [65535, 0, 32768] }],
    });
    const h = parseLasHeader(bytes);
    expect(h).toMatchObject({ versionMajor: 1, versionMinor: 2, headerSize: 227, pointFormat: 3, pointLength: 34, pointCount: 1, compressed: false });
    expect(h.scale).toEqual([0.001, 0.001, 0.001]);
    expect(h.offset).toEqual([500000, 5200000, 0]);
    expect(h.offsetToPoints).toBe(227 + 54 + 8 + 12 * 2);
    const vlrs = parseVlrs(bytes, h);
    expect(vlrs).toHaveLength(1);
    expect(parseGeoKeys(vlrs[0]!.data)).toEqual({ projected: 32633 });
    expect(lasCrs(vlrs)).toEqual({ epsg: 32633, wkt: null, wktEpsg: null, ellipsoidal: false, zToMetres: 1 });
  });

  it('reads the 64-bit point count of LAS 1.4, a geographic key and an ellipsoidal vertical key', () => {
    const bytes = buildLas({
      minor: 4, format: 6, pointLength: 30, legacyZero: true,
      geoKeys: [1024, 0, 1, 2, 2048, 0, 1, 4326, 4096, 0, 1, 5030],
      points: [{ x: 8, y: 47, z: 600 }, { x: 8.001, y: 47.001, z: 610 }, { x: 8.002, y: 47, z: 605 }],
      scale: [1e-7, 1e-7, 0.01],
    });
    const h = parseLasHeader(bytes);
    expect(h.headerSize).toBe(375);
    expect(new DataView(bytes.buffer).getUint32(107, true)).toBe(0);
    expect(h.pointCount).toBe(3);
    const crs = lasCrs(parseVlrs(bytes, h));
    expect(crs.epsg).toBe(4326);
    expect(crs.ellipsoidal).toBe(true);
  });

  it('prefers a projected key, reads feet and falls back to WKT only without GeoKeys', () => {
    const keys = parseGeoKeys(geoKeyVlr([2048, 0, 1, 4269, 3072, 0, 1, 2227, 4099, 0, 1, 9003]).subarray(54))!;
    expect(keys).toEqual({ geographic: 4269, projected: 2227, verticalUnits: 9003 });
    const ft = lasCrs([{ userId: 'LASF_Projection', recordId: 34735, data: geoKeyVlr([3072, 0, 1, 2227, 4099, 0, 1, 9003]).subarray(54) }]);
    expect(ft.epsg).toBe(2227);
    expect(ft.zToMetres).toBeCloseTo(0.3048006096, 9);
    const wkt = 'COMPD_CS["x + NAVD88 (ftUS)",PROJCS["NAD83(2011) / California zone 3 (ftUS)",GEOGCS["NAD83(2011)",DATUM["NAD83",SPHEROID["GRS 1980",6378137,298.257222101]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Lambert_Conformal_Conic_2SP"],UNIT["US survey foot",0.3048006096012192,AUTHORITY["EPSG","9003"]],AUTHORITY["EPSG","6420"]],VERT_CS["NAVD88 height (ftUS)",VERT_DATUM["North American Vertical Datum 1988",2005],UNIT["US survey foot",0.3048006096012192],AUTHORITY["EPSG","6360"]]]';
    const parts = wktParts(wkt);
    expect(parts.horizontal.startsWith('PROJCS[')).toBe(true);
    expect(parts.horizontal.endsWith('AUTHORITY["EPSG","6420"]]')).toBe(true);
    expect(parts.epsg).toBe(6420);
    expect(parts.zToMetres).toBeCloseTo(0.3048006096, 9);
    const fromWkt = lasCrs([{ userId: 'LASF_Projection', recordId: 2112, data: new TextEncoder().encode(wkt) }]);
    expect(fromWkt).toMatchObject({ epsg: null, wktEpsg: 6420 });
  });

  it('rejects files that are not LAS and point formats beyond 10', () => {
    expect(() => parseLasHeader(new Uint8Array(300))).toThrow();
    const bad = buildLas({ minor: 2, format: 3, pointLength: 34, points: [] });
    bad[104] = 11;
    expect(() => parseLasHeader(bad)).toThrow();
    const short = buildLas({ minor: 2, format: 3, pointLength: 34, points: [] });
    new DataView(short.buffer).setUint16(105, 20, true);
    expect(() => parseLasHeader(short)).toThrow();
  });
});

describe('reprojection', () => {
  it('places a Locus UTM 33N point where PROJ puts it, with millimetre-scale coordinates', async () => {
    const file = write('utm.las', buildLas({
      minor: 2, format: 3, pointLength: 34, offset: [500000, 5200000, 0], geoKeys: LOCUS_KEYS(32633),
      points: [{ x: UTM33.x, y: UTM33.y, z: 412.345, rgb: [65535, 0, 32768] }],
    }));
    const pc = await readLasPointCloud(file, noCrs);
    expect(pc.count).toBe(1);
    expect(pc.origin.lat).toBeCloseTo(UTM33.lat, 8);
    expect(pc.origin.lng).toBeCloseTo(UTM33.lng, 8);
    expect(pc.origin.hEll).toBeCloseTo(412.345, 6);
    expect(Array.from(pc.positions).every((v) => Math.abs(v) < 1e-6)).toBe(true);
    expect(Array.from(pc.colors!)).toEqual([255, 0, 128]);
  });

  it('reprojects ETRS89 UTM 32N and lays points out east, up and south about the bbox centre', async () => {
    const file = write('etrs.las', buildLas({
      minor: 2, format: 3, pointLength: 34, offset: [690000, 5330000, 0], geoKeys: LOCUS_KEYS(25832),
      points: [
        { x: ETRS32.x - 50, y: ETRS32.y - 20, z: 500 },
        { x: ETRS32.x + 50, y: ETRS32.y + 20, z: 520 },
      ],
    }));
    const pc = await readLasPointCloud(file, noCrs);
    expect(pc.origin.lat).toBeCloseTo(ETRS32.lat, 6);
    expect(pc.origin.lng).toBeCloseTo(ETRS32.lng, 6);
    expect(pc.origin.hEll).toBeCloseTo(510, 6);
    const [x0, y0, z0, x1, y1, z1] = Array.from(pc.positions) as number[];
    // grid north is about 2 degrees off true north here, so east and south mix a little
    expect(x1! - x0!).toBeGreaterThan(95);
    expect(x1! - x0!).toBeLessThan(105);
    expect(z1! - z0!).toBeLessThan(-35);
    expect(Math.hypot(x1! - x0!, z1! - z0!)).toBeCloseTo(Math.hypot(100, 40), 0);
    expect(y1! - y0!).toBeCloseTo(20, 1);
    expect(pc.colors).toEqual(new Uint8Array(6));
  });

  it('fails with a pilot-facing error without a CRS or with an unknown one', async () => {
    const plain = write('plain.las', buildLas({ minor: 2, format: 0, pointLength: 20, points: [{ x: 1, y: 2, z: 3 }] }));
    await expect(readLasPointCloud(plain, noCrs)).rejects.toBeInstanceOf(PointCloudError);
    const unknown = write('unknown.las', buildLas({ minor: 2, format: 0, pointLength: 20, geoKeys: LOCUS_KEYS(65000), points: [{ x: 1, y: 2, z: 3 }] }));
    const resolver = vi.fn(async () => null);
    await expect(readLasPointCloud(unknown, resolver)).rejects.toThrow(/EPSG:65000/);
    expect(resolver).toHaveBeenCalledWith(65000);
  });
});

describe('decimation', () => {
  it('keeps every stride-th point up to the budget', async () => {
    expect(decimationStride(10, 3)).toBe(4);
    expect(decimationStride(3_000_000)).toBe(1);
    expect(decimationStride(3_000_001)).toBe(2);
    expect(decimationStride(12_904_407)).toBe(5);
    const points = Array.from({ length: 10 }, (_, i) => ({ x: UTM33.x + i, y: UTM33.y, z: i }));
    const file = write('ten.las', buildLas({ minor: 2, format: 3, pointLength: 34, offset: [500000, 5200000, 0], geoKeys: LOCUS_KEYS(32633), points }));
    const src = await openLasSource(file);
    const zs: number[] = [];
    for await (const b of src.batches(4)) {
      const dv = new DataView(b.records.buffer);
      for (let i = 0; i < b.count; i++) zs.push(dv.getInt32(i * 34 + 8, true) / 1000);
    }
    await src.close();
    expect(zs).toEqual([0, 4, 8]);
    const pc = await readLasPointCloud(file, noCrs, 3);
    expect(pc.count).toBe(3);
    expect(pc.sourceCount).toBe(10);
  });

  it('scales 16-bit colours to 8 bits and passes 8-bit values stored in 16 bits through', () => {
    expect(Array.from(colorsTo8Bit(new Uint16Array([65535, 256, 0]), 1))).toEqual([255, 1, 0]);
    expect(Array.from(colorsTo8Bit(new Uint16Array([255, 128, 7]), 1))).toEqual([255, 128, 7]);
  });

  it('outlines the points with a convex hull', () => {
    const lng = new Float64Array([0, 1, 1, 0, 0.5]);
    const lat = new Float64Array([0, 0, 1, 1, 0.5]);
    const hull = pointsFootprint(lng, lat, 5, 8);
    expect(hull).toHaveLength(4);
    expect(hull.some((p) => p.lat === 0.5)).toBe(false);
  });
});

describe('LAZ', () => {
  const fixture = path.join(__dirname, '__fixtures__', 'simple.laz');

  it('streams a LAZ chunk by chunk with the same points as a whole-file decode', async () => {
    const src = await openLasSource(fixture);
    expect(src.header).toMatchObject({ compressed: true, pointFormat: 3, pointLength: 34, pointCount: 1065 });
    const records: Uint8Array[] = [];
    let n = 0;
    for await (const b of src.batches(1)) {
      records.push(b.records);
      n += b.count;
    }
    await src.close();
    expect(n).toBe(1065);
    const all = new Uint8Array(records.reduce((s, r) => s + r.length, 0));
    let at = 0;
    for (const r of records) {
      all.set(r, at);
      at += r.length;
    }
    const first = new DataView(all.buffer, 0, 34);
    expect([first.getInt32(0, true), first.getInt32(4, true), first.getInt32(8, true)]).toEqual([63701224, 84902831, 43166]);

    const L = await createLazPerf();
    const buf = readFileSync(fixture);
    const data = L._malloc(buf.length);
    L.HEAPU8.set(buf, data);
    const zip = new L.LASZip();
    zip.open(data, buf.length);
    const pt = L._malloc(34);
    for (let i = 0; i < 1065; i++) {
      zip.getPoint(pt);
      expect(Buffer.from(L.HEAPU8.subarray(pt, pt + 34)).equals(Buffer.from(all.subarray(i * 34, i * 34 + 34)))).toBe(true);
    }
    zip.delete();
    L._free(pt);
    L._free(data);

    const thinned = await openLasSource(fixture);
    let kept = 0;
    for await (const b of thinned.batches(10)) kept += b.count;
    await thinned.close();
    expect(kept).toBe(107);
  });

  it('refuses a LAZ without a georeference', async () => {
    await expect(readLasPointCloud(fixture, noCrs)).rejects.toBeInstanceOf(PointCloudError);
  });
});

describe('PLY', () => {
  it('round-trips positions and colours through three PLYLoader', () => {
    const positions = new Float32Array([1.5, -2.25, 3, -100.125, 50.5, 0.001]);
    const colors = new Uint8Array([255, 0, 255, 0, 255, 0]);
    const bytes = encodePly(positions, colors, 2, { lat: 47.1, lng: 8.2, altMsl: 512.5 });
    const geo = new PLYLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    expect(Array.from(geo.getAttribute('position').array)).toEqual(Array.from(positions));
    expect(Array.from(geo.getAttribute('color').array)).toEqual([1, 0, 1, 0, 1, 0]);
    const info = parsePlyHeader(new TextDecoder().decode(bytes.subarray(0, 400)));
    expect(info).toEqual({ vertexCount: 2, hasColor: true, origin: { lat: 47.1, lng: 8.2, altMsl: 512.5 } });
    const plain = encodePly(positions, null, 2);
    expect(new PLYLoader().parse(plain.buffer as ArrayBuffer).hasAttribute('color')).toBe(false);
    expect(parsePlyHeader('ply\nformat binary_little_endian 1.0\nelement vertex 0\nend_header\n')).toBeNull();
    expect(parsePlyHeader('not a ply')).toBeNull();
  });
});

describe('library import', () => {
  let changes: UserModel[][];
  const makeLib = () => {
    changes = [];
    const lib = new UserModelLibrary({
      baseDir: path.join(root, 'user-models'),
      geoid: () => ({ undulation: () => 50 }),
      resolveCrs: noCrs,
      onChange: (m) => changes.push(m),
      watchFs: false,
    });
    lib.init();
    return lib;
  };

  it('imports a Locus LAS as an absolute point cloud with a hull footprint', async () => {
    const lib = makeLib();
    const points = [
      { x: UTM33.x, y: UTM33.y, z: 400, rgb: [65535, 65535, 0] as [number, number, number] },
      { x: UTM33.x + 30, y: UTM33.y, z: 402 },
      { x: UTM33.x + 30, y: UTM33.y + 40, z: 404 },
      { x: UTM33.x, y: UTM33.y + 40, z: 410 },
    ];
    const file = write('site.las', buildLas({ minor: 2, format: 3, pointLength: 34, offset: [500000, 5200000, 0], geoKeys: LOCUS_KEYS(32633), points }));
    const res = await lib.importFiles([file]);
    expect(res.failed).toEqual([]);
    const m = res.imported[0]!;
    expect(m).toMatchObject({ name: 'site', format: 'pointcloud', placedBy: 'data', pointCount: 4 });
    expect(m.sourcePointCount).toBeUndefined();
    expect(m.placement.altitudeMode).toBe('amsl');
    expect(m.placement.alt).toBeCloseTo(405, 6);
    expect(m.footprints?.[0]).toHaveLength(4);
    expect(path.basename(m.entryPath)).toBe('points.ply');
    const reg = sceneMeshByKey(`${USER_MODELS_SLUG}::${m.id}`);
    expect(reg?.pointCloud).toBe(m.entryPath);
    expect(reg?.glb).toBeUndefined();
    expect(reg?.url.endsWith('/points.ply')).toBe(true);
    const ply = parsePlyHeader(readFileSync(m.entryPath, 'latin1'));
    expect(ply?.vertexCount).toBe(4);
    expect(ply?.origin?.altMsl).toBeCloseTo(405, 6);
    lib.dispose();
  });

  it('takes the geoid off ellipsoidal heights', async () => {
    const lib = makeLib();
    const file = write('ell.las', buildLas({
      minor: 4, format: 7, pointLength: 36, legacyZero: true, scale: [1e-7, 1e-7, 0.001],
      geoKeys: [2048, 0, 1, 4326, 4096, 0, 1, 5030],
      points: [{ x: 8, y: 47, z: 600, rgb: [10, 20, 30] }, { x: 8.001, y: 47.001, z: 620, rgb: [40, 50, 60] }],
    }));
    const res = await lib.importFiles([file]);
    expect(res.failed).toEqual([]);
    expect(res.imported[0]!.placement.alt).toBeCloseTo(610 - 50, 6);
    lib.dispose();
  });

  it('places a PLY with no georeference at the drop point, and one ArduDeck wrote at its origin', async () => {
    const lib = makeLib();
    const loose = write('loose.ply', encodePly(new Float32Array([0, 0, 0, 1, 1, 1]), null, 2));
    const placed = write('placed.ply', encodePly(new Float32Array([0, 0, 0]), new Uint8Array([1, 2, 3]), 1, { lat: 46, lng: 7, altMsl: 800 }));
    const res = await lib.importFiles([loose, placed, write('bad.ply', new TextEncoder().encode('hello'))], { lat: 45, lng: 9 });
    expect(res.imported).toHaveLength(2);
    expect(res.failed).toHaveLength(1);
    const [a, b] = res.imported as [UserModel, UserModel];
    expect(a).toMatchObject({ format: 'pointcloud', placedBy: 'manual', pointCount: 2 });
    expect(a.placement).toMatchObject({ lat: 45, lng: 9, altitudeMode: 'clamp' });
    expect(res.needsPlacement).toEqual([a.id]);
    expect(b).toMatchObject({ placedBy: 'data', placement: { lat: 46, lng: 7, alt: 800, altitudeMode: 'amsl' } });
    expect(path.dirname(a.entryPath)).not.toBe(root);
    lib.dispose();
  });

  it('reports a LAS that cannot be placed', async () => {
    const lib = makeLib();
    const res = await lib.importFiles([write('nocrs.las', buildLas({ minor: 2, format: 1, pointLength: 28, points: [{ x: 1, y: 2, z: 3 }] }))]);
    expect(res.imported).toEqual([]);
    expect(res.failed[0]!.error).toMatch(/reference system/i);
    lib.dispose();
  });
});
