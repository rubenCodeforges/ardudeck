import { useMemo } from 'react';
import type { ViewId } from '../stores/navigation-store';
import { useModuleStore } from '../stores/module-store';
import type { InstalledModule } from '../../shared/module-types';

/**
 * Built-in features gated behind Hangar cargo.
 *
 * Anything NOT listed here is always available. To put an existing built-in
 * feature behind a cargo, add one entry mapping the cargo slug to what it
 * gates - a whole view, individual HUD widgets, and/or text-OSD elements.
 * NavigationRail, the deep-link handler, the HUD renderers and the OSD
 * element browser all consult this map; no other code change is needed.
 *
 * A gated feature shows only while its cargo is installed AND not toggled
 * off, so the Cargo Bay enable/disable switch governs built-ins too.
 */
export interface Capability {
  /** Hangar cargo slug that enables the features below. */
  slug: string;
  /** A built-in view this cargo gates. */
  viewId?: ViewId;
  /** Built-in fighter-HUD widget ids (see hud-config HUD_WIDGETS). */
  hudWidgets?: string[];
  /** Built-in text-OSD element ids (see osd element-registry). */
  osdElements?: string[];
}

/** Cargo slug that enables the entire Fleet Vault surface. */
export const VAULT_CARGO_SLUG = 'com.ardudeck.vault';
/** Cargo slug that enables the Pre-Flight Weather Briefing surface. */
export const WEATHER_CARGO_SLUG = 'com.ardudeck.weather';

/**
 * Whether the Pre-Flight Weather Briefing view is reachable. Gated on its cargo:
 * the view and its settings-card "View in detail" entry appear only while the
 * Weather Briefing cargo is installed and not toggled off.
 */
export function isWeatherBriefingAvailable(): boolean {
  return isCargoEnabled(WEATHER_CARGO_SLUG);
}
/** Cargo slug that enables the Mission Library surface. */
export const MISSION_LIBRARY_CARGO_SLUG = 'com.ardudeck.mission-library';
/** Cargo slug that enables the Lua Graph Editor view. */
export const LUA_GRAPH_CARGO_SLUG = 'com.ardudeck.lua-graph';
// Public API-key Claude Advisor cargo. Enables both the live advisor panel and
// the AI flight-log analysis surfaces. Note the slug is `ardudeck.advisor`, NOT
// the `com.ardudeck.*` convention used by the other cargo above.
export const ADVISOR_CARGO_SLUG = 'ardudeck.advisor';

/**
 * Slug of the ArduDeck Trainer, which is an APP rather than a cargo: a separate native program,
 * one binary per platform, that this app launches instead of loading.
 *
 * So its rail entry is NOT gated through CAPABILITIES below. Those ask whether a cargo is
 * installed and enabled, and the Trainer can legitimately be present without the Hangar ever
 * having installed it - somebody downloads it from the website, or runs a dev checkout. The
 * honest test is the locator's, and `TrainerStatus.available` is what the rail reads.
 *
 * Must match `TRAINER_APP_SLUG` in `main/trainer/trainer-locator.ts`.
 */
export const TRAINER_APP_SLUG = 'com.ardudeck.trainer';

export const CAPABILITIES: Capability[] = [
  // Example (not active): { slug: 'com.ardudeck.area-editor', viewId: 'mission' },
  // Fleet Vault: nav view plus every vault surface embedded in other screens
  // (sync badges, auto-backup chips) - those consult useCargoEnabled directly.
  { slug: VAULT_CARGO_SLUG, viewId: 'vault' },
  // Mission Library: nav view plus the "Save to Library" entry in the mission
  // toolbar's save menu (gated via useCargoEnabled in MissionToolbar).
  { slug: MISSION_LIBRARY_CARGO_SLUG, viewId: 'library' },
  // Pre-Flight Weather Briefing: nav view plus the "View in detail" button on
  // the Vehicle & Status weather card (gated via isWeatherBriefingAvailable).
  { slug: WEATHER_CARGO_SLUG, viewId: 'weather' },
  // Lua Graph Editor: one self-contained view, nothing embedded elsewhere.
  { slug: LUA_GRAPH_CARGO_SLUG, viewId: 'lua-graph' },
];

/**
 * Views a cargo brings entirely itself: the body is the cargo's, the host only
 * adds the rail entry while a cargo holding the permission has registered it.
 * Nothing built-in is unlocked, so these load from a dev folder like any cargo.
 */
export const CARGO_VIEWS: Readonly<Partial<Record<ViewId, string>>> = {
  production: 'production',
};

const GATED_VIEWS: ReadonlyMap<ViewId, string> = new Map(
  CAPABILITIES.filter((c) => c.viewId).map((c): [ViewId, string] => [c.viewId!, c.slug]),
);

/** True if `viewId` is available given the set of enabled activatable slugs. */
/** The cargo slug that unlocks a nav view, if any. */
export function viewOwnerSlug(viewId: string): string | undefined {
  return GATED_VIEWS.get(viewId as ViewId);
}

export function isViewAvailable(viewId: ViewId, enabledSlugs: ReadonlySet<string>): boolean {
  const requiredSlug = GATED_VIEWS.get(viewId);
  return !requiredSlug || enabledSlugs.has(requiredSlug);
}

function usable(m: InstalledModule): boolean {
  return m.enabled !== false && m.entitled !== false;
}

/** Reactive: true when the given cargo is installed and not toggled off. */
export function useCargoEnabled(slug: string): boolean {
  const modules = useModuleStore((s) => s.modules);
  return useMemo(
    () => modules.some((m) => m.slug === slug && usable(m)),
    [modules, slug],
  );
}

/** Non-hook variant for imperative call sites (event handlers, stores). */
export function isCargoEnabled(slug: string): boolean {
  return useModuleStore.getState().modules.some((m) => m.slug === slug && usable(m));
}

/** Ids from the chosen Capability field whose gating cargo is missing or off. */
function useGatedOffIds(field: 'hudWidgets' | 'osdElements'): ReadonlySet<string> {
  const modules = useModuleStore((s) => s.modules);
  return useMemo(() => {
    const off = new Set<string>();
    for (const cap of CAPABILITIES) {
      const ids = cap[field];
      if (!ids?.length) continue;
      const enabled = modules.some((m) => m.slug === cap.slug && usable(m));
      if (!enabled) for (const id of ids) off.add(id);
    }
    return off;
  }, [modules, field]);
}

/** Reactive: built-in HUD widget ids to hide (their gating cargo is off/absent). */
export function useGatedOffHudWidgets(): ReadonlySet<string> {
  return useGatedOffIds('hudWidgets');
}

/** Reactive: built-in text-OSD element ids to hide (their gating cargo is off/absent). */
export function useGatedOffOsdElements(): ReadonlySet<string> {
  return useGatedOffIds('osdElements');
}

/**
 * Reactive set of module slugs currently enabled on this device. A slug only
 * has gating power when it appears in CAPABILITIES, so including installable
 * (bundle-shipping) cargo alongside activatable cargo is harmless and lets a
 * bundle cargo gate built-in surfaces too (the Fleet Vault pattern).
 */
export function useEnabledCapabilitySlugs(): ReadonlySet<string> {
  const modules = useModuleStore((s) => s.modules);
  return useMemo(
    () => new Set(modules.filter(usable).map((m) => m.slug)),
    [modules],
  );
}
