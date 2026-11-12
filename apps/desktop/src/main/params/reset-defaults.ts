export const MAV_CMD_PREFLIGHT_STORAGE = 245;
/** PARAM_RESET_CONFIG_DEFAULT: ArduPilot answers with AP_Param::erase_all(). */
export const PREFLIGHT_STORAGE_RESET = 2;
const MAV_RESULT_ACCEPTED = 0;

export interface ResetDefaultsDeps {
  /** Resolves with the MAV_RESULT of the next COMMAND_ACK for `command`, or null on timeout. Armed before the send. */
  awaitAck(command: number, timeoutMs: number): Promise<number | null>;
  sendCommand(command: number, param1: number): Promise<void>;
  setParam(paramId: string, value: number): Promise<boolean>;
}

export type ResetMethod = 'preflight-storage' | 'format-version';

/** Erases stored parameters; the caller reboots. Fallback: FORMAT_VERSION = 0 fails the boot-time format check, which erases too. */
/** PX4 answers param1 = 2 with ResetAllConfig, which keeps CAL_* calibration; it has no FORMAT_VERSION, so no fallback there. */
export async function eraseAllParameters(deps: ResetDefaultsDeps, ackTimeoutMs = 3000, formatVersionFallback = true): Promise<{ ok: true; method: ResetMethod } | { ok: false }> {
  const ack = deps.awaitAck(MAV_CMD_PREFLIGHT_STORAGE, ackTimeoutMs);
  await deps.sendCommand(MAV_CMD_PREFLIGHT_STORAGE, PREFLIGHT_STORAGE_RESET);
  if ((await ack) === MAV_RESULT_ACCEPTED) return { ok: true, method: 'preflight-storage' };
  if (!formatVersionFallback) return { ok: false };
  return (await deps.setParam('FORMAT_VERSION', 0)) ? { ok: true, method: 'format-version' } : { ok: false };
}
