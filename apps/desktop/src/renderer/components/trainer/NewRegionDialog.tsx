import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  TrainerBakeProgress,
  TrainerCatalogue,
  TrainerBakeRequest,
} from '../../../shared/trainer-types';

/**
 * Building a new region from anywhere on Earth.
 *
 * A CENTRE and a side length, never a box: turning that into corners needs the metres-per-degree
 * correction at the chosen latitude, and that arithmetic lives in the Trainer beside the code
 * that validates it. The area and texel figures here are display only, and the Trainer refuses
 * anything genuinely unbuildable when Build is pressed.
 *
 * The wait is minutes of network against six public services, two of which rate-limit, so every
 * step is shown as it happens. The step NAMES arrive already resolved for the same reason.
 */


interface Place {
  label: string;
  lat: number;
  lon: number;
}

export function NewRegionDialog({
  catalogue,
  onClose,
  onBuilt,
}: {
  catalogue: TrainerCatalogue;
  onClose: () => void;
  onBuilt: (regionName: string) => void;
}): JSX.Element {
  const { t } = useTranslation();
  const { limits } = catalogue;
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [place, setPlace] = useState<Place | null>(null);
  const [sideKm, setSideKm] = useState(10);
  const [res, setRes] = useState(limits.resDefaultM);
  // Medium, not the pipeline's own default of high. High is ~36 provider renders of 2000 px
  // each and is by far the longest thing a bake does; medium still resolves field boundaries.
  const [detail, setDetail] = useState('medium');
  const [superRes, setSuperRes] = useState(true);
  const [progress, setProgress] = useState<TrainerBakeProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const prevWasTransient = useRef(false);
  const [tail, setTail] = useState<string[]>([]);

  useEffect(() => {
    return window.electronAPI.onTrainerBakeProgress((p) => {
      setProgress(p);
      if (!p.line.trim()) return;
      setTail((prev) => {
        // A transient line overwrites the previous transient one, the way it would in a
        // terminal. Appended instead, a 36-tile fetch buries the step banners under 36 copies
        // of its own counter.
        const base = p.transient && prevWasTransient.current ? prev.slice(0, -1) : prev;
        prevWasTransient.current = p.transient;
        return [...base, p.line].slice(-60);
      });
    });
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [tail]);

  const search = async (): Promise<void> => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      // ArduDeck's own geocoder, not a second one in the Trainer: this app already runs place
      // search in main with a proper User-Agent for the "Go to location" box.
      const found = await window.electronAPI.geocodeSearch(query);
      setHits(found.map((f) => ({ label: f.label, lat: f.lat, lon: f.lon })));
    } catch {
      setHits([]);
    } finally {
      setSearching(false);
    }
  };

  const estimate = useMemo(() => {
    const sideM = sideKm * 1000;
    const texels = Math.round(sideM / res);
    return {
      areaKm2: sideKm * sideKm,
      texels,
      totalMpx: (texels * texels) / 1e6,
      // 31 bytes per texel, measured across the three regions already baked and flown.
      mb: (texels * texels * 31) / 1e6,
    };
  }, [sideKm, res]);

  const tooBig = estimate.areaKm2 > limits.areaMaxKm2;
  const canBuild = Boolean(name.trim()) && place !== null && !tooBig && !busy;

  const build = async (): Promise<void> => {
    if (!place) return;
    setBusy(true);
    setError(null);
    setTail([]);
    const request: TrainerBakeRequest = {
      name,
      centre: { lat: place.lat, lon: place.lon },
      sideKm,
      metersPerTexel: res,
      detail,
      superRes,
    };
    try {
      const done = await window.electronAPI.trainerBake(request);
      if (done.ok && done.regionName) onBuilt(done.regionName);
      else setError(done.error ?? t('trainer:newRegionDialog.couldNotBuild'));
    } catch (err) {
      setError(t('trainer:trainerView.restartHint', { message: (err as Error).message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
      <div
        className="absolute inset-0 bg-surface-overlay backdrop-blur-sm"
        onClick={busy ? undefined : onClose}
      />

      <div className="card relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden !bg-surface-solid">
        <div className="card-header flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-medium text-content">{t('trainer:newRegionDialog.title')}</h2>
            <p className="mt-0.5 text-xs text-content-tertiary">
              {t('trainer:newRegionDialog.subtitle')}
            </p>
          </div>
          {!busy && (
            <button
              onClick={onClose}
              className="text-content-tertiary transition-colors hover:text-content"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {busy ? (
          <div className="card-body space-y-4">
            <div className="flex items-center gap-2.5 text-sm text-content">
              <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
              {progress?.label ?? t('trainer:newRegionDialog.gettingStarted')}
            </div>

            <div className="h-1.5 overflow-hidden rounded-full bg-surface-inset">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-[width] duration-500"
                style={{ width: `${Math.round((progress?.fraction ?? 0) * 100)}%` }}
              />
            </div>

            <div
              ref={logRef}
              className="h-48 overflow-auto rounded-lg border border-subtle bg-surface-inset p-2.5 font-mono text-[11px] leading-relaxed text-content-tertiary"
            >
              {tail.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>

            <button
              className="btn btn-secondary w-full"
              onClick={() => void window.electronAPI.trainerBakeCancel()}
            >
              {t('trainer:newRegionDialog.stop')}
            </button>
          </div>
        ) : (
          <div className="card-body space-y-4 overflow-auto">
            <Field label={t('trainer:newRegionDialog.name')}>
              <input
                className="input w-full"
                value={name}
                placeholder="drone-days"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>

            <Field label={t('trainer:newRegionDialog.place')}>
              <div className="flex gap-2">
                <input
                  className="input w-full"
                  value={query}
                  placeholder={t('trainer:newRegionDialog.placePlaceholder')}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void search()}
                />
                <button className="btn btn-secondary shrink-0" onClick={() => void search()}>
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </button>
              </div>

              {hits.length > 0 && (
                <ul className="mt-2 max-h-40 space-y-1 overflow-auto">
                  {hits.map((hit) => (
                    <li key={`${hit.lat},${hit.lon}`}>
                      <button
                        onClick={() => {
                          setPlace(hit);
                          setHits([]);
                          setQuery(hit.label);
                        }}
                        className="flex w-full items-start gap-2 rounded-lg border border-subtle px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-surface-raised"
                      >
                        <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-content-tertiary" />
                        <span className="text-content-secondary">{hit.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {place && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-content-tertiary">
                  <MapPin className="h-3 w-3" />
                  {place.lat.toFixed(4)}, {place.lon.toFixed(4)}
                </p>
              )}
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Slider
                label={t('trainer:newRegionDialog.size')}
                value={sideKm}
                min={limits.sideMinKm}
                max={limits.sideMaxKm}
                step={0.5}
                format={(v) => t('trainer:newRegionDialog.sizeValue', { v })}
                onChange={setSideKm}
              />
              <Slider
                label={t('trainer:newRegionDialog.detail')}
                value={res}
                min={limits.resMinM}
                max={limits.resMaxM}
                step={1}
                format={(v) => t('trainer:newRegionDialog.detailValue', { v })}
                onChange={setRes}
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-content-secondary">
                {t('trainer:newRegionDialog.aerialDetail')}
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {catalogue.details.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDetail(d.id)}
                    data-tip={d.hint}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                      detail === d.id
                        ? 'border-blue-500/50 bg-blue-500/10 text-blue-400'
                        : 'border-subtle text-content-secondary hover:bg-surface-raised'
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-content-tertiary">
                {catalogue.details.find((d) => d.id === detail)?.hint}
              </p>
            </div>

            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                className="mt-0.5 accent-blue-500"
                checked={superRes}
                onChange={(e) => setSuperRes(e.target.checked)}
              />
              <span className="text-xs">
                <span className="font-medium text-content-secondary">{t('trainer:newRegionDialog.superRes')}</span>
                <span className="block text-[11px] text-content-tertiary">
                  {t('trainer:newRegionDialog.superResHint')}
                </span>
              </span>
            </label>

            {/* The two figures above are the whole bake time, near enough. Measured on hatten:
                the ortho fetch itself is seconds, but having one makes the class map refine on
                its grid, which is 25 megapixels and about five minutes on a 10 km box. */}
            <p className="rounded-lg border border-subtle bg-surface-inset p-2.5 text-[11px] leading-relaxed text-content-tertiary">
              {t('trainer:newRegionDialog.estimate', { minutes: estimateMinutes(detail, superRes) })}
            </p>

            <div className="flex flex-wrap gap-2 text-[11px] text-content-tertiary">
              {/* i18n-exempt */}
              <Chip>{estimate.areaKm2.toFixed(0)} km²</Chip>
              <Chip>{t('trainer:newRegionDialog.texels', { n: estimate.texels })}</Chip>
              <Chip>~{estimate.mb.toFixed(0)} MB</Chip>
            </div>

            {tooBig && (
              <p className="text-xs text-amber-400">
                {t('trainer:newRegionDialog.tooBig', { max: limits.areaMaxKm2 })}
              </p>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button className="btn btn-secondary" onClick={onClose}>
                {t('common:cancel')}
              </button>
              <button className="btn btn-primary" disabled={!canBuild} onClick={() => void build()}>
                {t('trainer:newRegionDialog.build')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Measured on hatten (10 x 10 km): ortho 0:04, super-res 2:54, material 4:49, the rest ~2:20. */
function estimateMinutes(detail: string, superRes: boolean): string {
  const base = 2.5;
  const refine = detail !== 'off' || superRes ? 5 : 0;
  const ortho = { off: 0, low: 0.1, medium: 0.2, high: 0.5, ultra: 2 }[detail] ?? 0.2;
  const total = base + refine + ortho + (superRes ? 3 : 0);
  return total < 4 ? '3' : `${Math.round(total)}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }): JSX.Element {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-content-secondary">{label}</span>
      {children}
    </label>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-xs font-medium text-content-secondary">{label}</span>
        <span className="text-xs text-content-tertiary">{format(value)}</span>
      </div>
      <input
        type="range"
        className="w-full accent-blue-500"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="rounded-full border border-subtle bg-surface-raised px-2 py-0.5 text-content-secondary">
      {children}
    </span>
  );
}

