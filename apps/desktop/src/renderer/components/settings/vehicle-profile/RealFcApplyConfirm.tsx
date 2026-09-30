import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

interface RealFcApplyConfirmProps {
  systemId: number;
  vehicleLabel: string;
  destructiveParams: string[];  // names of FRAME/Q_* topology changes
  totalParams: number;
  onConfirm: (opts: { backupFirst: boolean }) => void;
  onCancel: () => void;
}

/**
 * Pre-flight gate before the actual compare modal for real hardware.
 * Enforces a 2-second delay on the confirm button so the user can't muscle-
 * memory through it.
 */
export function RealFcApplyConfirm({
  systemId,
  vehicleLabel,
  destructiveParams,
  totalParams,
  onConfirm,
  onCancel,
}: RealFcApplyConfirmProps) {
  const { t } = useTranslation('settings');
  const [backupFirst, setBackupFirst] = useState(true);
  const [secondsLeft, setSecondsLeft] = useState(2);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const canConfirm = secondsLeft === 0;

  return (
    <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-[80] p-4">
      <div className="bg-surface-solid rounded-xl border border-amber-500/40 w-full max-w-lg shadow-2xl">
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-semibold text-content">{t('vehicleProfile.realFc.heading')}</h3>
              <p className="text-xs text-content-secondary mt-1 leading-relaxed">
                {t('vehicleProfile.realFc.introPrefix')}<span className="text-amber-400 font-medium">sysid {systemId}</span>
                {t('vehicleProfile.realFc.introMiddle', { vehicle: vehicleLabel })}
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-content-secondary">{t('vehicleProfile.realFc.totalParams')}</span>
              <span className="text-content font-mono">{totalParams}</span>
            </div>
            {destructiveParams.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
                <div className="flex items-center gap-2 text-xs text-amber-300 mb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="font-medium">{t('vehicleProfile.realFc.topologyParams')}</span>
                </div>
                <div className="text-[11px] text-content-secondary leading-relaxed">
                  {t('vehicleProfile.realFc.topologyHint')}
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {destructiveParams.map(p => (
                    <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <label className="flex items-start gap-2 text-xs text-content-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={backupFirst}
                onChange={e => setBackupFirst(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="text-content">{t('vehicleProfile.realFc.backup')}</span>
                <span className="block text-content-secondary mt-0.5">
                  {t('vehicleProfile.realFc.backupHint')}
                </span>
              </span>
            </label>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-subtle">
          <div className="text-[10px] text-content-secondary">
            {canConfirm
              ? t('vehicleProfile.realFc.ready')
              : t('vehicleProfile.realFc.confirmAvailableIn', { seconds: secondsLeft })}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg text-xs text-content-secondary hover:text-content hover:bg-surface-overlay-subtle transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={() => onConfirm({ backupFirst })}
              disabled={!canConfirm}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                canConfirm
                  ? 'bg-amber-500 hover:bg-amber-400 text-black'
                  : 'bg-surface-overlay-subtle text-content-secondary cursor-not-allowed'
              }`}
            >
              {t('vehicleProfile.realFc.continue')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
