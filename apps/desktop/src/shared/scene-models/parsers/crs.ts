import { PROJ_VERIFIED } from './proj-verified';
// Horizontal parts of compound CRSs, each checked against the EPSG registry.
const COMPOUND_HORIZONTAL: Record<number, number> = {
  7415: 28992,
  9286: 4258,
  7409: 4258,
  5554: 25831,
  5555: 25832,
  5556: 25833,
  7405: 27700,
  3901: 2393,
  9518: 4326,
  8370: 3812,
  6190: 31370,
};

const GEOGRAPHIC_3D = new Set([4979, 4937, 7912]);

/** The horizontal CRS of a compound code (7415 -> 28992); other codes come back unchanged. */
export function horizontalEpsgFor(code: number): number {
  return COMPOUND_HORIZONTAL[code] ?? code;
}

/** Geographic 3D codes whose heights are ellipsoidal. */
export function isEllipsoidalEpsg(code: number): boolean {
  return GEOGRAPHIC_3D.has(code);
}

/** An EPSG code from an OGC URL, a URN or an "EPSG:nnnn" string. */
export function parseEpsgCode(ref: unknown): number | null {
  if (typeof ref !== 'string') return null;
  const m = /EPSG\/[^/]*\/(\d+)\s*$/i.exec(ref) ?? /EPSG:(?:[^:]*:)?(\d+)\s*$/i.exec(ref) ?? /^\s*(\d+)\s*$/.exec(ref);
  return m ? Number(m[1]) : null;
}

/** proj4 definitions ArduDeck knows without a lookup: WGS84 and ETRS89 geographic, Web Mercator, RD New, WGS84 UTM and ETRS89 UTM. */
export function builtinProj4(epsg: number): string | null {
  if (epsg === 4326 || epsg === 4979) return '+proj=longlat +datum=WGS84 +no_defs';
  if (epsg === 4258 || epsg === 4937) return '+proj=longlat +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +no_defs';
  // epsg.io's 28992 string has its Helmert rotations in the wrong convention (about 170 m off); this one matches PROJ.
  if (epsg === 28992) return '+proj=sterea +lat_0=52.1561605555556 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +towgs84=565.2369,50.0087,465.658,-0.406857330322398,0.350732676542563,-1.8703473836068,4.0812 +units=m +no_defs';
  if (epsg === 3857) return '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs';
  if (epsg >= 32601 && epsg <= 32660) return `+proj=utm +zone=${epsg - 32600} +datum=WGS84 +units=m +no_defs`;
  if (epsg >= 32701 && epsg <= 32760) return `+proj=utm +zone=${epsg - 32700} +south +datum=WGS84 +units=m +no_defs`;
  if (epsg >= 25828 && epsg <= 25838) return `+proj=utm +zone=${epsg - 25800} +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs`;
  return PROJ_VERIFIED[epsg] ?? null;
}
