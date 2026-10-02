/**
 * Mission toolbar entry for boundary guides: import GIS files as guide
 * outlines and manage them (visibility, plan-survey, remove). Importing a
 * guide never generates waypoints - planning is a per-guide action so the
 * user picks the engine (built-in pattern or module like TOPAS) first.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useGuideStore } from '../../stores/guide-store';
import { SurveyedPointsDialog } from './SurveyedPointsDialog';

export function GuidesButton({ showToast }: { showToast?: (msg: string, kind: 'success' | 'error') => void }) {
  const { t } = useTranslation();
  const guides = useGuideStore((s) => s.guides);
  const importGuides = useGuideStore((s) => s.importGuides);
  const toggleGuide = useGuideStore((s) => s.toggleGuide);
  const setAllVisible = useGuideStore((s) => s.setAllVisible);
  const removeGuide = useGuideStore((s) => s.removeGuide);
  const startSurveyFromGuide = useGuideStore((s) => s.startSurveyFromGuide);
  const focusGuide = useGuideStore((s) => s.focusGuide);

  const [open, setOpen] = useState(false);
  const [showPointsDialog, setShowPointsDialog] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleImport = () => {
    void importGuides().then((res) => {
      if (res.ok) showToast?.(t('mission:guidesButton.added', { count: res.count }), 'success');
      else if (res.error) showToast?.(res.error, 'error');
    });
  };

  const anyHidden = guides.some((g) => !g.visible);

  return (
    <div ref={ref} className="relative">
      <button
        data-tour="mission-import"
        onClick={() => setOpen((o) => !o)}
        className="p-1.5 rounded bg-surface-raised text-content hover:brightness-125 transition-colors relative"
        data-tip={t('mission:guidesButton.tip')}
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V5.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        {guides.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-0.5 rounded-full bg-teal-600 text-white text-[9px] font-semibold flex items-center justify-center">
            {guides.length}
          </span>
        )}
      </button>

      {/* MissionToolbar sits at the top of the view, so the panel opens downward. */}
      {open && (
        <div className="absolute right-0 top-full mt-1 z-[1100] w-72 bg-surface-solid border border-subtle rounded-lg shadow-xl py-1">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-subtle">
            <span className="text-[10px] font-medium uppercase tracking-wider text-content-secondary">
              {t('mission:guidesButton.title')}
            </span>
            <div className="flex items-center gap-2">
              {guides.length > 0 && (
                <button
                  onClick={() => setAllVisible(anyHidden)}
                  className="text-[10px] text-content-tertiary hover:text-content transition-colors"
                >
                  {anyHidden ? t('mission:guidesButton.showAll') : t('mission:guidesButton.hideAll')}
                </button>
              )}
              <button
                onClick={() => { setShowPointsDialog(true); setOpen(false); }}
                className="text-[10px] font-medium text-teal-300 hover:text-teal-200 transition-colors"
                data-tip={t('mission:guidesButton.pointsTip')}
              >
                {t('mission:guidesButton.points')}
              </button>
              <button
                onClick={handleImport}
                className="text-[10px] font-medium text-teal-300 hover:text-teal-200 transition-colors"
              >
                {t('mission:guidesButton.import')}
              </button>
            </div>
          </div>

          {guides.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-content-tertiary leading-snug">
              {t('mission:guidesButton.empty')}
            </p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {guides.map((g) => (
                <div key={g.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-surface-raised transition-colors">
                  <button
                    onClick={() => toggleGuide(g.id)}
                    className={`shrink-0 transition-colors ${g.visible ? 'text-content' : 'text-content-tertiary opacity-50'}`}
                    data-tip={g.visible ? t('mission:guidesButton.hideOnMap') : t('mission:guidesButton.showOnMap')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {g.visible ? (
                        <>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </>
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      )}
                    </svg>
                  </button>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                  <span className="flex-1 min-w-0 truncate text-xs text-content" title={g.name}>
                    {g.name}
                  </span>
                  <span className="text-[10px] text-content-tertiary shrink-0">
                    {g.kind === 'line' ? t('mission:guidesButton.linePrefix') : ''}{t('mission:guidesButton.pts', { count: g.polygon.length })}
                  </span>
                  <button
                    onClick={() => focusGuide(g.id)}
                    className="shrink-0 text-content-tertiary hover:text-teal-300 transition-colors"
                    data-tip={t('mission:guidesButton.zoomTip')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                    </svg>
                  </button>
                  {(g.kind === 'line' ? g.polygon.length >= 2 : g.polygon.length >= 3) && g.kind !== 'points' && (
                    <button
                      onClick={() => {
                        startSurveyFromGuide(g.id);
                        setOpen(false);
                      }}
                      className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-600/80 hover:bg-purple-500 text-white transition-colors"
                      data-tip={g.kind === 'line'
                        ? t('mission:guidesButton.corridorTip')
                        : t('mission:guidesButton.planTip')}
                    >
                      {g.kind === 'line' ? t('common:corridor') : t('mission:guidesButton.plan')}
                    </button>
                  )}
                  <button
                    onClick={() => removeGuide(g.id)}
                    className="shrink-0 text-content-tertiary hover:text-red-400 transition-colors"
                    data-tip={t('mission:guidesButton.remove')}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {showPointsDialog && (
        <SurveyedPointsDialog onClose={() => setShowPointsDialog(false)} showToast={showToast} />
      )}
    </div>
  );
}
