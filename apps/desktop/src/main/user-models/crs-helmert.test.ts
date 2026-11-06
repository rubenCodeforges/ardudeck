import { describe, expect, it } from 'vitest';
import { hasUnverifiedHelmert } from './crs';

describe('hasUnverifiedHelmert', () => {
  it('flags a fetched 7-parameter shift, the kind epsg.io got wrong for 28992', () => {
    expect(hasUnverifiedHelmert('+proj=sterea +ellps=bessel +towgs84=565.4171,50.3319,465.5524,1.9342,-1.6677,9.1019,4.0725 +units=m')).toBe(true);
  });
  it('trusts no shift, a null shift and a 3-parameter shift', () => {
    expect(hasUnverifiedHelmert('+proj=utm +zone=33 +datum=WGS84')).toBe(false);
    expect(hasUnverifiedHelmert('+proj=utm +zone=33 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0')).toBe(false);
    expect(hasUnverifiedHelmert('+proj=tmerc +ellps=bessel +towgs84=682,-203,480,0,0,0,0')).toBe(false);
    expect(hasUnverifiedHelmert('+proj=tmerc +ellps=bessel +towgs84=682,-203,480')).toBe(false);
  });
});
