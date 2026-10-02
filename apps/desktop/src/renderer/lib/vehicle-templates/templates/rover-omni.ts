import { Car } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

/**
 * Omni-directional rover — 3 or 4 omni wheels, can translate in any direction.
 * FRAME_CLASS=2, FRAME_TYPE selects 3WD or 4WD layout.
 */
export const roverOmni: VehicleTemplate = {
  slug: 'rover-omni',
  name: 'Omni Rover', // i18n-exempt
  description: 'Omni-directional wheels, can translate sideways', // i18n-exempt
  icon: Car,
  vehicleType: 'rover',
  category: 'rover',
  defaults: {
    type: 'rover',
    driveType: 'skid',
    wheelbase: 300,
    wheelDiameter: 100,
    weight: 5000,
    maxSpeed: 3,
    batteryCells: 4,
    batteryCapacity: 6000,
  },
  toParams: (p) => [
    { name: 'FRAME_CLASS', value: 2, reason: t('lib:vehicleTemplates.reason.omniRoverFrame'), requiresReboot: true },
    { name: 'FRAME_TYPE',  value: 1, reason: t('lib:vehicleTemplates.reason.r4WheelOmniX'), requiresReboot: true },
    { name: 'SERVO1_FUNCTION', value: 73, reason: t('lib:vehicleTemplates.reason.throttleFrontLeft'),  requiresReboot: true },
    { name: 'SERVO2_FUNCTION', value: 74, reason: t('lib:vehicleTemplates.reason.throttleFrontRight'), requiresReboot: true },
    { name: 'SERVO3_FUNCTION', value: 75, reason: t('lib:vehicleTemplates.reason.throttleRearLeft'),   requiresReboot: true },
    { name: 'SERVO4_FUNCTION', value: 76, reason: t('lib:vehicleTemplates.reason.throttleRearRight'),  requiresReboot: true },
    { name: 'WP_SPEED',     value: p.maxSpeed ?? 2, reason: t('lib:vehicleTemplates.reason.waypointSpeedFromMaxSpeed') },
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'FRAME_CLASS', 2) + matches(m, 'SERVO1_FUNCTION', 73)) / 2,
};
