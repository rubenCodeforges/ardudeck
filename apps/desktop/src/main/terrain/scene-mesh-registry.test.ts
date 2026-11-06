import { beforeEach, describe, expect, it } from 'vitest';
import { join, resolve } from 'node:path';
import { listSceneMeshes, registerSceneMesh, sceneMeshByKey, unregisterSceneMesh, unregisterSceneMeshesFor } from './scene-mesh-registry';
import { meshContentType, resolveMeshAssetPath } from './mesh-asset-path';

describe('scene-mesh-registry', () => {
  beforeEach(() => {
    for (const e of listSceneMeshes()) unregisterSceneMeshesFor(e.slug);
  });

  it('registers with a url the renderer can load and removes by id or slug', () => {
    const e = registerSceneMesh('com.x', { id: 'site', name: 'Site', glb: '/p/model.glb', origin: { lat: 1, lng: 2, altMsl: 40 } });
    expect(e.key).toBe('com.x::site');
    expect(e.url).toBe('ardudeck-asset://mesh/com.x%3A%3Asite/model.glb');
    expect(sceneMeshByKey('com.x::site')?.glb).toBe('/p/model.glb');
    unregisterSceneMesh('com.x', 'site');
    expect(listSceneMeshes()).toEqual([]);
    registerSceneMesh('com.x', { id: 'a', name: 'A', glb: '/a.glb', origin: { lat: 0, lng: 0, altMsl: 0 } });
    registerSceneMesh('com.y', { id: 'a', name: 'A', glb: '/b.glb', origin: { lat: 0, lng: 0, altMsl: 0 } });
    unregisterSceneMeshesFor('com.x');
    expect(listSceneMeshes().map((m) => m.slug)).toEqual(['com.y']);
  });

  it('registers a tileset and encodes the file name', () => {
    const e = registerSceneMesh('user', { id: 't', name: 'T', tileset: '/d/my tiles/tile set.json', origin: { lat: 0, lng: 0, altMsl: 0 } });
    expect(e.url).toBe('ardudeck-asset://mesh/user%3A%3At/tile%20set.json');
  });

  it('registers a point cloud by its file name and checks the point size', () => {
    const e = registerSceneMesh('user', { id: 'pc', name: 'PC', pointCloud: '/d/m/points.ply', pointSizePx: 3, origin: { lat: 0, lng: 0, altMsl: 0 } });
    expect(e.url).toBe('ardudeck-asset://mesh/user%3A%3Apc/points.ply');
    expect(sceneMeshByKey('user::pc')?.pointCloud).toBe('/d/m/points.ply');
    expect(() => registerSceneMesh('user', { id: 'pc', name: 'PC', pointCloud: '/p.ply', pointSizePx: 0, origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
    expect(() => registerSceneMesh('user', { id: 'pc', name: 'PC', pointCloud: '/p.ply', pointSizePx: Number.NaN, origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
  });

  it('rejects a mesh without a glb, tileset or point cloud, or with more than one', () => {
    expect(() => registerSceneMesh('com.x', { id: 'bad', name: 'Bad', pointCloud: '', origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
    expect(() => registerSceneMesh('com.x', { id: 'bad', name: 'Bad', glb: '/a.glb', pointCloud: '/p.ply', origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
    expect(() => registerSceneMesh('com.x', { id: 'bad', name: 'Bad', tileset: '/t.json', pointCloud: '/p.ply', origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
    expect(() => registerSceneMesh('com.x', { id: 'bad', name: 'Bad', glb: '', origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
    expect(() => registerSceneMesh('com.x', { id: 'bad', name: 'Bad', origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
    expect(() => registerSceneMesh('com.x', { id: 'bad', name: 'Bad', glb: '/a.glb', tileset: '/t.json', origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
    expect(() => registerSceneMesh('com.x', { id: '', name: 'Bad', glb: '/a.glb', origin: { lat: 0, lng: 0, altMsl: 0 } })).toThrow();
  });
});

describe('resolveMeshAssetPath', () => {
  const dir = resolve('/srv/models/abc');
  const lookup = (key: string) => (key === 'user::m' ? { glb: join(dir, 'scene.gltf') }
    : key === 'user::t' ? { tileset: join(dir, 'tileset.json') }
    : key === 'user::p' ? { pointCloud: join(dir, 'points.ply') } : undefined);
  const key = encodeURIComponent('user::m');

  it('resolves the entry file and its siblings with a content type', () => {
    expect(resolveMeshAssetPath(`/${key}/scene.gltf`, lookup)).toEqual({ path: join(dir, 'scene.gltf'), contentType: 'model/gltf+json' });
    expect(resolveMeshAssetPath(`/${key}/scene.bin`, lookup)?.path).toBe(join(dir, 'scene.bin'));
    expect(resolveMeshAssetPath(`/${key}/textures/a%20b.png`, lookup)).toEqual({ path: join(dir, 'textures', 'a b.png'), contentType: 'image/png' });
    expect(resolveMeshAssetPath(`/${encodeURIComponent('user::t')}/tiles/0/0.b3dm`, lookup)?.path).toBe(join(dir, 'tiles', '0', '0.b3dm'));
    expect(resolveMeshAssetPath(`/${encodeURIComponent('user::p')}/points.ply`, lookup)).toEqual({ path: join(dir, 'points.ply'), contentType: 'application/octet-stream' });
    expect(resolveMeshAssetPath(`/${encodeURIComponent('user::p')}/../points.ply`, lookup)).toBeNull();
  });

  it('allows .. that stays inside the directory', () => {
    expect(resolveMeshAssetPath(`/${key}/textures/../scene.bin`, lookup)?.path).toBe(join(dir, 'scene.bin'));
  });

  it('rejects escapes, unknown keys and bare keys', () => {
    expect(resolveMeshAssetPath(`/${key}/../secret.txt`, lookup)).toBeNull();
    expect(resolveMeshAssetPath(`/${key}/..%2F..%2Fetc%2Fpasswd`, lookup)).toBeNull();
    expect(resolveMeshAssetPath(`/${key}/%2Fetc%2Fpasswd`, lookup)).toBeNull();
    expect(resolveMeshAssetPath(`/${key}/..`, lookup)).toBeNull();
    expect(resolveMeshAssetPath(`/${key}/a%00b.png`, lookup)).toBeNull();
    expect(resolveMeshAssetPath(`/${key}/%E0%A4%A`, lookup)).toBeNull();
    expect(resolveMeshAssetPath(`/${encodeURIComponent('user::other')}/scene.gltf`, lookup)).toBeNull();
    expect(resolveMeshAssetPath(`/${key}`, lookup)).toBeNull();
    expect(resolveMeshAssetPath(`/`, lookup)).toBeNull();
  });

  it('maps content types by extension', () => {
    expect(meshContentType('a.GLB')).toBe('model/gltf-binary');
    expect(meshContentType('a.jpg')).toBe('image/jpeg');
    expect(meshContentType('a.ktx2')).toBe('image/ktx2');
    expect(meshContentType('a.dae')).toBe('model/vnd.collada+xml');
    expect(meshContentType('a.pnts')).toBe('application/octet-stream');
  });
});
