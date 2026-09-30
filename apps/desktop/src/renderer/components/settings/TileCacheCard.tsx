import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { MAP_LAYERS, type LayerKey } from '../../../shared/map-layers';
import type { TileCacheStats, TileCacheDownloadProgress, TileCacheSettings, TileCacheDownloadRegion } from '../../../shared/ipc-channels';
import { useTileCacheStore } from '../../stores/tile-cache-store';

const api = (window as any).electronAPI;

// Layer keys available for download (exclude DEM from user-facing list label)
const DOWNLOADABLE_LAYERS = Object.keys(MAP_LAYERS).filter((k) => k !== 'dem') as LayerKey[];

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Draft/commit input: committing on every keystroke snaps in-progress edits
// (e.g. "51.") to 0, so hold the raw string and commit on blur/Enter.
function BoundsInput({ label, value, placeholder, onCommit }: {
  label: string;
  value: number;
  placeholder: string;
  onCommit: (v: number) => void;
}) {
  const [draft, setDraft] = useState(value ? String(value) : '');
  useEffect(() => { setDraft(value ? String(value) : ''); }, [value]);
  const commit = () => onCommit(parseFloat(draft) || 0);
  return (
    <div>
      <label className="text-[10px] text-content-secondary block mb-0.5">{label}</label>
      <input
        type="number"
        step="0.001"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        className="w-full px-2 py-1 text-xs bg-surface-input border border-subtle rounded text-content focus:border-blue-500/50 focus:outline-none"
        placeholder={placeholder}
      />
    </div>
  );
}

export function TileCacheCard() {
  const { t } = useTranslation('settings');
  const [stats, setStats] = useState<TileCacheStats | null>(null);
  const [settings, setSettings] = useState<TileCacheSettings | null>(null);
  const [showPerLayer, setShowPerLayer] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearLayer, setClearLayer] = useState<string | null>(null);
  // Two-step delete confirmation: clearing can wipe GBs of offline tiles
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmLayer, setConfirmLayer] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmClearAll) return;
    const t = setTimeout(() => setConfirmClearAll(false), 4000);
    return () => clearTimeout(t);
  }, [confirmClearAll]);

  useEffect(() => {
    if (confirmLayer === null) return;
    const t = setTimeout(() => setConfirmLayer(null), 4000);
    return () => clearTimeout(t);
  }, [confirmLayer]);

  // Download region state
  const [showDownload, setShowDownload] = useState(false);
  const [dlBounds, setDlBounds] = useState({ north: 0, south: 0, east: 0, west: 0 });
  const [dlMinZoom, setDlMinZoom] = useState(10);
  const [dlMaxZoom, setDlMaxZoom] = useState(16);
  const [dlLayers, setDlLayers] = useState<Set<LayerKey>>(new Set(['osm', 'satellite']));
  const [dlEstimate, setDlEstimate] = useState<number | null>(null);
  const [dlProgress, setDlProgress] = useState<TileCacheDownloadProgress | null>(null);
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);

  // Load stats and settings
  const refreshStats = useCallback(async () => {
    try {
      const s = await api.tileCacheGetStats();
      setStats(s);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshStats();
    api.tileCacheGetSettings().then((s: TileCacheSettings) => setSettings(s)).catch(() => {});
  }, [refreshStats]);

  // Listen for download progress
  useEffect(() => {
    const unsub = api.onTileCacheDownloadProgress((progress: TileCacheDownloadProgress) => {
      setDlProgress(progress);
      if (progress.status === 'complete' || progress.status === 'cancelled') {
        setActiveDownloadId(null);
        refreshStats();
      }
    });
    return unsub;
  }, [refreshStats]);

  // Estimate tile count when download params change
  useEffect(() => {
    if (!showDownload) return;
    if (dlBounds.north === 0 && dlBounds.south === 0) return;

    api.tileCacheCalculateTiles({
      bounds: dlBounds,
      minZoom: dlMinZoom,
      maxZoom: dlMaxZoom,
      layerCount: dlLayers.size,
    }).then((r: { tileCount: number }) => setDlEstimate(r.tileCount)).catch(() => {});
  }, [showDownload, dlBounds, dlMinZoom, dlMaxZoom, dlLayers]);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await api.tileCacheClear();
      useTileCacheStore.getState().clearRegions();
      await refreshStats();
    } finally {
      setClearing(false);
    }
  };

  const handleClearLayer = async (layer: string) => {
    setClearLayer(layer);
    try {
      await api.tileCacheClear(layer);
      useTileCacheStore.getState().fetchRegions();
      await refreshStats();
    } finally {
      setClearLayer(null);
    }
  };

  const handleSettingChange = async (key: keyof TileCacheSettings, value: number | boolean) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await api.tileCacheSetSettings({ [key]: value }).catch(() => {});
  };

  const toggleDlLayer = (layer: LayerKey) => {
    setDlLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layer)) next.delete(layer);
      else next.add(layer);
      return next;
    });
  };

  const handleStartDownload = async () => {
    if (dlLayers.size === 0) return;
    try {
      const result = await api.tileCacheDownloadRegion({
        bounds: dlBounds,
        minZoom: dlMinZoom,
        maxZoom: dlMaxZoom,
        layers: Array.from(dlLayers),
      });
      setActiveDownloadId(result.downloadId);
      setDlProgress({
        downloadId: result.downloadId,
        totalTiles: dlEstimate ?? 0,
        downloadedTiles: 0,
        skippedTiles: 0,
        failedTiles: 0,
        bytesDownloaded: 0,
        status: 'downloading',
      });
    } catch { /* ignore */ }
  };

  const handleCancelDownload = async () => {
    if (activeDownloadId) {
      await api.tileCacheCancelDownload(activeDownloadId).catch(() => {});
    }
  };

  const maxSizeBytes = (settings?.maxCacheSizeGB ?? 5) * 1024 * 1024 * 1024;
  const usagePercent = stats ? Math.min(100, (stats.totalSizeBytes / maxSizeBytes) * 100) : 0;

  return (
    <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
      {/* Header */}
      <h2 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        Offline Maps
        {stats && (
          <span className="ml-auto px-2 py-0.5 rounded text-xs font-mono bg-surface-raised text-content">
            {formatBytes(stats.totalSizeBytes)}
          </span>
        )}
      </h2>

      {/* Cache Usage Bar */}
      {stats && settings && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
            <span>{stats.totalTiles.toLocaleString()} tiles</span>
            <span>{formatBytes(stats.totalSizeBytes)} / {settings.maxCacheSizeGB} GB</span>
          </div>
          <div className="w-full h-2 bg-surface-inset rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Per-layer breakdown */}
      {stats && Object.keys(stats.layers).length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowPerLayer(!showPerLayer)}
            className="text-xs text-content-secondary hover:text-content transition-colors flex items-center gap-1"
          >
            <svg className={`w-3 h-3 transition-transform ${showPerLayer ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Per-layer breakdown
          </button>

          {showPerLayer && (
            <div className="mt-2 space-y-1.5">
              {Object.entries(stats.layers).map(([layer, data]) => (
                <div key={layer} className="flex items-center justify-between text-xs">
                  <span className="text-content">{MAP_LAYERS[layer as LayerKey]?.name ?? layer}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-content-secondary font-mono">
                      {data.tiles.toLocaleString()} tiles / {formatBytes(data.bytes)}
                    </span>
                    {confirmLayer === layer ? (
                      <button
                        onClick={() => {
                          setConfirmLayer(null);
                          handleClearLayer(layer);
                        }}
                        disabled={clearLayer === layer}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-600 text-white hover:bg-red-500 transition-colors disabled:opacity-50"
                      >
                        Delete {formatBytes(data.bytes)}?
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmLayer(layer)}
                        disabled={clearLayer === layer}
                        className="text-red-400/60 hover:text-red-400 transition-colors disabled:opacity-50"
                        title={`Clear ${layer} cache (${formatBytes(data.bytes)})`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => {
            if (confirmClearAll) {
              setConfirmClearAll(false);
              handleClearAll();
            } else {
              setConfirmClearAll(true);
            }
          }}
          disabled={clearing || !stats || stats.totalTiles === 0}
          className={`px-3 py-1.5 text-xs rounded border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
            confirmClearAll
              ? 'bg-red-600 text-white border-red-600 hover:bg-red-500'
              : 'bg-red-600/20 text-red-400 hover:bg-red-600/30 border-red-600/30'
          }`}
        >
          {clearing
            ? 'Clearing...'
            : confirmClearAll
              ? `Delete ${stats ? formatBytes(stats.totalSizeBytes) : ''}?`
              : 'Clear All Cache'}
        </button>
        <button
          onClick={() => setShowDownload(!showDownload)}
          className={`px-3 py-1.5 text-xs rounded transition-colors border ${
            showDownload
              ? 'bg-blue-600/20 text-blue-400 border-blue-600/30'
              : 'bg-surface-raised text-content hover:bg-surface-raised border-subtle'
          }`}
        >
          Download Region
        </button>
        <button
          onClick={refreshStats}
          className="px-3 py-1.5 text-xs rounded bg-surface-raised text-content hover:bg-surface-raised border border-subtle transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Download Region Panel */}
      {showDownload && (
        <div className="rounded-lg border border-subtle p-4 mb-4 space-y-3">
          <h4 className="text-xs font-medium text-content uppercase tracking-wider">{t('tileCache.downloadHeading')}</h4>

          {/* Bounding box inputs */}
          <div className="grid grid-cols-2 gap-2">
            <BoundsInput
              label={t('tileCache.northLat')}
              value={dlBounds.north}
              placeholder={t('tileCache.latMaxPlaceholder')}
              onCommit={(v) => setDlBounds((b) => ({ ...b, north: v }))}
            />
            <BoundsInput
              label={t('tileCache.southLat')}
              value={dlBounds.south}
              placeholder={t('tileCache.latMinPlaceholder')}
              onCommit={(v) => setDlBounds((b) => ({ ...b, south: v }))}
            />
            <BoundsInput
              label={t('tileCache.westLon')}
              value={dlBounds.west}
              placeholder={t('tileCache.lonMinPlaceholder')}
              onCommit={(v) => setDlBounds((b) => ({ ...b, west: v }))}
            />
            <BoundsInput
              label={t('tileCache.eastLon')}
              value={dlBounds.east}
              placeholder={t('tileCache.lonMaxPlaceholder')}
              onCommit={(v) => setDlBounds((b) => ({ ...b, east: v }))}
            />
          </div>

          {/* Layer selection */}
          <div>
            <label className="text-[10px] text-content-secondary block mb-1">{t('tileCache.layersLabel')}</label>
            <div className="flex flex-wrap gap-1.5">
              {DOWNLOADABLE_LAYERS.map((key) => (
                <button
                  key={key}
                  onClick={() => toggleDlLayer(key)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    dlLayers.has(key)
                      ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                      : 'bg-surface-raised text-content-secondary border border-subtle hover:text-content'
                  }`}
                >
                  {MAP_LAYERS[key].name}
                </button>
              ))}
              {/* DEM option */}
              <button
                onClick={() => toggleDlLayer('dem')}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  dlLayers.has('dem')
                    ? 'bg-blue-600/30 text-blue-300 border border-blue-500/30'
                    : 'bg-surface-raised text-content-secondary border border-subtle hover:text-content'
                }`}
              >
                Elevation (DEM)
              </button>
            </div>
          </div>

          {/* Zoom range */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-content-secondary block mb-0.5">Min Zoom: {dlMinZoom}</label>
              <input
                type="range"
                min={1}
                max={18}
                value={dlMinZoom}
                onChange={(e) => setDlMinZoom(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-content-secondary block mb-0.5">Max Zoom: {dlMaxZoom}</label>
              <input
                type="range"
                min={1}
                max={20}
                value={dlMaxZoom}
                onChange={(e) => setDlMaxZoom(parseInt(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          {/* Estimate */}
          {dlEstimate !== null && (
            <div className="text-xs text-content-secondary">
              Estimated: <span className="text-content font-mono">{dlEstimate.toLocaleString()}</span> tiles
              (~{formatBytes(dlEstimate * 15000)})
            </div>
          )}

          {/* Download / Cancel */}
          {activeDownloadId && dlProgress ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-content-secondary">
                  {dlProgress.downloadedTiles.toLocaleString()} / {dlProgress.totalTiles.toLocaleString()}
                  {dlProgress.failedTiles > 0 && (
                    <span className="text-red-400 ml-1">({dlProgress.failedTiles} failed)</span>
                  )}
                </span>
                <span className="text-content-secondary font-mono">{formatBytes(dlProgress.bytesDownloaded)}</span>
              </div>
              <div className="w-full h-2 bg-surface-inset rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${dlProgress.totalTiles > 0 ? (dlProgress.downloadedTiles / dlProgress.totalTiles) * 100 : 0}%`,
                  }}
                />
              </div>
              {dlProgress.status === 'downloading' ? (
                <button
                  onClick={handleCancelDownload}
                  className="px-3 py-1.5 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 transition-colors"
                >
                  Cancel Download
                </button>
              ) : (
                <span className={`text-xs ${dlProgress.status === 'complete' ? 'text-emerald-400' : 'text-yellow-400'}`}>
                  {dlProgress.status === 'complete' ? 'Download complete' : 'Download cancelled'}
                </span>
              )}
            </div>
          ) : (
            <button
              onClick={handleStartDownload}
              disabled={dlLayers.size === 0 || (dlBounds.north === 0 && dlBounds.south === 0)}
              className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Download
            </button>
          )}
        </div>
      )}

      {/* Saved Regions */}
      <SavedRegions />

      {/* Settings */}
      {settings && (
        <div className="space-y-3 pt-3 border-t border-subtle">
          <h4 className="text-xs font-medium text-content-secondary uppercase tracking-wider">{t('tileCache.settingsHeading')}</h4>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-content">{t('tileCache.maxCacheSize')}</span>
              <span className="text-xs text-content-secondary ml-1.5">{settings.maxCacheSizeGB} GB</span>
            </div>
            <input
              type="range"
              min={1}
              max={20}
              value={settings.maxCacheSizeGB}
              onChange={(e) => handleSettingChange('maxCacheSizeGB', parseInt(e.target.value))}
              className="w-32 accent-blue-500"
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-content">{t('tileCache.autoCache')}</span>
            <button
              onClick={() => handleSettingChange('enableAutoCache', !settings.enableAutoCache)}
              className={`relative w-8 h-4 rounded-full transition-colors ${
                settings.enableAutoCache ? 'bg-blue-600' : 'bg-surface-inset'
              }`}
            >
              <div
                className={`absolute top-0.5 w-3 h-3 rounded-full bg-white border border-strong shadow-sm transition-transform ${
                  settings.enableAutoCache ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs text-content">{t('tileCache.maxAutoCacheZoom')}</span>
              <span className="text-xs text-content-secondary ml-1.5">{settings.maxZoomAutoCache}</span>
            </div>
            <input
              type="range"
              min={10}
              max={20}
              value={settings.maxZoomAutoCache}
              onChange={(e) => handleSettingChange('maxZoomAutoCache', parseInt(e.target.value))}
              className="w-32 accent-blue-500"
            />
          </div>
        </div>
      )}
    </section>
  );
}

function formatBounds(b: TileCacheDownloadRegion['bounds']): string {
  return `${b.south.toFixed(3)}, ${b.west.toFixed(3)} to ${b.north.toFixed(3)}, ${b.east.toFixed(3)}`;
}

function SavedRegions() {
  const { t } = useTranslation('settings');
  const regions = useTileCacheStore(s => s.regions);
  const fetchRegions = useTileCacheStore(s => s.fetchRegions);
  const deleteRegion = useTileCacheStore(s => s.deleteRegion);
  const clearRegions = useTileCacheStore(s => s.clearRegions);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => { fetchRegions(); }, [fetchRegions]);

  if (regions.length === 0) return null;

  return (
    <div className="mb-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-xs text-content-secondary hover:text-content transition-colors flex items-center gap-1"
      >
        <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        Saved regions ({regions.length})
      </button>

      {expanded && (
        <div className="mt-2 space-y-1.5">
          {regions.map((r) => (
            <div key={r.id} className="flex items-center justify-between text-xs bg-surface-raised rounded px-2.5 py-1.5">
              <div className="min-w-0">
                <div className="text-content font-mono text-[10px] truncate">{formatBounds(r.bounds)}</div>
                <div className="text-content-secondary text-[10px]">
                  {r.tileCount.toLocaleString()} tiles &middot; z{r.minZoom}-{r.maxZoom} &middot; {new Date(r.downloadedAt).toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={() => deleteRegion(r.id)}
                className="text-red-400/60 hover:text-red-400 transition-colors shrink-0 ml-2"
                title={t('tileCache.removeRegionTooltip')}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          ))}

          {regions.length > 1 && (
            <button
              onClick={async () => {
                const api = (window as any).electronAPI;
                for (const r of regions) {
                  await api.tileCacheDeleteRegion(r.id).catch(() => {});
                }
                clearRegions();
              }}
              className="text-[10px] text-red-400/60 hover:text-red-400 transition-colors mt-1"
            >
              Remove all saved regions
            </button>
          )}
        </div>
      )}
    </div>
  );
}
