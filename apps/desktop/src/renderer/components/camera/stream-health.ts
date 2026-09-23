/**
 * What the video link is actually doing, from the WebRTC receiver's own stats.
 *
 * "It looks like it is degrading" is unanswerable by eye: a dropping framerate,
 * a transcode falling behind, and a phone thermally throttling its encoder all
 * look like the same smeary picture. The receiver already counts the difference,
 * so read it rather than guess: bitrate and framerate say whether frames are
 * arriving, packet loss and freezes say whether the network is dropping them,
 * and decode drops say whether this machine cannot keep up.
 */

/** One sample of the inbound video track, plucked from an RTCStatsReport. */
export interface StreamSample {
  timestampMs: number;
  bytesReceived: number;
  packetsReceived: number;
  packetsLost: number;
  framesDecoded: number;
  framesDropped: number;
  frameWidth?: number;
  frameHeight?: number;
  /** The receiver's own framerate estimate, when it offers one. */
  framesPerSecond?: number;
  jitterSeconds?: number;
  freezeCount?: number;
  totalFreezesDuration?: number;
  /** Keyframe requests sent upstream: a sign of loss the decoder could not hide. */
  pliCount?: number;
  nackCount?: number;
}

export interface StreamHealth {
  bitrateKbps: number;
  fps: number;
  /** Share of expected packets that never arrived, over this interval, in percent. */
  lossPct: number;
  jitterMs: number;
  /** Frames the decoder threw away because it could not keep up. */
  droppedFrames: number;
  freezes: number;
  freezeSeconds: number;
  keyframeRequests: number;
  width?: number;
  height?: number;
}

/** Pull the one inbound video entry out of a report, or null when absent. */
export function sampleFromReport(report: RTCStatsReport, atMs: number): StreamSample | null {
  let found: StreamSample | null = null;
  report.forEach((entry) => {
    const s = entry as Record<string, unknown>;
    if (s.type !== 'inbound-rtp' || s.kind !== 'video') return;
    found = {
      timestampMs: typeof s.timestamp === 'number' ? s.timestamp : atMs,
      bytesReceived: num(s.bytesReceived),
      packetsReceived: num(s.packetsReceived),
      packetsLost: num(s.packetsLost),
      framesDecoded: num(s.framesDecoded),
      framesDropped: num(s.framesDropped),
      ...(typeof s.frameWidth === 'number' ? { frameWidth: s.frameWidth } : {}),
      ...(typeof s.frameHeight === 'number' ? { frameHeight: s.frameHeight } : {}),
      ...(typeof s.framesPerSecond === 'number' ? { framesPerSecond: s.framesPerSecond } : {}),
      ...(typeof s.jitter === 'number' ? { jitterSeconds: s.jitter } : {}),
      ...(typeof s.freezeCount === 'number' ? { freezeCount: s.freezeCount } : {}),
      ...(typeof s.totalFreezesDuration === 'number' ? { totalFreezesDuration: s.totalFreezesDuration } : {}),
      ...(typeof s.pliCount === 'number' ? { pliCount: s.pliCount } : {}),
      ...(typeof s.nackCount === 'number' ? { nackCount: s.nackCount } : {}),
    };
  });
  return found;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Rates between two samples. Counters are cumulative and reset when the feed
 * reconnects, so a negative delta means a new stream, not a negative bitrate.
 */
export function healthBetween(previous: StreamSample, current: StreamSample): StreamHealth | null {
  const seconds = (current.timestampMs - previous.timestampMs) / 1000;
  if (!(seconds > 0)) return null;

  const bytes = current.bytesReceived - previous.bytesReceived;
  const decoded = current.framesDecoded - previous.framesDecoded;
  const lost = current.packetsLost - previous.packetsLost;
  const received = current.packetsReceived - previous.packetsReceived;
  if (bytes < 0 || decoded < 0 || lost < 0 || received < 0) return null;

  const expected = received + lost;
  return {
    bitrateKbps: Math.round((bytes * 8) / seconds / 1000),
    fps: Math.round(current.framesPerSecond ?? decoded / seconds),
    lossPct: expected > 0 ? Math.round((lost / expected) * 1000) / 10 : 0,
    jitterMs: Math.round((current.jitterSeconds ?? 0) * 1000),
    droppedFrames: Math.max(0, current.framesDropped - previous.framesDropped),
    freezes: Math.max(0, (current.freezeCount ?? 0) - (previous.freezeCount ?? 0)),
    freezeSeconds:
      Math.round(Math.max(0, (current.totalFreezesDuration ?? 0) - (previous.totalFreezesDuration ?? 0)) * 10) / 10,
    keyframeRequests: Math.max(0, (current.pliCount ?? 0) - (previous.pliCount ?? 0)),
    ...(current.frameWidth !== undefined ? { width: current.frameWidth } : {}),
    ...(current.frameHeight !== undefined ? { height: current.frameHeight } : {}),
  };
}

export type HealthVerdict = 'good' | 'warn' | 'bad';

/**
 * One word for the readout's colour. Loss and freezes are network problems,
 * dropped frames are this machine's problem, and both matter to the pilot.
 */
export function verdictFor(h: StreamHealth): HealthVerdict {
  if (h.fps === 0 || h.lossPct >= 5 || h.freezes > 0) return 'bad';
  if (h.lossPct >= 1 || h.droppedFrames > 0 || h.keyframeRequests > 0 || h.fps < 10) return 'warn';
  return 'good';
}

/** Why it is not 'good', in the pilot's terms. Null when nothing is wrong. */
export function healthReason(h: StreamHealth): string | null {
  if (h.fps === 0) return 'No frames arriving';
  if (h.freezes > 0) return `Froze ${h.freezes}x (${h.freezeSeconds}s)`;
  if (h.lossPct >= 5) return `${h.lossPct}% packet loss: check the radio link`;
  if (h.lossPct >= 1) return `${h.lossPct}% packet loss`;
  if (h.droppedFrames > 0) return `${h.droppedFrames} frames dropped: this machine is behind`;
  if (h.keyframeRequests > 0) return 'Requesting keyframes after loss';
  if (h.fps < 10) return `Only ${h.fps} fps`;
  return null;
}
