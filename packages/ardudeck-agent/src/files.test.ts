// files.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { listDirectory, readFile, writeFile, resolveSafePath } from './files';

const testRoot = path.join(os.tmpdir(), 'ardudeck-files-test');

beforeEach(() => {
  fs.mkdirSync(testRoot, { recursive: true });
  fs.writeFileSync(path.join(testRoot, 'test.txt'), 'hello');
  fs.mkdirSync(path.join(testRoot, 'subdir'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testRoot, { recursive: true, force: true });
});

describe('files', () => {
  it('lists directory contents', async () => {
    const entries = await listDirectory(testRoot, '/');
    expect(entries.length).toBe(2);
    const names = entries.map(e => e.name).sort();
    expect(names).toEqual(['subdir', 'test.txt']);
  });

  it('reads a file', async () => {
    const content = await readFile(testRoot, '/test.txt');
    expect(content.toString()).toBe('hello');
  });

  it('writes a file', async () => {
    await writeFile(testRoot, '/new.txt', Buffer.from('world'));
    expect(fs.readFileSync(path.join(testRoot, 'new.txt'), 'utf-8')).toBe('world');
  });

  it('rejects path traversal', () => {
    expect(() => resolveSafePath(testRoot, '../../etc/passwd')).toThrow('Path traversal');
  });

  it('rejects absolute paths outside root', () => {
    expect(() => resolveSafePath(testRoot, '/etc/passwd')).toThrow('Path traversal');
  });
});
