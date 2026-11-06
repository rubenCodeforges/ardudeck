import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Box, X, Upload, FolderPlus, Folder, Trash2, Eye, EyeOff, ChevronRight, ChevronDown,
  Crosshair, Move, AlertTriangle, MapPin,
} from 'lucide-react';
import { ui } from '../ui/ui-hooks';
import { DraftNumberField } from '../ui/DraftNumberField';
import { useUserModelsStore, currentMapCenter } from '../../stores/user-models-store';
import type { UserModel, UserModelFormat } from '../../../shared/scene-models/user-models';
import type { SceneAltitudeMode } from '@ardudeck/module-sdk';
import { applyPlacementField, fileBaseName, PLACEMENT_LIMITS, type PlacementField } from './user-models-helpers';

// i18n-exempt: file format names
const FORMAT_LABEL: Record<Exclude<UserModelFormat, 'pointcloud'>, string> = { gltf: 'glTF', kmz: 'KMZ', tileset: '3D Tiles', cityjson: 'CityJSON' };

const INPUT = 'w-full px-2 py-1 bg-surface-input border border-border rounded text-xs text-content font-mono focus:outline-none focus:border-teal-500 disabled:opacity-60 disabled:cursor-not-allowed';

export function UserModelsDialog(): JSX.Element | null {
  const { t } = useTranslation();
  const open = useUserModelsStore((s) => s.dialogOpen);
  const models = useUserModelsStore((s) => s.models);
  const watched = useUserModelsStore((s) => s.watched);
  const lastImport = useUserModelsStore((s) => s.lastImport);
  const focusId = useUserModelsStore((s) => s.focusId);
  const busy = useUserModelsStore((s) => s.busy);
  const watchError = useUserModelsStore((s) => s.watchError);
  const store = useUserModelsStore.getState;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open && focusId) setExpanded((prev) => new Set(prev).add(focusId));
  }, [open, focusId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') store().closeDialog(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, store]);

  if (!open) return null;

  const needs = new Set(lastImport?.needsPlacement ?? []);
  const toggle = (id: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return createPortal(
    <div
      className="fixed inset-0 z-[2000] bg-black/60 flex items-center justify-center p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) store().closeDialog(); }}
    >
      <div className="w-[min(94vw,640px)] max-h-[88vh] flex flex-col rounded-2xl border border-default bg-surface-solid shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-subtle">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center shrink-0">
            <Box className="w-4 h-4 text-teal-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-content">{t('models:dialog.title')}</h3>
            <p className="text-[11px] text-content-tertiary">{t('models:dialog.subtitle')}</p>
          </div>
          <button
            {...ui('button', { variant: 'primary' })}
            onClick={() => void store().importModels({})}
            disabled={busy}
            data-tip={t('models:dialog.importTip')}
            className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-teal-600 hover:bg-teal-500 disabled:opacity-50 transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            {busy ? t('models:dialog.importing') : t('models:dialog.import')}
          </button>
          <button
            {...ui('icon-button')}
            onClick={() => store().closeDialog()}
            className="w-7 h-7 rounded-md flex items-center justify-center text-content-tertiary hover:text-content hover:bg-surface-raised transition-colors"
            data-tip={t('common:close')}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {lastImport && lastImport.failed.length > 0 && (
            <div {...ui('card')} className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-red-500">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t('models:dialog.failedTitle', { count: lastImport.failed.length })}
                <button
                  {...ui('button', { variant: 'ghost' })}
                  onClick={() => store().dismissImport()}
                  className="ml-auto text-[11px] text-content-tertiary hover:text-content"
                >
                  {t('models:dialog.dismiss')}
                </button>
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {lastImport.failed.map((f) => (
                  <li key={f.file} className="text-content-secondary">
                    <span className="font-mono text-content">{fileBaseName(f.file)}</span>: {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {lastImport?.warnings && lastImport.warnings.length > 0 && (
            <div {...ui('card', { status: 'warn' })} className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t('models:dialog.warningsTitle', { count: lastImport.warnings.length })}
              </div>
              <ul className="mt-1.5 space-y-0.5">
                {lastImport.warnings.map((w) => (
                  <li key={`${w.file}:${w.message}`} className="text-content-secondary">
                    <span className="font-mono text-content">{fileBaseName(w.file)}</span>: {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {needs.size > 0 && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
              <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{t('models:dialog.needsPlacementHint', { count: needs.size })}</span>
            </div>
          )}

          {models.length === 0 ? (
            <div className="rounded-lg border border-dashed border-subtle px-4 py-6 text-center text-xs text-content-tertiary">
              <div className="text-content-secondary font-medium mb-1">{t('models:dialog.emptyTitle')}</div>
              {t('models:dialog.emptyHint')}
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {models.map((m) => (
                <ModelRow
                  key={m.id}
                  model={m}
                  expanded={expanded.has(m.id)}
                  needsPlacement={needs.has(m.id)}
                  onToggle={() => toggle(m.id)}
                />
              ))}
            </div>
          )}

          <WatchedFolders watched={watched} error={watchError} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ModelRow({ model, expanded, needsPlacement, onToggle }: {
  model: UserModel;
  expanded: boolean;
  needsPlacement: boolean;
  onToggle: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const store = useUserModelsStore.getState;
  const fromWatch = model.origin === 'watch';
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (needsPlacement && expanded) ref.current?.scrollIntoView({ block: 'nearest' });
  }, [needsPlacement, expanded]);

  return (
    <div
      ref={ref}
      {...ui('card')}
      className={`rounded-lg border ${needsPlacement ? 'border-amber-500/60 bg-amber-500/5' : 'border-subtle bg-surface'}`}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          {...ui('icon-button')}
          onClick={onToggle}
          data-tip={expanded ? t('models:row.collapse') : t('models:row.editPlacement')}
          className="w-6 h-6 rounded flex items-center justify-center text-content-tertiary hover:text-content hover:bg-surface-raised"
        >
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-medium truncate ${model.visible ? 'text-content' : 'text-content-tertiary'}`}>{model.name}</div>
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {model.format === 'pointcloud' ? (
              <span className="px-1.5 py-px rounded text-[10px] font-medium bg-violet-500/15 text-violet-700 dark:text-violet-300">{t('models:format.pointCloud')}</span>
            ) : (
              <span className="px-1.5 py-px rounded text-[10px] font-medium bg-indigo-500/15 text-indigo-600 dark:text-indigo-300">{FORMAT_LABEL[model.format]}</span>
            )}
            {model.pointCount != null && (
              <span
                className="px-1.5 py-px rounded text-[10px] bg-surface-raised text-content-secondary tabular-nums"
                data-tip={model.sourcePointCount != null ? t('models:row.pointsThinnedTip') : undefined}
              >
                {model.sourcePointCount != null
                  ? t('models:row.pointsThinned', { shown: model.pointCount.toLocaleString(), total: model.sourcePointCount.toLocaleString() })
                  : t('models:row.points', { count: model.pointCount, formatted: model.pointCount.toLocaleString() })}
              </span>
            )}
            <span
              className={`px-1.5 py-px rounded text-[10px] ${model.placedBy === 'data' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'}`}
            >
              {model.placedBy === 'data' ? t('models:row.placedByData') : t('models:row.placedByHand')}
            </span>
            {fromWatch && (
              <span className="px-1.5 py-px rounded text-[10px] bg-surface-raised text-content-secondary" data-tip={model.watchDir}>
                {t('models:row.fromFolder')}
              </span>
            )}
            {needsPlacement && (
              <span className="px-1.5 py-px rounded text-[10px] font-medium bg-amber-500/20 text-amber-700 dark:text-amber-300">
                {t('models:row.needsPosition')}
              </span>
            )}
          </div>
        </div>
        <button
          {...ui('chip', { active: model.visible })}
          onClick={() => void store().setVisible(model.id, !model.visible)}
          data-tip={model.visible ? t('models:row.hide') : t('models:row.show')}
          className={`w-7 h-7 rounded flex items-center justify-center transition-colors ${model.visible ? 'text-teal-500 hover:bg-surface-raised' : 'text-content-tertiary hover:bg-surface-raised'}`}
        >
          {model.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
        {confirming ? (
          <div className="flex items-center gap-1">
            <button
              {...ui('button', { variant: 'danger' })}
              onClick={() => { setConfirming(false); void store().remove(model.id); }}
              className="px-2 py-1 rounded text-[11px] font-medium text-white bg-red-600 hover:bg-red-500"
            >
              {t('models:row.confirmRemove')}
            </button>
            <button
              {...ui('button', { variant: 'ghost' })}
              onClick={() => setConfirming(false)}
              className="px-2 py-1 rounded text-[11px] text-content-secondary hover:text-content hover:bg-surface-raised"
            >
              {t('common:cancel')}
            </button>
          </div>
        ) : (
          <button
            {...ui('icon-button')}
            onClick={() => setConfirming(true)}
            disabled={fromWatch}
            data-tip={fromWatch ? t('models:row.removeWatchedTip') : t('models:row.remove')}
            className="w-7 h-7 rounded flex items-center justify-center text-content-tertiary hover:text-red-500 hover:bg-surface-raised disabled:opacity-40 disabled:hover:text-content-tertiary disabled:hover:bg-transparent"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      {expanded && <PlacementEditor model={model} />}
    </div>
  );
}

const ALT_MODES: SceneAltitudeMode[] = ['amsl', 'agl', 'clamp'];

function PlacementEditor({ model }: { model: UserModel }): JSX.Element {
  const { t } = useTranslation();
  const adjustId = useUserModelsStore((s) => s.adjustId);
  const store = useUserModelsStore.getState;
  const readOnly = model.origin === 'watch';
  const p = model.placement;

  const commit = (field: PlacementField, value: number) => {
    const next = applyPlacementField(p, field, value);
    if (next) void store().updatePlacement(model.id, next);
  };
  const setMode = (altitudeMode: SceneAltitudeMode) => {
    void store().updatePlacement(model.id, { ...p, altitudeMode });
  };
  const placeAtCentre = () => {
    const c = currentMapCenter();
    if (c) void store().updatePlacement(model.id, { ...p, lat: c.lat, lng: c.lng });
  };
  const adjusting = adjustId === model.id;

  const field = (key: PlacementField, labelKey: string, step: number) => (
    <label className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wide text-content-tertiary">{t(labelKey)}</span>
      <DraftNumberField
        value={p[key]}
        onCommit={(v) => commit(key, v)}
        min={PLACEMENT_LIMITS[key].min}
        max={PLACEMENT_LIMITS[key].max}
        step={step}
        disabled={readOnly || (key === 'alt' && p.altitudeMode === 'clamp')}
        aria-label={t(labelKey)}
        className={INPUT}
      />
    </label>
  );

  return (
    <div className="border-t border-subtle px-3 py-2.5 flex flex-col gap-2.5">
      {readOnly && (
        <div className="text-[11px] text-content-secondary bg-surface-raised rounded px-2 py-1.5">
          {t('models:editor.readOnlyNote')}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {field('lat', 'models:editor.lat', 0.00001)}
        {field('lng', 'models:editor.lng', 0.00001)}
        {field('alt', 'models:editor.alt', 0.1)}
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] uppercase tracking-wide text-content-tertiary">{t('models:editor.altMode')}</span>
          <select
            {...ui('input')}
            value={p.altitudeMode}
            disabled={readOnly}
            onChange={(e) => setMode(e.target.value as SceneAltitudeMode)}
            className={INPUT.replace(' font-mono', '')}
          >
            {ALT_MODES.map((mode) => (
              <option key={mode} value={mode}>{t(`models:editor.altModes.${mode}`)}</option>
            ))}
          </select>
        </label>
        {field('yawDeg', 'models:editor.yaw', 1)}
        {field('pitchDeg', 'models:editor.pitch', 1)}
        {field('rollDeg', 'models:editor.roll', 1)}
        {field('scale', 'models:editor.scale', 0.1)}
      </div>
      {!readOnly && (
        <div className="flex flex-wrap gap-1.5">
          <button
            {...ui('button', { variant: 'secondary' })}
            onClick={placeAtCentre}
            data-tip={t('models:editor.placeAtCentreTip')}
            className="px-2.5 py-1 rounded text-[11px] bg-surface-raised text-content-secondary hover:text-content flex items-center gap-1.5"
          >
            <Crosshair className="w-3.5 h-3.5" />
            {t('models:editor.placeAtCentre')}
          </button>
          <button
            {...ui('chip', { active: adjusting })}
            onClick={() => {
              store().setAdjust(adjusting ? null : model.id);
              if (!adjusting) store().closeDialog();
            }}
            data-tip={t('models:editor.adjustOnMapTip')}
            className={`px-2.5 py-1 rounded text-[11px] flex items-center gap-1.5 ${adjusting ? 'bg-teal-600 text-white' : 'bg-surface-raised text-content-secondary hover:text-content'}`}
          >
            <Move className="w-3.5 h-3.5" />
            {t('models:editor.adjustOnMap')}
          </button>
        </div>
      )}
    </div>
  );
}

function WatchedFolders({ watched, error }: { watched: string[]; error: string | null }): JSX.Element {
  const { t } = useTranslation();
  const store = useUserModelsStore.getState;
  return (
    <div {...ui('card')} className="rounded-lg border border-subtle bg-surface px-3 py-2.5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Folder className="w-4 h-4 text-amber-500" />
        <div className="flex-1 text-xs font-medium text-content">{t('models:watch.title')}</div>
        <button
          {...ui('button', { variant: 'secondary' })}
          onClick={() => void store().addWatched()}
          className="px-2.5 py-1 rounded text-[11px] bg-surface-raised text-content-secondary hover:text-content flex items-center gap-1.5"
        >
          <FolderPlus className="w-3.5 h-3.5" />
          {t('models:watch.add')}
        </button>
      </div>
      <p className="text-[11px] text-content-tertiary leading-relaxed">{t('models:watch.explain')}</p>
      {error && <p className="text-[11px] text-red-500">{error}</p>}
      {watched.length === 0 ? (
        <p className="text-[11px] text-content-tertiary italic">{t('models:watch.none')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {watched.map((dir) => (
            <li key={dir} className="flex items-center gap-2 text-[11px] bg-surface-raised rounded px-2 py-1">
              <span className="flex-1 font-mono text-content-secondary truncate" data-tip={dir}>{dir}</span>
              <button
                {...ui('icon-button')}
                onClick={() => void store().removeWatched(dir)}
                data-tip={t('models:watch.remove')}
                className="w-6 h-6 rounded flex items-center justify-center text-content-tertiary hover:text-red-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
