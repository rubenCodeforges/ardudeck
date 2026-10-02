import type { StreamPublishStats } from '../../../shared/camera-types';
import { candidateSummary, trackPeer } from './webrtc-diag';

export { candidateSummary };

/** WHIP publisher, the send-side twin of camera/whep.ts. MediaMTX re-serves the track over RTSP. */

interface CodecLike {
  mimeType: string;
  sdpFmtpLine?: string;
}

const HELPER_CODECS = new Set(['video/rtx', 'video/red', 'video/ulpfec', 'video/flexfec-03']);

/** H.264 baseline first, VP8 fallback; VP9/AV1 dropped so every RTSP reader (OpenCV) can decode. */
export function orderPublishCodecs<T extends CodecLike>(codecs: T[]): T[] {
  const rank = (c: T): number => {
    const mime = c.mimeType.toLowerCase();
    if (mime === 'video/h264') {
      const fmtp = c.sdpFmtpLine ?? '';
      const mode1 = /packetization-mode=1/.test(fmtp);
      if (mode1 && /profile-level-id=42e0/i.test(fmtp)) return 0;
      return mode1 ? 1 : 2;
    }
    if (mime === 'video/vp8') return 3;
    if (HELPER_CODECS.has(mime)) return 4;
    return -1;
  };
  return codecs
    .map((c) => ({ c, r: rank(c) }))
    .filter((x) => x.r >= 0)
    .sort((a, b) => a.r - b.r)
    .map((x) => x.c);
}

/** Longest side sent, so a full-screen retina window stays in a sane encoder level. */
export const MAX_STREAM_EDGE = 1920;

export function streamDownscale(width: number, height: number, maxEdge = MAX_STREAM_EDGE): number {
  const edge = Math.max(width, height);
  return edge > maxEdge ? edge / maxEdge : 1;
}

export type PublishStats = StreamPublishStats;

/** Pulls the video outbound-rtp entry out of a getStats() report. */
export function readPublishStats(report: Iterable<Record<string, unknown>>): PublishStats | null {
  for (const s of report) {
    if (s.type !== 'outbound-rtp' || s.kind !== 'video') continue;
    const num = (v: unknown) => (typeof v === 'number' ? v : null);
    return {
      encoder: typeof s.encoderImplementation === 'string' ? s.encoderImplementation : null,
      hardware: typeof s.powerEfficientEncoder === 'boolean' ? s.powerEfficientEncoder : null,
      fps: num(s.framesPerSecond),
      width: num(s.frameWidth),
      height: num(s.frameHeight),
      limitedBy: typeof s.qualityLimitationReason === 'string' ? s.qualityLimitationReason : null,
    };
  }
  return null;
}

export interface WhipSession {
  pc: RTCPeerConnection;
  /** Negotiated codec, e.g. "H264" or "VP8". */
  codec: string;
  stats: () => Promise<PublishStats | null>;
  /** One-line account of the connection for a failure report: state timeline, candidates, pair results. */
  describe: () => Promise<string>;
  close: () => Promise<void>;
}

export async function publishWhip(
  track: MediaStreamTrack,
  whipUrl: string,
  opts: { scaleDown?: number; maxBitrate?: number; maxFramerate?: number } = {},
): Promise<WhipSession> {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const setRemote = trackPeer(`publish ${whipUrl}`, pc);
  const t0 = performance.now();
  const timeline: string[] = [];
  const mark = (what: string) => timeline.push(`${what}@${Math.round(performance.now() - t0)}ms`);
  pc.addEventListener('iceconnectionstatechange', () => mark(`ice:${pc.iceConnectionState}`));
  pc.addEventListener('connectionstatechange', () => mark(`conn:${pc.connectionState}`));
  const transceiver = pc.addTransceiver(track, {
    direction: 'sendonly',
    sendEncodings: [{
      scaleResolutionDownBy: opts.scaleDown ?? 1,
      maxBitrate: opts.maxBitrate ?? 8_000_000,
      maxFramerate: opts.maxFramerate ?? 30,
    }],
  });
  const caps = RTCRtpSender.getCapabilities('video');
  if (caps) {
    const ordered = orderPublishCodecs(caps.codecs);
    if (ordered.length) transceiver.setCodecPreferences(ordered);
  }

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitForIce(pc);

  let res: Response;
  try {
    res = await fetch(whipUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/sdp' },
      body: pc.localDescription?.sdp ?? '',
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    pc.close();
    throw new Error(`WHIP unreachable: ${err instanceof Error ? err.message : String(err)}`); // i18n-exempt: protocol diagnostic
  }
  if (!res.ok) {
    const reason = (await res.text().catch(() => '')).trim().slice(0, 200);
    pc.close();
    throw new Error(`WHIP ${res.status} ${reason || res.statusText}`.trim());
  }
  const location = res.headers.get('location');
  const answer = await res.text();
  setRemote(answer);
  await pc.setRemoteDescription({ type: 'answer', sdp: answer });

  // CV readers want stable frame geometry, so shed frame rate under load instead.
  const params = transceiver.sender.getParameters();
  params.degradationPreference = 'maintain-resolution';
  await transceiver.sender.setParameters(params).catch(() => {/* unsupported */});

  const codec = (transceiver.sender.getParameters().codecs?.[0]?.mimeType ?? 'video/?').replace(/^video\//i, '');
  const sessionUrl = location ? new URL(location, whipUrl).toString() : null;

  return {
    pc,
    codec,
    stats: async () => readPublishStats((await transceiver.sender.getStats()).values() as Iterable<Record<string, unknown>>),
    describe: async () => {
      const pairs: string[] = [];
      try {
        (await pc.getStats()).forEach((s: Record<string, unknown>) => {
          if (s.type === 'candidate-pair') pairs.push(`${String(s.state)} sent=${String(s.requestsSent ?? '?')} recv=${String(s.responsesReceived ?? '?')}`);
        });
      } catch { /* closed */ }
      return [
        `timeline ${timeline.join(' ') || 'none'}`,
        `local ${candidateSummary(pc.localDescription?.sdp ?? '')}`,
        `remote ${candidateSummary(answer)}`,
        `pairs ${pairs.join('; ') || 'none'}`,
      ].join(' | ');
    },
    close: async () => {
      if (sessionUrl) await fetch(sessionUrl, { method: 'DELETE' }).catch(() => {/* hub gone */});
      pc.close();
    },
  };
}

function waitForIce(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, 1500);
  });
}
