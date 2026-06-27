import { useState, useEffect, useMemo } from 'react';
import { Mountain, AlertTriangle, Check, ChevronDown, ChevronRight } from 'lucide-react';
import { getElevations } from '../../utils/elevation-api';
import { useSettingsStore } from '../../stores/settings-store';
import { formatAltitudeFromMeters } from '../../../shared/user-units.js';
import {
  planTerrainSafeAltitudes,
  haversine,
  type PlannerWaypoint,
  type TerrainLookup,
  type PlanResult,
} from './terrain-altitude-planner';

export interface AutoAdjustDialogProps {
  waypoints: PlannerWaypoint[];
  safeBuffer: number;
  onApply: (result: PlanResult) => void;
  onClose: () => void;
}

interface TerrainSample {
  lat: number;
  lon: number;
  elev: number;
}

const MAX_SAMPLES_PER_SEGMENT = 400;

function sampleSegment(
  a: PlannerWaypoint,
  b: PlannerWaypoint,
  stepMeters: number,
): Array<{ lat: number; lon: number }> {
  const dist = haversine(a.latitude, a.longitude, b.latitude, b.longitude);
  const rawCount = Math.max(4, Math.ceil(dist / stepMeters));
  const count = Math.min(rawCount, MAX_SAMPLES_PER_SEGMENT);
  const out: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    out.push({
      lat: a.latitude + (b.latitude - a.latitude) * t,
      lon: a.longitude + (b.longitude - a.longitude) * t,
    });
  }
  return out;
}

function buildTerrainLookup(samples: TerrainSample[]): TerrainLookup {
  if (samples.length === 0) return { elevationAt: () => null };
  return {
    elevationAt: (lat: number, lon: number) => {
      let best: TerrainSample | null = null;
      let bestDist = Infinity;
      for (const s of samples) {
        const dLat = lat - s.lat;
        const dLon = lon - s.lon;
        const d = dLat * dLat + dLon * dLon;
        if (d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
      return best ? best.elev : null;
    },
  };
}

export function AutoAdjustAltitudeDialog({
  waypoints,
  safeBuffer,
  onApply,
  onClose,
}: AutoAdjustDialogProps) {
  const [insertIntermediates, setInsertIntermediates] = useState(true);
  const [minSpacing, setMinSpacing] = useState(50);
  const [sampleStep, setSampleStep] = useState(25);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);

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

    const denseStep = Math.max(5, sampleStep / 2);
    for (let i = 0; i < waypoints.length - 1; i++) {
      const segSamples = sampleSegment(waypoints[i]!, waypoints[i + 1]!, denseStep);
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
        setTerrainError(`Failed to load terrain: ${String(err)}`);
        setLoadingTerrain(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [waypoints, sampleStep]);

  const terrainLookup = useMemo(
    () => (terrainSamples ? buildTerrainLookup(terrainSamples) : null),
    [terrainSamples],
  );

  const preview: PlanResult | null = useMemo(() => {
    if (!terrainLookup) return null;
    return planTerrainSafeAltitudes(waypoints, terrainLookup, {
      safeBuffer,
      raiseEndpoints: true,
      insertIntermediates,
      sampleStepMeters: sampleStep,
      minSpacingMeters: minSpacing,
    });
  }, [terrainLookup, waypoints, safeBuffer, insertIntermediates, sampleStep, minSpacing]);

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
            <h2 className="text-base font-semibold text-content leading-tight">Auto Adjust Altitude</h2>
            <p className="text-xs text-content-secondary mt-0.5">
              Keep the flight path {formatAltitudeFromMeters(safeBuffer, altitudeUnit)} above terrain
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-3">
          {/* Single option: insert intermediates */}
          <label className="flex items-start gap-3 p-3 rounded-lg border border-subtle hover:bg-surface cursor-pointer transition-colors">
            <input
              type="checkbox"
              checked={insertIntermediates}
              onChange={e => setInsertIntermediates(e.target.checked)}
              className={`${checkboxClass} mt-0.5`}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-content">Insert intermediate waypoints</div>
              <p className="text-xs text-content-secondary mt-1">
                Add waypoints where the straight line between two waypoints clips a ridge.
                Otherwise only waypoints below the safe altitude are raised.
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
            Advanced
          </button>

          {advancedOpen && (
            <div className="grid grid-cols-2 gap-3 pl-5">
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-content-tertiary mb-1">
                  Min spacing (m)
                </label>
                <input
                  type="number"
                  min={10}
                  max={1000}
                  value={minSpacing}
                  onChange={e => setMinSpacing(Math.max(10, Number(e.target.value) || 50))}
                  disabled={!insertIntermediates}
                  className="w-full px-2.5 py-1.5 bg-surface-input border border-subtle rounded-md text-content text-sm focus:outline-none focus:border-amber-500/50 disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wide text-content-tertiary mb-1">
                  Sample step (m)
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

          {/* Preview */}
          <div className="min-h-[72px]">
            {loadingTerrain ? (
              <div className="flex items-center justify-center gap-2 text-xs text-content-secondary bg-surface rounded-lg px-3 py-5 border border-subtle">
                <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                <span>Analyzing terrain...</span>
              </div>
            ) : terrainError ? (
              <div className="flex items-start gap-2 text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-3">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{terrainError}</span>
              </div>
            ) : noChanges ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-3">
                <Check className="w-4 h-4 flex-shrink-0" />
                <span>Flight path already clears terrain. No changes needed.</span>
              </div>
            ) : preview ? (
              <div className="bg-surface border border-subtle rounded-lg overflow-hidden">
                {/* Summary */}
                <div className="grid grid-cols-3 divide-x divide-subtle border-b border-subtle">
                  <div className="px-3 py-2 text-center">
                    <div className="text-base font-semibold text-amber-500">{raiseCount}</div>
                    <div className="text-[10px] text-content-tertiary uppercase tracking-wide">Raise</div>
                  </div>
                  <div className="px-3 py-2 text-center">
                    <div className="text-base font-semibold text-amber-500">{insertCount}</div>
                    <div className="text-[10px] text-content-tertiary uppercase tracking-wide">Insert</div>
                  </div>
                  <div className="px-3 py-2 text-center">
                    <div className="text-base font-semibold text-content">
                      {waypoints.length}<span className="text-content-tertiary mx-1">→</span>{waypoints.length + insertCount}
                    </div>
                    <div className="text-[10px] text-content-tertiary uppercase tracking-wide">Size</div>
                  </div>
                </div>
                {/* Detail list */}
                <div className="max-h-40 overflow-y-auto divide-y divide-subtle">
                  {waypoints.map((wp, idx) => {
                    const newAlt = preview.raisedAltitudes.get(wp.seq);
                    if (newAlt === undefined) return null;
                    return (
                      <div key={wp.seq} className="flex items-center justify-between px-3 py-1.5 text-xs">
                        <span className="text-content-secondary">WP {idx + 1}</span>
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
                        + New WP after #{ins.afterSeq + 1}
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
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!canApply}
            className={`flex-1 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              !canApply
                ? 'bg-amber-600/20 text-amber-400/40 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-400 text-black shadow-sm'
            }`}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
