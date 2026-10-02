import { BookOpen, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ExperienceLevel } from '../../stores/settings-store';

interface ExperienceLevelDialogProps {
  onSelect: (level: ExperienceLevel) => void;
}

export function ExperienceLevelDialog({ onSelect }: ExperienceLevelDialogProps) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-surface-solid rounded-2xl border border-subtle w-full max-w-lg mx-4 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-2 text-center">
          <h2 className="text-lg font-semibold text-content">{t('ui:experienceLevelDialog.title')}</h2>
          <p className="text-sm text-content-secondary mt-1">
            {t('ui:experienceLevelDialog.subtitle')}
          </p>
        </div>

        {/* Cards */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {/* Beginner */}
          <button
            onClick={() => onSelect('beginner')}
            className="group text-left p-5 rounded-xl border border-subtle bg-surface hover:border-blue-500/50 hover:bg-blue-500/5 transition-all duration-200 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center mb-4 group-hover:bg-blue-500/20 transition-colors">
              <BookOpen className="w-5 h-5 text-blue-400" />
            </div>
            <div className="text-sm font-semibold text-content mb-1">{t('common:beginner')}</div>
            <p className="text-xs text-content-secondary leading-relaxed">
              {t('ui:experienceLevelDialog.beginnerDescription')}
            </p>
          </button>

          {/* Advanced */}
          <button
            onClick={() => onSelect('advanced')}
            className="group text-left p-5 rounded-xl border border-subtle bg-surface hover:border-purple-500/50 hover:bg-purple-500/5 transition-all duration-200 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 transition-colors">
              <Zap className="w-5 h-5 text-purple-400" />
            </div>
            <div className="text-sm font-semibold text-content mb-1">{t('common:advanced')}</div>
            <p className="text-xs text-content-secondary leading-relaxed">
              {t('ui:experienceLevelDialog.advancedDescription')}
            </p>
          </button>
        </div>

        {/* Footer hint */}
        <div className="px-6 pb-5 text-center">
          <p className="text-[11px] text-content-tertiary">
            {t('ui:experienceLevelDialog.changeAnytime')}
          </p>
        </div>
      </div>
    </div>
  );
}
