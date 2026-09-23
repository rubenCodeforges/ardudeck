import { describe, it, expect } from 'vitest';
import { needsH264Relay, buildH264RelayArgs, encoderChain } from './h264-relay.js';

describe('h264 relay helpers', () => {
  it('relays only when no WebRTC-playable video track exists', () => {
    expect(needsH264Relay(['H264'])).toBe(false);
    expect(needsH264Relay(['H264', 'MPEG-4 Audio'])).toBe(false);
    expect(needsH264Relay(['VP9'])).toBe(false);
    expect(needsH264Relay(['AV1'])).toBe(false);
    expect(needsH264Relay(['H265'])).toBe(true);
    expect(needsH264Relay(['H265', 'MPEG-4 Audio'])).toBe(true);
    // Misdeclared SDP (old SIYI firmware): gortsplib ingests as Generic.
    expect(needsH264Relay(['Generic'])).toBe(true);
    // Both declared: WHEP can pick the H264 track, no relay needed.
    expect(needsH264Relay(['H265', 'H264'])).toBe(false);
    // Unknown track list: attempt playback as-is, never transcode on a guess.
    expect(needsH264Relay([])).toBe(false);
  });

  it('builds a low-latency tcp-to-tcp transcode command', () => {
    const args = buildH264RelayArgs('rtsp://127.0.0.1:8554/cam_x', 'rtsp://127.0.0.1:8554/cam_xh264');
    expect(args[args.indexOf('-i') + 1]).toBe('rtsp://127.0.0.1:8554/cam_x');
    expect(args[args.length - 1]).toBe('rtsp://127.0.0.1:8554/cam_xh264');
    expect(args).toContain('libx264');
    expect(args).toContain('zerolatency');
    expect(args).toContain('-an');
    expect(args).not.toContain('copy');
    // Both legs ride loopback TCP; UDP RTP listeners are disabled on the hub.
    expect(args.filter((a) => a === '-rtsp_transport')).toHaveLength(2);
  });
});

describe('encoderChain', () => {
  // One encoder is one point of failure: a build without libx264, a busy or
  // absent hardware encoder, a driver that refuses.
  it('offers more than one encoder on every platform', () => {
    for (const p of ['darwin', 'win32', 'linux'] as NodeJS.Platform[]) {
      expect(encoderChain(p).length).toBeGreaterThan(1);
    }
  });

  it('prefers hardware on macOS and the known-good software encoder on Windows', () => {
    expect(encoderChain('darwin')[0]).toBe('h264_videotoolbox');
    expect(encoderChain('win32')[0]).toBe('libx264');
    expect(encoderChain('win32')).toContain('h264_mf');
  });

  it('keeps libx264 available everywhere as the universal fallback', () => {
    for (const p of ['darwin', 'win32', 'linux'] as NodeJS.Platform[]) {
      expect(encoderChain(p)).toContain('libx264');
    }
  });
});

describe('buildH264RelayArgs encoder selection', () => {
  const args = (encoder?: string) =>
    buildH264RelayArgs('rtsp://in/a', 'rtsp://out/b', encoder);

  it('defaults to libx264 with its low-latency flags', () => {
    expect(args()).toContain('libx264');
    expect(args()).toContain('zerolatency');
  });

  // preset/tune are x264 options; a hardware encoder rejects them outright.
  it('does not pass x264 options to a hardware encoder', () => {
    const mf = args('h264_mf');
    expect(mf).toContain('h264_mf');
    expect(mf).not.toContain('-preset');
    expect(mf).not.toContain('-tune');
  });

  it('asks videotoolbox for realtime, and lets it fall back to software', () => {
    const vt = args('h264_videotoolbox');
    expect(vt).toContain('-realtime');
    expect(vt).toContain('-allow_sw');
  });

  it('keeps the input and output urls in order whatever the encoder', () => {
    const a = args('h264_qsv');
    expect(a[a.indexOf('-i') + 1]).toBe('rtsp://in/a');
    expect(a[a.length - 1]).toBe('rtsp://out/b');
  });
});
