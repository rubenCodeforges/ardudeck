import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { I18nextProvider, setI18n } from 'react-i18next';
import { i18n } from '../shared/i18n/index.js';

// Global registration covers React roots created outside the provider (map popups, portals in new roots).
setI18n(i18n);

export async function initRendererI18n(): Promise<void> {
  try {
    const state = await window.electronAPI.getLanguage();
    await i18n.changeLanguage(state.language);
  } catch {
    // Main not ready (tests, storybook-style mounts): stay on the default language.
  }
  window.electronAPI.onLanguageChanged?.((state) => void i18n.changeLanguage(state.language));
}

/** Remounts the tree on language change so plain t() calls outside hooks refresh too. */
export function I18nRoot({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState(i18n.language);
  useEffect(() => {
    const onChange = (lng: string) => setLanguage(lng);
    i18n.on('languageChanged', onChange);
    return () => i18n.off('languageChanged', onChange);
  }, []);
  return (
    <I18nextProvider i18n={i18n}>
      <Fragment key={language}>{children}</Fragment>
    </I18nextProvider>
  );
}
