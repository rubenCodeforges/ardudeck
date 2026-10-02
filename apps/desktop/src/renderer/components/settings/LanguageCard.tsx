import { useEffect, useState } from 'react';
import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { LanguageState } from '../../../main/i18n-main';

export function LanguageCard() {
  const { t } = useTranslation();
  const [state, setState] = useState<LanguageState | null>(null);

  useEffect(() => {
    void window.electronAPI.getLanguage().then(setState);
  }, []);

  if (!state) return null;

  const nameOf = (code: string) => state.supported.find((l) => l.code === code)?.nativeName ?? code;

  return (
    <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 mb-4">
      <div className="flex items-center gap-3 mb-4">
        <Languages className="w-4 h-4 text-violet-400" aria-hidden="true" />
        <div className="text-sm font-medium text-content">{t('settings:languageTitle')}</div>
      </div>
      <label className="block max-w-sm space-y-1.5">
        <select
          value={state.preference}
          onChange={(event) => void window.electronAPI.setLanguage(event.target.value).then(setState)}
          className="w-full bg-surface-input border border-border rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-blue-500/50"
        >
          <option value="system">{t('settings:languageSystem', { language: nameOf(state.language) })}</option>
          {state.supported.map((lang) => (
            <option key={lang.code} value={lang.code}>{lang.nativeName}</option>
          ))}
        </select>
        <span className="block text-xs text-content-secondary">{t('settings:languageHint')}</span>
      </label>
    </div>
  );
}
