/**
 * Information about key components of GNSS receivers, like signal authentication, interference and system errors.
 * Message ID: 441
 * CRC Extra: 169
 */
export interface GnssIntegrity {
  /** GNSS receiver id. Must match instance ids of other messages from same receiver. */
  id: number;
  /** Errors in the GPS system. */
  systemErrors: number;
  /** Signal authentication state of the GPS system. */
  authenticationState: number;
  /** Signal jamming state of the GPS system. */
  jammingState: number;
  /** Signal spoofing state of the GPS system. */
  spoofingState: number;
  /** The state of the RAIM processing. */
  raimState: number;
  /** Horizontal expected accuracy using satellites successfully validated using RAIM. (cm) */
  raimHfom: number;
  /** Vertical expected accuracy using satellites successfully validated using RAIM. (cm) */
  raimVfom: number;
  /** An abstract value representing the estimated quality of incoming corrections, or 255 if not available. */
  correctionsQuality: number;
  /** An abstract value representing the overall status of the receiver, or 255 if not available. */
  systemStatusSummary: number;
  /** An abstract value representing the quality of incoming GNSS signals, or 255 if not available. */
  gnssSignalQuality: number;
  /** An abstract value representing the estimated PPK quality, or 255 if not available. */
  postProcessingQuality: number;
}

export const GNSS_INTEGRITY_ID = 441;
export const GNSS_INTEGRITY_CRC_EXTRA = 169;
export const GNSS_INTEGRITY_MIN_LENGTH = 17;
export const GNSS_INTEGRITY_MAX_LENGTH = 17;

export function serializeGnssIntegrity(msg: GnssIntegrity): Uint8Array {
  const buffer = new Uint8Array(17);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.systemErrors, true);
  view.setUint16(4, msg.raimHfom, true);
  view.setUint16(6, msg.raimVfom, true);
  buffer[8] = msg.id & 0xff;
  buffer[9] = msg.authenticationState & 0xff;
  buffer[10] = msg.jammingState & 0xff;
  buffer[11] = msg.spoofingState & 0xff;
  buffer[12] = msg.raimState & 0xff;
  buffer[13] = msg.correctionsQuality & 0xff;
  buffer[14] = msg.systemStatusSummary & 0xff;
  buffer[15] = msg.gnssSignalQuality & 0xff;
  buffer[16] = msg.postProcessingQuality & 0xff;

  return buffer;
}

export function deserializeGnssIntegrity(payload: Uint8Array): GnssIntegrity {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    systemErrors: view.getUint32(0, true),
    raimHfom: view.getUint16(4, true),
    raimVfom: view.getUint16(6, true),
    id: payload[8],
    authenticationState: payload[9],
    jammingState: payload[10],
    spoofingState: payload[11],
    raimState: payload[12],
    correctionsQuality: payload[13],
    systemStatusSummary: payload[14],
    gnssSignalQuality: payload[15],
    postProcessingQuality: payload[16],
  };
}