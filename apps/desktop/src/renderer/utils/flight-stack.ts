import type { MissionFirmware } from '../stores/settings-store';
import { DEFAULT_RC_FUNCTIONS, type RcFunctionMap } from './pseudo-tx';

/** Which flight stack is on the link, for UI that differs per stack (RC order, config screens). */
export type FlightStack = 'ardupilot' | 'px4' | 'inav' | 'generic';

export interface FlightStackLink {
  isConnected?: boolean;
  protocol?: string;
  fcVariant?: string;
  firmware?: string;
  paramsUnsupported?: boolean;
}

/** Generic MAVLink autopilots don't name their stack: an empty param reply means INAV, else the planner toggle decides. */
export function flightStack(link: FlightStackLink, toggle: MissionFirmware): FlightStack {
  if (link.protocol === 'msp') return link.fcVariant === 'INAV' ? 'inav' : 'generic';
  if (link.paramsUnsupported) return 'inav';
  if (link.firmware === 'px4') return 'px4';
  if (link.firmware === 'custom') return toggle === 'inav' ? 'inav' : 'generic';
  return 'ardupilot';
}

/** INAV sends RC_CHANNELS after its own rcmap, in its fixed ROLL, PITCH, YAW, THROTTLE order. */
export const INAV_MAVLINK_RC: RcFunctionMap = { roll: 1, pitch: 2, yaw: 3, throttle: 4 };

/** Which RC channel carries each stick function on this link. */
export function rcFunctionsFor(
  parameters: ReadonlyMap<string, { value: number | string }>,
  stack: FlightStack,
): RcFunctionMap {
  if (stack === 'inav') return INAV_MAVLINK_RC;
  const read = (name: string, fallback: number) => {
    const v = parameters.get(name)?.value;
    return typeof v === 'number' && v >= 1 ? v : fallback;
  };
  return {
    roll: read('RCMAP_ROLL', DEFAULT_RC_FUNCTIONS.roll),
    pitch: read('RCMAP_PITCH', DEFAULT_RC_FUNCTIONS.pitch),
    throttle: read('RCMAP_THROTTLE', DEFAULT_RC_FUNCTIONS.throttle),
    yaw: read('RCMAP_YAW', DEFAULT_RC_FUNCTIONS.yaw),
  };
}
