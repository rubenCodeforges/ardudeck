import { Octagon } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

export const copterOctoX: VehicleTemplate = {
  slug: 'copter-octo-x',
  name: 'Octocopter (X)', // i18n-exempt
  description: 'Eight motors: maximum redundancy, heavy cinema lift', // i18n-exempt
  icon: Octagon,
  vehicleType: 'copter',
  category: 'multirotor',
  defaults: {
    type: 'copter',
    motorCount: 8,
    motorArrangement: 'octo-x',
    frameSize: 900,
    weight: 6000,
    batteryCells: 6,
    batteryCapacity: 16000,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS', value: 3, reason: t('lib:vehicleTemplates.reason.octocopter'), requiresReboot: true },
    { name: 'FRAME_TYPE',  value: 1, reason: t('lib:vehicleTemplates.reason.xArrangement'),    requiresReboot: true },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'FRAME_CLASS', 3) + matches(m, 'FRAME_TYPE', 1)) / 2,
};
