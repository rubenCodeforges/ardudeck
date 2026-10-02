import { Triangle } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

/**
 * Tricopter — 3 motors + tail-servo yaw. Uncommon but supported.
 */
export const copterTri: VehicleTemplate = {
  slug: 'copter-tri',
  name: 'Tricopter', // i18n-exempt
  description: 'Three motors + yaw servo, efficient and quirky', // i18n-exempt
  icon: Triangle,
  vehicleType: 'copter',
  category: 'multirotor',
  defaults: {
    type: 'copter',
    motorCount: 3,
    motorArrangement: 'tri',
    frameSize: 450,
    weight: 1000,
    batteryCells: 4,
    batteryCapacity: 3300,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS', value: 7, reason: t('lib:vehicleTemplates.reason.tricopter'), requiresReboot: true },
    { name: 'FRAME_TYPE',  value: 1, reason: t('lib:vehicleTemplates.reason.yArrangement'),   requiresReboot: true },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => matches(m, 'FRAME_CLASS', 7),
};
