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
import { createWriteStream } from 'node:fs';
import { mkdir, access, rm, rename, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import type {
  ArduPilotVehicleType,
  ArduPilotReleaseTrack,
  ArduPilotSitlDownloadProgress,
  ArduPilotSitlBinaryInfo,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { t } from '../../shared/i18n/index.js';

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
    const capitalizedType = vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
    urlPath = `${capitalizedType}Stable/${vehicle.cygwinBinary}.elf`;
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
    const tempPath = `${binaryPath}.tmp`;

    this.abortController = new AbortController();

    try {
      await mkdir(binaryDir, { recursive: true });

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

      const writeStream = createWriteStream(tempPath);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body'); // i18n-exempt
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesDownloaded += value.length;
        writeStream.write(value);

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
      await rename(tempPath, binaryPath);

      this.sendProgress({
        vehicleType, releaseTrack,
        progress: 100, bytesDownloaded: totalBytes, totalBytes,
        status: 'complete',
      });

      return { success: true, path: binaryPath };
    } catch (err) {
      try { await rm(tempPath, { force: true }); } catch { /* ignore */ }

      const errorMessage = err instanceof Error ? err.message : t('common:unknownError');
      this.sendProgress({
        vehicleType, releaseTrack,
        progress: 0, bytesDownloaded: 0, totalBytes: 0,
        status: 'error', error: errorMessage,
      });
      return { success: false, error: errorMessage };
    } finally {
      this.abortController = null;
    }
  }

  async downloadCygwin(): Promise<{ success: boolean; error?: string }> {
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

      for (const dll of dlls) {
        const url = `${CYGWIN_BASE_URL}/${dll}`;
        const dllPath = path.join(cygwinDir, dll);

        try { await access(dllPath); continue; } catch { /* need download */ }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`${dll}: HTTP ${response.status} ${response.statusText} — ${url}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const { writeFile } = await import('node:fs/promises');
        await writeFile(dllPath, Buffer.from(arrayBuffer));
      }

      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : t('common:unknownError') };
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
