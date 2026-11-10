// Cached copy: painted while the cargo loads and in detached windows, which run no cargo code.

import type { ThemeRegistration } from '@ardudeck/module-sdk';
import { createSlugRegistry, type SlugEntry } from './slug-registry';
import { useSettingsStore, type CargoThemeKey, type ThemePreference } from '../stores/settings-store';

export const themeRegistry = createSlugRegistry<ThemeRegistration>();

export function cargoThemeKey(slug: string, id: string): CargoThemeKey {
  return `cargo:${slug}/${id}`;
}

export function parseCargoThemeKey(pref: ThemePreference): { slug: string; id: string } | null {
  if (!pref.startsWith('cargo:')) return null;
  const rest = pref.slice('cargo:'.length);
  const cut = rest.lastIndexOf('/');
  if (cut <= 0 || cut === rest.length - 1) return null;
  return { slug: rest.slice(0, cut), id: rest.slice(cut + 1) };
}

export function findCargoTheme(pref: ThemePreference, entries = themeRegistry.list()): SlugEntry<ThemeRegistration> | undefined {
  const key = parseCargoThemeKey(pref);
  if (!key) return undefined;
  return entries.find((e) => e.slug === key.slug && e.id === key.id);
}

/** Only what a window without the cargo needs to paint it. */
export interface CachedCargoTheme {
  key: CargoThemeKey;
  className: string;
  base: 'dark' | 'light';
  css: string;
  palette?: string[];
}

const CACHE_KEY = 'ardudeck.theme.cargo-cache';

export function readCachedCargoTheme(): CachedCargoTheme | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedCargoTheme;
    return typeof parsed?.key === 'string' && typeof parsed.className === 'string' && typeof parsed.css === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedCargoTheme(entry: SlugEntry<ThemeRegistration>): void {
  const value: CachedCargoTheme = {
    key: cargoThemeKey(entry.slug, entry.id),
    className: entry.value.className,
    base: entry.value.base,
    css: entry.value.css,
    palette: entry.value.palette,
  };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Harmless: the next start paints dark until the cargo has loaded.
  }
}

export function clearCachedCargoTheme(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // Nothing to clear.
  }
}

/** What useTheme paints for a cargo preference: the live registration, else the cached copy. */
export function resolveCargoTheme(pref: ThemePreference, entries = themeRegistry.list()): CachedCargoTheme | null {
  const live = findCargoTheme(pref, entries);
  if (live) {
    return { key: cargoThemeKey(live.slug, live.id), className: live.value.className, base: live.value.base, css: live.value.css, palette: live.value.palette };
  }
  const cached = readCachedCargoTheme();
  return cached && cached.key === pref ? cached : null;
}

const SEMANTIC = new Set(['#10b981', '#ef4444', '#f59e0b']);

/** Theme CSS cannot reach an inline hex. Semantic colours keep their meaning. */
export function themedTrackColour(color: string, palette: string[] | undefined, index?: number): string {
  if (!palette?.length) return color;
  if (index !== undefined) return palette[index % palette.length]!;
  return SEMANTIC.has(color.toLowerCase()) ? color : palette[0]!;
}

function fallBackIfOrphaned(): void {
  const settings = useSettingsStore.getState();
  if (!parseCargoThemeKey(settings.theme)) return;
  if (findCargoTheme(settings.theme)) return;
  clearCachedCargoTheme();
  settings.setTheme('dark');
}

let settled = false;
let graceTimer: ReturnType<typeof setTimeout> | null = null;
/** A cargo reload unregisters and registers again; only a theme still missing after this falls back. */
export const UNLOAD_GRACE_MS = 3000;

/** After every cargo has loaded: a theme whose cargo is gone (uninstalled, disabled) falls back to dark. */
export function settleCargoTheme(): void {
  fallBackIfOrphaned();
  if (settled) return;
  settled = true;
  // Settings may hydrate after the cargos have loaded.
  useSettingsStore.subscribe((s, prev) => {
    if (s.theme !== prev.theme) fallBackIfOrphaned();
  });
  // A cargo unloaded while its theme is on.
  themeRegistry.subscribe(() => {
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = setTimeout(() => {
      graceTimer = null;
      fallBackIfOrphaned();
    }, UNLOAD_GRACE_MS);
  });
}
