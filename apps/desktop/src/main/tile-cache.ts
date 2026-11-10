/**
 * Tile Cache — Electron protocol handler for offline map tiles.
 *
 * Registers `tile-cache://` custom protocol. Cache-first, network-fallback:
 * 1. Tile request → check disk → serve if found
 * 2. Cache miss → fetch from real URL → save to disk → return
 * 3. Offline + cache miss → return empty response (graceful degradation)
 */

import { app, protocol, ipcMain, BrowserWindow, type CustomScheme } from 'electron';
import { join } from 'path';
import { readFile, writeFile, mkdir, readdir, stat, unlink } from 'fs/promises';
import { setMaxListeners } from 'events';
import Store from 'electron-store';
import { IPC_CHANNELS, type TileCacheStats, type TileCacheDownloadProgress, type TileCacheSettings, type TileCacheDownloadRegion } from '../shared/ipc-channels.js';
import { resolveTileUrl, MAP_LAYERS, CARTO_DARK_URL, CARTO_KEY_SERVICE, DARK_LABELS_LAYER, ESRI_CANVAS_MAX_NATIVE_ZOOM, ESRI_DARK_LABELS_URL, type LayerKey } from '../shared/map-layers.js';
import { createHash } from 'crypto';
import { getApiKey } from './overlays/overlay-ipc-handlers.js';
import { demSourcesForTile, listTileSources, rasterSourceByKey, subscribeTileSources } from './terrain/tile-source-registry.js';
import { composeDem, encodePng, readSourceTile, type Rgba } from './terrain/dem-tiles.js';
import { listSceneMeshes, subscribeSceneMeshes } from './terrain/scene-mesh-registry.js';
import { TILE_SOURCE_LAYER_PREFIX } from '../shared/tile-source-types.js';
import { isImageBytes } from './tile-image.js';

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

export const TILE_CACHE_SCHEME_PRIVILEGES: CustomScheme = {
  scheme: 'tile-cache',
  privileges: {
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
};

// ─── Protocol Handler (called after app.ready) ──────────────────────────────

/**
 * Resolve a `tile-cache://layer/z/x/y.png` URL to raw PNG bytes, applying the
 * cache-first / network-fallback / transparent-on-offline policy. Shared by the
 * `protocol.handle` registration (main window, served natively to MapLibre and
 * Leaflet) and the TILE_CACHE_GET_TILE IPC channel (detached windows, where the
 * renderer/worker cannot fetch the privileged tile-cache:// scheme directly, so
 * MapLibre's addProtocol handler pulls bytes over IPC instead).
 *
 * `body` is null only for malformed/unknown requests (status 4xx/5xx); image
 * consumers receive a transparent PNG for offline/cache-miss instead of an error.
 */
// Composited DEM tiles are re-requested constantly while the map pans; a source change drops them all.
const compositeCache = new Map<string, ArrayBuffer>();
subscribeTileSources(() => compositeCache.clear());

export async function resolveTileBytes(requestUrl: string): Promise<{ status: number; body: ArrayBuffer | null }> {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return { status: 400, body: null };
  }
  const layer = url.hostname;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 3) return { status: 400, body: null };
  const z = parseInt(parts[0]!, 10), x = parseInt(parts[1]!, 10), y = parseInt(parts[2]!.replace('.png', ''), 10);
  if (isNaN(z) || isNaN(x) || isNaN(y)) return { status: 400, body: null };

  if (layer.startsWith(TILE_SOURCE_LAYER_PREFIX)) {
    const entry = rasterSourceByKey(decodeURIComponent(layer.slice(TILE_SOURCE_LAYER_PREFIX.length)));
    if (!entry) return { status: 404, body: null };
    const img = await readSourceTile(entry, z, x, y);
    return { status: 200, body: toArrayBuffer(img ? encodePng(img) : TRANSPARENT_PNG) };
  }

  if (layer !== 'dem') return resolveDefaultTileBytes(requestUrl);

  const sources = demSourcesForTile(z, x, y);
  const demMax = MAP_LAYERS.dem.maxZoom;
  if (sources.length === 0 && z <= demMax) return resolveDefaultTileBytes(requestUrl);

  const cacheKey = `${z}/${x}/${y}:${sources.map((s) => `${s.key}@${s.version ?? 0}`).join(',')}`;
  const hit = compositeCache.get(cacheKey);
  if (hit) return { status: 200, body: hit };

  const bz = Math.min(z, demMax), dz = z - bz;
  const baseRes = await resolveDefaultTileBytes(`tile-cache://dem/${bz}/${x >> dz}/${y >> dz}.png`);
  const overlays: Rgba[] = [];
  for (const entry of [...sources].reverse()) {
    const tile = await readSourceTile(entry, z, x, y);
    if (tile) overlays.push(tile);
  }
  const { img, cacheable } = composeDem(baseRes.body, dz, x - ((x >> dz) << dz), y - ((y >> dz) << dz), overlays);
  const bytes = toArrayBuffer(encodePng(img));
  if (cacheable) {
    if (compositeCache.size > 400) compositeCache.delete(compositeCache.keys().next().value!);
    compositeCache.set(cacheKey, bytes);
  }
  return { status: 200, body: bytes };
}

async function resolveDefaultTileBytes(
  requestUrl: string,
): Promise<{ status: number; body: ArrayBuffer | null }> {
  try {
    // URL format: tile-cache://layer/z/x/y.png
    const url = new URL(requestUrl);
    const layer = url.hostname;
    const pathParts = url.pathname.split('/').filter(Boolean);

    if (pathParts.length < 3) {
      return { status: 400, body: null };
    }

    const z = parseInt(pathParts[0]!, 10);
    const x = parseInt(pathParts[1]!, 10);
    const yStr = pathParts[2]!.replace('.png', '');
    const y = parseInt(yStr, 10);

    if (isNaN(z) || isNaN(x) || isNaN(y)) {
      return { status: 400, body: null };
    }

    // OpenAIP tiles require an API key — reject early if missing
    const isOpenAipLayer = layer === 'openaip';
    if (isOpenAipLayer) {
      const apiKey = getApiKey('openaip');
      if (!apiKey) {
        return { status: 200, body: toArrayBuffer(TRANSPARENT_PNG) };
      }
    }

    if (layer === 'dark' || layer === DARK_LABELS_LAYER) return await resolveDarkTile(layer, z, x, y);

    // Check if layer is valid (support radar-{path} dynamic layers)
    const isRadarLayer = layer.startsWith('radar-');
    if (!(layer in MAP_LAYERS) && !isRadarLayer) {
      return { status: 404, body: null };
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
    await purgeOutdatedLayerCache(layer);

    // 1. Try disk cache first
    try {
      const data = await readFile(tilePath);
      if (isImageBytes(data)) return { status: 200, body: toArrayBuffer(data) };
      // An error page or empty body cached by an older build: drop it and fetch again.
      unlink(tilePath).catch(() => { /* ignore */ });
    } catch {
      // Cache miss — continue to network
    }

    // 2. Fetch from network
    try {
      let realUrl: string;
      if (isRadarLayer) {
        // Layer name is radar-{pathId}-c{colorScheme}, e.g. radar-8f4387a21ffe-c6
        // pathId is the last segment of RainViewer's radar.past[].path — opaque, not derivable from timestamp.
        const parts = layer.substring(6).split('-c');
        const pathId = parts[0];
        const colorScheme = parts[1] ?? '6';
        realUrl = `https://tilecache.rainviewer.com/v2/radar/${pathId}/256/${fetchZ}/${fetchX}/${fetchY}/${colorScheme}/1_1.png`;
      } else {
        realUrl = resolveTileUrl(layerKey as LayerKey, fetchZ, fetchX, fetchY);
      }
      const fetchHeaders: Record<string, string> = {};
      if ('headers' in layerDef) Object.assign(fetchHeaders, layerDef.headers);
      // Inject API key for OpenAIP tiles as query parameter
      if (isOpenAipLayer) {
        const apiKey = getApiKey('openaip');
        if (apiKey) realUrl += `?apiKey=${encodeURIComponent(apiKey)}`;
      }
      const response = await fetch(realUrl, { headers: fetchHeaders });

      if (!response.ok) {
        // Return transparent PNG instead of error status to avoid black tiles
        return { status: 200, body: toArrayBuffer(TRANSPARENT_PNG) };
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      // Throttled servers answer 200 with an HTML page or nothing; that is a miss, never a tile.
      if (!isImageBytes(buffer)) return { status: 200, body: toArrayBuffer(TRANSPARENT_PNG) };

      // Save to disk cache (fire-and-forget, don't block response)
      const dir = join(getCacheDir(), layer, String(fetchZ), String(fetchX));
      mkdir(dir, { recursive: true })
        .then(() => writeFile(tilePath, buffer))
        .catch(() => { /* ignore write errors */ });

      return { status: 200, body: toArrayBuffer(buffer) };
    } catch {
      // 3. Offline + cache miss — return transparent 1x1 PNG
      return { status: 200, body: toArrayBuffer(TRANSPARENT_PNG) };
    }
  } catch {
    return { status: 500, body: null };
  }
}

export function setupTileCacheProtocol(): void {
  protocol.handle('tile-cache', async (request) => {
    const { status, body } = await resolveTileBytes(request.url);
    if (body === null) return new Response(null, { status });
    return new Response(body, { status, headers: { 'Content-Type': 'image/png' } });
  });
}

// Copy a Buffer's bytes into a standalone ArrayBuffer. Needed because a Node
// Buffer can be a view onto a larger shared pool; slicing yields exactly the
// tile's bytes, suitable as a Response BodyInit and transferable over IPC.
function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
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

// md5 of the tile Carto serves for every request without a valid key.
const CARTO_PLACEHOLDER_MD5 = 'df9307c738f2c6dbc0f8d31837019f98';

async function fetchTileInto(cacheLayer: string, z: number, x: number, y: number, url: string): Promise<Buffer | null> {
  const tilePath = getTilePath(cacheLayer, z, x, y);
  try {
    const data = await readFile(tilePath);
    if (isImageBytes(data)) return data;
  } catch {
    // cache miss
  }
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!isImageBytes(buffer)) return null;
    if (createHash('md5').update(buffer).digest('hex') === CARTO_PLACEHOLDER_MD5) return null;
    mkdir(join(getCacheDir(), cacheLayer, String(z), String(x)), { recursive: true })
      .then(() => writeFile(tilePath, buffer))
      .catch(() => { /* ignore write errors */ });
    return buffer;
  } catch {
    return null;
  }
}

/** The dark basemap: Carto with the user's key, else Esri Canvas plus its label overlay. Never Carto's key placeholder. */
async function resolveDarkTile(layer: string, z: number, x: number, y: number): Promise<{ status: number; body: ArrayBuffer | null }> {
  const transparent = { status: 200, body: toArrayBuffer(TRANSPARENT_PNG) };
  const cartoKey = getApiKey(CARTO_KEY_SERVICE);
  if (layer === DARK_LABELS_LAYER && cartoKey) return transparent;
  if (layer === 'dark' && cartoKey) {
    const url = CARTO_DARK_URL.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)).replace('{key}', encodeURIComponent(cartoKey));
    const carto = await fetchTileInto('dark-carto', z, x, y, url);
    if (carto) return { status: 200, body: toArrayBuffer(carto) };
  }
  await purgeOutdatedLayerCache(layer);
  const shift = Math.max(0, z - ESRI_CANVAS_MAX_NATIVE_ZOOM);
  const [fz, fx, fy] = [z - shift, x >> shift, y >> shift];
  const template = layer === DARK_LABELS_LAYER ? ESRI_DARK_LABELS_URL : MAP_LAYERS.dark.url;
  const url = template.replace('{z}', String(fz)).replace('{y}', String(fy)).replace('{x}', String(fx));
  const esri = await fetchTileInto(layer, fz, fx, fy, url);
  return esri ? { status: 200, body: toArrayBuffer(esri) } : transparent;
}

/** Bumped when a layer moves to another tile provider: its old tiles are dropped once instead of mixing in. */
const LAYER_CACHE_VERSIONS: Partial<Record<string, number>> = { dark: 2 };
const checkedLayers = new Set<string>();

async function purgeOutdatedLayerCache(layer: string): Promise<void> {
  const version = LAYER_CACHE_VERSIONS[layer];
  if (version === undefined || checkedLayers.has(layer)) return;
  checkedLayers.add(layer);
  const layerPath = join(getCacheDir(), layer);
  const marker = join(layerPath, '.cache-version');
  const current = await readFile(marker, 'utf-8').catch(() => '');
  if (current.trim() === String(version)) return;
  await removeDir(layerPath).catch(() => undefined);
  await mkdir(layerPath, { recursive: true });
  await writeFile(marker, String(version), 'utf-8');
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
  // Tile bytes over IPC for renderers that cannot fetch the privileged
  // tile-cache:// scheme directly (detached windows' MapLibre addProtocol).
  // Returns a transferable ArrayBuffer, or null for malformed/unknown tiles.
  ipcMain.handle(IPC_CHANNELS.TILE_CACHE_GET_TILE, async (_event, url: string) => {
    const { body } = await resolveTileBytes(url);
    return body; // ArrayBuffer (transferred over IPC) or null
  });

  const broadcast = (channel: string, payload: unknown) => {
    for (const w of BrowserWindow.getAllWindows()) {
      if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(channel, payload);
    }
  };
  ipcMain.handle(IPC_CHANNELS.TILE_SOURCES_LIST, () => listTileSources());
  subscribeTileSources(() => broadcast(IPC_CHANNELS.TILE_SOURCES_CHANGED, listTileSources()));
  ipcMain.handle(IPC_CHANNELS.SCENE_MESHES_LIST, () => listSceneMeshes());
  subscribeSceneMeshes(() => broadcast(IPC_CHANNELS.SCENE_MESHES_CHANGED, listSceneMeshes()));

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
