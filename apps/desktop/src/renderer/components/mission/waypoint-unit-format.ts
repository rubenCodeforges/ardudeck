import {
  UNIT_PRECISION,
  altitudeValueFromMeters,
  distanceValueFromMeters,
  speedValueFromMetersPerSecond,
  toMetersFromAltitudeUnit,
  toMetersFromDistanceUnit,
  toMetersPerSecondFromSpeedUnit,
  toMetersPerSecondFromVerticalSpeedUnit,
  verticalSpeedValueFromMetersPerSecond,
  type AltitudeUnit,
  type DistanceUnit,
  type SpeedUnit,
  type VerticalSpeedUnit,
} from '../../../shared/user-units.js';

export type WaypointUnitKind = 'distance' | 'altitude' | 'speed' | 'verticalSpeed';

export interface WaypointUnitContext {
  distanceUnit: DistanceUnit;
  altitudeUnit: AltitudeUnit;
  speedUnit: SpeedUnit;
  verticalSpeedUnit: VerticalSpeedUnit;
}

function normalizeRoundedInput(value: number, precision: number): number {
  if (!Number.isFinite(value)) return 0;
  const rounded = Number(value.toFixed(precision));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function waypointUnitPrecision(kind: WaypointUnitKind, context: WaypointUnitContext): number {
  switch (kind) {
    case 'distance':
      return UNIT_PRECISION.distance[context.distanceUnit];
    case 'altitude':
      return UNIT_PRECISION.altitude[context.altitudeUnit];
    case 'speed':
      return UNIT_PRECISION.speed[context.speedUnit];
    case 'verticalSpeed':
      return UNIT_PRECISION.verticalSpeed[context.verticalSpeedUnit];
  }
}

export function waypointDisplayValue(
  nativeValue: number,
  kind: WaypointUnitKind,
  context: WaypointUnitContext,
): number {
  const precision = waypointUnitPrecision(kind, context);

  switch (kind) {
    case 'distance':
      return normalizeRoundedInput(distanceValueFromMeters(nativeValue, context.distanceUnit), precision);
    case 'altitude':
      return normalizeRoundedInput(altitudeValueFromMeters(nativeValue, context.altitudeUnit), precision);
    case 'speed':
      return normalizeRoundedInput(speedValueFromMetersPerSecond(nativeValue, context.speedUnit), precision);
    case 'verticalSpeed':
      return normalizeRoundedInput(verticalSpeedValueFromMetersPerSecond(nativeValue, context.verticalSpeedUnit), precision);
  }
}

export function waypointInputText(
  nativeValue: number,
  kind: WaypointUnitKind,
  context: WaypointUnitContext,
): string {
  return String(waypointDisplayValue(nativeValue, kind, context));
}

export function waypointDisplayBound(
  nativeValue: number,
  kind: WaypointUnitKind,
  context: WaypointUnitContext,
): number {
  return waypointDisplayValue(nativeValue, kind, context);
}

export function waypointDisplayStep(kind: WaypointUnitKind, context: WaypointUnitContext): number {
  return 1 / (10 ** waypointUnitPrecision(kind, context));
}

export function waypointNativeValue(
  displayValue: number,
  kind: WaypointUnitKind,
  context: WaypointUnitContext,
): number {
  switch (kind) {
    case 'distance':
      return toMetersFromDistanceUnit(displayValue, context.distanceUnit);
    case 'altitude':
      return toMetersFromAltitudeUnit(displayValue, context.altitudeUnit);
    case 'speed':
      return toMetersPerSecondFromSpeedUnit(displayValue, context.speedUnit);
    case 'verticalSpeed':
      return toMetersPerSecondFromVerticalSpeedUnit(displayValue, context.verticalSpeedUnit);
  }
}
