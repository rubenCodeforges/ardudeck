/**
 * RC Channel Name Constants
 *
 * Shared channel naming for MSP and MAVLink protocols.
 *
 * IMPORTANT: MSP_RC returns raw receiver channels in the receiver's physical order.
 * The order depends on the receiver protocol (e.g. SBUS uses AETR, Spektrum uses TAER).
 * The rxMap (MSP_RX_MAP) tells us which physical channel maps to which logical function.
 * Use reorderChannels() to convert raw channels into logical RPYT order for display.
 */

/** Logical channel names — always Roll, Pitch, Yaw, Throttle after rxMap reordering */
export const LOGICAL_CHANNEL_NAMES = [
  'Roll', 'Pitch', 'Yaw', 'Throttle',
  'AUX1', 'AUX2', 'AUX3', 'AUX4',
  'AUX5', 'AUX6', 'AUX7', 'AUX8',
  'AUX9', 'AUX10', 'AUX11', 'AUX12',
] as const;

/** @deprecated Use LOGICAL_CHANNEL_NAMES + reorderChannels() instead */
export const MSP_CHANNEL_NAMES = LOGICAL_CHANNEL_NAMES;

export const MAVLINK_CHANNEL_NAMES = [
  'Roll', 'Pitch', 'Throttle', 'Yaw',
  'CH5', 'CH6', 'CH7', 'CH8', 'CH9', 'CH10',
  'CH11', 'CH12', 'CH13', 'CH14', 'CH15', 'CH16', 'CH17', 'CH18',
] as const;

export const PRIMARY_CHANNEL_COUNT = 4;

export function getChannelName(index: number, protocol: 'msp' | 'mavlink'): string {
  const names = protocol === 'msp' ? LOGICAL_CHANNEL_NAMES : MAVLINK_CHANNEL_NAMES;
  return names[index] ?? `CH${index + 1}`;
}

/**
 * Build MAVLink channel names based on RCMAP_* parameters.
 *
 * MAVLink RC_CHANNELS sends physical channel values (ch1, ch2, ...).
 * RCMAP_* tells us which physical channel carries which function.
 * Returns a name array indexed by physical channel (0-based).
 */
export function getMavlinkChannelNames(rcmap: { roll: number; pitch: number; throttle: number; yaw: number }): string[] {
  const names: string[] = Array.from({ length: 18 }, (_, i) => `CH${i + 1}`);

  // RCMAP values are 1-based channel numbers
  if (rcmap.roll >= 1 && rcmap.roll <= 18) names[rcmap.roll - 1] = 'Roll';
  if (rcmap.pitch >= 1 && rcmap.pitch <= 18) names[rcmap.pitch - 1] = 'Pitch';
  if (rcmap.throttle >= 1 && rcmap.throttle <= 18) names[rcmap.throttle - 1] = 'Throttle';
  if (rcmap.yaw >= 1 && rcmap.yaw <= 18) names[rcmap.yaw - 1] = 'Yaw';

  // Label remaining channels 5+ as CHx (AUX)
  return names;
}

/**
 * Reorder raw MSP_RC channels into logical order using the rxMap.
 *
 * MSP_RC returns channels in the receiver's physical order (e.g. AETR for SBUS).
 * rxMap[logicalIndex] = physicalChannel (e.g. rxMap = [0,1,3,2] for AETR).
 * This function returns channels in logical order: Roll, Pitch, Yaw, Throttle, AUX1...
 *
 * Only the first 4 channels are reordered; AUX channels (index 4+) pass through unchanged.
 */
export function reorderChannels<T>(rawChannels: T[], rxMap: number[]): T[] {
  if (rxMap.length < 4) return rawChannels;

  const reordered = [...rawChannels];
  for (let logical = 0; logical < 4; logical++) {
    const physical = rxMap[logical];
    if (physical !== undefined && physical < rawChannels.length) {
      reordered[logical] = rawChannels[physical]!;
    }
  }
  return reordered;
}
