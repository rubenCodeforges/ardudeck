import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Undo2, ShieldCheck } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { formatParamValue } from '../../../shared/parameter-types';
import { planResetChanged } from '../parameters/reset-changed';
import { ui } from '../ui/ui-hooks';

interface ResetChangedDialogProps {
  onCancel: () => void;
  /** Called with how many values were staged. */
  onDone: (count: number) => void;
}

/** Stage every writable parameter that differs from its firmware default back to that default. Nothing is sent until Write to Flash. */
export function ResetChangedDialog({ onCancel, onDone }: ResetChangedDialogProps) {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const setParameter = useParameterStore((s) => s.setParameter);
  const [keepProtected, setKeepProtected] = useState(true);
  const [busy, setBusy] = useState(false);
  const plan = useMemo(() => planResetChanged(parameters.values(), keepProtected), [parameters, keepProtected]);

  const apply = async () => {
    setBusy(true);
    for (const p of plan.reset) await setParameter(p.id, p.defaultValue!);
    onDone(plan.reset.length);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div role="dialog" aria-modal="true" aria-label={t('mavlink-config:resetChanged.title')} className="bg-surface-solid border rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-subtle">
          <h3 className="text-lg font-semibold text-content flex items-center gap-2">
            <Undo2 className="w-5 h-5 text-blue-400 shrink-0" />
            {t('mavlink-config:resetChanged.title')}
          </h3>
          <p className="text-sm text-content-secondary mt-2">{t('mavlink-config:resetChanged.body')}</p>
        </div>

        <label className="px-6 py-3 border-b border-subtle flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={keepProtected}
            onChange={(e) => setKeepProtected(e.target.checked)}
            className="mt-0.5 accent-blue-500"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm text-content">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              {t('mavlink-config:resetChanged.keep')}
            </span>
            <span className="block text-xs text-content-tertiary mt-0.5">
              {keepProtected
                ? t('mavlink-config:resetChanged.keptCount', { count: plan.kept.length })
                : t('mavlink-config:resetChanged.keepOffWarning')}
            </span>
          </span>
        </label>

        <div className="flex-1 min-h-0 overflow-auto px-6 py-2">
          {plan.reset.length === 0 ? (
            <p className="py-6 text-center text-sm text-content-tertiary">{t('mavlink-config:resetChanged.nothing')}</p>
          ) : (
            <table className="w-full text-xs font-mono">
              <thead>
                <tr className="text-content-tertiary">
                  <th className="text-left font-normal py-1">{t('mavlink-config:resetChanged.colParam')}</th>
                  <th className="text-right font-normal py-1">{t('mavlink-config:resetChanged.colCurrent')}</th>
                  <th className="text-right font-normal py-1">{t('mavlink-config:resetChanged.colDefault')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.reset.map((p) => (
                  <tr key={p.id} className="border-t border-subtle/50">
                    <td className="py-1 text-content truncate max-w-[200px]">{p.id}</td>
                    <td className="py-1 text-right text-amber-400 tabular-nums">{formatParamValue(p.value)}</td>
                    <td className="py-1 text-right text-content-secondary tabular-nums">{formatParamValue(p.defaultValue!)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-subtle flex items-center justify-end gap-3">
          <span className="mr-auto text-xs text-content-tertiary">{t('mavlink-config:resetChanged.flashNote')}</span>
          <button
            {...ui('button', { variant: 'ghost' })}
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
          >
            {t('common:cancel')}
          </button>
          <button
            {...ui('button', { variant: 'primary' })}
            onClick={() => void apply()}
            disabled={busy || plan.reset.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('mavlink-config:resetChanged.confirm', { count: plan.reset.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
