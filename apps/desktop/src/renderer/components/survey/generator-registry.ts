/**
 * Survey Generator Registry
 *
 * Pluggable registry for survey pattern generators. Built-in generators
 * (grid, crosshatch, etc.) self-register at module load. Hangar
 * modules (e.g. TOPAS Smart Survey) register from their renderer
 * entrypoint via `registerSurveyGenerator`. The mission file stores
 * `generatorId` on each survey group so a mission referencing a not-yet-
 * installed module renders as read-only but its cached WPs remain
 * uploadable.
 *
 * Spec: docs/superpowers/specs/2026-05-28-mission-groups-design.md
 *
 * PR 3 scope: replace the hardcoded switch in `survey-store.runGenerator`
 * with a registry lookup. Generators stay synchronous and accept the
 * existing `SurveyConfig` shape; PR 4 generalizes to async + a richer
 * GeneratorInput once survey groups become first-class.
 */

import type { SurveyConfig, SurveyPattern, SurveyResult } from './survey-types';
import { t } from '../../../shared/i18n/index.js';

/**
 * Map the legacy `SurveyPattern` enum to a registry id. Existing saved
 * configs and presets still set `pattern: 'grid'`; the registry stores
 * `'builtin.grid'`. New consumers (TOPAS, future module-supplied
 * generators) reference registry ids directly.
 */
export function patternToGeneratorId(pattern: SurveyPattern): string {
  return `builtin.${pattern}`;
}

/**
 * Which generator a config runs through. `config.generatorId` (set when the
 * user picks a module-supplied engine) wins over the legacy pattern mapping,
 * but only while that generator is actually registered - if the module is
 * uninstalled mid-session the config falls back to the built-in pattern
 * instead of dead-ending.
 */
export function resolveGeneratorId(config: Pick<SurveyConfig, 'pattern' | 'generatorId'>): string {
  if (config.generatorId && registry.has(config.generatorId)) return config.generatorId;
  return patternToGeneratorId(config.pattern);
}

/**
 * Declarative extra parameter a generator wants the survey panel to render.
 * Values live in `SurveyConfig.engineParams[field.id]` and persist with the
 * group's config, so module UIs stay out of the panel internals.
 */
export type GeneratorConfigField =
  | {
      type: 'number';
      id: string;
      label: string;
      default: number;
      min?: number;
      max?: number;
      step?: number;
      unit?: string;
      description?: string;
    }
  | {
      type: 'boolean';
      id: string;
      label: string;
      default: boolean;
      description?: string;
    }
  | {
      type: 'select';
      id: string;
      label: string;
      default: string;
      options: Array<{ value: string; label: string }>;
      description?: string;
    };

export interface SurveyGeneratorCapabilities {
  /** Generator can take interior boundaries (no-fly zones) inside the ROI. */
  supportsHoles: boolean;
  /** Generator can take a separate workspace polygon (allowed flight area). */
  supportsWorkspace: boolean;
  /** Generator's track width / line spacing requires camera + overlap settings. */
  requiresCamera: boolean;
  /** Generator runs asynchronously (e.g. remote API call). */
  isAsync: boolean;
  /** Generator hits a network resource and is subject to remote failure modes. */
  isRemote: boolean;
}

export interface SurveyGeneratorRegistration {
  /** Stable identifier serialized into mission files. Use reverse-DNS style. */
  id: string;
  /** Semver-ish. Lets future code detect schema migrations on saved groups. */
  version: string;
  displayName: string;
  description: string;
  /** i18n keys for built-ins; module generators supply plain text only. */
  displayNameKey?: string;
  descriptionKey?: string;
  capabilities: SurveyGeneratorCapabilities;
  /**
   * Extra parameters the survey panel renders for this generator (an
   * "Engine parameters" section). Optional; built-ins declare none.
   */
  configFields?: GeneratorConfigField[];
  /**
   * Execute the generator. Sync returns from built-ins are wrapped so callers
   * always `await` regardless of generator implementation. The current
   * `SurveyConfig` shape is preserved for PR 3; PR 4 introduces a richer
   * GeneratorInput once survey groups own the polygon + config.
   */
  generate(config: SurveyConfig): SurveyResult | Promise<SurveyResult>;
}

const registry = new Map<string, SurveyGeneratorRegistration>();

// Registration reactivity: module generators register after first render
// (module load is async), so UI listing generators subscribes here. A plain
// version counter keeps this useSyncExternalStore-compatible.
let registryVersion = 0;
const registryListeners = new Set<() => void>();

function notifyRegistryChanged(): void {
  registryVersion += 1;
  for (const l of registryListeners) l();
}

export function subscribeSurveyGenerators(listener: () => void): () => void {
  registryListeners.add(listener);
  return () => registryListeners.delete(listener);
}

/** Monotonic change counter - the snapshot for useSyncExternalStore. */
export function getSurveyGeneratorsVersion(): number {
  return registryVersion;
}

export function registerSurveyGenerator(reg: SurveyGeneratorRegistration): void {
  if (registry.has(reg.id)) {
    // Re-registering with the same id is allowed (HMR, test reseeds). Newer
    // wins; the registry is module-scoped, not persisted.
  }
  registry.set(reg.id, reg);
  notifyRegistryChanged();
}

export function unregisterSurveyGenerator(id: string): void {
  if (registry.delete(id)) notifyRegistryChanged();
}

export function generatorDisplayName(reg: Pick<SurveyGeneratorRegistration, 'displayName' | 'displayNameKey'>): string {
  return reg.displayNameKey ? t(reg.displayNameKey) : reg.displayName;
}

export function generatorDescription(reg: Pick<SurveyGeneratorRegistration, 'description' | 'descriptionKey'>): string {
  return reg.descriptionKey ? t(reg.descriptionKey) : reg.description;
}

export function getSurveyGenerator(id: string): SurveyGeneratorRegistration | undefined {
  return registry.get(id);
}

export function listSurveyGenerators(): SurveyGeneratorRegistration[] {
  return Array.from(registry.values());
}

/**
 * Reset to a clean registry. Test-only helper. Production code never calls
 * this; the registry rebuilds itself at module load via the built-ins'
 * self-registration block.
 */
export function _resetRegistryForTests(): void {
  registry.clear();
  notifyRegistryChanged();
}
