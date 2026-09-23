/**
 * H.264 normalizer relay for hub-pulled sources (RTSP / SRT cameras).
 *
 * Electron's WebRTC playback path can only receive H264/VP8/VP9/AV1. When a
 * pulled stream carries no such video track, MediaMTX ingests it fine but
 * answers the renderer's WHEP offer with a bare "400 Bad Request", so the
 * panel shows no video with no usable reason. Two real-world cases:
 *  - the camera sends H.265 (SIYI gimbals switched to H265, most IP cams'
 *    main stream);
 *  - the camera's RTSP SDP misdeclares its H.264 track (old SIYI firmware),
 *    which gortsplib ingests as a "Generic" codec WebRTC won't take.
 * Instead of failing, the engine re-pulls the already-ingested hub path
 * through ffmpeg, publishes a clean H.264 copy alongside it, and hands the
 * renderer that path. ffmpeg identifies the real codec from the bitstream,
 * so both cases normalize without per-camera knowledge. Pure helpers here so
 * the decision and the argument construction are unit-testable.
 */

/** Video codecs Electron's WebRTC stack can receive. */
const WEBRTC_VIDEO = /^(h264|av1|vp8|vp9)/i;

/**
 * True when the hub path needs the relay: it has tracks, none of them
 * WebRTC-playable video. An empty/unknown track list returns false -
 * playback is attempted as-is rather than transcoded on a guess.
 */
export function needsH264Relay(tracks: string[]): boolean {
  return tracks.length > 0 && !tracks.some((t) => WEBRTC_VIDEO.test(t));
}

/**
 * H.264 encoders to try, best first, per platform.
 *
 * One encoder is one point of failure: a build without libx264, a machine
 * whose hardware encoder is missing or busy, a driver that refuses. Trying
 * them in turn means a camera keeps working without anyone having to work out
 * which encoder this particular machine was unhappy with.
 */
export function encoderChain(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') return ['h264_videotoolbox', 'libx264'];
  if (platform === 'win32') return ['libx264', 'h264_mf', 'h264_qsv', 'h264_nvenc'];
  return ['libx264', 'h264_vaapi', 'h264_nvenc'];
}

/** Encoder-specific low-latency flags. Only libx264 takes preset/tune. */
function encoderArgs(encoder: string): string[] {
  if (encoder === 'libx264') {
    return ['-preset', 'ultrafast', '-tune', 'zerolatency', '-bf', '0'];
  }
  if (encoder === 'h264_videotoolbox') return ['-realtime', '1', '-allow_sw', '1'];
  return [];
}

/**
 * ffmpeg arguments for the relay: pull the hub's own RTSP output (single
 * connection to the camera - many, e.g. SIYI, cap concurrent RTSP clients),
 * transcode to low-latency H.264, publish back into the hub. Audio is
 * dropped, same as the wfbng bridge - camera audio is rarely WebRTC-playable
 * and never flight-relevant.
 */
export function buildH264RelayArgs(
  inputUrl: string,
  publishUrl: string,
  encoder = 'libx264',
): string[] {
  return [
    '-rtsp_transport', 'tcp',
    '-fflags', 'nobuffer',
    '-flags', 'low_delay',
    '-i', inputUrl,
    '-an',
    '-c:v', encoder,
    ...encoderArgs(encoder),
    '-pix_fmt', 'yuv420p', '-g', '60',
    '-f', 'rtsp', '-rtsp_transport', 'tcp',
    publishUrl,
  ];
}
