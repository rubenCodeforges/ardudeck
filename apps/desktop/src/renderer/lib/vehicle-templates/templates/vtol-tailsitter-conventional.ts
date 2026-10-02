import { RotateCcw } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, airspeedParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

/**
 * Tailsitter — sits on its tail, tilts forward to transition. Conventional
 * wing shape with control surfaces (elevons or independent).
 */
export const vtolTailsitterConventional: VehicleTemplate = {
  slug: 'vtol-tailsitter-conventional',
  name: 'Tailsitter (conventional)', // i18n-exempt
  description: 'Sits on its tail, tilts to fly forward, elevons for hover control', // i18n-exempt
  icon: RotateCcw,
  vehicleType: 'vtol',
  category: 'vtol',
  defaults: {
    type: 'vtol',
    wingShape: 'standard',
    vtolStyle: 'tailsitter',
    motorArrangement: 'twin-tractor',
    vtolMotorCount: 2,
    wingspan: 1000,
    stallSpeed: 9,
    transitionSpeed: 12,
    weight: 1500,
    batteryCells: 6,
    batteryCapacity: 5000,
  },
  toParams: (p) => [
    { name: 'Q_ENABLE',         value: 1, reason: t('lib:vehicleTemplates.reason.enableVTOL'),                    requiresReboot: true },
    { name: 'Q_TAILSIT_ENABLE', value: 1, reason: t('lib:vehicleTemplates.reason.enableTailsitterMode'),         requiresReboot: true },
    { name: 'Q_FRAME_CLASS',    value: 10, reason: t('lib:vehicleTemplates.reason.singleCoaxCopterLiftFrame'), requiresReboot: true },
    { name: 'Q_FRAME_TYPE',     value: 2, reason: t('lib:vehicleTemplates.reason.vectoredYawTailsitter'),         requiresReboot: true },
    { name: 'Q_TAILSIT_INPUT',  value: 2, reason: t('lib:vehicleTemplates.reason.bodyFrameControlInput'),        requiresReboot: true },
    { name: 'SERVO1_FUNCTION',  value: 77, reason: t('lib:vehicleTemplates.reason.elevonLeft'),                    requiresReboot: true },
    { name: 'SERVO2_FUNCTION',  value: 78, reason: t('lib:vehicleTemplates.reason.elevonRight'),                   requiresReboot: true },
    { name: 'SERVO3_FUNCTION',  value: 33, reason: t('lib:vehicleTemplates.reason.motor1'),                        requiresReboot: true },
    { name: 'SERVO4_FUNCTION',  value: 34, reason: t('lib:vehicleTemplates.reason.motor2'),                        requiresReboot: true },
    ...airspeedParams(p),
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) => (matches(m, 'Q_ENABLE', 1) + matches(m, 'Q_TAILSIT_ENABLE', 1)) / 2,
};
