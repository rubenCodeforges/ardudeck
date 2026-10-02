import { Car } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

/**
 * Differential / skid-steer rover — tank-style, two independent throttles.
 */
export const roverSkid: VehicleTemplate = {
  slug: 'rover-skid',
  name: 'Skid-Steer Rover', // i18n-exempt
  description: 'Differential drive: tank-style, no steering servo', // i18n-exempt
  icon: Car,
  vehicleType: 'rover',
  category: 'rover',
  defaults: {
    type: 'rover',
    driveType: 'differential',
    wheelbase: 250,
    wheelDiameter: 120,
    weight: 4000,
    maxSpeed: 5,
    batteryCells: 4,
    batteryCapacity: 8000,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS',     value: 1,  reason: t('lib:vehicleTemplates.reason.roverFrame'),     requiresReboot: true },
    { name: 'FRAME_TYPE',      value: 0,  reason: t('lib:vehicleTemplates.reason.differential'),    requiresReboot: true },
    { name: 'SERVO1_FUNCTION', value: 73, reason: t('lib:vehicleTemplates.reason.throttleLeft'),   requiresReboot: true },
    { name: 'SERVO3_FUNCTION', value: 74, reason: t('lib:vehicleTemplates.reason.throttleRight'),  requiresReboot: true },
    { name: 'WP_SPEED',        value: p.maxSpeed ?? 3, reason: t('lib:vehicleTemplates.reason.waypointSpeedFromMaxSpeed') },
    { name: 'CRUISE_SPEED',    value: (p.maxSpeed ?? 3) * 0.6, reason: t('lib:vehicleTemplates.reason.cruiseSpeed60OfMax') },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'SERVO1_FUNCTION', 73) + matches(m, 'SERVO3_FUNCTION', 74)) / 2,
};
