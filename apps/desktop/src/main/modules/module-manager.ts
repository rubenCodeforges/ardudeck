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
import { verifyLicenseKey, verifyBundleSignature } from './license-validator.js';
import * as hangar from './hangar-client.js';
import { extractBundle } from './module-extract.js';
import type {
  InstalledModule,
  ModuleProgress,
  UpdateAvailable,
} from '../../shared/module-types.js';

// --------------------------------------------------------------------------
// Persistent store
// --------------------------------------------------------------------------

interface ModuleStoreSchema {
  deviceId: string;
  modules: InstalledModule[];
  licenseKeys: string[]; // all activated keys
}

const store = new Store<ModuleStoreSchema>({
  name: 'modules',
  defaults: {
    deviceId: '',
    modules: [],
    licenseKeys: [],
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
  onProgress({ stage: 'validating', message: 'Validating license key...' });

  const verification = verifyLicenseKey(key);
  if (!verification.valid) {
    onProgress({ stage: 'error', message: verification.error || 'Invalid license key' });
    return { success: false, error: verification.error || 'Invalid license key' };
  }

  // Check if already activated (manual double-add, not an update)
  const existingKeys = store.get('licenseKeys');
  if (!opts?.reactivate && existingKeys.includes(key)) {
    onProgress({ stage: 'error', message: 'This license key is already activated' });
    return { success: false, error: 'This license key is already activated' };
  }

  // 2. API activation
  onProgress({ stage: 'activating', message: 'Activating with server...' });

  const deviceId = getDeviceId();
  const deviceName = getDeviceName();

  let activateResult;
  try {
    activateResult = await hangar.activate(key, deviceId, deviceName);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onProgress({ stage: 'error', message: `Activation failed: ${msg}` });
    return { success: false, error: msg };
  }

  if (!activateResult.ok) {
    onProgress({ stage: 'error', message: activateResult.error || 'Activation rejected' });
    return { success: false, error: activateResult.error || 'Activation rejected' };
  }

  // 3. Download each module bundle (activatable modules ship in the app, so
  //    they are enabled in place - no download/extract).
  const modules = activateResult.modules;
  const activatableSlugs = new Set(activateResult.activatable ?? []);
  const newModules: InstalledModule[] = [];

  for (let i = 0; i < modules.length; i++) {
    const slug = modules[i]!;
    const moduleIndex = i + 1;

    if (activatableSlugs.has(slug)) {
      onProgress({
        stage: 'activating',
        message: `Enabling ${slug} (${moduleIndex}/${modules.length})...`,
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
      message: `Downloading ${slug} (${moduleIndex}/${modules.length})...`,
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
            message: `Downloading ${slug} (${moduleIndex}/${modules.length})...`,
            percent: Math.round(((i + dlPercent / 100) / modules.length) * 100),
          });
        },
      );

      // 4. Verify bundle signature
      onProgress({
        stage: 'verifying',
        message: `Verifying ${slug}...`,
        percent: Math.round(((i + 0.9) / modules.length) * 100),
      });

      // Integrity: the locally-computed SHA256 must match the server's
      // declared hash, and when the server returns an Ed25519 bundle
      // signature it must verify against the embedded Hangar key.
      // Absent headers only warn - servers predating them still install.
      if (hash && localHash !== hash) {
        await rm(filePath, { force: true });
        throw new Error(`Bundle hash mismatch for ${slug} - download corrupted or tampered with`);
      }
      if (!hash) {
        console.warn(`[ModuleManager] No bundle hash for ${slug}, skipping hash verification`);
      }
      if (sig) {
        if (!verifyBundleSignature(filePath, sig)) {
          await rm(filePath, { force: true });
          throw new Error(`Bundle signature verification failed for ${slug}`);
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
        throw new Error(`Invalid manifest for ${slug}: ${parsed.error}`);
      }

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
      onProgress({ stage: 'error', message: `Failed to download ${slug}: ${msg}` });
      return { success: false, error: `Failed to download ${slug}: ${msg}` };
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

  onProgress({ stage: 'complete', message: `Activated ${newModules.length} module(s)`, percent: 100 });

  return { success: true };
}

// --------------------------------------------------------------------------
// Get Installed Modules
// --------------------------------------------------------------------------

export function getInstalledModules(): InstalledModule[] {
  return store.get('modules');
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
 */
export async function updateModule(
  slug: string,
  onProgress: (progress: ModuleProgress) => void,
): Promise<{ success: boolean; error?: string }> {
  const installed = store.get('modules').find((m) => m.slug === slug);
  if (!installed) {
    return { success: false, error: `Module ${slug} is not installed` };
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
      if (!result.valid) {
        console.warn(`[ModuleManager] License ${key.slice(0, 20)}... is no longer valid (revoked=${result.revoked})`);
        // Remove the license and its modules
        const currentModules = store.get('modules');
        store.set('modules', currentModules.filter((m) => m.licenseKey !== key));
        const currentKeys = store.get('licenseKeys');
        store.set('licenseKeys', currentKeys.filter((k) => k !== key));
      }
    } catch (err) {
      // Network error - don't remove anything, try again next time
      console.warn('[ModuleManager] Heartbeat failed for key, will retry:', err);
    }
  }
}
