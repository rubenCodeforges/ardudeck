import { useTranslation } from 'react-i18next';
import { useState, useEffect, useMemo, useRef } from 'react';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { Mountain, AlertTriangle, Check, ChevronDown, ChevronRight, Sparkles, ExternalLink } from 'lucide-react';
import { getElevations, sampleLeg } from '../../utils/elevation-api';
import { useSettingsStore } from '../../stores/settings-store';
import { formatAltitudeFromMeters } from '../../../shared/user-units.js';
import { openLocusListing, useLocusListed, useLocusTerrain } from './locus-terrain';
import {
  planTerrainFollow,
  planTerrainSafeAltitudes,
  type PlannerWaypoint,
  type TerrainLookup,
  type PlanResult,
} from './terrain-altitude-planner';

export interface AutoAdjustDialogProps {
  waypoints: PlannerWaypoint[];
  safeBuffer: number;
  /** Home/launch ground elevation (ASL m); needed to keep relative waypoints in frame. */
  homeElevationMeters?: number;
  onApply: (result: PlanResult) => void;
  onClose: () => void;
}

interface TerrainSample {
  lat: number;
  lon: number;
  elev: number;
}

// A route inside a Locus survey reads the local DEM, so it may sample finer than the network cap.
const MAX_LOCAL_SAMPLES_PER_LEG = 400;

const BUCKET_DEG = 2e-4;

/** Nearest sample, looked up in a grid of buckets so dense terrain-follow sampling stays fast. */
function buildTerrainLookup(samples: TerrainSample[]): TerrainLookup {
  if (samples.length === 0) return { elevationAt: () => null };
  const grid = new Map<string, TerrainSample[]>();
  const key = (bx: number, by: number) => `${bx},${by}`;
  for (const s of samples) {
    const k = key(Math.floor(s.lon / BUCKET_DEG), Math.floor(s.lat / BUCKET_DEG));
    const list = grid.get(k);
    if (list) list.push(s);
    else grid.set(k, [s]);
  }
  const scan = (lat: number, lon: number, list: TerrainSample[]) => {
    let best: TerrainSample | null = null;
    let bestDist = Infinity;
    for (const s of list) {
      const d = (lat - s.lat) ** 2 + (lon - s.lon) ** 2;
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return best;
  };
  return {
    elevationAt: (lat: number, lon: number) => {
      const bx = Math.floor(lon / BUCKET_DEG), by = Math.floor(lat / BUCKET_DEG);
      const near: TerrainSample[] = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) near.push(...(grid.get(key(bx + dx, by + dy)) ?? []));
      return (scan(lat, lon, near.length > 0 ? near : samples))?.elev ?? null;
    },
  };
}

export function AutoAdjustAltitudeDialog({
  waypoints,
  safeBuffer,
  homeElevationMeters,
  onApply,
  onClose,
}: AutoAdjustDialogProps) {
  const { t } = useTranslation();
  const [insertIntermediates, setInsertIntermediates] = useState(true);
  const [minSpacing, setMinSpacing] = useState(50);
  const [sampleStep, setSampleStep] = useState(25);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

  // a Locus survey under the whole route unlocks terrain following, offered first
  const locus = useLocusTerrain(waypoints);
  // the invitation only while Locus can be found in the Hangar: a private listing would be a dead link
  const locusListed = useLocusListed();
  const [mode, setMode] = useState<'clear' | 'follow'>(locus.status === 'covered' ? 'follow' : 'clear');
  const modeChosen = useRef(false);
  useEffect(() => {
    if (!modeChosen.current) setMode(locus.status === 'covered' ? 'follow' : 'clear');
  }, [locus.status]);
  const choose = (m: 'clear' | 'follow') => { modeChosen.current = true; setMode(m); };
  const following = mode === 'follow' && locus.status === 'covered';
  const [heightAgl, setHeightAgl] = useState(Math.max(10, Math.round(safeBuffer)));
  const [maxClimbDeg, setMaxClimbDeg] = useState(15);
  const [followStep, setFollowStep] = useState(5);
  const [tolerance, setTolerance] = useState(1);
  const step = following ? followStep : sampleStep;

  const [terrainSamples, setTerrainSamples] = useState<TerrainSample[] | null>(null);
  const [terrainError, setTerrainError] = useState<string | null>(null);
  const [loadingTerrain, setLoadingTerrain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (waypoints.length < 1) return;

    setLoadingTerrain(true);
    setTerrainError(null);

    const samplePoints: Array<{ lat: number; lon: number }> = waypoints.map(wp => ({
      lat: wp.latitude,
      lon: wp.longitude,
    }));

    const denseStep = following ? Math.max(2, step) : Math.max(5, step / 2);
    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i]!, b = waypoints[i + 1]!;
      const segSamples = sampleLeg(
        { lat: a.latitude, lon: a.longitude },
        { lat: b.latitude, lon: b.longitude },
        denseStep,
        following ? { minSamples: 4, maxSamples: MAX_LOCAL_SAMPLES_PER_LEG } : { minSamples: 4 },
      );
      samplePoints.push(...segSamples);
    }

    (async () => {
      try {
        const elevations = await getElevations(samplePoints);
        if (cancelled) return;
        const built: TerrainSample[] = [];
        samplePoints.forEach((p, idx) => {
          const e = elevations[idx];
          if (e !== null && e !== undefined) built.push({ lat: p.lat, lon: p.lon, elev: e });
        });
        setTerrainSamples(built);
        setLoadingTerrain(false);
      } catch (err) {
        if (cancelled) return;
        setTerrainError(t('mission:autoAdjustAltitudeDialog.terrainFailed', { error: String(err) }));
        setLoadingTerrain(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [waypoints, step, following]);

  const terrainLookup = useMemo(
    () => (terrainSamples ? buildTerrainLookup(terrainSamples) : null),
    [terrainSamples],
  );

  // Home ground elevation anchors 'relative'-frame waypoints. Fall back to the
  // terrain under the first waypoint (the takeoff area) when home is unknown.
  const homeElevation = useMemo(() => {
    if (homeElevationMeters != null) return homeElevationMeters;
    const first = waypoints[0];
    if (terrainLookup && first) return terrainLookup.elevationAt(first.latitude, first.longitude) ?? 0;
    return 0;
  }, [homeElevationMeters, terrainLookup, waypoints]);

  const preview: PlanResult | null = useMemo(() => {
    if (!terrainLookup) return null;
    if (following) {
      return planTerrainFollow(waypoints, terrainLookup, {
        heightAgl, maxClimbDeg, sampleStepMeters: followStep, toleranceMeters: tolerance, homeElevationMeters: homeElevation,
      });
    }
    return planTerrainSafeAltitudes(waypoints, terrainLookup, {
      safeBuffer,
      raiseEndpoints: true,
      insertIntermediates,
      sampleStepMeters: sampleStep,
      minSpacingMeters: minSpacing,
      homeElevationMeters: homeElevation,
    });
  }, [terrainLookup, waypoints, safeBuffer, insertIntermediates, sampleStep, minSpacing, homeElevation, following, heightAgl, maxClimbDeg, followStep, tolerance]);

  const raiseCount = preview?.raisedAltitudes.size ?? 0;
  const insertCount = preview?.inserts.length ?? 0;
  const noChanges = preview !== null && raiseCount === 0 && insertCount === 0;
  const canApply = !loadingTerrain && preview !== null && !noChanges;

  const handleApply = () => {
    if (!preview) return;
    onApply(preview);
    onClose();
  };

  const checkboxClass = 'peer appearance-none w-4 h-4 rounded border border-subtle bg-surface-input checked:bg-amber-500 checked:border-amber-500 cursor-pointer transition-colors';

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-[2100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface-solid rounded-xl border border-subtle w-full max-w-md overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-subtle flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
            <Mountain className="w-4 h-4 text-amber-400" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-content leading-tight">{t('mission:autoAdjustAltitudeDialog.title')}</h2>
            <p className="text-xs text-content-secondary mt-0.5">
              {following
                ? t('mission:autoAdjustAltitudeDialog.followSubtitle', { value: formatAltitudeFromMeters(heightAgl, altitudeUnit) })
                : t('mission:autoAdjustAltitudeDialog.subtitle', { value: formatAltitudeFromMeters(safeBuffer, altitudeUnit) })}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-3">
          {locus.status === 'covered' && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => choose('follow')}
                aria-pressed={following}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${following ? 'border-sky-500/60 bg-sky-500/10 ring-1 ring-sky-500/30' : 'border-subtle hover:bg-surface'}`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                  <span className="text-sm font-semibold text-content">{t('mission:autoAdjustAltitudeDialog.followTitle')}</span>
                  <span className="ml-auto px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide rounded border border-sky-500/40 bg-sky-500/15 text-sky-700 dark:text-sky-300">{t('mission:autoAdjustAltitudeDialog.recommended')}</span>
                </div>
                <p className="text-xs text-content-secondary mt-1">{t('mission:autoAdjustAltitudeDialog.followHint')}</p>
                <p className="text-[11px] text-sky-700 dark:text-sky-300 mt-1.5">{t('mission:autoAdjustAltitudeDialog.followSource', { name: locus.source.name })}</p>
              </button>
              <button
                type="button"
                onClick={() => choose('clear')}
                aria-pressed={!following}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${!following ? 'border-amber-500/50 bg-amber-500/10' : 'border-subtle hover:bg-surface'}`}
              >
                <span className="text-sm font-medium text-content">{t('mission:autoAdjustAltitudeDialog.clearTitle')}</span>
                <p className="text-xs text-content-secondary mt-0.5">{t('mission:autoAdjustAltitudeDialog.clearHint')}</p>
              </button>
            </div>
          )}

          {following && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-content-tertiary mb-1">{t('mission:autoAdjustAltitudeDialog.heightAgl')}</label>
                <DraftNumberInput min={1} max={500} value={heightAgl} onCommit={setHeightAgl}
                  className="w-full px-2.5 py-1.5 bg-surface-input border border-default rounded-md text-content text-sm font-mono focus:outline-none focus:border-sky-500" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-content-tertiary mb-1">{t('mission:autoAdjustAltitudeDialog.maxClimb')}</label>
                <DraftNumberInput min={1} max={60} value={maxClimbDeg} onCommit={setMaxClimbDeg}
                  className="w-full px-2.5 py-1.5 bg-surface-input border border-default rounded-md text-content text-sm font-mono focus:outline-none focus:border-sky-500" />
              </div>
            </div>
          )}

          {!following && (<>
          {/* Single option: insert intermediates */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-subtle hover:bg-surface cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={insertIntermediates}
              onChange={e => setInsertIntermediates(e.target.checked)}
              className={`${checkboxClass} mt-0.5`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-content">{t('mission:autoAdjustAltitudeDialog.insertIntermediates')}</div>
              <p className="text-xs text-content-secondary mt-1">
                {t('mission:autoAdjustAltitudeDialog.insertIntermediatesHint')}
              </p>
            </div>
          </label>

          {/* Advanced section */}
          <button
            type="button"
            onClick={() => setAdvancedOpen(v => !v)}
            className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content transition-colors"
          >
            {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            {t('common:advanced')}
          </button>

          </>)}

          {following && (
            <button type="button" onClick={() => setAdvancedOpen(v => !v)} className="flex items-center gap-1.5 text-xs text-content-secondary hover:text-content transition-colors">
              {advancedOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              {t('common:advanced')}
            </button>
          )}

          {following && advancedOpen && (
            <div className="grid grid-cols-2 gap-3 pl-5">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-content-tertiary mb-1">{t('mission:autoAdjustAltitudeDialog.sampleStep')}</label>
                <DraftNumberInput min={1} max={50} value={followStep} onCommit={setFollowStep}
                  className="w-full px-2.5 py-1.5 bg-surface-input border border-subtle rounded-md text-content text-sm focus:outline-none focus:border-sky-500/50" />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-content-tertiary mb-1">{t('mission:autoAdjustAltitudeDialog.smoothing')}</label>
                <DraftNumberInput min={0.2} max={20} step={0.1} value={tolerance} onCommit={setTolerance}
                  className="w-full px-2.5 py-1.5 bg-surface-input border border-subtle rounded-md text-content text-sm focus:outline-none focus:border-sky-500/50" />
              </div>
            </div>
          )}

          {!following && advancedOpen && (
            <div className="grid grid-cols-2 gap-3 pl-5">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-content-tertiary mb-1">
                  {t('mission:autoAdjustAltitudeDialog.minSpacing')}
                </label>
                <DraftNumberInput
                  min={10}
                  max={1000}
                  integer
                  value={minSpacing}
                  onCommit={setMinSpacing}
                  disabled={!insertIntermediates}
                  className="w-full px-2.5 py-1.5 bg-surface-input border border-subtle rounded-md text-content text-sm focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-content-tertiary mb-1">
                  {t('mission:autoAdjustAltitudeDialog.sampleStep')}
                </label>
                <input
                  type="number"
                  min={5}
                  max={200}
                  value={sampleStep}
                  onChange={e => setSampleStep(Math.max(5, Number(e.target.value) || 25))}
                  className="w-full px-2.5 py-1.5 bg-surface-input border border-subtle rounded-md text-content text-sm focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          )}

          {locus.status === 'absent' && locusListed && (
            <div className="p-3 rounded-lg border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-transparent">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                <span className="text-sm font-semibold text-content">{t('mission:autoAdjustAltitudeDialog.teaserTitle')}</span>
              </div>
              <p className="text-xs text-content-secondary mt-1">{t('mission:autoAdjustAltitudeDialog.teaserHint')}</p>
              <button
                type="button"
                onClick={() => { onClose(); openLocusListing(); }}
                className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-sky-600 text-white hover:bg-sky-500 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                {t('mission:autoAdjustAltitudeDialog.teaserButton')}
              </button>
            </div>
          )}
          {locus.status === 'installed' && (
            <p className="flex items-start gap-2 text-[11px] text-content-secondary">
              <Sparkles className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400 shrink-0 mt-px" />
              {t('mission:autoAdjustAltitudeDialog.noSurveyHint')}
            </p>
          )}

          {/* Preview */}
          <div className="min-h-[72px]">
            {loadingTerrain ? (
              <div className="flex items-center justify-center gap-2 text-xs text-content-secondary bg-surface rounded-lg px-3 py-5 border border-subtle">
                <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                <span>{t('mission:autoAdjustAltitudeDialog.analyzing')}</span>
              </div>
            ) : terrainError ? (
              <div className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{terrainError}</span>
              </div>
            ) : noChanges ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-3">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>{t('mission:autoAdjustAltitudeDialog.noChanges')}</span>
              </div>
            ) : preview ? (
              <div className="bg-surface border border-subtle rounded-lg overflow-hidden">
                {/* Summary */}
                <div className="grid grid-cols-3 divide-x divide-subtle border-b border-subtle">
                  <div className="px-3 py-2 text-center">
                    <div className="text-base font-semibold text-amber-500">{raiseCount}</div>
                    <div className="text-[10px] text-content-tertiary uppercase tracking-wide">{following ? t('mission:autoAdjustAltitudeDialog.adjusted') : t('mission:autoAdjustAltitudeDialog.raise')}</div>
                  </div>
                  <div className="px-3 py-2 text-center">
                    <div className="text-base font-semibold text-amber-500">{insertCount}</div>
                    <div className="text-[10px] text-content-tertiary uppercase tracking-wide">{t('mission:autoAdjustAltitudeDialog.insert')}</div>
                  </div>
                  <div className="px-3 py-2 text-center">
                    <div className="text-base font-semibold text-content">
                      {waypoints.length}<span className="text-content-tertiary mx-1">→</span>{waypoints.length + insertCount}
                    </div>
                    <div className="text-[10px] text-content-tertiary uppercase tracking-wide">{t('common:size')}</div>
                  </div>
                </div>
                {/* Detail list */}
                <div className="max-h-40 overflow-y-auto divide-y divide-subtle">
                  {waypoints.map((wp, idx) => {
                    const newAlt = preview.raisedAltitudes.get(wp.seq);
                    if (newAlt === undefined) return null;
                    return (
                      <div key={wp.seq} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-content-secondary">{t('mission:autoAdjustAltitudeDialog.wp', { n: idx + 1 })}</span>
                        <span className="font-mono">
                          <span className="text-content-tertiary">{formatAltitudeFromMeters(wp.altitude, altitudeUnit)}</span>
                          <span className="text-content-tertiary mx-1.5">→</span>
                          <span className="text-amber-500 font-semibold">{formatAltitudeFromMeters(newAlt, altitudeUnit)}</span>
                        </span>
                      </div>
                    );
                  })}
                  {preview.inserts.map((ins, i) => (
                    <div key={`ins-${i}`} className="flex items-center justify-between px-3 py-1.5 text-xs bg-amber-500/5">
                      <span className="text-content-secondary">
                        {t('mission:autoAdjustAltitudeDialog.newWpAfter', { n: ins.afterSeq + 1 })}
                      </span>
                      <span className="font-mono text-amber-500 font-semibold">{formatAltitudeFromMeters(ins.altitude, altitudeUnit)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-3 border-t border-subtle flex gap-2 bg-surface/50">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-surface-input hover:bg-surface-raised border border-subtle text-content rounded-lg transition-colors text-sm font-medium"
          >
            {t('common:cancel')}
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              !canApply
                ? 'bg-amber-600/20 text-amber-400/40 cursor-not-allowed'
                : following ? 'bg-sky-600 hover:bg-sky-500 text-white shadow-sm' : 'bg-amber-500 hover:bg-amber-400 text-black shadow-sm'
            }`}
          >
            {t('common:apply')}
          </button>
        </div>
      </div>
    </div>
  );
}
