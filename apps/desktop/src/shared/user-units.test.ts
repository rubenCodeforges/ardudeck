import { describe, expect, it } from 'vitest';
import {
  AREA_UNITS,
  DEFAULT_USER_UNIT_PREFERENCES,
  UNIT_LABELS,
  areaInputValueFromSquareCentimeters,
  areaInputValueFromSquareMeters,
  areaValueFromHectares,
  areaValueFromSquareCentimeters,
  areaValueFromSquareMeters,
  altitudeValueFromMeters,
  capacityValueFromMah,
  dimensionInputValueFromMillimeters,
  dimensionValueFromMillimeters,
  distanceValueFromMeters,
  formatAltitudeFromMeters,
  formatAreaFromHectares,
  formatAreaFromSquareCentimeters,
  formatAreaFromSquareMeters,
  formatCapacityFromMah,
  formatDimensionFromMillimeters,
  formatDistanceFromMeters,
  formatSpeedFromMetersPerSecond,
  formatVerticalSpeedFromMetersPerSecond,
  formatWeightFromGrams,
  formatWindSpeedFromMetersPerSecond,
  migrateLegacyUnitPreferences,
  normalizeUserUnitPreferences,
  speedValueFromMetersPerSecond,
  toGramsFromWeightUnit,
  toHectaresFromAreaUnit,
  toMahFromCapacityUnit,
  toMetersFromAltitudeUnit,
  toMetersFromDistanceUnit,
  toMetersPerSecondFromSpeedUnit,
  toMetersPerSecondFromVerticalSpeedUnit,
  toMetersPerSecondFromWindSpeedUnit,
  toMillimetersFromDimensionUnit,
  toSquareCentimetersFromAreaUnit,
  toSquareMetersFromAreaUnit,
  verticalSpeedValueFromMetersPerSecond,
  weightValueFromGrams,
  weightInputValueFromGrams,
  windSpeedValueFromMetersPerSecond,
} from './user-units';

describe('user unit labels and defaults', () => {
  it('exposes visible labels grouped by unit preference category', () => {
    expect(UNIT_LABELS.distance).toEqual({
      m: 'm',
      km: 'km',
      ft: 'ft',
      mi: 'mi',
    });
    expect(UNIT_LABELS.altitude).toEqual({
      m: 'm',
      km: 'km',
      ft: 'ft',
    });
    expect(UNIT_LABELS.electricCapacity).toEqual({
      mah: 'mAh',
      ah: 'Ah',
    });
    expect(UNIT_LABELS.speed).toEqual({
      mps: 'm/s',
      kph: 'kph',
      fps: 'ft/s',
      mph: 'mph',
      kt: 'kt',
    });
    expect(UNIT_LABELS.verticalSpeed).toEqual({
      mps: 'm/s',
      mpm: 'm/min',
      fps: 'ft/s',
      fpm: 'ft/min',
    });
    expect(UNIT_LABELS.weight).toEqual({
      g: 'g',
      kg: 'kg',
      oz: 'oz',
      lb: 'lbs',
    });
    expect(UNIT_LABELS.dimensions).toEqual({
      mm: 'mm',
      m: 'm',
      in: 'in',
      ft: 'ft',
    });
    expect(UNIT_LABELS.area).toEqual({
      m2: 'm²',
      ha: 'ha',
      ft2: 'ft²',
      ac: 'ac',
    });
    expect(UNIT_LABELS.windSpeed).toEqual({
      mps: 'm/s',
      kph: 'kph',
      mph: 'mph',
      kt: 'kt',
    });
    expect(AREA_UNITS).toEqual(['m2', 'ha', 'ft2', 'ac']);
    expect(DEFAULT_USER_UNIT_PREFERENCES).toEqual({
      distance: 'm',
      altitude: 'm',
      electricCapacity: 'mah',
      speed: 'mps',
      verticalSpeed: 'mps',
      weight: 'g',
      dimensions: 'mm',
      area: 'ha',
      windSpeed: 'mps',
    });
  });
});

describe('distance presentation helpers', () => {
  it('formats selected distance units without autoscaling', () => {
    expect(formatDistanceFromMeters(2500, 'm')).toBe('2500 m');
    expect(formatDistanceFromMeters(2500, 'km')).toBe('2.50 km');
    expect(formatDistanceFromMeters(1609.344, 'mi')).toBe('1.00 mi');
    expect(formatDistanceFromMeters(100, 'ft')).toBe('328 ft');
  });

  it('round trips distance input values back to meters', () => {
    expect(toMetersFromDistanceUnit(distanceValueFromMeters(1234, 'm'), 'm')).toBeCloseTo(1234);
    expect(toMetersFromDistanceUnit(distanceValueFromMeters(1234, 'km'), 'km')).toBeCloseTo(1234);
    expect(toMetersFromDistanceUnit(distanceValueFromMeters(1234, 'ft'), 'ft')).toBeCloseTo(1234);
    expect(toMetersFromDistanceUnit(distanceValueFromMeters(1234, 'mi'), 'mi')).toBeCloseTo(1234);
  });
});

describe('altitude and depth presentation helpers', () => {
  it('formats selected altitude units without autoscaling', () => {
    expect(formatAltitudeFromMeters(100, 'm')).toBe('100 m');
    expect(formatAltitudeFromMeters(1000, 'km')).toBe('1.00 km');
    expect(formatAltitudeFromMeters(100, 'ft')).toBe('328 ft');
  });

  it('round trips altitude input values back to meters', () => {
    expect(toMetersFromAltitudeUnit(altitudeValueFromMeters(321, 'm'), 'm')).toBeCloseTo(321);
    expect(toMetersFromAltitudeUnit(altitudeValueFromMeters(321, 'km'), 'km')).toBeCloseTo(321);
    expect(toMetersFromAltitudeUnit(altitudeValueFromMeters(321, 'ft'), 'ft')).toBeCloseTo(321);
  });
});

describe('electric capacity presentation helpers', () => {
  it('formats selected capacity units', () => {
    expect(formatCapacityFromMah(1500, 'mah')).toBe('1500 mAh');
    expect(formatCapacityFromMah(1500, 'ah')).toBe('1.50 Ah');
  });

  it('round trips capacity input values back to milliamp hours', () => {
    expect(toMahFromCapacityUnit(capacityValueFromMah(2200, 'mah'), 'mah')).toBeCloseTo(2200);
    expect(toMahFromCapacityUnit(capacityValueFromMah(2200, 'ah'), 'ah')).toBeCloseTo(2200);
  });
});

describe('speed presentation helpers', () => {
  it('formats selected speed units', () => {
    expect(formatSpeedFromMetersPerSecond(10, 'mps')).toBe('10.0 m/s');
    expect(formatSpeedFromMetersPerSecond(10, 'kph')).toBe('36.0 kph');
    expect(formatSpeedFromMetersPerSecond(10, 'fps')).toBe('32.8 ft/s');
    expect(formatSpeedFromMetersPerSecond(10, 'mph')).toBe('22.4 mph');
    expect(formatSpeedFromMetersPerSecond(10, 'kt')).toBe('19.4 kt');
  });

  it('round trips speed input values back to meters per second', () => {
    expect(toMetersPerSecondFromSpeedUnit(speedValueFromMetersPerSecond(7, 'mps'), 'mps')).toBeCloseTo(7);
    expect(toMetersPerSecondFromSpeedUnit(speedValueFromMetersPerSecond(7, 'kph'), 'kph')).toBeCloseTo(7);
    expect(toMetersPerSecondFromSpeedUnit(speedValueFromMetersPerSecond(7, 'fps'), 'fps')).toBeCloseTo(7);
    expect(toMetersPerSecondFromSpeedUnit(speedValueFromMetersPerSecond(7, 'mph'), 'mph')).toBeCloseTo(7);
    expect(toMetersPerSecondFromSpeedUnit(speedValueFromMetersPerSecond(7, 'kt'), 'kt')).toBeCloseTo(7);
  });
});

describe('vertical speed presentation helpers', () => {
  it('formats selected vertical speed units', () => {
    expect(formatVerticalSpeedFromMetersPerSecond(2, 'mps')).toBe('2.0 m/s');
    expect(formatVerticalSpeedFromMetersPerSecond(2, 'mpm')).toBe('120.0 m/min');
    expect(formatVerticalSpeedFromMetersPerSecond(2, 'fps')).toBe('6.6 ft/s');
    expect(formatVerticalSpeedFromMetersPerSecond(2, 'fpm')).toBe('394 ft/min');
  });

  it('round trips vertical speed input values back to meters per second', () => {
    expect(toMetersPerSecondFromVerticalSpeedUnit(verticalSpeedValueFromMetersPerSecond(3, 'mps'), 'mps')).toBeCloseTo(3);
    expect(toMetersPerSecondFromVerticalSpeedUnit(verticalSpeedValueFromMetersPerSecond(3, 'mpm'), 'mpm')).toBeCloseTo(3);
    expect(toMetersPerSecondFromVerticalSpeedUnit(verticalSpeedValueFromMetersPerSecond(3, 'fps'), 'fps')).toBeCloseTo(3);
    expect(toMetersPerSecondFromVerticalSpeedUnit(verticalSpeedValueFromMetersPerSecond(3, 'fpm'), 'fpm')).toBeCloseTo(3);
  });
});

describe('weight, dimension, area, and wind helpers', () => {
  it('formats selected weight, dimension, area, and wind units', () => {
    expect(formatWeightFromGrams(1000, 'lb')).toBe('2.20 lbs');
    expect(formatDimensionFromMillimeters(254, 'in')).toBe('10.00 in');
    expect(formatAreaFromSquareMeters(10000, 'ha')).toBe('1.00 ha');
    expect(formatAreaFromSquareMeters(4046.8564224, 'ac')).toBe('1.00 ac');
    expect(formatAreaFromHectares(1, 'm2')).toBe('10000 m²');
    expect(formatAreaFromSquareCentimeters(10_000, 'm2')).toBe('1 m²');
    expect(formatAreaFromSquareCentimeters(10_000, 'ft2')).toBe('11 ft²');
    expect(formatWindSpeedFromMetersPerSecond(10, 'kt')).toBe('19.4 kt');
  });

  it('round trips weight, dimension, area, and wind input values back to native units', () => {
    expect(toGramsFromWeightUnit(weightValueFromGrams(750, 'g'), 'g')).toBeCloseTo(750);
    expect(toGramsFromWeightUnit(weightValueFromGrams(750, 'kg'), 'kg')).toBeCloseTo(750);
    expect(toGramsFromWeightUnit(weightValueFromGrams(750, 'oz'), 'oz')).toBeCloseTo(750);
    expect(toGramsFromWeightUnit(weightValueFromGrams(750, 'lb'), 'lb')).toBeCloseTo(750);

    expect(toMillimetersFromDimensionUnit(dimensionValueFromMillimeters(500, 'mm'), 'mm')).toBeCloseTo(500);
    expect(toMillimetersFromDimensionUnit(dimensionValueFromMillimeters(500, 'm'), 'm')).toBeCloseTo(500);
    expect(toMillimetersFromDimensionUnit(dimensionValueFromMillimeters(500, 'in'), 'in')).toBeCloseTo(500);
    expect(toMillimetersFromDimensionUnit(dimensionValueFromMillimeters(500, 'ft'), 'ft')).toBeCloseTo(500);

    expect(toSquareMetersFromAreaUnit(areaValueFromSquareMeters(1200, 'm2'), 'm2')).toBeCloseTo(1200);
    expect(toSquareMetersFromAreaUnit(areaValueFromSquareMeters(1200, 'ha'), 'ha')).toBeCloseTo(1200);
    expect(toSquareMetersFromAreaUnit(areaValueFromSquareMeters(1200, 'ft2'), 'ft2')).toBeCloseTo(1200);
    expect(toSquareMetersFromAreaUnit(areaValueFromSquareMeters(1200, 'ac'), 'ac')).toBeCloseTo(1200);

    expect(toHectaresFromAreaUnit(areaValueFromHectares(1.2, 'm2'), 'm2')).toBeCloseTo(1.2);
    expect(toHectaresFromAreaUnit(areaValueFromHectares(1.2, 'ha'), 'ha')).toBeCloseTo(1.2);
    expect(toSquareCentimetersFromAreaUnit(areaValueFromSquareCentimeters(1200, 'm2'), 'm2')).toBeCloseTo(1200);
    expect(toSquareCentimetersFromAreaUnit(areaValueFromSquareCentimeters(1200, 'ft2'), 'ft2')).toBeCloseTo(1200);

    expect(toMetersPerSecondFromWindSpeedUnit(windSpeedValueFromMetersPerSecond(9, 'mps'), 'mps')).toBeCloseTo(9);
    expect(toMetersPerSecondFromWindSpeedUnit(windSpeedValueFromMetersPerSecond(9, 'kph'), 'kph')).toBeCloseTo(9);
    expect(toMetersPerSecondFromWindSpeedUnit(windSpeedValueFromMetersPerSecond(9, 'mph'), 'mph')).toBeCloseTo(9);
    expect(toMetersPerSecondFromWindSpeedUnit(windSpeedValueFromMetersPerSecond(9, 'kt'), 'kt')).toBeCloseTo(9);
  });

  it('formats weight input values without unit text while preserving selected-unit precision', () => {
    expect(weightInputValueFromGrams(undefined, 'kg')).toBe('');
    expect(weightInputValueFromGrams(1500, 'g')).toBe('1500');
    expect(weightInputValueFromGrams(1500, 'kg')).toBe('1.5');
    expect(weightInputValueFromGrams(28.349523125, 'oz')).toBe('1');
    expect(weightInputValueFromGrams(453.59237, 'lb')).toBe('1');
  });

  it('formats dimension input values without unit text while preserving selected-unit precision', () => {
    expect(dimensionInputValueFromMillimeters(undefined, 'm')).toBe('');
    expect(dimensionInputValueFromMillimeters(1200, 'mm')).toBe('1200');
    expect(dimensionInputValueFromMillimeters(1200, 'm')).toBe('1.2');
    expect(dimensionInputValueFromMillimeters(254, 'in')).toBe('10');
    expect(dimensionInputValueFromMillimeters(304.8, 'ft')).toBe('1');
  });

  it('formats small editable area values without unit text or zero-rounding', () => {
    expect(areaInputValueFromSquareCentimeters(undefined, 'm2')).toBe('');
    expect(areaInputValueFromSquareCentimeters(2400, 'm2')).toBe('0.24');
    expect(areaInputValueFromSquareCentimeters(2400, 'ft2')).toBe('2.58');
    expect(areaInputValueFromSquareMeters(0.05, 'm2')).toBe('0.05');
    expect(areaInputValueFromSquareMeters(0.05, 'ha')).toBe('0.000005');
  });
});

describe('user unit preference migration', () => {
  it('migrates legacy display and survey unit preferences', () => {
    expect(migrateLegacyUnitPreferences({ displayUnits: 'large', surveyUnits: 'imperial' })).toEqual({
      distance: 'mi',
      altitude: 'ft',
      electricCapacity: 'ah',
      speed: 'mph',
      verticalSpeed: 'fpm',
      weight: 'kg',
      dimensions: 'm',
      area: 'ac',
      windSpeed: 'mph',
    });

    expect(migrateLegacyUnitPreferences({ displayUnits: 'small', surveyUnits: 'metric' })).toEqual({
      distance: 'm',
      altitude: 'm',
      electricCapacity: 'mah',
      speed: 'mps',
      verticalSpeed: 'mps',
      weight: 'g',
      dimensions: 'mm',
      area: 'ha',
      windSpeed: 'mps',
    });
  });

  it('lets valid persisted preferences override migrated defaults', () => {
    expect(
      normalizeUserUnitPreferences(
        { distance: 'km', electricCapacity: 'mah', speed: 'kt' },
        { displayUnits: 'large', surveyUnits: 'imperial' },
      ),
    ).toMatchObject({
      distance: 'km',
      electricCapacity: 'mah',
      speed: 'kt',
      altitude: 'ft',
      weight: 'kg',
      dimensions: 'm',
    });
  });

  it('falls invalid partial persisted preferences back while preserving valid keys', () => {
    expect(
      normalizeUserUnitPreferences({
        distance: 'bananas',
        altitude: 'ft',
        electricCapacity: 'watts',
        speed: 'mph',
        verticalSpeed: 'furlongs',
        weight: 'lb',
        dimensions: 'cm',
        area: 'ac',
        windSpeed: 'knots',
      }),
    ).toEqual({
      ...DEFAULT_USER_UNIT_PREFERENCES,
      altitude: 'ft',
      speed: 'mph',
      weight: 'lb',
      area: 'ac',
    });
  });
});

describe('user unit formatting safety', () => {
  it('formats non-finite numbers without throwing', () => {
    expect(() => formatDistanceFromMeters(Number.NaN, 'm')).not.toThrow();
    expect(() => formatSpeedFromMetersPerSecond(Number.POSITIVE_INFINITY, 'mph')).not.toThrow();
    expect(formatDistanceFromMeters(Number.NaN, 'm')).toBe('0 m');
  });

  it('normalizes rounded negative zero in formatted output', () => {
    expect(formatDistanceFromMeters(-0.4, 'm')).toBe('0 m');
  });
});

describe('user unit non-finite numeric conversion safety', () => {
  it('preserves non-finite reverse conversion inputs instead of coercing them to zero', () => {
    expect(toMetersFromDistanceUnit(Number.NaN, 'km')).toBeNaN();
    expect(toMetersFromAltitudeUnit(Number.POSITIVE_INFINITY, 'ft')).toBe(Number.POSITIVE_INFINITY);
    expect(toMahFromCapacityUnit(Number.NEGATIVE_INFINITY, 'ah')).toBe(Number.NEGATIVE_INFINITY);
    expect(toMetersPerSecondFromSpeedUnit(Number.NaN, 'mph')).toBeNaN();
    expect(toMetersPerSecondFromVerticalSpeedUnit(Number.POSITIVE_INFINITY, 'fpm')).toBe(Number.POSITIVE_INFINITY);
    expect(toGramsFromWeightUnit(Number.NEGATIVE_INFINITY, 'lb')).toBe(Number.NEGATIVE_INFINITY);
    expect(toMillimetersFromDimensionUnit(Number.NaN, 'in')).toBeNaN();
    expect(toSquareMetersFromAreaUnit(Number.POSITIVE_INFINITY, 'ac')).toBe(Number.POSITIVE_INFINITY);
    expect(toHectaresFromAreaUnit(Number.NEGATIVE_INFINITY, 'ft2')).toBe(Number.NEGATIVE_INFINITY);
    expect(toSquareCentimetersFromAreaUnit(Number.NaN, 'ha')).toBeNaN();
    expect(toMetersPerSecondFromWindSpeedUnit(Number.POSITIVE_INFINITY, 'kt')).toBe(Number.POSITIVE_INFINITY);
  });

  it('preserves non-finite display value conversion inputs instead of coercing them to zero', () => {
    expect(distanceValueFromMeters(Number.NaN, 'km')).toBeNaN();
    expect(altitudeValueFromMeters(Number.POSITIVE_INFINITY, 'ft')).toBe(Number.POSITIVE_INFINITY);
    expect(capacityValueFromMah(Number.NEGATIVE_INFINITY, 'ah')).toBe(Number.NEGATIVE_INFINITY);
    expect(speedValueFromMetersPerSecond(Number.NaN, 'mph')).toBeNaN();
    expect(verticalSpeedValueFromMetersPerSecond(Number.POSITIVE_INFINITY, 'fpm')).toBe(Number.POSITIVE_INFINITY);
    expect(weightValueFromGrams(Number.NEGATIVE_INFINITY, 'lb')).toBe(Number.NEGATIVE_INFINITY);
    expect(dimensionValueFromMillimeters(Number.NaN, 'in')).toBeNaN();
    expect(areaValueFromSquareMeters(Number.POSITIVE_INFINITY, 'ac')).toBe(Number.POSITIVE_INFINITY);
    expect(areaValueFromHectares(Number.NEGATIVE_INFINITY, 'ft2')).toBe(Number.NEGATIVE_INFINITY);
    expect(areaValueFromSquareCentimeters(Number.NaN, 'ha')).toBeNaN();
    expect(windSpeedValueFromMetersPerSecond(Number.POSITIVE_INFINITY, 'kt')).toBe(Number.POSITIVE_INFINITY);
  });
});
