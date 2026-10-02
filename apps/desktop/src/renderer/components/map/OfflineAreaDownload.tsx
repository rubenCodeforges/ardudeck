/**
 * Compact inline popover for downloading the visible map area for offline use.
 * Designed to sit in the map toolbar — no need to navigate to Settings.
 */
import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import { mapLayerName, type LayerKey } from '../../../shared/map-layers';
import type { TileCacheDownloadProgress } from '../../../shared/ipc-channels';
import { useNetworkStore } from '../../stores/network-store';
import { useTileCacheStore } from '../../stores/tile-cache-store';

const api = (window as any).electronAPI;

const BASE_LAYERS: LayerKey[] = ['osm', 'satellite', 'googleSat', 'googleHybrid', 'bingSat', 'bingHybrid', 'terrain', 'dark'];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

interface OfflineAreaDownloadProps {
  /** Current map bounds — {north, south, east, west} */
  bounds: { north: number; south: number; east: number; west: number } | null;
  /** Current active layer key */
  activeLayer: string;
}

export function OfflineAreaDownload({ bounds, activeLayer }: OfflineAreaDownloadProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [maxZoom, setMaxZoom] = useState(16);
  const [selectedLayers, setSelectedLayers] = useState<Set<LayerKey>>(
    () => new Set([activeLayer as LayerKey]),
  );
  const [estimate, setEstimate] = useState<number | null>(null);
  const [progress, setProgress] = useState<TileCacheDownloadProgress | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const isOnline = useNetworkStore(s => s.isOnline);
  const addRegion = useTileCacheStore(s => s.addRegion);

  // Sync default layer with active map layer
  useEffect(() => {
    if (!open) setSelectedLayers(new Set([activeLayer as LayerKey]));
  }, [activeLayer, open]);

  // Listen for progress
  useEffect(() => {
    const unsub = api.onTileCacheDownloadProgress((p: TileCacheDownloadProgress) => {
      setProgress(p);
      if (p.status === 'complete') {
        setDownloadId(null);
        // Instant overlay update — region is also persisted on the backend
        if (bounds) {
          addRegion({
            id: p.downloadId,
            bounds,
            minZoom: 10,
            maxZoom,
            layers: Array.from(selectedLayers),
            downloadedAt: Date.now(),
            tileCount: p.downloadedTiles,
          });
        }
      } else if (p.status === 'cancelled') {
        setDownloadId(null);
      }
    });
    return unsub;
  }, [bounds, maxZoom, selectedLayers, addRegion]);

  // Estimate tile count
  useEffect(() => {
    if (!open || !bounds || selectedLayers.size === 0) {
      setEstimate(null);
      return;
    }
    api.tileCacheCalculateTiles({
      bounds,
      minZoom: 10,
      maxZoom,
      layerCount: selectedLayers.size,
    }).then((r: { tileCount: number }) => setEstimate(r.tileCount)).catch(() => {});
  }, [open, bounds, maxZoom, selectedLayers]);

  const toggleLayer = (key: LayerKey) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startDownload = useCallback(async (forceRefresh = false) => {
    if (!bounds || selectedLayers.size === 0) return;
    try {
      const result = await api.tileCacheDownloadRegion({
        bounds,
        minZoom: 10,
        maxZoom,
        layers: Array.from(selectedLayers),
        forceRefresh,
      });
      setDownloadId(result.downloadId);
    } catch { /* ignore */ }
  }, [bounds, maxZoom, selectedLayers]);

  const handleCancel = useCallback(async () => {
    if (downloadId) {
      await api.tileCacheCancelDownload(downloadId).catch(() => {});
    }
  }, [downloadId]);

  const isDownloading = downloadId && progress?.status === 'downloading';
  const pct = progress && progress.totalTiles > 0
    ? Math.round((progress.downloadedTiles / progress.totalTiles) * 100)
    : 0;

  return (
    <div className="relative w-full">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(!open)}
        className={`w-full px-2 py-1 text-xs rounded shadow-lg transition-colors flex items-center gap-1.5 ${
          open || isDownloading
            ? 'bg-emerald-600 text-white'
            : 'bg-surface-solid text-content hover:bg-surface-raised border border-subtle'
        }`}
        title={t('map:offlineArea.saveTitle')}
      >
        <span className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        {isDownloading ? `${pct}%` : t('map:offlineArea.offline')}
      </button>

      {/* Popover */}
      {open && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => !isDownloading && setOpen(false)} />
          <div className="absolute right-0 bottom-full mb-1 w-64 bg-surface-raised border border-subtle rounded-lg shadow-xl z-[999] p-3 space-y-2.5">
            <div className="text-xs font-medium text-content">{t('map:offlineArea.heading')}</div>

            {!bounds ? (
              <div className="text-xs text-content-secondary">{t('map:offlineArea.moveMap')}</div>
            ) : isDownloading && progress ? (
              /* Download in progress */
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[10px] text-content-secondary">
                  <span>{progress.downloadedTiles.toLocaleString()} / {progress.totalTiles.toLocaleString()}</span>
                  <span>{formatBytes(progress.bytesDownloaded)}</span>
                </div>
                <div className="w-full h-1.5 bg-surface-inset rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <button
                  onClick={handleCancel}
                  className="w-full px-2 py-1 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 transition-colors"
                >
                  {t('common:cancel')}
                </button>
              </div>
            ) : progress?.status === 'complete' ? (
              /* Complete */
              <div className="space-y-2">
                <div className="text-xs text-emerald-400">
                  {progress.skippedTiles === progress.downloadedTiles
                    ? t('map:offlineArea.allCachedSize', { count: progress.downloadedTiles.toLocaleString(), size: formatBytes(progress.bytesDownloaded) })
                    : progress.skippedTiles > 0
                      ? t('map:offlineArea.doneMixed', { fresh: (progress.downloadedTiles - progress.skippedTiles).toLocaleString(), cached: progress.skippedTiles.toLocaleString(), size: formatBytes(progress.bytesDownloaded) })
                      : t('map:offlineArea.doneSaved', { count: progress.downloadedTiles.toLocaleString(), size: formatBytes(progress.bytesDownloaded) })
                  }
                </div>
                <button
                  onClick={() => { setProgress(null); setOpen(false); }}
                  className="w-full px-2 py-1 text-xs rounded bg-surface-raised text-content hover:bg-surface-raised transition-colors"
                >
                  {t('common:close')}
                </button>
              </div>
            ) : (
              /* Config */
              <>
                {/* Layer chips */}
                <div>
                  <div className="text-[10px] text-content-secondary mb-1">{t('map:offlineArea.layers')}</div>
                  <div className="flex flex-wrap gap-1">
                    {BASE_LAYERS.map((key) => (
                      <button
                        key={key}
                        onClick={() => toggleLayer(key)}
                        className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                          selectedLayers.has(key)
                            ? 'bg-blue-600/30 text-blue-300 border border-blue-500/40'
                            : 'bg-surface-raised text-content-secondary border border-subtle'
                        }`}
                      >
                        {mapLayerName(key)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Max zoom */}
                <div>
                  <div className="flex items-center justify-between text-[10px] text-content-secondary mb-0.5">
                    <span>{t('map:offlineArea.detailLevel')}</span>
                    <span className="text-content">{maxZoom}</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={19}
                    value={maxZoom}
                    onChange={(e) => setMaxZoom(parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>

                {/* Estimate + Download */}
                {estimate !== null && (
                  <div className="text-[10px] text-content-secondary">
                    {t('map:offlineArea.estimate', { count: estimate.toLocaleString(), size: formatBytes(estimate * 15000) })}
                  </div>
                )}

                <div className="flex gap-1.5">
                  <button
                    onClick={() => startDownload(false)}
                    disabled={selectedLayers.size === 0}
                    className="flex-1 px-2 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('common:download')}
                  </button>
                  <button
                    onClick={() => startDownload(true)}
                    disabled={selectedLayers.size === 0}
                    className="px-2 py-1.5 text-xs rounded bg-blue-600/80 text-white hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={t('map:offlineArea.refreshTitle')}
                  >
                    {t('map:offlineArea.refresh')}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
