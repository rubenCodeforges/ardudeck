import type { VehicleTemplate } from './types.js';
import type { VehicleType } from '../../stores/settings-store.js';

// Copter
import { copterQuadX }    from './templates/copter-quad-x.js';
import { copterQuadPlus } from './templates/copter-quad-plus.js';
import { copterQuadH }    from './templates/copter-quad-h.js';
import { copterHexX }     from './templates/copter-hex-x.js';
import { copterHexPlus }  from './templates/copter-hex-plus.js';
import { copterOctoX }    from './templates/copter-octo-x.js';
import { copterOctoPlus } from './templates/copter-octo-plus.js';
import { copterY6 }       from './templates/copter-y6.js';
import { copterTri }      from './templates/copter-tri.js';
import { copterCoaxial }  from './templates/copter-coaxial.js';

// Plane
import { planeStandard }    from './templates/plane-standard.js';
import { planeFlyingWing }  from './templates/plane-flying-wing.js';
import { planeVTail }       from './templates/plane-v-tail.js';
import { planeTwinBoom }    from './templates/plane-twin-boom.js';

// VTOL
import { vtolQuadplaneQuad }        from './templates/vtol-quadplane-quad.js';
import { vtolQuadplaneHex }         from './templates/vtol-quadplane-hex.js';
import { vtolTailsitterConventional } from './templates/vtol-tailsitter-conventional.js';
import { vtolTailsitterDeltaDuo }   from './templates/vtol-tailsitter-delta-duo.js';
import { vtolTiltrotorDual }        from './templates/vtol-tiltrotor-dual.js';
import { vtolTiltwing }             from './templates/vtol-tiltwing.js';

// Rover
import { roverAckermann } from './templates/rover-ackermann.js';
import { roverSkid }      from './templates/rover-skid.js';
import { roverOmni }      from './templates/rover-omni.js';

// Boat
import { boatSingleProp } from './templates/boat-single-prop.js';
import { boatTwinProp }   from './templates/boat-twin-prop.js';
import { boatCatamaran }  from './templates/boat-catamaran.js';

// Sub
import { subVectored6 } from './templates/sub-vectored-6.js';
import { t as translate } from '../../../shared/i18n/index.js';

/**
 * The full template registry. Add new templates here and they automatically
 * appear in the picker and become available for reverse import + apply.
 */
export const VEHICLE_TEMPLATES: readonly VehicleTemplate[] = [
  copterQuadX, copterQuadPlus, copterQuadH,
  copterHexX, copterHexPlus,
  copterOctoX, copterOctoPlus,
  copterY6, copterTri, copterCoaxial,

  planeStandard, planeFlyingWing, planeVTail, planeTwinBoom,

  vtolQuadplaneQuad, vtolQuadplaneHex,
  vtolTailsitterConventional, vtolTailsitterDeltaDuo,
  vtolTiltrotorDual, vtolTiltwing,

  roverAckermann, roverSkid, roverOmni,
  boatSingleProp, boatTwinProp, boatCatamaran,
  subVectored6,
];

const moduleTemplates = new Map<string, { moduleSlug: string; template: VehicleTemplate }>();
const templateListeners = new Set<() => void>();
let allSnapshot: readonly VehicleTemplate[] = VEHICLE_TEMPLATES;

function templatesChanged(): void {
  allSnapshot = [...VEHICLE_TEMPLATES, ...Array.from(moduleTemplates.values(), (m) => m.template)];
  for (const l of templateListeners) l();
}

/** Built-in templates plus those contributed by loaded modules. */
export function allTemplates(): readonly VehicleTemplate[] {
  return allSnapshot;
}

export function subscribeTemplates(cb: () => void): () => void {
  templateListeners.add(cb);
  return () => templateListeners.delete(cb);
}

export function registerModuleTemplate(moduleSlug: string, template: VehicleTemplate): void {
  if (VEHICLE_TEMPLATES.some((t) => t.slug === template.slug)) {
    throw new Error(`[module:${moduleSlug}] template slug collides with a built-in: ${template.slug}`); // i18n-exempt
  }
  const existing = moduleTemplates.get(template.slug);
  if (existing && existing.moduleSlug !== moduleSlug) {
    throw new Error(`[module:${moduleSlug}] template slug already registered by ${existing.moduleSlug}`); // i18n-exempt
  }
  moduleTemplates.set(template.slug, { moduleSlug, template });
  templatesChanged();
}

export function unregisterModuleTemplate(moduleSlug: string, slug: string): void {
  if (moduleTemplates.get(slug)?.moduleSlug !== moduleSlug) return;
  moduleTemplates.delete(slug);
  templatesChanged();
}

export function unregisterModuleTemplates(moduleSlug: string): void {
  let removed = false;
  for (const [slug, m] of moduleTemplates) if (m.moduleSlug === moduleSlug && moduleTemplates.delete(slug)) removed = true;
  if (removed) templatesChanged();
}

export function getTemplate(slug: string | undefined): VehicleTemplate | undefined {
  if (!slug) return undefined;
  return allSnapshot.find(t => t.slug === slug);
}

export function templateName(tpl: Pick<VehicleTemplate, 'slug' | 'name'>): string {
  return translate(`lib:vehicleTemplates.template.${tpl.slug}.name`, { defaultValue: tpl.name });
}

export function templateDescription(tpl: Pick<VehicleTemplate, 'slug' | 'description'>): string {
  return translate(`lib:vehicleTemplates.template.${tpl.slug}.description`, { defaultValue: tpl.description });
}

export function templatesForType(type: VehicleType): VehicleTemplate[] {
  return allSnapshot.filter(t => t.vehicleType === type);
}

/**
 * Fallback template used when a profile has no templateSlug. Pick the most
 * common config for the vehicle type so `applyProfile` still does something
 * sensible.
 */
export function defaultTemplateForType(type: VehicleType): VehicleTemplate {
  const fallbacks: Record<VehicleType, string> = {
    copter: 'copter-quad-x',
    plane:  'plane-standard',
    vtol:   'vtol-quadplane-quad',
    rover:  'rover-ackermann',
    boat:   'boat-single-prop',
    sub:    'sub-vectored-6',
  };
  const t = getTemplate(fallbacks[type]);
  if (!t) throw new Error(`No default template for type ${type}`); // i18n-exempt
  return t;
}
