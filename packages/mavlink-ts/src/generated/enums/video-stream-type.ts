/**
 * Video stream types
 */
export enum VideoStreamType {
  /** Stream is RTSP */
  VIDEO_STREAM_TYPE_RTSP = 0,
  /** Stream is RTP UDP (URI gives the port number) */
  VIDEO_STREAM_TYPE_RTPUDP = 1,
  /** Stream is MPEG on TCP */
  VIDEO_STREAM_TYPE_TCP_MPEG = 2,
  /** Stream is MPEG TS (URI gives the port number) */
  VIDEO_STREAM_TYPE_MPEG_TS = 3,
}

/** @deprecated Use VideoStreamType instead */
export const VIDEO_STREAM_TYPE = VideoStreamType;