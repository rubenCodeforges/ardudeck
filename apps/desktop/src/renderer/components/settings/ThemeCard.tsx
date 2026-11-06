import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore, type ThemePreference } from '../../stores/settings-store';
import { cargoThemeKey, themeRegistry } from '../../modules/module-theme-registry';
import { cargoNamespace } from '../../modules/slug-registry';
import { useActiveCargoTheme } from '../../hooks/useTheme';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { ui } from '../ui/ui-hooks';

const BUILT_IN: { value: ThemePreference; labelKey: string }[] = [
  { value: 'system', labelKey: 'navigation:navigationRail.themeSystem' },
  { value: 'dark', labelKey: 'navigation:navigationRail.themeDark' },
  { value: 'light', labelKey: 'navigation:navigationRail.themeLight' },
];

/** System, Dark, Light, then every theme a loaded cargo registered, in registration order. One list for the rail and Settings. */
export function useThemeOptions(): { value: ThemePreference; label: string }[] {
  const { t } = useTranslation();
  const cargo = themeRegistry.useEntries();
  return [
    ...BUILT_IN.map((o) => ({ value: o.value, label: t(o.labelKey) })),
    ...cargo.map((e) => ({ value: cargoThemeKey(e.slug, e.id), label: t(`${cargoNamespace(e.slug)}:${e.value.label}`) })),
  ];
}

export function ThemeCard() {
  const { t } = useTranslation();
  const theme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const options = useThemeOptions();
  const active = useActiveCargoTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const description = active?.value.description ? t(`${cargoNamespace(active.slug)}:${active.value.description}`) : t('settings:themeHint');
  const Settings = active?.value.settings;
  const activeLabel = options.find((o) => o.value === theme)?.label ?? '';

  return (
    <div className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-4 mb-4">
      <div className="flex items-center gap-3 mb-4">
        <Palette className="w-4 h-4 text-amber-400" aria-hidden="true" />
        <div className="text-sm font-medium text-content">{t('settings:themeTitle')}</div>
      </div>
      <div className="flex items-start gap-3 flex-wrap">
        <label className="block max-w-sm flex-1 min-w-[16rem] space-y-1.5">
          <select
            value={options.some((o) => o.value === theme) ? theme : 'dark'}
            onChange={(event) => setTheme(event.target.value as ThemePreference)}
            className="w-full bg-surface-input border border-border rounded-lg px-3 py-2 text-sm text-content focus:outline-none focus:border-blue-500/50"
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <span className="block text-xs text-content-secondary">{description}</span>
        </label>
        {Settings && (
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="btn btn-secondary flex items-center gap-2 px-3 py-2 text-sm"
          >
            <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
            {t('settings:themeSettings')}
          </button>
        )}
      </div>
      {Settings && settingsOpen && active && (
        <ThemeSettingsDialog title={t('settings:themeSettingsTitle', { name: activeLabel })} label={active.slug} onClose={() => setSettingsOpen(false)}>
          <Settings />
        </ThemeSettingsDialog>
      )}
    </div>
  );
}

function ThemeSettingsDialog({ title, label, onClose, children }: { title: string; label: string; onClose: () => void; children: React.ReactNode }) {
  const { t } = useTranslation();
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface-solid rounded-2xl border border-subtle shadow-2xl overflow-hidden flex flex-col max-h-[88vh] w-full"
        style={{ maxWidth: 480 }}
      >
        <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-subtle">
          <div className="text-sm font-semibold text-content truncate">{title}</div>
          <button
            {...ui('icon-button')}
            type="button"
            onClick={onClose}
            data-tip={t('common:close')}
            aria-label={t('common:close')}
            className="ml-auto w-7 h-7 rounded-lg flex items-center justify-center hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <ErrorBoundary label={label}>{children}</ErrorBoundary>
        </div>
      </div>
    </div>,
    document.body,
  );
}
