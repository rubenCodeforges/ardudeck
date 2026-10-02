/**
 * ObjectEditorHud — live vehicle-aware briefing for the object editor.
 *
 * Runs the survey generator per visible object (corridor objects run the
 * corridor generator over their centerline). The briefing can show either the
 * combined totals across every visible object ("All") or just the currently
 * selected object ("Selected") so users aren't left guessing what the numbers
 * refer to when several areas are on the map.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useObjectsStore } from './objects-store';
import { useSurveyStore } from '../stores/survey-store';
import { useSettingsStore } from '../stores/settings-store';
import { getSurveyGenerator, patternToGeneratorId } from '../components/survey/generator-registry';
import { polygonArea } from '../components/survey/geo-math';
import { objectWorldRing, objectWorldBranches } from './area-object';
import { colorForIndex } from './objects-geo';
import { computeAreaHud, aggregateAreaHud, type AreaHud } from './area-editor-hud';
import { formatDurationSec } from '../utils/flight-briefing';
import { VaultSyncBadge } from '../components/vault/VaultSyncBadge';
import { formatSurveyAreaHa, formatSurveyDistanceM } from './survey-units';
import { UNIT_LABELS, type AreaUnit, type DistanceUnit } from '../../shared/user-units.js';
import type { SurveyConfig, SurveyResult } from '../components/survey/survey-types';

function runGeneratorSafe(config: SurveyConfig): SurveyResult | null {
  const minPoints = config.pattern === 'corridor' ? 2 : 3;
  if (config.polygon.length < minPoints) return null;
  const reg = getSurveyGenerator(patternToGeneratorId(config.pattern)) ?? getSurveyGenerator('builtin.grid');
  if (!reg) return null;
  const result = reg.generate(config);
  return result instanceof Promise ? null : result;
}

interface PerObject {
  id: string;
  name: string;
  color: string;
  hud: AreaHud;
}

function MetricRow({ label, value }: { label: string; value: string | null }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5 border-b border-subtle last:border-0">
      <span className="text-xs text-content-secondary shrink-0">{label}</span>
      <span className="text-xs font-medium text-content text-right">
        {value ?? <span className="text-content-tertiary">-</span>}
      </span>
    </div>
  );
}

function Metrics({ hud, distanceUnit, areaUnit }: { hud: AreaHud; distanceUnit: DistanceUnit; areaUnit: AreaUnit }): JSX.Element {
  const { t } = useTranslation();
  return (
    <>
      <MetricRow label={t('area-editor:hud.area')} value={hud.areaHa !== null ? formatSurveyAreaHa(hud.areaHa, areaUnit) : null} />
      <MetricRow label={t('area-editor:hud.distance')} value={hud.flightDistanceM !== null ? formatSurveyDistanceM(hud.flightDistanceM, distanceUnit) : null} />
      <MetricRow label={t('area-editor:hud.flightTime')} value={hud.flightTimeSec !== null ? formatDurationSec(hud.flightTimeSec) : null} />
      <MetricRow label={t('area-editor:hud.batteries')} value={hud.batteryCount !== null ? String(hud.batteryCount) : null} />
      <MetricRow label={t('area-editor:hud.gsd')} value={hud.gsdCm !== null && hud.gsdCm > 0 ? `${hud.gsdCm.toFixed(1)} cm/px` : null} />
      <MetricRow label={t('area-editor:hud.photos')} value={hud.photoCount !== null ? hud.photoCount.toLocaleString() : null} />
      <MetricRow label={t('area-editor:hud.data')} value={hud.dataGb !== null ? `${hud.dataGb.toFixed(1)} GB` : null} />
    </>
  );
}

export function ObjectEditorHud(): JSX.Element {
  const { t } = useTranslation();
  const objects = useObjectsStore((s) => s.objects);
  const selectedId = useObjectsStore((s) => s.selectedId);
  const surveyConfig = useSurveyStore((s) => s.config);
  const enduranceSec = useSettingsStore((s) => s.getEstimatedFlightTime());
  const activeVehicle = useSettingsStore((s) => s.getActiveVehicle());
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const areaUnit = useSettingsStore((s) => s.unitPreferences.area);
  const [scope, setScope] = useState<'all' | 'selected'>('all');

  const perObject = useMemo<PerObject[]>(() => {
    const out: PerObject[] = [];
    objects.forEach((o, i) => {
      if (!o.visible) return;
      const ring = objectWorldRing(o);
      const isCorridor = o.type === 'corridor';
      if (ring.length < (isCorridor ? 2 : 3)) return;
      const branches = isCorridor ? objectWorldBranches(o) : [];
      const fullConfig: SurveyConfig = isCorridor
        ? {
            ...surveyConfig,
            pattern: 'corridor',
            corridorWidth: o.corridorWidthM ?? 60,
            polygon: ring,
            ...(branches.length > 0 ? { corridorBranches: branches } : {}),
          }
        : { ...surveyConfig, polygon: ring };
      const result = runGeneratorSafe(fullConfig);
      const areaM2 = isCorridor ? (result?.stats.areaCovered ?? 0) : polygonArea(ring);
      out.push({
        id: o.id,
        name: o.name,
        color: o.color ?? colorForIndex(i),
        hud: computeAreaHud({
          areaM2,
          stats: result?.stats ?? null,
          enduranceSec,
          imageWidth: surveyConfig.camera.imageWidth,
          imageHeight: surveyConfig.camera.imageHeight,
        }),
      });
    });
    return out;
  }, [objects, surveyConfig, enduranceSec]);

  const totals = useMemo<AreaHud | null>(() => {
    if (perObject.length === 0) return null;
    if (perObject.length === 1) return perObject[0]!.hud;
    return aggregateAreaHud(perObject.map((p) => p.hud), enduranceSec);
  }, [perObject, enduranceSec]);

  const selectedEntry = perObject.find((p) => p.id === selectedId) ?? null;
  const showScopeToggle = perObject.length > 1;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-subtle">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-content">{t('area-editor:hud.title')}</p>
          <div className="flex items-center gap-1.5">
            <VaultSyncBadge />
            <span
              className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-surface-input text-content-secondary"
              data-tip={t('area-editor:hud.unitsTip', { areaUnit: UNIT_LABELS.area[areaUnit], distanceUnit: UNIT_LABELS.distance[distanceUnit] })}
            >
              {UNIT_LABELS.area[areaUnit]}
            </span>
          {showScopeToggle && (
            <div className="flex items-center rounded-md bg-surface-input p-0.5">
              {(['all', 'selected'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={
                    'px-2 py-0.5 rounded text-[11px] font-medium transition-colors ' +
                    (scope === s ? 'bg-blue-600 text-white' : 'text-content-secondary hover:text-content')
                  }
                >
                  {s === 'all' ? t('area-editor:hud.all') : t('area-editor:hud.selected')}
                </button>
              ))}
            </div>
          )}
          </div>
        </div>
        {activeVehicle && <p className="text-xs text-content-tertiary mt-0.5 truncate">{activeVehicle.name}</p>}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-2">
        {perObject.length === 0 ? (
          <p className="text-xs text-content-tertiary mt-2">{t('area-editor:hud.empty')}</p>
        ) : scope === 'selected' || !showScopeToggle ? (
          // Single object, or explicitly inspecting the selected one.
          selectedEntry || perObject.length === 1 ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: (selectedEntry ?? perObject[0]!).color }} />
                <span className="text-xs text-content truncate">{(selectedEntry ?? perObject[0]!).name}</span>
              </div>
              <Metrics hud={(selectedEntry ?? perObject[0]!).hud} distanceUnit={distanceUnit} areaUnit={areaUnit} />
            </>
          ) : (
            <p className="text-xs text-content-tertiary mt-2">{t('area-editor:hud.selectObject')}</p>
          )
        ) : (
          totals && (
            <>
              <p className="text-xs text-content-tertiary mb-2">{t('area-editor:hud.combined', { count: perObject.length })}</p>
              <Metrics hud={totals} distanceUnit={distanceUnit} areaUnit={areaUnit} />
            </>
          )
        )}
        {!activeVehicle && (
          <p className="text-xs text-content-tertiary mt-3 leading-relaxed">
            {t('area-editor:hud.addVehicle')}
          </p>
        )}
      </div>
    </div>
  );
}
