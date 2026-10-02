import { Circle } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

/**
 * Coaxial quad — 8 motors stacked as 4 coaxial pairs, classic rigid industrial frame.
 */
export const copterCoaxial: VehicleTemplate = {
  slug: 'copter-coaxial',
  name: 'Coaxial Quad (X8)', // i18n-exempt
  description: 'Eight motors in 4 coaxial pairs, industrial workhorse', // i18n-exempt
  icon: Circle,
  vehicleType: 'copter',
  category: 'multirotor',
  defaults: {
    type: 'copter',
    motorCount: 8,
    motorArrangement: 'coaxial',
    frameSize: 600,
    weight: 5000,
    batteryCells: 6,
    batteryCapacity: 12000,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS', value: 4, reason: t('lib:vehicleTemplates.reason.octaquadCoaxialX8'), requiresReboot: true },
    { name: 'FRAME_TYPE',  value: 1, reason: t('lib:vehicleTemplates.reason.xArrangement'),           requiresReboot: true },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'FRAME_CLASS', 4) + matches(m, 'FRAME_TYPE', 1)) / 2,
};
