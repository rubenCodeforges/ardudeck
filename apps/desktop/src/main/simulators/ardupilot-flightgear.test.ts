import { describe, it, expect } from 'vitest';
import {
  buildFlightGearViewerArgs,
  ARDUPILOT_FG_FDM_PORT,
} from './ardupilot-flightgear';

describe('buildFlightGearViewerArgs', () => {
  it('uses an external FDM so FlightGear runs no physics of its own', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo' });
    expect(args).toContain('--fdm=external');
  });

  it('listens for ArduPilot FGNetFDM on port 5503 by default', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo' });
    expect(args).toContain(`--native-fdm=socket,in,10,,${ARDUPILOT_FG_FDM_PORT},udp`);
    expect(ARDUPILOT_FG_FDM_PORT).toBe(5503);
  });

  it('honors a custom fdm port and update rate', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo', fdmPort: 5600, updateRate: 25 });
    expect(args).toContain('--native-fdm=socket,in,25,,5600,udp');
  });

  it('passes the chosen visual aircraft shell', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'c172p' });
    expect(args).toContain('--aircraft=c172p');
  });

  it('seeds the start location from lat/lon when both are given', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo', lat: -35.36, lon: 149.16 });
    expect(args).toContain('--lat=-35.36');
    expect(args).toContain('--lon=149.16');
  });

  it('omits location when lat/lon are not both provided', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo', lat: -35.36 });
    expect(args.some((a) => a.startsWith('--lat='))).toBe(false);
    expect(args.some((a) => a.startsWith('--lon='))).toBe(false);
  });

  it('includes altitude and heading when provided', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo', altitudeFt: 1500, headingDeg: 270 });
    expect(args).toContain('--altitude=1500');
    expect(args).toContain('--heading=270');
  });

  it('never emits generic-protocol or --data args (that was the broken iNav path)', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo', lat: 1, lon: 2 });
    expect(args.some((a) => a.startsWith('--generic='))).toBe(false);
    expect(args.some((a) => a.startsWith('--data='))).toBe(false);
  });

  it('defaults to a windowed geometry and disables startup blockers', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo' });
    expect(args).toContain('--geometry=1280x720');
    expect(args).toContain('--disable-splash-screen');
    expect(args).toContain('--disable-real-weather-fetch');
    expect(args).toContain('--disable-ai-traffic');
  });

  it('enables TerraSync by default so non-SF locations get scenery', () => {
    expect(buildFlightGearViewerArgs({ aircraft: 'ufo' })).toContain('--enable-terrasync');
  });

  it('omits TerraSync when explicitly disabled', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo', terraSync: false });
    expect(args).not.toContain('--enable-terrasync');
  });

  it('goes fullscreen instead of windowed when requested', () => {
    const args = buildFlightGearViewerArgs({ aircraft: 'ufo', fullscreen: true });
    expect(args).toContain('--enable-fullscreen');
    expect(args.some((a) => a.startsWith('--geometry='))).toBe(false);
  });
});
