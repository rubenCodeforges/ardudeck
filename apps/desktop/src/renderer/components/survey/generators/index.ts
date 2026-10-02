/**
 * Built-in survey generator self-registration.
 *
 * Importing this module is sufficient to populate the survey generator
 * registry with the bundled generators (grid, crosshatch, circular,
 * spiral, perimeter-fill). The survey-store imports this once at
 * module load.
 */

import { registerSurveyGenerator } from '../generator-registry';
import { generateGrid } from './grid-generator';
import { generateCrosshatch } from './crosshatch-generator';
import { generateCircular } from './circular-generator';
import { generateSpiral } from './spiral-generator';
import { generatePerimeterFill } from './perimeter-fill-generator';
import { generateCorridor } from './corridor-generator';
import { generatePanorama } from './panorama-generator';

registerSurveyGenerator({
  id: 'builtin.grid',
  version: '1.0.0',
  displayNameKey: 'survey:generators.grid.name',
  descriptionKey: 'survey:generators.grid.description',
  displayName: 'Grid',
  description: // i18n-exempt
    'Boustrophedon lawnmower pattern. Parallel scan lines across the polygon with overshoot for turns.',
  capabilities: {
    supportsHoles: true,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateGrid,
});

registerSurveyGenerator({
  id: 'builtin.crosshatch',
  version: '1.0.0',
  displayNameKey: 'survey:generators.crosshatch.name',
  descriptionKey: 'survey:generators.crosshatch.description',
  displayName: 'Crosshatch',
  description: // i18n-exempt
    'Two perpendicular grid passes. Higher photo density and improved 3D reconstruction over a single grid.',
  capabilities: {
    supportsHoles: true,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateCrosshatch,
});

registerSurveyGenerator({
  id: 'builtin.circular',
  version: '1.0.0',
  displayNameKey: 'survey:generators.circular.name',
  descriptionKey: 'survey:generators.circular.description',
  displayName: 'Circular',
  description: 'Orbit a point of interest at fixed radius.', // i18n-exempt
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateCircular,
});

registerSurveyGenerator({
  id: 'builtin.spiral',
  version: '1.0.0',
  displayNameKey: 'survey:generators.spiral.name',
  descriptionKey: 'survey:generators.spiral.description',
  displayName: 'Spiral',
  description: 'Inward or outward spiral within the polygon.', // i18n-exempt
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateSpiral,
});

registerSurveyGenerator({
  id: 'builtin.corridor',
  version: '1.0.0',
  displayNameKey: 'survey:generators.corridor.name',
  descriptionKey: 'survey:generators.corridor.description',
  displayName: 'Corridor',
  description: // i18n-exempt
    'Linear survey along a centerline (roads, rail, power lines, pipelines). Parallel strips with plane racetrack turns or copter on-the-spot turns.',
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateCorridor,
});

registerSurveyGenerator({
  id: 'builtin.panorama',
  version: '1.0.0',
  displayNameKey: 'survey:generators.panorama.name',
  descriptionKey: 'survey:generators.panorama.description',
  displayName: 'Panorama',
  description: // i18n-exempt
    'Capture a line (shoreline, cliff, frontage): the drawn line is the subject, the flight path is derived to the side, and the camera yaws onto the subject the whole way.',
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generatePanorama,
});

registerSurveyGenerator({
  id: 'builtin.perimeter-fill',
  version: '1.0.0',
  displayNameKey: 'survey:generators.perimeterFill.name',
  descriptionKey: 'survey:generators.perimeterFill.description',
  displayName: 'Perimeter Fill', // i18n-exempt
  description: 'N perimeter passes followed by a grid fill of the interior.', // i18n-exempt
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generatePerimeterFill,
});
