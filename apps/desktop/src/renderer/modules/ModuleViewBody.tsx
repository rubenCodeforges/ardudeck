import { useTranslation } from 'react-i18next';
import { viewBodyRegistry } from './module-extension-registries';
import { ErrorBoundary } from '../components/ui/ErrorBoundary';

/** Renders the body a cargo registered for this nav view (host.views). */
export function ModuleViewBody({ viewId }: { viewId: string }) {
  const { t } = useTranslation();
  const entry = viewBodyRegistry.useEntries().find((e) => e.id === viewId);
  if (!entry) {
    // The rail only shows this view when its cargo is enabled, so an older cargo build is the cause
    return (
      <div className="h-full flex items-center justify-center bg-surface-base text-xs text-content-secondary">
        {t('modules:moduleHost.viewNeedsUpdate')}
      </div>
    );
  }
  const Body = entry.value;
  return (
    <ErrorBoundary label={entry.slug}>
      <Body />
    </ErrorBoundary>
  );
}
