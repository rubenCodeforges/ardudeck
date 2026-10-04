import {
  COPTER_MODES,
  PLANE_MODES,
  ROVER_MODES,
  SUB_MODES,
  type ArduPilotVehicleClass,
} from '../../../shared/telemetry-types';

/** Spoken clip per mode name. mode_<n> clips were recorded from the copter numbering. */
const CLIP_BY_NAME: Record<string, string> = {
  stabilize: 'mode_0', acro: 'mode_1', althold: 'mode_2', auto: 'mode_3', guided: 'mode_4',
  loiter: 'mode_5', rtl: 'mode_6', circle: 'mode_7', land: 'mode_9', drift: 'mode_11',
  sport: 'mode_13', flip: 'mode_14', autotune: 'mode_15', poshold: 'mode_16', brake: 'mode_17',
  throw: 'mode_18', guidednogps: 'mode_20', smartrtl: 'mode_21', flowhold: 'mode_22',
  zigzag: 'mode_24', autortl: 'mode_27',
  manual: 'mode_manual', training: 'mode_training', flybywirea: 'mode_fbwa', flybywireb: 'mode_fbwb',
  cruise: 'mode_cruise', takeoff: 'mode_takeoff', thermal: 'mode_thermal',
  qstabilize: 'mode_qstabilize', qhover: 'mode_qhover', qloiter: 'mode_qloiter',
  qland: 'mode_qland', qrtl: 'mode_qrtl', qacro: 'mode_qacro',
  steering: 'mode_steering', hold: 'mode_hold', follow: 'mode_follow', simple: 'mode_simple',
  dock: 'mode_dock',
};

/** Modes without a recording of their own still announce that the mode changed. */
export const FALLBACK_CLIP = 'mode_changed';

const TABLES: Record<ArduPilotVehicleClass, Record<number, string>> = {
  copter: COPTER_MODES,
  plane: PLANE_MODES,
  vtol: PLANE_MODES,
  rover: ROVER_MODES,
  sub: SUB_MODES,
};

export function modeClip(name: string): string {
  return CLIP_BY_NAME[name.toLowerCase().replace(/[^a-z]/g, '')] ?? FALLBACK_CLIP;
}

/** hud.cfg `voice=` value: which clip the widget plays for each mode number of this vehicle. */
export function modeVoiceCfg(vehicleClass: ArduPilotVehicleClass): string {
  return Object.entries(TABLES[vehicleClass])
    .map(([num, name]) => `${num}:${modeClip(name)}`)
    .join(',');
}
