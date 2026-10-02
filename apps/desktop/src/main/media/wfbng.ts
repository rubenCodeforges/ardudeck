import { t } from '../../shared/i18n/index.js';
/**
 * OpenIPC / RunCam WiFiLink (wfb-ng) ingest helpers.
 *
 * A wfb-ng ground station outputs the received video as RAW RTP over UDP
 * (convention: port 5600). Plain `ffmpeg -i udp://...` cannot parse raw RTP -
 * it expects MPEG-TS or an elementary stream - so this source kind feeds
 * ffmpeg an SDP file describing the RTP session instead. Pure helpers here so
 * the SDP and argument construction are unit-testable.
 */

export type WfbCodec = 'h265' | 'h264';

/** Parse the listen port out of a udp:// url; falls back to 5600. */
export function wfbngPort(url: string | undefined): number {
  const m = url?.match(/:(\d+)\s*$/);
  const port = m ? parseInt(m[1]!, 10) : NaN;
  return Number.isFinite(port) && port > 0 && port <= 65535 ? port : 5600;
}

/**
 * SDP for a raw RTP video session on 0.0.0.0:<port>. OpenIPC builds have used
 * payload types 96-98 across releases, so all three are declared with the
 * selected codec - ffmpeg then accepts whichever the ground station sends.
 */
export function buildWfbngSdp(port: number, codec: WfbCodec): string {
  const rtpName = codec === 'h265' ? 'H265' : 'H264';
  return [
    'v=0',
    'o=- 0 0 IN IP4 127.0.0.1',
    's=wfbng',
    'c=IN IP4 0.0.0.0',
    't=0 0',
    `m=video ${port} RTP/AVP 96 97 98`,
    `a=rtpmap:96 ${rtpName}/90000`,
    `a=rtpmap:97 ${rtpName}/90000`,
    `a=rtpmap:98 ${rtpName}/90000`,
    '',
  ].join('\n');
}

/**
 * ffmpeg arguments for the wfb-ng bridge. H.265 is transcoded to H.264 by
 * default because Electron's WebRTC (the playback path) cannot decode H.265;
 * H.264 input is passed through untouched.
 */
export function buildWfbngFfmpegArgs(sdpPath: string, transcode: boolean, publishUrl: string): string[] {
  return [
    '-protocol_whitelist', 'file,udp,rtp',
    // Loss tolerance: a wfb-ng RF link drops the occasional RTP packet, which
    // fragments H.265 NAL units. Without these, one lost fragment corrupts a
    // keyframe and the decoder never recovers ("unable to decode" forever).
    // discardcorrupt drops only the broken frames; ignore_err keeps the
    // decoder alive until the next clean keyframe arrives.
    '-fflags', 'nobuffer+discardcorrupt+genpts',
    '-flags', 'low_delay',
    '-err_detect', 'ignore_err',
    // Larger analyze window so the decoder can lock onto in-band VPS/SPS/PPS
    // (OpenIPC streams carry parameter sets in-band, not in the SDP).
    '-analyzeduration', '2000000',
    '-probesize', '2000000',
    '-i', sdpPath,
    '-an',
    ...(transcode
      ? ['-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-pix_fmt', 'yuv420p', '-g', '60', '-bf', '0']
      : ['-c', 'copy']),
    '-f', 'rtsp', '-rtsp_transport', 'tcp',
    publishUrl,
  ];
}

/**
 * Why a UDP bridge never started publishing, in words, from that bridge's own
 * ffmpeg output. Null when the output carries no recognisable cause.
 */
export function bridgeFailureReason(ffmpegOutput: string, port: number, codec?: WfbCodec): string | null {
  if (/bind failed: Address already in use/i.test(ffmpegOutput)) {
    return t('main:wfbng.udpPortHeld', { port });
  }
  // H.264 headers read as H.265 come out with a non-zero layer id.
  if (codec === 'h265' && /Multi-layer HEVC coding is not implemented/i.test(ffmpegOutput)) {
    return t('main:wfbng.codecMismatch');
  }
  return null;
}

/** Effective transcode decision: H.265 must be transcoded for WebRTC playback. */
export function wfbngShouldTranscode(codec: WfbCodec, explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit;
  return codec === 'h265';
}
