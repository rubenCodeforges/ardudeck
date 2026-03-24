/**
 * Survey Grid Planner Types
 * Types and interfaces for photogrammetry survey planning
 */

export type SurveyPattern = 'grid' | 'crosshatch' | 'circular';

/**
 * Altitude reference frame for survey waypoints.
 * - 'relative': Altitude relative to home position (GLOBAL_RELATIVE_ALT)
 * - 'asl': Altitude above mean sea level (GLOBAL)
 * - 'terrain': Altitude relative to terrain at each point (GLOBAL_TERRAIN_ALT)
 */
export type AltitudeReference = 'relative' | 'asl' | 'terrain';

export interface CameraPreset {
  name: string;
  sensorWidth: number;   // mm
  sensorHeight: number;  // mm
  imageWidth: number;     // pixels
  imageHeight: number;    // pixels
  focalLength: number;    // mm
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SurveyConfig {
  polygon: LatLng[];
  pattern: SurveyPattern;
  altitude: number;          // meters AGL
  speed: number;             // m/s
  frontOverlap: number;      // % (60-90)
  sideOverlap: number;       // % (20-99)
  camera: CameraPreset;
  gridAngle: number;         // degrees, 0=north-south lines
  overshoot: number;         // meters past polygon edge for turns
  altitudeReference: AltitudeReference;
}

export interface SurveyResult {
  waypoints: LatLng[];
  photoPositions: LatLng[];
  footprints: LatLng[][];
  stats: SurveyStats;
}

export interface SurveyStats {
  gsd: number;               // cm/px
  flightDistance: number;     // meters
  flightTime: number;        // seconds
  photoCount: number;
  lineCount: number;
  areaCovered: number;       // sq meters (polygon area)
  footprintWidth: number;    // meters (single image ground width)
  footprintHeight: number;   // meters (single image ground height)
  lineSpacing: number;       // meters
  photoSpacing: number;      // meters
}

export const DEFAULT_SURVEY_CONFIG: Omit<SurveyConfig, 'polygon'> = {
  pattern: 'grid',
  altitude: 80,
  speed: 5,
  frontOverlap: 75,
  sideOverlap: 60,
  camera: {
    name: 'DJI Mavic 3E',
    sensorWidth: 17.3,
    sensorHeight: 13,
    imageWidth: 5280,
    imageHeight: 3956,
    focalLength: 12.3,
  },
  gridAngle: 0,
  overshoot: 20,
  altitudeReference: 'relative',
};