/**
 * Information about video stream. It may be requested using MAV_CMD_REQUEST_MESSAGE, where param2 indicates the video stream id: 0 for all streams, 1 for first, 2 for second, etc.
 * Message ID: 269
 * CRC Extra: 51
 */
export interface VideoStreamInformation {
  /** Video Stream ID (1 for first, 2 for second, etc.) */
  streamId: number;
  /** Number of streams available. */
  count: number;
  /** Type of stream. */
  type: number;
  /** Bitmap of stream status flags. */
  flags: number;
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
  /** Horizontal Field of view. (deg) */
  hfov: number;
  /** Stream name. */
  name: string;
  /** Video stream URI (TCP or RTSP URI ground station should connect to) or port number (UDP port ground station should listen to). */
  uri: string;
  /** Encoding of stream. */
  encoding: number;
}

export const VIDEO_STREAM_INFORMATION_ID = 269;
export const VIDEO_STREAM_INFORMATION_CRC_EXTRA = 51;
export const VIDEO_STREAM_INFORMATION_MIN_LENGTH = 214;
export const VIDEO_STREAM_INFORMATION_MAX_LENGTH = 214;

export function serializeVideoStreamInformation(msg: VideoStreamInformation): Uint8Array {
  const buffer = new Uint8Array(214);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.framerate, true);
  view.setUint32(4, msg.bitrate, true);
  view.setUint16(8, msg.flags, true);
  view.setUint16(10, msg.resolutionH, true);
  view.setUint16(12, msg.resolutionV, true);
  view.setUint16(14, msg.rotation, true);
  view.setUint16(16, msg.hfov, true);
  buffer[18] = msg.streamId & 0xff;
  buffer[19] = msg.count & 0xff;
  buffer[20] = msg.type & 0xff;
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 32), 21);
  // String: uri
  const uriBytes = new TextEncoder().encode(msg.uri || '');
  buffer.set(uriBytes.slice(0, 160), 53);
  buffer[213] = msg.encoding & 0xff;

  return buffer;
}

export function deserializeVideoStreamInformation(payload: Uint8Array): VideoStreamInformation {
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
    count: payload[19],
    type: payload[20],
    name: new TextDecoder().decode(payload.slice(21, 53)).replace(/\0.*$/, ''),
    uri: new TextDecoder().decode(payload.slice(53, 213)).replace(/\0.*$/, ''),
    encoding: payload[213],
  };
}