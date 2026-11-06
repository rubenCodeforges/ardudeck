import { useEffect, useState, type ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import type { ThemeRegistration } from '@ardudeck/module-sdk';
import { themeRegistry } from '../../modules/module-theme-registry';
import { titleBarRegistry } from '../../modules/title-bar-registry';
import { useNavigationStore } from '../../stores/navigation-store';
import { useModuleStore } from '../../stores/module-store';
import { BRIDGE_MOVED_NOTE_KEY } from '../../stores/settings-store';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { useAnyVehicleArmed } from '../../hooks/useAnyVehicleArmed';

export const BRIDGE_CARGO_SLUG = 'com.ardudeck.bridge';

function Slot({ pick }: { pick: (r: ThemeRegistration) => ComponentType | undefined }) {
  const entries = themeRegistry.useEntries();
  return (
    <>
      {entries.map((e) => {
        const C = pick(e.value);
        return C ? (
          <ErrorBoundary key={`${e.slug}/${e.id}`} label={e.slug} fallback={() => null}>
            <C />
          </ErrorBoundary>
        ) : null;
      })}
    </>
  );
}

// Banners and overlays are decoration: never over a live vehicle.
export function CargoThemeBanners() {
  const armed = useAnyVehicleArmed();
  return armed ? null : <Slot pick={(r) => r.banner} />;
}

export function CargoThemeOverlays() {
  const armed = useAnyVehicleArmed();
  return armed ? null : <Slot pick={(r) => r.overlay} />;
}

export function CargoThemeAboutCards() {
  return <Slot pick={(r) => r.aboutCard} />;
}

export function CargoThemeMapBackground({ component: C, slug }: { component: ComponentType; slug: string }) {
  return (
    <ErrorBoundary label={slug} fallback={() => null}>
      <C />
    </ErrorBoundary>
  );
}

/** Theme CSS targets one view with html[data-view='<id>']. */
export function useViewAttribute(): void {
  const view = useNavigationStore((s) => s.currentView);
  useEffect(() => {
    document.documentElement.dataset.view = view;
  }, [view]);
}

function readNotePending(): boolean {
  try {
    return localStorage.getItem(BRIDGE_MOVED_NOTE_KEY) === 'pending';
  } catch {
    return false;
  }
}

function markNoteDone(): void {
  try {
    localStorage.setItem(BRIDGE_MOVED_NOTE_KEY, 'done');
  } catch {
    // Shown again next launch at worst.
  }
}

/** Once, for a pilot who had Bridge active before it moved into a cargo. */
export function BridgeMovedNote() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(readNotePending);
  if (!open) return null;

  const close = () => {
    markNoteDone();
    setOpen(false);
  };
  const openListing = () => {
    close();
    useNavigationStore.getState().setView('modules');
    void useModuleStore.getState().openDetail(BRIDGE_CARGO_SLUG);
  };

  return (
    <div role="status" className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-subtle bg-surface">
      <span className="text-sm text-content">{t('layout:bridgeMoved.text')}</span>
      <button type="button" onClick={openListing} className="btn btn-primary px-3 py-1 text-sm">
        {t('layout:bridgeMoved.open')}
      </button>
      <button
        type="button"
        onClick={close}
        aria-label={t('common:close')}
        data-tip={t('common:close')}
        className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-raised text-content-secondary hover:text-content"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    </div>
  );
}

/** Cargo items in the top bar's free space; they shrink and clip before the status chips move. Stays while armed. */
export function TitleBarItems() {
  const entries = titleBarRegistry.useEntries();
  const armed = useAnyVehicleArmed();
  if (entries.length === 0) return <div className="flex-1" />;
  const sorted = [...entries].sort((a, b) => (a.value.order ?? 0) - (b.value.order ?? 0));
  return (
    <div className="app-title-items flex-1 min-w-0 flex items-center gap-3 px-4 overflow-hidden">
      {sorted.map((e) => {
        const C = e.value.component;
        return (
          <ErrorBoundary key={`${e.slug}/${e.id}`} label={e.slug} fallback={() => null}>
            <C anyVehicleArmed={armed} />
          </ErrorBoundary>
        );
      })}
    </div>
  );
}
