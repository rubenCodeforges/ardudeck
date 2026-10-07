/**
 * Module Manager - Main process orchestrator.
 * Handles license activation, module installation, and persistence.
 */

import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { app } from 'electron';
import Store from 'electron-store';
import { parseModuleManifest } from '@ardudeck/module-sdk';
import {
  verifyLicenseKey,
  verifyBundleSignature,
  isLicenseKeyShaped,
  verifyReceipt,
} from './license-validator.js';
import * as hangar from './hangar-client.js';
import { extractBundle } from './module-extract.js';
import { entitledSlugs } from './entitlements.js';
import type {
  CargoDetail,
  InstalledModule,
  ModuleProgress,
  PublicCargo,
  UpdateAvailable,
} from '../../shared/module-types.js';
import { t } from '../../shared/i18n/index.js';

// --------------------------------------------------------------------------
// Persistent store
// --------------------------------------------------------------------------

interface ModuleStoreSchema {
  deviceId: string;
  modules: InstalledModule[];
  licenseKeys: string[]; // all activated keys
  receipts: string[];
  grandfathered: boolean;
}

const store = new Store<ModuleStoreSchema>({
  name: 'modules',
  defaults: {
    deviceId: '',
    modules: [],
    licenseKeys: [],
    receipts: [],
    grandfathered: false,
  },
});

// --------------------------------------------------------------------------
// Device ID
// --------------------------------------------------------------------------

export function getDeviceId(): string {
  let id = store.get('deviceId');
  if (!id) {
    id = randomUUID();
    store.set('deviceId', id);
  }
  return id;
}

function getDeviceName(): string {
  const os = process.platform === 'darwin' ? 'macOS' : process.platform === 'win32' ? 'Windows' : 'Linux';
  return `ArduDeck ${os}`;
}

// --------------------------------------------------------------------------
// Activate License
// --------------------------------------------------------------------------

/** Numeric dotted-version compare; pre-release suffixes are ignored. */
function compareSemver(a: string, b: string): number {
  const aParts = a.split('-')[0]!.split('.').map(Number);
  const bParts = b.split('-')[0]!.split('.').map(Number);
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }
  return 0;
}

export async function activateLicense(
  key: string,
  onProgress: (p: ModuleProgress) => void,
  opts?: {
    /**
     * Skip the duplicate-key guard. The update path re-activates a known key
     * on purpose (server activation is idempotent per device; the download
     * fetches latest); only manual entry in the Add form should be rejected.
     */
    reactivate?: boolean;
  },
): Promise<{ success: boolean; error?: string }> {
  // 1. Offline signature validation
  onProgress({ stage: 'validating', message: t('main:moduleManager.validatingKey') });

  const verification = verifyLicenseKey(key);
  if (!verification.valid) {
    onProgress({ stage: 'error', message: verification.error || t('main:moduleManager.invalidKey') });
    return { success: false, error: verification.error || t('main:moduleManager.invalidKey') };
  }

  // Check if already activated (manual double-add, not an update)
  const existingKeys = store.get('licenseKeys');
  if (!opts?.reactivate && existingKeys.includes(key)) {
    onProgress({ stage: 'error', message: t('main:moduleManager.alreadyActivated') });
    return { success: false, error: t('main:moduleManager.alreadyActivated') };
  }

  // 2. API activation
  onProgress({ stage: 'activating', message: t('main:moduleManager.activating') });

  const deviceId = getDeviceId();
  const deviceName = getDeviceName();

  let activateResult;
  try {
    activateResult = await hangar.activate(key, deviceId, deviceName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({ stage: 'error', message: t('main:moduleManager.activationFailed', { msg }) });
    return { success: false, error: msg };
  }

  if (!activateResult.ok) {
    onProgress({ stage: 'error', message: activateResult.error || t('main:moduleManager.activationRejected') });
    return { success: false, error: activateResult.error || t('main:moduleManager.activationRejected') };
  }

  if (activateResult.receipt) storeReceipt(activateResult.receipt);

  // 3. Download each module bundle (activatable modules ship in the app, so
  //    they are enabled in place - no download/extract).
  const modules = activateResult.modules;
  const activatableSlugs = new Set(activateResult.activatable ?? []);
  const newModules: InstalledModule[] = [];
  const requiredSlugs = new Set<string>();

  for (let i = 0; i < modules.length; i++) {
    const slug = modules[i]!;
    const moduleIndex = i + 1;

    if (activatableSlugs.has(slug)) {
      onProgress({
        stage: 'activating',
        message: t('main:moduleManager.enabling', { slug, index: moduleIndex, total: modules.length }),
        percent: Math.round((i / modules.length) * 100),
      });
      newModules.push({
        slug,
        name: slug,
        version: '',
        installedAt: new Date().toISOString(),
        licenseKey: key,
        licenseType: verification.payload!.type,
        bundleName: activateResult.bundle,
        activatable: true,
      });
      continue;
    }

    onProgress({
      stage: 'downloading',
      message: t('main:moduleManager.downloading', { slug, index: moduleIndex, total: modules.length }),
      percent: Math.round((i / modules.length) * 100),
    });

    try {
      // Download the latest version
      const { filePath, hash, localHash, sig } = await hangar.downloadBundle(
        slug,
        'latest',
        key,
        (downloaded, total) => {
          const dlPercent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
          onProgress({
            stage: 'downloading',
            message: t('main:moduleManager.downloading', { slug, index: moduleIndex, total: modules.length }),
            percent: Math.round(((i + dlPercent / 100) / modules.length) * 100),
          });
        },
      );

      // 4. Verify bundle signature
      onProgress({
        stage: 'verifying',
        message: t('main:moduleManager.verifying', { slug }),
        percent: Math.round(((i + 0.9) / modules.length) * 100),
      });

      // Integrity: the locally-computed SHA256 must match the server's
      // declared hash, and when the server returns an Ed25519 bundle
      // signature it must verify against the embedded Hangar key.
      // Absent headers only warn - servers predating them still install.
      if (hash && localHash !== hash) {
        await rm(filePath, { force: true });
        throw new Error(t('main:moduleManager.hashMismatch', { slug }));
      }
      if (!hash) {
        console.warn(`[ModuleManager] No bundle hash for ${slug}, skipping hash verification`);
      }
      if (sig) {
        if (!verifyBundleSignature(filePath, sig)) {
          await rm(filePath, { force: true });
          throw new Error(t('main:moduleManager.signatureFailed', { slug }));
        }
      } else {
        console.warn(`[ModuleManager] No bundle signature for ${slug}, skipping signature verification`);
      }

      // 5. Extract bundle and parse manifest
      const installPath = join(app.getPath('userData'), 'modules', slug, 'extracted');
      await extractBundle(filePath, installPath);

      const manifestRaw = await readFile(join(installPath, 'module.json'), 'utf-8');
      const parsed = parseModuleManifest(JSON.parse(manifestRaw));
      if (!parsed.ok) {
        throw new Error(t('main:moduleManager.invalidManifest', { slug, error: parsed.error }));
      }

      // Refuse cargo that needs a newer app: a module built against host APIs
      // or capability gates this version doesn't have would install "fine" and
      // then break at runtime (or silently gate nothing).
      const minVersion = parsed.manifest.minArduDeckVersion;
      if (minVersion && compareSemver(app.getVersion(), minVersion) < 0) {
        await rm(installPath, { recursive: true, force: true });
        throw new Error(
          t('main:moduleManager.needsNewerArduDeck', { name: parsed.manifest.name, needs: minVersion, current: app.getVersion() }),
        );
      }

      for (const dep of parsed.manifest.requires ?? []) requiredSlugs.add(dep);

      newModules.push({
        slug: parsed.manifest.slug,
        name: parsed.manifest.name,
        version: parsed.manifest.version,
        installedAt: new Date().toISOString(),
        licenseKey: key,
        licenseType: verification.payload!.type,
        bundleName: activateResult.bundle,
        installPath,
        manifestVersion: parsed.manifest.manifestVersion,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[ModuleManager] Failed to download ${slug}:`, msg);
      onProgress({ stage: 'error', message: t('main:moduleManager.downloadFailed', { slug, msg }) });
      return { success: false, error: t('main:moduleManager.downloadFailed', { slug, msg }) };
    }
  }

  // 5. Persist to store
  const currentModules = store.get('modules');
  const currentKeys = store.get('licenseKeys');

  // Remove any existing modules with same slugs (update scenario)
  const filteredModules = currentModules.filter(
    (m) => !newModules.some((n) => n.slug === m.slug),
  );

  store.set('modules', [...filteredModules, ...newModules]);
  // Deduped: re-activation of an already-known key is the module UPDATE path.
  store.set('licenseKeys', Array.from(new Set([...currentKeys, key])));

  // Pull in missing free dependencies (Production Line needs Fleet Vault).
  const installedSlugs = new Set(store.get('modules').map((m) => m.slug));
  for (const dep of requiredSlugs) {
    if (installedSlugs.has(dep)) continue;
    onProgress({ stage: 'activating', message: t('main:moduleManager.installingDependency', { slug: dep }) });
    const depResult = await installFreeCargo(dep, () => undefined);
    if (!depResult.success) {
      onProgress({ stage: 'error', message: t('main:moduleManager.dependencyFailed', { slug: dep, msg: depResult.error ?? '' }) });
      return { success: false, error: t('main:moduleManager.dependencyFailed', { slug: dep, msg: depResult.error ?? '' }) };
    }
  }

  onProgress({ stage: 'complete', message: t('main:moduleManager.activated', { count: newModules.length }), percent: 100 });

  return { success: true };
}

// --------------------------------------------------------------------------
// Public Catalog / Free Install
// --------------------------------------------------------------------------

/** Browse the public, free cargos published in the Hangar. */
export async function listPublicCargos(): Promise<PublicCargo[]> {
  return hangar.fetchPublicCargos();
}

/** Fetch the full marketing detail for one public cargo by slug. */
export async function getCargoDetail(slug: string): Promise<CargoDetail> {
  return hangar.fetchCargoDetail(slug);
}

/**
 * Install a free public cargo by slug. Fetches a signed free license key from
 * the Hangar for this device, then runs the normal activation flow with it, so
 * download, verify, extract and persistence are shared with paid activation.
 */
export async function installFreeCargo(
  slug: string,
  onProgress: (p: ModuleProgress) => void,
): Promise<{ success: boolean; error?: string }> {
  onProgress({ stage: 'activating', message: t('main:moduleManager.requesting', { slug }) });

  const deviceId = getDeviceId();
  const deviceName = getDeviceName();

  let key: string;
  try {
    const result = await hangar.requestFreeInstall(slug, deviceId, deviceName);
    key = result.key;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({ stage: 'error', message: t('main:moduleManager.installFailed', { msg }) });
    return { success: false, error: msg };
  }

  // reactivate: the free key may already be on record from a prior install, and
  // re-running is how a reinstall/update works.
  return activateLicense(key, onProgress, { reactivate: true });
}

// --------------------------------------------------------------------------
// Get Installed Modules
// --------------------------------------------------------------------------

export function storeReceipt(receipt: string): void {
  const deviceId = getDeviceId();
  const fresh = verifyReceipt(receipt, deviceId);
  if (!fresh.valid || !fresh.payload) return;
  const kept = store.get('receipts').filter((r) => {
    const existing = verifyReceipt(r, deviceId);
    return !existing.valid || existing.payload?.licenseId !== fresh.payload!.licenseId;
  });
  store.set('receipts', [...kept, receipt]);
  if (store.get('grandfathered')) store.set('grandfathered', false);
}

export function migrateEntitlements(): void {
  if (store.get('receipts').length > 0) return;
  if (store.get('grandfathered')) return;
  if (store.get('modules').length === 0) return;
  store.set('grandfathered', true);
  console.log('[ModuleManager] pre-receipt install, grandfathered until next Hangar contact');
}

export function getEntitlements(): { slugs: Set<string>; provisional: boolean } {
  const modules = store.get('modules');
  return entitledSlugs({
    receipts: store.get('receipts'),
    deviceId: getDeviceId(),
    grandfathered: store.get('grandfathered'),
    installedSlugs: modules.map((m) => m.slug),
  });
}

export function getInstalledModules(): InstalledModule[] {
  const { slugs } = getEntitlements();
  return store.get('modules').map((m) => ({ ...m, entitled: slugs.has(m.slug) }));
}

export function getInstalledModulesRaw(): InstalledModule[] {
  return store.get('modules');
}

/**
 * Enable or disable an installed module without removing it. Bundle modules
 * only load at startup, so a change takes effect after restart; activatable
 * modules gate renderer capabilities reactively and flip immediately.
 */
export function setModuleEnabled(slug: string, enabled: boolean): InstalledModule[] {
  const modules = store.get('modules').map((m) =>
    m.slug === slug ? { ...m, enabled } : m,
  );
  store.set('modules', modules);
  return modules;
}

// --------------------------------------------------------------------------
// Update
// --------------------------------------------------------------------------

/**
 * Update an installed module to the latest published version by re-running
 * activation for its stored license key. Activation already downloads
 * `latest`, verifies hash + signature, extracts over the install path, and
 * replaces the store record - so update is the same flow, keyed by slug.
 * Note: a key covering a bundle updates every module of that bundle.
 *
 * A free cargo has no key on record (early free installs stored an empty
 * string), so it asks the Hangar for a fresh one rather than trying to verify
 * nothing, which is how updating a free cargo came back "Invalid key format".
 */
export async function updateModule(
  slug: string,
  onProgress: (progress: ModuleProgress) => void,
): Promise<{ success: boolean; error?: string }> {
  const installed = store.get('modules').find((m) => m.slug === slug);
  if (!installed) {
    return { success: false, error: `Module ${slug} is not installed` };
  }
  if (!installed.licenseKey || !isLicenseKeyShaped(installed.licenseKey)) {
    return installFreeCargo(slug, onProgress);
  }
  return activateLicense(installed.licenseKey, onProgress, { reactivate: true });
}

// --------------------------------------------------------------------------
// Remove License
// --------------------------------------------------------------------------

export async function removeLicense(key: string): Promise<{ success: boolean; error?: string }> {
  const deviceId = getDeviceId();

  // Deactivate on server (best-effort)
  try {
    await hangar.deactivate(key, deviceId);
  } catch (err) {
    console.warn('[ModuleManager] Server deactivation failed (continuing with local removal):', err);
  }

  // Remove modules associated with this key
  const currentModules = store.get('modules');
  const toRemove = currentModules.filter((m) => m.licenseKey === key);
  const remaining = currentModules.filter((m) => m.licenseKey !== key);
  store.set('modules', remaining);

  // Remove the key
  const currentKeys = store.get('licenseKeys');
  store.set('licenseKeys', currentKeys.filter((k) => k !== key));

  // Clean up downloaded files
  for (const mod of toRemove) {
    try {
      const moduleDir = join(app.getPath('userData'), 'modules', mod.slug);
      await rm(moduleDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }

  return { success: true };
}

// --------------------------------------------------------------------------
// Check for Updates
// --------------------------------------------------------------------------

export async function checkForUpdates(): Promise<UpdateAvailable[]> {
  const modules = store.get('modules');
  if (modules.length === 0) return [];

  const installed = modules.map((m) => ({ slug: m.slug, version: m.version }));

  // Errors propagate: the UI must be able to tell "up to date" from "the
  // check never reached the server".
  const result = await hangar.checkUpdates(installed);
  return result.updates;
}

// --------------------------------------------------------------------------
// Heartbeat - validate all keys are still active
// --------------------------------------------------------------------------

export async function heartbeatAll(): Promise<void> {
  const keys = store.get('licenseKeys');
  const deviceId = getDeviceId();

  for (const key of keys) {
    try {
      const result = await hangar.heartbeat(key, deviceId);
      // Only an explicit revocation removes anything: `valid: false` also means
      // "this Hangar has never seen the key", which a dev build pointed at the
      // local Hangar answers for every production key.
      if (result.receipt) storeReceipt(result.receipt);
      if (result.revoked === true) {
        console.warn(`[ModuleManager] License ${key.slice(0, 20)}... was revoked, removing its modules`);
        const currentModules = store.get('modules');
        store.set('modules', currentModules.filter((m) => m.licenseKey !== key));
        const currentKeys = store.get('licenseKeys');
        store.set('licenseKeys', currentKeys.filter((k) => k !== key));
      } else if (!result.valid) {
        console.warn(`[ModuleManager] License ${key.slice(0, 20)}... not recognised by ${hangar.baseUrl()}, keeping it installed`);
      }
    } catch (err) {
      // Network error - don't remove anything, try again next time
      console.warn('[ModuleManager] Heartbeat failed for key, will retry:', err);
    }
  }
}
