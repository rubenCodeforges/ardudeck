/**
 * Which firmware's mission command set the plan editor should offer.
 *
 * One rule, one place. This used to be decided independently in
 * WaypointTablePanel and MissionToolbar, and both spelled it
 * `'ardupilot' | 'inav'`, so a PX4 vehicle silently fell into the ArduPilot
 * branch and the editor offered commands PX4 rejects at upload.
 *
 * Connected: the link decides, because HEARTBEAT is authoritative and a stale
 * manual choice would be worse than no choice. Disconnected: the user's toggle
 * decides, since offline planning has nothing else to go on.
 */

import type { MissionFirmware } from '../stores/settings-store';

export interface MissionFirmwareLink {
  isConnected?: boolean;
  /** 'mavlink' | 'msp' | ... */
  protocol?: string;
  /** MSP only: 'INAV' | 'BTFL' | ... */
  fcVariant?: string;
  /** MAVLink only, from HEARTBEAT's autopilot field. */
  firmware?: string;
}

/**
 * Firmware detected from the live link, or null when nothing is connected and
 * the caller should fall back to the user's setting.
 */
export function detectMissionFirmware(link: MissionFirmwareLink): MissionFirmware | null {
  if (!link.isConnected) return null;
  if (link.protocol === 'msp' && link.fcVariant === 'INAV') return 'inav';
  if (link.firmware === 'px4') return 'px4';
  // A generic autopilot (INAV over MAVLink, the Vehicle SDK) does not say which stack it is: the toggle decides.
  if (link.firmware === 'custom') return null;
  return 'ardupilot';
}

/** Detected firmware if connected, otherwise the user's offline choice. */
export function effectiveMissionFirmware(
  link: MissionFirmwareLink,
  setting: MissionFirmware,
): MissionFirmware {
  return detectMissionFirmware(link) ?? setting;
}
