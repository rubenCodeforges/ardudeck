import { t } from './i18n/index.js';

/**
 * Centralized map layer definitions — single source of truth for all map components.
 * Used by telemetry map, mission 2D, mission 3D, and tile cache.
 */

export interface MapLayer {
  name: string;
  url: string;
  subdomains: readonly string[];
  maxZoom: number;
  /** Max zoom at which tiles actually exist on the server. Beyond this, tiles are upscaled. */
  maxNativeZoom?: number;
  /** Extra headers to send when fetching tiles (e.g. Referer for Google) */
  headers?: Record<string, string>;
  /** Credit the tile provider requires, shown in the map's attribution corner. */
  attribution?: string;
}

export const MAP_LAYERS = {
  osm: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors', // i18n-exempt
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: [],
    maxZoom: 18,
    attribution: 'Esri, Vantor, Earthstar Geographics, and the GIS User Community', // i18n-exempt
  },
  googleSat: {
    name: 'Google Sat', // i18n-exempt
    url: 'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 22,
    maxNativeZoom: 20,
    headers: { Referer: 'https://www.google.com/' },
    attribution: 'Imagery © Google', // i18n-exempt
  },
  googleHybrid: {
    name: 'Hybrid',
    url: 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 22,
    maxNativeZoom: 20,
    headers: { Referer: 'https://www.google.com/' },
    attribution: 'Imagery © Google', // i18n-exempt
  },
  // Bing aerial via the classic keyless quadkey endpoints (the same ones
  // Mission Planner ships). Offered because Google tiles are unreachable in
  // some regions (China notably); Esri "Satellite" is the other option there.
  // Microsoft is sunsetting Bing Maps for Enterprise (2028) so these may die
  // eventually; the {q} token is resolved to a quadkey in resolveTileUrl.
  bingSat: {
    name: 'Bing Sat', // i18n-exempt
    url: 'https://ecn.t{s}.tiles.virtualearth.net/tiles/a{q}.jpeg?g=14364&n=z',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: '© Microsoft', // i18n-exempt
  },
  bingHybrid: {
    name: 'Bing Hybrid', // i18n-exempt
    url: 'https://ecn.t{s}.tiles.virtualearth.net/tiles/h{q}.jpeg?g=14364&n=z',
    subdomains: ['0', '1', '2', '3'],
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: '© Microsoft', // i18n-exempt
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 17,
    attribution: '© OpenStreetMap contributors, SRTM | © OpenTopoMap (CC-BY-SA)', // i18n-exempt
  },
  // Keyless Esri Canvas by default; with a Carto key from Settings > Maps the tile cache serves Carto dark_all instead.
  dark: {
    name: 'Dark',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    subdomains: [],
    maxZoom: 20,
    maxNativeZoom: 16,
    attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors, and the GIS user community', // i18n-exempt
  },
  dem: {
    name: 'DEM',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    subdomains: [],
    maxZoom: 15,
  },
  radar: {
    name: 'Radar',
    url: 'https://tilecache.rainviewer.com/{radarPath}/256/{z}/{x}/{y}/2/1_1.png',
    subdomains: [],
    maxZoom: 22,
    maxNativeZoom: 6,
  },
  openaip: {
    name: 'OpenAIP',
    url: 'https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png',
    subdomains: [],
    maxZoom: 22,
    maxNativeZoom: 14,
  },
} as const satisfies Record<string, MapLayer>;

export type LayerKey = keyof typeof MAP_LAYERS;

export function mapLayerName(layerKey: LayerKey): string {
  return t(`shared:mapLayers.${layerKey}`);
}

/**
 * Bing-style quadkey: one base-4 digit per zoom level, interleaving the x/y
 * bits from most-significant down. z=3, x=3, y=5 -> "213".
 */
export function tileToQuadkey(z: number, x: number, y: number): string {
  let quadkey = '';
  for (let i = z; i > 0; i--) {
    const mask = 1 << (i - 1);
    let digit = 0;
    if (x & mask) digit += 1;
    if (y & mask) digit += 2;
    quadkey += digit;
  }
  return quadkey;
}

/**
 * Resolve the real HTTP tile URL for a given layer/z/x/y.
 * Handles subdomain rotation and different URL patterns (Esri {z}/{y}/{x},
 * Bing {q} quadkeys).
 */
export function resolveTileUrl(layerKey: LayerKey, z: number, x: number, y: number): string {
  const layer = MAP_LAYERS[layerKey];
  let url: string = layer.url;

  // Rotate subdomains deterministically based on (x + y) to spread load
  if (layer.subdomains.length > 0) {
    const idx = (x + y) % layer.subdomains.length;
    url = url.replace('{s}', layer.subdomains[idx]!);
  }

  return url
    .replace('{q}', tileToQuadkey(z, x, y))
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * Get the tile URL template for MapLibre (replaces {s} with first subdomain).
 * MapLibre handles {z}/{x}/{y} substitution itself, and speaks quadkeys
 * natively via its {quadkey} token.
 */
export function getMapLibreTileUrl(layerKey: LayerKey): string {
  const layer = MAP_LAYERS[layerKey];
  let url: string = layer.url;
  if (layer.subdomains.length > 0) {
    url = url.replace('{s}', layer.subdomains[0]!);
  }
  return url.replace('{q}', '{quadkey}');
}

/** API key service name for Carto basemaps, as stored by Settings > Maps (same name on mobile). */
export const CARTO_KEY_SERVICE = 'carto';
/** Carto's documented keyed raster URL; without a valid key it serves an "API KEY REQUIRED" tile. */
export const CARTO_DARK_URL = 'https://basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?key={key}';
export const CARTO_ATTRIBUTION = '© OpenStreetMap contributors © CARTO'; // i18n-exempt
/** Label overlay drawn over the keyless dark base; transparent while Carto (which has its own labels) is in use. */
export const DARK_LABELS_LAYER = 'dark-labels';
export const ESRI_DARK_LABELS_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}';
export const ESRI_CANVAS_MAX_NATIVE_ZOOM = 16;

/** The credit to show for a base layer; the dark style credits CARTO while a Carto key serves it. */
export function layerAttribution(key: string, cartoKey: boolean): string | undefined {
  if (key === 'dark' && cartoKey) return CARTO_ATTRIBUTION;
  return (MAP_LAYERS as Record<string, MapLayer>)[key]?.attribution;
}
