/**
 * The corridor generator against v0.1.2-rc3, the build the pilots fly.
 *
 * rc4 renamed Max turn, changed its range, dropped the end overshoot and let
 * the vehicle's cruise size the turn loops. Each of those changed what came
 * out for settings the pilot had not touched. This pins the turn and overshoot
 * geometry to rc3's, waypoint for waypoint, on the pilot's own settings.
 *
 * The one intended difference is strip ORDER: rc4 flies them with a stride so
 * the reversals fit. Pinning the turn radius to ~1 m collapses that back to
 * 1,2,3 for the exact comparisons; the unpinned cases assert the same set of
 * waypoints, so the ground covered is unchanged either way.
 */
import { describe, it, expect } from 'vitest';
import { generateCorridor } from './corridor-generator';
import { generateCorridor as generateRc3 } from './rc3-corridor-reference';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig, type LatLng } from '../survey-types';

/** The pilot's own rc3 settings, from their panel. */
const PILOT: Partial<SurveyConfig> = {
  altitude: 130,
  speed: 19,
  frontOverlap: 80,
  sideOverlap: 67,
  corridorWidth: 90,
  corridorStrips: 3,
  corridorMode: 'plane',
  overshoot: 80,
  maxTurnAngle: 15,
  camera: {
    name: 'Sony NEX5N SEL20F28',
    sensorWidth: 23.6,
    sensorHeight: 15.8,
    imageWidth: 4912,
    imageHeight: 3264,
    focalLength: 20,
  },
};

const cfg = (polygon: LatLng[], over: Partial<SurveyConfig> = {}): SurveyConfig => ({
  ...DEFAULT_SURVEY_CONFIG,
  polygon,
  pattern: 'corridor',
  ...PILOT,
  ...over,
});

const STRAIGHT: LatLng[] = [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }];
const BENT: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.004 },
  { lat: 0.003, lng: 0.006 },
  { lat: 0.008, lng: 0.006 },
];
const HAIRPIN: LatLng[] = [
  { lat: 0, lng: 0 },
  { lat: 0, lng: 0.004 },
  { lat: 0.0003, lng: 0 },
];

const round = (pts: LatLng[]) => pts.map((p) => `${p.lat.toFixed(7)},${p.lng.toFixed(7)}`);
const asSet = (pts: LatLng[]) => [...round(pts)].sort();

/**
 * rc3 flew strips 1,2,3 in order. rc4 added the turn-radius stride, so the
 * order differs by design. Pinning the radius to ~1 m collapses the stride to
 * 1 and isolates the turn and overshoot geometry, which must still match.
 */
const inOrder = { engineParams: { minTurnRadius: 1.1 } } as Partial<SurveyConfig>;

describe('corridor output matches rc3 on the pilot settings', () => {
  for (const [name, line] of [['straight', STRAIGHT], ['bent', BENT], ['hairpin', HAIRPIN]] as const) {
    it(`${name} centreline, waypoint for waypoint`, () => {
      const now = generateCorridor(cfg(line, inOrder));
      const rc3 = generateRc3(cfg(line));
      expect(round(now.waypoints)).toEqual(round(rc3.waypoints));
      expect(now.stats.flightDistance).toBeCloseTo(rc3.stats.flightDistance, 3);
    });

    it(`${name} centreline covers the same ground when strips are reordered`, () => {
      expect(asSet(generateCorridor(cfg(line)).waypoints)).toEqual(asSet(generateRc3(cfg(line)).waypoints));
    });
  }

  it('matches for an even strip count', () => {
    const now = generateCorridor(cfg(BENT, { ...inOrder, corridorStrips: 2 }));
    const rc3 = generateRc3(cfg(BENT, { corridorStrips: 2 }));
    expect(round(now.waypoints)).toEqual(round(rc3.waypoints));
  });

  it('matches with flipLegs and invertPath', () => {
    for (const over of [{ flipLegs: true }, { invertPath: true }, { flipLegs: true, invertPath: true }]) {
      expect(round(generateCorridor(cfg(BENT, { ...inOrder, ...over })).waypoints))
        .toEqual(round(generateRc3(cfg(BENT, over)).waypoints));
    }
  });

  it('matches in copter mode', () => {
    expect(round(generateCorridor(cfg(BENT, { corridorMode: 'copter' })).waypoints))
      .toEqual(round(generateRc3(cfg(BENT, { corridorMode: 'copter' })).waypoints));
  });

  // The vehicle's cruise must not reach the turn geometry any more: that is
  // what turned 2.9 km into 95 km.
  it('a wild AIRSPEED_CRUISE no longer changes the corridor', () => {
    expect(round(generateCorridor(cfg(BENT, { ...inOrder, planAirspeed: 100 })).waypoints))
      .toEqual(round(generateRc3(cfg(BENT)).waypoints));
  });
});
