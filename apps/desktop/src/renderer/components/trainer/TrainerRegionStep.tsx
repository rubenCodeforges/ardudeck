import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Image as ImageIcon,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TrainerCatalogue, TrainerRegion } from '../../../shared/trainer-types';

/**
 * Where you fly, as the places themselves rather than as a list of names.
 *
 * The card leads with the region's OWN aerial imagery. A baked region is a photograph of a real
 * place, and a name plus three figures gives no sense of whether it is the coast, a polder or a
 * ridge, which is the only thing a pilot is actually choosing between.
 */
export function TrainerRegionStep({
  catalogue,
  error,
  selected,
  onSelect,
  onNew,
  onRescan,
  onDeleted,
  rescanning,
}: {
  catalogue: TrainerCatalogue | null;
  error: string | null;
  selected: string | null;
  onSelect: (name: string | null) => void;
  onNew: () => void;
  onRescan: () => void;
  onDeleted: (name: string) => void;
  rescanning: boolean;
}): JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-content">{t('trainer:trainerRegionStep.title')}</h2>
          <p className="mt-0.5 text-xs text-content-tertiary">
            {t('trainer:trainerRegionStep.bakedHere')}
            {catalogue && t('trainer:trainerRegionStep.available', { count: catalogue.regions.length })}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-subtle bg-surface-raised px-3 py-1.5 text-sm font-medium text-content transition-colors hover:border-strong hover:bg-surface disabled:opacity-50"
            onClick={onRescan}
            disabled={rescanning}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${rescanning ? 'animate-spin' : ''}`} />
            {t('common:rescan')}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
            onClick={onNew}
            disabled={!catalogue}
          >
            <Plus className="h-3.5 w-3.5" />
            {t('trainer:trainerRegionStep.newRegion')}
          </button>
        </div>
      </div>

      {error && (
        <p className="flex items-center gap-2 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </p>
      )}
      {!error && !catalogue && (
        <p className="flex items-center gap-2 text-sm text-content-tertiary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('trainer:trainerRegionStep.asking')}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {catalogue?.regions.map((region) => (
          <RegionCard
            key={region.name}
            region={region}
            active={selected === region.name}
            onToggle={() => onSelect(selected === region.name ? null : region.name)}
            onDeleted={() => onDeleted(region.name)}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * An unfinished region is SHOWN, greyed, with what it is missing.
 *
 * Hiding it would be worse: a bake that stopped at step 3 leaves a directory that looks complete
 * from outside, so a region silently absent from the list reads as lost work rather than as an
 * interrupted build somebody can resume.
 */
function RegionCard({
  region,
  active,
  onToggle,
  onDeleted,
}: {
  region: TrainerRegion;
  active: boolean;
  onToggle: () => void;
  onDeleted: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      // `invoke` REJECTS when main has no handler for the channel, which is exactly what an
      // ArduDeck running an older main process looks like: preload and main do not hot-reload,
      // only the renderer does. Uncaught, the rejection escaped and left this button on
      // "Deleting…" for ever with nothing said anywhere.
      const result = await window.electronAPI.trainerDeleteRegion(region.name);
      if (result.ok) onDeleted();
      else setError(result.error ?? t('trainer:trainerRegionStep.couldNotDelete'));
    } catch (err) {
      setError(t('trainer:trainerView.restartHint', { message: (err as Error).message }));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div
      role="button"
      tabIndex={region.ready ? 0 : -1}
      onClick={region.ready ? onToggle : undefined}
      onKeyDown={(e) => {
        if (region.ready && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onToggle();
        }
      }}
      className={`card wx-card overflow-hidden text-left ${
        region.ready ? 'cursor-pointer' : 'cursor-not-allowed'
      } ${active ? '!border-blue-500/60 ring-1 ring-blue-500/30' : 'hover:border-strong'}`}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-surface-inset">
        {region.thumbnail ? (
          <img
            src={region.thumbnail}
            alt=""
            className={`h-full w-full object-cover ${region.ready ? '' : 'opacity-40 grayscale'}`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-content-tertiary">
            <ImageIcon className="h-6 w-6" />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
          <span className="text-base font-semibold text-white drop-shadow">
            {region.displayName}
          </span>
        </div>

        {active && (
          <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
            <Check className="h-3.5 w-3.5" />
          </span>
        )}
      </div>

      <div className="card-body space-y-2 py-3">
        <div className="flex items-center justify-between gap-2">
          {region.ready ? (
            <span className="rounded-full border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
              {t('trainer:trainerRegionStep.ready')}
            </span>
          ) : (
            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              {t('trainer:trainerRegionStep.unfinished')}
            </span>
          )}
          {region.home && (
            <span className="font-mono text-[11px] text-content-tertiary">
              {region.home.lat.toFixed(4)} N, {region.home.lon.toFixed(4)} E
            </span>
          )}
        </div>

        {region.ready ? (
          <dl className="space-y-1 text-xs">
            <Row
              label={t('trainer:trainerRegionStep.ground')}
              value={
                region.extentKm
                  ? `${region.extentKm.width.toFixed(1)} x ${region.extentKm.height.toFixed(1)} km`
                  : null
              }
            />
            <Row
              label={t('trainer:trainerRegionStep.elevation')}
              value={
                region.elevationM
                  ? t('trainer:trainerRegionStep.elevationValue', { min: Math.round(region.elevationM.min), max: Math.round(region.elevationM.max) })
                  : null
              }
            />
            <Row label={t('trainer:trainerRegionStep.imagery')} value={formatDate(region.imageryDate)} />
            <Row
              label={t('trainer:trainerRegionStep.onDisk')}
              value={region.sizeBytes ? `${Math.round(region.sizeBytes / 1e6)} MB` : null}
            />
          </dl>
        ) : (
          <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-2.5 text-xs leading-relaxed text-amber-300/90">
            {t('trainer:trainerRegionStep.unfinishedHint', { missing: region.missing.join(', ') })}
          </p>
        )}

        {error && <p className="text-[11px] text-red-400">{error}</p>}

        <div className="flex justify-end border-t border-subtle pt-2">
          {confirming ? (
            <div className="flex items-center gap-2 text-[11px]">
              {/* The size is the whole point of the confirmation: 150 MB is minutes of network
                  against services that rate-limit, not a file that can be undeleted. */}
              <span className="text-content-tertiary">
                {region.sizeBytes
                  ? t('trainer:trainerRegionStep.deleteSize', { size: `${Math.round(region.sizeBytes / 1e6)} MB` })
                  : t('trainer:trainerRegionStep.deleteThis')}
              </span>
              <button
                className="rounded px-2 py-1 text-content-secondary hover:bg-surface-raised"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirming(false);
                }}
              >
                {t('common:cancel')}
              </button>
              <button
                className="rounded bg-red-500/15 px-2 py-1 font-medium text-red-400 hover:bg-red-500/25"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  void remove();
                }}
              >
                {busy ? t('trainer:trainerRegionStep.deleting') : t('trainer:trainerRegionStep.delete')}
              </button>
            </div>
          ) : (
            <button
              className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-content-tertiary transition-colors hover:bg-surface-raised hover:text-red-400"
              onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
              }}
            >
              <Trash2 className="h-3 w-3" />
              {t('trainer:trainerRegionStep.delete')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }): JSX.Element | null {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-content-tertiary">{label}</dt>
      <dd className="text-content-secondary">{value}</dd>
    </div>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
