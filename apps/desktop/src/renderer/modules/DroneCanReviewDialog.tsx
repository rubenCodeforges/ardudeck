import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import type { DroneCanParamValue } from '../../shared/dronecan-types';
import {
  cancelDroneCanWrite, getPendingDroneCanWrite, performDroneCanWrite, subscribeDroneCanWrite, type PendingDroneCanWrite,
} from '../lib/dronecan-review';

function show(v: DroneCanParamValue | null): string {
  if (!v || v.type === 'empty') return '-';
  if (v.type === 'boolean') return v.value ? '1' : '0';
  return String(v.value);
}

export function DroneCanReviewDialog(): JSX.Element | null {
  const { t } = useTranslation();
  const [pending, setPending] = useState<PendingDroneCanWrite | null>(getPendingDroneCanWrite);
  const [save, setSave] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => subscribeDroneCanWrite(() => setPending(getPendingDroneCanWrite())), []);
  useEffect(() => {
    setBusy(false);
    setSave(pending?.request.saveByDefault ?? false);
  }, [pending]);

  if (!pending) return null;
  const { request } = pending;
  const node = request.nodeName ? `${request.nodeName} (${request.nodeId})` : t('dronecan:nodeFallbackName', { id: request.nodeId });

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/50">
      <div className="w-[520px] max-w-[92vw] rounded-lg border border-subtle bg-surface-solid shadow-xl">
        <div className="px-4 pt-4">
          <div className="text-[11px] uppercase tracking-wide text-content-tertiary">
            {request.from ? t('dronecan:review.asksToWrite', { from: request.from }) : t('dronecan:review.title')}
          </div>
          <div className="mt-1 text-base font-semibold text-content">{node}</div>
          {request.reason && <p className="mt-1 text-xs text-content-secondary">{request.reason}</p>}
        </div>

        <div className="px-4 pt-3 max-h-[50vh] overflow-y-auto">
          <table className="w-full text-xs">
            <tbody>
              {request.changes.map((c) => (
                <tr key={c.name} className="border-b border-subtle/60">
                  <td className="py-1.5 pr-3 font-mono text-content">{c.name}</td>
                  <td className="py-1.5 pr-2 font-mono text-content-secondary text-right">{show(c.current)}</td>
                  <td className="py-1.5 px-1 text-content-tertiary"><ArrowRight className="w-3 h-3" aria-hidden="true" /></td>
                  <td className="py-1.5 font-mono text-amber-600 dark:text-amber-400">{show(c.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <label className="flex items-start gap-2 px-4 pt-3 text-xs text-content-secondary">
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="mt-0.5" />
          <span>{t('dronecan:review.saveOnNode')}</span>
        </label>

        <div className="mt-4 flex items-center justify-end gap-2 border-t border-subtle px-4 py-3">
          <button type="button" className="rounded px-3 py-1.5 text-sm text-content-secondary hover:text-content" onClick={cancelDroneCanWrite}>
            {t('common:cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
            onClick={() => {
              setBusy(true);
              void performDroneCanWrite(pending, save);
            }}
          >
            {busy ? t('common:writing') : t('dronecan:review.write', { count: request.changes.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
