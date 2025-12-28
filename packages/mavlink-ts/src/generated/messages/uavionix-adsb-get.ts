/**
 * Request messages.
 * Message ID: 10006
 * CRC Extra: 193
 */
export interface UavionixAdsbGet {
  /** Message ID to request. Supports any message in this 10000-10099 range */
  reqmessageid: number;
}

export const UAVIONIX_ADSB_GET_ID = 10006;
export const UAVIONIX_ADSB_GET_CRC_EXTRA = 193;
export const UAVIONIX_ADSB_GET_MIN_LENGTH = 4;
export const UAVIONIX_ADSB_GET_MAX_LENGTH = 4;

export function serializeUavionixAdsbGet(msg: UavionixAdsbGet): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.reqmessageid, true);

  return buffer;
}

export function deserializeUavionixAdsbGet(payload: Uint8Array): UavionixAdsbGet {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    reqmessageid: view.getUint32(0, true),
  };
}