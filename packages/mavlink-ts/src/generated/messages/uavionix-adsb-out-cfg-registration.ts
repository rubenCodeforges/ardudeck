/**
 * Aircraft Registration.
 * Message ID: 10004
 * CRC Extra: 133
 */
export interface UavionixAdsbOutCfgRegistration {
  /** Aircraft Registration (ASCII string A-Z, 0-9 only), e.g. "N8644B ". Trailing spaces (0x20) only. This is null-terminated. */
  registration: string;
}

export const UAVIONIX_ADSB_OUT_CFG_REGISTRATION_ID = 10004;
export const UAVIONIX_ADSB_OUT_CFG_REGISTRATION_CRC_EXTRA = 133;
export const UAVIONIX_ADSB_OUT_CFG_REGISTRATION_MIN_LENGTH = 9;
export const UAVIONIX_ADSB_OUT_CFG_REGISTRATION_MAX_LENGTH = 9;

export function serializeUavionixAdsbOutCfgRegistration(msg: UavionixAdsbOutCfgRegistration): Uint8Array {
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);

  // String: registration
  const registrationBytes = new TextEncoder().encode(msg.registration || '');
  buffer.set(registrationBytes.slice(0, 9), 0);

  return buffer;
}

export function deserializeUavionixAdsbOutCfgRegistration(payload: Uint8Array): UavionixAdsbOutCfgRegistration {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    registration: new TextDecoder().decode(payload.slice(0, 9)).replace(/\0.*$/, ''),
  };
}