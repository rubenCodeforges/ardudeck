import { app, ipcMain } from 'electron';
import Store from 'electron-store';
import { i18n, resolveLanguage, SUPPORTED_LANGUAGES, type LanguagePreference } from '../shared/i18n/index.js';
import { IPC_CHANNELS } from '../shared/ipc-channels.js';
import { broadcast } from './window-manager.js';

export interface LanguageState {
  preference: LanguagePreference;
  language: string;
  supported: { code: string; nativeName: string }[];
}

const languageStore = new Store<{ preference: LanguagePreference }>({
  name: 'language',
  defaults: { preference: 'system' },
});

function state(): LanguageState {
  return { preference: languageStore.get('preference'), language: i18n.language, supported: SUPPORTED_LANGUAGES };
}

/** Call after app ready, before the first window loads, so main-process strings start translated. */
export function initMainI18n(): void {
  void i18n.changeLanguage(resolveLanguage(languageStore.get('preference'), app.getLocale()));
}

export function setupI18nIpc(): void {
  ipcMain.handle(IPC_CHANNELS.I18N_GET_LANGUAGE, (): LanguageState => state());

  ipcMain.handle(IPC_CHANNELS.I18N_SET_LANGUAGE, async (_, preference: LanguagePreference): Promise<LanguageState> => {
    languageStore.set('preference', preference);
    await i18n.changeLanguage(resolveLanguage(preference, app.getLocale()));
    const next = state();
    broadcast(IPC_CHANNELS.I18N_LANGUAGE_CHANGED, next);
    return next;
  });
}
