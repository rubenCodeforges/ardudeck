// Recordings and snapshots the media engine wrote, for the in-app gallery.

import { createReadStream, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { app, nativeImage, protocol, type NativeImage } from 'electron';
import type { CameraMediaItem } from '../../shared/camera-types.js';

export const MEDIA_SCHEME = 'ardudeck-media';
export const MEDIA_NAME = /^(snapshot|recording)_[\w-]+\.(jpg|mp4)$/;

type Kind = 'photos' | 'videos';

function systemDir(kind: Kind): string | null {
  try {
    return join(app.getPath(kind === 'photos' ? 'pictures' : 'videos'), 'ArduDeck');
  } catch {
    return null;
  }
}

/** Builds before the media folders existed wrote here. */
const legacyDir = () => join(app.getPath('userData'), 'camera-media');

/** Where new media of this kind goes: where people look for photos and videos, not the hidden data folder. */
export function mediaDir(kind: Kind): string {
  const dir = systemDir(kind) ?? legacyDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function searchDirs(): string[] {
  return [...new Set([systemDir('videos'), systemDir('photos'), legacyDir()].filter((d): d is string => !!d))];
}

export function listMediaIn(dirs: string[]): CameraMediaItem[] {
  const items: CameraMediaItem[] = [];
  const seen = new Set<string>();
  for (const dir of dirs) {
    let names: string[];
    try { names = readdirSync(dir); } catch { continue; }
    for (const name of names) {
      if (!MEDIA_NAME.test(name) || seen.has(name)) continue;
      try {
        const st = statSync(join(dir, name));
        if (!st.isFile()) continue;
        seen.add(name);
        items.push({
          name,
          kind: name.endsWith('.mp4') ? 'video' : 'photo',
          filePath: join(dir, name),
          size: st.size,
          modifiedAt: st.mtimeMs,
        });
      } catch { /* removed while listing */ }
    }
  }
  return items.sort((a, b) => b.modifiedAt - a.modifiedAt);
}

export const listMedia = () => listMediaIn(searchDirs());

/** Only ever touch files this app wrote, in its own media folders. */
export function isOwnMedia(filePath: string): boolean {
  return MEDIA_NAME.test(basename(filePath)) && searchDirs().includes(dirname(filePath)) && existsSync(filePath);
}

function resolveName(name: string): string | null {
  if (!MEDIA_NAME.test(name)) return null;
  for (const dir of searchDirs()) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

/** startDrag needs an icon on macOS; the app icon, or a plain tile if it is not found. */
export function mediaDragIcon(): NativeImage {
  const icon = nativeImage.createFromPath(join(app.getAppPath(), 'resources', 'icon.png'));
  if (!icon.isEmpty()) return icon.resize({ width: 48, height: 48 });
  return nativeImage.createFromBitmap(Buffer.alloc(32 * 32 * 4, 0x80), { width: 32, height: 32 });
}

/** Parses a single `bytes=a-b` range; null means serve the whole file. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = header?.match(/^bytes=(\d*)-(\d*)$/);
  if (!m || (!m[1] && !m[2])) return null;
  let start = m[1] ? Number(m[1]) : size - Number(m[2]);
  let end = m[1] && m[2] ? Number(m[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  return start <= end ? { start, end } : null;
}

export function registerMediaSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

/** `ardudeck-media://file/<name>` streams a gallery file, with byte ranges so the player can seek. */
export function setupMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.replace(/^\/+/, ''));
    const filePath = resolveName(name);
    if (!filePath) return new Response(null, { status: 404 });
    const size = statSync(filePath).size;
    const type = name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
    const range = parseRange(request.headers.get('range'), size);
    const { start, end } = range ?? { start: 0, end: size - 1 };
    const body = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream;
    const headers: Record<string, string> = {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    };
    if (range) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
    return new Response(body, { status: range ? 206 : 200, headers });
  });
}
