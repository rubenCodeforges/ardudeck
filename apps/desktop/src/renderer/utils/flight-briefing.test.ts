import { describe, it, expect } from 'vitest';
import {
  computeMissionBriefing,
  formatAltitudeM,
  formatDistanceM,
  formatDurationSec,
  type BriefingInput,
  type BriefingPoint,
} from './flight-briefing';

// A north-south leg of ~1113m per 0.01 deg latitude (near the equator).
function legPoints(count: number, altM = 50): BriefingPoint[] {
  return Array.from({ length: count }, (_, i) => ({ lat: i * 0.01, lng: 0, altM }));
}

const base: Omit<BriefingInput, 'located'> = {
  home: { lat: 0, lng: 0 },
  cruiseSpeedMs: 10,
  enduranceSec: 20 * 60,
};

describe('formatters', () => {
  it('formats distance using the default distance unit without autoscaling', () => {
    expect(formatDistanceM(450)).toBe('450 m');
    expect(formatDistanceM(2500)).toBe('2500 m');
  });

  it('formats distance using an explicit distance unit', () => {
    expect(formatDistanceM(2500, 'km')).toBe('2.50 km');
    expect(formatDistanceM(1609.344, 'mi')).toBe('1.00 mi');
  });

  it('formats altitude and depth using an explicit altitude unit', () => {
    expect(formatAltitudeM(120)).toBe('120 m');
    expect(formatAltitudeM(120, 'ft')).toBe('394 ft');
    expect(formatAltitudeM(1500, 'km')).toBe('1.50 km');
  });

  it('formats duration in min and h/min', () => {
    expect(formatDurationSec(0)).toBe('0 min');
    expect(formatDurationSec(45 * 60)).toBe('45 min');
    expect(formatDurationSec(90 * 60)).toBe('1 h 30 min');
    expect(formatDurationSec(120 * 60)).toBe('2 h');
  });
});

describe('computeMissionBriefing', () => {
  it('flags an empty mission', () => {
    const b = computeMissionBriefing({ ...base, located: [] });
    expect(b.empty).toBe(true);
    expect(b.checks).toHaveLength(0);
  });

  it('computes distance, time and altitude from the path', () => {
    const b = computeMissionBriefing({ ...base, located: legPoints(3, 80) });
    // Two 0.01-deg legs ~= 2226m.
    expect(b.distanceM).toBeGreaterThan(2200);
    expect(b.distanceM).toBeLessThan(2250);
    expect(b.flightTimeSec).toBeCloseTo(b.distanceM / 10, 5);
    expect(b.maxAltM).toBe(80);
    expect(b.maxFromHomeM).toBeGreaterThan(b.distanceM / 2);
  });

  it('needs more batteries as the mission outlasts endurance', () => {
    // ~111km of legs at 10 m/s = ~3 hours; 20-min packs -> many batteries.
    const b = computeMissionBriefing({ ...base, located: legPoints(101) });
    expect(b.batteryCount).toBeGreaterThan(1);
  });

  it('reports reserve on the final battery for a short hop', () => {
    const b = computeMissionBriefing({ ...base, located: legPoints(2) });
    expect(b.batteryCount).toBe(1);
    expect(b.reservePct).not.toBeNull();
    expect(b.reservePct!).toBeGreaterThan(90); // tiny flight, almost full reserve
  });

  it('omits the from-home check when there is no home', () => {
    const b = computeMissionBriefing({ ...base, home: null, located: legPoints(3) });
    expect(b.maxFromHomeM).toBe(0);
    expect(b.checks.find((c) => c.id === 'maxFromHome')).toBeUndefined();
  });

  it('keeps every check informational in passive mode', () => {
    const b = computeMissionBriefing({ ...base, located: legPoints(3) });
    expect(b.checks.length).toBeGreaterThan(0);
    expect(b.checks.every((c) => c.severity === 'info')).toBe(true);
  });

  it('formats distance checks using the selected distance unit while keeping native meters', () => {
    const located = legPoints(3);
    const defaultBriefing = computeMissionBriefing({ ...base, located });
    const mileBriefing = computeMissionBriefing({ ...base, located, distanceUnit: 'mi' });

    expect(defaultBriefing.distanceM).toBeCloseTo(mileBriefing.distanceM);
    expect(defaultBriefing.maxFromHomeM).toBeCloseTo(mileBriefing.maxFromHomeM);
    expect(defaultBriefing.checks.find((c) => c.id === 'distance')?.value).toBe('2224 m');
    expect(defaultBriefing.checks.find((c) => c.id === 'maxFromHome')?.value).toBe('2224 m');
    expect(mileBriefing.checks.find((c) => c.id === 'distance')?.value).toBe('1.38 mi');
    expect(mileBriefing.checks.find((c) => c.id === 'maxFromHome')?.value).toBe('1.38 mi');
  });

  it('formats altitude checks using the selected altitude unit while keeping native meters', () => {
    const located = legPoints(3, 120);
    const defaultBriefing = computeMissionBriefing({ ...base, located, ceilingM: 120 });
    const feetBriefing = computeMissionBriefing({ ...base, located, ceilingM: 120, altitudeUnit: 'ft' });

    expect(defaultBriefing.maxAltM).toBe(feetBriefing.maxAltM);
    expect(defaultBriefing.ceilingM).toBe(feetBriefing.ceilingM);
    expect(defaultBriefing.checks.find((c) => c.id === 'maxAlt')?.value).toBe('120 m');
    expect(defaultBriefing.checks.find((c) => c.id === 'maxAlt')?.detail).toBe('ceiling 120 m AGL');
    expect(feetBriefing.checks.find((c) => c.id === 'maxAlt')?.value).toBe('394 ft');
    expect(feetBriefing.checks.find((c) => c.id === 'maxAlt')?.detail).toBe('ceiling 394 ft AGL');
  });

  it('formats wind checks using the selected wind speed unit while keeping native meters per second', () => {
    const weather = {
      windSpeedMs: 10, windGustMs: 12, windDirDeg: 270, tempC: 18, precipMm: 0,
      sunriseIso: null, sunsetIso: null, currentTimeIso: null, fetchedAtMs: 0,
    };
    const briefing = computeMissionBriefing({ ...base, located: legPoints(3), weather, windSpeedUnit: 'kt' });
    const wind = briefing.checks.find((c) => c.id === 'wind');

    expect(briefing.weather!.windSpeedMs).toBe(10);
    expect(wind?.value).toBe('19.4 kt');
    expect(wind?.detail).toBe('gusts 23.3 kt');
  });

  it('reports altitude range, total climb and waypoint count', () => {
    const located = [
      { lat: 0, lng: 0, altM: 40 },
      { lat: 0.01, lng: 0, altM: 60 },  // +20
      { lat: 0.02, lng: 0, altM: 50 },  // -10 (not counted)
      { lat: 0.03, lng: 0, altM: 90 },  // +40
    ];
    const b = computeMissionBriefing({ ...base, located });
    expect(b.minAltM).toBe(40);
    expect(b.maxAltM).toBe(90);
    expect(b.totalClimbM).toBe(60); // 20 + 40, descents excluded
    expect(b.waypointCount).toBe(4);
  });

  it('computes daylight margin in the site timezone', () => {
    const weather = {
      windSpeedMs: 3, windGustMs: 5, windDirDeg: 270, tempC: 18, precipMm: 0,
      sunriseIso: '2026-06-15T05:00', sunsetIso: '2026-06-15T21:00',
      currentTimeIso: '2026-06-15T18:00', fetchedAtMs: 0,
    };
    // legPoints(2) is a ~1113m hop; at 10 m/s that's ~111s, negligible vs the
    // 3h window, so the mission ends ~18:01 and margin is ~179 min to 21:00.
    const b = computeMissionBriefing({ ...base, located: legPoints(2), weather });
    expect(b.daylight).not.toBeNull();
    expect(b.daylight!.nowMin).toBe(18 * 60);
    expect(b.daylight!.sunsetMin).toBe(21 * 60);
    expect(b.daylight!.marginMin).toBeGreaterThan(175);
    expect(b.daylight!.marginMin).toBeLessThan(180);
  });

  it('reports negative daylight margin when a long mission overruns sunset', () => {
    const weather = {
      windSpeedMs: 3, windGustMs: 5, windDirDeg: 270, tempC: 18, precipMm: 0,
      sunriseIso: '2026-06-15T05:00', sunsetIso: '2026-06-15T21:00',
      currentTimeIso: '2026-06-15T20:30', fetchedAtMs: 0,
    };
    // ~111km of legs at 10 m/s ~= 3h, launched at 20:30 -> ends well after 21:00.
    const b = computeMissionBriefing({ ...base, located: legPoints(101), weather });
    expect(b.daylight!.marginMin).toBeLessThan(0);
  });

  it('has no daylight window without site time', () => {
    const b = computeMissionBriefing({ ...base, located: legPoints(3) });
    expect(b.daylight).toBeNull();
  });

  it('carries survey stats and converts coverage to hectares', () => {
    const b = computeMissionBriefing({
      ...base,
      located: legPoints(3),
      survey: { gsdCm: 1.8, photoCount: 240, dataGb: 6.4, areaM2: 50_000 },
    });
    expect(b.survey).not.toBeNull();
    expect(b.survey!.coverageHa).toBe(5);
    expect(b.survey!.photoCount).toBe(240);
  });
});
