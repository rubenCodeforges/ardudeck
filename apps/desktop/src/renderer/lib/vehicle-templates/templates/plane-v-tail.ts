import { Plane } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import {
  batteryParams, airspeedParams, commonSafetyParams,
  simPhysicsParams, vtailServoParams, matches,
} from '../param-helpers.js';

/**
 * V-tail plane — two surfaces combine pitch+yaw control (VTail mixing).
 */
export const planeVTail: VehicleTemplate = {
  slug: 'plane-v-tail',
  name: 'V-Tail Plane', // i18n-exempt
  description: 'Two combined pitch/yaw surfaces, cleaner drag profile', // i18n-exempt
  icon: Plane,
  vehicleType: 'plane',
  category: 'fixed-wing',
  defaults: {
    type: 'plane',
    wingShape: 'v-tail',
    motorArrangement: 'twin-tractor',
    wingspan: 1600,
    stallSpeed: 9,
    weight: 1600,
    batteryCells: 4,
    batteryCapacity: 4000,
  },
  toParams: (p) => [
    { name: 'SERVO3_FUNCTION', value: 70, reason: t('lib:vehicleTemplates.reason.throttle'), requiresReboot: true },
    ...vtailServoParams(),
    ...airspeedParams(p),
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'SERVO1_FUNCTION', 79) + matches(m, 'SERVO2_FUNCTION', 80)) / 2,
};
