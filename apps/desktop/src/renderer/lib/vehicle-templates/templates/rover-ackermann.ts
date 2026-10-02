import { Car } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

export const roverAckermann: VehicleTemplate = {
  slug: 'rover-ackermann',
  name: 'Ackermann Rover', // i18n-exempt
  description: 'Car-style: single throttle, steering servo', // i18n-exempt
  icon: Car,
  vehicleType: 'rover',
  category: 'rover',
  defaults: {
    type: 'rover',
    driveType: 'ackermann',
    wheelbase: 300,
    wheelDiameter: 100,
    weight: 3000,
    maxSpeed: 10,
    batteryCells: 3,
    batteryCapacity: 5000,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS',     value: 1,  reason: t('lib:vehicleTemplates.reason.roverFrame'),       requiresReboot: true },
    { name: 'FRAME_TYPE',      value: 0,  reason: t('lib:vehicleTemplates.reason.undefinedAckermannUsesSteering'), requiresReboot: true },
    { name: 'SERVO1_FUNCTION', value: 26, reason: t('lib:vehicleTemplates.reason.groundSteering'),   requiresReboot: true },
    { name: 'SERVO3_FUNCTION', value: 70, reason: t('lib:vehicleTemplates.reason.throttle'),          requiresReboot: true },
    { name: 'WP_SPEED',        value: p.maxSpeed ?? 5, reason: t('lib:vehicleTemplates.reason.waypointSpeedFromMaxSpeed') },
    { name: 'CRUISE_SPEED',    value: (p.maxSpeed ?? 5) * 0.6, reason: t('lib:vehicleTemplates.reason.cruiseSpeed60OfMax') },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => matches(m, 'SERVO1_FUNCTION', 26),
};
