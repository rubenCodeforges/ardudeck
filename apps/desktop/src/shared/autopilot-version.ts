export interface AutopilotIdentity {
  /** uid2 hex when present, else uid hex; null when the board reports no hardware id. */
  boardUid: string | null;
  /** board_version; ArduPilot puts the APJ board id in the upper 16 bits. */
  boardVersion: number;
  /** "major.minor.patch", null when flight_sw_version is 0. */
  firmwareVersion: string | null;
  flightSwVersion: number;
}

/**
 * AUTOPILOT_VERSION (148) wire order (v2 size-sorted): capabilities(8), uid(8),
 * flight_sw_version(4), middleware(4), os(4), board_version(4), vendor(2),
 * product(2), 3x custom_version(8), uid2(18). Short payloads are zero-padded:
 * MAVLink v2 trims trailing zeros.
 */
export function decodeAutopilotVersion(payload: Uint8Array): AutopilotIdentity {
  const p = new Uint8Array(78);
  p.set(payload.subarray(0, 78));
  const view = new DataView(p.buffer);
  const uid = view.getBigUint64(8, true);
  const uid2 = p.subarray(60, 78);
  const flightSwVersion = view.getUint32(16, true);
  let boardUid: string | null = null;
  if (uid2.some((b) => b !== 0)) boardUid = Array.from(uid2).map((b) => b.toString(16).padStart(2, '0')).join('');
  else if (uid !== 0n) boardUid = uid.toString(16);
  return {
    boardUid,
    boardVersion: view.getUint32(28, true),
    firmwareVersion: flightSwVersion > 0
      ? `${(flightSwVersion >> 24) & 0xff}.${(flightSwVersion >> 16) & 0xff}.${(flightSwVersion >> 8) & 0xff}`
      : null,
    flightSwVersion,
  };
}
