import { describe, expect, it } from 'vitest';
import proj4 from 'proj4';
import { builtinProj4, cityJsonToGlb, horizontalEpsgFor, parseEpsgCode } from './index';

// From https://epsg.io/28992.proj4: its rotations are in the wrong convention, so the builtin must win over it.
const RD_NEW_EPSG_IO = '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.4171,50.3319,465.5524,1.9342,-1.6677,9.1019,4.0725 +units=m +no_defs +type=crs';
// EPSG:3946 (Lambert CC46), not built in, from PROJ 9.8.1 projinfo
const CC46 = '+proj=lcc +lat_0=46 +lon_0=3 +lat_1=45.25 +lat_2=46.75 +x_0=1700000 +y_0=5200000 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs';

const resolver = async (epsg: number): Promise<string | null> => (epsg === 28992 ? RD_NEW_EPSG_IO : epsg === 3946 ? CC46 : null);

function cube(referenceSystem: string): object {
  const s = 10000;
  const vertices = [[0, 0, 0], [s, 0, 0], [s, s, 0], [0, s, 0], [0, 0, s], [s, 0, s], [s, s, s], [0, s, s]];
  const shell = [
    [[0, 3, 2, 1]], [[4, 5, 6, 7]], [[0, 1, 5, 4]], [[1, 2, 6, 5]], [[2, 3, 7, 6]], [[3, 0, 4, 7]],
  ];
  return {
    type: 'CityJSON',
    version: '2.0',
    transform: { scale: [0.001, 0.001, 0.001], translate: [84000, 447000, 1.5] },
    metadata: { referenceSystem },
    CityObjects: {
      'bldg-1': {
        type: 'Building',
        geometry: [
          { type: 'MultiSurface', lod: '1', boundaries: [[[0, 1, 2, 3]]] },
          { type: 'Solid', lod: '2.2', boundaries: [shell] },
        ],
      },
      'parent-no-geom': { type: 'Building' },
    },
    vertices,
  };
}

function readGlb(bytes: Uint8Array): { json: any; binLength: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(dv.getUint32(0, true)).toBe(0x46546c67);
  expect(dv.getUint32(4, true)).toBe(2);
  expect(dv.getUint32(8, true)).toBe(bytes.byteLength);
  const jsonLen = dv.getUint32(12, true);
  expect(jsonLen % 4).toBe(0);
  expect(dv.getUint32(16, true)).toBe(0x4e4f534a);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  const binLen = dv.getUint32(20 + jsonLen, true);
  expect(binLen % 4).toBe(0);
  expect(dv.getUint32(24 + jsonLen, true)).toBe(0x004e4942);
  expect(28 + jsonLen + binLen).toBe(bytes.byteLength);
  return { json, binLength: binLen };
}

describe('cityJsonToGlb', () => {
  it('converts a cube Solid in EPSG:7415 near Delft', async () => {
    const mesh = await cityJsonToGlb(cube('https://www.opengis.net/def/crs/EPSG/0/7415'), resolver);
    // PROJ cs2cs puts the corner (84000, 447000) at 52.0068221, 4.3531211; the origin is the cube centre 5 m NE of it.
    expect(mesh.origin.lat).toBeCloseTo(52.0068221 + 5 / 111250, 5);
    expect(mesh.origin.lng).toBeCloseTo(4.3531211 + 5 / 68540, 5);
    expect(mesh.origin.hEll).toBeCloseTo(6.5, 6);
    expect(mesh.ellipsoidal).toBe(false);
    expect(mesh.objectCount).toBe(1);

    const { json, binLength } = readGlb(mesh.glb);
    expect(json.nodes).toHaveLength(1);
    expect(json.nodes[0].extras).toEqual({ id: 'bldg-1', type: 'Building' });
    const pos = json.accessors[json.meshes[0].primitives[0].attributes.POSITION];
    expect(pos.count / 3).toBe(12);
    expect(pos.max[1] - pos.min[1]).toBeCloseTo(10, 2);
    expect(pos.max[0] - pos.min[0]).toBeGreaterThan(9);
    expect(pos.max[0] - pos.min[0]).toBeLessThan(11);
    expect(binLength).toBe(json.buffers[0].byteLength);

    const f32 = new Float32Array(mesh.glb.slice(28 + new DataView(mesh.glb.buffer).getUint32(12, true)).buffer);
    const nrm = json.accessors[json.meshes[0].primitives[0].attributes.NORMAL];
    const nView = json.bufferViews[nrm.bufferView];
    const normals = f32.subarray(nView.byteOffset / 4, nView.byteOffset / 4 + nrm.count * 3);
    const posView = json.bufferViews[pos.bufferView];
    const positions = f32.subarray(posView.byteOffset / 4, posView.byteOffset / 4 + pos.count * 3);
    let up = 0, down = 0;
    for (let i = 0; i < nrm.count; i++) {
      if (normals[i * 3 + 1]! > 0.99) { up++; expect(positions[i * 3 + 1]!).toBeGreaterThan(4); }
      if (normals[i * 3 + 1]! < -0.99) { down++; expect(positions[i * 3 + 1]!).toBeLessThan(-4); }
    }
    expect(up).toBe(6);
    expect(down).toBe(6);

    expect(mesh.footprints).toHaveLength(1);
    expect(mesh.footprints[0]!.length).toBeGreaterThanOrEqual(4);
  });

  it('reads a CityJSON 1.0 URN', async () => {
    const mesh = await cityJsonToGlb(cube('urn:ogc:def:crs:EPSG::7415'), resolver);
    expect(mesh.origin.lat).toBeCloseTo(52.0069, 4);
  });

  it('asks the resolver for a CRS it does not know', async () => {
    const asked: number[] = [];
    const doc = cube('EPSG:3946') as any;
    // cs2cs EPSG:4326 EPSG:3946 of 45.7640, 4.8357 (Lyon)
    doc.transform.translate = [1842779.1092, 5175416.4283, 35];
    const mesh = await cityJsonToGlb(doc, async (c) => { asked.push(c); return resolver(c); });
    expect(asked).toEqual([3946]);
    expect(mesh.origin.lat).toBeCloseTo(45.764 + 5 / 111200, 5);
    expect(mesh.origin.lng).toBeCloseTo(4.8357 + 5 / 77713, 5);
  });

  it('flags ellipsoidal heights for EPSG:4979', async () => {
    const doc = cube('https://www.opengis.net/def/crs/EPSG/0/4979') as any;
    doc.transform = { scale: [1e-7, 1e-7, 0.001], translate: [4.36, 52.0, 40] };
    const mesh = await cityJsonToGlb(doc, resolver);
    expect(mesh.ellipsoidal).toBe(true);
    expect(mesh.origin.lng).toBeCloseTo(4.3605, 4);
    expect(mesh.origin.lat).toBeCloseTo(52.0005, 4);
  });

  it('throws naming an unknown CRS', async () => {
    await expect(cityJsonToGlb(cube('https://www.opengis.net/def/crs/EPSG/0/2157'), resolver)).rejects.toThrow(/EPSG:2157/);
  });

  it('throws for a file that is not CityJSON', async () => {
    await expect(cityJsonToGlb({ type: 'FeatureCollection' }, resolver)).rejects.toThrow();
  });
});

describe('crs helpers', () => {
  it('parses EPSG references', () => {
    expect(parseEpsgCode('https://www.opengis.net/def/crs/EPSG/0/7415')).toBe(7415);
    expect(parseEpsgCode('urn:ogc:def:crs:EPSG::28992')).toBe(28992);
    expect(parseEpsgCode('EPSG:4979')).toBe(4979);
    expect(parseEpsgCode(undefined)).toBeNull();
  });

  it('maps compound codes to their horizontal part', () => {
    expect(horizontalEpsgFor(7415)).toBe(28992);
    expect(horizontalEpsgFor(5555)).toBe(25832);
    expect(horizontalEpsgFor(32631)).toBe(32631);
  });

  // Expected values from PROJ cs2cs (EPSG:4326 -> 32631 / 32756), independent of proj4js.
  it('builds UTM north and south definitions', () => {
    const [e, n] = proj4('WGS84', builtinProj4(32631)!, [4.36, 52.0]);
    expect(e).toBeCloseTo(593362.6277, 2);
    expect(n).toBeCloseTo(5761911.4402, 2);
    const [e2, n2] = proj4('WGS84', builtinProj4(32756)!, [151.2153, -33.8568]);
    expect(e2).toBeCloseTo(334900.5697, 2);
    expect(n2).toBeCloseTo(6252288.7529, 2);
    const [e3, n3] = proj4('WGS84', builtinProj4(25831)!, [4.36, 52.0]);
    expect(e3).toBeCloseTo(593362.6277, 2);
    expect(n3).toBeCloseTo(5761911.44, 1);
    expect(builtinProj4(25850)).toBeNull();
    expect(builtinProj4(3946)).toBeNull();
    expect(builtinProj4(2154)).toContain('+proj=lcc');
  });
});
