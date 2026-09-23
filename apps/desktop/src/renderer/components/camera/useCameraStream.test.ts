import { describe, it, expect } from 'vitest';
import { resolveStreamUrl } from './useCameraStream';
import type { CameraSourceConfig } from '../../../shared/camera-types';

function src(kind: CameraSourceConfig['kind'], url?: string): CameraSourceConfig {
  return { id: 'x', vehicleKey: 'v', kind, label: kind, ...(url ? { url } : {}) };
}

describe('resolveStreamUrl', () => {
  it('uses the advertised MAVLink URI for mavlink sources', () => {
    expect(resolveStreamUrl(src('mavlink'), 'rtsp://cam/adv')).toBe('rtsp://cam/adv');
  });

  it('ignores the advertised URI for non-mavlink sources', () => {
    expect(resolveStreamUrl(src('rtsp', 'rtsp://x/a'), 'rtsp://cam/adv')).toBe('rtsp://x/a');
  });

  it('returns undefined when a mavlink source has no advertised URI yet', () => {
    expect(resolveStreamUrl(src('mavlink'), undefined)).toBeUndefined();
  });
});

describe('withScheme', () => {
  // A pasted "host:port/path" is what every other GCS accepts, and what the
  // hub rejected with a flat "Hub rejected the source path".
  it('adds the scheme a bare address is missing', () => {
    expect(resolveStreamUrl(src('rtsp', '10.45.216.19:8554/bench'), undefined))
      .toBe('rtsp://10.45.216.19:8554/bench');
    expect(resolveStreamUrl(src('srt', '10.0.0.5:8890'), undefined)).toBe('srt://10.0.0.5:8890');
    expect(resolveStreamUrl(src('rtp-udp', '0.0.0.0:5600'), undefined)).toBe('udp://0.0.0.0:5600');
  });

  it('leaves a url that already has one alone', () => {
    expect(resolveStreamUrl(src('rtsp', 'rtsp://cam/main'), undefined)).toBe('rtsp://cam/main');
    expect(resolveStreamUrl(src('rtsp', 'RTSP://cam/main'), undefined)).toBe('RTSP://cam/main');
    expect(resolveStreamUrl(src('rtp-udp', 'udp://0.0.0.0:5600'), undefined)).toBe('udp://0.0.0.0:5600');
  });

  // A vehicle that advertises a bare address would have failed the same way.
  it('applies to the advertised MAVLink uri too', () => {
    expect(resolveStreamUrl(src('mavlink'), '192.168.144.25:8554/main.264'))
      .toBe('rtsp://192.168.144.25:8554/main.264');
    expect(resolveStreamUrl(src('mavlink'), 'rtsp://192.168.144.25:8554/main.264'))
      .toBe('rtsp://192.168.144.25:8554/main.264');
  });

  it('trims, and leaves an empty url empty', () => {
    expect(resolveStreamUrl(src('rtsp', '  rtsp://cam/main  '), undefined)).toBe('rtsp://cam/main');
    expect(resolveStreamUrl(src('rtsp', '   '), undefined)).toBe('');
  });

  it('adds nothing for a kind with no url of its own', () => {
    expect(resolveStreamUrl(src('uvc', 'something'), undefined)).toBe('something');
  });
});
