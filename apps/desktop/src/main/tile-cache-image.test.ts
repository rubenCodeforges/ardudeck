import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = new Map<string, Buffer>();
const unlinked: string[] = [];

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/ardudeck-test' },
  protocol: { handle: vi.fn() },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  BrowserWindow: { getAllWindows: () => [] },
}));
vi.mock('electron-store', () => ({
  default: class {
    private data: Record<string, unknown>;
    constructor(opts: { defaults?: Record<string, unknown> }) { this.data = { ...(opts?.defaults ?? {}) }; }
    get(k: string) { return this.data[k]; }
    set(k: string, v: unknown) { this.data[k] = v; }
  },
}));
vi.mock('fs/promises', () => ({
  readFile: vi.fn(async (p: string) => {
    const b = files.get(p);
    if (!b) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return b;
  }),
  writeFile: vi.fn(async (p: string, b: Buffer) => { files.set(p, b); }),
  mkdir: vi.fn(async () => undefined),
  unlink: vi.fn(async (p: string) => { unlinked.push(p); files.delete(p); }),
  readdir: vi.fn(async () => []),
  stat: vi.fn(async () => ({ size: 0 })),
}));
vi.mock('./overlays/overlay-ipc-handlers.js', () => ({ getApiKey: () => null }));

import { isImageBytes } from './tile-image';
import { resolveTileBytes } from './tile-cache';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
const HTML = Buffer.from('<html><body>Too Many Requests</body></html>');

beforeEach(() => {
  files.clear();
  unlinked.length = 0;
  vi.unstubAllGlobals();
});

describe('isImageBytes', () => {
  it('accepts PNG, JPEG, GIF and WebP and rejects error pages and empty bodies', () => {
    expect(isImageBytes(PNG)).toBe(true);
    expect(isImageBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe(true);
    expect(isImageBytes(Buffer.from('GIF89a\0\0'))).toBe(true);
    expect(isImageBytes(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toBe(true);
    expect(isImageBytes(HTML)).toBe(false);
    expect(isImageBytes(Buffer.alloc(0))).toBe(false);
  });
});

describe('resolveTileBytes', () => {
  it('turns a 200 error page into a transparent tile and never caches it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(HTML, { status: 200 })));
    const res = await resolveTileBytes('tile-cache://osm/5/10/12.png');
    expect(res.status).toBe(200);
    expect(isImageBytes(new Uint8Array(res.body!))).toBe(true);
    expect(Buffer.from(res.body!).equals(HTML)).toBe(false);
    await new Promise((r) => setTimeout(r, 0));
    expect(files.size).toBe(0);
  });

  it('drops a corrupt cached tile and fetches it again', async () => {
    files.set('/tmp/ardudeck-test/tile-cache/osm/5/10/12.png', HTML);
    const fetchMock = vi.fn(async () => new Response(PNG, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const res = await resolveTileBytes('tile-cache://osm/5/10/12.png');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(Buffer.from(res.body!).equals(PNG)).toBe(true);
    expect(unlinked).toEqual(['/tmp/ardudeck-test/tile-cache/osm/5/10/12.png']);
  });

  it('serves a valid cached tile without the network', async () => {
    files.set('/tmp/ardudeck-test/tile-cache/osm/5/10/12.png', PNG);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await resolveTileBytes('tile-cache://osm/5/10/12.png');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(Buffer.from(res.body!).equals(PNG)).toBe(true);
  });
});
