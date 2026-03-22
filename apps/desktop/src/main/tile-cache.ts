/**
 * Tile Cache — Electron protocol handler for offline map tiles.
 *
 * Registers `tile-cache://` custom protocol. Cache-first, network-fallback:
 * 1. Tile request → check disk → serve if found
 * 2. Cache miss → fetch from real URL → save to disk → return
 * 3. Offline + cache miss → return empty response (graceful degradation)
 */

import { app, protocol, ipcMain, type BrowserWindow } from 'electron';
import { join } from 'path';
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { setMaxListeners } from 'events';
import Store from 'electron-store';
import { IPC_CHANNELS, type TileCacheStats, type TileCacheDownloadProgress, type TileCacheSettings, type TileCacheDownloadRegion } from '../shared/ipc-channels.js';
import { resolveTileUrl, MAP_LAYERS, type LayerKey } from '../shared/map-layers.js';

// ─── Settings Store ──────────────────────────────────────────────────────────

interface TileCacheSettingsSchema {
  maxCacheSizeGB: number;
  enableAutoCache: boolean;
  maxZoomAutoCache: number;
}

const settingsStore = new Store<TileCacheSettingsSchema>({
  name: 'tile-cache-settings',
  defaults: {
    maxCacheSizeGB: 5,
    enableAutoCache: true,
    maxZoomAutoCache: 17,
  },
});

// ─── Regions Store (persisted download areas) ────────────────────────────────

interface TileCacheRegionsSchema {
  regions: TileCacheDownloadRegion[];
}

const regionsStore = new Store<TileCacheRegionsSchema>({
  name: 'tile-cache-regions',
  defaults: {
    regions: [],
  },
});

// ─── Paths ───────────────────────────────────────────────────────────────────

function getCacheDir(): string {
  return join(app.getPath('userData'), 'tile-cache');
}

function getTilePath(layer: string, z: number, x: number, y: number): string {
  return join(getCacheDir(), layer, String(z), String(x), `${y}.png`);
}

// ─── Protocol Registration (must be called BEFORE app.ready) ─────────────────

export function registerTileCacheScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'tile-cache',
      privileges: {
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

// ─── Protocol Handler (called after app.ready) ──────────────────────────────

export function setupTileCacheProtocol(): void {
  protocol.handle('tile-cache', async (request) => {
    try {
      // URL format: tile-cache://layer/z/x/y.png
      const url = new URL(request.url);
      const layer = url.hostname;
      const pathParts = url.pathname.split('/').filter(Boolean);

      if (pathParts.length < 3) {
        return new Response(null, { status: 400 });
      }

      const z = parseInt(pathParts[0]!, 10);
      const x = parseInt(pathParts[1]!, 10);
      const yStr = pathParts[2]!.replace('.png', '');
      const y = parseInt(yStr, 10);

      if (isNaN(z) || isNaN(x) || isNaN(y)) {
        return new Response(null, { status: 400 });
      }

      // Check if layer is valid (support radar-{path} dynamic layers)
      const isRadarLayer = layer.startsWith('radar-');
      if (!(layer in MAP_LAYERS) && !isRadarLayer) {
        return new Response(null, { status: 404 });
      }

      const layerKey = isRadarLayer ? 'radar' : layer;
      const layerDef = MAP_LAYERS[layerKey as LayerKey];

      // Clamp zoom to maxNativeZoom — fetch parent tile if beyond native range
      let fetchZ = z;
      let fetchX = x;
      let fetchY = y;
      if ('maxNativeZoom' in layerDef && z > layerDef.maxNativeZoom) {
        const zDiff = z - layerDef.maxNativeZoom;
        fetchZ = layerDef.maxNativeZoom;
        fetchX = x >> zDiff;
        fetchY = y >> zDiff;
      }

      const tilePath = getTilePath(layer, fetchZ, fetchX, fetchY);

      // 1. Try disk cache first
      try {
        const data = await readFile(tilePath);
        return new Response(data, {
          headers: { 'Content-Type': 'image/png' },
        });
      } catch {
        // Cache miss — continue to network
      }

      // 2. Fetch from network
      try {
        let realUrl: string;
        if (isRadarLayer) {
          // Layer name is radar-{path}, e.g. radar-/v2/radar/1609402200
          const radarPath = layer.substring(6);
          realUrl = `https://tilecache.rainviewer.com${radarPath}/256/${fetchZ}/${fetchX}/${fetchY}/2/1_1.png`;
        } else {
          realUrl = resolveTileUrl(layerKey as LayerKey, fetchZ, fetchX, fetchY);
        }
        const fetchHeaders: Record<string, string> = {};
        if ('headers' in layerDef) Object.assign(fetchHeaders, layerDef.headers);
        const response = await fetch(realUrl, { headers: fetchHeaders });

        if (!response.ok) {
          // Return transparent PNG instead of error status to avoid black tiles
          return new Response(TRANSPARENT_PNG, {
            headers: { 'Content-Type': 'image/png' },
          });
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Save to disk cache (fire-and-forget, don't block response)
        const dir = join(getCacheDir(), layer, String(fetchZ), String(fetchX));
        mkdir(dir, { recursive: true })
          .then(() => writeFile(tilePath, buffer))
          .catch(() => { /* ignore write errors */ });

        return new Response(buffer, {
          headers: { 'Content-Type': 'image/png' },
        });
      } catch {
        // 3. Offline + cache miss — return transparent 1x1 PNG
        return new Response(TRANSPARENT_PNG, {
          headers: { 'Content-Type': 'image/png' },
        });
      }
    } catch {
      return new Response(null, { status: 500 });
    }
  });
}

// Transparent 1x1 PNG for graceful offline degradation
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB' +
  'Nl7BcQAAAABJRU5ErkJggg==',
  'base64',
);

// ─── Cache Stats ─────────────────────────────────────────────────────────────

async function getCacheStats(): Promise<TileCacheStats> {
  const cacheDir = getCacheDir();
  const result: TileCacheStats = {
    totalTiles: 0,
    totalSizeBytes: 0,
    layers: {},
  };

  try {
    const layerDirs = await readdir(cacheDir).catch(() => [] as string[]);

    for (const layerName of layerDirs) {
      const layerPath = join(cacheDir, layerName);
      const layerStat = await stat(layerPath).catch(() => null);
      if (!layerStat?.isDirectory()) continue;

      let tiles = 0;
      let bytes = 0;

      // Walk z/x/y.png
      const zDirs = await readdir(layerPath).catch(() => [] as string[]);
      for (const zDir of zDirs) {
        const zPath = join(layerPath, zDir);
        const xDirs = await readdir(zPath).catch(() => [] as string[]);
        for (const xDir of xDirs) {
          const xPath = join(zPath, xDir);
          const files = await readdir(xPath).catch(() => [] as string[]);
          for (const file of files) {
            if (!file.endsWith('.png')) continue;
            const fileStat = await stat(join(xPath, file)).catch(() => null);
            if (fileStat) {
              tiles++;
              bytes += fileStat.size;
            }
          }
        }
      }

      result.layers[layerName] = { tiles, bytes };
      result.totalTiles += tiles;
      result.totalSizeBytes += bytes;
    }
  } catch {
    // Cache dir may not exist yet
  }

  return result;
}

// ─── Cache Clear ─────────────────────────────────────────────────────────────

async function clearCache(layerKey?: string): Promise<void> {
  const cacheDir = getCacheDir();

  if (layerKey) {
    // Clear specific layer
    const layerPath = join(cacheDir, layerKey);
    await removeDir(layerPath);
    // Remove regions that only used this layer
    const regions = regionsStore.get('regions');
    regionsStore.set('regions', regions.filter(r =>
      !r.layers.includes(layerKey),
    ));
  } else {
    // Clear all
    const layerDirs = await readdir(cacheDir).catch(() => [] as string[]);
    for (const dir of layerDirs) {
      await removeDir(join(cacheDir, dir));
    }
    regionsStore.set('regions', []);
  }
}

async function removeDir(dirPath: string): Promise<void> {
  try {
    const entries = await readdir(dirPath).catch(() => [] as string[]);
    for (const entry of entries) {
      const entryPath = join(dirPath, entry);
      const entryStat = await stat(entryPath).catch(() => null);
      if (entryStat?.isDirectory()) {
        await removeDir(entryPath);
      } else {
        await unlink(entryPath).catch(() => {});
      }
    }
    // Remove the now-empty directory
    const { rmdir } = await import('fs/promises');
    await rmdir(dirPath).catch(() => {});
  } catch {
    // Ignore errors
  }
}

// ─── Background Region Downloader ────────────────────────────────────────────

/** Convert lat/lon to tile coordinates at given zoom */
function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

/** Calculate tile count for a bounding box at given zoom levels */
export function calculateTileCount(
  bounds: { north: number; south: number; east: number; west: number },
  minZoom: number,
  maxZoom: number,
): number {
  let count = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const topLeft = latLonToTile(bounds.north, bounds.west, z);
    const bottomRight = latLonToTile(bounds.south, bounds.east, z);
    const xCount = bottomRight.x - topLeft.x + 1;
    const yCount = bottomRight.y - topLeft.y + 1;
    count += xCount * yCount;
  }
  return count;
}

// Active downloads keyed by downloadId
const activeDownloads = new Map<string, AbortController>();
let downloadIdCounter = 0;

interface DownloadRegionParams {
  bounds: { north: number; south: number; east: number; west: number };
  minZoom: number;
  maxZoom: number;
  layers: LayerKey[];
  /** When true, re-download tiles even if already cached */
  forceRefresh?: boolean;
}

/** Fire-and-forget background download. Called from IPC handler. */
function downloadRegionBackground(
  downloadId: string,
  controller: AbortController,
  params: DownloadRegionParams,
  mainWindow: BrowserWindow,
): void {
  runDownload(downloadId, controller, params, mainWindow).catch(() => {});
}

async function runDownload(
  downloadId: string,
  controller: AbortController,
  params: DownloadRegionParams,
  mainWindow: BrowserWindow,
): Promise<void> {
  const { bounds, minZoom, maxZoom, layers, forceRefresh } = params;
  const totalTilesPerLayer = calculateTileCount(bounds, minZoom, maxZoom);
  const totalTiles = totalTilesPerLayer * layers.length;

  let downloadedTiles = 0;
  let skippedTiles = 0;
  let failedTiles = 0;
  let bytesDownloaded = 0;

  // Tiles can number in the thousands — suppress the MaxListeners warning on the shared signal
  try { setMaxListeners(0, controller.signal); } catch { /* older Node */ }

  const sendProgress = () => {
    const progress: TileCacheDownloadProgress = {
      downloadId,
      totalTiles,
      downloadedTiles,
      skippedTiles,
      failedTiles,
      bytesDownloaded,
      status: 'downloading',
    };
    mainWindow.webContents.send(IPC_CHANNELS.TILE_CACHE_DOWNLOAD_PROGRESS, progress);
  };

  // Send initial progress immediately so the renderer shows the download UI
  sendProgress();

  // Download tiles with concurrency limit
  const CONCURRENCY = 4;

  // Collect all tile jobs
  const jobs: Array<{ layer: LayerKey; z: number; x: number; y: number }> = [];

  for (const layer of layers) {
    for (let z = minZoom; z <= maxZoom; z++) {
      const topLeft = latLonToTile(bounds.north, bounds.west, z);
      const bottomRight = latLonToTile(bounds.south, bounds.east, z);

      for (let x = topLeft.x; x <= bottomRight.x; x++) {
        for (let y = topLeft.y; y <= bottomRight.y; y++) {
          jobs.push({ layer, z, x, y });
        }
      }
    }
  }

  // Process jobs with concurrency limiter
  let jobIndex = 0;

  async function processNextJob(): Promise<void> {
    while (jobIndex < jobs.length) {
      if (controller.signal.aborted) return;

      const job = jobs[jobIndex++]!;
      const tilePath = getTilePath(job.layer, job.z, job.x, job.y);

      // Skip if already cached (unless force-refreshing)
      if (!forceRefresh) {
        try {
          const cached = await stat(tilePath);
          downloadedTiles++;
          skippedTiles++;
          bytesDownloaded += cached.size;
          if (downloadedTiles % 50 === 0) sendProgress();
          continue;
        } catch {
          // Not cached, download it
        }
      }

      try {
        const layerDef = MAP_LAYERS[job.layer];
        const realUrl = resolveTileUrl(job.layer, job.z, job.x, job.y);
        const fetchHeaders: Record<string, string> = {};
        if ('headers' in layerDef) Object.assign(fetchHeaders, layerDef.headers);
        const response = await fetch(realUrl, { signal: controller.signal, headers: fetchHeaders });

        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const dir = join(getCacheDir(), job.layer, String(job.z), String(job.x));
          await mkdir(dir, { recursive: true });
          await writeFile(tilePath, buffer);
          bytesDownloaded += buffer.length;
          downloadedTiles++;
        } else {
          failedTiles++;
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        failedTiles++;
      }

      if ((downloadedTiles + failedTiles) % 20 === 0) sendProgress();
    }
  }

  try {
    // Start concurrent workers
    const workers = Array.from({ length: CONCURRENCY }, () => processNextJob());
    await Promise.all(workers);

    const isComplete = !controller.signal.aborted;

    // Persist region bounds when download completes successfully
    if (isComplete) {
      const region: TileCacheDownloadRegion = {
        id: downloadId,
        bounds,
        minZoom,
        maxZoom,
        layers,
        downloadedAt: Date.now(),
        tileCount: downloadedTiles,
      };
      const existing = regionsStore.get('regions');
      regionsStore.set('regions', [...existing, region]);
    }

    // Send final progress
    const finalProgress: TileCacheDownloadProgress = {
      downloadId,
      totalTiles,
      downloadedTiles,
      skippedTiles,
      failedTiles,
      bytesDownloaded,
      status: isComplete ? 'complete' : 'cancelled',
    };
    mainWindow.webContents.send(IPC_CHANNELS.TILE_CACHE_DOWNLOAD_PROGRESS, finalProgress);
  } catch {
    // Aborted
  } finally {
    activeDownloads.delete(downloadId);
  }

}

function cancelDownload(downloadId: string): void {
  const controller = activeDownloads.get(downloadId);
  if (controller) {
    controller.abort();
    activeDownloads.delete(downloadId);
  }
}

// ─── Cache Cleanup (LRU eviction) ───────────────────────────────────────────

async function cleanupCache(): Promise<void> {
  const maxBytes = settingsStore.get('maxCacheSizeGB') * 1024 * 1024 * 1024;
  const stats = await getCacheStats();

  if (stats.totalSizeBytes <= maxBytes) return;

  // Collect all files with mtimes
  const files: Array<{ path: string; mtime: number; size: number }> = [];
  const cacheDir = getCacheDir();

  const layerDirs = await readdir(cacheDir).catch(() => [] as string[]);
  for (const layerName of layerDirs) {
    const layerPath = join(cacheDir, layerName);
    const zDirs = await readdir(layerPath).catch(() => [] as string[]);
    for (const zDir of zDirs) {
      const zPath = join(layerPath, zDir);
      const xDirs = await readdir(zPath).catch(() => [] as string[]);
      for (const xDir of xDirs) {
        const xPath = join(zPath, xDir);
        const entries = await readdir(xPath).catch(() => [] as string[]);
        for (const file of entries) {
          if (!file.endsWith('.png')) continue;
          const filePath = join(xPath, file);
          const fileStat = await stat(filePath).catch(() => null);
          if (fileStat) {
            files.push({ path: filePath, mtime: fileStat.mtimeMs, size: fileStat.size });
          }
        }
      }
    }
  }

  // Sort oldest first (LRU)
  files.sort((a, b) => a.mtime - b.mtime);

  let currentSize = stats.totalSizeBytes;
  for (const file of files) {
    if (currentSize <= maxBytes) break;
    await unlink(file.path).catch(() => {});
    currentSize -= file.size;
  }
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

export function setupTileCacheHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_GET_STATS, async () => {
    return getCacheStats();
  });

  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_CLEAR, async (_event, layerKey?: string) => {
    await clearCache(layerKey);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_DOWNLOAD_REGION, async (_event, params: DownloadRegionParams) => {
    // Generate downloadId and start download in the background.
    // Return immediately so the renderer can track progress via events.
    const downloadId = `dl-${++downloadIdCounter}`;
    const controller = new AbortController();
    activeDownloads.set(downloadId, controller);
    downloadRegionBackground(downloadId, controller, params, mainWindow);
    return { downloadId };
  });

  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_CANCEL_DOWNLOAD, async (_event, downloadId: string) => {
    cancelDownload(downloadId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_GET_SETTINGS, async () => {
    return {
      maxCacheSizeGB: settingsStore.get('maxCacheSizeGB'),
      enableAutoCache: settingsStore.get('enableAutoCache'),
      maxZoomAutoCache: settingsStore.get('maxZoomAutoCache'),
    } satisfies TileCacheSettings;
  });

  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_SET_SETTINGS, async (_event, settings: Partial<TileCacheSettings>) => {
    if (settings.maxCacheSizeGB !== undefined) settingsStore.set('maxCacheSizeGB', settings.maxCacheSizeGB);
    if (settings.enableAutoCache !== undefined) settingsStore.set('enableAutoCache', settings.enableAutoCache);
    if (settings.maxZoomAutoCache !== undefined) settingsStore.set('maxZoomAutoCache', settings.maxZoomAutoCache);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_CALCULATE_TILES, async (_event, params: {
    bounds: { north: number; south: number; east: number; west: number };
    minZoom: number;
    maxZoom: number;
    layerCount: number;
  }) => {
    const tilesPerLayer = calculateTileCount(params.bounds, params.minZoom, params.maxZoom);
    return { tileCount: tilesPerLayer * params.layerCount };
  });

  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_GET_REGIONS, async () => {
    return regionsStore.get('regions');
  });

  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_DELETE_REGION, async (_event, regionId: string) => {
    const regions = regionsStore.get('regions');
    regionsStore.set('regions', regions.filter(r => r.id !== regionId));
    return { success: true };
  });

  // Run startup cleanup
  cleanupCache().catch((err) => {
    console.warn('[TileCache] Cleanup error:', err);
  });
}
