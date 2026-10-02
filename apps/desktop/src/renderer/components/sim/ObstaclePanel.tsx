/**
 * ObstaclePanel — author persistent obstacles in the sim world and push them to
 * the flight controller as exclusion fences (the "fence hack").
 *
 * Obstacles are stored geographically (per test site) and survive restarts.
 * "Apply as fences" converts each to an ArduPilot exclusion fence and enables
 * fence-based avoidance + path planning so the vehicle genuinely routes around
 * them — visible in this 3D world and on the map at once.
 */
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { useSimObstaclesStore } from '../../stores/sim-obstacles-store';
import { useConnectionStore } from '../../stores/connection-store';
import { localToLatLng } from '../survey/geo-math';
import { buildFenceItems, type PolygonFence, type CircleFence } from '../../../shared/fence-types';

export default function ObstaclePanel() {
  const { t } = useTranslation();
  const obstacles = useSimObstaclesStore((s) => s.obstacles);
  const placing = useSimObstaclesStore((s) => s.placing);
  const draft = useSimObstaclesStore((s) => s.draft);
  const setPlacing = useSimObstaclesStore((s) => s.setPlacing);
  const setDraft = useSimObstaclesStore((s) => s.setDraft);
  const remove = useSimObstaclesStore((s) => s.remove);
  const clear = useSimObstaclesStore((s) => s.clear);
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);

  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus((s) => (s === msg ? null : s)), 3000);
  }, []);

  const applyToFc = useCallback(async () => {
    const list = useSimObstaclesStore.getState().obstacles;
    if (list.length === 0) {
      flash(t('sim:obstaclePanel.noneToApply'));
      return;
    }
    setApplying(true);
    try {
      const circles: CircleFence[] = [];
      const polygons: PolygonFence[] = [];
      for (const o of list) {
        if (o.shape === 'cylinder') {
          circles.push({ id: o.id, type: 'exclusion', center: { lat: o.lat, lon: o.lon }, radius: Math.max(1, o.radius), seq: 0 });
        } else {
          const h = Math.max(1, o.radius);
          const corners: Array<[number, number]> = [[h, h], [h, -h], [-h, -h], [-h, h]]; // [east, north]
          const vertices = corners.map(([e, n], vi) => {
            const ll = localToLatLng({ lat: o.lat, lng: o.lon }, e, n);
            return { seq: vi, lat: ll.lat, lon: ll.lng };
          });
          polygons.push({ id: o.id, type: 'exclusion', vertices });
        }
      }
      const items = buildFenceItems(polygons, circles, null);
      const up = await window.electronAPI?.uploadFence?.(items);
      if (!up?.success) {
        flash(up?.error ? t('sim:obstaclePanel.uploadFailedWithError', { error: up.error }) : t('sim:obstaclePanel.fenceUploadFailed'));
        return;
      }
      // Enable fence-based avoidance + Dijkstra path planning around exclusions.
      await window.electronAPI?.setParameterBatch?.([
        { paramId: 'FENCE_ENABLE', value: 1, type: 9 },
        { paramId: 'FENCE_TYPE', value: 6, type: 9 }, // 2=circle | 4=polygon
        { paramId: 'AVOID_ENABLE', value: 7, type: 9 }, // all sources
        { paramId: 'OA_TYPE', value: 2, type: 9 }, // Dijkstra
        { paramId: 'FENCE_MARGIN', value: 2, type: 9 },
      ]);
      flash(t('sim:obstaclePanel.applied', { count: list.length }));
    } catch (e) {
      flash(e instanceof Error ? e.message : t('sim:obstaclePanel.applyFailed'));
    } finally {
      setApplying(false);
    }
  }, [flash, t]);

  const clearFromFc = useCallback(async () => {
    setApplying(true);
    try {
      await window.electronAPI?.clearFence?.();
      flash(t('sim:obstaclePanel.clearedFc'));
    } catch (e) {
      flash(e instanceof Error ? e.message : t('sim:obstaclePanel.clearFailed'));
    } finally {
      setApplying(false);
    }
  }, [flash, t]);

  const num = 'w-16 px-1.5 py-1 text-xs rounded-md bg-surface-raised border border-subtle text-content text-center tabular-nums';

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        data-tip={t('sim:obstaclePanel.openTip')}
        className="absolute top-14 right-3 z-10 px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised border border-subtle text-content-secondary hover:text-content shadow-lg"
      >
        {obstacles.length > 0 ? t('sim:obstaclePanel.titleWithCount', { count: obstacles.length }) : t('sim:obstaclePanel.title')}
      </button>
    );
  }

  return (
    <div className="absolute top-14 right-3 z-10 w-72 bg-surface-overlay backdrop-blur-sm border border-subtle rounded-xl shadow-xl text-content">
      <div className="flex items-center justify-between px-3 py-2 border-b border-subtle">
        <span className="text-sm font-semibold">{t('sim:obstaclePanel.title')}</span>
        <button onClick={() => setOpen(false)} className="text-content-tertiary hover:text-content text-xs">✕</button>
      </div>

      <div className="p-3 space-y-3">
        <button
          onClick={() => setPlacing(!placing)}
          className={`w-full px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
            placing ? 'bg-sky-600 text-white' : 'bg-surface-raised border border-subtle text-content-secondary hover:text-content'
          }`}
        >
          {placing ? t('sim:obstaclePanel.placing') : t('sim:obstaclePanel.place')}
        </button>

        <div className="flex items-center gap-2 text-xs">
          <select
            value={draft.shape}
            onChange={(e) => setDraft({ shape: e.target.value as 'cylinder' | 'box' })}
            className="flex-1 px-2 py-1 rounded-md bg-surface-raised border border-subtle text-content"
          >
            <option value="cylinder">{t('sim:obstaclePanel.cylinder')}</option>
            <option value="box">{t('sim:obstaclePanel.box')}</option>
          </select>
          <label className="flex items-center gap-1 text-content-tertiary" data-tip={t('sim:obstaclePanel.radiusTip')}>
            r<DraftNumberInput min={1} max={500} value={draft.radius}
              onCommit={(v) => setDraft({ radius: v })} className={num} />
          </label>
          <label className="flex items-center gap-1 text-content-tertiary" data-tip={t('sim:obstaclePanel.heightTip')}>
            h<DraftNumberInput min={1} max={500} value={draft.height}
              onCommit={(v) => setDraft({ height: v })} className={num} />
          </label>
        </div>

        <div className="max-h-40 overflow-y-auto rounded-md border border-subtle divide-y divide-subtle">
          {obstacles.length === 0 ? (
            <div className="px-3 py-3 text-xs text-content-tertiary text-center">{t('sim:obstaclePanel.empty')}</div>
          ) : (
            obstacles.map((o, i) => (
              <div key={o.id} className="flex items-center justify-between px-2 py-1.5 text-xs">
                <span className="text-content-secondary">
                  {o.shape === 'cylinder' ? '◯' : '▢'} #{i + 1} · r{o.radius} h{o.height}
                </span>
                <button onClick={() => remove(o.id)} className="text-content-tertiary hover:text-red-400" data-tip={t('common:remove')}>✕</button>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={applyToFc}
            disabled={!isConnected || applying || obstacles.length === 0}
            data-tip={t('sim:obstaclePanel.applyTip')}
            className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {applying ? '…' : t('sim:obstaclePanel.apply')}
          </button>
          <button
            onClick={clearFromFc}
            disabled={!isConnected || applying}
            data-tip={t('sim:obstaclePanel.clearFcTip')}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-surface-raised border border-subtle text-content-secondary hover:text-content disabled:opacity-40"
          >
            {t('sim:obstaclePanel.clearFc')}
          </button>
        </div>
        {obstacles.length > 0 && (
          <button onClick={clear} className="w-full text-[11px] text-content-tertiary hover:text-red-400">
            {t('sim:obstaclePanel.removeAll')}
          </button>
        )}
        {status && <div className="text-[11px] text-content-secondary text-center">{status}</div>}
      </div>
    </div>
  );
}
