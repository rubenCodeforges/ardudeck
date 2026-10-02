import { Plus } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

export const copterQuadPlus: VehicleTemplate = {
  slug: 'copter-quad-plus',
  name: 'Quadcopter (+)', // i18n-exempt
  description: 'Four motors in + pattern, motor 1 forward', // i18n-exempt
  icon: Plus,
  vehicleType: 'copter',
  category: 'multirotor',
  defaults: {
    type: 'copter',
    motorCount: 4,
    motorArrangement: 'quad-plus',
    frameSize: 254,
    weight: 1200,
    batteryCells: 4,
    batteryCapacity: 3000,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS', value: 1, reason: t('lib:vehicleTemplates.reason.quadcopter'), requiresReboot: true },
    { name: 'FRAME_TYPE',  value: 0, reason: t('lib:vehicleTemplates.reason.plusArrangement'),  requiresReboot: true },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'FRAME_CLASS', 1) + matches(m, 'FRAME_TYPE', 0)) / 2,
};
