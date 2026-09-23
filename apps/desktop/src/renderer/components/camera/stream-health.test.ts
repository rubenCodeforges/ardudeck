import { describe, it, expect } from 'vitest';
import {
  healthBetween, verdictFor, healthReason, sampleFromReport, type StreamSample,
} from './stream-health';

const base: StreamSample = {
  timestampMs: 1000,
  bytesReceived: 0,
  packetsReceived: 0,
  packetsLost: 0,
  framesDecoded: 0,
  framesDropped: 0,
};

const after = (over: Partial<StreamSample>): StreamSample => ({ ...base, timestampMs: 2000, ...over });

describe('healthBetween', () => {
  it('turns byte and frame counters into a rate', () => {
    const h = healthBetween(base, after({ bytesReceived: 375_000, framesDecoded: 30 }))!;
    expect(h.bitrateKbps).toBe(3000);
    expect(h.fps).toBe(30);
  });

  it('prefers the receivers own framerate when it offers one', () => {
    const h = healthBetween(base, after({ framesDecoded: 30, framesPerSecond: 24 }))!;
    expect(h.fps).toBe(24);
  });

  it('reports loss as a share of what was expected', () => {
    const h = healthBetween(base, after({ packetsReceived: 950, packetsLost: 50 }))!;
    expect(h.lossPct).toBe(5);
  });

  // Counters restart at zero when the feed reconnects. A negative delta is a
  // new stream, not a negative bitrate.
  it('refuses to report rates across a reconnect', () => {
    const previous = after({ bytesReceived: 1_000_000, framesDecoded: 500 });
    expect(healthBetween(previous, { ...base, timestampMs: 3000 })).toBeNull();
  });

  it('refuses a zero or backwards interval', () => {
    expect(healthBetween(base, { ...base, timestampMs: 1000 })).toBeNull();
    expect(healthBetween(base, { ...base, timestampMs: 500 })).toBeNull();
  });

  it('carries the frame size through', () => {
    const h = healthBetween(base, after({ frameWidth: 1280, frameHeight: 720 }))!;
    expect(h.width).toBe(1280);
    expect(h.height).toBe(720);
  });
});

describe('verdictFor and healthReason', () => {
  const health = (over: Partial<ReturnType<typeof healthBetween>> = {}) => ({
    bitrateKbps: 3000, fps: 30, lossPct: 0, jitterMs: 5,
    droppedFrames: 0, freezes: 0, freezeSeconds: 0, keyframeRequests: 0,
    ...over,
  } as NonNullable<ReturnType<typeof healthBetween>>);

  it('is good on a clean stream', () => {
    expect(verdictFor(health())).toBe('good');
    expect(healthReason(health())).toBeNull();
  });

  it('calls no frames the worst case', () => {
    expect(verdictFor(health({ fps: 0 }))).toBe('bad');
    expect(healthReason(health({ fps: 0 }))).toBe('No frames arriving');
  });

  it('separates the network dropping frames from this machine dropping them', () => {
    expect(healthReason(health({ lossPct: 7 }))).toContain('check the radio link');
    expect(healthReason(health({ droppedFrames: 4 }))).toContain('this machine is behind');
  });

  it('warns before it condemns', () => {
    expect(verdictFor(health({ lossPct: 2 }))).toBe('warn');
    expect(verdictFor(health({ lossPct: 6 }))).toBe('bad');
    expect(verdictFor(health({ freezes: 1 }))).toBe('bad');
    expect(verdictFor(health({ keyframeRequests: 2 }))).toBe('warn');
  });
});

describe('sampleFromReport', () => {
  const report = (entries: Record<string, unknown>[]): RTCStatsReport =>
    ({ forEach: (fn: (v: unknown) => void) => entries.forEach(fn) }) as unknown as RTCStatsReport;

  it('picks the inbound video track and ignores the rest', () => {
    const s = sampleFromReport(report([
      { type: 'inbound-rtp', kind: 'audio', bytesReceived: 5 },
      { type: 'outbound-rtp', kind: 'video', bytesReceived: 9 },
      { type: 'inbound-rtp', kind: 'video', bytesReceived: 42, timestamp: 7, framesDecoded: 3 },
    ]), 0)!;
    expect(s.bytesReceived).toBe(42);
    expect(s.timestampMs).toBe(7);
    expect(s.framesDecoded).toBe(3);
  });

  it('is null when no video is inbound yet', () => {
    expect(sampleFromReport(report([{ type: 'inbound-rtp', kind: 'audio' }]), 0)).toBeNull();
  });

  it('defaults the counters a browser leaves out', () => {
    const s = sampleFromReport(report([{ type: 'inbound-rtp', kind: 'video' }]), 123)!;
    expect(s.timestampMs).toBe(123);
    expect(s.bytesReceived).toBe(0);
    expect(s.jitterSeconds).toBeUndefined();
  });
});
