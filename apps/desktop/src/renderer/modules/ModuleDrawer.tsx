import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Box, ChevronLeft, X } from 'lucide-react';
import { listModulePanels, subscribeModulePanels } from './module-panel-registry';
import { closeDrawer, openDrawer, resizeDrawer, useDrawer } from './module-drawer';
import { ResizeHandle } from '../components/ui/ResizeHandle';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

/** Cargo panels with size 'drawer' (e.g. Claude Advisor) as a resizable right column that pushes the content aside. */
export function ModuleDrawer() {
  const { t } = useTranslation();
  const panels = useSyncExternalStore(subscribeModulePanels, listModulePanels);
  const { openKey, lastKey, width } = useDrawer();
  const keyOf = (p: { slug: string; id: string }) => `${p.slug}:${p.id}`;
  const open = panels.find((p) => p.size === 'drawer' && keyOf(p) === openKey) ?? null;
  const last = panels.find((p) => p.size === 'drawer' && keyOf(p) === lastKey) ?? null;

  if (!open) {
    // The last drawer stays one click away as a tab on the right edge
    if (!last) return null;
    return (
      <button
        onClick={() => openDrawer(keyOf(last))}
        className="flex w-7 shrink-0 flex-col items-center gap-2 border-l border-subtle bg-surface py-3 text-content-secondary transition-colors hover:bg-surface-raised hover:text-content"
        data-tip={t('modules:moduleDrawer.open', { title: last.title })}
      >
        <ChevronLeft className="h-4 w-4" />
        <span className="text-[11px] font-medium [writing-mode:vertical-rl]">{last.title}</span>
      </button>
    );
  }

  const Body = open.component;
  return (
    <>
      <ResizeHandle onDrag={(dx) => resizeDrawer(width - dx)} title={t('modules:moduleDrawer.resize')} />
      <aside data-dock-avoid className="flex shrink-0 flex-col border-l border-subtle bg-surface" style={{ width }}>
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-subtle px-3">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-blue-500/10 text-blue-500">
            <Box className="h-3.5 w-3.5" />
          </span>
          <span className="flex-1 truncate text-sm font-semibold text-content">{open.title}</span>
          <button
            onClick={closeDrawer}
            className="rounded-md p-1 text-content-secondary transition-colors hover:bg-surface-raised hover:text-content"
            aria-label={t('common:close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <ErrorBoundary label={open.slug} fallback={() => null}>
            <Body />
          </ErrorBoundary>
        </div>
      </aside>
    </>
  );
}
