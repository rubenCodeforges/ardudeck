// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ThemeRegistration } from '@ardudeck/module-sdk';
import {
  cargoThemeKey,
  clearCachedCargoTheme,
  parseCargoThemeKey,
  resolveCargoTheme,
  settleCargoTheme,
  themedTrackColour,
  themeRegistry,
  UNLOAD_GRACE_MS,
  writeCachedCargoTheme,
} from '../module-theme-registry';
import { migrateThemePreference, useSettingsStore, BRIDGE_MOVED_NOTE_KEY } from '../../stores/settings-store';

const SLUG = 'com.ardudeck.bridge';
const THEME: ThemeRegistration = { id: 'bridge', label: 'theme.bridge', base: 'dark', className: 'bridge', css: '.bridge { --bg-base: #000; }', palette: ['#f5a524', '#7dd3fc'] };

beforeEach(() => {
  themeRegistry.unregisterAll(SLUG);
  clearCachedCargoTheme();
  localStorage.clear();
  useSettingsStore.setState({ theme: 'dark' });
});

describe('cargo theme keys', () => {
  it('round-trips slug and id, and rejects built-ins and malformed keys', () => {
    const key = cargoThemeKey(SLUG, 'bridge');
    expect(key).toBe('cargo:com.ardudeck.bridge/bridge');
    expect(parseCargoThemeKey(key)).toEqual({ slug: SLUG, id: 'bridge' });
    expect(parseCargoThemeKey('dark')).toBeNull();
    expect(parseCargoThemeKey('cargo:noid')).toBeNull();
    expect(parseCargoThemeKey('cargo:slug/')).toBeNull();
  });
});

describe('resolveCargoTheme', () => {
  it('prefers the live registration', () => {
    themeRegistry.register(SLUG, 'bridge', THEME);
    expect(resolveCargoTheme(cargoThemeKey(SLUG, 'bridge'))?.css).toBe(THEME.css);
  });

  it('paints the cached copy while the cargo has not loaded yet, but only for the same key', () => {
    themeRegistry.register(SLUG, 'bridge', THEME);
    writeCachedCargoTheme(themeRegistry.list()[0]!);
    themeRegistry.unregisterAll(SLUG);
    expect(resolveCargoTheme(cargoThemeKey(SLUG, 'bridge'))?.className).toBe('bridge');
    expect(resolveCargoTheme(cargoThemeKey('other.cargo', 'x'))).toBeNull();
    expect(resolveCargoTheme('dark')).toBeNull();
  });
});

describe('settleCargoTheme', () => {
  it('falls back to dark and drops the cache when the cargo is gone', () => {
    themeRegistry.register(SLUG, 'bridge', THEME);
    writeCachedCargoTheme(themeRegistry.list()[0]!);
    themeRegistry.unregisterAll(SLUG);
    useSettingsStore.setState({ theme: cargoThemeKey(SLUG, 'bridge') });
    settleCargoTheme();
    expect(useSettingsStore.getState().theme).toBe('dark');
    expect(resolveCargoTheme(cargoThemeKey(SLUG, 'bridge'))).toBeNull();
  });

  it('keeps a theme whose cargo loaded, and catches a late settings hydration', () => {
    themeRegistry.register(SLUG, 'bridge', THEME);
    useSettingsStore.setState({ theme: cargoThemeKey(SLUG, 'bridge') });
    settleCargoTheme();
    expect(useSettingsStore.getState().theme).toBe(cargoThemeKey(SLUG, 'bridge'));
    useSettingsStore.setState({ theme: cargoThemeKey('gone.cargo', 'x') });
    expect(useSettingsStore.getState().theme).toBe('dark');
  });
});

describe('cargo unloaded while its theme is on', () => {
  it('falls back to dark after the grace period, but survives a reload inside it', () => {
    vi.useFakeTimers();
    try {
      themeRegistry.register(SLUG, 'bridge', THEME);
      useSettingsStore.setState({ theme: cargoThemeKey(SLUG, 'bridge') });
      settleCargoTheme();

      themeRegistry.unregisterAll(SLUG);
      vi.advanceTimersByTime(UNLOAD_GRACE_MS / 2);
      themeRegistry.register(SLUG, 'bridge', THEME);
      vi.advanceTimersByTime(UNLOAD_GRACE_MS);
      expect(useSettingsStore.getState().theme).toBe(cargoThemeKey(SLUG, 'bridge'));

      themeRegistry.unregisterAll(SLUG);
      vi.advanceTimersByTime(UNLOAD_GRACE_MS - 1);
      expect(useSettingsStore.getState().theme).toBe(cargoThemeKey(SLUG, 'bridge'));
      vi.advanceTimersByTime(1);
      expect(useSettingsStore.getState().theme).toBe('dark');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('themedTrackColour', () => {
  it('passes colours through on a built-in theme', () => {
    expect(themedTrackColour('#3B82F6', undefined, 2)).toBe('#3B82F6');
  });
  it('maps indexed tracks onto the palette and keeps semantic colours', () => {
    expect(themedTrackColour('#3B82F6', THEME.palette, 1)).toBe('#7dd3fc');
    expect(themedTrackColour('#3B82F6', THEME.palette, 2)).toBe('#f5a524');
    expect(themedTrackColour('#10B981', THEME.palette)).toBe('#10B981');
    expect(themedTrackColour('#3B82F6', THEME.palette)).toBe('#f5a524');
  });
});

describe('migrateThemePreference', () => {
  it('moves a Bridge pilot to dark once and queues the note', () => {
    expect(migrateThemePreference('bridge')).toBe('dark');
    expect(localStorage.getItem(BRIDGE_MOVED_NOTE_KEY)).toBe('pending');
  });
  it('does not queue the note again after it was shown', () => {
    localStorage.setItem(BRIDGE_MOVED_NOTE_KEY, 'done');
    expect(migrateThemePreference('bridge')).toBe('dark');
    expect(localStorage.getItem(BRIDGE_MOVED_NOTE_KEY)).toBe('done');
  });
  it('keeps built-in and cargo themes, and defaults junk to dark', () => {
    expect(migrateThemePreference('light')).toBe('light');
    expect(migrateThemePreference('system')).toBe('system');
    expect(migrateThemePreference('cargo:a.b/c')).toBe('cargo:a.b/c');
    expect(migrateThemePreference(undefined)).toBe('dark');
    expect(migrateThemePreference(42)).toBe('dark');
  });
});
