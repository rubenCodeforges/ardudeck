/**
 * ArduPilot SITL Downloader
 * Downloads ArduPilot SITL binaries from firmware.ardupilot.org
 */

import { app, BrowserWindow } from 'electron';
import { createWriteStream } from 'node:fs';
import { mkdir, access, rm, rename } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import type {
  ArduPilotVehicleType,
  ArduPilotReleaseTrack,
  ArduPilotSitlDownloadProgress,
  ArduPilotSitlBinaryInfo,
} from '../../shared/ipc-channels.js';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

/**
 * Base URL for ArduPilot SITL binaries
 */
const FIRMWARE_BASE_URL = 'https://firmware.ardupilot.org/Tools/MissionPlanner/sitl';

/**
 * Map vehicle type to binary name
 */
const VEHICLE_BINARY_MAP: Record<ArduPilotVehicleType, string> = {
  copter: 'ArduCopter',
  plane: 'ArduPlane',
  rover: 'ArduRover',
  sub: 'ArduSub',
};

/**
 * Map release track to directory name
 */
const TRACK_DIR_MAP: Record<ArduPilotReleaseTrack, string> = {
  stable: 'CopterStable', // Note: This is for copter only, others have different names
  beta: 'Beta',
  dev: '', // Dev/master is in root
};

/**
 * Get the download URL for a specific vehicle and track
 */
function getDownloadUrl(vehicleType: ArduPilotVehicleType, releaseTrack: ArduPilotReleaseTrack): string {
  const binaryName = VEHICLE_BINARY_MAP[vehicleType];

  // Build the path based on track
  // Structure:
  // - Stable: CopterStable/ArduCopter.elf, PlaneStable/ArduPlane.elf, etc.
  // - Beta: Beta/ArduCopter.elf
  // - Dev: ArduCopter.elf (root)

  let urlPath: string;

  if (releaseTrack === 'stable') {
    // Capitalize first letter of vehicle type for stable dirs
    const capitalizedType = vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1);
    urlPath = `${capitalizedType}Stable/${binaryName}.elf`;
  } else if (releaseTrack === 'beta') {
    urlPath = `Beta/${binaryName}.elf`;
  } else {
    // Dev/master is in root
    urlPath = `${binaryName}.elf`;
  }

  return `${FIRMWARE_BASE_URL}/${urlPath}`;
}

/**
 * Get the URL for Cygwin DLLs (Windows only)
 */
function getCygwinUrl(): string {
  return `${FIRMWARE_BASE_URL}/cygwin/`;
}

class ArduPilotSitlDownloader {
  private mainWindow: BrowserWindow | null = null;
  private abortController: AbortController | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * Get the local path for storing SITL binaries
   */
  private getBasePath(): string {
    return path.join(app.getPath('userData'), 'ardupilot-sitl');
  }

  /**
   * Get the binary path for a specific vehicle/track
   */
  getBinaryPath(vehicleType: ArduPilotVehicleType, releaseTrack: ArduPilotReleaseTrack): string {
    const binaryName = VEHICLE_BINARY_MAP[vehicleType];
    const basePath = this.getBasePath();
    const extension = process.platform === 'win32' ? '.exe' : '.elf';

    return path.join(basePath, releaseTrack, vehicleType, `${binaryName}${extension}`);
  }

  /**
   * Check if a binary exists
   */
  async checkBinary(vehicleType: ArduPilotVehicleType, releaseTrack: ArduPilotReleaseTrack): Promise<ArduPilotSitlBinaryInfo> {
    const binaryPath = this.getBinaryPath(vehicleType, releaseTrack);

    try {
      await access(binaryPath);
      return {
        vehicleType,
        releaseTrack,
        exists: true,
        path: binaryPath,
      };
    } catch {
      return {
        vehicleType,
        releaseTrack,
        exists: false,
      };
    }
  }

  /**
   * Download a SITL binary
   */
  async download(
    vehicleType: ArduPilotVehicleType,
    releaseTrack: ArduPilotReleaseTrack
  ): Promise<{ success: boolean; path?: string; error?: string }> {
    const binaryPath = this.getBinaryPath(vehicleType, releaseTrack);
    const binaryDir = path.dirname(binaryPath);
    const tempPath = `${binaryPath}.tmp`;

    // Create abort controller for cancellation
    this.abortController = new AbortController();

    try {
      // Ensure directory exists
      await mkdir(binaryDir, { recursive: true });

      // Get download URL
      const url = getDownloadUrl(vehicleType, releaseTrack);

      // Send initial progress
      this.sendProgress({
        vehicleType,
        releaseTrack,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'downloading',
      });

      // Fetch the binary
      const response = await fetch(url, {
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
      let bytesDownloaded = 0;

      // Create write stream
      const writeStream = createWriteStream(tempPath);

      // Create a transform stream to track progress
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      // Read and write with progress tracking
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        bytesDownloaded += value.length;
        writeStream.write(value);

        // Calculate progress
        const progress = totalBytes > 0 ? Math.round((bytesDownloaded / totalBytes) * 100) : 0;

        this.sendProgress({
          vehicleType,
          releaseTrack,
          progress,
          bytesDownloaded,
          totalBytes,
          status: 'downloading',
        });
      }

      // Close the stream
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
      });

      // Move temp file to final location
      try {
        await rm(binaryPath, { force: true });
      } catch {
        // Ignore if file doesn't exist
      }
      await rename(tempPath, binaryPath);

      // Send completion
      this.sendProgress({
        vehicleType,
        releaseTrack,
        progress: 100,
        bytesDownloaded: totalBytes,
        totalBytes,
        status: 'complete',
      });

      return { success: true, path: binaryPath };
    } catch (err) {
      // Clean up temp file
      try {
        await rm(tempPath, { force: true });
      } catch {
        // Ignore cleanup errors
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      // Send error progress
      this.sendProgress({
        vehicleType,
        releaseTrack,
        progress: 0,
        bytesDownloaded: 0,
        totalBytes: 0,
        status: 'error',
        error: errorMessage,
      });

      return { success: false, error: errorMessage };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Download Cygwin DLLs for Windows
   */
  async downloadCygwin(): Promise<{ success: boolean; error?: string }> {
    if (process.platform !== 'win32') {
      return { success: true }; // Not needed on non-Windows
    }

    const cygwinDir = path.join(this.getBasePath(), 'cygwin');

    try {
      await mkdir(cygwinDir, { recursive: true });

      // List of required DLLs
      const dlls = [
        'cygwin1.dll',
        'cyggcc_s-seh-1.dll',
        'cygstdc++-6.dll',
        'cygz.dll',
      ];

      for (const dll of dlls) {
        const url = `${getCygwinUrl()}${dll}`;
        const dllPath = path.join(cygwinDir, dll);

        // Skip if already exists
        try {
          await access(dllPath);
          continue;
        } catch {
          // Need to download
        }

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to download ${dll}: HTTP ${response.status}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const { writeFile } = await import('node:fs/promises');
        await writeFile(dllPath, Buffer.from(arrayBuffer));
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  /**
   * Abort current download
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Send download progress to renderer
   */
  private sendProgress(progress: ArduPilotSitlDownloadProgress): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(IPC_CHANNELS.ARDUPILOT_SITL_DOWNLOAD_PROGRESS, progress);
    }
  }
}

// Singleton instance
export const ardupilotSitlDownloader = new ArduPilotSitlDownloader();
