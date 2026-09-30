import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { APP_LANGUAGES, APP_LANGUAGE_LABELS } from '../../../shared/app-language.js';
import { useSettingsStore } from '../../stores/settings-store';

export function LanguageCard() {
  const { t } = useTranslation('settings');
  const language = useSettingsStore((state) => state.language);
  const setLanguage = useSettingsStore((state) => state.setLanguage);

  return (
    <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 mb-4" data-tour="language-preferences">
      <div className="flex items-center gap-3 mb-4">
        <Languages className="w-4 h-4 text-blue-400" aria-hidden="true" />
        <div className="text-sm font-medium text-content">{t('language.heading')}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
        <label className="space-y-1.5">
          <span className="block text-xs font-medium text-content-secondary">{t('language.label')}</span>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as (typeof APP_LANGUAGES)[number])}
            className="w-full bg-surface-input border border-border rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-blue-500/50"
          >
            {APP_LANGUAGES.map((code) => (
              <option key={code} value={code}>
                {APP_LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="mt-3 text-xs text-content-secondary">{t('language.description')}</p>
    </div>
  );
}
