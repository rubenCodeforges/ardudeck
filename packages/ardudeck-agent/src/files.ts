// files.ts
import fs from 'fs/promises';
import path from 'path';
import type { FileEntry } from '@ardudeck/companion-types';

export function resolveSafePath(root: string, requestedPath: string): string {
  const resolved = path.resolve(root, requestedPath.replace(/^\//, ''));
  if (!resolved.startsWith(root)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}

export async function listDirectory(
  root: string,
  dirPath: string
): Promise<FileEntry[]> {
  const safePath = resolveSafePath(root, dirPath);
  const entries = await fs.readdir(safePath, { withFileTypes: true });

  const results: FileEntry[] = [];
  for (const entry of entries) {
    try {
      const fullPath = path.join(safePath, entry.name);
      const stat = await fs.stat(fullPath);
      results.push({
        name: entry.name,
        path: '/' + path.relative(root, fullPath),
        isDirectory: entry.isDirectory(),
        size: stat.size,
        modified: stat.mtimeMs,
      });
    } catch {
      // Skip entries we can't stat (permission issues)
    }
  }
  return results.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function readFile(
  root: string,
  filePath: string
): Promise<Buffer> {
  const safePath = resolveSafePath(root, filePath);
  return fs.readFile(safePath);
}

export async function writeFile(
  root: string,
  filePath: string,
  data: Buffer
): Promise<void> {
  const safePath = resolveSafePath(root, filePath);
  const dir = path.dirname(safePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(safePath, data);
}
