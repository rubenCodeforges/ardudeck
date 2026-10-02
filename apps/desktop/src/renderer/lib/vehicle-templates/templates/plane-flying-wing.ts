import { Triangle } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import {
  batteryParams, airspeedParams, commonSafetyParams,
  simPhysicsParams, elevonServoParams, matches,
} from '../param-helpers.js';

/**
 * Flying wing / delta — no tail, elevons on trailing edge. SERVO functions 77/78.
 */
export const planeFlyingWing: VehicleTemplate = {
  slug: 'plane-flying-wing',
  name: 'Flying Wing / Delta', // i18n-exempt
  description: 'No tail, elevons on trailing edge', // i18n-exempt
  icon: Triangle,
  vehicleType: 'plane',
  category: 'fixed-wing',
  defaults: {
    type: 'plane',
    wingShape: 'delta',
    motorArrangement: 'twin-pusher',
    wingspan: 1500,
    stallSpeed: 10,
    weight: 1500,
    batteryCells: 4,
    batteryCapacity: 4000,
  },
  toParams: (p) => [
    ...elevonServoParams(),
    { name: 'SERVO3_FUNCTION', value: 70, reason: t('lib:vehicleTemplates.reason.throttle'), requiresReboot: true },
    ...airspeedParams(p),
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'SERVO1_FUNCTION', 77) + matches(m, 'SERVO2_FUNCTION', 78)) / 2,
};
