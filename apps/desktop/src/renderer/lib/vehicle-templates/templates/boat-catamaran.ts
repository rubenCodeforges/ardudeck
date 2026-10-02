import { Anchor } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

export const boatCatamaran: VehicleTemplate = {
  slug: 'boat-catamaran',
  name: 'Catamaran', // i18n-exempt
  description: 'Twin-hull, twin-prop, stable platform', // i18n-exempt
  icon: Anchor,
  vehicleType: 'boat',
  category: 'boat',
  defaults: {
    type: 'boat',
    hullType: 'catamaran',
    hullLength: 2000,
    propellerType: 'prop',
    weight: 15000,
    maxSpeed: 8,
    batteryCells: 8,
    batteryCapacity: 30000,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS',     value: 1,  reason: t('lib:vehicleTemplates.reason.boatRoverFrameClass'), requiresReboot: true },
    { name: 'FRAME_TYPE',      value: 2,  reason: t('lib:vehicleTemplates.reason.boat'),                     requiresReboot: true },
    { name: 'SERVO1_FUNCTION', value: 73, reason: t('lib:vehicleTemplates.reason.throttleLeftHull'),       requiresReboot: true },
    { name: 'SERVO3_FUNCTION', value: 74, reason: t('lib:vehicleTemplates.reason.throttleRightHull'),      requiresReboot: true },
    { name: 'WP_SPEED',        value: p.maxSpeed ?? 4, reason: t('lib:vehicleTemplates.reason.waypointSpeed') },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'FRAME_TYPE', 2) + matches(m, 'SERVO1_FUNCTION', 73)) / 2,
};
