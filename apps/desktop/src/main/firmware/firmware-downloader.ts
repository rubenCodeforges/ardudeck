/**
 * Firmware Downloader
 * Downloads firmware files with progress reporting
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';
import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { FirmwareVersion, FlashProgress } from '../../shared/firmware-types.js';

// Firmware download directory
const FIRMWARE_CACHE_DIR = path.join(os.tmpdir(), 'ardudeck-firmware');

/**
 * Get local path for cached firmware file
 */
export function getFirmwareCachePath(version: FirmwareVersion): string {
  // Create a filename from version info, preserving extension
  const urlPath = new URL(version.downloadUrl).pathname;
  let ext = path.extname(urlPath);

  // Ensure we have an extension - default to .hex for most firmware
  if (!ext || ext === '') {
    if (urlPath.includes('.hex')) ext = '.hex';
    else if (urlPath.includes('.bin')) ext = '.bin';
    else if (urlPath.includes('.apj')) ext = '.apj';
    else ext = '.hex'; // Default assumption
  }

  const filename = `${version.boardId || 'unknown'}_${version.version.replace(/\./g, '_')}${ext}`;
  return path.join(FIRMWARE_CACHE_DIR, filename);
}

/**
 * Check if firmware is already cached
 */
export async function isFirmwareCached(version: FirmwareVersion): Promise<boolean> {
  const cachePath = getFirmwareCachePath(version);

  try {
    const stats = await fs.promises.stat(cachePath);
    // Check if size matches (if we know it)
    if (version.fileSize && stats.size !== version.fileSize) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Send progress update to renderer
 */
function sendProgress(window: BrowserWindow | null, progress: FlashProgress): void {
  if (window && !window.isDestroyed()) {
    window.webContents.send(IPC_CHANNELS.FIRMWARE_PROGRESS, progress);
  }
}

/**
 * Download firmware file with progress
 */
export async function downloadFirmware(
  version: FirmwareVersion,
  window: BrowserWindow | null,
  abortSignal?: AbortSignal
): Promise<string> {
  // Ensure cache directory exists
  await fs.promises.mkdir(FIRMWARE_CACHE_DIR, { recursive: true });

  const cachePath = getFirmwareCachePath(version);

  // Check if already cached
  if (await isFirmwareCached(version)) {
    sendProgress(window, {
      state: 'downloading',
      progress: 100,
      message: 'Using cached firmware',
      bytesWritten: version.fileSize || 0,
      totalBytes: version.fileSize || 0,
    });
    return cachePath;
  }

  return new Promise((resolve, reject) => {
    const url = new URL(version.downloadUrl);
    const protocol = url.protocol === 'https:' ? https : http;

    sendProgress(window, {
      state: 'downloading',
      progress: 0,
      message: `Downloading ${version.version}...`,
      bytesWritten: 0,
      totalBytes: version.fileSize || 0,
    });

    const request = protocol.get(version.downloadUrl, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          // Update version URL and retry
          downloadFirmware(
            { ...version, downloadUrl: redirectUrl },
            window,
            abortSignal
          )
            .then(resolve)
            .catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10) || version.fileSize || 0;
      let downloadedSize = 0;

      const fileStream = fs.createWriteStream(cachePath);

      response.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length;

        const progress = totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0;

        sendProgress(window, {
          state: 'downloading',
          progress,
          message: `Downloading: ${formatBytes(downloadedSize)} / ${formatBytes(totalSize)}`,
          bytesWritten: downloadedSize,
          totalBytes: totalSize,
        });
      });

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close();
        resolve(cachePath);
      });

      fileStream.on('error', (err) => {
        // Clean up partial file
        fs.unlink(cachePath, () => {});
        reject(err);
      });
    });

    request.on('error', (err) => {
      reject(err);
    });

    // Handle abort
    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        request.destroy();
        fs.unlink(cachePath, () => {});
        reject(new Error('Download aborted'));
      });
    }
  });
}

/**
 * Format bytes as human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Clear firmware cache
 */
export async function clearFirmwareCache(): Promise<void> {
  try {
    const files = await fs.promises.readdir(FIRMWARE_CACHE_DIR);
    await Promise.all(
      files.map((file) => fs.promises.unlink(path.join(FIRMWARE_CACHE_DIR, file)))
    );
  } catch {
    // Ignore errors (directory may not exist)
  }
}

/**
 * Get firmware file from local path (for custom firmware)
 */
export async function copyCustomFirmware(sourcePath: string): Promise<string> {
  await fs.promises.mkdir(FIRMWARE_CACHE_DIR, { recursive: true });

  const filename = `custom_${Date.now()}${path.extname(sourcePath)}`;
  const destPath = path.join(FIRMWARE_CACHE_DIR, filename);

  await fs.promises.copyFile(sourcePath, destPath);

  return destPath;
}
