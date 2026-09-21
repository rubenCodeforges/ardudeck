import { describe, it, expect } from 'vitest';
import { HUD_READOUTS, READOUT_IDS, formatReadout, type ReadoutSource } from './hud-readouts';
import { unitProfile } from './hud-config';

const metric = unitProfile('metric');
const imperial = unitProfile('imperial');

// A full, realistic telemetry snapshot so every readout has real data.
const V: ReadoutSource = {
  batteryVoltage: 22.24,
  current: 10.0,
  batteryPercent: 75,
  altitude: 123.4,
  vario: 2.5,
  throttle: 46,
  groundspeed: 12,
  airspeed: 13.6,
  heading: 90,
  gpsSats: 14,
  hdop: 0.8,
  lat: 47.123456,
  lon: 8.654321,
  distance: 340,
  windSpeed: 6,
  mode: 'AUTO',
  gForce: 1.0,
};

describe('HUD readouts catalog', () => {
  it('has a unique id for every readout and a matching id list', () => {
    const ids = HUD_READOUTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...READOUT_IDS].sort()).toEqual([...ids].sort());
  });

  it('gives every readout a label and a category', () => {
    for (const r of HUD_READOUTS) {
      expect(r.label.length).toBeGreaterThan(0);
      expect(r.category.length).toBeGreaterThan(0);
    }
  });

  it('formats every readout without throwing', () => {
    for (const r of HUD_READOUTS) {
      const out = formatReadout(r.id, V, metric);
      expect(typeof out.label).toBe('string');
      expect(typeof out.value).toBe('string');
      expect(out.label).toBe(r.label);
    }
  });
});

describe('formatReadout - VTOL state', () => {
  // Only a VTOL reports MAV_VTOL_STATE. On anything else the cell must read as
  // unknown rather than assert the airframe is a fixed wing.
  it('shows a dash when the vehicle never reports one', () => {
    expect(formatReadout('vtolState', V, metric).value).toBe('--');
  });

  it('names hover and wingborne flight', () => {
    expect(formatReadout('vtolState', { ...V, vtolState: 3 }, metric).value).toBe('HOVER');
    expect(formatReadout('vtolState', { ...V, vtolState: 4 }, metric).value).toBe('WING');
  });

  it('calls out a transition in progress, which the mode name never does', () => {
    expect(formatReadout('vtolState', { ...V, vtolState: 1 }, metric).value).toBe('TO WING');
    expect(formatReadout('vtolState', { ...V, vtolState: 2 }, metric).value).toBe('TO HOVER');
  });

  it('treats MAV_VTOL_STATE_UNDEFINED as no reading', () => {
    expect(formatReadout('vtolState', { ...V, vtolState: 0 }, metric).value).toBe('--');
  });
});

describe('formatReadout - values and units', () => {
  it('voltage: one decimal + V', () => {
    expect(formatReadout('voltage', V, metric).value).toBe('22.2 V');
  });

  it('current: one decimal + A', () => {
    expect(formatReadout('current', V, metric).value).toBe('10.0 A');
  });

  it('power: volts x amps, rounded watts', () => {
    expect(formatReadout('power', V, metric).value).toBe('222 W');
  });

  it('battery percent: rounded integer + %', () => {
    expect(formatReadout('battPercent', V, metric).value).toBe('75%');
  });

  it('altitude follows the unit profile', () => {
    expect(formatReadout('altitude', V, metric).value).toBe('123 m');
    expect(formatReadout('altitude', V, imperial).value).toBe('405 ft');
  });

  it('vario is a vertical speed in distance-units per second', () => {
    expect(formatReadout('vario', V, metric).value).toBe('2.5 m/s');
    expect(formatReadout('vario', V, imperial).value).toBe('8.2 ft/s');
  });

  it('groundspeed / airspeed follow the speed unit', () => {
    expect(formatReadout('groundspeed', V, metric).value).toBe('12 m/s');
    expect(formatReadout('airspeed', V, imperial).value).toBe('30 mph');
  });

  it('heading is zero-padded to three degrees', () => {
    expect(formatReadout('heading', V, metric).value).toBe('090°');
    expect(formatReadout('heading', { ...V, heading: 5 }, metric).value).toBe('005°');
    expect(formatReadout('heading', { ...V, heading: 360 }, metric).value).toBe('000°');
  });

  it('sats and hdop', () => {
    expect(formatReadout('gpsSats', V, metric).value).toBe('14');
    expect(formatReadout('hdop', V, metric).value).toBe('0.80');
  });

  it('mode passes text through', () => {
    expect(formatReadout('mode', V, metric).value).toBe('AUTO');
  });

  it('missing optional data shows a dash, not NaN', () => {
    const empty = formatReadout('gforce', { ...V, gForce: undefined }, metric).value;
    expect(empty).not.toContain('NaN');
    expect(empty).toContain('--');
  });
});

describe('formatReadout - ground vehicle readouts', () => {
  it('steer shows side and magnitude, CTR when centred', () => {
    expect(formatReadout('steer', { ...V, steer: -42 }, metric).value).toBe('L 42%');
    expect(formatReadout('steer', { ...V, steer: 17.4 }, metric).value).toBe('R 17%');
    expect(formatReadout('steer', { ...V, steer: 0.3 }, metric).value).toBe('CTR');
    expect(formatReadout('steer', V, metric).value).toBe('--');
  });

  it('tilt shows roll and pitch degrees', () => {
    expect(formatReadout('tilt', { ...V, roll: -11.6, pitch: 4.2 }, metric).value).toBe('R-12° P4°');
    expect(formatReadout('tilt', V, metric).value).toBe('--');
  });

  it('waypoint distance follows the distance unit', () => {
    expect(formatReadout('wpDist', { ...V, wpDistance: 250 }, metric).value).toBe('250 m');
    expect(formatReadout('wpDist', { ...V, wpDistance: 100 }, imperial).value).toBe('328 ft');
    expect(formatReadout('wpDist', V, metric).value).toBe('--');
  });

  it('crosstrack shows side and fine resolution under 10 units', () => {
    expect(formatReadout('xtrack', { ...V, xtrackError: 2.34 }, metric).value).toBe('R 2.3 m');
    expect(formatReadout('xtrack', { ...V, xtrackError: -31.7 }, metric).value).toBe('L 32 m');
    expect(formatReadout('xtrack', V, metric).value).toBe('--');
  });
});
