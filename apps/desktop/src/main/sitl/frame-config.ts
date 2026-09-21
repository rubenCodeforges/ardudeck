/**
 * SITL Frame Configuration — runtime fetch of ArduPilot's canonical
 * `vehicleinfo.py` so we always expose the upstream-defined frame list and
 * load the matching `default_params` files at launch.
 *
 * Mirrors Mission Planner's approach (see `MissionPlanner-ref/GCSViews/SITL.cs`
 * `GetDefaultConfig()` / `cleanupJson()`):
 *   1. Download `vehicleinfo.py` from upstream master, strip Python-isms,
 *      JSON-parse the dict literal.
 *   2. Per (vehicle, frame), the dict carries `default_params_filename` —
 *      either a single string or an array of relative paths under
 *      `Tools/autotest/`. Download each, concatenate into one combined
 *      file, return the local path.
 *   3. The caller passes that path to the SITL binary via `--defaults`,
 *      stacked behind our own ArduDeck overlay so user-tuned values win.
 *
 * Cached aggressively to userData so first-run latency is paid once per
 * machine and fully offline launches still work afterwards.
 */

import { app } from 'electron';
import { mkdir, readFile, writeFile, stat, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ArduPilotVehicleType } from '../../shared/ipc-channels.js';

// Upstream moved the vehicle/frame catalog from a Python dict literal in
// `pysim/vehicleinfo.py` to a plain JSON file in `pysim/vehicleinfo.json`.
// Newer ArduPilot trees only ship the JSON; the .py is now just a loader
// stub. Older branches (4.5.x and earlier) only have the .py. Try JSON
// first, fall back to .py with the brace-extract+python-to-json hack.
const VEHICLEINFO_JSON_URL =
  'https://raw.githubusercontent.com/ArduPilot/ardupilot/master/Tools/autotest/pysim/vehicleinfo.json';
const VEHICLEINFO_PY_URL =
  'https://raw.githubusercontent.com/ArduPilot/ardupilot/master/Tools/autotest/pysim/vehicleinfo.py';
const AUTOTEST_BASE_URL =
  'https://raw.githubusercontent.com/ArduPilot/ardupilot/master/Tools/autotest/';

/** Re-fetch upstream vehicleinfo.py if cached copy is older than this. */
const CACHE_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24h

// =============================================================================
// Types
// =============================================================================

export type FrameCategory =
  | 'Multirotor'
  | 'Helicopter'
  | 'Plane'
  | 'Quadplane'
  | 'Tailsitter'
  | 'Rover'
  | 'Boat'
  | 'Sub'
  | 'Other';

export interface SitlFrameInfo {
  /** Frame identifier passed to the SITL binary via -M. */
  value: string;
  /** Humanized label for the dropdown. */
  label: string;
  /** Vehicle type this frame belongs to (our 4 supported binaries). */
  vehicleType: ArduPilotVehicleType;
  /** UI grouping. */
  category: FrameCategory;
  /** Upstream `Tools/autotest/`-relative paths, in stack order. */
  defaultParamFiles: string[];
}

export interface SitlFramesResult {
  frames: SitlFrameInfo[];
  /** Where the data came from — surfaced in the UI. */
  source: 'fresh' | 'cached' | 'fallback';
  /** ISO timestamp of the underlying cache. */
  fetchedAt?: string;
  /** Set when source !== 'fresh' and a fetch attempt failed. */
  error?: string;
}

// =============================================================================
// Disk layout
// =============================================================================

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'sitl-frame-config');
}
function vehicleinfoPath(): string {
  return path.join(cacheDir(), 'vehicleinfo.py');
}
function vehicleinfoMetaPath(): string {
  return path.join(cacheDir(), 'vehicleinfo.meta.json');
}
function paramsCacheDir(): string {
  return path.join(cacheDir(), 'default_params');
}

// =============================================================================
// Fetch + cache
// =============================================================================

/**
 * Download the file at `url` and persist it to `dest`. Resolves to true on
 * success, false on any network or write failure (caller decides whether to
 * fall back to a cached copy).
 */
async function downloadTo(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const text = await res.text();
    await mkdir(path.dirname(dest), { recursive: true });
    await writeFile(dest, text, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

async function fileAge(p: string): Promise<number | null> {
  try {
    const st = await stat(p);
    return Date.now() - st.mtimeMs;
  } catch {
    return null;
  }
}

// =============================================================================
// Python → JSON cleanup
// =============================================================================

/**
 * Extract the outer `{...}` block from a Python source file using a
 * brace-balanced scan (handles nested dicts / arrays).
 */
function extractOuterBraces(text: string): string | null {
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && start !== -1) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Normalise a Python dict literal into JSON-parseable text. Mirrors the
 * Mission Planner cleanup; we go a bit further because vehicleinfo.py has
 * trailing commas and single-quoted strings in places.
 */
function pythonToJson(py: string): string {
  // Strip `# ...` comments to end-of-line. Done first so quoted `#` survives.
  let out = py.replace(/(^|[^"'])#[^\n]*/g, (_, prefix) => prefix);

  // True/False/None -> true/false/null (whole-word).
  out = out.replace(/\bTrue\b/g, 'true');
  out = out.replace(/\bFalse\b/g, 'false');
  out = out.replace(/\bNone\b/g, 'null');

  // Single-quoted strings -> double-quoted. Naive (doesn't handle escapes
  // inside) but vehicleinfo.py's strings are paths/identifiers without quotes.
  out = out.replace(/'([^'\\]*)'/g, '"$1"');

  // Trailing commas before `}` or `]`.
  out = out.replace(/,(\s*[}\]])/g, '$1');

  return out;
}

// =============================================================================
// vehicleinfo.py parsing
// =============================================================================

interface RawVehicleInfo {
  [vehicleKey: string]: {
    default_frame?: string;
    frames?: Record<string, {
      default_params_filename?: string | string[];
      waf_target?: string;
    }>;
  };
}

/**
 * Map upstream vehicle keys → our internal vehicle type. Frames under the
 * `Helicopter` key actually run on the ArduCopter binary, so they collapse
 * onto `copter`. Blimp / AntennaTracker are dropped — we don't ship those
 * binaries.
 */
function vehicleKeyToType(key: string): ArduPilotVehicleType | null {
  switch (key) {
    case 'ArduCopter':
    case 'Helicopter':
      return 'copter';
    case 'ArduPlane':
      return 'plane';
    case 'Rover':
    case 'APMrover2':
      return 'rover';
    case 'ArduSub':
      return 'sub';
    default:
      return null;
  }
}

/**
 * Frames that need `sim_vehicle.py`'s wrapping (external simulators, build
 * tooling) — passing their name directly via `-M` to a standalone SITL binary
 * either does nothing useful or hard-crashes. We hide them from the catalog
 * entirely; users with these workflows aren't using our launcher anyway.
 */
const EXTERNAL_SIM_DENYLIST: ReadonlySet<string> = new Set([
  'jsbsim', 'xplane', 'last_letter', 'CRRCSim',
  'gazebo-zephyr', 'scrimmage-plane', 'scrimmage-copter',
  'calibration', 'stratoblimp',
]);

/**
 * `default_params_filename` arrays sometimes include non-param files like
 * `models/plane.parm` — those carry aerodynamic SITL-only params that aren't
 * safe to feed a stable plane binary. We only stack files under
 * `default_params/` to stay aligned with what `sim_vehicle.py --defaults`
 * actually loads at runtime.
 */
function isLoadableParamFile(relPath: string): boolean {
  return relPath.startsWith('default_params/');
}

/**
 * True for frames whose lift comes from rotors the fixed-wing model does not
 * know about. ArduDeck's own physics engine has copter, plane and rover models
 * and no VTOL one, so these have to fly on ArduPilot's built-in physics.
 */
export function isVtolFrame(frameName: string, vehicleType: ArduPilotVehicleType): boolean {
  const c = categorize(frameName, vehicleType);
  return c === 'Quadplane' || c === 'Tailsitter';
}

function categorize(frameName: string, vehicleType: ArduPilotVehicleType): FrameCategory {
  const n = frameName.toLowerCase();
  if (vehicleType === 'copter') {
    if (n.startsWith('heli')) return 'Helicopter';
    return 'Multirotor';
  }
  if (vehicleType === 'plane') {
    if (n === 'tailsitter' || n.includes('tailsitter')) return 'Tailsitter';
    if (n.startsWith('quadplane') || n === 'firefly') return 'Quadplane';
    return 'Plane';
  }
  if (vehicleType === 'rover') {
    if (/^(boat|sailboat|motorboat)/.test(n) || n.includes('boat')) return 'Boat';
    return 'Rover';
  }
  if (vehicleType === 'sub') return 'Sub';
  return 'Other';
}

function humanize(name: string): string {
  // "quadplane-tilthvec" -> "Quadplane (Tilt H-Vec)" style — keep it simple
  // and predictable: capitalize, replace dashes with spaces.
  return name
    .split('-')
    .map(p => (p.length > 0 ? p[0]!.toUpperCase() + p.slice(1) : p))
    .join(' ');
}

/**
 * Parse the catalog from either format. JSON gets a direct parse; .py gets
 * the brace-extract + python-to-json conversion. We sniff by content rather
 * than relying on the URL because either source ends up in the same disk
 * cache file.
 */
function parseFrames(rawText: string): SitlFrameInfo[] {
  const trimmed = rawText.trimStart();
  let parsed: RawVehicleInfo;
  if (trimmed.startsWith('{')) {
    // Pure JSON path (current upstream).
    try {
      parsed = JSON.parse(rawText) as RawVehicleInfo;
    } catch (err) {
      throw new Error(
        `vehicleinfo.json parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    // Legacy Python dict literal (older ArduPilot branches).
    const block = extractOuterBraces(rawText);
    if (!block) throw new Error('vehicleinfo: no top-level dict found');
    const json = pythonToJson(block);
    try {
      parsed = JSON.parse(json) as RawVehicleInfo;
    } catch (err) {
      throw new Error(
        `vehicleinfo.py JSON parse failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const frames: SitlFrameInfo[] = [];
  const seen = new Map<string, true>(); // key: vehicleType + ":" + value

  for (const [vehicleKey, vehicleEntry] of Object.entries(parsed)) {
    const vehicleType = vehicleKeyToType(vehicleKey);
    if (!vehicleType) continue;
    const frameDict = vehicleEntry.frames;
    if (!frameDict) continue;
    for (const [frameName, frameEntry] of Object.entries(frameDict)) {
      if (EXTERNAL_SIM_DENYLIST.has(frameName)) continue;
      const dedupeKey = `${vehicleType}:${frameName}`;
      if (seen.has(dedupeKey)) continue;
      seen.set(dedupeKey, true);
      const raw = frameEntry.default_params_filename;
      const allFiles = Array.isArray(raw)
        ? raw.filter((s): s is string => typeof s === 'string')
        : typeof raw === 'string' ? [raw] : [];
      // Only keep entries under default_params/ — `models/*.parm` carry
      // aero/SIM-only params that can SIGILL a release binary.
      const defaultParamFiles = allFiles.filter(isLoadableParamFile);
      frames.push({
        value: frameName,
        label: humanize(frameName),
        vehicleType,
        category: categorize(frameName, vehicleType),
        defaultParamFiles,
      });
    }
  }
  return frames.sort((a, b) => {
    if (a.vehicleType !== b.vehicleType) return a.vehicleType.localeCompare(b.vehicleType);
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.label.localeCompare(b.label);
  });
}

// =============================================================================
// Fallback (offline-first launch)
// =============================================================================

/**
 * Hardcoded baseline so the dropdown is never empty on first boot before the
 * upstream fetch lands. Intentionally small — covers each vehicle's default
 * frame so a user can hit Start immediately.
 */
const FALLBACK_FRAMES: SitlFrameInfo[] = [
  { value: 'quad',         label: 'Quad (default)',  vehicleType: 'copter', category: 'Multirotor', defaultParamFiles: ['default_params/copter.parm'] },
  { value: '+',            label: 'Quad Plus',        vehicleType: 'copter', category: 'Multirotor', defaultParamFiles: ['default_params/copter.parm'] },
  { value: 'hexa',         label: 'Hexacopter',       vehicleType: 'copter', category: 'Multirotor', defaultParamFiles: ['default_params/copter.parm'] },
  { value: 'octa',         label: 'Octocopter',       vehicleType: 'copter', category: 'Multirotor', defaultParamFiles: ['default_params/copter.parm'] },
  { value: 'tri',          label: 'Tricopter',        vehicleType: 'copter', category: 'Multirotor', defaultParamFiles: ['default_params/copter.parm'] },
  { value: 'heli',         label: 'Helicopter',       vehicleType: 'copter', category: 'Helicopter', defaultParamFiles: ['default_params/copter-heli.parm'] },
  { value: 'plane',        label: 'Plane (default)',  vehicleType: 'plane',  category: 'Plane',      defaultParamFiles: ['default_params/plane.parm'] },
  { value: 'quadplane',    label: 'Quadplane',        vehicleType: 'plane',  category: 'Quadplane',  defaultParamFiles: ['default_params/quadplane.parm'] },
  { value: 'plane-tailsitter', label: 'Plane Tailsitter', vehicleType: 'plane', category: 'Tailsitter', defaultParamFiles: ['default_params/plane-tailsitter.parm'] },
  { value: 'firefly',      label: 'Firefly (Y6 VTOL)',vehicleType: 'plane',  category: 'Quadplane',  defaultParamFiles: ['default_params/firefly.parm'] },
  { value: 'rover',        label: 'Rover (default)',  vehicleType: 'rover',  category: 'Rover',      defaultParamFiles: ['default_params/rover.parm'] },
  { value: 'rover-skid',   label: 'Skid Steer Rover', vehicleType: 'rover',  category: 'Rover',      defaultParamFiles: ['default_params/rover-skid.parm'] },
  { value: 'motorboat',    label: 'Motor Boat',       vehicleType: 'rover',  category: 'Boat',       defaultParamFiles: ['default_params/motorboat.parm'] },
  { value: 'sailboat',     label: 'Sailboat',         vehicleType: 'rover',  category: 'Boat',       defaultParamFiles: ['default_params/sailboat.parm'] },
  { value: 'vectored',     label: 'Vectored (default)', vehicleType: 'sub',  category: 'Sub',        defaultParamFiles: ['default_params/sub.parm'] },
  { value: 'vectored_6dof',label: 'Vectored 6DOF',    vehicleType: 'sub',    category: 'Sub',        defaultParamFiles: ['default_params/sub-6dof.parm'] },
];

// =============================================================================
// Public API
// =============================================================================

let inMemoryCache: SitlFramesResult | null = null;

/**
 * One-shot cleanup of broken combined files generated by older app versions
 * (those with `# === models/*.parm ===` banners that SIGILL the binary).
 * Also drops a vehicleinfo cache file that's the new Python loader stub —
 * upstream moved the dict literal to vehicleinfo.json, so any cached .py
 * starting with "# flake8" or import statements has zero usable frames.
 * Runs once per process on the first listFrames() call.
 */
let cleanupRan = false;
async function cleanupLegacyCombinedFiles(): Promise<void> {
  if (cleanupRan) return;
  cleanupRan = true;
  try {
    const dir = paramsCacheDir();
    const entries = await readdir(dir).catch(() => [] as string[]);
    await Promise.all(
      entries
        .filter(name => name.startsWith('_combined-') && name.endsWith('.parm'))
        .map(name => unlink(path.join(dir, name)).catch(() => {})),
    );
  } catch { /* best-effort */ }
  // Cached vehicleinfo that points at the loader stub yields an empty
  // catalog. Detect and drop so the next listFrames re-fetches the JSON.
  try {
    const head = (await readFile(vehicleinfoPath(), 'utf-8')).slice(0, 200).trimStart();
    const looksLikeStub = head.startsWith('# ') || head.startsWith('"""') || head.startsWith('import ');
    if (looksLikeStub) await unlink(vehicleinfoPath()).catch(() => {});
  } catch { /* no cache, nothing to drop */ }
}

/**
 * Return the current frame catalog. Strategy:
 *   - If we have a fresh in-memory copy AND the on-disk cache is younger than
 *     `CACHE_FRESHNESS_MS`, return that (no network).
 *   - Else attempt a fresh fetch. On success, parse + cache + return 'fresh'.
 *   - Else if we have ANY on-disk cache, parse + return 'cached'.
 *   - Else return the hardcoded fallback list with the network error attached.
 */
export async function listFrames(opts: { force?: boolean } = {}): Promise<SitlFramesResult> {
  await cleanupLegacyCombinedFiles();

  if (!opts.force && inMemoryCache) {
    const ageOnDisk = await fileAge(vehicleinfoPath());
    if (ageOnDisk !== null && ageOnDisk < CACHE_FRESHNESS_MS) return inMemoryCache;
  }

  await mkdir(cacheDir(), { recursive: true });
  const targetPath = vehicleinfoPath();
  const ageOnDisk = await fileAge(targetPath);
  const needsFetch = opts.force || ageOnDisk === null || ageOnDisk >= CACHE_FRESHNESS_MS;

  let fetchError: string | undefined;
  if (needsFetch) {
    // Prefer the new JSON file; only fall back to the .py loader stub when
    // the JSON URL 404s (older ArduPilot branches that haven't migrated).
    let ok = await downloadTo(VEHICLEINFO_JSON_URL, targetPath);
    if (!ok) ok = await downloadTo(VEHICLEINFO_PY_URL, targetPath);
    if (ok) {
      await writeFile(vehicleinfoMetaPath(), JSON.stringify({ fetchedAt: new Date().toISOString() }), 'utf-8');
    } else {
      fetchError = `Could not reach upstream vehicleinfo (json or py)`;
    }
  }

  // Try the cached copy (fresh or stale) first.
  try {
    const text = await readFile(targetPath, 'utf-8');
    const frames = parseFrames(text);
    let fetchedAt: string | undefined;
    try {
      const meta = JSON.parse(await readFile(vehicleinfoMetaPath(), 'utf-8')) as { fetchedAt?: string };
      fetchedAt = meta.fetchedAt;
    } catch { /* meta missing — treat as unknown */ }
    const result: SitlFramesResult = {
      frames,
      source: fetchError ? 'cached' : 'fresh',
      fetchedAt,
      ...(fetchError ? { error: fetchError } : {}),
    };
    inMemoryCache = result;
    return result;
  } catch (err) {
    return {
      frames: FALLBACK_FRAMES,
      source: 'fallback',
      error: fetchError ?? (err instanceof Error ? err.message : String(err)),
    };
  }
}

/**
 * For a (vehicleType, model) pair, resolve the upstream `default_params/*.parm`
 * file(s). When the entry is an array, download each in order, concatenate
 * (later files override earlier — same semantics as ArduPilot's own loader)
 * and write to a single combined file in the per-app cache. Return that
 * local path, or null when we can't produce one (no entry, all downloads
 * failed, etc.) — caller falls back to its own param overlay.
 */
export async function resolveDefaultsFile(
  vehicleType: ArduPilotVehicleType,
  model: string,
): Promise<string | null> {
  const catalog = await listFrames();
  const entry = catalog.frames.find(f => f.vehicleType === vehicleType && f.value === model);
  if (!entry || entry.defaultParamFiles.length === 0) return null;

  await mkdir(paramsCacheDir(), { recursive: true });

  // Single file: download to its mirrored relative path; return that.
  if (entry.defaultParamFiles.length === 1) {
    const rel = entry.defaultParamFiles[0]!;
    const dest = path.join(paramsCacheDir(), rel);
    if (!(await fileAge(dest))) {
      const ok = await downloadTo(AUTOTEST_BASE_URL + rel, dest);
      if (!ok) return null;
    }
    return dest;
  }

  // Multiple: concat in order to a deterministic combined file. Output is
  // raw `PARAM VALUE` lines only — no banner comments, no provenance markers,
  // no blank lines between sections. ArduPilot's defaults parser is line-
  // based and conservative; anything else has been observed to SIGILL the
  // binary mid-init on macOS ARM64 stable builds.
  // Filename uses a `combo-` prefix (no leading underscore) so any older
  // `_combined-*.parm` files left in the cache by previous app versions
  // become orphans and get bypassed even if they're still on disk.
  const combinedLines: string[] = [];
  for (const rel of entry.defaultParamFiles) {
    const dest = path.join(paramsCacheDir(), rel);
    if (!(await fileAge(dest))) {
      const ok = await downloadTo(AUTOTEST_BASE_URL + rel, dest);
      if (!ok) return null;
    }
    try {
      const content = await readFile(dest, 'utf-8');
      for (const rawLine of content.split('\n')) {
        const line = rawLine.trim();
        if (line.length === 0) continue;
        if (line.startsWith('#')) continue;
        combinedLines.push(line);
      }
    } catch {
      return null;
    }
  }
  if (combinedLines.length === 0) return null;
  const combinedPath = path.join(
    paramsCacheDir(),
    `combo-${vehicleType}-${model.replace(/[^a-z0-9_-]/gi, '_')}.parm`,
  );
  await writeFile(combinedPath, combinedLines.join('\n') + '\n', 'utf-8');
  return combinedPath;
}
