/**
 * Information about the status of a video stream. It may be requested using MAV_CMD_REQUEST_MESSAGE.
 * Message ID: 270
 * CRC Extra: 59
 */
export interface VideoStreamStatus {
  /** Video Stream ID (1 for first, 2 for second, etc.) */
  streamId: number;
  /** Bitmap of stream status flags */
  flags: number;
  /** Frame rate (Hz) */
  framerate: number;
  /** Horizontal resolution (pix) */
  resolutionH: number;
  /** Vertical resolution (pix) */
  resolutionV: number;
  /** Bit rate (bits/s) */
  bitrate: number;
  /** Video image rotation clockwise (deg) */
  rotation: number;
  /** Horizontal Field of view (deg) */
  hfov: number;
}

export const VIDEO_STREAM_STATUS_ID = 270;
export const VIDEO_STREAM_STATUS_CRC_EXTRA = 59;
export const VIDEO_STREAM_STATUS_MIN_LENGTH = 19;
export const VIDEO_STREAM_STATUS_MAX_LENGTH = 19;

export function serializeVideoStreamStatus(msg: VideoStreamStatus): Uint8Array {
  const buffer = new Uint8Array(19);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.framerate, true);
  view.setUint32(4, msg.bitrate, true);
  view.setUint16(8, msg.flags, true);
  view.setUint16(10, msg.resolutionH, true);
  view.setUint16(12, msg.resolutionV, true);
  view.setUint16(14, msg.rotation, true);
  view.setUint16(16, msg.hfov, true);
  buffer[18] = msg.streamId & 0xff;

  return buffer;
}

export function deserializeVideoStreamStatus(payload: Uint8Array): VideoStreamStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    framerate: view.getFloat32(0, true),
    bitrate: view.getUint32(4, true),
    flags: view.getUint16(8, true),
    resolutionH: view.getUint16(10, true),
    resolutionV: view.getUint16(12, true),
    rotation: view.getUint16(14, true),
    hfov: view.getUint16(16, true),
    streamId: payload[18],
  };
}