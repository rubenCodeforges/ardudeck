import { Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { FeatureTour } from '../../feature-tours';

interface TourPromptProps {
  tour: FeatureTour;
  onAccept: () => void;
  onDecline: () => void;
  onLater: () => void;
  onDisableAll: () => void;
}

export function TourPrompt({ tour, onAccept, onDecline, onLater, onDisableAll }: TourPromptProps) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed bottom-6 right-6 z-[9999] w-[22rem] rounded-xl overflow-hidden animate-in slide-in-from-bottom-4"
      style={{
        background: 'var(--bg-tooltip)',
        border: '1px solid var(--border-default)',
        boxShadow: '0 20px 40px -12px var(--shadow-color), 0 0 0 1px var(--border-subtle)',
      }}
    >
      <div className="h-0.5 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
      <div className="px-5 pt-4 pb-3 flex items-start gap-3">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgb(37 99 235 / 0.12)', border: '1px solid rgb(37 99 235 / 0.35)' }}
        >
          <Sparkles className="w-4 h-4" style={{ color: 'rgb(37 99 235)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'rgb(37 99 235)' }}>
              {t('tours:tourPrompt.quickTour')}
            </span>
          </div>
          <h3 className="text-sm font-semibold leading-tight" style={{ color: 'var(--text-primary)' }}>
            {t(tour.titleKey)}
          </h3>
          <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {t(tour.blurbKey)}
          </p>
        </div>
        <button
          onClick={onLater}
          className="shrink-0 p-1 rounded-md transition-colors"
          style={{ color: 'var(--text-tertiary)' }}
          title={t('tours:tourPrompt.remindLater')}
          aria-label={t('tours:tourPrompt.remindLater')}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-5 pb-4 flex gap-2">
        <button
          onClick={onDecline}
          className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
          style={{
            background: 'var(--bg-surface)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--border-default)',
          }}
        >
          {t('tours:tourPrompt.noThanks')}
        </button>
        <button
          onClick={onAccept}
          className="flex-1 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors"
          style={{ background: 'rgb(37 99 235)', color: '#fff' }}
        >
          {t('tours:tourPrompt.showMe')}
        </button>
      </div>
      <div className="px-5 pb-3 -mt-1">
        <button
          onClick={onDisableAll}
          className="text-[11px] underline underline-offset-2 transition-colors hover:opacity-80"
          style={{ color: 'var(--text-tertiary)' }}
        >
          {t('tours:tourPrompt.dontOfferAgain')}
        </button>
      </div>
    </div>
  );
}
