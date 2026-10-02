/**
 * EdgeTX SD card detection.
 *
 * An EdgeTX radio in "USB Storage (SD)" mode mounts as a plain mass-storage
 * volume. We identify EdgeTX cards by their characteristic directory
 * structure rather than volume names, which vary per radio and card.
 */

import { readdir, readFile, stat, statfs } from 'fs/promises';
import path from 'path';
import type { EdgeTxSdCard } from '../../shared/edgetx-types.js';

export type { EdgeTxSdCard };

// EdgeTX writes RADIO/radio.yml itself; SCRIPTS only exists once the SD pack is copied on.
const SIGNATURE_DIRS = ['SCRIPTS', 'RADIO'];

/**
 * EdgeTX target name (radio.yml `board:`) -> screen variant + display name.
 * Knowing the radio is what tells us whether the user gets a widget (colour)
 * or a telemetry script (monochrome); an unlisted board stays null so the UI
 * asks instead of guessing wrong.
 */
const BOARDS: Record<string, { variant: string; label: string }> = {
  // 128x64 monochrome
  pocket: { variant: 'bw128x64', label: 'RadioMaster Pocket' },
  boxer: { variant: 'bw128x64', label: 'RadioMaster Boxer' },
  zorro: { variant: 'bw128x64', label: 'RadioMaster Zorro' },
  tx12: { variant: 'bw128x64', label: 'RadioMaster TX12' },
  tx12mk2: { variant: 'bw128x64', label: 'RadioMaster TX12 MkII' },
  mt12: { variant: 'bw128x64', label: 'RadioMaster MT12' },
  t8: { variant: 'bw128x64', label: 'Jumper T8' },
  t12: { variant: 'bw128x64', label: 'Jumper T12' },
  t20: { variant: 'bw128x64', label: 'Jumper T20' },
  tlite: { variant: 'bw128x64', label: 'Jumper T-Lite' },
  tpro: { variant: 'bw128x64', label: 'Jumper T-Pro' },
  tprov2: { variant: 'bw128x64', label: 'Jumper T-Pro V2' },
  x7: { variant: 'bw128x64', label: 'FrSky QX7' },
  x7access: { variant: 'bw128x64', label: 'FrSky QX7 ACCESS' },
  xlite: { variant: 'bw128x64', label: 'FrSky X-Lite' },
  xlites: { variant: 'bw128x64', label: 'FrSky X-Lite S' },
  x9lite: { variant: 'bw128x64', label: 'FrSky X9 Lite' },
  x9lites: { variant: 'bw128x64', label: 'FrSky X9 Lite S' },
  commando8: { variant: 'bw128x64', label: 'iFlight Commando 8' },
  lr3pro: { variant: 'bw128x64', label: 'BetaFPV LR3 Pro' },
  // 212x64 monochrome
  x9d: { variant: 'bw212x64', label: 'FrSky Taranis X9D' },
  'x9d+': { variant: 'bw212x64', label: 'FrSky Taranis X9D+' },
  'x9d+2019': { variant: 'bw212x64', label: 'FrSky Taranis X9D+ 2019' },
  x9e: { variant: 'bw212x64', label: 'FrSky Taranis X9E' },
  // colour
  tx15: { variant: 'c480x320', label: 'RadioMaster TX15' },
  tx16s: { variant: 'c480x272', label: 'RadioMaster TX16S' },
  t16: { variant: 'c480x272', label: 'Jumper T16' },
  t18: { variant: 'c480x272', label: 'Jumper T18' },
  x10: { variant: 'c480x272', label: 'FrSky Horus X10' },
  x10express: { variant: 'c480x272', label: 'FrSky Horus X10 Express' },
  x12s: { variant: 'c480x272', label: 'FrSky Horus X12S' },
  nv14: { variant: 'c320x480', label: 'Flysky NV14' }, // i18n-exempt
  el18: { variant: 'c320x480', label: 'Flysky EL18' }, // i18n-exempt
  pl18: { variant: 'c320x480', label: 'Flysky PL18' }, // i18n-exempt
};

/** Pull `board:` and `semver:` out of RADIO/radio.yml (flat top-level keys). */
async function readRadioIdentity(volumePath: string): Promise<{ board: string | null; firmwareVersion: string | null }> {
  try {
    const raw = await readFile(path.join(volumePath, 'RADIO', 'radio.yml'), 'utf8');
    const board = raw.match(/^board:\s*(\S+)/m)?.[1] ?? null;
    const firmwareVersion = raw.match(/^semver:\s*(\S+)/m)?.[1] ?? null;
    return { board: board?.replace(/^["']|["']$/g, '') ?? null, firmwareVersion };
  } catch {
    // OpenTX-era cards keep radio settings in EEPROM, not on the card.
    return { board: null, firmwareVersion: null };
  }
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check a single mounted volume for the EdgeTX SD signature.
 * Returns null when the volume is not an EdgeTX card.
 */
export async function probeVolume(volumePath: string): Promise<EdgeTxSdCard | null> {
  const hasRadioYml = await stat(path.join(volumePath, 'RADIO', 'radio.yml')).then((s) => s.isFile(), () => false);
  if (!hasRadioYml) {
    for (const dir of SIGNATURE_DIRS) {
      if (!(await isDir(path.join(volumePath, dir)))) return null;
    }
  }

  let sdCardVersion: string | null = null;
  try {
    sdCardVersion = (await readFile(path.join(volumePath, 'edgetx.sdcard.version'), 'utf8')).trim();
  } catch {
    // OpenTX-era cards and minimal cards lack the version file; the directory
    // signature alone is enough to operate on.
  }

  let freeBytes = 0;
  try {
    const fsStat = await statfs(volumePath);
    freeBytes = fsStat.bavail * fsStat.bsize;
  } catch {
    // statfs may fail on exotic filesystems; treat as unknown rather than skip
  }

  const { board, firmwareVersion } = await readRadioIdentity(volumePath);
  const known = board ? BOARDS[board.toLowerCase()] : undefined;

  return {
    volumePath,
    volumeName: path.basename(volumePath),
    sdCardVersion,
    freeBytes,
    hasWidgets: await isDir(path.join(volumePath, 'WIDGETS')),
    board,
    firmwareVersion,
    suggestedVariantId: known?.variant ?? null,
    radioLabel: known?.label ?? null,
  };
}

/** Candidate mount roots per platform. */
async function candidateVolumes(): Promise<string[]> {
  if (process.platform === 'darwin') {
    try {
      const entries = await readdir('/Volumes');
      return entries.map((e) => path.join('/Volumes', e));
    } catch {
      return [];
    }
  }
  if (process.platform === 'win32') {
    // Probe drive letters D-Z; A-C are floppy/system by convention.
    return Array.from({ length: 23 }, (_, i) => `${String.fromCharCode(68 + i)}:\\`);
  }
  // Linux: udisks mounts at /media/<user>/<label> (Debian/Ubuntu) or
  // /run/media/<user>/<label> (Fedora/Arch); /proc/self/mounts catches the rest.
  const found = new Set<string>();
  try {
    const mounts = await readFile('/proc/self/mounts', 'utf8');
    for (const line of mounts.split('\n')) {
      const [, rawMount, fsType] = line.split(' ');
      if (!rawMount || !fsType) continue;
      const mount = rawMount.replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)));
      const removableFs = /^(vfat|exfat|msdos|fuseblk|ntfs3?)$/.test(fsType);
      const removableRoot = /^\/(media|run\/media|mnt)\//.test(mount);
      if (removableFs || removableRoot) found.add(mount);
    }
  } catch {
    // no procfs; fall through to directory walk
  }
  const roots = ['/media', '/run/media', '/mnt'];
  for (const root of roots) {
    for (const e of await readdir(root).catch(() => [] as string[])) {
      const level1 = path.join(root, e);
      found.add(level1);
      for (const e2 of await readdir(level1).catch(() => [] as string[])) {
        found.add(path.join(level1, e2));
      }
    }
  }
  return [...found];
}

/** Scan all mounted volumes for EdgeTX SD cards. */
export async function scanForEdgeTxCards(): Promise<EdgeTxSdCard[]> {
  const volumes = await candidateVolumes();
  const results = await Promise.all(volumes.map((v) => probeVolume(v).catch(() => null)));
  return results.filter((r): r is EdgeTxSdCard => r !== null);
}
