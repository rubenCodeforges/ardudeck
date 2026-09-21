import { describe, it, expect } from 'vitest';
import { surveyModeForVehicle, vehicleClassLabel, vehiclePlanningNote } from './survey-vehicle';

describe('surveyModeForVehicle', () => {
  it('plans a fixed wing with room to turn', () => {
    expect(surveyModeForVehicle('plane')).toBe('plane');
  });

  // The lift motors are for takeoff and landing; the survey is flown as a
  // fixed wing, so every turn in it needs fixed-wing room.
  it('treats a VTOL as a plane, not a copter', () => {
    expect(surveyModeForVehicle('vtol')).toBe('plane');
  });

  it('lets anything that turns on the spot do so', () => {
    expect(surveyModeForVehicle('copter')).toBe('copter');
    expect(surveyModeForVehicle('rover')).toBe('copter');
    expect(surveyModeForVehicle('sub')).toBe('copter');
  });

  it('falls back to the safe choice with nothing connected', () => {
    expect(surveyModeForVehicle(undefined)).toBe('copter');
  });
});

describe('vehiclePlanningNote', () => {
  it('says what it detected and what it did', () => {
    expect(vehiclePlanningNote('vtol')).toContain('VTOL');
    expect(vehiclePlanningNote('vtol')).toContain('racetrack');
    expect(vehiclePlanningNote('copter')).toContain('turns on the spot');
  });

  it('is explicit when nothing is connected', () => {
    expect(vehiclePlanningNote(undefined)).toContain('No vehicle connected');
  });

  it('names every class it can be handed', () => {
    for (const c of ['plane', 'vtol', 'copter', 'rover', 'sub'] as const) {
      expect(vehicleClassLabel(c)).not.toBe('Unknown');
    }
  });
});
