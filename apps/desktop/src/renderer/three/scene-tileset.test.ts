import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import * as THREE from 'three';
import { B3DMLoader, WGS84_ELLIPSOID } from '3d-tiles-renderer';
import { applyTransform, ecefToGeodetic, enuBasis, geodeticToEcef, tilesetCentre, type Vec3 } from '../../shared/scene-models/geodesy';
import { ecefToLocalMatrix } from './scene-tileset';

// CesiumGS/3d-tiles-samples 1.0/TilesetWithDiscreteLOD (CC0), see __fixtures__/README.md
const DIR = join(__dirname, '../../shared/scene-models/__fixtures__/cesium-discrete-lod');
const tileset = JSON.parse(readFileSync(join(DIR, 'tileset.json'), 'utf-8')) as { root: { transform: number[] } };
const b3dm = readFileSync(join(DIR, 'dragon_low.b3dm'));

/** The GLB inside a b3dm, from its 28-byte header. */
function glbOf(buf: Buffer): Buffer {
  const offset = 28 + buf.readUInt32LE(12) + buf.readUInt32LE(16) + buf.readUInt32LE(20) + buf.readUInt32LE(24);
  return buf.subarray(offset, buf.readUInt32LE(8));
}

/** POSITION accessor bounds and its first vertex, read straight from the GLB chunks. */
function positions(glb: Buffer): { min: Vec3; max: Vec3; first: Vec3 } {
  const jsonLen = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.toString('utf8', 20, 20 + jsonLen));
  const bin = 20 + jsonLen + 8;
  const acc = gltf.accessors[gltf.meshes[0].primitives[0].attributes.POSITION];
  const view = gltf.bufferViews[acc.bufferView];
  expect(gltf.nodes[0].matrix ?? null).toBeNull();
  const at = bin + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  return { min: acc.min, max: acc.max, first: [glb.readFloatLE(at), glb.readFloatLE(at + 4), glb.readFloatLE(at + 8)] };
}

const yUpToZUp = ([x, y, z]: Vec3): Vec3 => [x, -z, y];

/** Expected position in the views' frame (x east, y up, z south) from plain geodesy. */
function expectedLocal(ecef: Vec3, o: { lat: number; lng: number; hEll: number }): Vec3 {
  const c = geodeticToEcef(o.lat, o.lng, o.hEll);
  const d: Vec3 = [ecef[0] - c[0], ecef[1] - c[1], ecef[2] - c[2]];
  const { east, north, up } = enuBasis(o.lat, o.lng);
  const dot = (a: Vec3) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2];
  return [dot(east), dot(up), -dot(north)];
}

describe('real 3D Tiles sample (Cesium TilesetWithDiscreteLOD)', () => {
  const centre = tilesetCentre(tileset);
  const pos = positions(glbOf(b3dm));

  it('centres on the sample site in Pennsylvania', () => {
    expect(centre.lat).toBeCloseTo(40.0425306, 6);
    expect(centre.lng).toBeCloseTo(-75.6120943, 6);
    expect(centre.hEll).toBeCloseTo(503.75, 2);
  });

  it('box half-axes match the content only after the glTF y-up to z-up turn', () => {
    // root box half-axes: 7.0955 x, 3.1405 y, 5.0375 z
    expect(Math.max(-pos.min[1], pos.max[1])).toBeCloseTo(5.0375, 1);
    expect(Math.max(-pos.min[2], pos.max[2])).toBeCloseTo(3.1405, 1);
  });

  it('the dragon stands on the ellipsoid: its lowest point is at about 0 m', () => {
    const low = ecefToGeodetic(applyTransform(tileset.root.transform, yUpToZUp([0, pos.min[1], 0])));
    expect(Math.abs(low.hEll)).toBeLessThan(5);
    expect(low.lat).toBeCloseTo(40.0425, 3);
    expect(low.lng).toBeCloseTo(-75.6121, 3);
  });

  it('the renderer chain puts a real vertex at its geodetic ENU offset from the entry origin', async () => {
    const loader = new B3DMLoader(new THREE.LoadingManager());
    // TilesRenderer.loadRootTileset: gltfUpAxis 'y' -> rotate +90 degrees about x
    (loader as unknown as { adjustmentTransform: THREE.Matrix4 }).adjustmentTransform.makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    const ab = b3dm.buffer.slice(b3dm.byteOffset, b3dm.byteOffset + b3dm.byteLength);
    const { scene } = await loader.parse(ab as ArrayBuffer);
    // TilesRenderer.parseTile: premultiply the tile transform (root has no parent)
    scene.updateMatrix();
    scene.matrix.premultiply(new THREE.Matrix4().fromArray(tileset.root.transform));
    scene.matrix.decompose(scene.position, scene.quaternion, scene.scale);

    const group = new THREE.Group();
    ecefToLocalMatrix(WGS84_ELLIPSOID, centre.lat, centre.lng, centre.hEll).decompose(group.position, group.quaternion, group.scale);
    group.add(scene);
    group.updateMatrixWorld(true);

    let mesh: THREE.Mesh | null = null;
    scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    expect(mesh).not.toBeNull();
    const m = mesh as unknown as THREE.Mesh;
    const attr = m.geometry.getAttribute('position');
    const got = new THREE.Vector3().fromBufferAttribute(attr, 0);
    expect(got.toArray()).toEqual(pos.first.map((v) => Math.fround(v)));
    got.applyMatrix4(m.matrixWorld);

    const ecef = applyTransform(tileset.root.transform, yUpToZUp(pos.first));
    const want = expectedLocal(ecef, centre);
    expect(got.x).toBeCloseTo(want[0], 3);
    expect(got.y).toBeCloseTo(want[1], 3);
    expect(got.z).toBeCloseTo(want[2], 3);

    // the same vertex through lat/lng and the ellipsoid's radii of curvature
    const g = ecefToGeodetic(ecef);
    const e2 = 0.00669437999014, rad = Math.PI / 180, s2 = Math.sin(centre.lat * rad) ** 2;
    const meridian = (6378137 * (1 - e2)) / (1 - e2 * s2) ** 1.5;
    const prime = 6378137 / Math.sqrt(1 - e2 * s2);
    expect(got.x).toBeCloseTo((g.lng - centre.lng) * rad * prime * Math.cos(centre.lat * rad), 0);
    expect(-got.z).toBeCloseTo((g.lat - centre.lat) * rad * meridian, 0);
  });
});
