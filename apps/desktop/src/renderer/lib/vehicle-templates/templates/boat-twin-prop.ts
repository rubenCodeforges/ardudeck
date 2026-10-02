import { Anchor } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

export const boatTwinProp: VehicleTemplate = {
  slug: 'boat-twin-prop',
  name: 'Twin-Prop Boat', // i18n-exempt
  description: 'Two motors, differential thrust steering (no rudder)', // i18n-exempt
  icon: Anchor,
  vehicleType: 'boat',
  category: 'boat',
  defaults: {
    type: 'boat',
    hullType: 'displacement',
    hullLength: 1500,
    propellerType: 'prop',
    weight: 12000,
    maxSpeed: 6,
    batteryCells: 6,
    batteryCapacity: 20000,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS',     value: 1,  reason: t('lib:vehicleTemplates.reason.boatRoverFrameClass'), requiresReboot: true },
    { name: 'FRAME_TYPE',      value: 2,  reason: t('lib:vehicleTemplates.reason.boat'),                     requiresReboot: true },
    { name: 'SERVO1_FUNCTION', value: 73, reason: t('lib:vehicleTemplates.reason.throttleLeft'),            requiresReboot: true },
    { name: 'SERVO3_FUNCTION', value: 74, reason: t('lib:vehicleTemplates.reason.throttleRight'),           requiresReboot: true },
    { name: 'WP_SPEED',        value: p.maxSpeed ?? 3, reason: t('lib:vehicleTemplates.reason.waypointSpeed') },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'FRAME_TYPE', 2) + matches(m, 'SERVO1_FUNCTION', 73)) / 2,
};
