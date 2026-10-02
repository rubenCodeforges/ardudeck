import type { StepType } from '@reactour/tour';
import type { ViewId } from '../stores/navigation-store';
import type { PanelId } from '../components/panels';

/**
 * Extends reactour's StepType with an optional runtime predicate.
 * Steps whose predicate returns false are filtered out before the tour starts
 * (used for conditional features like region-specific overlays).
 */
export type FeatureTourStep = StepType & {
  predicate?: () => boolean;
  /** Runs when the step becomes current, to bring its anchor on screen (e.g. open a dialog). */
  setup?: () => void;
};

export type FeatureTourSitlKind = 'ardupilot' | 'inav';

export interface FeatureTourDemo {
  sitl: FeatureTourSitlKind;
  /** Vehicle type to boot, e.g. 'copter', 'plane'. Passed through to the matching SITL store. */
  vehicleType?: string;
}

export interface FeatureTourRequirements {
  /** If true, the tour only makes sense with a live FC/SITL connection. */
  connection?: boolean;
  /**
   * Dockview panels this tour highlights. If any are missing from the current
   * layout, the user is prompted to switch to `preset` (or the default).
   * Only meaningful on views that expose a TelemetryLayoutBridge (currently telemetry).
   */
  panels?: PanelId[];
  /**
   * Preset layout to offer when `panels` can't be resolved in the current layout.
   * Must match a `PresetLayoutKey` in the consuming view (e.g. 'pilotView').
   */
  preset?: string;
  /** Human-friendly label for the preset (falls back to the key). */
  presetLabel?: string;
}

export interface FeatureTour {
  id: string;
  view: ViewId;
  version: string;
  /** i18n key, translated where rendered. */
  titleKey: string;
  /** i18n key, translated where rendered. */
  blurbKey: string;
  steps: FeatureTourStep[];
  requires?: FeatureTourRequirements;
  demo?: FeatureTourDemo;
  /**
   * Optional gate evaluated before the tour is ever offered. When it returns
   * false the tour is not prompted (and its prompt is never scheduled). Use for
   * tours that only apply to specific hardware/state, e.g. the QuadPlane
   * VTOL/fixed-wing tuning switch which only exists when both controller sets
   * are present. Distinct from step-level `predicate`, which only filters
   * individual steps after a tour has already started.
   */
  predicate?: () => boolean;
  /** Runs when the tour closes, to undo what step setups opened. */
  cleanup?: () => void;
}
