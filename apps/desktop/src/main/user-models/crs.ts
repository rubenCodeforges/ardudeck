import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type CrsResolver = (epsg: number) => Promise<string | null>;

/** A fetched definition with a 7-parameter shift: epsg.io has published these with the rotation sign flipped (28992 was ~170 m off). */
export function hasUnverifiedHelmert(def: string): boolean {
  const m = /\+towgs84=([^\s]+)/.exec(def);
  if (!m) return false;
  const p = m[1]!.split(',').map(Number);
  return p.length === 7 && p.slice(3).some((v) => Number.isFinite(v) && v !== 0);
}

const unverified = new Set<number>();

/** EPSG codes resolved this session from epsg.io with a 7-parameter shift: placement may be metres to hundreds of metres off. */
export function unverifiedCrsCodes(): number[] {
  return [...unverified];
}

/** Records a code a worker thread resolved, so the main process warns about it too. */
export function noteUnverifiedCrs(epsg: number): void {
  unverified.add(epsg);
}

export interface CrsResolverOptions {
  builtin?: (epsg: number) => string | null | undefined;
  fetchFn?: typeof fetch;
}

function readCache(path: string): Record<string, string> {
  try {
    if (!existsSync(path)) return {};
    const data = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    return data && typeof data === 'object' ? (data as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Built-in definitions, then the on-disk cache, then epsg.io (cached on success). */
export function createCrsResolver(cachePath: string, opts: CrsResolverOptions = {}): CrsResolver {
  const fetchFn = opts.fetchFn ?? fetch;
  return async (epsg) => {
    if (!Number.isInteger(epsg) || epsg <= 0) return null;
    const builtin = opts.builtin?.(epsg);
    if (builtin) return builtin;
    const cache = readCache(cachePath);
    const hit = cache[String(epsg)];
    if (hit) {
      if (hasUnverifiedHelmert(hit)) unverified.add(epsg);
      return hit;
    }
    try {
      const res = await fetchFn(`https://epsg.io/${epsg}.proj4`, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) return null;
      const def = (await res.text()).trim();
      if (!def.startsWith('+')) return null;
      mkdirSync(dirname(cachePath), { recursive: true });
      writeFileSync(cachePath, JSON.stringify({ ...readCache(cachePath), [String(epsg)]: def }, null, 2), 'utf-8');
      if (hasUnverifiedHelmert(def)) unverified.add(epsg);
      return def;
    } catch (err) {
      console.warn(`[user-models] EPSG:${epsg} lookup failed:`, err);
      return null;
    }
  };
}
