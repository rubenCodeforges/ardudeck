import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, utimesSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('electron', () => ({ app: { getPath: () => '/nonexistent' }, nativeImage: {}, protocol: {} }));

const { listMediaIn, parseRange } = await import('./media-library');

let root: string;
beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ardudeck-media-'));
  mkdirSync(join(root, 'videos'));
  mkdirSync(join(root, 'photos'));
  const put = (dir: string, name: string, bytes: number, ageSec: number) => {
    const p = join(root, dir, name);
    writeFileSync(p, Buffer.alloc(bytes));
    const t = Date.now() / 1000 - ageSec;
    utimesSync(p, t, t);
  };
  put('videos', 'recording_2026-10-01_10-00-00.mp4', 5000, 300);
  put('photos', 'snapshot_2026-10-01_10-05-00.jpg', 200, 60);
  put('videos', 'holiday.mp4', 10, 0);
  put('photos', 'recording_2026-10-01_10-00-00.mp4', 1, 0);
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

describe('media gallery listing', () => {
  it('lists only files the app wrote, newest first, each name once', () => {
    const items = listMediaIn([join(root, 'videos'), join(root, 'photos'), join(root, 'missing')]);
    expect(items.map((i) => [i.name, i.kind, i.size])).toEqual([
      ['snapshot_2026-10-01_10-05-00.jpg', 'photo', 200],
      ['recording_2026-10-01_10-00-00.mp4', 'video', 5000],
    ]);
  });
});

describe('byte ranges for the player', () => {
  it('serves what the video element asks for when it seeks', () => {
    expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 });
    expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 });
    expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
  });

  it('falls back to the whole file for no range or one it cannot satisfy', () => {
    expect(parseRange(null, 1000)).toBeNull();
    expect(parseRange('bytes=2000-', 1000)).toBeNull();
    expect(parseRange('bytes=0-1,5-6', 1000)).toBeNull();
  });
});
