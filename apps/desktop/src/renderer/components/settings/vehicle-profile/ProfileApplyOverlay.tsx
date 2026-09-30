import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle, Info, Undo2, X, RotateCw, Loader2 } from 'lucide-react';
import { useProfileApplyStore } from '../../../stores/profile-apply-store.js';
import { useSettingsStore } from '../../../stores/settings-store.js';
import { useParameterStore } from '../../../stores/parameter-store.js';
import { useNavigationStore } from '../../../stores/navigation-store.js';
import { getSnapshot } from '../../../lib/vehicle-templates/snapshot.js';
import { buildUndoDiffs } from '../../../lib/vehicle-templates/apply.js';
import { useProfileApply } from './use-profile-apply.js';
import { RealFcApplyConfirm } from './RealFcApplyConfirm.js';

/**
 * Mount once at App root. Renders:
 *   - The persistent apply-status toast (survives view + modal changes).
 *   - The real-FC pre-confirm modal when a real-hardware apply is pending.
 *   - A small "writing…" progress pill when a batch PARAM_SET is in flight.
 */
export function ProfileApplyOverlay() {
  const toast = useProfileApplyStore(s => s.toast);
  const preflight = useProfileApplyStore(s => s.preflight);
  const status = useProfileApplyStore(s => s.status);
  const setToast = useProfileApplyStore(s => s.setToast);
  const updateVehicle = useSettingsStore(s => s.updateVehicle);

  // Auto-dismiss toasts: info=5s, success=30s (leaves time to Undo), error=8s.
  useEffect(() => {
    if (!toast) return;
    const ms = toast.kind === 'success' ? 30_000 : toast.kind === 'error' ? 8_000 : 5_000;
    const id = setTimeout(() => setToast(null), ms);
    return () => clearTimeout(id);
  }, [toast, setToast]);

  const handleUndo = () => {
    if (!toast?.snapshotId || !toast.profileId) return;
    const snapshot = getSnapshot(toast.profileId, toast.snapshotId);
    if (!snapshot) return;
    const current = new Map<string, { value: number; type: number }>();
    for (const [k, v] of useParameterStore.getState().parameters) {
      current.set(k, { value: v.value, type: v.type });
    }
    const diffs = buildUndoDiffs(snapshot, current);
    if (diffs.length === 0) return;
    useParameterStore.setState({
      fileParamDiffs: diffs,
      fileSkippedParams: [],
      fileSkippedCount: 0,
      fileTotalCount: diffs.length,
      fileVehicleType: null,
      showCompareModal: true,
      applyProgress: null,
      fileApplyResult: null,
    });
    updateVehicle(toast.profileId, { lastSnapshotId: undefined, lastAppliedAt: undefined });
    try { useNavigationStore.getState().setView('parameters'); } catch { /* ignore */ }
    setToast(null);
  };

  return (
    <>
      {preflight && <RealFcPreflightGate />}
      {status === 'writing' && <WritingPill />}
      {toast && <ToastCard toast={toast} onDismiss={() => setToast(null)} onUndo={toast.snapshotId ? handleUndo : undefined} />}
    </>
  );
}

function RealFcPreflightGate() {
  const preflight = useProfileApplyStore(s => s.preflight)!;
  // Route confirm/cancel through the hook that owns the logic.
  const { confirmRealFc, cancelRealFc } = useProfileApply(preflight.profile);
  return (
    <RealFcApplyConfirm
      systemId={preflight.target.sysid}
      vehicleLabel={preflight.target.label}
      destructiveParams={preflight.destructiveParams}
      totalParams={preflight.fileDiffs.length}
      onConfirm={confirmRealFc}
      onCancel={cancelRealFc}
    />
  );
}

function WritingPill() {
  const { t } = useTranslation('settings');
  return (
    <div className="fixed bottom-5 right-5 z-[85] flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 shadow-xl">
      <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
      <span className="text-xs text-content">{t('vehicleProfile.apply.writing')}</span>
    </div>
  );
}

interface ToastCardProps {
  toast: NonNullable<ReturnType<typeof useProfileApplyStore.getState>['toast']>;
  onDismiss: () => void;
  onUndo?: () => void;
}

function ToastCard({ toast, onDismiss, onUndo }: ToastCardProps) {
  const { t } = useTranslation('settings');
  const palette = toast.kind === 'success'
    ? { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' }
    : toast.kind === 'error'
    ? { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' }
    : { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' };

  const Icon = palette.icon;

  return (
    <div className={`fixed bottom-5 right-5 max-w-sm z-[90] rounded-xl border shadow-2xl ${palette.bg} ${palette.border}`}>
      <div className="flex items-start gap-3 p-3 pr-10">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${palette.color}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-content">{toast.message}</div>
          {!!toast.rebootRequired && (
            <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-300">
              <RotateCw className="w-3 h-3" />
              {toast.rebootRequired} param{toast.rebootRequired === 1 ? '' : 's'} require reboot to take effect
            </div>
          )}
          {onUndo && (
            <button
              onClick={onUndo}
              className="inline-flex items-center gap-1 mt-2 text-[11px] text-content-secondary hover:text-content"
            >
              <Undo2 className="w-3 h-3" />
              {t('undo')}
            </button>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 p-1 rounded hover:bg-surface-overlay-subtle text-content-secondary hover:text-content"
          title={t('vehicleProfile.apply.dismiss')}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
