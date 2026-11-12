/**
 * Mission toolbar entry for guides: opens the Guides tab, where they are imported, drawn and managed.
 */
import { useTranslation } from 'react-i18next';
import { useGuideStore } from '../../stores/guide-store';
import { useMissionPanelRequestStore } from '../../stores/mission-panel-request-store';

export function GuidesButton(_props: { showToast?: (msg: string, kind: 'success' | 'error') => void }) {
  const { t } = useTranslation();
  const count = useGuideStore((s) => s.guides.length);
  return (
    <button
      data-tour="mission-import"
      onClick={() => useMissionPanelRequestStore.getState().open('guides')}
      className="p-1.5 rounded bg-surface-raised text-content hover:brightness-125 transition-colors relative"
      data-tip={t('mission:guidesButton.tip')}
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V5.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[1rem] h-4 px-0.5 rounded-full bg-teal-600 text-white text-[9px] font-semibold flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  );
}
