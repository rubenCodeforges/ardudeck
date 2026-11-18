import { createHash } from 'node:crypto';
import type { BasemapRegistration, BasemapTileSource } from '@ardudeck/module-sdk';
import {
  MODULE_BASEMAP_LABELS_PREFIX,
  MODULE_BASEMAP_PREFIX,
  type ModuleBasemapInfo,
} from '../../shared/basemap-types.js';

interface Entry {
  info: ModuleBasemapInfo;
  base: BasemapTileSource;
  labels?: BasemapTileSource;
}

const DEFAULT_NATIVE_ZOOM = 18;
const entries = new Map<string, Entry>();
const byLayer = new Map<string, { entry: Entry; part: 'base' | 'labels' }>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

// URL hostnames are lowercased and must stay ASCII, so the layer name is a hash, stable across restarts.
function layerHash(slug: string, id: string): string {
  return createHash('sha1').update(`${slug}::${id}`).digest('hex').slice(0, 16);
}

function checkSource(slug: string, id: string, what: string, src: BasemapTileSource | undefined): void {
  if (!src || typeof src.url !== 'string') throw new Error(`[module:${slug}] basemap ${id} needs a ${what} url`);
  let protocol: string;
  try {
    protocol = new URL(src.url.replace(/\{[a-z]+\}/gi, '0')).protocol;
  } catch {
    throw new Error(`[module:${slug}] basemap ${id} has an invalid ${what} url`);
  }
  if (protocol !== 'https:' && protocol !== 'http:') throw new Error(`[module:${slug}] basemap ${id} ${what} url must be http(s)`);
  const hasXyz = /\{z\}/.test(src.url) && /\{x\}/.test(src.url) && /\{y\}/.test(src.url);
  if (!hasXyz && !/\{q\}/.test(src.url)) {
    throw new Error(`[module:${slug}] basemap ${id} ${what} url needs {z}/{x}/{y} or {q}`);
  }
  if (/\{s\}/.test(src.url) && !src.subdomains?.length) throw new Error(`[module:${slug}] basemap ${id} ${what} url uses {s} without subdomains`);
}

export function registerBasemap(slug: string, reg: BasemapRegistration): ModuleBasemapInfo {
  if (!reg?.id) throw new Error(`[module:${slug}] basemap needs an id`);
  if (!reg.name) throw new Error(`[module:${slug}] basemap ${reg.id} needs a name`);
  checkSource(slug, reg.id, 'base', reg.base);
  if (reg.labels) checkSource(slug, reg.id, 'labels', reg.labels);

  unregisterBasemap(slug, reg.id, false);
  const hash = layerHash(slug, reg.id);
  const maxNativeZoom = Math.max(0, Math.min(24, Math.round(reg.maxNativeZoom ?? DEFAULT_NATIVE_ZOOM)));
  const info: ModuleBasemapInfo = {
    key: `${MODULE_BASEMAP_PREFIX}${hash}`,
    labelsKey: reg.labels ? `${MODULE_BASEMAP_LABELS_PREFIX}${hash}` : undefined,
    slug,
    name: reg.name,
    attribution: reg.attribution,
    maxNativeZoom,
    maxZoom: Math.max(maxNativeZoom, Math.min(24, Math.round(reg.maxZoom ?? maxNativeZoom + 4))),
    primary: reg.primary === true,
  };
  const entry: Entry = { info, base: { ...reg.base }, labels: reg.labels ? { ...reg.labels } : undefined };
  entries.set(`${slug}::${reg.id}`, entry);
  byLayer.set(info.key, { entry, part: 'base' });
  if (info.labelsKey) byLayer.set(info.labelsKey, { entry, part: 'labels' });
  emit();
  return info;
}

export function unregisterBasemap(slug: string, id: string, notify = true): void {
  const entry = entries.get(`${slug}::${id}`);
  if (!entry) return;
  entries.delete(`${slug}::${id}`);
  byLayer.delete(entry.info.key);
  if (entry.info.labelsKey) byLayer.delete(entry.info.labelsKey);
  if (notify) emit();
}

export function unregisterBasemapsFor(slug: string): void {
  let changed = false;
  for (const [k, e] of entries) {
    if (e.info.slug !== slug) continue;
    entries.delete(k);
    byLayer.delete(e.info.key);
    if (e.info.labelsKey) byLayer.delete(e.info.labelsKey);
    changed = true;
  }
  if (changed) emit();
}

export function listBasemaps(): ModuleBasemapInfo[] {
  return [...entries.values()].map((e) => e.info);
}

export function subscribeBasemaps(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** The provider URL and headers for one tile of a cargo layer, or null when the layer is unknown. */
export function basemapTileRequest(
  layer: string,
  z: number,
  x: number,
  y: number,
): { url: string; headers?: Record<string, string>; maxNativeZoom: number } | null {
  const hit = byLayer.get(layer);
  if (!hit) return null;
  const src = hit.part === 'base' ? hit.entry.base : hit.entry.labels!;
  let url = src.url;
  if (src.subdomains?.length) url = url.replace('{s}', src.subdomains[(x + y) % src.subdomains.length]!);
  url = url
    .replace('{q}', quadkey(z, x, y))
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));
  return { url, headers: src.headers, maxNativeZoom: hit.entry.info.maxNativeZoom };
}

function quadkey(z: number, x: number, y: number): string {
  let q = '';
  for (let i = z; i > 0; i--) {
    const mask = 1 << (i - 1);
    q += String((x & mask ? 1 : 0) + (y & mask ? 2 : 0));
  }
  return q;
}
