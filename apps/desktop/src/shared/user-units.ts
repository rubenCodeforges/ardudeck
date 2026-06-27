export const DISTANCE_UNITS = ['m', 'km', 'ft', 'mi'] as const;
export const ALTITUDE_UNITS = ['m', 'km', 'ft'] as const;
export const ELECTRIC_CAPACITY_UNITS = ['mah', 'ah'] as const;
export const SPEED_UNITS = ['mps', 'kph', 'fps', 'mph', 'kt'] as const;
export const VERTICAL_SPEED_UNITS = ['mps', 'mpm', 'fps', 'fpm'] as const;
export const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'] as const;
export const DIMENSION_UNITS = ['mm', 'm', 'in', 'ft'] as const;
export const AREA_UNITS = ['m2', 'ha', 'ft2', 'ac'] as const;
export const WIND_SPEED_UNITS = ['mps', 'kph', 'mph', 'kt'] as const;

export type DistanceUnit = (typeof DISTANCE_UNITS)[number];
export type AltitudeUnit = (typeof ALTITUDE_UNITS)[number];
export type ElectricCapacityUnit = (typeof ELECTRIC_CAPACITY_UNITS)[number];
export type SpeedUnit = (typeof SPEED_UNITS)[number];
export type VerticalSpeedUnit = (typeof VERTICAL_SPEED_UNITS)[number];
export type WeightUnit = (typeof WEIGHT_UNITS)[number];
export type DimensionUnit = (typeof DIMENSION_UNITS)[number];
export type AreaUnit = (typeof AREA_UNITS)[number];
export type WindSpeedUnit = (typeof WIND_SPEED_UNITS)[number];

export interface UserUnitPreferences {
  distance: DistanceUnit;
  altitude: AltitudeUnit;
  electricCapacity: ElectricCapacityUnit;
  speed: SpeedUnit;
  verticalSpeed: VerticalSpeedUnit;
  weight: WeightUnit;
  dimensions: DimensionUnit;
  area: AreaUnit;
  windSpeed: WindSpeedUnit;
}

export interface LegacyUnitPreferences {
  displayUnits?: unknown;
  surveyUnits?: unknown;
}

export const DEFAULT_USER_UNIT_PREFERENCES: UserUnitPreferences = {
  distance: 'm',
  altitude: 'm',
  electricCapacity: 'mah',
  speed: 'mps',
  verticalSpeed: 'mps',
  weight: 'g',
  dimensions: 'mm',
  area: 'ha',
  windSpeed: 'mps',
};

export const UNIT_LABELS = {
  distance: {
    m: 'm',
    km: 'km',
    ft: 'ft',
    mi: 'mi',
  },
  altitude: {
    m: 'm',
    km: 'km',
    ft: 'ft',
  },
  electricCapacity: {
    mah: 'mAh',
    ah: 'Ah',
  },
  speed: {
    mps: 'm/s',
    kph: 'kph',
    fps: 'ft/s',
    mph: 'mph',
    kt: 'kt',
  },
  verticalSpeed: {
    mps: 'm/s',
    mpm: 'm/min',
    fps: 'ft/s',
    fpm: 'ft/min',
  },
  weight: {
    g: 'g',
    kg: 'kg',
    oz: 'oz',
    lb: 'lbs',
  },
  dimensions: {
    mm: 'mm',
    m: 'm',
    in: 'in',
    ft: 'ft',
  },
  area: {
    m2: 'm²',
    ha: 'ha',
    ft2: 'ft²',
    ac: 'ac',
  },
  windSpeed: {
    mps: 'm/s',
    kph: 'kph',
    mph: 'mph',
    kt: 'kt',
  },
} as const;

export const UNIT_PRECISION = {
  distance: {
    m: 0,
    km: 2,
    ft: 0,
    mi: 2,
  },
  altitude: {
    m: 0,
    km: 2,
    ft: 0,
  },
  electricCapacity: {
    mah: 0,
    ah: 2,
  },
  speed: {
    mps: 1,
    kph: 1,
    fps: 1,
    mph: 1,
    kt: 1,
  },
  verticalSpeed: {
    mps: 1,
    mpm: 1,
    fps: 1,
    fpm: 0,
  },
  weight: {
    g: 0,
    kg: 2,
    oz: 0,
    lb: 2,
  },
  dimensions: {
    mm: 0,
    m: 2,
    in: 2,
    ft: 2,
  },
  area: {
    m2: 0,
    ha: 2,
    ft2: 0,
    ac: 2,
  },
  windSpeed: {
    mps: 1,
    kph: 1,
    mph: 1,
    kt: 1,
  },
} as const;

export const AREA_INPUT_PRECISION: Record<AreaUnit, number> = {
  m2: 2,
  ha: 6,
  ft2: 2,
  ac: 6,
};

const METERS_PER_FOOT = 0.3048;
const METERS_PER_MILE = 1609.344;
const GRAMS_PER_OUNCE = 28.349523125;
const GRAMS_PER_POUND = 453.59237;
const MILLIMETERS_PER_INCH = 25.4;
const MILLIMETERS_PER_FOOT = 304.8;
const SQUARE_METERS_PER_HECTARE = 10_000;
const SQUARE_METERS_PER_SQUARE_FOOT = 0.09290304;
const SQUARE_METERS_PER_ACRE = 4046.8564224;
const SQUARE_CENTIMETERS_PER_SQUARE_METER = 10_000;
const KPH_PER_MPS = 3.6;
const KNOTS_PER_MPS = 1.9438444924406046;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOneOf<T extends readonly string[]>(value: unknown, units: T): value is T[number] {
  return typeof value === 'string' && units.includes(value);
}

function displayNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function formatValue(value: number, decimals: number): string {
  const text = displayNumber(value).toFixed(decimals);
  return Number(text) === 0 ? (0).toFixed(decimals) : text;
}

export function migrateLegacyUnitPreferences(legacy?: LegacyUnitPreferences | null): UserUnitPreferences {
  const preferences: UserUnitPreferences = { ...DEFAULT_USER_UNIT_PREFERENCES };

  if (legacy?.displayUnits === 'large') {
    preferences.electricCapacity = 'ah';
    preferences.weight = 'kg';
    preferences.dimensions = 'm';
  } else if (legacy?.displayUnits === 'small') {
    preferences.electricCapacity = 'mah';
    preferences.weight = 'g';
    preferences.dimensions = 'mm';
  }

  if (legacy?.surveyUnits === 'imperial') {
    preferences.distance = 'mi';
    preferences.altitude = 'ft';
    preferences.speed = 'mph';
    preferences.verticalSpeed = 'fpm';
    preferences.area = 'ac';
    preferences.windSpeed = 'mph';
  } else if (legacy?.surveyUnits === 'metric') {
    preferences.distance = 'm';
    preferences.altitude = 'm';
    preferences.speed = 'mps';
    preferences.verticalSpeed = 'mps';
    preferences.area = 'ha';
    preferences.windSpeed = 'mps';
  }

  return preferences;
}

export function normalizeUserUnitPreferences(raw?: unknown, legacy?: LegacyUnitPreferences | null): UserUnitPreferences {
  const preferences = migrateLegacyUnitPreferences(legacy);

  if (!isRecord(raw)) {
    return preferences;
  }

  if (isOneOf(raw.distance, DISTANCE_UNITS)) {
    preferences.distance = raw.distance;
  }
  if (isOneOf(raw.altitude, ALTITUDE_UNITS)) {
    preferences.altitude = raw.altitude;
  }
  if (isOneOf(raw.electricCapacity, ELECTRIC_CAPACITY_UNITS)) {
    preferences.electricCapacity = raw.electricCapacity;
  }
  if (isOneOf(raw.speed, SPEED_UNITS)) {
    preferences.speed = raw.speed;
  }
  if (isOneOf(raw.verticalSpeed, VERTICAL_SPEED_UNITS)) {
    preferences.verticalSpeed = raw.verticalSpeed;
  }
  if (isOneOf(raw.weight, WEIGHT_UNITS)) {
    preferences.weight = raw.weight;
  }
  if (isOneOf(raw.dimensions, DIMENSION_UNITS)) {
    preferences.dimensions = raw.dimensions;
  }
  if (isOneOf(raw.area, AREA_UNITS)) {
    preferences.area = raw.area;
  }
  if (isOneOf(raw.windSpeed, WIND_SPEED_UNITS)) {
    preferences.windSpeed = raw.windSpeed;
  }

  return preferences;
}

export function distanceValueFromMeters(meters: number, unit: DistanceUnit): number {
  switch (unit) {
    case 'm':
      return meters;
    case 'km':
      return meters / 1000;
    case 'ft':
      return meters / METERS_PER_FOOT;
    case 'mi':
      return meters / METERS_PER_MILE;
  }
}

export function toMetersFromDistanceUnit(value: number, unit: DistanceUnit): number {
  switch (unit) {
    case 'm':
      return value;
    case 'km':
      return value * 1000;
    case 'ft':
      return value * METERS_PER_FOOT;
    case 'mi':
      return value * METERS_PER_MILE;
  }
}

export function formatDistanceFromMeters(meters: number, unit: DistanceUnit): string {
  return `${formatValue(distanceValueFromMeters(meters, unit), UNIT_PRECISION.distance[unit])} ${UNIT_LABELS.distance[unit]}`;
}

export function altitudeValueFromMeters(meters: number, unit: AltitudeUnit): number {
  switch (unit) {
    case 'm':
      return meters;
    case 'km':
      return meters / 1000;
    case 'ft':
      return meters / METERS_PER_FOOT;
  }
}

export function toMetersFromAltitudeUnit(value: number, unit: AltitudeUnit): number {
  switch (unit) {
    case 'm':
      return value;
    case 'km':
      return value * 1000;
    case 'ft':
      return value * METERS_PER_FOOT;
  }
}

export function formatAltitudeFromMeters(meters: number, unit: AltitudeUnit): string {
  return `${formatValue(altitudeValueFromMeters(meters, unit), UNIT_PRECISION.altitude[unit])} ${UNIT_LABELS.altitude[unit]}`;
}

export function capacityValueFromMah(mah: number, unit: ElectricCapacityUnit): number {
  switch (unit) {
    case 'mah':
      return mah;
    case 'ah':
      return mah / 1000;
  }
}

export function toMahFromCapacityUnit(value: number, unit: ElectricCapacityUnit): number {
  switch (unit) {
    case 'mah':
      return value;
    case 'ah':
      return value * 1000;
  }
}

export function formatCapacityFromMah(mah: number, unit: ElectricCapacityUnit): string {
  return `${formatValue(capacityValueFromMah(mah, unit), UNIT_PRECISION.electricCapacity[unit])} ${UNIT_LABELS.electricCapacity[unit]}`;
}

export function speedValueFromMetersPerSecond(metersPerSecond: number, unit: SpeedUnit): number {
  switch (unit) {
    case 'mps':
      return metersPerSecond;
    case 'kph':
      return metersPerSecond * KPH_PER_MPS;
    case 'fps':
      return metersPerSecond / METERS_PER_FOOT;
    case 'mph':
      return (metersPerSecond / METERS_PER_MILE) * 3600;
    case 'kt':
      return metersPerSecond * KNOTS_PER_MPS;
  }
}

export function toMetersPerSecondFromSpeedUnit(value: number, unit: SpeedUnit): number {
  switch (unit) {
    case 'mps':
      return value;
    case 'kph':
      return value / KPH_PER_MPS;
    case 'fps':
      return value * METERS_PER_FOOT;
    case 'mph':
      return (value * METERS_PER_MILE) / 3600;
    case 'kt':
      return value / KNOTS_PER_MPS;
  }
}

export function formatSpeedFromMetersPerSecond(metersPerSecond: number, unit: SpeedUnit): string {
  return `${formatValue(speedValueFromMetersPerSecond(metersPerSecond, unit), UNIT_PRECISION.speed[unit])} ${UNIT_LABELS.speed[unit]}`;
}

export function verticalSpeedValueFromMetersPerSecond(metersPerSecond: number, unit: VerticalSpeedUnit): number {
  switch (unit) {
    case 'mps':
      return metersPerSecond;
    case 'mpm':
      return metersPerSecond * 60;
    case 'fps':
      return metersPerSecond / METERS_PER_FOOT;
    case 'fpm':
      return (metersPerSecond / METERS_PER_FOOT) * 60;
  }
}

export function toMetersPerSecondFromVerticalSpeedUnit(value: number, unit: VerticalSpeedUnit): number {
  switch (unit) {
    case 'mps':
      return value;
    case 'mpm':
      return value / 60;
    case 'fps':
      return value * METERS_PER_FOOT;
    case 'fpm':
      return (value * METERS_PER_FOOT) / 60;
  }
}

export function formatVerticalSpeedFromMetersPerSecond(metersPerSecond: number, unit: VerticalSpeedUnit): string {
  return `${formatValue(verticalSpeedValueFromMetersPerSecond(metersPerSecond, unit), UNIT_PRECISION.verticalSpeed[unit])} ${UNIT_LABELS.verticalSpeed[unit]}`;
}

export function weightValueFromGrams(grams: number, unit: WeightUnit): number {
  switch (unit) {
    case 'g':
      return grams;
    case 'kg':
      return grams / 1000;
    case 'oz':
      return grams / GRAMS_PER_OUNCE;
    case 'lb':
      return grams / GRAMS_PER_POUND;
  }
}

export function toGramsFromWeightUnit(value: number, unit: WeightUnit): number {
  switch (unit) {
    case 'g':
      return value;
    case 'kg':
      return value * 1000;
    case 'oz':
      return value * GRAMS_PER_OUNCE;
    case 'lb':
      return value * GRAMS_PER_POUND;
  }
}

export function formatWeightFromGrams(grams: number, unit: WeightUnit): string {
  return `${formatValue(weightValueFromGrams(grams, unit), UNIT_PRECISION.weight[unit])} ${UNIT_LABELS.weight[unit]}`;
}

export function weightInputValueFromGrams(grams: number | undefined, unit: WeightUnit): string {
  if (grams === undefined || !Number.isFinite(grams)) return '';
  return String(Number(weightValueFromGrams(grams, unit).toFixed(UNIT_PRECISION.weight[unit])));
}

export function dimensionValueFromMillimeters(millimeters: number, unit: DimensionUnit): number {
  switch (unit) {
    case 'mm':
      return millimeters;
    case 'm':
      return millimeters / 1000;
    case 'in':
      return millimeters / MILLIMETERS_PER_INCH;
    case 'ft':
      return millimeters / MILLIMETERS_PER_FOOT;
  }
}

export function toMillimetersFromDimensionUnit(value: number, unit: DimensionUnit): number {
  switch (unit) {
    case 'mm':
      return value;
    case 'm':
      return value * 1000;
    case 'in':
      return value * MILLIMETERS_PER_INCH;
    case 'ft':
      return value * MILLIMETERS_PER_FOOT;
  }
}

export function formatDimensionFromMillimeters(millimeters: number, unit: DimensionUnit): string {
  return `${formatValue(dimensionValueFromMillimeters(millimeters, unit), UNIT_PRECISION.dimensions[unit])} ${UNIT_LABELS.dimensions[unit]}`;
}

export function dimensionInputValueFromMillimeters(millimeters: number | undefined, unit: DimensionUnit): string {
  if (millimeters === undefined || !Number.isFinite(millimeters)) return '';
  return String(Number(dimensionValueFromMillimeters(millimeters, unit).toFixed(UNIT_PRECISION.dimensions[unit])));
}

export function areaValueFromSquareMeters(squareMeters: number, unit: AreaUnit): number {
  switch (unit) {
    case 'm2':
      return squareMeters;
    case 'ha':
      return squareMeters / SQUARE_METERS_PER_HECTARE;
    case 'ft2':
      return squareMeters / SQUARE_METERS_PER_SQUARE_FOOT;
    case 'ac':
      return squareMeters / SQUARE_METERS_PER_ACRE;
  }
}

export function toSquareMetersFromAreaUnit(value: number, unit: AreaUnit): number {
  switch (unit) {
    case 'm2':
      return value;
    case 'ha':
      return value * SQUARE_METERS_PER_HECTARE;
    case 'ft2':
      return value * SQUARE_METERS_PER_SQUARE_FOOT;
    case 'ac':
      return value * SQUARE_METERS_PER_ACRE;
  }
}

export function areaValueFromHectares(hectares: number, unit: AreaUnit): number {
  return areaValueFromSquareMeters(hectares * SQUARE_METERS_PER_HECTARE, unit);
}

export function toHectaresFromAreaUnit(value: number, unit: AreaUnit): number {
  return toSquareMetersFromAreaUnit(value, unit) / SQUARE_METERS_PER_HECTARE;
}

export function areaValueFromSquareCentimeters(squareCentimeters: number, unit: AreaUnit): number {
  return areaValueFromSquareMeters(squareCentimeters / SQUARE_CENTIMETERS_PER_SQUARE_METER, unit);
}

export function toSquareCentimetersFromAreaUnit(value: number, unit: AreaUnit): number {
  return toSquareMetersFromAreaUnit(value, unit) * SQUARE_CENTIMETERS_PER_SQUARE_METER;
}

export function formatAreaFromSquareMeters(squareMeters: number, unit: AreaUnit): string {
  return `${formatValue(areaValueFromSquareMeters(squareMeters, unit), UNIT_PRECISION.area[unit])} ${UNIT_LABELS.area[unit]}`;
}

export function formatAreaFromHectares(hectares: number, unit: AreaUnit): string {
  return `${formatValue(areaValueFromHectares(hectares, unit), UNIT_PRECISION.area[unit])} ${UNIT_LABELS.area[unit]}`;
}

export function formatAreaFromSquareCentimeters(squareCentimeters: number, unit: AreaUnit): string {
  return `${formatValue(areaValueFromSquareCentimeters(squareCentimeters, unit), UNIT_PRECISION.area[unit])} ${UNIT_LABELS.area[unit]}`;
}

export function areaInputValueFromSquareMeters(squareMeters: number | undefined, unit: AreaUnit): string {
  if (squareMeters === undefined || !Number.isFinite(squareMeters)) return '';
  return String(Number(areaValueFromSquareMeters(squareMeters, unit).toFixed(AREA_INPUT_PRECISION[unit])));
}

export function areaInputValueFromSquareCentimeters(squareCentimeters: number | undefined, unit: AreaUnit): string {
  if (squareCentimeters === undefined || !Number.isFinite(squareCentimeters)) return '';
  return areaInputValueFromSquareMeters(squareCentimeters / SQUARE_CENTIMETERS_PER_SQUARE_METER, unit);
}

export function windSpeedValueFromMetersPerSecond(metersPerSecond: number, unit: WindSpeedUnit): number {
  switch (unit) {
    case 'mps':
      return metersPerSecond;
    case 'kph':
      return metersPerSecond * KPH_PER_MPS;
    case 'mph':
      return (metersPerSecond / METERS_PER_MILE) * 3600;
    case 'kt':
      return metersPerSecond * KNOTS_PER_MPS;
  }
}

export function toMetersPerSecondFromWindSpeedUnit(value: number, unit: WindSpeedUnit): number {
  switch (unit) {
    case 'mps':
      return value;
    case 'kph':
      return value / KPH_PER_MPS;
    case 'mph':
      return (value * METERS_PER_MILE) / 3600;
    case 'kt':
      return value / KNOTS_PER_MPS;
  }
}

export function formatWindSpeedFromMetersPerSecond(metersPerSecond: number, unit: WindSpeedUnit): string {
  return `${formatValue(windSpeedValueFromMetersPerSecond(metersPerSecond, unit), UNIT_PRECISION.windSpeed[unit])} ${UNIT_LABELS.windSpeed[unit]}`;
}
