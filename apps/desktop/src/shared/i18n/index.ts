// Never call t() at module top level: the value freezes in the language active at import.
import i18next, { type i18n as I18n, type Resource } from 'i18next';

export const DEFAULT_LANGUAGE = 'en';

/** Language the user picked; 'system' follows the OS locale. */
export type LanguagePreference = 'system' | string;

const modules = import.meta.glob<Record<string, unknown>>('./locales/*/*.json', { eager: true, import: 'default' });

const resources: Resource = {};
for (const [file, data] of Object.entries(modules)) {
  const match = /\.\/locales\/([^/]+)\/([^/]+)\.json$/.exec(file);
  if (!match) continue;
  const [, lang, ns] = match;
  (resources[lang!] ??= {})[ns!] = data;
}

/** Languages that ship a locale folder, with their own-language display name. */
export const SUPPORTED_LANGUAGES: { code: string; nativeName: string }[] = Object.keys(resources)
  .sort((a, b) => (a === DEFAULT_LANGUAGE ? -1 : b === DEFAULT_LANGUAGE ? 1 : a.localeCompare(b)))
  .map((code) => ({ code, nativeName: nativeNameOf(code) }));

function nativeNameOf(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}

/** Map a preference plus the OS locale (e.g. 'de-AT') to a shipped language. */
export function resolveLanguage(preference: LanguagePreference | undefined, systemLocale: string): string {
  const wanted = !preference || preference === 'system' ? systemLocale : preference;
  const codes = Object.keys(resources);
  if (codes.includes(wanted)) return wanted;
  const base = wanted.split(/[-_]/)[0]!.toLowerCase();
  return codes.find((c) => c.toLowerCase() === base) ?? DEFAULT_LANGUAGE;
}

export const i18n: I18n = i18next.createInstance();

void i18n.init({
  resources,
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  ns: Object.keys(resources[DEFAULT_LANGUAGE] ?? {}),
  defaultNS: 'common',
  fallbackNS: 'common',
  initAsync: false,
  interpolation: { escapeValue: false },
  returnNull: false,
});

/** Plain t() for code outside React (stores, main process, utils). */
export const t: typeof i18n.t = ((...args: Parameters<typeof i18n.t>) => i18n.t(...args)) as typeof i18n.t;
