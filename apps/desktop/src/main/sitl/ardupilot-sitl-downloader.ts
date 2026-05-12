/**
 * ArduPilot SITL Downloader
 *
 * Downloads pre-built SITL binaries per platform:
 *
 * macOS (ARM64/x64): Native binaries from ArduDeck GitHub releases
 *   https://github.com/rubenCodeforges/ardudeck/releases/download/sitl-v{ver}/{binary}-macos-{arch}
 *
 * Linux x64: Native ELF from firmware.ardupilot.org
 *   https://firmware.ardupilot.org/{Vehicle}/{track}/SITL_x86_64_linux_gnu/{binary}
 *
 * Windows: Cygwin builds from firmware.ardupilot.org
 *   https://firmware.ardupilot.org/Tools/MissionPlanner/sitl/
 */

import { app, BrowserWindow } from 'electron';
import { randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { mkdir, access, rm, rename, readdir, stat, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type {
  ArduPilotVehicleType,
  ArduPilotReleaseTrack,
  ArduPilotSitlDownloadProgress,
  ArduPilotSitlBinaryInfo,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

// ── URL sources ──────────────────────────────────────────────────────────────

const GITHUB_RELEASES_URL = 'https://github.com/rubenCodeforges/ardudeck/releases/download';
const FIRMWARE_BASE_URL = 'https://firmware.ardupilot.org';
const CYGWIN_BASE_URL = 'https://firmware.ardupilot.org/Tools/MissionPlanner/sitl';

/**
 * SITL version tag for our GitHub-hosted macOS binaries.
 * Must match the release tag produced by build-sitl.yml.
 * Update this when a new SITL build is published.
 */
const SITL_RELEASE_TAG = 'sitl-vmaster-20260429';

// ── Vehicle mapping ──────────────────────────────────────────────────────────

const VEHICLE_MAP: Record<ArduPilotVehicleType, { dir: string; binary: string; cygwinBinary: string }> = {
  copter: { dir: 'Copter', binary: 'arducopter', cygwinBinary: 'ArduCopter' },
  plane: { dir: 'Plane', binary: 'arduplane', cygwinBinary: 'ArduPlane' },
  rover: { dir: 'Rover', binary: 'ardurover', cygwinBinary: 'ArduRover' },
  sub: { dir: 'Sub', binary: 'ardusub', cygwinBinary: 'ArduSub' },
};

const TRACK_MAP: Record<ArduPilotReleaseTrack, string> = {
  stable: 'stable',
  beta: 'beta',
  dev: 'latest',
};

const DOWNLOAD_MAX_ATTEMPTS = 4;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(err: unknown): boolean {
  const parts: string[] = [];
  let e: unknown = err;
  for (let i = 0; i < 5 && e; i++) {
    if (e instanceof Error) {
      parts.push(e.message, e.name);
      e = e.cause;
    } else {
      parts.push(String(e));
      break;
    }
  }
  const text = parts.join(' ');
  if (/ECONNRESET|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND|UND_ERR_SOCKET|terminated|socket|aborted|fetch failed/i.test(text)) {
    return true;
  }
  const code = (err as NodeJS.ErrnoException)?.code;
  return !!(code && /ECONNRESET|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND/.test(code));
}

function isRetriableDownloadAttempt(err: unknown): boolean {
  if (isTransientNetworkError(err)) return true;
  const msg = err instanceof Error ? err.message : '';
  return /^HTTP 5\d\d/.test(msg);
}

async function fetchBinaryWithRetries(url: string): Promise<ArrayBuffer> {
  let last: unknown;
  for (let i = 0; i < DOWNLOAD_MAX_ATTEMPTS; i++) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const err = new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);
        if (response.status >= 500 && i < DOWNLOAD_MAX_ATTEMPTS - 1) {
          last = err;
          await delay(400 * 2 ** i);
          continue;
        }
        throw err;
      }
      return await response.arrayBuffer();
    } catch (e) {
      last = e;
      if (i < DOWNLOAD_MAX_ATTEMPTS - 1 && isRetriableDownloadAttempt(e)) {
        await delay(400 * 2 ** i);
        continue;
      }
      throw e;
    }
  }
  throw last instanceof Error ? last : new Error('fetchBinaryWithRetries exhausted');
}

// ── URL builders ─────────────────────────────────────────────────────────────

function getMacDownloadUrl(vehicleType: ArduPilotVehicleType): string {
  const vehicle = VEHICLE_MAP[vehicleType];
  const arch = process.arch === 'x64' ? 'macos-x64' : 'macos-arm64';
  return `${GITHUB_RELEASES_URL}/${SITL_RELEASE_TAG}/${vehicle.binary}-${arch}`;
}

function getLinuxDownloadUrl(vehicleType: ArduPilotVehicleType, releaseTrack: ArduPilotReleaseTrack): string {
  const vehicle = VEHICLE_MAP[vehicleType];
  const track = TRACK_MAP[releaseTrack];
  return `${FIRMWARE_BASE_URL}/${vehicle.dir}/${track}/SITL_x86_64_linux_gnu/${vehicle.binary}`;
}

function getWindowsDownloadUrl(vehicleType: ArduPilotVehicleType, releaseTrack: ArduPilotReleaseTrack): string {
  const vehicle = VEHICLE_MAP[vehicleType];

  let urlPath: string;
  if (releaseTrack === 'stable') {
    // Copter/Plane/Rover use CopterStable, PlaneStable, RoverStable. Sub has no
    // SubStable/ on firmware.ardupilot.org — ArduSub.elf lives under Stable/.
    if (vehicleType === 'sub') {
      urlPath = `Stable/${vehicle.cygwinBinary}.elf`;
    } else {
      const capitalizedType = vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
      urlPath = `${capitalizedType}Stable/${vehicle.cygwinBinary}.elf`;
    }
  } else if (releaseTrack === 'beta') {
    urlPath = `Beta/${vehicle.cygwinBinary}.elf`;
  } else {
    urlPath = `${vehicle.cygwinBinary}.elf`;
  }

  return `${CYGWIN_BASE_URL}/${urlPath}`;
}

function getDownloadUrl(vehicleType: ArduPilotVehicleType, releaseTrack: ArduPilotReleaseTrack): string {
  if (process.platform === 'darwin') {
    // macOS: native binary from our GitHub releases (no Docker needed)
    return getMacDownloadUrl(vehicleType);
  }
  if (process.platform === 'win32') {
    return getWindowsDownloadUrl(vehicleType, releaseTrack);
  }
  // Linux
  return getLinuxDownloadUrl(vehicleType, releaseTrack);
}

// ── Downloader ───────────────────────────────────────────────────────────────

class ArduPilotSitlDownloader {
  private mainWindow: BrowserWindow | null = null;
  private abortController: AbortController | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private getBasePath(): string {
    return path.join(app.getPath('userData'), 'ardupilot-sitl');
  }

  /**
   * One-shot cleanup of legacy macOS cache layouts and stale tag dirs:
   *  - Pre-tag layout: `<base>/{stable,dev,beta}/<vehicle>/ardu*` for
   *    macOS users who installed before we keyed by SITL_RELEASE_TAG.
   *    These point at the broken older binaries that SIGILL on Apple
   *    Silicon — must be removed so users can't accidentally still run
   *    them (e.g. via a launch path that shortcut around getBinaryPath).
   *  - Tag-keyed layout: `<base>/macos/<old_tag>/...` from a previous
   *    SITL_RELEASE_TAG that's been bumped. Pure disk hygiene.
   * Best-effort; failures are logged but don't block startup.
   */
  async cleanupLegacyMacBinaries(): Promise<void> {
    if (process.platform !== 'darwin') return;
    const base = this.getBasePath();

    // (1) Strip the old per-track layout. Anything at `<base>/{stable,beta,dev}/`
    // is left over from before we keyed by tag.
    for (const legacyTrack of ['stable', 'beta', 'dev']) {
      const dir = path.join(base, legacyTrack);
      try {
        const s = await stat(dir);
        if (s.isDirectory()) await rm(dir, { recursive: true, force: true });
      } catch { /* not present, skip */ }
    }

    // (2) Sweep tag-keyed entries that aren't the current SITL_RELEASE_TAG.
    const macDir = path.join(base, 'macos');
    try {
      const entries = await readdir(macDir);
      await Promise.all(
        entries
          .filter(name => name !== SITL_RELEASE_TAG)
          .map(name => rm(path.join(macDir, name), { recursive: true, force: true }).catch(() => {})),
      );
    } catch { /* macos dir doesn't exist yet — fresh install, nothing to clean */ }
  }

  getBinaryPath(vehicleType: ArduPilotVehicleType, releaseTrack: ArduPilotReleaseTrack): string {
    const vehicle = VEHICLE_MAP[vehicleType];
    const basePath = this.getBasePath();

    // macOS path is keyed by SITL_RELEASE_TAG, NOT by releaseTrack: we host
    // a single ARM64 build per tag in our GH releases (`getMacDownloadUrl`
    // ignores releaseTrack), so cache should mirror that. Bumping the tag
    // in code → fresh path → automatic re-download for every existing user
    // when they update the app. Old `<basePath>/{stable,dev}/...` files
    // become orphans the OS or our future cleanup pass can sweep.
    if (process.platform === 'darwin') {
      return path.join(basePath, 'macos', SITL_RELEASE_TAG, vehicleType, vehicle.binary);
    }
    if (process.platform === 'win32') {
      return path.join(basePath, releaseTrack, vehicleType, `${vehicle.cygwinBinary}.exe`);
    }
    // Linux: keyed by releaseTrack — Linux binaries come from upstream
    // firmware.ardupilot.org and the URL differs by stable/beta/dev.
    return path.join(basePath, releaseTrack, vehicleType, vehicle.binary);
  }

  async checkBinary(vehicleType: ArduPilotVehicleType, releaseTrack: ArduPilotReleaseTrack): Promise<ArduPilotSitlBinaryInfo> {
    const binaryPath = this.getBinaryPath(vehicleType, releaseTrack);

    try {
      await access(binaryPath);
      return { vehicleType, releaseTrack, exists: true, path: binaryPath };
    } catch {
      return { vehicleType, releaseTrack, exists: false };
    }
  }

  async download(
    vehicleType: ArduPilotVehicleType,
    releaseTrack: ArduPilotReleaseTrack
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const binaryPath = this.getBinaryPath(vehicleType, releaseTrack);
    const binaryDir = path.dirname(binaryPath);
    /** Legacy partial path under userData — remove so a stale lock can't block retries. */
    const legacyTempPath = `${binaryPath}.tmp`;

    let lastErrorMessage = 'Unknown error';

    for (let attempt = 0; attempt < DOWNLOAD_MAX_ATTEMPTS; attempt++) {
      /**
       * Windows: stage in `%TEMP%` then rename/copy into userData (see class doc).
       */
      const stagingPath = path.join(
        tmpdir(),
        `ardudeck-sitl-${vehicleType}-${releaseTrack}-${randomBytes(8).toString('hex')}.part`,
      );
      this.abortController = new AbortController();

      try {
        await mkdir(binaryDir, { recursive: true });
        await rm(legacyTempPath, { force: true }).catch(() => {});

        const url = getDownloadUrl(vehicleType, releaseTrack);

        this.sendProgress({
          vehicleType, releaseTrack,
          progress: 0, bytesDownloaded: 0, totalBytes: 0,
          status: 'downloading',
        });

        const response = await fetch(url, {
          signal: this.abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);
        }

        const contentLength = response.headers.get('content-length');
        const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
        let bytesDownloaded = 0;

        const writeStream = createWriteStream(stagingPath);

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          bytesDownloaded += value.length;
          const canContinue = writeStream.write(value);
          if (!canContinue) {
            await once(writeStream, 'drain');
          }

          const progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;
          this.sendProgress({
            vehicleType, releaseTrack,
            progress, bytesDownloaded, totalBytes,
            status: 'downloading',
          });
        }

        await new Promise<void>((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          writeStream.end();
        });

        try { await rm(binaryPath, { force: true }); } catch { /* ignore */ }
        try {
          await rename(stagingPath, binaryPath);
        } catch (renameErr) {
          try {
            await copyFile(stagingPath, binaryPath);
          } catch (copyErr) {
            const r = renameErr instanceof Error ? renameErr.message : String(renameErr);
            const c = copyErr instanceof Error ? copyErr.message : String(copyErr);
            throw new Error(`Could not move SITL binary into place (${r}; copy: ${c})`);
          } finally {
            await rm(stagingPath, { force: true }).catch(() => {});
          }
        }

        this.sendProgress({
          vehicleType, releaseTrack,
          progress: 100, bytesDownloaded: totalBytes, totalBytes,
          status: 'complete',
        });

        this.abortController = null;
        return { success: true, path: binaryPath };
      } catch (err) {
        try { await rm(legacyTempPath, { force: true }); } catch { /* ignore */ }
        try { await rm(stagingPath, { force: true }); } catch { /* ignore */ }

        lastErrorMessage = err instanceof Error ? err.message : 'Unknown error';
        const retriable =
          attempt < DOWNLOAD_MAX_ATTEMPTS - 1 && isRetriableDownloadAttempt(err);

        if (retriable) {
          await delay(500 * 2 ** attempt);
          continue;
        }

        this.sendProgress({
          vehicleType, releaseTrack,
          progress: 0, bytesDownloaded: 0, totalBytes: 0,
          status: 'error', error: lastErrorMessage,
        });
        this.abortController = null;
        return { success: false, error: lastErrorMessage };
      }
    }

    return { success: false, error: lastErrorMessage };
  }

  async downloadCygwin(
    vehicleType: ArduPilotVehicleType,
    releaseTrack: ArduPilotReleaseTrack,
  ): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'win32') {
      return { success: true };
    }

    const cygwinDir = path.join(this.getBasePath(), 'cygwin');

    try {
      await mkdir(cygwinDir, { recursive: true });

      // Cygwin runtime DLLs required by the Mission Planner-provided ArduPilot
      // SITL binaries. They live in the root of /Tools/MissionPlanner/sitl/
      // (not a cygwin/ subdir — that path 404s). Keep this list in sync with
      // the actual dependencies of the .elf files on that server.
      const dlls = [
        'cygwin1.dll',
        'cyggcc_s-1.dll',
        'cyggcc_s-seh-1.dll',
        'cygstdc++-6.dll',
        'cygatomic-1.dll',
        'cyggomp-1.dll',
        'cygiconv-2.dll',
        'cygintl-8.dll',
        'cygquadmath-0.dll',
        'cygssp-0.dll',
      ];

      const needFetch: string[] = [];
      for (const dll of dlls) {
        const dllPath = path.join(cygwinDir, dll);
        try {
          await access(dllPath);
        } catch {
          needFetch.push(dll);
        }
      }

      const totalToFetch = needFetch.length;
      let fetched = 0;

      this.sendProgress({
        vehicleType,
        releaseTrack,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: totalToFetch || dlls.length,
        status: 'preparing',
      });

      for (const dll of dlls) {
        const url = `${CYGWIN_BASE_URL}/${dll}`;
        const dllPath = path.join(cygwinDir, dll);

        try {
          await access(dllPath);
        } catch {
          const arrayBuffer = await fetchBinaryWithRetries(url);
          await writeFile(dllPath, Buffer.from(arrayBuffer));
          fetched += 1;
          const denom = totalToFetch || dlls.length;
          this.sendProgress({
            vehicleType,
            releaseTrack,
            progress: denom > 0 ? Math.round((fetched / denom) * 100) : 100,
            bytesDownloaded: fetched,
            totalBytes: denom,
            status: 'preparing',
          });
        }
      }

      if (totalToFetch === 0) {
        this.sendProgress({
          vehicleType,
          releaseTrack,
          progress: 100,
          bytesDownloaded: dlls.length,
          totalBytes: dlls.length,
          status: 'preparing',
        });
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.sendProgress({
        vehicleType,
        releaseTrack,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'error',
        error: message,
      });
      return { success: false, error: message };
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private sendProgress(progress: ArduPilotSitlDownloadProgress): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.ARDUPILOT_SITL_DOWNLOAD_PROGRESS, progress);
    }
  }
}

export const ardupilotSitlDownloader = new ArduPilotSitlDownloader();
