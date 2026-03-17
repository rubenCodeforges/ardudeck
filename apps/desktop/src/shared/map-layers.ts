/**
 * Centralized map layer definitions — single source of truth for all map components.
 * Used by telemetry map, mission 2D, mission 3D, and tile cache.
 */

export interface MapLayer {
  name: string;
  url: string;
  subdomains: readonly string[];
  maxZoom: number;
}

export const MAP_LAYERS = {
  osm: {
    name: 'Street',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 19,
  },
  satellite: {
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    subdomains: [],
    maxZoom: 18,
  },
  googleSat: {
    name: 'Google Sat',
    url: 'https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    subdomains: [],
    maxZoom: 21,
  },
  googleHybrid: {
    name: 'Hybrid',
    url: 'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    subdomains: [],
    maxZoom: 21,
  },
  terrain: {
    name: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 17,
  },
  dark: {
    name: 'Dark',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
    subdomains: ['a', 'b', 'c'],
    maxZoom: 20,
  },
  dem: {
    name: 'DEM',
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    subdomains: [],
    maxZoom: 15,
  },
} as const satisfies Record<string, MapLayer>;

export type LayerKey = keyof typeof MAP_LAYERS;

/**
 * Resolve the real HTTP tile URL for a given layer/z/x/y.
 * Handles subdomain rotation and different URL patterns (e.g. Esri {z}/{y}/{x}).
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
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
}

/**
 * Get the tile URL template for MapLibre (replaces {s} with first subdomain).
 * MapLibre handles {z}/{x}/{y} substitution itself.
 */
export function getMapLibreTileUrl(layerKey: LayerKey): string {
  const layer = MAP_LAYERS[layerKey];
  if (layer.subdomains.length > 0) {
    return layer.url.replace('{s}', layer.subdomains[0]!);
  }
  return layer.url;
}
