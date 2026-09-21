/**
 * Installing and tracking Hangar APPS.
 *
 * Deliberately NOT part of module-manager: an app has no licence to activate, no manifest to
 * parse, no capability to register and no code that runs inside this process. What it shares
 * with a module is "download a zip and unpack it", which is not enough to justify one code path
 * carrying two sets of rules.
 */

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { app } from 'electron';
import Store from 'electron-store';
import { extractAppArchive } from './app-extract.js';
import type {
  AppPlatform, AppProgress, HangarApp, HangarAppDetail, InstalledApp,
} from '../../shared/app-types.js';

/** Same ordering the module installer uses, so the two cannot disagree about a version. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('-')[0]!.split('.').map(Number);
  const pb = b.split('-')[0]!.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

interface AppStoreSchema {
  apps: InstalledApp[];
}

// Constructed on first use, not at import. A module-level `new Store()` needs Electron's app
// name to exist, so merely importing this file from anywhere outside a running Electron main
// process throws - which is what stopped the pure logic below from being testable at all.
let _store: Store<AppStoreSchema> | null = null;
function store(): Store<AppStoreSchema> {
  _store ??= new Store<AppStoreSchema>({ name: 'apps', defaults: { apps: [] } });
  return _store;
}

const DEV_BASE_URL = 'http://localhost:3000';
const DEFAULT_BASE_URL = 'https://hangar.ardudeck.com';

function baseUrl(): string {
  const override = process.env['HANGAR_URL'] ?? process.env['MARKETPLACE_URL'];
  if (override) return override;
  if (!app.isPackaged) return DEV_BASE_URL;
  return DEFAULT_BASE_URL;
}

function thisPlatform(): AppPlatform {
  return process.platform === 'darwin' ? 'darwin'
    : process.platform === 'win32' ? 'win32'
    : 'linux';
}

export function getInstalledApps(): InstalledApp[] {
  return store().get('apps');
}

export function getInstalledApp(slug: string): InstalledApp | undefined {
  return store().get('apps').find((a) => a.slug === slug);
}

/**
 * Only what this machine can actually run. Listing a Linux-only app on macOS gives the user an
 * Install button whose only possible outcome is a 404, and `platforms` is read off the released
 * rows precisely so a platform whose build failed is not offered.
 */
export function runnableHere(apps: HangarApp[], platform: AppPlatform): HangarApp[] {
  return apps.filter((a) => a.platforms.includes(platform));
}

export async function listApps(): Promise<HangarApp[]> {
  const res = await fetch(`${baseUrl()}/public/apps`);
  if (!res.ok) throw new Error(`Hangar returned ${res.status}`);
  return runnableHere((await res.json()) as HangarApp[], thisPlatform());
}

export async function installApp(
  slug: string,
  onProgress: (p: AppProgress) => void = () => {},
): Promise<InstalledApp> {
  const platform = thisPlatform();

  // Refuse a release this ArduDeck is too old to host, BEFORE downloading half a gigabyte.
  //
  // The module installer has always done this; the app installer never did, so a release could
  // declare `minAppVersion` and be installed by a build with none of the integration it needs.
  // The failure then arrives later and somewhere else: the app is on disk, the nav rail entry
  // is missing, and nothing connects the two.
  const detail = await fetch(`${baseUrl()}/public/apps/${encodeURIComponent(slug)}`)
    .then((r) => (r.ok ? (r.json() as Promise<HangarAppDetail>) : null))
    .catch(() => null);
  const release = detail?.releases?.find(
    (r) => r.version === detail.latestVersion && r.platform === platform && r.kind === 'archive',
  );
  const needs = release?.minAppVersion;
  if (needs && compareSemver(app.getVersion(), needs) < 0) {
    throw new Error(
      `${detail?.name ?? slug} needs ArduDeck ${needs} or newer (this is ${app.getVersion()}). ` +
        'Update ArduDeck first.',
    );
  }

  const url =
    `${baseUrl()}/public/apps/${encodeURIComponent(slug)}/download/latest` +
    `?platform=${platform}&kind=archive`;

  onProgress({ stage: 'downloading', message: `Downloading ${slug}...`, percent: 0 });

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    throw new Error(`Could not reach the Hangar at ${baseUrl()}. Check your connection.`);
  }
  if (!res.ok) throw new Error(`Hangar returned ${res.status} for ${slug} (${platform})`);
  if (!res.body) throw new Error('Empty response body');

  const declaredHash = res.headers.get('x-bundle-hash') || '';
  const total = parseInt(res.headers.get('content-length') || '0', 10);

  const dir = join(app.getPath('userData'), 'apps', slug);
  await mkdir(dir, { recursive: true });
  const zipPath = join(dir, 'download.zip');

  // Hashed as the bytes arrive, so verifying costs no second read of a file this size.
  const digest = createHash('sha256');
  let got = 0;
  const reader = res.body.getReader();
  const source = new Readable({
    async read() {
      const { done, value } = await reader.read();
      if (done) { this.push(null); return; }
      got += value.byteLength;
      onProgress({
        stage: 'downloading',
        message: `Downloading ${slug}...`,
        percent: total ? Math.round((got / total) * 100) : undefined,
      });
      digest.update(value);
      this.push(Buffer.from(value));
    },
  });
  await pipeline(source, createWriteStream(zipPath));

  onProgress({ stage: 'verifying', message: `Verifying ${slug}...` });
  const localHash = digest.digest('hex');
  if (declaredHash && localHash !== declaredHash) {
    await rm(zipPath, { force: true });
    throw new Error(`Hash mismatch for ${slug} - the download was corrupted or tampered with`);
  }

  onProgress({ stage: 'extracting', message: `Installing ${slug}...` });
  const installPath = join(dir, 'current');
  await extractAppArchive(zipPath, installPath);
  // Hundreds of megabytes that are now redundant; keeping it doubles what the app costs on disk.
  await rm(zipPath, { force: true });

  const record: InstalledApp = {
    slug,
    name: detail?.name ?? slug,
    version: detail?.latestVersion ?? 'unknown',
    platform,
    installPath,
    installedAt: new Date().toISOString(),
    bundleHash: localHash,
  };
  store().set('apps', [...store().get('apps').filter((a) => a.slug !== slug), record]);
  onProgress({ stage: 'done', message: `${record.name} installed.`, percent: 100 });
  return record;
}

export async function uninstallApp(slug: string): Promise<InstalledApp[]> {
  const dir = join(app.getPath('userData'), 'apps', slug);
  await rm(dir, { recursive: true, force: true });
  const left = store().get('apps').filter((a) => a.slug !== slug);
  store().set('apps', left);
  return left;
}
