export enum MavlinkDataStreamType {
  MAVLINK_DATA_STREAM_IMG_JPEG = 0,
  MAVLINK_DATA_STREAM_IMG_BMP = 1,
  MAVLINK_DATA_STREAM_IMG_RAW8U = 2,
  MAVLINK_DATA_STREAM_IMG_RAW32U = 3,
  MAVLINK_DATA_STREAM_IMG_PGM = 4,
  MAVLINK_DATA_STREAM_IMG_PNG = 5,
}

/** @deprecated Use MavlinkDataStreamType instead */
export const MAVLINK_DATA_STREAM_TYPE = MavlinkDataStreamType;