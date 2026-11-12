import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Download, RotateCcw } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { ui } from '../ui/ui-hooks';

interface ResetParamsDialogProps {
  armed: boolean;
  firmware?: string | null;
  vehicleType?: string;
  onCancel: () => void;
  /** Erases and reboots; resolves false when the vehicle refused. */
  onReset: () => Promise<boolean>;
}

export function ResetParamsDialog({ armed, firmware, vehicleType, onCancel, onReset }: ResetParamsDialogProps) {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const saveFile = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const params = Array.from(parameters.values())
        .filter((p) => !p.isReadOnly)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((p) => ({ id: p.id, value: p.value, type: p.type }));
      const result = await window.electronAPI?.saveParamsToFile(params, vehicleType);
      if (result?.success) setSaved(true);
      else if (result?.error && result.error !== 'Cancelled') setSaveError(result.error);
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    const ok = await onReset();
    if (!ok) setBusy(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div role="dialog" aria-modal="true" aria-label={t('mavlink-config:resetParams.title')} className="bg-surface-solid border rounded-xl shadow-2xl max-w-md w-full mx-4">
        <div className="px-6 py-4 border-b border-subtle">
          <h3 className="text-lg font-semibold text-content flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            {t('mavlink-config:resetParams.title')}
          </h3>
          <p className="text-sm text-content-secondary mt-2">{t('mavlink-config:resetParams.body')}</p>
          <p className="text-sm text-amber-400 mt-2">{firmware === 'px4' ? t('mavlink-config:resetParams.calibrationWarningPx4') : t('mavlink-config:resetParams.calibrationWarning')}</p>
        </div>
        <div className="px-6 py-4 border-b border-subtle space-y-2">
          <p className="text-sm text-content-secondary">{t('mavlink-config:resetParams.saveFirst')}</p>
          <button
            {...ui('button', { variant: 'secondary' })}
            onClick={() => void saveFile()}
            disabled={saving || parameters.size === 0}
            className="px-4 py-2 text-sm rounded-lg flex items-center gap-2 bg-surface-raised hover:bg-surface text-content border border-subtle disabled:opacity-50"
          >
            {saved ? <Check className="w-4 h-4 text-emerald-400" /> : <Download className="w-4 h-4" />}
            {saved ? t('mavlink-config:resetParams.saved') : t('mavlink-config:resetParams.saveFile')}
          </button>
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
        </div>
        <div className="px-6 py-4 flex items-center justify-end gap-3">
          {armed && <span className="mr-auto text-xs text-red-400">{t('mavlink-config:resetParams.disarmFirst')}</span>}
          <button
            {...ui('button', { variant: 'ghost' })}
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
          >
            {t('common:cancel')}
          </button>
          <button
            {...ui('button', { variant: 'danger' })}
            onClick={() => void reset()}
            disabled={armed || busy}
            className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            {t('mavlink-config:resetParams.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
