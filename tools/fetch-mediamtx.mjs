/**
 * Fetch the mediamtx binary into apps/desktop/resources/bin/<platform>/ so a
 * packaged build ships with a working video engine.
 *
 * Without it, resources/bin holds nothing but .gitkeep in a release build (the
 * binaries are gitignored), the media hub never starts, and every RTSP, SRT,
 * RTP and wfb-ng feed fails. UVC feeds keep working because they run in the
 * renderer and never touch the hub, which is what makes it look like "custom
 * RTSP is broken" rather than "video is broken".
 *
 * mediamtx ONLY, deliberately. ffmpeg stays an on-demand download: the
 * ffmpeg-static builds are GPL and shipping one in the installer would put the
 * whole app under GPL terms. mediamtx is MIT, and it is all the RTSP-to-WebRTC
 * path needs; ffmpeg is only required for UDP bridging, snapshot, record and
 * the H.264 relay, which degrade with a clear message.
 *
 * Usage: node tools/fetch-mediamtx.mjs [platform] [arch]
 *        defaults to the host platform/arch.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOWNLOADER = join(root, 'apps/desktop/src/main/media/media-binaries-downloader.ts');

/** One source of truth for the version: the runtime downloader's own tag. */
function mediamtxTag() {
  const src = readFileSync(DOWNLOADER, 'utf8');
  const m = src.match(/const MEDIAMTX_TAG = '([^']+)'/);
  if (!m) throw new Error(`Could not read MEDIAMTX_TAG from ${DOWNLOADER}`);
  return m[1];
}

/** Matches mediamtxToken() in the downloader, so CI and runtime agree. */
function assetToken(platform, arch) {
  const os = platform === 'win32' ? 'windows' : platform;
  const a = arch === 'arm64' ? (platform === 'linux' ? 'arm64v8' : 'arm64') : 'amd64';
  return `${os}_${a}`;
}

async function main() {
  const platform = process.argv[2] ?? process.platform;
  const arch = process.argv[3] ?? process.arch;
  const tag = mediamtxTag();
  const ext = platform === 'win32' ? 'zip' : 'tar.gz';
  const url = `https://github.com/bluenviron/mediamtx/releases/download/${tag}/mediamtx_${tag}_${assetToken(platform, arch)}.${ext}`;

  const outDir = join(root, 'apps/desktop/resources/bin', platform);
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, platform === 'win32' ? 'mediamtx.exe' : 'mediamtx');

  if (existsSync(out)) {
    console.log(`mediamtx already present at ${out}`);
    return;
  }

  console.log(`Fetching ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const tmp = join(outDir, `mediamtx-download.${ext}`);
  writeFileSync(tmp, buf);
  try {
    if (ext === 'zip') {
      // bsdtar ships with Windows runners and GitHub's macOS/Linux images.
      const r = spawnSync('tar', ['xf', tmp, '-C', outDir, 'mediamtx.exe'], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('Failed to extract mediamtx.exe');
    } else {
      const r = spawnSync('tar', ['xzf', tmp, '-C', outDir, 'mediamtx'], { stdio: 'inherit' });
      if (r.status !== 0) throw new Error('Failed to extract mediamtx');
    }
  } finally {
    rmSync(tmp, { force: true });
  }

  if (!existsSync(out)) throw new Error(`Extraction produced no binary at ${out}`);
  if (platform !== 'win32') chmodSync(out, 0o755);
  console.log(`mediamtx ${tag} -> ${out}`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
