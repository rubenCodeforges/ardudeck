import { describe, it, expect } from 'vitest';
import { bridgeFailureReason, buildWfbngSdp, buildWfbngFfmpegArgs, wfbngPort, wfbngShouldTranscode } from './wfbng.js';

describe('wfbng ingest helpers', () => {
  it('parses the listen port from udp urls, defaulting to 5600', () => {
    expect(wfbngPort('udp://0.0.0.0:5600')).toBe(5600);
    expect(wfbngPort('udp://127.0.0.1:5700')).toBe(5700);
    expect(wfbngPort('udp://0.0.0.0')).toBe(5600);
    expect(wfbngPort(undefined)).toBe(5600);
    expect(wfbngPort('garbage')).toBe(5600);
  });

  it('builds an SDP declaring all OpenIPC payload types for the chosen codec', () => {
    const sdp = buildWfbngSdp(5600, 'h265');
    expect(sdp).toContain('m=video 5600 RTP/AVP 96 97 98');
    expect(sdp).toContain('a=rtpmap:96 H265/90000');
    expect(sdp).toContain('a=rtpmap:98 H265/90000');
    expect(sdp).toContain('c=IN IP4 0.0.0.0');
    expect(buildWfbngSdp(5700, 'h264')).toContain('a=rtpmap:97 H264/90000');
  });

  it('h265 transcodes by default, h264 copies; explicit flag wins', () => {
    expect(wfbngShouldTranscode('h265', undefined)).toBe(true);
    expect(wfbngShouldTranscode('h264', undefined)).toBe(false);
    expect(wfbngShouldTranscode('h265', false)).toBe(false);
    expect(wfbngShouldTranscode('h264', true)).toBe(true);
  });

  it('ffmpeg args use the SDP with an rtp protocol whitelist', () => {
    const copy = buildWfbngFfmpegArgs('/tmp/x.sdp', false, 'rtsp://127.0.0.1:8554/cam');
    expect(copy).toContain('-protocol_whitelist');
    expect(copy[copy.indexOf('-i') + 1]).toBe('/tmp/x.sdp');
    expect(copy).toContain("copy");
    expect(copy[copy.length - 1]).toBe('rtsp://127.0.0.1:8554/cam');

    const xcode = buildWfbngFfmpegArgs('/tmp/x.sdp', true, 'rtsp://127.0.0.1:8554/cam');
    expect(xcode).toContain('libx264');
    expect(xcode).toContain('zerolatency');
    expect(xcode).not.toContain('copy');
  });

  // Both lines straight from a WiFiLink 2 bench session.
  it('names a busy UDP port from the bridge output', () => {
    const out = '[udp @ 0x600002e7c0b0] bind failed: Address already in use\n/x/cam_1.sdp: Invalid data found when processing input';
    expect(bridgeFailureReason(out, 5600, 'h264')).toMatch(/UDP port 5600 is still held/);
  });

  it('spots H.264 arriving on a feed set to H.265', () => {
    const out = '[sdp @ 0x146f05500] Multi-layer HEVC coding is not implemented. Update your FFmpeg version';
    expect(bridgeFailureReason(out, 5600, 'h265')).toMatch(/sending H\.264, but this feed is set to H\.265/);
    expect(bridgeFailureReason(out, 5600, 'h264')).toBeNull();
  });

  it('stays quiet when the output has no known cause', () => {
    expect(bridgeFailureReason('Input #0, sdp, from cam.sdp', 5600, 'h265')).toBeNull();
  });
});

