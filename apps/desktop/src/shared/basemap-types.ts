/** A cargo base map as the renderer sees it: names and opaque tile-cache layers, never the provider URL or key. */
export interface ModuleBasemapInfo {
  /** tile-cache layer of the base tiles, `mb-<hash>`; also the value stored as the selected map layer. */
  key: string;
  /** tile-cache layer of the label overlay, `mbl-<hash>`, when the cargo has one. */
  labelsKey?: string;
  slug: string;
  name: string;
  attribution?: string;
  maxZoom: number;
  maxNativeZoom: number;
  primary: boolean;
}

export const MODULE_BASEMAP_PREFIX = 'mb-';
export const MODULE_BASEMAP_LABELS_PREFIX = 'mbl-';

export const BASEMAP_IPC = {
  list: 'basemaps:list',
  changed: 'basemaps:changed',
} as const;

export function isModuleBasemapKey(key: string): boolean {
  return key.startsWith(MODULE_BASEMAP_PREFIX);
}
