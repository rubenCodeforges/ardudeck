import { Plane } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, airspeedParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

/**
 * Twin-boom plane — conventional tail on two booms. Servo config same as
 * standard plane, but marked out so users can find the template.
 */
export const planeTwinBoom: VehicleTemplate = {
  slug: 'plane-twin-boom',
  name: 'Twin-Boom Plane', // i18n-exempt
  description: 'Two tail booms, great for pushers and cameras', // i18n-exempt
  icon: Plane,
  vehicleType: 'plane',
  category: 'fixed-wing',
  defaults: {
    type: 'plane',
    wingShape: 'standard',
    motorArrangement: 'twin-pusher',
    wingspan: 2200,
    stallSpeed: 11,
    weight: 2500,
    batteryCells: 6,
    batteryCapacity: 8000,
  },
  toParams: (p) => [
    { name: 'SERVO1_FUNCTION', value: 4,  reason: t('lib:vehicleTemplates.reason.aileron'),      requiresReboot: true },
    { name: 'SERVO2_FUNCTION', value: 19, reason: t('lib:vehicleTemplates.reason.elevator'),     requiresReboot: true },
    { name: 'SERVO3_FUNCTION', value: 70, reason: t('lib:vehicleTemplates.reason.throttleL'),   requiresReboot: true },
    { name: 'SERVO4_FUNCTION', value: 21, reason: t('lib:vehicleTemplates.reason.rudder'),       requiresReboot: true },
    { name: 'SERVO5_FUNCTION', value: 74, reason: t('lib:vehicleTemplates.reason.throttleRTwinMotor'), requiresReboot: true },
    ...airspeedParams(p),
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => matches(m, 'SERVO5_FUNCTION', 74),
};
