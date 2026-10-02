/**
 * On-demand downloader for the media-engine binaries (ffmpeg + mediamtx).
 *
 * We deliberately do NOT bundle these in the installer: ffmpeg is ~45MB per
 * platform (and a GPL build would impose GPL terms on the whole app), mediamtx
 * is ~50MB. Instead — mirroring the ArduPilot SITL downloader — we fetch them
 * on first use into userData, so the app never *distributes* ffmpeg and the
 * installer stays lean. A locally-bundled copy in resources/bin/<platform>/
 * (e.g. a dev `brew install`) still takes precedence.
 *
 * Sources:
 *  - ffmpeg : eugeneware/ffmpeg-static releases — a single gzipped binary per
 *             platform/arch. Just gunzip.
 *  - mediamtx: bluenviron/mediamtx releases — tar.gz (unix) / zip (windows).
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync, mkdirSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { app } from 'electron';
import AdmZip from 'adm-zip';
import {
  HttpStatusError,
  describeWfbRxDownloadError,
  isWfbRxBuiltFor,
  wfbRxAssetUrl,
  wfbRxNotBuiltMessage,
} from './wfb-rx-release.js';
import { t } from '../../shared/i18n/index.js';

const FFMPEG_TAG = 'b6.1.1';
const MEDIAMTX_TAG = 'v1.19.1';

export type DownloadName = 'ffmpeg' | 'mediamtx' | 'ardudeck-wfb-rx';

/** ffmpeg-static asset arch token. */
function archToken(): 'arm64' | 'x64' {
  return process.arch === 'arm64' ? 'arm64' : 'x64';
}

/** mediamtx asset os/arch token, e.g. darwin_arm64, linux_amd64, windows_amd64. */
function mediamtxToken(): string {
  const os = process.platform === 'win32' ? 'windows' : process.platform; // darwin | linux | windows
  const arch =
    process.arch === 'arm64'
      ? process.platform === 'linux' ? 'arm64v8' : 'arm64'
      : 'amd64';
  return `${os}_${arch}`;
}

export class MediaBinariesDownloader {
  /** Where downloaded binaries live (separate from any bundled resources/bin). */
  targetDir(): string {
    const dir = join(app.getPath('userData'), 'media-bin', process.platform);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return dir;
  }

  binaryPath(name: DownloadName): string {
    const ext = process.platform === 'win32' ? '.exe' : '';
    return join(this.targetDir(), name + ext);
  }

  isPresent(name: DownloadName): boolean {
    return existsSync(this.binaryPath(name));
  }

  /** Download any missing binaries. onLog gets human-readable progress lines. */
  async ensure(onLog?: (line: string) => void): Promise<{ ok: boolean; error?: string }> {
    try {
      if (!this.isPresent('ffmpeg')) {
        onLog?.('Downloading ffmpeg…');
        await this.fetchFfmpeg();
      }
      if (!this.isPresent('mediamtx')) {
        onLog?.('Downloading MediaMTX…');
        await this.fetchMediamtx();
      }
      onLog?.('Media engine ready.'); // i18n-exempt
      return { ok: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : t('main:media.downloadFailed');
      onLog?.(`Media engine download failed: ${error}`);
      return { ok: false, error };
    }
  }

  /**
   * Fetch the wfb-ng dongle receiver (built by the wfb-rx CI workflow and
   * attached to an ArduDeck release). Separate from ensure(): only wanted by
   * users with an OpenIPC/WiFiLink dongle, not every camera user.
   */
  async ensureWfbRx(onLog?: (line: string) => void): Promise<{ ok: boolean; error?: string }> {
    if (this.isPresent('ardudeck-wfb-rx')) return { ok: true };
    if (!isWfbRxBuiltFor(process.platform, process.arch)) {
      const error = wfbRxNotBuiltMessage(process.platform, process.arch);
      onLog?.(error);
      return { ok: false, error };
    }
    const url = wfbRxAssetUrl(process.platform, process.arch);
    try {
      onLog?.('Downloading the wfb-ng receiver…');
      const bin = await downloadBuffer(url);
      const out = this.binaryPath('ardudeck-wfb-rx');
      writeFileSync(out, bin);
      if (process.platform !== 'win32') chmodSync(out, 0o755);
      onLog?.('wfb-ng receiver ready.');
      return { ok: true };
    } catch (e) {
      const error = describeWfbRxDownloadError(e, process.platform, process.arch);
      onLog?.(`wfb-ng receiver download failed (${url}): ${error}`);
      return { ok: false, error };
    }
  }

  private async fetchFfmpeg(): Promise<void> {
    const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_TAG}/ffmpeg-${process.platform}-${archToken()}.gz`;
    const gz = await downloadBuffer(url);
    const bin = gunzipSync(gz);
    const out = this.binaryPath('ffmpeg');
    writeFileSync(out, bin);
    if (process.platform !== 'win32') chmodSync(out, 0o755);
  }

  private async fetchMediamtx(): Promise<void> {
    const isWin = process.platform === 'win32';
    const ext = isWin ? 'zip' : 'tar.gz';
    const url = `https://github.com/bluenviron/mediamtx/releases/download/${MEDIAMTX_TAG}/mediamtx_${MEDIAMTX_TAG}_${mediamtxToken()}.${ext}`;
    const archive = await downloadBuffer(url);
    const dir = this.targetDir();
    const out = this.binaryPath('mediamtx');

    if (isWin) {
      const zip = new AdmZip(Buffer.from(archive));
      const entry = zip.getEntries().find((e) => e.entryName.endsWith('mediamtx.exe'));
      if (!entry) throw new Error('mediamtx.exe not found in archive'); // i18n-exempt
      writeFileSync(out, entry.getData());
      return;
    }

    // Unix tar.gz — extract just the binary via the system tar (always present
    // on macOS/Linux), then drop the bundled config/license.
    const tmp = join(dir, 'mediamtx.tar.gz');
    writeFileSync(tmp, Buffer.from(archive));
    const res = spawnSync('tar', ['xzf', tmp, '-C', dir, 'mediamtx'], { stdio: 'ignore' });
    rmSync(tmp, { force: true });
    if (res.status !== 0 || !existsSync(out)) throw new Error('Failed to extract mediamtx'); // i18n-exempt
    chmodSync(out, 0o755);
  }
}

async function downloadBuffer(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new HttpStatusError(res.status, url);
  return new Uint8Array(await res.arrayBuffer());
}

export const mediaBinariesDownloader = new MediaBinariesDownloader();
