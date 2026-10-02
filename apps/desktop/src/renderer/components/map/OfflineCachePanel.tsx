/**
 * Control panel for "Cache map area" mode - pinned to the top of the telemetry map while
 * the adjustable box (OfflineCacheBox) is shown. Reads the box bounds from the cache-area
 * store, estimates the tile count/size, and downloads the area for offline use (reusing
 * the existing tile-cache backend). Renders nothing when the mode is off.
 */

import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback } from 'react';
import { mapLayerName, type LayerKey } from '../../../shared/map-layers';
import type { TileCacheDownloadProgress } from '../../../shared/ipc-channels';
import { useTileCacheStore } from '../../stores/tile-cache-store';
import { useTileCacheAreaStore } from '../../stores/tile-cache-area-store';

const api = (window as any).electronAPI;
const BASE_LAYERS: LayerKey[] = ['osm', 'satellite', 'googleSat', 'googleHybrid', 'terrain', 'dark'];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function OfflineCachePanel({ activeLayer }: { activeLayer: string }): JSX.Element | null {
  const { t } = useTranslation();
  const active = useTileCacheAreaStore((s) => s.active);
  const bounds = useTileCacheAreaStore((s) => s.bounds);
  const setActive = useTileCacheAreaStore((s) => s.setActive);
  const addRegion = useTileCacheStore((s) => s.addRegion);

  const [maxZoom, setMaxZoom] = useState(16);
  const [selectedLayers, setSelectedLayers] = useState<Set<LayerKey>>(() => new Set([activeLayer as LayerKey]));
  const [estimate, setEstimate] = useState<number | null>(null);
  const [progress, setProgress] = useState<TileCacheDownloadProgress | null>(null);
  const [downloadId, setDownloadId] = useState<string | null>(null);

  useEffect(() => {
    if (!active) { setSelectedLayers(new Set([activeLayer as LayerKey])); setProgress(null); setDownloadId(null); }
  }, [active, activeLayer]);

  useEffect(() => {
    const unsub = api.onTileCacheDownloadProgress((p: TileCacheDownloadProgress) => {
      setProgress(p);
      if (p.status === 'complete') {
        setDownloadId(null);
        if (bounds) {
          addRegion({ id: p.downloadId, bounds, minZoom: 10, maxZoom, layers: Array.from(selectedLayers), downloadedAt: Date.now(), tileCount: p.downloadedTiles });
        }
      } else if (p.status === 'cancelled') {
        setDownloadId(null);
      }
    });
    return unsub;
  }, [bounds, maxZoom, selectedLayers, addRegion]);

  useEffect(() => {
    if (!active || !bounds || selectedLayers.size === 0) { setEstimate(null); return; }
    api.tileCacheCalculateTiles({ bounds, minZoom: 10, maxZoom, layerCount: selectedLayers.size })
      .then((r: { tileCount: number }) => setEstimate(r.tileCount)).catch(() => {});
  }, [active, bounds, maxZoom, selectedLayers]);

  const toggleLayer = (key: LayerKey) => setSelectedLayers((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const startDownload = useCallback(async (forceRefresh = false) => {
    if (!bounds || selectedLayers.size === 0) return;
    try {
      const result = await api.tileCacheDownloadRegion({ bounds, minZoom: 10, maxZoom, layers: Array.from(selectedLayers), forceRefresh });
      setDownloadId(result.downloadId);
    } catch { /* ignore */ }
  }, [bounds, maxZoom, selectedLayers]);

  const handleCancel = useCallback(async () => {
    if (downloadId) await api.tileCacheCancelDownload(downloadId).catch(() => {});
  }, [downloadId]);

  if (!active) return null;

  const isDownloading = downloadId && progress?.status === 'downloading';
  const pct = progress && progress.totalTiles > 0 ? Math.round((progress.downloadedTiles / progress.totalTiles) * 100) : 0;

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[1100] w-72 bg-surface-overlay backdrop-blur-md border border-subtle rounded-lg shadow-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-content">{t('map:offlineCache.title')}</span>
        <button onClick={() => setActive(false)} className="text-content-tertiary hover:text-content text-sm leading-none" data-tip={t('common:close')}>×</button>
      </div>

      {isDownloading && progress ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-content-secondary">
            <span>{progress.downloadedTiles.toLocaleString()} / {progress.totalTiles.toLocaleString()}</span>
            <span>{formatBytes(progress.bytesDownloaded)}</span>
          </div>
          <div className="w-full h-1.5 bg-surface-inset rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <button onClick={handleCancel} className="w-full px-2 py-1 text-xs rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-600/30 transition-colors">{t('common:cancel')}</button>
        </div>
      ) : progress?.status === 'complete' ? (
        <div className="space-y-2">
          <div className="text-xs text-emerald-500">
            {progress.skippedTiles === progress.downloadedTiles
              ? t('map:offlineCache.allCached', { count: progress.downloadedTiles.toLocaleString() })
              : t('map:offlineCache.doneNew', { count: (progress.downloadedTiles - progress.skippedTiles).toLocaleString(), size: formatBytes(progress.bytesDownloaded) })}
          </div>
          <button onClick={() => { setProgress(null); setActive(false); }} className="w-full px-2 py-1 text-xs rounded bg-surface-raised text-content hover:bg-surface-raised transition-colors">{t('common:done')}</button>
        </div>
      ) : (
        <>
          <div className="text-[10px] text-content-secondary">{t('map:offlineCache.dragHint')}</div>
          <div>
            <div className="text-[10px] text-content-secondary mb-1">{t('map:offlineArea.layers')}</div>
            <div className="flex flex-wrap gap-1">
              {BASE_LAYERS.map((key) => (
                <button
                  key={key}
                  onClick={() => toggleLayer(key)}
                  className={`px-1.5 py-0.5 text-[10px] rounded transition-colors ${
                    selectedLayers.has(key) ? 'bg-blue-600/30 text-blue-400 border border-blue-500/40' : 'bg-surface-raised text-content-secondary border border-subtle'
                  }`}
                >
                  {mapLayerName(key)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-[10px] text-content-secondary mb-0.5">
              <span>{t('map:offlineArea.detailLevel')}</span>
              <span className="text-content">{maxZoom}</span>
            </div>
            <input type="range" min={12} max={19} value={maxZoom} onChange={(e) => setMaxZoom(parseInt(e.target.value))} className="w-full accent-blue-500" />
          </div>
          {estimate !== null && (
            <div className="text-[10px] text-content-secondary">{t('map:offlineArea.estimate', { count: estimate.toLocaleString(), size: formatBytes(estimate * 15000) })}</div>
          )}
          <div className="flex gap-1.5">
            <button onClick={() => startDownload(false)} disabled={!bounds || selectedLayers.size === 0} className="flex-1 px-2 py-1.5 text-xs rounded bg-emerald-600 text-white hover:bg-emerald-500 transition-colors disabled:opacity-50">{t('common:download')}</button>
            <button onClick={() => startDownload(true)} disabled={!bounds || selectedLayers.size === 0} className="px-2 py-1.5 text-xs rounded bg-blue-600/80 text-white hover:bg-blue-500 transition-colors disabled:opacity-50" data-tip={t('map:offlineCache.refreshTip')}>{t('map:offlineArea.refresh')}</button>
          </div>
        </>
      )}
    </div>
  );
}
