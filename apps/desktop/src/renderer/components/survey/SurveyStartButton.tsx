/**
 * Single survey entry point. Area and Corridor are the same survey with a
 * different geometry (a filled polygon vs a line with parallel strips), so they
 * live behind one button with a type dropdown rather than two sibling buttons.
 * The detailed pattern (grid / crosshatch / perimeter / spiral) is still tuned
 * in the survey config panel after a type is chosen.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useSurveyStore } from '../../stores/survey-store';
import { useSurveyMenuStore } from '../../stores/survey-menu-store';
import {
  listSurveyGenerators,
  subscribeSurveyGenerators,
  getSurveyGeneratorsVersion,
  generatorDisplayName,
  generatorDescription,
} from './generator-registry';
import type { SurveyPattern } from './survey-types';

interface SurveyType {
  pattern: SurveyPattern;
  labelKey: string;
  descKey: string;
  icon: React.ReactNode;
}

const AREA_ICON = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
  </svg>
);

const CORRIDOR_ICON = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21L10 3M17 21L14 3" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 17v-2.5M12 11.5V9M12 6V4" />
  </svg>
);

const PANORAMA_ICON = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 16c5 0 4-8 9-8s4 6 9 6" />
    <circle cx="7" cy="6" r="1.6" strokeWidth={2} />
    <path strokeLinecap="round" strokeWidth={2} d="M7 8v2" />
  </svg>
);

const SURVEY_TYPES: SurveyType[] = [
  {
    pattern: 'grid',
    labelKey: 'survey:surveyStartButton.areaSurvey',
    descKey: 'survey:surveyStartButton.areaSurveyDesc',
    icon: AREA_ICON,
  },
  {
    pattern: 'corridor',
    labelKey: 'survey:surveyStartButton.corridorSurvey',
    descKey: 'survey:surveyStartButton.corridorSurveyDesc',
    icon: CORRIDOR_ICON,
  },
  {
    pattern: 'panorama',
    labelKey: 'survey:surveyStartButton.panoramaCapture',
    descKey: 'survey:surveyStartButton.panoramaCaptureDesc',
    icon: PANORAMA_ICON,
  },
];

export function SurveyStartButton() {
  const { t } = useTranslation();
  const activateSurvey = useSurveyStore((s) => s.activateSurvey);
  const setPattern = useSurveyStore((s) => s.setPattern);
  const setGeneratorId = useSurveyStore((s) => s.setGeneratorId);
  const startDrawing = useSurveyStore((s) => s.startDrawing);

  // Module-supplied engines (e.g. TOPAS) register async after module load.
  const generatorsVersion = useSyncExternalStore(subscribeSurveyGenerators, getSurveyGeneratorsVersion);
  const moduleGenerators = useMemo(
    () => listSurveyGenerators().filter((g) => !g.id.startsWith('builtin.')),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- version is the registry's change counter
    [generatorsVersion],
  );

  const open = useSurveyMenuStore((s) => s.open);
  const setOpen = useSurveyMenuStore((s) => s.setOpen);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      // The open state is shared by every mounted Survey button, so "inside" means
      // inside any of them; otherwise another instance closes the menu on mousedown
      // and the click on a menu item lands on nothing. Tour cards leave it open too.
      if (target.closest?.('[data-survey-menu-root], .reactour__popover')) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, setOpen]);

  const start = (pattern: SurveyPattern) => {
    activateSurvey();
    setPattern(pattern);
    startDrawing();
    setOpen(false);
  };

  const startWithGenerator = (generatorId: string) => {
    activateSurvey();
    // Module engines cover areas; keep the base pattern on 'grid' so the draw
    // tool expects a closed polygon, then flip the engine on top of it.
    setPattern('grid');
    setGeneratorId(generatorId);
    startDrawing();
    setOpen(false);
  };

  return (
    <div ref={ref} data-survey-menu-root className="relative">
      <button
        data-tour="mission-survey"
        onClick={() => setOpen(!open)}
        className="px-2.5 py-1.5 rounded text-xs font-medium bg-surface-solid border border-purple-400 shadow-sm text-purple-400 hover:text-purple-300 transition-colors flex items-center gap-1.5"
        title={t('survey:surveyStartButton.buttonTitle')}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
        {t('common:survey')}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        // Opens upward: the mission toolbar is pinned to the bottom of the map.
        <div data-tour="mission-survey-menu" className="absolute left-0 bottom-full mb-1 z-[1100] w-64 bg-surface-solid border border-subtle rounded-lg shadow-xl py-1">
          {SURVEY_TYPES.map((type) => (
            <button
              key={type.pattern}
              onClick={() => start(type.pattern)}
              className="w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors flex items-start gap-2.5"
            >
              <span className="text-purple-400 mt-0.5 shrink-0">{type.icon}</span>
              <span className="min-w-0">
                <span className="block text-xs font-medium text-content">{t(type.labelKey)}</span>
                <span className="block text-[10px] text-content-tertiary leading-snug">{t(type.descKey)}</span>
              </span>
            </button>
          ))}

          {/* Module-supplied coverage engines (installed via Hangar). */}
          {moduleGenerators.map((gen) => (
            <button
              key={gen.id}
              onClick={() => startWithGenerator(gen.id)}
              className="w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors flex items-start gap-2.5"
            >
              <span className="text-teal-400 mt-0.5 shrink-0">{AREA_ICON}</span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-content">{generatorDisplayName(gen)}</span>
                  {gen.capabilities.isRemote && (
                    <span className="px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-teal-300 bg-teal-500/15 border border-teal-500/30 rounded">
                      {t('survey:surveyStartButton.remote')}
                    </span>
                  )}
                </span>
                <span className="block text-[10px] text-content-tertiary leading-snug">{generatorDescription(gen)}</span>
              </span>
            </button>
          ))}

          {/* Area Editor: a richer, full-window way to draw the same survey areas
              (multi-polygon, holes, KML round-trip) instead of drawing in-map. */}
          <button
            onClick={() => {
              window.electronAPI?.openAreaEditor?.().catch(() => undefined);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-2 mt-1 border-t border-subtle hover:bg-surface-raised transition-colors flex items-start gap-2.5"
          >
            <span className="text-teal-400 mt-0.5 shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.5-6.5a2 2 0 012.828 2.828L11.828 14H9v-3z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l4-4" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-content">{t('common:areaEditor')}</span>
                <span className="px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-teal-300 bg-teal-500/15 border border-teal-500/30 rounded">{t('survey:surveyStartButton.newBadge')}</span>
              </span>
              <span className="block text-[10px] text-content-tertiary leading-snug">{t('survey:surveyStartButton.areaEditorDesc')}</span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
