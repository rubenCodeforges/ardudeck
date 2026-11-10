import { dirname, extname, resolve, sep } from 'node:path';
import type { SceneMeshEntry } from '../../shared/tile-source-types.js';

const CONTENT_TYPES: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ktx2': 'image/ktx2',
  '.json': 'application/json',
  '.b3dm': 'application/octet-stream',
  '.i3dm': 'application/octet-stream',
  '.pnts': 'application/octet-stream',
  '.cmpt': 'application/octet-stream',
  '.dae': 'model/vnd.collada+xml',
  '.ply': 'application/octet-stream',
};

export function meshContentType(file: string): string {
  return CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/** Null for an unknown key or a path that escapes the registered file's directory. */
export function resolveMeshAssetPath(
  pathname: string,
  lookup: (key: string) => Pick<SceneMeshEntry, 'glb' | 'tileset' | 'pointCloud'> | undefined,
): { path: string; contentType: string } | null {
  const parts = pathname.split('/').filter((p) => p.length > 0);
  if (parts.length < 2) return null;
  let key: string;
  let rest: string[];
  try {
    key = decodeURIComponent(parts[0]!);
    rest = parts.slice(1).map((p) => decodeURIComponent(p));
  } catch {
    return null;
  }
  if (rest.some((p) => p.includes('\0'))) return null;
  const entry = lookup(key);
  const file = entry?.glb || entry?.tileset || entry?.pointCloud;
  if (!file) return null;
  const base = resolve(dirname(file));
  const target = resolve(base, ...rest);
  if (!target.startsWith(base + sep)) return null;
  return { path: target, contentType: meshContentType(target) };
}
