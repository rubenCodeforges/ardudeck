import { describe, it, expect } from 'vitest';
import { planSpeed, planTurnRadius, turnRadiusFor, PLANE_CRUISE_FALLBACK_MS } from './turn-radius';
import { DEFAULT_SURVEY_CONFIG, type SurveyConfig } from '../survey-types';

const corridor = (over: Partial<SurveyConfig> = {}): SurveyConfig => ({
  ...DEFAULT_SURVEY_CONFIG,
  polygon: [{ lat: 0, lng: 0 }, { lat: 0, lng: 0.01 }],
  pattern: 'corridor',
  ...over,
});

describe('planSpeed', () => {
  // The bug the pilot saw: "8 m turn radius at 6.7 m/s" on a fixed wing.
  it('sizes a plane turn on cruise, not on a survey speed it cannot fly', () => {
    const p = planSpeed(corridor({ corridorMode: 'plane', speed: 6.7 }), 20);
    expect(p.speedMs).toBe(20);
    expect(p.source).toBe('cruise');
  });

  it('keeps the survey speed when the plane can actually hold it', () => {
    const p = planSpeed(corridor({ corridorMode: 'plane', speed: 24 }), 20);
    expect(p).toEqual({ speedMs: 24, source: 'survey', fromVehicle: true });
  });

  it('falls back to the ArduPlane cruise default with nothing connected', () => {
    expect(planSpeed(corridor({ corridorMode: 'plane', speed: 6.7 })).speedMs)
      .toBe(PLANE_CRUISE_FALLBACK_MS);
  });

  // A copter really does fly 6.7 m/s, and turns on the spot anyway.
  it('leaves a copter on its planned speed', () => {
    expect(planSpeed(corridor({ corridorMode: 'copter', speed: 6.7 }), 20))
      .toEqual({ speedMs: 6.7, source: 'survey', fromVehicle: false });
  });

  it('leaves a ground vehicle alone', () => {
    const rover = corridor({
      corridorMode: 'plane',
      speed: 2,
      camera: { ...DEFAULT_SURVEY_CONFIG.camera, manualCorridorWidth: 3 },
    });
    expect(planSpeed(rover, 20).speedMs).toBe(2);
  });

  it('applies to a plane-mode grid too', () => {
    const grid = corridor({ pattern: 'grid', gridMode: 'plane', speed: 5 });
    expect(planSpeed(grid, 18).speedMs).toBe(18);
    expect(planSpeed({ ...grid, gridMode: 'copter' }, 18).speedMs).toBe(5);
  });

  // The readout and the generator have to quote the same number: the survey
  // carries the cruise it was planned with.
  it('reads the cruise the survey was planned with', () => {
    const p = planSpeed(corridor({ corridorMode: 'plane', speed: 6.7, planAirspeed: 22 }));
    expect(p).toEqual({ speedMs: 22, source: 'cruise', fromVehicle: true });
  });
});

describe('planTurnRadius', () => {
  it('reads the cruise off the config when the vehicle set one', () => {
    const r = planTurnRadius(corridor({ corridorMode: 'plane', speed: 6.7, planAirspeed: 22 }));
    expect(r).toBeCloseTo(turnRadiusFor(22, 30), 3);
  });

  it('an explicit engine turn radius still wins', () => {
    const r = planTurnRadius(corridor({ corridorMode: 'plane', speed: 6.7, engineParams: { minTurnRadius: 90 } }));
    expect(r).toBe(90);
  });

  it('no longer reports a radius no fixed wing could fly', () => {
    expect(planTurnRadius(corridor({ corridorMode: 'plane', speed: 6.7 }))).toBeGreaterThan(20);
  });
});
