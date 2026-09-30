/**
 * Persisted UI language, stored independently of the main-process settings file
 * so the renderer can pick the right language on its very first paint, before
 * the async settings load resolves.
 *
 * `apps/desktop/src/main/preload.ts` exposes renderer storage via
 * `window.electronAPI.getSetting/setSetting`, but this module runs during module
 * init (before App effects) and must not depend on IPC being ready, so it uses
 * localStorage directly. The settings file remains the source of truth for the
 * value itself; this is only a fast-start mirror of it.
 */
import { isAppLanguage, type AppLanguage } from './app-language';

export const UI_LANGUAGE_STORAGE_KEY = 'ardudeck.ui-language';

export function readStoredAppLanguage(): AppLanguage | null {
  try {
    const raw = globalThis.localStorage?.getItem(UI_LANGUAGE_STORAGE_KEY);
    return isAppLanguage(raw) ? raw : null;
  } catch {
    // Storage can be unavailable (disabled, quota, private mode). Fall through
    // to locale detection rather than failing app start.
    return null;
  }
}

export function writeStoredAppLanguage(language: AppLanguage): void {
  try {
    globalThis.localStorage?.setItem(UI_LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Non-fatal: the settings file still persists the choice.
  }
}
