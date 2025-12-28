/**
 * Video stream encodings
 */
export enum VideoStreamEncoding {
  /** Stream encoding is unknown */
  VIDEO_STREAM_ENCODING_UNKNOWN = 0,
  /** Stream encoding is H.264 */
  VIDEO_STREAM_ENCODING_H264 = 1,
  /** Stream encoding is H.265 */
  VIDEO_STREAM_ENCODING_H265 = 2,
}

/** @deprecated Use VideoStreamEncoding instead */
export const VIDEO_STREAM_ENCODING = VideoStreamEncoding;