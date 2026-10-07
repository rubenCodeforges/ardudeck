import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getPendingGoldenWrite, subscribePendingGoldenWrite, type PendingGoldenWrite } from './production-host';

function fmt(v: number | null): string {
  if (v === null) return '-';
  return Number.isInteger(v) ? String(v) : String(parseFloat(v.toPrecision(7)));
}

/** Consent before a production golden is written to a board. Host-owned, so a module cannot skip it. */
export function ProductionWriteDialog(): JSX.Element | null {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingGoldenWrite | null>(getPendingGoldenWrite);
  const [remember, setRemember] = useState(false);

  useEffect(() => subscribePendingGoldenWrite(() => setPending(getPendingGoldenWrite())), []);
  useEffect(() => {
    if (pending) setRemember(false);
  }, [pending]);

  if (!pending) return null;

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50">
      <div className="w-[480px] max-w-[92vw] rounded-lg border border-subtle bg-surface-solid shadow-xl flex flex-col max-h-[80vh]">
        <div className="px-4 pt-4">
          <div className="text-[11px] uppercase tracking-wide text-content-tertiary">{t('modules:productionWriteDialog.kicker')}</div>
          <div className="mt-1 text-base font-semibold text-content">
            {t('modules:productionWriteDialog.title', { model: pending.modelName })}
          </div>
          <p className="mt-1 text-xs text-content-secondary">
            {t('modules:productionWriteDialog.body', { count: pending.deltas.length })}
          </p>
          {pending.resetsFirst && (
            <p className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300">
              {t('modules:productionWriteDialog.resetFirst')}
            </p>
          )}
          {pending.arming && <p className="mt-2 text-xs text-content-secondary">{t('modules:productionWriteDialog.armBody')}</p>}
        </div>

        <div className="mx-4 mt-3 overflow-y-auto rounded border border-subtle">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-solid">
              <tr className="text-content-tertiary text-[10px] uppercase tracking-wide">
                <th className="text-left px-2 py-1.5 font-medium">{t('modules:productionWriteDialog.param')}</th>
                <th className="text-right px-2 py-1.5 font-medium">{t('modules:productionWriteDialog.now')}</th>
                <th className="text-right px-2 py-1.5 font-medium">{t('modules:productionWriteDialog.golden')}</th>
              </tr>
            </thead>
            <tbody>
              {pending.deltas.map((d) => (
                <tr key={d.id} className="border-t border-subtle">
                  <td className="px-2 py-1 font-mono text-content">{d.id}</td>
                  <td className="px-2 py-1 font-mono text-right text-content-secondary tabular-nums">{fmt(d.actual)}</td>
                  <td className="px-2 py-1 font-mono text-right text-content tabular-nums">{fmt(d.expected)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mx-4 mt-2 text-[11px] text-content-tertiary">{t('modules:productionWriteDialog.calibrationKept')}</p>

        {!pending.arming && (
          <label className="mx-4 mt-3 flex items-start gap-2 text-xs text-content-secondary cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>{t('modules:productionWriteDialog.remember')}</span>
          </label>
        )}

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-subtle px-4 py-3">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-sm text-content-secondary hover:text-content"
            onClick={() => pending.resolve({ accepted: false, rememberForSession: false })}
          >
            {t('common:cancel')}
          </button>
          <button
            type="button"
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white"
            onClick={() => pending.resolve({ accepted: true, rememberForSession: pending.arming || remember })}
          >
            {pending.arming ? t('modules:productionWriteDialog.arm') : t('modules:productionWriteDialog.write')}
          </button>
        </div>
      </div>
    </div>
  );
}
