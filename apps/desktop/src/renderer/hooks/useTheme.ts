import { useEffect, useSyncExternalStore } from 'react';
import type { ThemeRegistration } from '@ardudeck/module-sdk';
import { useSettingsStore } from '../stores/settings-store';
import {
  findCargoTheme,
  resolveCargoTheme,
  themeRegistry,
  writeCachedCargoTheme,
} from '../modules/module-theme-registry';
import type { SlugEntry } from '../modules/slug-registry';

const STYLE_ID = 'ardudeck-cargo-theme';

/**
 * Applies the correct theme class to <html> based on the user's preference.
 * - 'dark' (default): no class added (CSS variables in :root are dark)
 * - 'light': adds .light class which overrides CSS variables
 * - 'system': follows OS prefers-color-scheme, adds .light when OS is light
 * - 'cargo:<slug>/<id>': a cargo theme, its base class plus its own class and stylesheet
 *
 * Call this once per window root (AppShell, detached and surface windows).
 */
export function useTheme(): void {
  const theme = useSettingsStore((s) => s.theme);
  const entries = themeRegistry.useEntries();

  useEffect(() => {
    const root = document.documentElement;
    const cargo = resolveCargoTheme(theme, entries);
    const previous = root.dataset.cargoTheme;
    if (previous && previous !== cargo?.className) root.classList.remove(previous);

    let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
    if (cargo) {
      if (!style) {
        style = document.createElement('style');
        style.id = STYLE_ID;
        document.head.appendChild(style);
      }
      if (style.textContent !== cargo.css) style.textContent = cargo.css;
      root.classList.add(cargo.className);
      root.dataset.cargoTheme = cargo.className;
      const live = findCargoTheme(theme, entries);
      if (live) writeCachedCargoTheme(live);
    } else {
      style?.remove();
      delete root.dataset.cargoTheme;
    }

    function apply(resolved: 'dark' | 'light') {
      if (resolved === 'light') root.classList.add('light');
      else root.classList.remove('light');
    }

    if (cargo) {
      apply(cargo.base);
      return;
    }
    if (theme === 'light') {
      apply('light');
      return;
    }
    if (theme !== 'system') {
      // dark, or a cargo theme whose cargo has not loaded and left no cached copy
      apply('dark');
      return;
    }

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mq.matches ? 'dark' : 'light');

    function onChange(e: MediaQueryListEvent) {
      apply(e.matches ? 'dark' : 'light');
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme, entries]);
}

const mq = window.matchMedia('(prefers-color-scheme: dark)');
function subscribeOS(cb: () => void) {
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}
function getOSDark() {
  return mq.matches;
}

/** Returns the currently active theme ('dark' | 'light'). */
export function useResolvedTheme(): 'dark' | 'light' {
  const pref = useSettingsStore((s) => s.theme);
  const entries = themeRegistry.useEntries();
  const osDark = useSyncExternalStore(subscribeOS, getOSDark);
  // Callers ask this to pick between a dark and a light asset; a cargo theme answers with its base.
  const cargo = resolveCargoTheme(pref, entries);
  if (cargo) return cargo.base;
  if (pref === 'light') return 'light';
  if (pref === 'system') return osDark ? 'dark' : 'light';
  return 'dark';
}

/** The live registration of the active cargo theme, or undefined on a built-in theme. */
export function useActiveCargoTheme(): SlugEntry<ThemeRegistration> | undefined {
  const pref = useSettingsStore((s) => s.theme);
  const entries = themeRegistry.useEntries();
  return findCargoTheme(pref, entries);
}

/** The active theme's accent palette, for colours that land inline. */
export function useThemePalette(): string[] | undefined {
  const pref = useSettingsStore((s) => s.theme);
  const entries = themeRegistry.useEntries();
  return resolveCargoTheme(pref, entries)?.palette;
}
