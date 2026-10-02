import { useTranslation, Trans } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useOverlayStore } from '../../../stores/overlay-store';

export function ApiKeyDialog() {
  const { t } = useTranslation();
  const showApiKeyDialog = useOverlayStore((s) => s.showApiKeyDialog);
  const setShowApiKeyDialog = useOverlayStore((s) => s.setShowApiKeyDialog);
  const checkApiKey = useOverlayStore((s) => s.checkApiKey);
  const [key, setKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (showApiKeyDialog) {
      setKey('');
      setError('');
    }
  }, [showApiKeyDialog]);

  if (!showApiKeyDialog) return null;

  const handleSave = async () => {
    const trimmed = key.trim();
    if (!trimmed) {
      setError(t('map:apiKeyDialog.required'));
      return;
    }
    setSaving(true);
    await window.electronAPI.setApiKey('openaip', trimmed);
    const hasKey = await checkApiKey();
    setSaving(false);
    if (hasKey) {
      setShowApiKeyDialog(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-surface-solid border border-subtle rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-content mb-2">{t('map:apiKeyDialog.title')}</h3>
        <p className="text-sm text-content-secondary mb-4">
          {t('map:apiKeyDialog.intro')}
        </p>

        <div className="bg-surface-input rounded-lg p-3 mb-4 text-sm text-content space-y-2">
          <p className="font-medium text-content">{t('map:apiKeyDialog.howTo')}</p>
          <ol className="list-decimal list-inside space-y-1 text-content-secondary">
            <li>
              <Trans
                i18nKey="map:apiKeyDialog.goTo"
                components={{ a: <a href="https://www.openaip.net" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline" /> }}
              />
            </li>
            <li>{t('map:apiKeyDialog.createAccount')}</li>
            <li>{t('map:apiKeyDialog.findKey')}</li>
          </ol>
        </div>

        <input
          type="text"
          value={key}
          onChange={(e) => { setKey(e.target.value); setError(''); }}
          placeholder={t('map:apiKeyDialog.placeholder')}
          className="w-full px-3 py-2 bg-surface-input border border rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500 mb-2"
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          autoFocus
        />
        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => setShowApiKeyDialog(false)}
            className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
          >
            {t('common:cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? t('common:saving') : t('map:apiKeyDialog.saveKey')}
          </button>
        </div>
      </div>
    </div>
  );
}
