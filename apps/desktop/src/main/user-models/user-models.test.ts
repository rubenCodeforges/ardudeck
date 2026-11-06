import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';

vi.mock('electron', () => ({
  app: { getAppPath: () => path.resolve(__dirname, '../../..'), getPath: () => os.tmpdir() },
}));

vi.mock('../../shared/scene-models/parsers/index.js', () => ({
  readGltfGeoreference: (bytes: Uint8Array) => {
    const s = new TextDecoder().decode(bytes);
    return s.startsWith('GEO') ? { lat: 47, lng: 8, hEll: 550 } : null;
  },
  parseKmlModels: (kml: string) =>
    [...kml.matchAll(/<href>([^<]+)<\/href>/g)].map((m, i) => ({
      href: m[1]!,
      name: `M${i}`,
      placement: { lat: 10 + i, lng: 20, alt: 5, altitudeMode: 'agl', yawDeg: 90, pitchDeg: 0, rollDeg: 0, scale: 1 },
    })),
  parsePlacementTable: (text: string) =>
    (JSON.parse(text) as Array<{ file: string; lat: number; lng: number; altMsl?: number; yawDeg?: number }>).map((r) => ({
      file: r.file,
      placement: {
        lat: r.lat, lng: r.lng, alt: r.altMsl ?? 0, altitudeMode: r.altMsl === undefined ? 'clamp' : 'amsl',
        yawDeg: r.yawDeg ?? 0, pitchDeg: 0, rollDeg: 0, scale: 1,
      },
    })),
  cityJsonToGlb: async (json: { fail?: boolean }, resolveCrs: (c: number) => Promise<string | null>) => {
    await resolveCrs(7415);
    if (json.fail) throw new Error('EPSG:9999 is not a known reference system');
    return {
      glb: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
      origin: { lat: 52, lng: 4.3, hEll: 45 },
      ellipsoidal: true,
      footprints: [[{ lat: 52, lng: 4.3 }, { lat: 52.001, lng: 4.3 }, { lat: 52.001, lng: 4.301 }]],
      objectCount: 1,
    };
  },
}));

import { UserModelLibrary } from './user-model-library';
import { toRegistration } from './registration';
import { ellipsoidToMsl, loadGeoid } from './geoid-loader';
import { createCrsResolver } from './crs';
import { listSceneMeshes, sceneMeshByKey } from '../terrain/scene-mesh-registry';
import { USER_MODELS_SLUG, type UserModel } from '../../shared/scene-models/user-models';

const N = 50;
let root: string;
let lib: UserModelLibrary;
let changes: UserModel[][];

function makeLib(): UserModelLibrary {
  const l = new UserModelLibrary({
    baseDir: path.join(root, 'user-models'),
    geoid: () => ({ undulation: () => N }),
    resolveCrs: async () => '+proj=longlat',
    onChange: (m) => changes.push(m),
    watchFs: false,
  });
  l.init();
  return l;
}

function src(...p: string[]): string {
  return path.join(root, 'src', ...p);
}

function write(p: string, data: string | Uint8Array): string {
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, data);
  return p;
}

function userMeshes() {
  return listSceneMeshes().filter((e) => e.slug === USER_MODELS_SLUG);
}

beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), 'user-models-'));
  changes = [];
  lib = makeLib();
});

afterEach(() => {
  lib.dispose();
  for (const m of lib.list()) if (m.origin === 'library') lib.remove(m.id);
  for (const d of lib.listWatched()) lib.removeWatched(d);
  rmSync(root, { recursive: true, force: true });
});

describe('placement to registration', () => {
  const base: UserModel = {
    id: 'a', name: 'Tower', format: 'gltf', entryPath: '/m/a/tower.glb',
    placement: { lat: 1, lng: 2, alt: 30, altitudeMode: 'agl', yawDeg: 45, pitchDeg: 5, rollDeg: -3, scale: 2 },
    placedBy: 'manual', origin: 'library', visible: true, version: 4, importedAt: 0,
  };

  it('maps placement, footprints, scenes and version', () => {
    const fp = [[{ lat: 1, lng: 2 }]];
    expect(toRegistration({ ...base, footprints: fp, scenes: ['svt'] })).toEqual({
      id: 'a', name: 'Tower', glb: '/m/a/tower.glb', origin: { lat: 1, lng: 2, altMsl: 30 },
      yawDeg: 45, pitchDeg: 5, rollDeg: -3, scale: 2, altitudeMode: 'agl', footprints: fp, scenes: ['svt'], version: 4,
    });
  });

  it('uses tileset for a tileset and glb for everything else', () => {
    expect(toRegistration({ ...base, format: 'tileset', entryPath: '/t/tileset.json' })).toMatchObject({ tileset: '/t/tileset.json' });
    expect(toRegistration({ ...base, format: 'tileset', entryPath: '/t/tileset.json' }).glb).toBeUndefined();
    expect(toRegistration({ ...base, format: 'kmz', entryPath: '/k/house.dae' }).glb).toBe('/k/house.dae');
    expect(toRegistration({ ...base, format: 'cityjson', entryPath: '/c/model.glb' }).glb).toBe('/c/model.glb');
    expect(toRegistration({ ...base, footprints: [] }).footprints).toBeUndefined();
  });
});

describe('geoid', () => {
  it('loads EGM96 from resources and converts ellipsoid to MSL', () => {
    const g = loadGeoid();
    expect(g).not.toBeNull();
    expect(g!.undulation(0, 0)).toBeCloseTo(17.16, 0);
    expect(ellipsoidToMsl(g, 0, 0, 100)).toBeCloseTo(100 - g!.undulation(0, 0), 6);
    expect(loadGeoid()).toBe(g);
  });

  it('passes the height through without a grid', () => {
    expect(ellipsoidToMsl(null, 10, 10, 123)).toBe(123);
    expect(ellipsoidToMsl({ undulation: () => 40 }, 10, 10, 123)).toBe(83);
  });
});

describe('import routing', () => {
  it('places a georeferenced glb by its data, converted to MSL', async () => {
    const r = await lib.importFiles([write(src('geo.glb'), 'GEO-bytes')]);
    expect(r.failed).toEqual([]);
    expect(r.needsPlacement).toEqual([]);
    const m = r.imported[0]!;
    expect(m).toMatchObject({ name: 'geo', format: 'gltf', placedBy: 'data', origin: 'library', visible: true, version: 1 });
    expect(m.placement).toMatchObject({ lat: 47, lng: 8, alt: 550 - N, altitudeMode: 'amsl' });
    expect(m.entryPath).toBe(path.join(root, 'user-models', 'models', m.id, 'geo.glb'));
    expect(readFileSync(m.entryPath, 'utf-8')).toBe('GEO-bytes');
    expect(sceneMeshByKey(`user::${m.id}`)?.glb).toBe(m.entryPath);
    expect(changes.at(-1)).toHaveLength(1);
  });

  it('drops a glb without a georeference at dropAt, clamped, and flags it', async () => {
    const r = await lib.importFiles([write(src('plain.glb'), 'glTF')], { lat: 5, lng: 6 });
    const m = r.imported[0]!;
    expect(m.placement).toMatchObject({ lat: 5, lng: 6, altitudeMode: 'clamp' });
    expect(m.placedBy).toBe('manual');
    expect(r.needsPlacement).toEqual([m.id]);
  });

  it('copies a .gltf with the buffers and images it references, and nothing else', async () => {
    const gltf = { asset: { version: '2.0' }, buffers: [{ uri: 'scene.bin' }, { uri: 'data:application/octet-stream;base64,AA==' }], images: [{ uri: 'tex/wall%20a.png' }] };
    write(src('g', 'scene.bin'), 'bin');
    write(src('g', 'tex', 'wall a.png'), 'png');
    write(src('g', 'unrelated.txt'), 'x');
    const r = await lib.importFiles([write(src('g', 'scene.gltf'), JSON.stringify(gltf))]);
    const dir = path.dirname(r.imported[0]!.entryPath);
    expect(existsSync(path.join(dir, 'scene.bin'))).toBe(true);
    expect(existsSync(path.join(dir, 'tex', 'wall a.png'))).toBe(true);
    expect(existsSync(path.join(dir, 'unrelated.txt'))).toBe(false);
  });

  it('fails a .gltf with a missing buffer and leaves no folder behind', async () => {
    const r = await lib.importFiles([write(src('g', 'broken.gltf'), JSON.stringify({ buffers: [{ uri: 'gone.bin' }] }))]);
    expect(r.imported).toEqual([]);
    expect(r.failed[0]!.error).toContain('gone.bin');
    expect(readdirSync(path.join(root, 'user-models', 'models'))).toEqual([]);
  });

  it('extracts a KMZ and makes one model per local <Model>', async () => {
    const zip = new AdmZip();
    zip.addFile('doc.kml', Buffer.from('<kml><href>models/house.dae</href><href>models/barn.dae</href><href>https://x/y.dae</href></kml>'));
    zip.addFile('models/house.dae', Buffer.from('<COLLADA/>'));
    zip.addFile('models/barn.dae', Buffer.from('<COLLADA/>'));
    zip.addFile('models/tex.jpg', Buffer.from('jpg'));
    mkdirSync(src(), { recursive: true });
    zip.writeZip(src('site.kmz'));
    const r = await lib.importFiles([src('site.kmz')]);
    expect(r.imported.map((m) => m.name)).toEqual(['M0', 'M1']);
    expect(r.imported.every((m) => m.format === 'kmz' && m.placedBy === 'data')).toBe(true);
    expect(r.imported[0]!.placement).toMatchObject({ lat: 10, altitudeMode: 'agl', yawDeg: 90 });
    expect(r.failed).toHaveLength(1);
    const dir = path.dirname(path.dirname(r.imported[0]!.entryPath));
    expect(existsSync(path.join(dir, 'models', 'tex.jpg'))).toBe(true);
    expect(path.dirname(path.dirname(r.imported[1]!.entryPath))).toBe(dir);

    lib.remove(r.imported[0]!.id);
    expect(existsSync(dir)).toBe(true);
    lib.remove(r.imported[1]!.id);
    expect(existsSync(dir)).toBe(false);
  });

  it('copies a KML folder and resolves relative hrefs', async () => {
    write(src('k', 'house.dae'), '<COLLADA/>');
    const r = await lib.importFiles([write(src('k', 'site.kml'), '<kml><href>house.dae</href></kml>')]);
    expect(r.imported).toHaveLength(1);
    expect(path.basename(r.imported[0]!.entryPath)).toBe('house.dae');
    expect(existsSync(r.imported[0]!.entryPath)).toBe(true);
  });

  it('copies a tileset tree and places it at its centre in MSL', async () => {
    const ts = { asset: { version: '1.1' }, root: { boundingVolume: { region: [0, 0, 0.002, 0.002, 100, 200] } } };
    write(src('city', 'tiles', '0.b3dm'), 'b3dm');
    const r = await lib.importFiles([write(src('city', 'tileset.json'), JSON.stringify(ts))]);
    const m = r.imported[0]!;
    expect(m).toMatchObject({ name: 'city', format: 'tileset', placedBy: 'data' });
    expect(m.placement.alt).toBeCloseTo(150 - N, 6);
    expect(existsSync(path.join(path.dirname(m.entryPath), 'tiles', '0.b3dm'))).toBe(true);
    expect(sceneMeshByKey(`user::${m.id}`)?.tileset).toBe(m.entryPath);
  });

  it('converts CityJSON to model.glb with footprints and MSL height', async () => {
    const r = await lib.importFiles([write(src('delft.city.json'), JSON.stringify({ type: 'CityJSON' }))]);
    const m = r.imported[0]!;
    expect(m).toMatchObject({ name: 'delft', format: 'cityjson' });
    expect(path.basename(m.entryPath)).toBe('model.glb');
    expect(m.placement.alt).toBe(45 - N);
    expect(m.footprints).toHaveLength(1);
    expect(sceneMeshByKey(`user::${m.id}`)?.footprints).toHaveLength(1);
  });

  it('passes a CityJSON conversion error through and reports unsupported files', async () => {
    const r = await lib.importFiles([
      write(src('bad.city.json'), JSON.stringify({ type: 'CityJSON', fail: true })),
      write(src('notes.txt'), 'x'),
      write(src('other.json'), '{"hello":1}'),
      src('missing.glb'),
    ]);
    expect(r.imported).toEqual([]);
    expect(r.failed.map((f) => path.basename(f.file))).toEqual(['bad.city.json', 'notes.txt', 'other.json', 'missing.glb']);
    expect(r.failed[0]!.error).toContain('EPSG:9999');
    expect(r.failed.every((f) => f.error.length > 0)).toBe(true);
  });

  it('imports the models inside a zip', async () => {
    const zip = new AdmZip();
    zip.addFile('pack/a.glb', Buffer.from('GEO'));
    zip.addFile('pack/readme.txt', Buffer.from('x'));
    mkdirSync(src(), { recursive: true });
    zip.writeZip(src('pack.zip'));
    const r = await lib.importFiles([src('pack.zip')]);
    expect(r.imported.map((m) => m.name)).toEqual(['a']);
    expect(existsSync(r.imported[0]!.entryPath)).toBe(true);
    expect(existsSync(path.join(root, 'user-models', 'staging'))).toBe(true);
    expect(readdirSync(path.join(root, 'user-models', 'staging'))).toEqual([]);
  });

  it('persists and re-registers on restart', async () => {
    const r = await lib.importFiles([write(src('geo.glb'), 'GEO')]);
    const id = r.imported[0]!.id;
    lib.update(id, { visible: false });
    lib.dispose();
    const again = makeLib();
    expect(again.get(id)?.visible).toBe(false);
    expect(sceneMeshByKey(`user::${id}`)).toBeUndefined();
    again.update(id, { visible: true });
    expect(sceneMeshByKey(`user::${id}`)).toBeDefined();
    lib = again;
  });
});

describe('update and remove', () => {
  it('bumps the version only on a placement change and re-registers', async () => {
    const { imported } = await lib.importFiles([write(src('geo.glb'), 'GEO')]);
    const id = imported[0]!.id;
    const moved = lib.update(id, { placement: { ...imported[0]!.placement, yawDeg: 30 } })!;
    expect(moved.version).toBe(2);
    expect(moved.placedBy).toBe('manual');
    expect(sceneMeshByKey(`user::${id}`)).toMatchObject({ yawDeg: 30, version: 2 });
    expect(lib.update(id, { name: 'Mast', scenes: ['svt', 'sim'] })!.version).toBe(2);
    expect(sceneMeshByKey(`user::${id}`)).toMatchObject({ name: 'Mast', scenes: ['svt', 'sim'] });
    expect(lib.update(id, { placement: { ...moved.placement, lat: 200 } })).toBeNull();
    lib.update(id, { visible: false });
    expect(sceneMeshByKey(`user::${id}`)).toBeUndefined();
    expect(lib.remove(id)).toBe(true);
    expect(existsSync(path.dirname(moved.entryPath))).toBe(false);
    expect(lib.remove(id)).toBe(false);
  });
});

describe('watched folders', () => {
  it('registers rows from the table, reloads on change, and unregisters on remove', () => {
    const dir = path.join(root, 'watch');
    write(path.join(dir, 'a.glb'), 'A');
    write(path.join(dir, 'b.glb'), 'B');
    write(path.join(dir, 'models.json'), JSON.stringify([
      { file: 'a.glb', lat: 1, lng: 2, altMsl: 10 },
      { file: 'b.glb', lat: 3, lng: 4 },
      { file: 'missing.glb', lat: 3, lng: 4 },
      { file: '../escape.glb', lat: 3, lng: 4 },
    ]));
    expect(lib.addWatched(dir)).toEqual({ dir });
    expect(lib.listWatched()).toEqual([dir]);
    const models = lib.list();
    expect(models).toHaveLength(2);
    const a = models.find((m) => m.name === 'a')!;
    expect(a).toMatchObject({ origin: 'watch', watchDir: dir, placedBy: 'data', entryPath: path.join(dir, 'a.glb') });
    expect(sceneMeshByKey(`user::${a.id}`)?.glb).toBe(path.join(dir, 'a.glb'));
    expect(existsSync(path.join(root, 'user-models', 'models', a.id))).toBe(false);

    write(path.join(dir, 'models.json'), JSON.stringify([{ file: 'a.glb', lat: 1, lng: 2, altMsl: 20 }]));
    lib.reloadWatched(dir);
    const a2 = lib.get(a.id)!;
    expect(a2.placement.alt).toBe(20);
    expect(a2.version).toBe(2);
    expect(userMeshes()).toHaveLength(1);

    lib.reloadWatched(dir);
    expect(lib.get(a.id)!.version).toBe(2);

    const future = new Date(Date.now() + 60_000);
    utimesSync(path.join(dir, 'a.glb'), future, future);
    lib.reloadWatched(dir);
    expect(lib.get(a.id)!.version).toBe(3);
    expect(sceneMeshByKey(`user::${a.id}`)?.version).toBe(3);

    write(path.join(dir, 'models.json'), '{ broken');
    lib.reloadWatched(dir);
    expect(lib.get(a.id)).toBeDefined();

    expect(lib.update(a.id, { visible: false, name: 'nope', placement: { ...a2.placement, lat: 9 } })).toMatchObject({ visible: false, name: 'a', placement: { lat: 1 } });
    expect(lib.remove(a.id)).toBe(false);

    expect(lib.removeWatched(dir)).toBe(true);
    expect(lib.list()).toEqual([]);
    expect(userMeshes()).toEqual([]);
  });

  it('keeps ids and visibility across a restart', () => {
    const dir = path.join(root, 'watch');
    write(path.join(dir, 'a.glb'), 'A');
    write(path.join(dir, 'models.json'), JSON.stringify([{ file: 'a.glb', lat: 1, lng: 2 }]));
    lib.addWatched(dir);
    const id = lib.list()[0]!.id;
    lib.update(id, { visible: false });
    lib.dispose();
    lib = makeLib();
    expect(lib.list().map((m) => [m.id, m.visible])).toEqual([[id, false]]);
    expect(lib.get(id)!.version).toBe(1);
  });

  it('refuses a folder without a placement table', () => {
    const dir = path.join(root, 'empty');
    mkdirSync(dir, { recursive: true });
    expect(lib.addWatched(dir).dir).toBeNull();
    expect(lib.addWatched(path.join(root, 'nope')).error).toBeTruthy();
    expect(lib.listWatched()).toEqual([]);
  });
});

describe('crs resolver', () => {
  it('prefers builtins, then the cache, then epsg.io, and caches the answer', async () => {
    const cache = path.join(mkdtempSync(path.join(os.tmpdir(), 'crs-')), 'crs-cache.json');
    const fetchFn = vi.fn(async () => new Response('+proj=sterea +lat_0=52 \n', { status: 200 }));
    const resolve = createCrsResolver(cache, { builtin: (c) => (c === 4326 ? '+proj=longlat' : null), fetchFn: fetchFn as unknown as typeof fetch });
    expect(await resolve(4326)).toBe('+proj=longlat');
    expect(fetchFn).not.toHaveBeenCalled();
    expect(await resolve(28992)).toBe('+proj=sterea +lat_0=52');
    expect(fetchFn).toHaveBeenCalledWith('https://epsg.io/28992.proj4', expect.anything());
    expect(await resolve(28992)).toBe('+proj=sterea +lat_0=52');
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(cache, 'utf-8'))).toEqual({ 28992: '+proj=sterea +lat_0=52' });
  });

  it('returns null when the lookup fails', async () => {
    const cache = path.join(mkdtempSync(path.join(os.tmpdir(), 'crs-')), 'crs-cache.json');
    const notFound = createCrsResolver(cache, { fetchFn: (async () => new Response('', { status: 404 })) as unknown as typeof fetch });
    expect(await notFound(1234)).toBeNull();
    const offline = createCrsResolver(cache, { fetchFn: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
    expect(await offline(1234)).toBeNull();
    const html = createCrsResolver(cache, { fetchFn: (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch });
    expect(await html(1234)).toBeNull();
    expect(await notFound(-1)).toBeNull();
  });
});

describe('point cloud conversion off the main thread', () => {
  it('hands LAS/LAZ to the injected converter (the worker in the app) and keeps its result', async () => {
    const jobs: Array<{ src: string; outPath: string }> = [];
    const l = new UserModelLibrary({
      baseDir: path.join(root, 'user-models-worker'),
      geoid: () => null,
      resolveCrs: async () => null,
      onChange: () => {},
      watchFs: false,
      convertPointCloud: async (job) => {
        jobs.push(job);
        writeFileSync(job.outPath, 'ply');
        return { lat: 44.17, lng: 19.32, altMsl: 260, count: 1000, sourceCount: 5000, footprint: [{ lat: 44.17, lng: 19.32 }, { lat: 44.18, lng: 19.32 }, { lat: 44.18, lng: 19.33 }] };
      },
    });
    l.init();
    const res = await l.importFiles([write(src('scan.laz'), new Uint8Array(8))]);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.src).toBe(src('scan.laz'));
    expect(jobs[0]!.outPath.endsWith('points.ply')).toBe(true);
    const m = res.imported[0]!;
    expect(m.format).toBe('pointcloud');
    expect(m.pointCount).toBe(1000);
    expect(m.sourcePointCount).toBe(5000);
    expect(m.placement).toMatchObject({ lat: 44.17, lng: 19.32, alt: 260, altitudeMode: 'amsl' });
    expect(m.footprints?.[0]).toHaveLength(3);
  });
});
