/**
 * PX4 SITL Downloader
 *
 * Unlike ArduPilot (one native binary per vehicle), PX4 SITL ships as a single
 * self-contained BUNDLE per release track. Each bundle is a `.tar.gz` holding:
 *
 *   bin/px4      the SITL executable (covers every airframe)
 *   rootfs/      startup scripts + params PX4 needs at runtime
 *   jmavsim/     the jMAVSim visualiser launch scripts (needs a JRE)
 *
 * The airframe is NOT chosen at download time: one bundle serves all frames and
 * the frame is selected at launch via PX4_SIM_MODEL. So the downloader is keyed
 * by track only, not by vehicle type.
 *
 * Bundles come from our own ArduDeck GitHub releases (CI-built per platform):
 *   https://github.com/rubenCodeforges/ardudeck/releases/download/{tag}/px4-sitl-{track}-{platform}.tar.gz
 *
 * Native PX4 SITL builds exist for macOS (arm64/x64) and Linux x64 only.
 * Windows is unsupported (PX4 SITL there needs WSL, out of scope here).
 */

import { BrowserWindow } from 'electron';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, access, rm, rename, readdir, chmod, symlink, writeFile, readFile } from 'node:fs/promises';
import { createGunzip } from 'node:zlib';
import path from 'node:path';
import type {
  Px4ReleaseTrack,
  Px4SitlDownloadProgress,
  Px4SitlBinaryInfo,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { px4SitlBasePath, px4SitlBundleDir } from './px4-paths.js';
import { t } from '../../shared/i18n/index.js';

// ── URL sources ──────────────────────────────────────────────────────────────

const GITHUB_RELEASES_URL = 'https://github.com/rubenCodeforges/ardudeck/releases/download';

/**
 * Release tag for our GitHub-hosted PX4 SITL bundles.
 * Must match the tag produced by the PX4 SITL build workflow, exactly like
 * ArduPilot's SITL_RELEASE_TAG. Update this when a new bundle is published.
 */
const PX4_SITL_RELEASE_TAG = 'px4-sitl-vmaster-20260814';

// PX4 upstream branches each track resolves to on the CI side:
//   stable -> release/x.y  |  beta -> beta  |  dev -> main
const TRACK_MAP: Record<Px4ReleaseTrack, string> = {
  stable: 'stable',
  beta: 'beta',
  dev: 'main',
};

type Px4Platform = 'macos-arm64' | 'macos-x64' | 'linux-x64';

/** Resolve the current host to a bundle platform slug, or null if unsupported. */
function getPlatform(): Px4Platform | null {
  if (process.platform === 'darwin') {
    return process.arch === 'x64' ? 'macos-x64' : 'macos-arm64';
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    return 'linux-x64';
  }
  return null;
}

function getDownloadUrl(track: Px4ReleaseTrack, platform: Px4Platform): string {
  // TRACK_MAP feeds the CI naming; here the asset is keyed by the raw track slug.
  return `${GITHUB_RELEASES_URL}/${PX4_SITL_RELEASE_TAG}/px4-sitl-${track}-${platform}.tar.gz`;
}

// ── Minimal tar.gz extraction ────────────────────────────────────────────────
// package.json ships adm-zip (ZIP only) and no tar lib, so we gunzip via node's
// built-in zlib and walk the tar blocks ourselves. Handles ustar, GNU long
// names ('L') and pax path overrides ('x'/'g') so long rootfs paths survive.

function readTarString(block: Buffer, offset: number, length: number): string {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return raw.toString('utf8', 0, end === -1 ? length : end);
}

/** Extract a pax "path=" record, if present, from a pax header payload. */
function paxPath(payload: Buffer): string | null {
  const text = payload.toString('utf8');
  // Records are "<len> key=value\n"; we only care about path.
  const match = text.match(/\d+ path=([^\n]*)\n/);
  return match ? match[1] ?? null : null;
}

async function extractTarGz(tarGzPath: string, destDir: string): Promise<void> {
  const gunzip = createGunzip();
  createReadStream(tarGzPath).pipe(gunzip);

  const chunks: Buffer[] = [];
  for await (const chunk of gunzip) {
    chunks.push(chunk as Buffer);
  }
  const data = Buffer.concat(chunks);

  const resolvedRoot = path.resolve(destDir);
  let overrideName: string | null = null; // pending name from an 'L' or pax header
  let offset = 0;

  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    offset += 512;

    // Two consecutive zero blocks terminate the archive; a single one is enough
    // for us to stop safely.
    if (header.every(b => b === 0)) break;

    const name = readTarString(header, 0, 100);
    const sizeField = readTarString(header, 124, 12).trim();
    const size = sizeField ? parseInt(sizeField, 8) || 0 : 0;
    const typeflag = String.fromCharCode(header[156] ?? 0) || '0';
    const prefix = readTarString(header, 345, 155);
    const linkname = readTarString(header, 157, 100);

    const payload = data.subarray(offset, offset + size);
    offset += Math.ceil(size / 512) * 512; // data is padded to 512-byte boundary

    if (typeflag === 'L') {
      // GNU long-name entry: its payload is the name of the NEXT entry.
      overrideName = payload.toString('utf8').replace(/\0+$/, '');
      continue;
    }
    if (typeflag === 'x' || typeflag === 'g') {
      const p = paxPath(payload);
      if (p) overrideName = p;
      continue;
    }

    let fullName = overrideName ?? (prefix ? `${prefix}/${name}` : name);
    overrideName = null;
    if (!fullName) continue;

    // Guard against path traversal in a malformed/hostile archive.
    const destPath = path.resolve(resolvedRoot, fullName);
    if (destPath !== resolvedRoot && !destPath.startsWith(resolvedRoot + path.sep)) {
      throw new Error(`Refusing to extract entry outside target dir: ${fullName}`);
    }

    if (typeflag === '5' || fullName.endsWith('/')) {
      await mkdir(destPath, { recursive: true });
      continue;
    }
    if (typeflag === '2' && linkname) {
      await mkdir(path.dirname(destPath), { recursive: true });
      try { await rm(destPath, { force: true }); } catch { /* ignore */ }
      await symlink(linkname, destPath);
      continue;
    }

    // Regular file ('0' or legacy '\0').
    await mkdir(path.dirname(destPath), { recursive: true });
    await writeFile(destPath, payload);
  }
}

// ── Downloader ───────────────────────────────────────────────────────────────

class Px4SitlDownloader {
  private mainWindow: BrowserWindow | null = null;
  private abortController: AbortController | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  private getBasePath(): string {
    return px4SitlBasePath();
  }

  getBundleDir(track: Px4ReleaseTrack): string {
    return px4SitlBundleDir(track);
  }

  getBinaryPath(track: Px4ReleaseTrack): string {
    return path.join(this.getBundleDir(track), 'bin', 'px4');
  }

  private getMetaPath(track: Px4ReleaseTrack): string {
    return path.join(this.getBundleDir(track), '.meta.json');
  }

  async checkBinary(track: Px4ReleaseTrack): Promise<Px4SitlBinaryInfo> {
    const binaryPath = this.getBinaryPath(track);

    try {
      await access(binaryPath);
    } catch {
      return { releaseTrack: track, exists: false };
    }

    let downloadedAt: string | undefined;
    try {
      const meta = JSON.parse(await readFile(this.getMetaPath(track), 'utf8'));
      if (typeof meta?.downloadedAt === 'string') downloadedAt = meta.downloadedAt;
    } catch { /* no/unreadable meta — still report the binary as present */ }

    return { releaseTrack: track, exists: true, path: binaryPath, downloadedAt };
  }

  /**
   * Whether PX4 SITL can run on this host. `needsJava` is always true because
   * the bundled jMAVSim visualiser needs a JRE; the caller checks for `java`
   * on PATH and warns the user if it is missing.
   */
  checkPlatform(): { supported: boolean; needsJava: boolean; error?: string } {
    const platform = getPlatform();
    if (!platform) {
      const error = process.platform === 'win32'
        ? t('main:sitl.px4WindowsUnsupported')
        : t('main:sitl.px4PlatformUnsupported', { platform: process.platform, arch: process.arch });
      return { supported: false, needsJava: true, error };
    }
    return { supported: true, needsJava: true };
  }

  async download(track: Px4ReleaseTrack): Promise<{ success: boolean; path?: string; error?: string }> {
    const platform = getPlatform();
    if (!platform) {
      const error = this.checkPlatform().error ?? t('main:sitl.unsupportedPlatform');
      this.sendProgress({
        releaseTrack: track,
        progress: 0, bytesDownloaded: 0, totalBytes: 0,
        status: 'error', error,
      });
      return { success: false, error };
    }

    const bundleDir = this.getBundleDir(track);
    const basePath = this.getBasePath();
    const tempArchive = path.join(basePath, `${track}.download.tmp.tar.gz`);
    const tempExtractDir = path.join(basePath, `${track}.extract.tmp`);

    this.abortController = new AbortController();

    try {
      await mkdir(basePath, { recursive: true });
      // Clear stale temp artefacts from an aborted previous run.
      await rm(tempArchive, { force: true });
      await rm(tempExtractDir, { recursive: true, force: true });

      const url = getDownloadUrl(track, platform);

      this.sendProgress({
        releaseTrack: track,
        progress: 0, bytesDownloaded: 0, totalBytes: 0,
        status: 'downloading',
      });

      const response = await fetch(url, { signal: this.abortController.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText} — ${url}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      let bytesDownloaded = 0;

      const writeStream = createWriteStream(tempArchive);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body'); // i18n-exempt
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        bytesDownloaded += value.length;
        writeStream.write(value);

        // Reserve the final 10% of the bar for extraction below.
        const progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 90) : 0;
        this.sendProgress({
          releaseTrack: track,
          progress, bytesDownloaded, totalBytes,
          status: 'downloading',
        });
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });

      this.sendProgress({
        releaseTrack: track,
        progress: 90, bytesDownloaded, totalBytes,
        status: 'extracting',
      });

      await mkdir(tempExtractDir, { recursive: true });
      await extractTarGz(tempArchive, tempExtractDir);
      await rm(tempArchive, { force: true });

      // The bundle must contain bin/px4; bail before swapping if it doesn't.
      const extractedBinary = path.join(tempExtractDir, 'bin', 'px4');
      try {
        await access(extractedBinary);
      } catch {
        throw new Error(t('main:sitl.bundleMissingPx4'));
      }

      // Atomic swap: remove any previous bundle, then rename the temp dir in.
      await rm(bundleDir, { recursive: true, force: true });
      await rename(tempExtractDir, bundleDir);

      // Tar mode bits are unreliable across platforms, so set exec explicitly.
      await chmod(this.getBinaryPath(track), 0o755);
      const jmavsimDir = path.join(bundleDir, 'jmavsim');
      try {
        const entries = await readdir(jmavsimDir);
        await Promise.all(
          entries
            .filter(name => name.endsWith('.sh'))
            .map(name => chmod(path.join(jmavsimDir, name), 0o755).catch(() => {})),
        );
      } catch { /* no jmavsim dir in this bundle — fine */ }

      await writeFile(
        this.getMetaPath(track),
        JSON.stringify({
          releaseTrack: track,
          tag: PX4_SITL_RELEASE_TAG,
          branch: TRACK_MAP[track],
          platform,
          downloadedAt: new Date().toISOString(),
        }, null, 2),
      );

      this.sendProgress({
        releaseTrack: track,
        progress: 100, bytesDownloaded: totalBytes, totalBytes,
        status: 'complete',
      });

      return { success: true, path: this.getBinaryPath(track) };
    } catch (err) {
      try { await rm(tempArchive, { force: true }); } catch { /* ignore */ }
      try { await rm(tempExtractDir, { recursive: true, force: true }); } catch { /* ignore */ }

      const errorMessage = err instanceof Error ? err.message : t('common:unknownError');
      this.sendProgress({
        releaseTrack: track,
        progress: 0, bytesDownloaded: 0, totalBytes: 0,
        status: 'error', error: errorMessage,
      });
      return { success: false, error: errorMessage };
    } finally {
      this.abortController = null;
    }
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  private sendProgress(progress: Px4SitlDownloadProgress): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.PX4_SITL_DOWNLOAD_PROGRESS, progress);
    }
  }
}

export const px4SitlDownloader = new Px4SitlDownloader();
