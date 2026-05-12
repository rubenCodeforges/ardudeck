/**
 * Survey Grid Planner Types
 * Types and interfaces for photogrammetry survey planning
 */

export type SurveyPattern = 'grid' | 'crosshatch' | 'circular' | 'spiral' | 'perimeter-fill';

/**
 * Ground-vehicle path pattern. Only meaningful in manual / mower mode
 * (camera.manualCorridorWidth set). Camera flights always use the standard
 * boustrophedon path; the rover may need to avoid U-turns.
 * - boustrophedon: zigzag, rover turns 180° at each line end (skid-steer friendly)
 * - reverse-alternating: rover drives forward on odd lines and in reverse on
 *   even lines, jogging perpendicular between them. Inserts MAV_CMD.DO_SET_REVERSE
 *   between line pairs. Needed for Ackermann/car-like mowers that can't turn in place.
 */
export type GroundPattern = 'boustrophedon' | 'reverse-alternating';

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
  /**
   * When set (>0), bypasses camera-based footprint calculation and uses this
   * value as the survey corridor width directly. Intended for non-camera use
   * cases (e.g. ArduRover lawnmower defining lines by cutting deck width).
   */
  manualCorridorWidth?: number;  // meters
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
  /** Ground-vehicle path pattern. Only consumed in manual / mower mode. */
  groundPattern?: GroundPattern;
  /** Spiral direction (only used when pattern === 'spiral'). */
  spiralDirection?: 'inward' | 'outward';
  /** Number of perimeter passes before the grid fill (only used when pattern === 'perimeter-fill'). */
  perimeterPasses?: number;
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
  groundPattern: 'boustrophedon',
  spiralDirection: 'inward',
  perimeterPasses: 2,
};