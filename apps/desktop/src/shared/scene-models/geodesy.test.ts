import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { applyTransform, ecefToGeodetic, enuBasis, geodeticToEcef, tilesetCentre } from './geodesy';
import { parseGeoidPgm } from './geoid';

describe('geodesy', () => {
  it('round-trips geodetic and ECEF to well under a millimetre', () => {
    for (const [lat, lng, h] of [[44.168, 19.3248, 260], [25.0339, 121.5645, 508], [-33.86, 151.21, 5], [89.9, 10, 0]] as const) {
      const g = ecefToGeodetic(geodeticToEcef(lat, lng, h));
      expect(g.lat).toBeCloseTo(lat, 9);
      expect(g.lng).toBeCloseTo(lng, 9);
      expect(g.hEll).toBeCloseTo(h, 3);
    }
  });

  it('ENU up points along the ellipsoid normal', () => {
    const { east, north, up } = enuBasis(0, 0);
    expect(up).toEqual([1, 0, 0]);
    expect(east[1]).toBeCloseTo(1, 12);
    expect(north[2]).toBeCloseTo(1, 12);
  });

  it('finds a tileset centre from a Cesium-style root transform (ENU frame at Taipei 101)', () => {
    const o = geodeticToEcef(25.0339, 121.5645, 10);
    const { east, north, up } = enuBasis(25.0339, 121.5645);
    const transform = [...east, 0, ...north, 0, ...up, 0, ...o, 1];
    const c = tilesetCentre({ root: { transform, boundingVolume: { box: [0, 0, 250, 60, 0, 0, 0, 60, 0, 0, 0, 250] } } });
    expect(c.lat).toBeCloseTo(25.0339, 6);
    expect(c.lng).toBeCloseTo(121.5645, 6);
    expect(c.hEll).toBeCloseTo(260, 2);
    expect(applyTransform(transform, [0, 0, 0])).toEqual(o);
  });

  it('reads a region bounding volume in radians and ellipsoid metres', () => {
    const r = Math.PI / 180;
    const c = tilesetCentre({ root: { boundingVolume: { region: [8.4 * r, 53.2 * r, 8.5 * r, 53.3 * r, 0, 40] } } });
    expect(c.lat).toBeCloseTo(53.25, 9);
    expect(c.lng).toBeCloseTo(8.45, 9);
    expect(c.hEll).toBe(20);
  });
});

describe('EGM96 geoid (same grid and interpolation as Locus)', () => {
  const geoid = parseGeoidPgm(new Uint8Array(readFileSync(join(__dirname, '../../../resources/geoids/egm96-15.pgm'))));
  it('matches the Locus reference value at 0,0', () => {
    expect(geoid.undulation(0, 0)).toBeCloseTo(17.16, 1);
  });
  it('wraps longitude and stays continuous across the antimeridian', () => {
    expect(geoid.undulation(10, -170)).toBeCloseTo(geoid.undulation(10, 190), 9);
    expect(Math.abs(geoid.undulation(10, 179.99) - geoid.undulation(10, -179.99))).toBeLessThan(0.05);
  });
  it('rejects a file that is not a PGM grid', () => {
    expect(() => parseGeoidPgm(new TextEncoder().encode('P2\n1 1\n255\n0'))).toThrow();
  });
});
