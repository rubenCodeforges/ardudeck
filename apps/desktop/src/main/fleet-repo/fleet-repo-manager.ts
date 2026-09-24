/**
 * Fleet vault: a local-first git repository holding parameter snapshots,
 * missions and survey areas, optionally synced to a GitHub repo the app
 * creates for the user.
 *
 * Layout:
 *   units/<uid>/params.param    full parameter dump per flight controller
 *   units/<uid>/meta.json       board name, vehicle type, last snapshot info
 *   models/<model>/golden.param manufacturer baseline (v2, layout reserved)
 *   roles/<role>.param          operation overlays (v2, layout reserved)
 *   sites/<site>/boundary.kml   area editor boundary
 *   sites/<site>/missions/*.waypoints
 *
 * All git operations run through isomorphic-git (pure JS, no git binary).
 * GitHub is plain `origin` over HTTPS with an OAuth device-flow token.
 */
import { app, safeStorage, shell } from 'electron';
import { join, dirname } from 'path';
import { promises as fsp } from 'fs';
import * as fs from 'fs';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import Store from 'electron-store';
import { formatParamFile } from '../../shared/param-file';
import { isSurveyDocument, type SurveyDocument } from '../../shared/survey-document-types';
import type { VaultMission, VaultSurveyArea } from '../../shared/ipc-channels';
import { isStoredMission, type StoredMission } from '../../shared/mission-library-types';
import { syncErrorMessage } from './sync-error.js';

// ArduDeck community OAuth app (device flow enabled, no client secret needed).
// Overridable for development.
const GITHUB_CLIENT_ID = process.env.ARDUDECK_GITHUB_CLIENT_ID ?? 'Ov23liIeHUaZ6cgzSmvh';

const BRANCH = 'main';
const COMMITTER = { name: 'ArduDeck', email: 'vault@ardudeck.app' };

// ── Types (mirrored in shared/ipc-channels.ts) ──────────────────

export interface FleetRepoStatus {
  path: string;
  initialized: boolean;
  commitCount: number;
  /** Push automatically after every snapshot */
  autoSync: boolean;
  github: {
    connected: boolean;
    /** 'github' = app-managed repo; 'custom' = user-provided HTTPS remote */
    mode: 'github' | 'custom';
    login?: string;
    /** Repo name (github mode) or remote URL (custom mode) */
    repo?: string;
    lastSyncAt?: number;
    lastSyncError?: string;
  };
}

export interface FleetRepoHistoryEntry {
  oid: string;
  message: string;
  timestamp: number;
  /** Repo-relative paths this commit touched (vs first parent) */
  files: string[];
}

export interface FleetRepoUnit {
  uid: string;
  name: string;
  vehicleType?: string;
  sitl?: boolean;
  /** Additional board ids that map to this unit (identity scheme changes, replaced FC) */
  aliases?: string[];
  lastSnapshotAt?: number;
  paramCount?: number;
}

export interface FleetRepoSite {
  site: string;
  hasBoundary: boolean;
  missions: string[];
}

export interface GithubDeviceStart {
  userCode: string;
  verificationUri: string;
  interval: number;
  deviceCode: string;
}

interface VaultStoreSchema {
  encryptedToken?: string;
  login?: string;
  repoName?: string;
  lastSyncAt?: number;
  /** 'github' = app-managed GitHub repo; 'custom' = user-provided HTTPS remote */
  remoteMode?: 'github' | 'custom';
  /** Custom mode only: the HTTPS remote URL */
  remoteUrl?: string;
  /** Custom mode only: username sent with the token (host-dependent) */
  remoteUsername?: string;
  /** Push to the remote automatically after every snapshot */
  autoSync?: boolean;
}

// ── State ───────────────────────────────────────────────────────

const vaultStore = new Store<VaultStoreSchema>({ name: 'fleet-vault' });

function repoDir(): string {
  return join(app.getPath('home'), '.ardudeck', 'fleet-repo');
}

function getToken(): string | null {
  const enc = vaultStore.get('encryptedToken');
  if (!enc) return null;
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return null;
  }
}

function setToken(token: string | null): void {
  if (token === null) {
    vaultStore.delete('encryptedToken');
    return;
  }
  vaultStore.set('encryptedToken', safeStorage.encryptString(token).toString('base64'));
}

// ── Repo lifecycle ──────────────────────────────────────────────

/**
 * Current branch of the vault repo. Usually 'main', but an adopted existing
 * repository may use 'master' or anything else.
 */
async function branchName(dir: string): Promise<string> {
  try {
    return (await git.currentBranch({ fs, dir, fullname: false })) ?? BRANCH;
  } catch {
    return BRANCH;
  }
}

async function isRepo(dir: string): Promise<boolean> {
  try {
    await fsp.access(join(dir, '.git'));
    return true;
  } catch {
    return false;
  }
}

export async function ensureRepo(): Promise<void> {
  const dir = repoDir();
  await fsp.mkdir(dir, { recursive: true });
  if (await isRepo(dir)) return;
  await git.init({ fs, dir, defaultBranch: BRANCH });
  const readme = [
    '# ArduDeck Fleet Vault',
    '',
    'Parameter snapshots, missions and survey areas managed by ArduDeck.',
    '',
    '- `units/<uid>/` full parameter dumps per flight controller',
    '- `sites/<site>/` survey boundaries and mission revisions',
    '- `models/`, `roles/` reserved for golden configs and operation overlays',
    '',
  ].join('\n');
  await fsp.writeFile(join(dir, 'README.md'), readme, 'utf-8');
  await git.add({ fs, dir, filepath: 'README.md' });
  await git.commit({ fs, dir, message: 'Initialize fleet vault', author: COMMITTER });
}

async function commitFiles(
  files: Array<{ path: string; content: string }>,
  message: string,
): Promise<{ changed: boolean; oid?: string }> {
  await ensureRepo();
  const dir = repoDir();
  for (const f of files) {
    const abs = join(dir, f.path);
    await fsp.mkdir(dirname(abs), { recursive: true });
    await fsp.writeFile(abs, f.content, 'utf-8');
    await git.add({ fs, dir, filepath: f.path });
  }
  // Skip empty commits: compare staged tree entries against HEAD
  const status = await git.statusMatrix({ fs, dir, filepaths: files.map((f) => f.path) });
  const dirty = status.some(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1));
  if (!dirty) return { changed: false };
  const oid = await git.commit({ fs, dir, message, author: COMMITTER });
  // Fire-and-forget: a failed background sync must never fail the snapshot.
  // The next manual sync or auto-synced snapshot retries.
  if (vaultStore.get('autoSync') && getToken()) {
    void githubSync().catch(() => undefined);
  }
  return { changed: true, oid };
}

// ── Snapshots ───────────────────────────────────────────────────

function sanitizeSegment(s: string): string {
  return s.trim().replace(/[^a-zA-Z0-9._ -]/g, '_').replace(/ +/g, '-').slice(0, 80) || 'unnamed';
}

/**
 * If some unit lists `uid` as an alias, snapshots for that uid land in the
 * aliased unit's folder so its history stays continuous.
 */
async function resolveUnitDir(uid: string): Promise<string> {
  const clean = sanitizeSegment(uid);
  for (const unit of await listUnits()) {
    if (unit.uid === clean) return clean;
    if (unit.aliases?.includes(clean)) return unit.uid;
  }
  return clean;
}

export async function snapshotParams(
  uid: string,
  boardName: string,
  params: Array<{ id: string; value: number }>,
  vehicleType?: string,
  note?: string,
  sitl?: boolean,
  firmware?: string,
): Promise<{ changed: boolean; oid?: string }> {
  const unit = await resolveUnitDir(uid);
  // Firmware is stamped per SNAPSHOT, not just per unit: a board keeps its
  // hardware uid across a reflash, so one unit's history can legitimately hold
  // both ArduPilot and PX4 snapshots. Without this the parameter names in an
  // old snapshot are meaningless to the stack now running, and nothing says so.
  const paramFile = formatParamFile(params, {
    Source: 'ArduDeck fleet vault',
    Board: boardName,
    ...(vehicleType ? { Vehicle: vehicleType } : {}),
    ...(firmware ? { Firmware: firmware } : {}),
    ...(sitl ? { Simulator: 'SITL' } : {}),
  });
  // Preserve everything already in meta (user-given name from renameUnit,
  // aliases from linkUnit); boardName only seeds the name on first snapshot.
  let prevMeta: Record<string, unknown> = {};
  try {
    prevMeta = JSON.parse(await fsp.readFile(join(repoDir(), `units/${unit}/meta.json`), 'utf-8')) as Record<string, unknown>;
  } catch { /* first snapshot for this unit */ }
  const meta = JSON.stringify(
    {
      ...prevMeta,
      uid: unit,
      name: (prevMeta.name as string | undefined) ?? boardName,
      vehicleType,
      sitl: sitl ?? prevMeta.sitl ?? false,
      // Stack this unit was last seen running. Kept alongside the per-snapshot
      // stamp so the unit list can show it without reading every commit.
      firmware: firmware ?? prevMeta.firmware,
      lastSnapshotAt: Date.now(),
      paramCount: params.length,
    },
    null,
    2,
  );
  const message = `params ${unit}: ${boardName}${note ? ` - ${note}` : ''} (${params.length} params)`;
  return commitFiles(
    [
      { path: `units/${unit}/params.param`, content: paramFile },
      { path: `units/${unit}/meta.json`, content: meta + '\n' },
    ],
    message,
  );
}

/**
 * Link a board id to an existing unit: future snapshots from `aliasUid` land
 * in that unit's history. Covers identity-scheme changes (old mavlink-<sysid>
 * fallback ids, the sitl-<sysid> scheme) and swapped flight controllers.
 */
export async function linkUnit(
  unitUid: string,
  aliasUid: string,
): Promise<{ success: boolean; error?: string }> {
  const unit = sanitizeSegment(unitUid);
  const alias = sanitizeSegment(aliasUid);
  if (unit === alias) return { success: true };
  const metaPath = `units/${unit}/meta.json`;
  try {
    const raw = await fsp.readFile(join(repoDir(), metaPath), 'utf-8');
    const meta = JSON.parse(raw) as { aliases?: string[] };
    const aliases = new Set(meta.aliases ?? []);
    aliases.add(alias);
    const next = { ...meta, aliases: [...aliases] };
    await commitFiles(
      [{ path: metaPath, content: JSON.stringify(next, null, 2) + '\n' }],
      `link ${alias} -> ${unit}`,
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Link failed' };
  }
}

/** User-facing rename of a unit; the name sticks across future snapshots */
export async function renameUnit(
  uid: string,
  name: string,
): Promise<{ success: boolean; error?: string }> {
  const unit = sanitizeSegment(uid);
  const metaPath = `units/${unit}/meta.json`;
  try {
    const raw = await fsp.readFile(join(repoDir(), metaPath), 'utf-8');
    const meta = JSON.parse(raw) as Record<string, unknown>;
    meta.name = name.trim() || String(meta.name ?? unit);
    await commitFiles(
      [{ path: metaPath, content: JSON.stringify(meta, null, 2) + '\n' }],
      `rename ${unit}: ${meta.name}`,
    );
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Rename failed' };
  }
}

export async function snapshotMission(
  site: string,
  missionName: string,
  waypointsContent: string,
): Promise<{ changed: boolean; oid?: string }> {
  const s = sanitizeSegment(site);
  const m = sanitizeSegment(missionName);
  return commitFiles(
    [{ path: `sites/${s}/missions/${m}.waypoints`, content: waypointsContent }],
    `mission ${s}/${m}`,
  );
}

export async function snapshotArea(
  site: string,
  kmlContent: string,
): Promise<{ changed: boolean; oid?: string }> {
  const s = sanitizeSegment(site);
  return commitFiles([{ path: `sites/${s}/boundary.kml`, content: kmlContent }], `area ${s}`);
}

/**
 * A survey area as a document under its site, keyed by its own id so the same
 * area lands on the same path from every machine and a revision shows up as a
 * diff. The KML boundary stays for other tools; this is the file that can be
 * opened and edited again.
 */
export async function snapshotSurveyArea(
  site: string,
  doc: SurveyDocument,
): Promise<{ changed: boolean; oid?: string; path: string }> {
  const s = sanitizeSegment(site);
  const path = `sites/${s}/areas/${sanitizeSegment(doc.id)}.json`;
  const result = await commitFiles(
    [{ path, content: JSON.stringify({ ...doc, site: s }, null, 2) }],
    `area ${s}/${doc.name} rev ${doc.revision}`,
  );
  return { ...result, path };
}

const AREA_PATH = /^sites\/[A-Za-z0-9._-]+\/areas\/[A-Za-z0-9._-]+\.json$/;

export async function listSurveyAreas(site?: string): Promise<VaultSurveyArea[]> {
  await ensureRepo();
  const sitesDir = join(repoDir(), 'sites');
  let siteDirs: string[] = [];
  try {
    siteDirs = await fsp.readdir(sitesDir);
  } catch {
    return [];
  }
  const out: VaultSurveyArea[] = [];
  for (const dirName of siteDirs) {
    if (dirName.startsWith('.')) continue;
    if (site && dirName !== sanitizeSegment(site)) continue;
    let files: string[] = [];
    try {
      files = (await fsp.readdir(join(sitesDir, dirName, 'areas'))).filter((f) => f.endsWith('.json'));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const raw: unknown = JSON.parse(await fsp.readFile(join(sitesDir, dirName, 'areas', file), 'utf-8'));
        if (!isSurveyDocument(raw)) continue;
        out.push({
          site: dirName,
          path: `sites/${dirName}/areas/${file}`,
          id: raw.id,
          name: raw.name,
          revision: raw.revision,
          generatorId: raw.area.generatorId,
          updatedAt: raw.updatedAt,
        });
      } catch {
        // A file someone hand-edited into invalid JSON is skipped, not fatal.
      }
    }
  }
  return out.sort((a, b) => a.site.localeCompare(b.site) || a.name.localeCompare(b.name));
}

/**
 * The mission as ArduDeck holds it, groups and surveys intact, next to the
 * .waypoints file other tools read. The waypoints alone cannot be edited back
 * into a plan, which is what makes them useless for picking a job up elsewhere.
 */
export async function snapshotMissionDocument(
  site: string,
  mission: StoredMission,
): Promise<{ changed: boolean; oid?: string; path: string }> {
  const s = sanitizeSegment(site);
  const path = `sites/${s}/missions/${sanitizeSegment(mission.id)}.mission.json`;
  const result = await commitFiles(
    [{ path, content: JSON.stringify({ ...mission, site: s }, null, 2) }],
    `mission ${s}/${mission.name}`,
  );
  return { ...result, path };
}

const MISSION_PATH = /^sites\/[A-Za-z0-9._-]+\/missions\/[A-Za-z0-9._-]+\.mission\.json$/;

export async function listVaultMissions(site?: string): Promise<VaultMission[]> {
  await ensureRepo();
  const sitesDir = join(repoDir(), 'sites');
  let siteDirs: string[] = [];
  try {
    siteDirs = await fsp.readdir(sitesDir);
  } catch {
    return [];
  }
  const out: VaultMission[] = [];
  for (const dirName of siteDirs) {
    if (dirName.startsWith('.')) continue;
    if (site && dirName !== sanitizeSegment(site)) continue;
    let files: string[] = [];
    try {
      files = (await fsp.readdir(join(sitesDir, dirName, 'missions'))).filter((f) => f.endsWith('.mission.json'));
    } catch {
      continue;
    }
    for (const file of files) {
      try {
        const raw: unknown = JSON.parse(await fsp.readFile(join(sitesDir, dirName, 'missions', file), 'utf-8'));
        if (!isStoredMission(raw)) continue;
        out.push({
          site: dirName,
          path: `sites/${dirName}/missions/${file}`,
          id: raw.id,
          name: raw.name,
          waypointCount: raw.items.length,
          updatedAt: raw.updatedAt,
        });
      } catch {
        // Skip a file someone hand-edited into invalid JSON.
      }
    }
  }
  return out.sort((a, b) => a.site.localeCompare(b.site) || a.name.localeCompare(b.name));
}

export async function readVaultMission(path: string): Promise<StoredMission | null> {
  if (!MISSION_PATH.test(path) || path.includes('..')) return null;
  await ensureRepo();
  try {
    const raw: unknown = JSON.parse(await fsp.readFile(join(repoDir(), path), 'utf-8'));
    return isStoredMission(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Read one area back out of the repo. The path is checked, never trusted. */
export async function readSurveyArea(path: string): Promise<SurveyDocument | null> {
  if (!AREA_PATH.test(path) || path.includes('..')) return null;
  await ensureRepo();
  try {
    const raw: unknown = JSON.parse(await fsp.readFile(join(repoDir(), path), 'utf-8'));
    return isSurveyDocument(raw) ? raw : null;
  } catch {
    return null;
  }
}

// ── History / reads ─────────────────────────────────────────────

async function changedFiles(dir: string, commit: { oid: string; parent: string[] }): Promise<string[]> {
  const parent = commit.parent[0];
  if (!parent) {
    return []; // root commit; file list not interesting
  }
  const files: string[] = [];
  await git.walk({
    fs,
    dir,
    trees: [git.TREE({ ref: parent }), git.TREE({ ref: commit.oid })],
    map: async (filepath, [a, b]) => {
      if (filepath === '.') return undefined;
      const aOid = await a?.oid();
      const bOid = await b?.oid();
      if (aOid === bOid) return null; // unchanged subtree: prune
      const type = (await (b ?? a)?.type()) ?? 'blob';
      if (type === 'blob') files.push(filepath);
      return undefined;
    },
  });
  return files;
}

export async function history(limit = 100): Promise<FleetRepoHistoryEntry[]> {
  await ensureRepo();
  const dir = repoDir();
  const commits = await git.log({ fs, dir, depth: limit, ref: await branchName(dir) });
  const out: FleetRepoHistoryEntry[] = [];
  for (const c of commits) {
    let files: string[] = [];
    try {
      files = await changedFiles(dir, { oid: c.oid, parent: c.commit.parent });
    } catch {
      // tree walk failure should not break the history list
    }
    out.push({
      oid: c.oid,
      message: c.commit.message.trim(),
      timestamp: c.commit.author.timestamp * 1000,
      files,
    });
  }
  return out;
}

export async function readFileAtCommit(oid: string, filepath: string): Promise<string | null> {
  const dir = repoDir();
  try {
    const { blob } = await git.readBlob({ fs, dir, oid, filepath });
    return Buffer.from(blob).toString('utf-8');
  } catch {
    return null;
  }
}

export async function readWorkingFile(filepath: string): Promise<string | null> {
  try {
    return await fsp.readFile(join(repoDir(), filepath), 'utf-8');
  } catch {
    return null;
  }
}

export async function listUnits(): Promise<FleetRepoUnit[]> {
  await ensureRepo();
  const unitsDir = join(repoDir(), 'units');
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(unitsDir);
  } catch {
    return [];
  }
  const out: FleetRepoUnit[] = [];
  for (const uid of entries) {
    if (uid.startsWith('.')) continue;
    let meta: Partial<FleetRepoUnit> = {};
    try {
      meta = JSON.parse(await fsp.readFile(join(unitsDir, uid, 'meta.json'), 'utf-8'));
    } catch {
      // meta is best-effort
    }
    out.push({
      uid,
      name: meta.name ?? uid,
      vehicleType: meta.vehicleType,
      sitl: meta.sitl,
      aliases: meta.aliases,
      lastSnapshotAt: meta.lastSnapshotAt,
      paramCount: meta.paramCount,
    });
  }
  return out.sort((a, b) => (b.lastSnapshotAt ?? 0) - (a.lastSnapshotAt ?? 0));
}

export async function listSites(): Promise<FleetRepoSite[]> {
  await ensureRepo();
  const sitesDir = join(repoDir(), 'sites');
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(sitesDir);
  } catch {
    return [];
  }
  const out: FleetRepoSite[] = [];
  for (const site of entries) {
    if (site.startsWith('.')) continue;
    let hasBoundary = false;
    try {
      await fsp.access(join(sitesDir, site, 'boundary.kml'));
      hasBoundary = true;
    } catch {
      // no boundary saved yet
    }
    let missions: string[] = [];
    try {
      missions = (await fsp.readdir(join(sitesDir, site, 'missions')))
        .filter((f) => f.endsWith('.waypoints'))
        .map((f) => f.replace(/\.waypoints$/, ''));
    } catch {
      // no missions dir yet
    }
    out.push({ site, hasBoundary, missions });
  }
  return out.sort((a, b) => a.site.localeCompare(b.site));
}

// ── Status ──────────────────────────────────────────────────────

export async function status(): Promise<FleetRepoStatus> {
  const dir = repoDir();
  const initialized = await isRepo(dir);
  let commitCount = 0;
  if (initialized) {
    try {
      commitCount = (await git.log({ fs, dir, ref: await branchName(dir) })).length;
    } catch {
      commitCount = 0;
    }
  }
  const token = getToken();
  const mode = vaultStore.get('remoteMode') ?? 'github';
  return {
    path: dir,
    initialized,
    commitCount,
    autoSync: vaultStore.get('autoSync') ?? false,
    github: {
      connected: token !== null,
      mode,
      login: vaultStore.get('login'),
      repo: mode === 'custom' ? vaultStore.get('remoteUrl') : vaultStore.get('repoName'),
      lastSyncAt: vaultStore.get('lastSyncAt'),
    },
  };
}

export async function openRepoDir(): Promise<void> {
  await ensureRepo();
  await shell.openPath(repoDir());
}

// ── GitHub: device flow auth ────────────────────────────────────

async function ghFetch(url: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
  };
  return fetch(url, { ...init, headers });
}

export async function githubDeviceStart(): Promise<GithubDeviceStart> {
  const res = await ghFetch('https://github.com/login/device/code', {
    method: 'POST',
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'repo' }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    interval?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !data.device_code) {
    throw new Error(data.error_description ?? data.error ?? `GitHub device flow start failed (${res.status})`);
  }
  return {
    deviceCode: data.device_code,
    userCode: data.user_code ?? '',
    verificationUri: data.verification_uri ?? 'https://github.com/login/device',
    interval: data.interval ?? 5,
  };
}

export async function githubDevicePoll(
  deviceCode: string,
): Promise<{ state: 'pending' | 'ok' | 'error'; login?: string; error?: string }> {
  const res = await ghFetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (data.access_token) {
    setToken(data.access_token);
    const login = await fetchLogin(data.access_token);
    vaultStore.set('login', login ?? 'unknown');
    return { state: 'ok', login: login ?? undefined };
  }
  if (data.error === 'authorization_pending' || data.error === 'slow_down') {
    return { state: 'pending' };
  }
  return { state: 'error', error: data.error ?? 'Unknown device flow error' };
}

/** Fallback for locked-down orgs: paste a personal access token directly */
export async function githubSetToken(token: string): Promise<{ success: boolean; login?: string; error?: string }> {
  const login = await fetchLogin(token);
  if (!login) return { success: false, error: 'Token rejected by GitHub' };
  setToken(token);
  vaultStore.set('login', login);
  return { success: true, login };
}

export function githubDisconnect(): void {
  setToken(null);
  vaultStore.delete('login');
  vaultStore.delete('repoName');
  vaultStore.delete('lastSyncAt');
  vaultStore.delete('remoteMode');
  vaultStore.delete('remoteUrl');
  vaultStore.delete('remoteUsername');
}

/**
 * Bring-your-own-repo: user created the repository themselves and provides
 * its URL + a token. Accepts scp-style SSH URLs (git@host:user/repo.git) and
 * converts them to HTTPS; isomorphic-git has no SSH transport.
 */
export async function setCustomRemote(
  url: string,
  token: string,
  username?: string,
): Promise<{ success: boolean; error?: string }> {
  let normalized = url.trim();
  const scp = normalized.match(/^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?$/);
  if (scp) normalized = `https://${scp[1]}/${scp[2]}.git`;
  if (!/^https:\/\/.+\/.+/.test(normalized)) {
    return { success: false, error: 'Use an HTTPS repository URL (SSH is not supported)' };
  }
  if (!token.trim()) {
    return { success: false, error: 'A token with write access to the repository is required' };
  }

  await ensureRepo();
  const dir = repoDir();
  try {
    await git.deleteRemote({ fs, dir, remote: 'origin' });
  } catch {
    // no remote yet
  }
  await git.addRemote({ fs, dir, remote: 'origin', url: normalized });
  setToken(token.trim());
  vaultStore.set('remoteMode', 'custom');
  vaultStore.set('remoteUrl', normalized);
  if (username?.trim()) vaultStore.set('remoteUsername', username.trim());
  else vaultStore.delete('remoteUsername');
  vaultStore.delete('login');
  vaultStore.delete('repoName');
  return { success: true };
}

async function fetchLogin(token: string): Promise<string | null> {
  try {
    const res = await ghFetch('https://api.github.com/user', { token });
    if (!res.ok) return null;
    const user = (await res.json()) as { login?: string };
    return user.login ?? null;
  } catch {
    return null;
  }
}

// ── GitHub: repo creation + sync ────────────────────────────────

function remoteUrl(login: string, repoName: string): string {
  return `https://github.com/${login}/${repoName}.git`;
}

export async function githubCreateRepo(
  repoName: string,
): Promise<{ success: boolean; error?: string }> {
  const token = getToken();
  const login = vaultStore.get('login');
  if (!token || !login) return { success: false, error: 'Not connected to GitHub' };
  const name = sanitizeSegment(repoName) || 'ardudeck-fleet';

  const res = await ghFetch('https://api.github.com/user/repos', {
    method: 'POST',
    token,
    body: JSON.stringify({ name, private: true, auto_init: false, description: 'ArduDeck fleet vault' }),
  });
  if (!res.ok && res.status !== 422) {
    return { success: false, error: `GitHub repo creation failed (${res.status})` };
  }
  if (res.status === 422) {
    // Name already exists: verify we can access it and adopt it as the remote
    const check = await ghFetch(`https://api.github.com/repos/${login}/${name}`, { token });
    if (!check.ok) return { success: false, error: `Repository "${name}" exists but is not accessible` };
  }

  await ensureRepo();
  const dir = repoDir();
  const url = remoteUrl(login, name);
  try {
    await git.deleteRemote({ fs, dir, remote: 'origin' });
  } catch {
    // no remote yet
  }
  await git.addRemote({ fs, dir, remote: 'origin', url });
  vaultStore.set('repoName', name);
  vaultStore.set('remoteMode', 'github');
  vaultStore.delete('remoteUrl');
  vaultStore.delete('remoteUsername');
  return { success: true };
}

export function setAutoSync(enabled: boolean): void {
  vaultStore.set('autoSync', enabled);
}

/** Repos the connected account can push to, for the "use existing repo" picker */
export async function githubListRepos(): Promise<{
  success: boolean;
  repos?: Array<{ fullName: string; private: boolean; pushedAt?: string }>;
  error?: string;
}> {
  const token = getToken();
  if (!token) return { success: false, error: 'Not connected to GitHub' };
  const res = await ghFetch(
    'https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator',
    { token },
  );
  if (!res.ok) return { success: false, error: `Could not list repositories (${res.status})` };
  const data = (await res.json()) as Array<{
    full_name: string;
    private: boolean;
    pushed_at?: string;
    permissions?: { push?: boolean };
  }>;
  return {
    success: true,
    repos: data
      .filter((r) => r.permissions?.push !== false)
      .map((r) => ({ fullName: r.full_name, private: r.private, pushedAt: r.pushed_at })),
  };
}

/**
 * Adopt an existing GitHub repository (possibly with history) as the vault.
 * Safe only while the local vault is fresh (just the init commit): the local
 * repo is discarded and the remote cloned in its place. With local snapshots
 * present we refuse rather than attempt an unrelated-history merge.
 */
export async function githubUseExistingRepo(
  fullName: string,
): Promise<{ success: boolean; error?: string }> {
  const token = getToken();
  if (!token) return { success: false, error: 'Not connected to GitHub' };

  const current = await status();
  if (current.commitCount > 1) {
    return {
      success: false,
      error: 'This vault already has snapshots. Create a new repository instead, or move the vault folder away first.',
    };
  }

  const dir = repoDir();
  const url = `https://github.com/${fullName}.git`;
  const onAuth = () => ({ username: 'x-access-token', password: token });
  const tmp = `${dir}.adopt-tmp`;

  try {
    await fsp.rm(tmp, { recursive: true, force: true });
    await fsp.mkdir(tmp, { recursive: true });
    try {
      await git.clone({ fs, http, dir: tmp, url, onAuth, singleBranch: false });
    } catch (err) {
      // An empty repository cannot be cloned; adopt it like a created one
      const msg = err instanceof Error ? err.message : String(err);
      if (!/could not find HEAD|remote.*empty|404/i.test(msg)) throw err;
      await fsp.rm(tmp, { recursive: true, force: true });
      await ensureRepo();
      try {
        await git.deleteRemote({ fs, dir, remote: 'origin' });
      } catch { /* no remote yet */ }
      await git.addRemote({ fs, dir, remote: 'origin', url });
      vaultStore.set('repoName', fullName);
      vaultStore.set('remoteMode', 'github');
      return { success: true };
    }
    // Replace the fresh local vault with the clone
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.rename(tmp, dir);
    vaultStore.set('repoName', fullName);
    vaultStore.set('remoteMode', 'github');
    vaultStore.delete('remoteUrl');
    vaultStore.delete('remoteUsername');
    return { success: true };
  } catch (err) {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    return { success: false, error: err instanceof Error ? err.message : 'Could not adopt repository' };
  }
}

/** True when the remote already has this branch, so a pull makes sense. */
async function remoteHasBranch(dir: string, ref: string, onAuth: () => { username: string; password: string }): Promise<boolean> {
  try {
    const url = await git.getConfig({ fs, dir, path: 'remote.origin.url' });
    if (!url) return false;
    const refs = await git.listServerRefs({ http, url, prefix: `refs/heads/${ref}`, onAuth });
    return refs.length > 0;
  } catch {
    return false;
  }
}

export async function githubSync(): Promise<{ success: boolean; error?: string }> {
  const token = getToken();
  const mode = vaultStore.get('remoteMode') ?? 'github';
  if (!token) return { success: false, error: 'Not connected. Set up backup in the vault first.' };
  if (mode === 'github') {
    if (!vaultStore.get('login')) return { success: false, error: 'Not connected to GitHub' };
    if (!vaultStore.get('repoName')) return { success: false, error: 'No repository configured' };
  } else if (!vaultStore.get('remoteUrl')) {
    return { success: false, error: 'No repository configured' };
  }

  await ensureRepo();
  const dir = repoDir();
  const ref = await branchName(dir);
  const username = mode === 'custom'
    ? vaultStore.get('remoteUsername') ?? 'x-access-token'
    : 'x-access-token';
  const onAuth = () => ({ username, password: token });

  try {
    if (await remoteHasBranch(dir, ref, onAuth)) {
      await git.pull({ fs, http, dir, ref, singleBranch: true, author: COMMITTER, onAuth });
    }
    await git.push({ fs, http, dir, remote: 'origin', ref, onAuth });
    vaultStore.set('lastSyncAt', Date.now());
    return { success: true };
  } catch (err) {
    return { success: false, error: syncErrorMessage(err) };
  }
}
