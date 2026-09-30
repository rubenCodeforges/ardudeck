/**
 * UI language definitions shared by the renderer (i18n, settings store) and the
 * main process (settings schema). Keeping the list here means the persisted
 * `language` value and the i18n resource bundles cannot drift apart silently.
 */

export const APP_LANGUAGES = ['en', 'zh-CN'] as const;

export type AppLanguage = (typeof APP_LANGUAGES)[number];

/** Language used when nothing is stored and the OS locale matches no bundle. */
export const DEFAULT_APP_LANGUAGE: AppLanguage = 'en';

export function isAppLanguage(value: unknown): value is AppLanguage {
  return typeof value === 'string' && (APP_LANGUAGES as readonly string[]).includes(value);
}

/** Native name of each language, shown in the language picker. */
export const APP_LANGUAGE_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  'zh-CN': '简体中文',
};

/**
 * Map an OS locale (`navigator.language`, `app.getLocale()`) onto a bundled
 * language. Chinese locales of any region collapse onto `zh-CN`; everything
 * else falls back to the default.
 */
export function normalizeAppLanguage(locale: string | undefined | null): AppLanguage {
  if (!locale) return DEFAULT_APP_LANGUAGE;
  if (isAppLanguage(locale)) return locale;
  if (/^zh(\b|-|_)/i.test(locale)) return 'zh-CN';
  return DEFAULT_APP_LANGUAGE;
}
