/**
 * Information about video stream
 * Message ID: 50002
 * CRC Extra: 181
 */
export interface HerelinkVideoStreamInformation {
  /** Video Stream ID (1 for first, 2 for second, etc.) */
  cameraId: number;
  /** Number of streams available. */
  status: number;
  /** Frame rate. (Hz) */
  framerate: number;
  /** Horizontal resolution. (pix) */
  resolutionH: number;
  /** Vertical resolution. (pix) */
  resolutionV: number;
  /** Bit rate. (bits/s) */
  bitrate: number;
  /** Video image rotation clockwise. (deg) */
  rotation: number;
  /** Video stream URI (TCP or RTSP URI ground station should connect to) or port number (UDP port ground station should listen to). */
  uri: string;
}

export const HERELINK_VIDEO_STREAM_INFORMATION_ID = 50002;
export const HERELINK_VIDEO_STREAM_INFORMATION_CRC_EXTRA = 181;
export const HERELINK_VIDEO_STREAM_INFORMATION_MIN_LENGTH = 246;
export const HERELINK_VIDEO_STREAM_INFORMATION_MAX_LENGTH = 246;

export function serializeHerelinkVideoStreamInformation(msg: HerelinkVideoStreamInformation): Uint8Array {
  const buffer = new Uint8Array(246);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.framerate, true);
  view.setUint32(4, msg.bitrate, true);
  view.setUint16(8, msg.resolutionH, true);
  view.setUint16(10, msg.resolutionV, true);
  view.setUint16(12, msg.rotation, true);
  buffer[14] = msg.cameraId & 0xff;
  buffer[15] = msg.status & 0xff;
  // String: uri
  const uriBytes = new TextEncoder().encode(msg.uri || '');
  buffer.set(uriBytes.slice(0, 230), 16);

  return buffer;
}

export function deserializeHerelinkVideoStreamInformation(payload: Uint8Array): HerelinkVideoStreamInformation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    framerate: view.getFloat32(0, true),
    bitrate: view.getUint32(4, true),
    resolutionH: view.getUint16(8, true),
    resolutionV: view.getUint16(10, true),
    rotation: view.getUint16(12, true),
    cameraId: payload[14],
    status: payload[15],
    uri: new TextDecoder().decode(payload.slice(16, 246)).replace(/\0.*$/, ''),
  };
}