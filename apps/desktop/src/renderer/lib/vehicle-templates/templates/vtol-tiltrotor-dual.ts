import { RotateCw } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, airspeedParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

/**
 * Dual-motor tiltrotor — motors tilt from vertical (hover) to horizontal
 * (cruise). Q_TILT_ENABLE=1, tilt mask picks which motors tilt.
 */
export const vtolTiltrotorDual: VehicleTemplate = {
  slug: 'vtol-tiltrotor-dual',
  name: 'Tiltrotor (dual)', // i18n-exempt
  description: 'Two motors tilt from hover to cruise, Osprey-style', // i18n-exempt
  icon: RotateCw,
  vehicleType: 'vtol',
  category: 'vtol',
  defaults: {
    type: 'vtol',
    wingShape: 'standard',
    vtolStyle: 'tiltrotor',
    motorArrangement: 'twin-tractor',
    vtolMotorCount: 2,
    wingspan: 1800,
    stallSpeed: 10,
    transitionSpeed: 14,
    weight: 2500,
    batteryCells: 6,
    batteryCapacity: 8000,
  },
  toParams: (p) => [
    { name: 'Q_ENABLE',        value: 1, reason: t('lib:vehicleTemplates.reason.enableVTOL'),           requiresReboot: true },
    { name: 'Q_TILT_ENABLE',   value: 1, reason: t('lib:vehicleTemplates.reason.enableTiltServos'),    requiresReboot: true },
    { name: 'Q_TILT_MASK',     value: 3, reason: t('lib:vehicleTemplates.reason.motors12Tilt'),        requiresReboot: true },
    { name: 'Q_TILT_TYPE',     value: 0, reason: t('lib:vehicleTemplates.reason.continuousTilt'),        requiresReboot: true },
    { name: 'Q_FRAME_CLASS',   value: 7, reason: t('lib:vehicleTemplates.reason.bicopter2MotorTiltrotor'), requiresReboot: true },
    { name: 'SERVO1_FUNCTION', value: 4,  reason: t('lib:vehicleTemplates.reason.aileron'),     requiresReboot: true },
    { name: 'SERVO2_FUNCTION', value: 19, reason: t('lib:vehicleTemplates.reason.elevator'),    requiresReboot: true },
    { name: 'SERVO3_FUNCTION', value: 33, reason: t('lib:vehicleTemplates.reason.motor1Left'),requiresReboot: true },
    { name: 'SERVO4_FUNCTION', value: 34, reason: t('lib:vehicleTemplates.reason.motor2Right'),requiresReboot: true },
    { name: 'SERVO5_FUNCTION', value: 41, reason: t('lib:vehicleTemplates.reason.motor1Tilt'), requiresReboot: true },
    { name: 'SERVO6_FUNCTION', value: 42, reason: t('lib:vehicleTemplates.reason.motor2Tilt'), requiresReboot: true },
    ...airspeedParams(p),
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'Q_ENABLE', 1) + matches(m, 'Q_TILT_ENABLE', 1)) / 2,
};
