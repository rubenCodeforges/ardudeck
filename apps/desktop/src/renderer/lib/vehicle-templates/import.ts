import type { VehicleProfile, VehicleType } from '../../stores/settings-store.js';
import { allTemplates } from './registry.js';
import type { VehicleTemplate } from './types.js';

export interface InferenceResult {
  template: VehicleTemplate;
  confidence: number;                      // 0..1 from winning template's inferFrom
  profile: Omit<VehicleProfile, 'id'>;     // backfilled fields (unfilled = undefined)
  autoFilled: Set<string>;                 // field names that came from params (for UI highlighting)
}

/**
 * Infer vehicle profile fields from a live parameter map. Picks the template
 * with highest confidence; back-fills known profile fields from params when
 * there's a direct decoding (cells ← BATT_LOW_VOLT, motorCount ← FRAME_CLASS,
 * etc.).
 */
export function inferProfileFromParams(paramMap: Map<string, number>): InferenceResult | null {
  let best: { template: VehicleTemplate; score: number } | null = null;
  for (const t of allTemplates()) {
    const score = t.inferFrom(paramMap);
    if (!best || score > best.score) best = { template: t, score };
  }
  if (!best || best.score === 0) return null;

  const template = best.template;
  const autoFilled = new Set<string>();
  const profile: Omit<VehicleProfile, 'id'> = {
    name: `Imported ${template.name}`,
    type: template.vehicleType as VehicleType,
    templateSlug: template.slug,
    weight: template.defaults.weight ?? 500,
    batteryCells: template.defaults.batteryCells ?? 4,
    batteryCapacity: template.defaults.batteryCapacity ?? 1500,
    ...template.defaults,
  } as Omit<VehicleProfile, 'id'>;

  // Backfill battery cells from BATT_LOW_VOLT when possible
  const lowVolt = paramMap.get('BATT_LOW_VOLT');
  if (lowVolt && lowVolt > 0) {
    const cells = Math.round(lowVolt / 3.5);
    if (cells >= 1 && cells <= 14) {
      profile.batteryCells = cells;
      autoFilled.add('batteryCells');
    }
  }
  const capacity = paramMap.get('BATT_CAPACITY');
  if (capacity && capacity > 0) {
    profile.batteryCapacity = Math.round(capacity);
    autoFilled.add('batteryCapacity');
  }

  // Motor count from FRAME_CLASS (rough — different classes imply different counts)
  const frameClass = paramMap.get('FRAME_CLASS');
  if (frameClass !== undefined) {
    const motorMap: Record<number, number> = { 1: 4, 2: 6, 3: 8, 4: 8, 7: 3 };
    const count = motorMap[frameClass];
    if (count) {
      profile.motorCount = count;
      autoFilled.add('motorCount');
    }
  }

  // Airspeed from AIRSPEED_CRUISE (plane/vtol)
  const cruise = paramMap.get('AIRSPEED_CRUISE');
  if (cruise && cruise > 0) {
    profile.stallSpeed = Math.round(cruise / 1.5 * 10) / 10;
    autoFilled.add('stallSpeed');
  }

  return { template, confidence: best.score, profile, autoFilled };
}
