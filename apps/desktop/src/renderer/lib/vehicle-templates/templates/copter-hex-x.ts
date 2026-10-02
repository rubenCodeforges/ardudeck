import { Hexagon } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

export const copterHexX: VehicleTemplate = {
  slug: 'copter-hex-x',
  name: 'Hexacopter (X)', // i18n-exempt
  description: 'Six motors: redundancy, heavy lift', // i18n-exempt
  icon: Hexagon,
  vehicleType: 'copter',
  category: 'multirotor',
  defaults: {
    type: 'copter',
    motorCount: 6,
    motorArrangement: 'hex-x',
    frameSize: 550,
    weight: 2400,
    batteryCells: 6,
    batteryCapacity: 6000,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS', value: 2, reason: t('lib:vehicleTemplates.reason.hexacopter'), requiresReboot: true },
    { name: 'FRAME_TYPE',  value: 1, reason: t('lib:vehicleTemplates.reason.xArrangement'),    requiresReboot: true },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'FRAME_CLASS', 2) + matches(m, 'FRAME_TYPE', 1)) / 2,
};
