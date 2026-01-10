/**
 * CCRP (Continuously Computed Release Point) Calculator
 *
 * Calculates optimal payload release point for hitting a target,
 * used for reforestation, firefighting, agriculture, and other
 * payload drop applications.
 *
 * Includes lineup guidance (azimuth/heading error) to help
 * pilot align with the target before release.
 */

export interface CcrpInput {
  // Aircraft state
  aircraftLat: number; // degrees
  aircraftLon: number; // degrees
  aircraftAltAgl: number; // meters above ground level
  groundSpeed: number; // m/s
  heading: number; // degrees (0-360, current aircraft heading)

  // Target position
  targetLat: number; // degrees
  targetLon: number; // degrees

  // Payload characteristics
  descentRateMs: number; // m/s (how fast payload falls)
}

export interface CcrpResult {
  // Release timing
  distanceToTarget: number; // meters (horizontal distance to target)
  distanceToRelease: number; // meters (negative = already passed release point)
  timeToRelease: number; // seconds (negative = already passed)
  releaseProgress: number; // 0.0 (far) to 1.0 (release NOW), >1.0 (passed)
  forwardTravel: number; // meters payload travels forward during fall
  fallTime: number; // seconds payload is in the air

  // Lineup guidance
  bearingToTarget: number; // degrees (0-360, direction to target)
  headingError: number; // degrees (-180 to +180, positive = turn right)
  isLinedUp: boolean; // true when heading error is within tolerance

  // Status
  inRange: boolean; // true when should release (lined up AND within distance tolerance)
  passed: boolean; // true when past release point
  valid: boolean; // false if inputs are invalid
}

/** Tolerance for "in range" detection (meters) */
const IN_RANGE_TOLERANCE = 15;

/** Maximum distance for progress calculation */
const MAX_DISPLAY_DISTANCE = 500;

/** Heading error tolerance for "lined up" status (degrees) */
const LINEUP_TOLERANCE_DEG = 5;

/**
 * Calculate bearing from point A to point B
 * @returns bearing in degrees (0-360)
 */
function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

  let bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360; // Normalize to 0-360
}

/**
 * Calculate distance between two points using Haversine formula
 * @returns distance in meters
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const lat1Rad = (lat1 * Math.PI) / 180;
  const lat2Rad = (lat2 * Math.PI) / 180;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Normalize heading error to -180 to +180 range
 * Positive = need to turn right, Negative = need to turn left
 */
function normalizeHeadingError(error: number): number {
  while (error > 180) error -= 360;
  while (error < -180) error += 360;
  return error;
}

/**
 * Calculate CCRP release point with lineup guidance
 */
export function calculateCcrp(input: CcrpInput): CcrpResult {
  // Validate inputs
  if (
    input.groundSpeed <= 0 ||
    input.aircraftAltAgl <= 0 ||
    input.descentRateMs <= 0
  ) {
    return {
      distanceToTarget: 0,
      distanceToRelease: 0,
      timeToRelease: 0,
      releaseProgress: 0,
      forwardTravel: 0,
      fallTime: 0,
      bearingToTarget: 0,
      headingError: 0,
      isLinedUp: false,
      inRange: false,
      passed: false,
      valid: false,
    };
  }

  // 1. Calculate bearing to target
  const bearingToTarget = calculateBearing(
    input.aircraftLat,
    input.aircraftLon,
    input.targetLat,
    input.targetLon
  );

  // 2. Calculate heading error (how much we need to turn)
  const headingError = normalizeHeadingError(bearingToTarget - input.heading);

  // 3. Check if lined up (within tolerance)
  const isLinedUp = Math.abs(headingError) <= LINEUP_TOLERANCE_DEG;

  // 4. Calculate distance to target
  const distanceToTarget = calculateDistance(
    input.aircraftLat,
    input.aircraftLon,
    input.targetLat,
    input.targetLon
  );

  // 5. Calculate fall time: how long payload is in the air
  const fallTime = input.aircraftAltAgl / input.descentRateMs;

  // 6. Calculate forward travel: how far payload moves horizontally during fall
  const forwardTravel = input.groundSpeed * fallTime;

  // 7. Calculate distance to release point
  // Need to release when: distanceToTarget = forwardTravel
  // So release distance = current distance - forward travel needed
  const distanceToRelease = distanceToTarget - forwardTravel;

  // 8. Calculate time to release (at current speed)
  const timeToRelease = distanceToRelease / input.groundSpeed;

  // 9. Calculate progress for visual gauge
  // 0.0 = far away, 1.0 = at release point, >1.0 = passed
  let releaseProgress: number;
  if (distanceToRelease >= MAX_DISPLAY_DISTANCE) {
    releaseProgress = 0;
  } else if (distanceToRelease <= 0) {
    // Passed the release point
    releaseProgress = 1 + Math.abs(distanceToRelease) / MAX_DISPLAY_DISTANCE;
  } else {
    releaseProgress = 1 - distanceToRelease / MAX_DISPLAY_DISTANCE;
  }

  // 10. Determine if in range (should release now) - ONLY if lined up!
  const inRange =
    isLinedUp &&
    distanceToRelease <= IN_RANGE_TOLERANCE &&
    distanceToRelease >= -IN_RANGE_TOLERANCE;

  // 11. Determine if passed
  const passed = distanceToRelease < -IN_RANGE_TOLERANCE;

  return {
    distanceToTarget,
    distanceToRelease,
    timeToRelease,
    releaseProgress: Math.max(0, releaseProgress),
    forwardTravel,
    fallTime,
    bearingToTarget,
    headingError,
    isLinedUp,
    inRange,
    passed,
    valid: true,
  };
}

/**
 * Payload presets for common use cases
 */
export interface PayloadPreset {
  name: string;
  weightKg: number;
  descentRateMs: number;
  description: string;
}

export const PAYLOAD_PRESETS: PayloadPreset[] = [
  {
    name: 'seed_balls',
    weightKg: 0.05,
    descentRateMs: 8,
    description: 'Small seed balls for reforestation',
  },
  {
    name: 'water_container',
    weightKg: 5,
    descentRateMs: 12,
    description: 'Water container for firefighting',
  },
  {
    name: 'supply_package',
    weightKg: 2,
    descentRateMs: 3,
    description: 'Supply package with parachute',
  },
  {
    name: 'custom',
    weightKg: 1,
    descentRateMs: 5,
    description: 'Custom payload configuration',
  },
];

export const DEFAULT_PAYLOAD_CONFIG = PAYLOAD_PRESETS[0];
