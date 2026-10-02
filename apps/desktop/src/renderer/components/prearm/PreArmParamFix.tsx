import { useCallback } from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParameterStore } from '../../stores/parameter-store';
import { useNavigationStore, isViewId } from '../../stores/navigation-store';
import type { PreArmFix, PreArmLink } from '../../../shared/prearm-checks';

/** Opens the parameter in the Parameters view, which has the full editor. */
function ParamLink({ paramId }: { paramId: string }) {
  const { t } = useTranslation();
  const param = useParameterStore((s) => s.parameters.get(paramId));
  const open = useCallback(() => {
    useNavigationStore.getState().setView('parameters', paramId);
  }, [paramId]);

  return (
    <button
      type="button"
      onClick={open}
      className="group w-full flex items-center gap-2 px-2 py-1 rounded bg-surface-raised/50 hover:bg-surface-raised border border-subtle text-left transition-colors"
      title={t('prearm:preArmParamFix.openParamTitle', { paramId })}
    >
      <span className="text-[10px] font-mono text-content truncate">{paramId}</span>
      {param && <span className="text-[10px] font-mono text-content-secondary shrink-0">= {param.value}</span>}
      <span className="ml-auto text-[10px] text-blue-400 group-hover:text-blue-300 whitespace-nowrap shrink-0">{t('prearm:preArmParamFix.openInParameters')}</span>
    </button>
  );
}

function FixLink({ link }: { link: PreArmLink }) {
  const { to } = link;
  const go = () => {
    if (to.kind === 'external') void window.electronAPI?.openExternal(to.url);
    else if (isViewId(to.view)) useNavigationStore.getState().setView(to.view, to.target);
  };
  return (
    <button
      type="button"
      onClick={go}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded bg-blue-600/15 hover:bg-blue-600/25 border border-blue-500/30 text-left text-[11px] font-medium text-blue-300 transition-colors"
    >
      <span className="flex-1 truncate">{link.label}</span>
      {to.kind === 'external' ? <ExternalLink className="w-3 h-3 shrink-0" /> : <ArrowRight className="w-3 h-3 shrink-0" />}
    </button>
  );
}

/** Inline pre-arm fix: what is wrong, and where in the app it gets fixed. Never a check bypass. */
export function PreArmParamFix({ fix }: { fix: PreArmFix }) {
  const links = fix.links ?? [];
  const params = fix.params ?? [];
  return (
    <div className="px-3 py-2 bg-surface border-t border-subtle space-y-2">
      <div className="text-[11px] text-content">{fix.hint}</div>
      {links.length > 0 && (
        <div className="space-y-1">
          {links.map((l) => <FixLink key={l.label} link={l} />)}
        </div>
      )}
      {params.length > 0 && (
        <div className="space-y-1">
          {params.map((id) => <ParamLink key={id} paramId={id} />)}
        </div>
      )}
    </div>
  );
}
