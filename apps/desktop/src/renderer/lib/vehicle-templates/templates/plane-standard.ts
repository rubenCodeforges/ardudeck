import { Plane } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, airspeedParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

export const planeStandard: VehicleTemplate = {
  slug: 'plane-standard',
  name: 'Standard Plane', // i18n-exempt
  description: 'Traditional fuselage with separate elevator, rudder, ailerons', // i18n-exempt
  icon: Plane,
  vehicleType: 'plane',
  category: 'fixed-wing',
  defaults: {
    type: 'plane',
    wingShape: 'standard',
    motorArrangement: 'twin-tractor',
    wingspan: 1800,
    stallSpeed: 9,
    weight: 1800,
    batteryCells: 4,
    batteryCapacity: 5000,
  },
  toParams: (p) => [
    { name: 'SERVO1_FUNCTION', value: 4,  reason: t('lib:vehicleTemplates.reason.aileron'),  requiresReboot: true },
    { name: 'SERVO2_FUNCTION', value: 19, reason: t('lib:vehicleTemplates.reason.elevator'), requiresReboot: true },
    { name: 'SERVO3_FUNCTION', value: 70, reason: t('lib:vehicleTemplates.reason.throttle'), requiresReboot: true },
    { name: 'SERVO4_FUNCTION', value: 21, reason: t('lib:vehicleTemplates.reason.rudder'),   requiresReboot: true },
    ...airspeedParams(p),
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'SERVO1_FUNCTION', 4) + matches(m, 'SERVO2_FUNCTION', 19)) / 2,
};
