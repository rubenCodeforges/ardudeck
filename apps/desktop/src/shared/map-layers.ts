import { t } from './i18n/index.js';

/**
 * Centralized map layer definitions — single source of truth for all map components.
 * Used by telemetry map, mission 2D, mission 3D, and tile cache.
 */

export interface MapLayer {
  name: string;
  /**
   * Tile URL template. Tokens: {s} subdomain, {q} quadkey, {z}/{x}/{y} tile
   * coordinates and {key} the user's API key for keyService layers (filled in
   * by the tile-cache, see resolveLayerTileUrl).
   */
  url: string;
  subdomains: readonly string[];
  maxZoom: number;
  /** Max zoom at which tiles actually exist on the server. Beyond this, tiles are upscaled. */
  maxNativeZoom?: number;
  /** Extra headers to send when fetching tiles (e.g. Referer for Google) */
  headers?: Record<string, string>;
  /** Credit the tile provider requires, shown in the map's attribution corner. */
  attribution?: string;
  /**
   * Stored API key this layer needs, as saved by Settings > Maps. While no key
   * is set the tile-cache serves blank tiles for it instead of hitting the
   * server, exactly like OpenAIP does.
   */
  keyService?: string;
}

/** Tianditu (天地图) tile servers; the {s} token rotates between them. */
export const TIANDITU_SUBDOMAINS = ['0', '1', '2', '3', '4', '5', '6', '7'] as const;
/** API key service name for Tianditu basemaps, as stored by Settings > Maps. */
export const TIANDITU_KEY_SERVICE = 'tianditu';
export const TIANDITU_ATTRIBUTION = '© 天地图'; // i18n-exempt
/**
 * Tianditu issues keys of two kinds: server-side keys work from any client, but
 * browser-side ("浏览器端") keys — the default the console creates — are
 * rejected with 301012 "Key权限类型为:浏览器端" unless the request looks like a
 * browser. Sending a browser User-Agent makes both kinds work, the way the
 * Google layers already send their Referer.
 */
export const TIANDITU_TILE_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
};

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
  // Tianditu (天地图) — the official Chinese WMTS basemap. Keyless requests are
  // rejected, so a free key from console.tianditu.gov.cn is required
  // (Settings > Maps). Chinese imagery is far sharper here than on the world
  // basemaps, and it is the one provider that is always reachable in China.
  // Labels travel as their own annotation layers (cva_w / cia_w, see
  // TIANDITU_LABEL_LAYERS below) because WMTS has no combined vec+cva tile.
  tiandituVec: {
    name: 'Tianditu Street', // i18n-exempt
    url: 'https://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}',
    subdomains: TIANDITU_SUBDOMAINS,
    maxZoom: 18,
    maxNativeZoom: 18,
    attribution: TIANDITU_ATTRIBUTION,
    keyService: TIANDITU_KEY_SERVICE,
    headers: TIANDITU_TILE_HEADERS,
  },
  // Pure imagery, no annotation — pair with tiandituHybrid when labels are wanted.
  tiandituImg: {
    name: 'Tianditu Satellite', // i18n-exempt
    url: 'https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}',
    subdomains: TIANDITU_SUBDOMAINS,
    maxZoom: 18,
    maxNativeZoom: 18,
    attribution: TIANDITU_ATTRIBUTION,
    keyService: TIANDITU_KEY_SERVICE,
    headers: TIANDITU_TILE_HEADERS,
  },
  // Same imagery as tiandituImg, kept as its own layer because the map draws
  // the cia_w annotation on top of this one only — the Tianditu counterpart of
  // Satellite vs Hybrid. Its tiles cache separately, like dark and dark-carto.
  tiandituHybrid: {
    name: 'Tianditu Hybrid', // i18n-exempt
    url: 'https://t{s}.tianditu.gov.cn/img_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=img&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}',
    subdomains: TIANDITU_SUBDOMAINS,
    maxZoom: 18,
    maxNativeZoom: 18,
    attribution: TIANDITU_ATTRIBUTION,
    keyService: TIANDITU_KEY_SERVICE,
    headers: TIANDITU_TILE_HEADERS,
  },
} as const satisfies Record<string, MapLayer>;

export type LayerKey = keyof typeof MAP_LAYERS;

/**
 * Annotation (label) tiles for the Tianditu basemaps. WMTS serves the vector
 * geometry and its labels as separate layers, so these are drawn over the base
 * tile the way the dark style draws its own label overlay. They are cached
 * under their own cache key and never appear in the base-map pickers.
 */
export const TIANDITU_VEC_LABELS_LAYER = 'tianditu-vec-labels';
export const TIANDITU_IMG_LABELS_LAYER = 'tianditu-img-labels';

function tiandituLabelUrl(layer: string): string {
  return `https://t{s}.tianditu.gov.cn/${layer}_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=${layer}&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk={key}`;
}

export const TIANDITU_VEC_LABELS: MapLayer = {
  name: 'Tianditu Labels', // i18n-exempt
  url: tiandituLabelUrl('cva'),
  subdomains: TIANDITU_SUBDOMAINS,
  maxZoom: 18,
  maxNativeZoom: 18,
  keyService: TIANDITU_KEY_SERVICE,
  headers: TIANDITU_TILE_HEADERS,
};

export const TIANDITU_IMG_LABELS: MapLayer = {
  name: 'Tianditu Labels', // i18n-exempt
  url: tiandituLabelUrl('cia'),
  subdomains: TIANDITU_SUBDOMAINS,
  maxZoom: 18,
  maxNativeZoom: 18,
  keyService: TIANDITU_KEY_SERVICE,
  headers: TIANDITU_TILE_HEADERS,
};

/** Label overlay per label cache-layer name, resolved by the tile-cache. */
export const TIANDITU_LABEL_LAYERS: Record<string, MapLayer> = {
  [TIANDITU_VEC_LABELS_LAYER]: TIANDITU_VEC_LABELS,
  [TIANDITU_IMG_LABELS_LAYER]: TIANDITU_IMG_LABELS,
};

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
 * Resolve the real HTTP tile URL for a layer definition at a given z/x/y.
 * Handles subdomain rotation, the Bing quadkey token, the {key} API-key token
 * (keyed providers such as Tianditu) and the Esri {z}/{y}/{x} order.
 */
export function resolveLayerTileUrl(
  layer: MapLayer,
  z: number,
  x: number,
  y: number,
  apiKey?: string | null,
): string {
  let url: string = layer.url;

  // Rotate subdomains deterministically based on (x + y) to spread load
  if (layer.subdomains.length > 0) {
    const idx = (x + y) % layer.subdomains.length;
    url = url.replace('{s}', layer.subdomains[idx]!);
  }
  if (apiKey) url = url.replace('{key}', encodeURIComponent(apiKey));

  return url
    .replace('{q}', tileToQuadkey(z, x, y))
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * Resolve the real HTTP tile URL for a given layer/z/x/y.
 * Keyed layers (Tianditu) need their key from the tile-cache; resolving them
 * here leaves the {key} token in place, which the server rejects, so always go
 * through resolveLayerTileUrl when a key might be involved.
 */
export function resolveTileUrl(layerKey: LayerKey, z: number, x: number, y: number): string {
  return resolveLayerTileUrl(MAP_LAYERS[layerKey], z, x, y);
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
