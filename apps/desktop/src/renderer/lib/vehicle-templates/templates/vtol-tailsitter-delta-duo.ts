import { Triangle } from 'lucide-react';
import type { VehicleTemplate } from '../types.js';
import { t } from '../../../../shared/i18n/index.js';
import { batteryParams, airspeedParams, commonSafetyParams, simPhysicsParams, matches } from '../param-helpers.js';

/**
 * Tailsitter Delta Duo — 2 motors on a delta wing, flies vertically for
 * takeoff/landing, tilts forward for efficient cruise. No separate control
 * surfaces beyond elevons; differential thrust provides yaw authority.
 *
 * Key params:
 *  - Q_TAILSIT_ENABLE=1  enables tailsitter logic
 *  - Q_FRAME_CLASS=10    single/coax copter (2-motor tailsitter treated as
 *                         a differential-thrust single-class frame)
 *  - Q_FRAME_TYPE=2      vectored-yaw tailsitter (no tail rotor / no rudder)
 *  - Q_TAILSIT_MOTMX=3   bits for motors 1+2 active in hover
 *  - Elevons on SERVO1/2 (77/78) for pitch/roll authority in forward flight.
 */
export const vtolTailsitterDeltaDuo: VehicleTemplate = {
  slug: 'vtol-tailsitter-delta-duo',
  name: 'Tailsitter Delta Duo', // i18n-exempt
  description: '2-motor delta-wing tailsitter, compact and efficient', // i18n-exempt
  icon: Triangle,
  vehicleType: 'vtol',
  category: 'vtol',
  defaults: {
    type: 'vtol',
    wingShape: 'delta',
    vtolStyle: 'tailsitter',
    motorArrangement: 'inline-2',
    vtolMotorCount: 2,
    wingspan: 900,
    stallSpeed: 8,
    transitionSpeed: 11,
    weight: 800,
    batteryCells: 4,
    batteryCapacity: 3000,
    thrustToWeight: 2.5,
  },
  toParams: (p) => [
    { name: 'Q_ENABLE',          value: 1,  reason: t('lib:vehicleTemplates.reason.enableVTOL'),                   requiresReboot: true },
    { name: 'Q_TAILSIT_ENABLE',  value: 1,  reason: t('lib:vehicleTemplates.reason.tailsitterMode'),               requiresReboot: true },
    { name: 'Q_FRAME_CLASS',     value: 10, reason: t('lib:vehicleTemplates.reason.singleCoaxFor2MotorTailsitter'), requiresReboot: true },
    { name: 'Q_FRAME_TYPE',      value: 2,  reason: t('lib:vehicleTemplates.reason.vectoredYawNoRudder'),       requiresReboot: true },
    { name: 'Q_TAILSIT_INPUT',   value: 2,  reason: t('lib:vehicleTemplates.reason.bodyFrameStickInput'),         requiresReboot: true },
    { name: 'Q_TAILSIT_MOTMX',   value: 3,  reason: t('lib:vehicleTemplates.reason.motors12ActiveInHover') },
    { name: 'Q_TAILSIT_VFGAIN',  value: 0.3, reason: t('lib:vehicleTemplates.reason.vectoredThrustYawGain') },
    { name: 'Q_TAILSIT_VHGAIN',  value: 0.3, reason: t('lib:vehicleTemplates.reason.vectoredThrustHoverGain') },
    // Delta wing elevon mixing — SERVO1 = elevon L, SERVO2 = elevon R
    { name: 'SERVO1_FUNCTION',   value: 77, reason: t('lib:vehicleTemplates.reason.elevonLeftDeltaWing'),       requiresReboot: true },
    { name: 'SERVO2_FUNCTION',   value: 78, reason: t('lib:vehicleTemplates.reason.elevonRightDeltaWing'),      requiresReboot: true },
    { name: 'SERVO3_FUNCTION',   value: 33, reason: t('lib:vehicleTemplates.reason.motor1HoverForward'),      requiresReboot: true },
    { name: 'SERVO4_FUNCTION',   value: 34, reason: t('lib:vehicleTemplates.reason.motor2HoverForward'),      requiresReboot: true },
    { name: 'MIXING_GAIN',       value: 0.5, reason: t('lib:vehicleTemplates.reason.elevonMixGain') },
    // Airspeed/transition
    { name: 'Q_TRANSITION_MS',   value: 5000, reason: t('lib:vehicleTemplates.reason.transitionDuration5S') },
    { name: 'Q_ASSIST_SPEED',    value: Math.max((p.stallSpeed ?? 8) * 0.9, 3), reason: t('lib:vehicleTemplates.reason.fixedWingAssistThreshold') },
    ...airspeedParams(p),
    ...batteryParams(p),
    ...commonSafetyParams(),
  ],
  toSimParams: (p) => simPhysicsParams(p),
  inferFrom: (m) =>
    (matches(m, 'Q_TAILSIT_ENABLE', 1) +
     matches(m, 'Q_FRAME_CLASS', 10) +
     matches(m, 'SERVO1_FUNCTION', 77)) / 3,
};
