/**
 * Status of AP_Limits. Sent in extended status stream when AP_Limits is enabled.
 * Message ID: 167
 * CRC Extra: 144
 */
export interface LimitsStatus {
  /** State of AP_Limits. */
  limitsState: number;
  /** Time (since boot) of last breach. (ms) */
  lastTrigger: number;
  /** Time (since boot) of last recovery action. (ms) */
  lastAction: number;
  /** Time (since boot) of last successful recovery. (ms) */
  lastRecovery: number;
  /** Time (since boot) of last all-clear. (ms) */
  lastClear: number;
  /** Number of fence breaches. */
  breachCount: number;
  /** AP_Limit_Module bitfield of enabled modules. */
  modsEnabled: number;
  /** AP_Limit_Module bitfield of required modules. */
  modsRequired: number;
  /** AP_Limit_Module bitfield of triggered modules. */
  modsTriggered: number;
}

export const LIMITS_STATUS_ID = 167;
export const LIMITS_STATUS_CRC_EXTRA = 144;
export const LIMITS_STATUS_MIN_LENGTH = 22;
export const LIMITS_STATUS_MAX_LENGTH = 22;

export function serializeLimitsStatus(msg: LimitsStatus): Uint8Array {
  const buffer = new Uint8Array(22);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.lastTrigger, true);
  view.setUint32(4, msg.lastAction, true);
  view.setUint32(8, msg.lastRecovery, true);
  view.setUint32(12, msg.lastClear, true);
  view.setUint16(16, msg.breachCount, true);
  buffer[18] = msg.limitsState & 0xff;
  buffer[19] = msg.modsEnabled & 0xff;
  buffer[20] = msg.modsRequired & 0xff;
  buffer[21] = msg.modsTriggered & 0xff;

  return buffer;
}

export function deserializeLimitsStatus(payload: Uint8Array): LimitsStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    lastTrigger: view.getUint32(0, true),
    lastAction: view.getUint32(4, true),
    lastRecovery: view.getUint32(8, true),
    lastClear: view.getUint32(12, true),
    breachCount: view.getUint16(16, true),
    limitsState: payload[18],
    modsEnabled: payload[19],
    modsRequired: payload[20],
    modsTriggered: payload[21],
  };
}