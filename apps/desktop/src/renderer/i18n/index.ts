import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_APP_LANGUAGE, normalizeAppLanguage } from '../../shared/app-language';
import { readStoredAppLanguage, writeStoredAppLanguage } from '../../shared/app-language-storage';
import { en } from './locales/en';
import { zhCN } from './locales/zh-CN';

export const I18N_NAMESPACES = ['common', 'lua', 'mavlink', 'mission', 'nav', 'notify', 'osd', 'params', 'receiver', 'serialPorts', 'settings', 'views'] as const;
export type I18nNamespace = (typeof I18N_NAMESPACES)[number];

export const i18nResources = {
  en,
  'zh-CN': zhCN,
} as const;

/**
 * Resolve the language to start the UI in, before persisted settings finish
 * loading: stored preference wins, then the OS/browser locale, then English.
 */
function initialLanguage(): string {
  const stored = readStoredAppLanguage();
  if (stored) return stored;
  const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;
  return normalizeAppLanguage(locale);
}

let initialized = false;

/**
 * Initialise i18next once. Safe to call from every window (main window and
 * detached pop-outs); later calls are no-ops.
 */
export function initI18n(): typeof i18n {
  if (initialized) return i18n;

  void i18n.use(initReactI18next).init({
    resources: i18nResources,
    lng: initialLanguage(),
    fallbackLng: DEFAULT_APP_LANGUAGE,
    supportedLngs: Object.keys(i18nResources),
    defaultNS: 'common',
    // Components mount with a feature namespace (e.g. 'settings') but still need
    // the shared vocabulary (`undo`, `cancel`…), so fall back to 'common'.
    fallbackNS: 'common',
    ns: [...I18N_NAMESPACES],
    interpolation: {
      // React already escapes rendered values.
      escapeValue: false,
    },
    returnNull: false,
  });

  initialized = true;
  return i18n;
}

/**
 * Switch the UI language at runtime. The settings store also mirrors the value
 * into the persisted settings file; this keeps i18next and localStorage in step.
 *
 * Also called from store code that tests import without booting the renderer, so
 * it must not throw when i18next was never initialised: the store still records
 * and persists the choice, and the next `initI18n()` picks it up from storage.
 */
export async function applyAppLanguage(language: string): Promise<void> {
  const next = normalizeAppLanguage(language);
  writeStoredAppLanguage(next);
  if (!initialized) return;
  if (i18n.language !== next) {
    await i18n.changeLanguage(next);
  }
}

export { i18n };
export default i18n;
