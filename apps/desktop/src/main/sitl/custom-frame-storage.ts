/**
 * SITL Custom Frame Storage
 *
 * Save/load user-authored JSON frame files in `userData/sitl-frames/`. Files
 * are named `<id>.json` where id is a slug derived from the user-supplied
 * name. Imports copy the source JSON into our directory; exports write to a
 * user-chosen path.
 */

import { app, dialog } from 'electron';
import { mkdir, readFile, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  validateFrame,
  type SitlCustomFrame,
  type SitlCustomFrameRecord,
  type SitlCustomFrameMeta,
} from '../../shared/sitl-custom-frame.js';
import { t } from '../../shared/i18n/index.js';

const FRAMES_DIR = () => path.join(app.getPath('userData'), 'sitl-frames');

/**
 * Filename (not path) used for the active custom frame staged into SITL's cwd.
 *
 * Why this is so awkward: ArduPilot's `AP_Filesystem_Posix::stat()` on SITL
 * runs every path through `map_filename()`, which **strips the leading `/`**
 * on SITL builds. So an absolute path like `/tmp/foo.json` becomes the
 * relative path `tmp/foo.json`, which SITL then resolves against its current
 * working directory (the binary's parent). That file isn't there, stat fails,
 * `Frame::load_frame_params()` panics with "<path> failed to load".
 *
 * Workaround: stage the file directly INSIDE SITL's cwd (the binary dir),
 * and pass it as a plain filename. After map_filename strips the (non-
 * existent) leading slash and resolves against cwd, it lands on the staged
 * file. The binary dir on macOS contains spaces and `@`, but native fopen
 * handles those fine — only ArduPilot's homegrown path translation does not.
 */
const STAGED_FRAME_FILENAME = 'ardudeck-sitl-frame.json';

/**
 * Stage a custom frame for SITL launch. Writes the frame JSON (with our
 * metadata fields stripped) to `<sitlCwd>/${STAGED_FRAME_FILENAME}` and
 * returns the bare filename for the SITL `-M<type>:<filename>` argument.
 *
 * `sitlCwd` should be the working directory the SITL process will be spawned
 * with (typically the directory containing the `arducopter` binary).
 */
export async function stageFrameForLaunch(sourceId: string, sitlCwd: string): Promise<string | null> {
  const record = await loadCustomFrame(sourceId);
  if (!record) return null;
  const dest = path.join(sitlCwd, STAGED_FRAME_FILENAME);
  await writeFile(dest, JSON.stringify(record.frame, null, 2), 'utf-8');
  return STAGED_FRAME_FILENAME;
}

/**
 * Same as above but takes an absolute frame path. Used when the renderer
 * already activated a frame and only knows its userData path. We re-read,
 * strip metadata, and stage into SITL's cwd. Returns the bare filename.
 */
export async function stageFramePathForLaunch(sourcePath: string, sitlCwd: string): Promise<string | null> {
  try {
    const raw = await readFile(sourcePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validation = validateFrame(stripMeta(parsed));
    if (!validation.ok) return null;
    const dest = path.join(sitlCwd, STAGED_FRAME_FILENAME);
    await writeFile(dest, JSON.stringify(validation.frame, null, 2), 'utf-8');
    return STAGED_FRAME_FILENAME;
  } catch {
    return null;
  }
}

async function ensureDir(): Promise<string> {
  const dir = FRAMES_DIR();
  await mkdir(dir, { recursive: true });
  return dir;
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64) || 'frame';
}

export async function listCustomFrames(): Promise<SitlCustomFrameMeta[]> {
  const dir = await ensureDir();
  const entries = await readdir(dir);
  const out: SitlCustomFrameMeta[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const fullPath = path.join(dir, entry);
    try {
      const st = await stat(fullPath);
      const id = entry.replace(/\.json$/, '');
      // Read just enough to surface the display name; cheap.
      const raw = await readFile(fullPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const name = typeof parsed.__ardudeck_name === 'string' ? parsed.__ardudeck_name : id;
      out.push({ id, name, updatedAt: st.mtime.toISOString(), path: fullPath });
    } catch {
      // skip corrupt entries
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCustomFrame(id: string): Promise<SitlCustomFrameRecord | null> {
  const dir = await ensureDir();
  const file = path.join(dir, `${id}.json`);
  try {
    const raw = await readFile(file, 'utf-8');
    const parsed = JSON.parse(raw);
    const validation = validateFrame(stripMeta(parsed));
    if (!validation.ok) return null;
    const st = await stat(file);
    const name = typeof parsed.__ardudeck_name === 'string' ? parsed.__ardudeck_name : id;
    return {
      id,
      name,
      updatedAt: st.mtime.toISOString(),
      path: file,
      frame: validation.frame,
    };
  } catch {
    return null;
  }
}

/**
 * Save (create or update) a frame. Returns the meta record. The file on disk
 * carries the user's display name in a __ardudeck_name field (ignored by SITL,
 * which only reads the documented physics fields).
 */
export async function saveCustomFrame(name: string, frame: SitlCustomFrame, existingId?: string): Promise<SitlCustomFrameRecord> {
  const dir = await ensureDir();
  const id = existingId || slugify(name);
  const file = path.join(dir, `${id}.json`);
  const payload = { __ardudeck_name: name, ...frame };
  await writeFile(file, JSON.stringify(payload, null, 2), 'utf-8');
  const st = await stat(file);
  return { id, name, updatedAt: st.mtime.toISOString(), path: file, frame };
}

export async function deleteCustomFrame(id: string): Promise<boolean> {
  const dir = await ensureDir();
  const file = path.join(dir, `${id}.json`);
  try {
    await unlink(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Open file dialog → read selected JSON → validate → save under our directory.
 * Returns the saved record, or an error string for the renderer.
 */
export async function importCustomFrame(): Promise<{ ok: true; record: SitlCustomFrameRecord } | { ok: false; error: string }> {
  const result = await dialog.showOpenDialog({
    title: t('main:sitl.importFrameTitle'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, error: 'cancelled' };
  }
  const sourcePath = result.filePaths[0];
  if (!sourcePath) return { ok: false, error: 'cancelled' };
  try {
    const raw = await readFile(sourcePath, 'utf-8');
    const parsed = JSON.parse(raw);
    const validation = validateFrame(stripMeta(parsed));
    if (!validation.ok) {
      return { ok: false, error: t('main:sitl.invalidFrame', { errors: validation.errors.join(', ') }) };
    }
    const baseName = path.basename(sourcePath, '.json');
    const displayName = typeof parsed.__ardudeck_name === 'string' ? parsed.__ardudeck_name : baseName;
    const record = await saveCustomFrame(displayName, validation.frame);
    return { ok: true, record };
  } catch (err) {
    const message = err instanceof Error ? err.message : t('common:unknownError');
    return { ok: false, error: t('main:sitl.readFileFailed', { message }) };
  }
}

/**
 * Save dialog → write the requested frame to user-chosen path. Strips our
 * internal __ardudeck_name field so the exported JSON is a pure ArduPilot
 * frame file usable directly via --model.
 */
export async function exportCustomFrame(id: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const record = await loadCustomFrame(id);
  if (!record) return { ok: false, error: t('main:sitl.frameNotFound') };
  const result = await dialog.showSaveDialog({
    title: t('main:sitl.exportFrameTitle'),
    defaultPath: `${record.id}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) {
    return { ok: false, error: 'cancelled' };
  }
  try {
    await writeFile(result.filePath, JSON.stringify(record.frame, null, 2), 'utf-8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : t('common:unknownError');
    return { ok: false, error: t('main:sitl.writeFileFailed', { message }) };
  }
}

function stripMeta<T extends Record<string, unknown>>(obj: T): Omit<T, '__ardudeck_name'> {
  const { __ardudeck_name: _, ...rest } = obj;
  return rest;
}
