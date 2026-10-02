import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useModuleStore } from '../../stores/module-store';

interface PendingInstall {
  slug: string;
  name: string;
  key: string;
}

/**
 * Listens for ardudeck://install deep links forwarded from the main process and
 * confirms with the user before installing the module + restarting. Mounted
 * once at the app root so it works regardless of the active view.
 */
export function DeepLinkInstallPrompt() {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingInstall | null>(null);
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cleanup = window.electronAPI.onModuleDeepLinkInstall((payload) => {
      setError(null);
      setPending(payload);
    });
    return () => { cleanup(); };
  }, []);

  if (!pending) return null;

  const handleInstall = async () => {
    setInstalling(true);
    setError(null);
    const result = await useModuleStore.getState().activateLicense(pending.key);
    if (result.success) {
      // Module loads at startup only, so restart to surface it.
      await window.electronAPI.relaunchApp();
    } else {
      setError(result.error ?? t('modules:deepLinkInstallPrompt.activationFailed'));
      setInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-surface-solid rounded-xl border border-subtle w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-subtle">
          <h2 className="text-base font-semibold text-content">{t('modules:deepLinkInstallPrompt.title')}</h2>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-content">
            <Trans
              i18nKey="modules:deepLinkInstallPrompt.question"
              values={{ name: pending.name }}
              components={{ b: <span className="font-semibold" /> }}
            />
          </p>
          <p className="text-sm text-content-secondary mt-2">
            {t('modules:deepLinkInstallPrompt.restartNote')}
          </p>
          {error && (
            <div className="mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-subtle flex justify-end gap-2">
          <button
            onClick={() => setPending(null)}
            disabled={installing}
            className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors disabled:opacity-50"
          >
            {t('common:cancel')}
          </button>
          <button
            onClick={handleInstall}
            disabled={installing}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {installing ? t('common:loading') : t('modules:deepLinkInstallPrompt.loadAndRestart')}
          </button>
        </div>
      </div>
    </div>
  );
}
