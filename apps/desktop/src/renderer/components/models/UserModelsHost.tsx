import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, XCircle, X, Move } from 'lucide-react';
import { ui } from '../ui/ui-hooks';
import { useUserModelsStore } from '../../stores/user-models-store';
import { UserModelsDialog } from './UserModelsDialog';
import { summarizeImport } from './user-models-helpers';

/** The 3D models dialog, the import result toast and the map-adjust bar, mounted once. */
export function UserModelsHost(): JSX.Element {
  return (
    <>
      <UserModelsDialog />
      <ImportToast />
      <AdjustBar />
    </>
  );
}

function ImportToast(): JSX.Element | null {
  const { t } = useTranslation();
  const lastImport = useUserModelsStore((s) => s.lastImport);
  const seq = useUserModelsStore((s) => s.importSeq);
  const dialogOpen = useUserModelsStore((s) => s.dialogOpen);
  const [shownSeq, setShownSeq] = useState(0);

  useEffect(() => {
    if (!lastImport || seq === 0) return;
    setShownSeq(seq);
    const s = summarizeImport(lastImport);
    const timer = setTimeout(() => setShownSeq((cur) => (cur === seq ? 0 : cur)), s.tone === 'success' ? 4000 : 9000);
    return () => clearTimeout(timer);
  }, [lastImport, seq]);

  if (!lastImport || shownSeq !== seq || dialogOpen) return null;
  const s = summarizeImport(lastImport);
  const open = (focusId: string | null) => { setShownSeq(0); useUserModelsStore.getState().openDialog(focusId); };

  const tone = s.tone === 'success'
    ? 'bg-emerald-900/90 border-emerald-500/50 text-emerald-200'
    : s.tone === 'warning'
      ? 'bg-amber-900/90 border-amber-500/50 text-amber-100'
      : 'bg-red-900/90 border-red-500/50 text-red-200';

  return createPortal(
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[2100]">
      <div className={`app-toast flex items-center gap-2.5 pl-3 pr-1.5 py-2 rounded-lg border shadow-lg backdrop-blur-sm text-sm ${tone}`}>
        {s.tone === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : s.tone === 'warning' ? <AlertTriangle className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
        <span className="font-medium">
          {s.imported > 0 && t('models:toast.imported', { count: s.imported })}
          {s.imported > 0 && s.failed > 0 && ', '}
          {s.failed > 0 && t('models:toast.failed', { count: s.failed })}
          {(s.imported > 0 || s.failed > 0) && s.warnings > 0 && ', '}
          {s.warnings > 0 && t('models:toast.warnings', { count: s.warnings })}
        </span>
        {s.needsPlacement > 0 && (
          <button
            {...ui('button', { variant: 'secondary' })}
            onClick={() => open(s.focusId)}
            className="px-2 py-0.5 rounded text-xs font-medium bg-white/15 hover:bg-white/25"
          >
            {t('models:toast.needsPlacement', { count: s.needsPlacement })}
          </button>
        )}
        {(s.failed > 0 || s.warnings > 0) && (
          <button
            {...ui('button', { variant: 'ghost' })}
            onClick={() => open(null)}
            className="px-2 py-0.5 rounded text-xs underline-offset-2 hover:underline"
          >
            {t('models:toast.details')}
          </button>
        )}
        <button
          {...ui('icon-button')}
          onClick={() => setShownSeq(0)}
          data-tip={t('common:close')}
          className="w-6 h-6 rounded flex items-center justify-center opacity-70 hover:opacity-100"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

function AdjustBar(): JSX.Element | null {
  const { t } = useTranslation();
  const adjustId = useUserModelsStore((s) => s.adjustId);
  const model = useUserModelsStore((s) => s.models.find((m) => m.id === s.adjustId));
  if (!adjustId || !model) return null;
  const done = () => useUserModelsStore.getState().setAdjust(null);
  return createPortal(
    <div className="fixed top-14 left-1/2 -translate-x-1/2 z-[2100]">
      <div className="flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-lg border border-teal-500/50 bg-gray-900/90 shadow-lg backdrop-blur-sm text-xs text-gray-100">
        <Move className="w-3.5 h-3.5 text-teal-400 shrink-0" />
        <span>{t('models:adjust.hint', { name: model.name })}</span>
        <button
          {...ui('button', { variant: 'secondary' })}
          onClick={() => useUserModelsStore.getState().openDialog(model.id)}
          className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20"
        >
          {t('models:adjust.edit')}
        </button>
        <button
          {...ui('button', { variant: 'primary' })}
          onClick={done}
          className="px-2 py-0.5 rounded bg-teal-600 hover:bg-teal-500 text-white font-medium"
        >
          {t('models:adjust.done')}
        </button>
      </div>
    </div>,
    document.body,
  );
}
