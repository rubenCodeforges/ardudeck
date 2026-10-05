import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ParamCache } from './param-cache.js';

describe('ParamCache', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'linkd-params-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  const params = [
    { paramId: 'A', paramValue: 1, paramType: 9, paramIndex: 0 },
    { paramId: 'B', paramValue: 2, paramType: 9, paramIndex: 1 },
  ];

  it('reports a full download as complete and persists it', () => {
    const cache = new ParamCache(dir);
    cache.replaceAll('board1', params, 2, 'ftp', '4.7.1', 1000);
    expect(cache.get('board1')).toMatchObject({ complete: true, paramCount: 2, source: 'ftp', fetchedAt: 1000 });
    cache.flush();
    const reloaded = new ParamCache(dir).get('board1');
    expect(reloaded?.params.map((p) => p.paramId)).toEqual(['A', 'B']);
    expect(reloaded?.firmwareVersion).toBe('4.7.1');
  });

  it('applies live PARAM_VALUE updates and keeps the index for PARAM_SET echoes', () => {
    const cache = new ParamCache(dir);
    cache.replaceAll('board1', params, 2, 'list', null);
    cache.applyValue('board1', { paramId: 'B', paramValue: 5, paramType: 9, paramIndex: 0xffff, paramCount: 0xffff }, null);
    const b = cache.get('board1')!.params.find((p) => p.paramId === 'B')!;
    expect(b).toMatchObject({ paramValue: 5, paramIndex: 1 });
    expect(cache.get('board1')!.complete).toBe(true);
  });

  it('builds a partial snapshot from the stream and lists what is missing', () => {
    const cache = new ParamCache(dir);
    cache.applyValue('board2', { paramId: 'A', paramValue: 1, paramType: 9, paramIndex: 0, paramCount: 3 }, null);
    cache.applyValue('board2', { paramId: 'C', paramValue: 3, paramType: 9, paramIndex: 2, paramCount: 3 }, null);
    expect(cache.get('board2')).toMatchObject({ complete: false, source: 'stream', fetchedAt: null });
    expect(cache.missingIndices('board2')).toEqual([1]);
  });

  it('returns null for an unknown vehicle', () => {
    expect(new ParamCache(dir).get('nope')).toBeNull();
  });
});
