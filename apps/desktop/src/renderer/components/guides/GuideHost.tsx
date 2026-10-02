import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useGuidesStore } from '../../stores/guides-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { APP_GUIDES, getGuide } from '../../guides/registry';

const LAUNCH_DELAY_MS = 600;

function GuideDialog() {
  const { t } = useTranslation();
  const queue = useGuidesStore((s) => s.queue);
  const runLength = useGuidesStore((s) => s.runLength);
  const finishCurrent = useGuidesStore((s) => s.finishCurrent);
  const setSuppressed = useGuidesStore((s) => s.setSuppressed);
  const [suppress, setSuppress] = useState(false);
  const guide = queue[0] ? getGuide(queue[0]) : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') finishCurrent(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [finishCurrent]);

  if (!guide) return null;
  const step = runLength - queue.length + 1;
  const more = queue.length > 1;
  const close = (continueRun: boolean) => {
    if (suppress) setSuppressed(true);
    finishCurrent(continueRun && !suppress);
  };

  return createPortal(
    <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50 p-6">
      <div className="w-full max-w-[360px] rounded-2xl border border-subtle bg-surface-solid p-3.5 shadow-2xl">
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-sm font-semibold text-content">{t(guide.titleKey)}</div>
          {runLength > 1 && <div className="text-[11px] text-content-tertiary">{t('guides:guideHost.stepOf', { step, total: runLength })}</div>}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-content-secondary">{t(guide.blurbKey)}</p>
        <div className="mt-2 flex justify-center">
          <guide.Demo key={guide.id} />
        </div>
        <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[11px] text-content-tertiary">
          <input type="checkbox" checked={suppress} onChange={(e) => setSuppress(e.target.checked)} className="accent-blue-500" />
          {t('guides:guideHost.dontShowAgain')}
        </label>
        <div className="mt-2.5 flex justify-end gap-1.5">
          {more && (
            <button onClick={() => close(false)} className="rounded-md px-3 py-1.5 text-xs text-content-secondary hover:text-content transition-colors">
              {t('common:skip')}
            </button>
          )}
          <button onClick={() => close(true)} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors">
            {more ? t('common:next') : t('guides:guideHost.gotIt')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Shows unseen guides once per launch, after the experience-level question is answered and
 * only on the flight view, where the instruments they teach are on screen.
 */
export function GuideHost() {
  const currentView = useNavigationStore((s) => s.currentView);
  const experienceLevel = useSettingsStore((s) => s.experienceLevel);
  const experienceLevelVersion = useSettingsStore((s) => s.experienceLevelVersion);
  const tourPromptsEnabled = useSettingsStore((s) => s.tourPromptsEnabled);
  const [launched, setLaunched] = useState(false);

  useEffect(() => {
    if (launched || currentView !== 'telemetry' || !tourPromptsEnabled || !experienceLevel) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const version = await window.electronAPI?.getAppVersion();
      if (cancelled || !version || experienceLevelVersion !== version) return;
      const store = useGuidesStore.getState();
      setLaunched(true);
      if (store.isSuppressed() || store.queue.length) return;
      const unseen = [...APP_GUIDES].reverse().filter((g) => !store.isSeen(g.id)).map((g) => g.id);
      if (unseen.length) store.start(unseen);
    }, LAUNCH_DELAY_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [launched, currentView, tourPromptsEnabled, experienceLevel, experienceLevelVersion]);

  return <GuideDialog />;
}
