/**
 * ESP32 Flasher — one-click firmware flashing for ESP32 family boards.
 *
 * Full flow: ensure esptool → download firmware from GitHub → detect chip → flash.
 * No pre-bundled binaries — everything is fetched on demand and cached locally.
 */

import { spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { mkdir, writeFile, chmod, readFile } from 'fs/promises';
import { app, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { FlashProgress, FlashResult } from '../../shared/firmware-types.js';

// ─── Chip Variants ──────────────────────────────────────────────────────────

/** Maps user-facing chip names to esptool --chip values */
const ESP32_CHIPS: Record<string, string> = {
  esp32: 'esp32',
  'esp32-s2': 'esp32s2',
  'esp32-s3': 'esp32s3',
  'esp32-c3': 'esp32c3',
  'esp32-c6': 'esp32c6',
  'esp32-h2': 'esp32h2',
};

/** Normalize chip name from esptool detection output (e.g. "ESP32-S3" → "esp32s3") */
function normalizeChip(raw: string): string {
  const lower = raw.toLowerCase().replace(/[- ]/g, '');
  // Strip revision info like "(revision v0.2)"
  const clean = lower.replace(/\(.*\)/, '').trim();
  return clean;
}

// ─── Paths ──────────────────────────────────────────────────────────────────

function getToolsDir(): string {
  return path.join(app.getPath('userData'), 'tools');
}

function getFirmwareCacheDir(): string {
  return path.join(app.getPath('userData'), 'firmware-cache');
}

function getDownloadedEsptoolPath(): string {
  const binaryName = process.platform === 'win32' ? 'esptool.exe' : 'esptool';
  return path.join(getToolsDir(), 'esptool', binaryName);
}

// ─── esptool Download ───────────────────────────────────────────────────────

function getEsptoolAssetName(version: string): string {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'win32') return `esptool-${version}-windows-amd64.zip`;
  if (platform === 'darwin') return `esptool-${version}-macos-${arch === 'arm64' ? 'arm64' : 'amd64'}.tar.gz`;
  if (arch === 'arm64') return `esptool-${version}-linux-aarch64.tar.gz`;
  if (arch === 'arm') return `esptool-${version}-linux-armv7.tar.gz`;
  return `esptool-${version}-linux-amd64.tar.gz`;
}

export async function downloadEsptool(): Promise<string> {
  const destDir = path.join(getToolsDir(), 'esptool');
  const binaryPath = getDownloadedEsptoolPath();

  if (fs.existsSync(binaryPath)) return binaryPath;

  const releaseResp = await fetch('https://api.github.com/repos/espressif/esptool/releases/latest');
  if (!releaseResp.ok) throw new Error(`Failed to fetch esptool release info: ${releaseResp.status}`);
  const release = await releaseResp.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> };
  const version = release.tag_name;
  const assetName = getEsptoolAssetName(version);
  const asset = release.assets.find((a) => a.name === assetName);
  if (!asset) throw new Error(`No esptool binary found for ${process.platform}/${process.arch}`);

  const dlResp = await fetch(asset.browser_download_url);
  if (!dlResp.ok) throw new Error(`Failed to download esptool: ${dlResp.status}`);
  const buffer = Buffer.from(await dlResp.arrayBuffer());

  await mkdir(destDir, { recursive: true });
  const archivePath = path.join(destDir, assetName);
  await writeFile(archivePath, buffer);

  if (assetName.endsWith('.tar.gz')) {
    execSync(`tar -xzf "${archivePath}" -C "${destDir}" --strip-components=1`, { timeout: 30000 });
  } else {
    execSync(`powershell -Command "Expand-Archive -Force '${archivePath}' '${destDir}'"`, { timeout: 30000 });
    const nested = fs.readdirSync(destDir).find((d) => d.startsWith('esptool-') && fs.statSync(path.join(destDir, d)).isDirectory());
    if (nested) {
      const nestedDir = path.join(destDir, nested);
      for (const file of fs.readdirSync(nestedDir)) {
        fs.renameSync(path.join(nestedDir, file), path.join(destDir, file));
      }
      fs.rmdirSync(nestedDir);
    }
  }

  try { fs.unlinkSync(archivePath); } catch { /* ignore */ }
  if (process.platform !== 'win32') await chmod(binaryPath, 0o755);

  return binaryPath;
}

export function getEsptoolPath(): string {
  const platform = process.platform;
  const binaryName = platform === 'win32' ? 'esptool.exe' : 'esptool';

  const downloadedPath = getDownloadedEsptoolPath();
  if (fs.existsSync(downloadedPath)) return downloadedPath;

  const appPath = app.getAppPath();
  const isAsar = appPath.includes('app.asar');
  const searchPaths = isAsar
    ? [path.join(appPath.replace('app.asar', 'app.asar.unpacked'), 'resources', 'bin', platform, binaryName)]
    : [
        path.join(appPath, 'resources', 'bin', platform, binaryName),
        path.join(appPath, '..', 'resources', 'bin', platform, binaryName),
      ];

  if (platform !== 'win32') {
    searchPaths.push('/usr/local/bin/esptool.py', '/usr/bin/esptool.py');
    searchPaths.push(path.join(process.env['HOME'] ?? '', '.local', 'bin', 'esptool.py'));
  }
  searchPaths.push(binaryName, 'esptool.py');

  for (const binPath of searchPaths) {
    if (binPath !== binaryName && binPath !== 'esptool.py' && fs.existsSync(binPath)) {
      return binPath;
    }
  }
  return binaryName;
}

export async function isEsptoolAvailable(): Promise<boolean> {
  const esptoolPath = getEsptoolPath();
  return new Promise((resolve) => {
    const proc = spawn(esptoolPath, ['version'], { stdio: ['ignore', 'pipe', 'pipe'] });
    proc.on('close', (code) => resolve(code === 0));
    proc.on('error', () => resolve(false));
  });
}

// ─── Firmware Download ──────────────────────────────────────────────────────

/** GitHub release config for known firmware projects */
interface FirmwareSource {
  owner: string;
  repo: string;
  /** How to find the right asset in the release (string match on asset name) */
  assetMatch: string;
  /** Map detected chip to subdirectory name inside the zip */
  chipDirMap: Record<string, string>;
}

const FIRMWARE_SOURCES: Record<string, FirmwareSource> = {
  'dronebridge-wifi': {
    owner: 'DroneBridge',
    repo: 'ESP32',
    assetMatch: 'stable.zip',
    chipDirMap: {
      esp32: 'esp32',
      esp32s2: 'esp32s2',
      esp32s3: 'esp32s3',
      esp32c3: 'esp32c3',
      esp32c6: 'esp32c6',
    },
  },
  'dronebridge-espnow': {
    owner: 'DroneBridge',
    repo: 'ESP32',
    assetMatch: 'stable.zip',
    chipDirMap: {
      esp32: 'esp32',
      esp32s2: 'esp32s2',
      esp32s3: 'esp32s3',
      esp32c3: 'esp32c3',
    },
  },
};

interface FlashBinary {
  offset: string;
  filePath: string;
}

/**
 * Download firmware from GitHub releases, extract for the target chip.
 * Returns the directory containing the extracted binaries and parsed flash args.
 */
export async function downloadFirmware(
  templateId: string,
  chipKey: string,
  window: BrowserWindow | null,
): Promise<{ binaries: FlashBinary[]; flashMode: string; flashFreq: string; flashSize: string }> {
  const source = FIRMWARE_SOURCES[templateId];
  if (!source) throw new Error(`Unknown firmware template: ${templateId}`);

  const chipDir = source.chipDirMap[chipKey];
  if (!chipDir) throw new Error(`Template ${templateId} doesn't support chip ${chipKey}`);

  sendProgress(window, { state: 'preparing', progress: 0, message: 'Fetching latest release...' });

  // Get latest release
  const releaseResp = await fetch(`https://api.github.com/repos/${source.owner}/${source.repo}/releases/latest`);
  if (!releaseResp.ok) throw new Error(`Failed to fetch release: ${releaseResp.status}`);
  const release = await releaseResp.json() as { tag_name: string; assets: Array<{ name: string; browser_download_url: string }> };
  const asset = release.assets.find((a) => a.name.includes(source.assetMatch));
  if (!asset) throw new Error(`No matching asset found in ${source.owner}/${source.repo} ${release.tag_name}`);

  // Check cache
  const cacheDir = path.join(getFirmwareCacheDir(), templateId, release.tag_name, chipDir);
  const cacheMarker = path.join(cacheDir, '.complete');
  if (fs.existsSync(cacheMarker)) {
    return parseFirmwareDir(cacheDir);
  }

  sendProgress(window, { state: 'preparing', progress: 10, message: `Downloading ${release.tag_name}...` });

  // Download zip
  const dlResp = await fetch(asset.browser_download_url);
  if (!dlResp.ok) throw new Error(`Failed to download firmware: ${dlResp.status}`);
  const zipBuffer = Buffer.from(await dlResp.arrayBuffer());

  sendProgress(window, { state: 'preparing', progress: 40, message: 'Extracting firmware...' });

  // Extract using node — zip files from GitHub use backslash paths (Windows-built)
  const tempZip = path.join(app.getPath('temp'), `firmware-${Date.now()}.zip`);
  await writeFile(tempZip, zipBuffer);
  await mkdir(cacheDir, { recursive: true });

  // Use Python zipfile for cross-platform path handling (handles backslash paths)
  const extractScript = `
import zipfile, os, sys
z = zipfile.ZipFile(sys.argv[1])
chip_dir = sys.argv[2]
out_dir = sys.argv[3]
for name in z.namelist():
    # Normalize backslash to forward slash
    norm = name.replace('\\\\', '/')
    parts = norm.split('/')
    # Find the chip directory in the path
    try:
        idx = parts.index(chip_dir)
    except ValueError:
        continue
    # Get relative path after chip dir
    rel = '/'.join(parts[idx+1:])
    if not rel or rel.endswith('/'):
        continue
    dest = os.path.join(out_dir, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    with open(dest, 'wb') as f:
        f.write(z.read(name))
print('OK')
`;
  const extractPy = path.join(app.getPath('temp'), `extract-${Date.now()}.py`);
  await writeFile(extractPy, extractScript);

  try {
    execSync(`python3 "${extractPy}" "${tempZip}" "${chipDir}" "${cacheDir}"`, { timeout: 30000 });
  } catch {
    // Fallback: try python instead of python3
    try {
      execSync(`python "${extractPy}" "${tempZip}" "${chipDir}" "${cacheDir}"`, { timeout: 30000 });
    } catch (e) {
      throw new Error(`Failed to extract firmware: ${e}`);
    }
  }

  // Clean up
  try { fs.unlinkSync(tempZip); } catch { /* ignore */ }
  try { fs.unlinkSync(extractPy); } catch { /* ignore */ }

  // Mark cache complete
  await writeFile(cacheMarker, release.tag_name);

  sendProgress(window, { state: 'preparing', progress: 50, message: 'Firmware ready' });

  return parseFirmwareDir(cacheDir);
}

/** Parse flash_args.txt and resolve binary paths */
async function parseFirmwareDir(dir: string): Promise<{ binaries: FlashBinary[]; flashMode: string; flashFreq: string; flashSize: string }> {
  const argsPath = path.join(dir, 'flash_args.txt');
  if (!fs.existsSync(argsPath)) {
    // No flash_args.txt — look for a single .bin file
    const bins = fs.readdirSync(dir).filter((f) => f.endsWith('.bin'));
    if (bins.length === 0) throw new Error('No firmware binaries found');
    return {
      binaries: [{ offset: '0x0', filePath: path.join(dir, bins[0]!) }],
      flashMode: 'dio',
      flashFreq: '40m',
      flashSize: '4MB',
    };
  }

  const content = await readFile(argsPath, 'utf8');
  const lines = content.trim().split('\n').map((l) => l.trim()).filter(Boolean);

  // First line: --flash_mode dio --flash_freq 40m --flash_size 2MB
  let flashMode = 'dio';
  let flashFreq = '40m';
  let flashSize = '4MB';

  const firstLine = lines[0] ?? '';
  const modeMatch = firstLine.match(/--flash_mode\s+(\S+)/);
  if (modeMatch) flashMode = modeMatch[1]!;
  const freqMatch = firstLine.match(/--flash_freq\s+(\S+)/);
  if (freqMatch) flashFreq = freqMatch[1]!;
  const sizeMatch = firstLine.match(/--flash_size\s+(\S+)/);
  if (sizeMatch) flashSize = sizeMatch[1]!;

  // Remaining lines: 0x1000 bootloader/bootloader.bin
  const binaries: FlashBinary[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i]!.split(/\s+/);
    if (parts.length < 2) continue;
    const offset = parts[0]!;
    const relPath = parts[1]!;
    // Resolve relative paths — flash_args may reference subdirs like bootloader/ or partition_table/
    let filePath = path.join(dir, relPath);
    // If the file doesn't exist at that path, try the filename directly in the dir
    if (!fs.existsSync(filePath)) {
      filePath = path.join(dir, path.basename(relPath));
    }
    if (fs.existsSync(filePath)) {
      binaries.push({ offset, filePath });
    }
  }

  if (binaries.length === 0) throw new Error('No valid binaries found in flash_args.txt');

  return { binaries, flashMode, flashFreq, flashSize };
}

// ─── Progress Helper ────────────────────────────────────────────────────────

function sendProgress(window: BrowserWindow | null, progress: FlashProgress): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.FIRMWARE_PROGRESS, progress);
  }
}

function parseEsptoolProgress(line: string): { progress: number; state: FlashProgress['state']; message: string } | null {
  const writeMatch = line.match(/Writing at 0x[\da-fA-F]+\.\.\.\s*\((\d+)\s*%\)/);
  if (writeMatch) {
    const pct = parseInt(writeMatch[1]!, 10);
    return { progress: pct, state: 'flashing', message: `Writing: ${pct}%` };
  }
  if (line.includes('Erasing flash') || line.includes('Erasing region')) {
    return { progress: 0, state: 'erasing', message: 'Erasing flash...' };
  }
  if (line.includes('Wrote') && line.includes('bytes')) {
    return { progress: 100, state: 'flashing', message: 'Write complete' };
  }
  if (line.includes('Hash of data verified') || line.includes('Leaving...')) {
    return { progress: 100, state: 'verifying', message: 'Verified' };
  }
  const chipMatch = line.match(/Chip is (ESP32\S*)/);
  if (chipMatch) {
    return { progress: 0, state: 'preparing', message: `Detected: ${chipMatch[1]}` };
  }
  if (line.includes('Connecting')) {
    return { progress: 0, state: 'preparing', message: 'Connecting to bootloader...' };
  }
  return null;
}

// ─── Low-level Flash (multi-binary) ─────────────────────────────────────────

interface MultiBinFlashOptions {
  port: string;
  chipKey: string;  // esptool chip value (e.g. 'esp32', 'esp32s3')
  binaries: FlashBinary[];
  flashMode: string;
  flashFreq: string;
  flashSize: string;
  baudRate?: number;
  eraseAll?: boolean;
}

function flashMultiBin(
  options: MultiBinFlashOptions,
  esptoolPath: string,
  window: BrowserWindow | null,
  abortController?: AbortController,
): Promise<FlashResult> {
  const startTime = Date.now();
  const baudRate = options.baudRate ?? 460800;

  return new Promise((resolve) => {
    const args: string[] = [
      '--chip', options.chipKey,
      '--port', options.port,
      '--baud', baudRate.toString(),
    ];

    if (options.eraseAll) {
      args.push('write_flash', '--erase-all');
    } else {
      args.push('write_flash');
    }

    args.push(
      '--flash_mode', options.flashMode,
      '--flash_freq', options.flashFreq,
      '--flash_size', options.flashSize,
    );

    // Add all offset+binary pairs
    for (const bin of options.binaries) {
      args.push(bin.offset, bin.filePath);
    }

    const proc = spawn(esptoolPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let lastProgress = 0;
    let errorOutput = '';

    const handleOutput = (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const progressInfo = parseEsptoolProgress(trimmed);
        if (progressInfo && progressInfo.progress >= lastProgress) {
          lastProgress = progressInfo.progress;
          sendProgress(window, progressInfo);
        }

        if (
          trimmed.toLowerCase().includes('error') ||
          trimmed.toLowerCase().includes('failed') ||
          trimmed.toLowerCase().includes('fatal') ||
          trimmed.includes('A fatal error occurred')
        ) {
          errorOutput += trimmed + '\n';
        }
      }
    };

    proc.stdout.on('data', handleOutput);
    proc.stderr.on('data', handleOutput);

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      if (code === 0) {
        sendProgress(window, { state: 'complete', progress: 100, message: 'Flash complete!' });
        resolve({ success: true, message: 'Firmware flashed and verified', duration, verified: true });
      } else {
        let friendlyError = errorOutput;
        if (errorOutput.includes('Failed to connect')) {
          friendlyError = 'Failed to connect to ESP32. Check the USB cable and make sure the board is plugged in.';
        } else if (errorOutput.includes('Permission denied') || errorOutput.includes('could not open port')) {
          friendlyError = `Cannot open ${options.port}. Make sure no other program is using the port.`;
        } else if (errorOutput.includes('No serial data received')) {
          friendlyError = 'No response from ESP32. Check the USB cable and try holding BOOT while connecting.';
        }
        resolve({ success: false, error: friendlyError || `esptool exited with code ${code}`, duration });
      }
    });

    proc.on('error', (err) => {
      const duration = Date.now() - startTime;
      resolve({
        success: false,
        error: err.message.includes('ENOENT')
          ? 'esptool not found. Click "Download esptool" first.'
          : `Failed to start esptool: ${err.message}`,
        duration,
      });
    });

    if (abortController) {
      abortController.signal.addEventListener('abort', () => {
        proc.kill('SIGTERM');
        resolve({ success: false, error: 'Flash aborted', duration: Date.now() - startTime });
      });
    }
  });
}

// ─── Chip Detection ─────────────────────────────────────────────────────────

export async function detectEsp32Chip(port: string): Promise<{ chip: string; mac: string } | null> {
  const esptoolPath = getEsptoolPath();

  return new Promise((resolve) => {
    const proc = spawn(esptoolPath, ['--port', port, 'chip_id'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    proc.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { output += data.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) { resolve(null); return; }
      const chipMatch = output.match(/Chip is (ESP32\S*)/);
      const macMatch = output.match(/MAC:\s*([\da-f:]+)/i);
      if (chipMatch) {
        resolve({ chip: chipMatch[1]!, mac: macMatch?.[1] ?? 'unknown' });
      } else {
        resolve(null);
      }
    });

    proc.on('error', () => resolve(null));
    setTimeout(() => proc.kill('SIGTERM'), 10000);
  });
}

// ─── One-Click Flash (the main entry point) ─────────────────────────────────

export interface TemplateFlashOptions {
  /** Template ID from companion-templates (e.g. 'dronebridge-wifi') */
  templateId: string;
  /** Serial port */
  port: string;
  /** Detected chip (e.g. 'ESP32-S3') — will be normalized */
  detectedChip?: string;
  /** Erase entire flash first */
  eraseAll?: boolean;
}

/**
 * One-click flash: ensures esptool → downloads firmware → detects chip → flashes.
 * This is what the UI calls. Everything happens automatically.
 */
export async function flashTemplate(
  options: TemplateFlashOptions,
  window: BrowserWindow | null,
  abortController?: AbortController,
): Promise<FlashResult> {
  try {
    // 1. Ensure esptool is available
    sendProgress(window, { state: 'preparing', progress: 0, message: 'Checking esptool...' });
    const available = await isEsptoolAvailable();
    let esptoolPath: string;
    if (!available) {
      sendProgress(window, { state: 'preparing', progress: 5, message: 'Downloading esptool...' });
      esptoolPath = await downloadEsptool();
    } else {
      esptoolPath = getEsptoolPath();
    }

    // 2. Detect chip if not provided
    let chipKey: string;
    if (options.detectedChip) {
      chipKey = normalizeChip(options.detectedChip);
    } else {
      sendProgress(window, { state: 'preparing', progress: 10, message: 'Detecting chip...' });
      const detected = await detectEsp32Chip(options.port);
      if (!detected) {
        return {
          success: false,
          error: 'Could not detect ESP32 chip. Check the USB connection and try again.',
          duration: 0,
        };
      }
      chipKey = normalizeChip(detected.chip);
    }

    // Map to esptool chip value
    const esptoolChip = ESP32_CHIPS[chipKey] ?? chipKey;

    // 3. Download firmware
    sendProgress(window, { state: 'preparing', progress: 15, message: 'Downloading firmware...' });
    const firmware = await downloadFirmware(options.templateId, esptoolChip, window);

    // 4. Flash
    sendProgress(window, { state: 'preparing', progress: 55, message: 'Starting flash...' });
    const flashResult = await flashMultiBin(
      {
        port: options.port,
        chipKey: esptoolChip,
        binaries: firmware.binaries,
        flashMode: firmware.flashMode,
        flashFreq: firmware.flashFreq,
        flashSize: firmware.flashSize,
        eraseAll: options.eraseAll ?? true,
      },
      esptoolPath,
      window,
      abortController,
    );

    // 5. After successful DroneBridge flash, read boot log over serial to get device info
    if (flashResult.success && options.templateId.startsWith('dronebridge')) {
      sendProgress(window, { state: 'complete', progress: 95, message: 'Reading device info...' });
      try {
        // Small delay for ESP32 to start booting
        await new Promise((r) => setTimeout(r, 1500));
        const { readDroneBridgeBootLog } = await import('../dronebridge/dronebridge-serial-reader.js');
        const serialInfo = await readDroneBridgeBootLog(options.port, 8000);
        if (serialInfo.settings) {
          flashResult.serialInfo = serialInfo;
        }
      } catch {
        // Non-fatal — device info via serial is optional
      }
    }

    return flashResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendProgress(window, { state: 'complete', progress: 0, message: `Error: ${message}` });
    return { success: false, error: message, duration: 0 };
  }
}

// ─── Legacy single-binary flash (kept for custom firmware) ──────────────────

export interface Esp32FlashOptions {
  port: string;
  chip: string;
  firmwarePath: string;
  flashOffset?: string;
  baudRate?: number;
  eraseAll?: boolean;
}

export async function flashEsp32(
  options: Esp32FlashOptions,
  window: BrowserWindow | null,
  abortController?: AbortController,
): Promise<FlashResult> {
  if (!options.port) {
    return { success: false, error: 'No serial port specified.', duration: 0 };
  }
  if (!fs.existsSync(options.firmwarePath)) {
    return { success: false, error: `Firmware file not found: ${options.firmwarePath}`, duration: 0 };
  }

  const esptoolPath = getEsptoolPath();
  const chipKey = ESP32_CHIPS[options.chip.toLowerCase()] ?? 'esp32';

  return flashMultiBin(
    {
      port: options.port,
      chipKey,
      binaries: [{ offset: options.flashOffset ?? '0x0', filePath: options.firmwarePath }],
      flashMode: 'dio',
      flashFreq: '40m',
      flashSize: '4MB',
      baudRate: options.baudRate,
      eraseAll: options.eraseAll,
    },
    esptoolPath,
    window,
    abortController,
  );
}
