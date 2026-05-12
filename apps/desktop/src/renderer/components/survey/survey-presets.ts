/**
 * Survey Mission Presets
 *
 * Built-in templates that pre-fill the survey config with sane defaults for
 * common use cases. Templates are a starting point — every field they set is
 * still editable from the panel sliders afterwards.
 *
 * A preset overlays a partial SurveyConfig on top of the user's current config,
 * preserving polygon and pattern angle (those are scene-specific). Camera is
 * only overwritten when the preset explicitly cares about it (e.g. Mower mode
 * forces Manual camera).
 */
import type { SurveyConfig, SurveyPattern, CameraPreset } from './survey-types';
import { MANUAL_CAMERA } from './camera-presets';

export interface SurveyPreset {
  /** Stable id used as the dropdown selection key. */
  id: string;
  /** Human label shown in the dropdown. */
  name: string;
  /** Short tagline rendered below the label. */
  description: string;
  /** Partial config the preset writes. Fields it omits are left untouched. */
  config: Partial<Pick<
    SurveyConfig,
    'pattern' | 'altitude' | 'speed' | 'frontOverlap' | 'sideOverlap' | 'overshoot' | 'altitudeReference' | 'groundPattern' | 'spiralDirection' | 'perimeterPasses'
  >>;
  /**
   * When set, the preset replaces the active camera. Mower mode uses this to
   * flip into the manual-corridor camera; flight templates leave it alone so
   * the user's chosen camera survives the template switch.
   */
  camera?: CameraPreset;
  /** Tag rendered in the dropdown item (e.g. "Flying", "Ground"). */
  tag: 'Flying' | 'Ground' | 'Custom';
  /** Whether this came from the user (vs ships built-in). User presets are removable. */
  isUserDefined?: boolean;
}

// Built-in presets — order matters: first one is the default when no template
// has been picked yet. Settings tuned for typical residential/small-survey
// drones with a Mavic-class camera at the recommended altitudes; users can
// always nudge sliders afterwards.
export const BUILTIN_SURVEY_PRESETS: SurveyPreset[] = [
  {
    id: 'map-ortho',
    name: 'Map / Orthomosaic',
    description: '2D map. Fast flight, single grid pass.',
    tag: 'Flying',
    config: {
      pattern: 'grid',
      altitude: 80,
      speed: 8,
      frontOverlap: 75,
      sideOverlap: 60,
      overshoot: 20,
      altitudeReference: 'relative',
    },
  },
  {
    id: 'photogrammetry-3d',
    name: '3D / Photogrammetry',
    description: 'Buildings, terrain meshes. Crosshatch + high overlap.',
    tag: 'Flying',
    config: {
      pattern: 'crosshatch',
      altitude: 50,
      speed: 5,
      frontOverlap: 80,
      sideOverlap: 75,
      overshoot: 15,
      altitudeReference: 'relative',
    },
  },
  {
    id: 'inspection-detail',
    name: 'Inspection / Detail',
    description: 'Small areas, low altitude, high GSD.',
    tag: 'Flying',
    config: {
      pattern: 'grid',
      altitude: 30,
      speed: 3,
      frontOverlap: 85,
      sideOverlap: 80,
      overshoot: 10,
      altitudeReference: 'relative',
    },
  },
  {
    id: 'rover-mower',
    name: 'Rover / Mower',
    description: 'Ground vehicle. Set corridor width directly.',
    tag: 'Ground',
    camera: { ...MANUAL_CAMERA },
    config: {
      pattern: 'grid',
      speed: 2,
      // overlap / altitude irrelevant in manual mode but kept sensible
      frontOverlap: 0,
      sideOverlap: 0,
      overshoot: 0,
      groundPattern: 'boustrophedon',
    },
  },
];

/** A preset whose only purpose is "the user fine-tuned this themselves". */
export function makeUserPreset(
  name: string,
  config: SurveyPreset['config'],
  camera?: CameraPreset,
): SurveyPreset {
  return {
    id: `user-${Date.now().toString(36)}`,
    name,
    description: 'Saved preset',
    tag: 'Custom',
    isUserDefined: true,
    config,
    ...(camera ? { camera } : {}),
  };
}

/**
 * Pull only the preset-relevant slice off a full SurveyConfig. Used when the
 * user clicks "Save as preset" — we strip polygon/pattern-angle and persist
 * just the reusable settings.
 */
export function captureCurrentAsPresetConfig(c: SurveyConfig): SurveyPreset['config'] {
  return {
    pattern: c.pattern,
    altitude: c.altitude,
    speed: c.speed,
    frontOverlap: c.frontOverlap,
    sideOverlap: c.sideOverlap,
    overshoot: c.overshoot,
    altitudeReference: c.altitudeReference,
    ...(c.groundPattern ? { groundPattern: c.groundPattern } : {}),
    ...(c.spiralDirection ? { spiralDirection: c.spiralDirection } : {}),
    ...(c.perimeterPasses !== undefined ? { perimeterPasses: c.perimeterPasses } : {}),
  };
}
