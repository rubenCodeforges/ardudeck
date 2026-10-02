/**
 * Compact map legend explaining engine-contributed plan decorations (cells,
 * smoothed path). Shown while the survey draft carries generator overlays -
 * without it, a first-time user sees colored dashed shapes with no idea what
 * they mean or whether the plan is right.
 */
import { useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useSurveyStore } from '../../stores/survey-store';
import { extractGeneratorOverlays } from './generator-overlays';

export function EnginePlanLegend() {
  const { t } = useTranslation();
  const result = useSurveyStore((s) => s.result);
  const isActive = useSurveyStore((s) => s.isActive);
  const [collapsed, setCollapsed] = useState(false);

  const overlays = useMemo(
    () => extractGeneratorOverlays(result?.generatorResult),
    [result],
  );
  const cellCount = overlays.filter((o) => o.type === 'polygon').length;
  const hasCurve = overlays.some((o) => o.type === 'polyline');
  if (!isActive || cellCount === 0) return null;

  return (
    <div className="absolute bottom-16 left-3 z-[1000] select-none">
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface-solid border border-subtle text-content-secondary hover:text-content shadow-lg transition-colors"
        >
          {t('survey:enginePlanLegend.planLegend')}
        </button>
      ) : (
        <div className="w-72 rounded-lg bg-surface-solid border border-subtle shadow-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">
              {t('survey:enginePlanLegend.coveragePlan')}
            </span>
            <button
              onClick={() => setCollapsed(true)}
              className="text-[10px] text-content-tertiary hover:text-content transition-colors"
            >
              {t('common:hide')}
            </button>
          </div>
          <div className="flex items-start gap-2">
            {/* Swatches use the real per-cell hue formula so the legend matches the map. */}
            <span className="mt-0.5 flex shrink-0 gap-0.5">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="w-2 h-3 rounded-sm border border-dashed"
                  style={{
                    borderColor: `hsl(${(i * 47) % 360} 70% 55%)`,
                    background: `hsl(${(i * 47) % 360} 70% 55% / 0.2)`,
                  }}
                />
              ))}
            </span>
            <span className="text-[11px] leading-snug text-content-secondary">
              <Trans i18nKey="survey:enginePlanLegend.zones" values={{ count: cellCount }} components={{ b: <span className="text-content" /> }} />
            </span>
          </div>
          {hasCurve && (
            <div className="flex items-start gap-2">
              <span className="mt-1.5 w-4 h-0.5 shrink-0 rounded bg-teal-400/60" />
              <span className="text-[11px] leading-snug text-content-secondary">
                <Trans i18nKey="survey:enginePlanLegend.plannedRoute" components={{ b: <span className="text-content" /> }} />
              </span>
            </div>
          )}
          <div className="flex items-start gap-2">
            <span className="mt-1.5 w-4 h-0.5 shrink-0 rounded bg-sky-400" />
            <span className="text-[11px] leading-snug text-content-secondary">
              <Trans i18nKey="survey:enginePlanLegend.yourMission" components={{ b: <span className="text-content" /> }} />
            </span>
          </div>
          <p className="text-[10px] leading-snug text-content-tertiary pt-1 border-t border-subtle">
            {t('survey:enginePlanLegend.turnLoopsNote')}
          </p>
        </div>
      )}
    </div>
  );
}
