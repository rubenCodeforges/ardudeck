/**
 * RTCM message for injecting into the onboard GPS (used for DGPS)
 * Message ID: 233
 * CRC Extra: 35
 */
export interface GpsRtcmData {
  /** LSB: 1 means message is fragmented, next 2 bits are the fragment ID, the remaining 5 bits are used for the sequence ID. Messages are only to be flushed to the GPS when the entire message has been reconstructed on the autopilot. The fragment ID specifies which order the fragments should be assembled into a buffer, while the sequence ID is used to detect a mismatch between different buffers. The buffer is considered fully reconstructed when either all 4 fragments are present, or all the fragments before the first fragment with a non full payload is received. This management is used to ensure that normal GPS operation doesn't corrupt RTCM data, and to recover from a unreliable transport delivery order. */
  flags: number;
  /** data length (bytes) */
  len: number;
  /** RTCM message (may be fragmented) */
  data: number[];
}

export const GPS_RTCM_DATA_ID = 233;
export const GPS_RTCM_DATA_CRC_EXTRA = 35;
export const GPS_RTCM_DATA_MIN_LENGTH = 182;
export const GPS_RTCM_DATA_MAX_LENGTH = 182;

export function serializeGpsRtcmData(msg: GpsRtcmData): Uint8Array {
  const buffer = new Uint8Array(182);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.flags & 0xff;
  buffer[1] = msg.len & 0xff;
  // Array: data
  for (let i = 0; i < 180; i++) {
    buffer[2 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeGpsRtcmData(payload: Uint8Array): GpsRtcmData {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    flags: payload[0],
    len: payload[1],
    data: Array.from({ length: 180 }, (_, i) => payload[2 + i * 1]),
  };
}