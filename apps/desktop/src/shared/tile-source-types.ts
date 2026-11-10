import type { SceneMeshRegistration, TileSourceRegistration } from '@ardudeck/module-sdk';

export interface TileSourceEntry extends TileSourceRegistration {
  slug: string;
  /** `${slug}::${id}` */
  key: string;
}

export interface SceneMeshEntry extends SceneMeshRegistration {
  slug: string;
  key: string;
  /** URL the renderer loads the GLB from. */
  url: string;
}

export interface TerrainUplinkStatus {
  sysid: number;
  served: number;
  missing: number;
  unavailable: number;
  gaps: number;
  errors: number;
  ignored: number;
  lastAt: number | null;
  spacing: number | null;
}

/** Raster sources are served at tile-cache://ts-<key>/{z}/{x}/{y}.png. */
export const TILE_SOURCE_LAYER_PREFIX = 'ts-';
export const ASSET_SCHEME = 'ardudeck-asset';
