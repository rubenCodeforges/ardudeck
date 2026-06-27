import { describe, expect, it } from 'vitest';
import {
  waypointDisplayBound,
  waypointDisplayStep,
  waypointDisplayValue,
  waypointInputText,
  waypointNativeValue,
  type WaypointUnitContext,
} from './waypoint-unit-format';

function context(overrides: Partial<WaypointUnitContext> = {}): WaypointUnitContext {
  return {
    distanceUnit: 'm',
    altitudeUnit: 'm',
    speedUnit: 'mps',
    verticalSpeedUnit: 'mps',
    ...overrides,
  };
}

describe('waypoint unit input formatting', () => {
  it('rounds distance and altitude display values to user-visible precision', () => {
    expect(waypointDisplayValue(100, 'altitude', context({ altitudeUnit: 'ft' }))).toBe(328);
    expect(waypointInputText(100, 'altitude', context({ altitudeUnit: 'ft' }))).toBe('328');

    expect(waypointDisplayValue(100, 'distance', context({ distanceUnit: 'ft' }))).toBe(328);
    expect(waypointInputText(100, 'distance', context({ distanceUnit: 'mi' }))).toBe('0.06');

    expect(waypointDisplayValue(123.4, 'altitude', context({ altitudeUnit: 'm' }))).toBe(123);
    expect(waypointDisplayValue(1234, 'distance', context({ distanceUnit: 'km' }))).toBe(1.23);
  });

  it('uses display-unit step sizes instead of raw converted native steps', () => {
    expect(waypointDisplayStep('altitude', context({ altitudeUnit: 'ft' }))).toBe(1);
    expect(waypointDisplayStep('altitude', context({ altitudeUnit: 'km' }))).toBe(0.01);
    expect(waypointDisplayStep('distance', context({ distanceUnit: 'ft' }))).toBe(1);
    expect(waypointDisplayStep('distance', context({ distanceUnit: 'mi' }))).toBe(0.01);
    expect(waypointDisplayStep('speed', context({ speedUnit: 'mph' }))).toBe(0.1);
    expect(waypointDisplayStep('verticalSpeed', context({ verticalSpeedUnit: 'fpm' }))).toBe(1);
  });

  it('formats display bounds without exposing raw conversion floats', () => {
    expect(waypointDisplayBound(1000, 'altitude', context({ altitudeUnit: 'ft' }))).toBe(3281);
    expect(waypointDisplayBound(500, 'altitude', context({ altitudeUnit: 'ft' }))).toBe(1640);
    expect(waypointDisplayBound(1000, 'altitude', context({ altitudeUnit: 'km' }))).toBe(1);
  });

  it('converts edited display values back to native mission values', () => {
    expect(waypointNativeValue(400, 'altitude', context({ altitudeUnit: 'ft' }))).toBeCloseTo(121.92);
    expect(waypointNativeValue(0.25, 'distance', context({ distanceUnit: 'mi' }))).toBeCloseTo(402.336);
    expect(waypointNativeValue(22.4, 'speed', context({ speedUnit: 'mph' }))).toBeCloseTo(10.014);
    expect(waypointNativeValue(394, 'verticalSpeed', context({ verticalSpeedUnit: 'fpm' }))).toBeCloseTo(2.002);
  });

  it('round-trips clean edited imperial values without reintroducing float noise', () => {
    const ftContext = context({ altitudeUnit: 'ft', distanceUnit: 'ft' });

    const nativeAltitude = waypointNativeValue(400, 'altitude', ftContext);
    expect(waypointInputText(nativeAltitude, 'altitude', ftContext)).toBe('400');

    const nativeDistance = waypointNativeValue(250, 'distance', ftContext);
    expect(waypointInputText(nativeDistance, 'distance', ftContext)).toBe('250');
  });
});
