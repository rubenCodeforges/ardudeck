/**
 * Servo Presets
 *
 * Aircraft type definitions for the Servo Setup Wizard.
 * Each preset defines the control surfaces and their default mixer rules.
 */

// Input sources matching iNav MSP protocol
export const SERVO_INPUT_SOURCE = {
  STABILIZED_ROLL: 0,
  STABILIZED_PITCH: 1,
  STABILIZED_YAW: 2,
  STABILIZED_THROTTLE: 3,
  RC_ROLL: 4,
  RC_PITCH: 5,
  RC_YAW: 6,
  RC_THROTTLE: 7,
  GIMBAL_PITCH: 12,
  GIMBAL_ROLL: 13,
} as const;

// Human-readable names for input sources
export const INPUT_SOURCE_NAMES: Record<number, string> = {
  0: 'Roll',
  1: 'Pitch',
  2: 'Yaw',
  3: 'Throttle',
  4: 'RC Roll (manual)',
  5: 'RC Pitch (manual)',
  6: 'RC Yaw (manual)',
  7: 'RC Throttle (manual)',
  12: 'Gimbal Pitch',
  13: 'Gimbal Roll',
};

// Control surface types
export type ControlSurface =
  | 'aileron_left'
  | 'aileron_right'
  | 'elevator'
  | 'rudder'
  | 'elevon_left'
  | 'elevon_right'
  | 'vtail_left'
  | 'vtail_right'
  | 'yaw_servo'
  | 'gimbal_pan'
  | 'gimbal_tilt';

// Control surface definitions with human-friendly names
export const CONTROL_SURFACE_INFO: Record<ControlSurface, {
  name: string;
  shortName: string;
  description: string;
  inputSource: number;
  defaultRate: number;
}> = {
  aileron_left: {
    name: 'Left Aileron',
    shortName: 'L Ail',
    description: 'Rolls the plane left when down',
    inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL,
    defaultRate: 100,
  },
  aileron_right: {
    name: 'Right Aileron',
    shortName: 'R Ail',
    description: 'Rolls the plane right when down',
    inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL,
    defaultRate: -100, // Inverted from left
  },
  elevator: {
    name: 'Elevator',
    shortName: 'Elev',
    description: 'Pitches the nose up when trailing edge goes up',
    inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH,
    defaultRate: 100,
  },
  rudder: {
    name: 'Rudder',
    shortName: 'Rudr',
    description: 'Yaws the plane left/right',
    inputSource: SERVO_INPUT_SOURCE.STABILIZED_YAW,
    defaultRate: 100,
  },
  elevon_left: {
    name: 'Left Elevon',
    shortName: 'L Elev',
    description: 'Flying wing - combines roll and pitch',
    inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, // Has both roll + pitch
    defaultRate: 100,
  },
  elevon_right: {
    name: 'Right Elevon',
    shortName: 'R Elev',
    description: 'Flying wing - combines roll and pitch',
    inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL,
    defaultRate: -100,
  },
  vtail_left: {
    name: 'Left V-Tail',
    shortName: 'L VT',
    description: 'V-tail - combines elevator and rudder',
    inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH,
    defaultRate: 100,
  },
  vtail_right: {
    name: 'Right V-Tail',
    shortName: 'R VT',
    description: 'V-tail - combines elevator and rudder',
    inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH,
    defaultRate: 100,
  },
  yaw_servo: {
    name: 'Yaw Servo',
    shortName: 'Yaw',
    description: 'Tricopter tail servo for yaw control',
    inputSource: SERVO_INPUT_SOURCE.STABILIZED_YAW,
    defaultRate: 100,
  },
  gimbal_pan: {
    name: 'Gimbal Pan',
    shortName: 'Pan',
    description: 'Camera gimbal horizontal rotation',
    inputSource: SERVO_INPUT_SOURCE.RC_YAW,
    defaultRate: 100,
  },
  gimbal_tilt: {
    name: 'Gimbal Tilt',
    shortName: 'Tilt',
    description: 'Camera gimbal vertical rotation',
    inputSource: SERVO_INPUT_SOURCE.RC_PITCH,
    defaultRate: 100,
  },
};

// Mixer rule for a control surface
export interface ServoMixerRule {
  inputSource: number;
  rate: number; // -125 to +125
}

// Motor mixer rule for CLI mmix command
// Format: mmix <index> <throttle> <roll> <pitch> <yaw>
export interface MotorMixerRule {
  motorIndex: number;
  throttle: number;  // Weight for throttle (typically 1.0)
  roll: number;      // Weight for roll (-1.0 to 1.0)
  pitch: number;     // Weight for pitch (-1.0 to 1.0)
  yaw: number;       // Weight for yaw (-1.0 to 1.0)
}

// Control surface assignment (which servo, what rules)
export interface ControlSurfaceAssignment {
  surface: ControlSurface;
  servoIndex: number;
  mixerRules: ServoMixerRule[];
  reversed: boolean;
  min: number;
  center: number;
  max: number;
}

// Aircraft type categories
export type AircraftCategory = 'fixed_wing' | 'multirotor' | 'other';

// MSP mixer type IDs (from iNav/Betaflight) - Legacy MSP v1
export const MIXER_TYPE = {
  TRI: 0,
  QUADX: 3,
  GIMBAL: 5,
  FLYING_WING: 8,
  AIRPLANE: 14,
  CUSTOM_AIRPLANE: 24,
} as const;

// iNav Platform Types (for MSP2_INAV_SET_MIXER) - This is the CORRECT way to set aircraft type!
export const PLATFORM_TYPE = {
  MULTIROTOR: 0,
  AIRPLANE: 1,
  HELICOPTER: 2,
  TRICOPTER: 3,
  ROVER: 4,
  BOAT: 5,
} as const;

// Aircraft preset definition
export interface AircraftPreset {
  id: string;
  name: string;
  category: AircraftCategory;
  icon: string;
  description: string;
  tip: string;
  servoCount: number;
  controlSurfaces: ControlSurface[];
  // iNav platform type (MSP2_INAV_SET_MIXER) - THE CORRECT WAY!
  platformType: number;
  // MSP mixer type (legacy MSP v1) - fallback for Betaflight
  mixerType: number;
  // Default mixer rules for each control surface (smix)
  defaultRules: Record<ControlSurface, ServoMixerRule[]>;
  // Motor mixer rules for legacy iNav boards (mmix)
  // Required for proper motor configuration on iNav 2.0.0+
  motorMixerRules: MotorMixerRule[];
}

// All aircraft presets
export const AIRCRAFT_PRESETS: Record<string, AircraftPreset> = {
  traditional: {
    id: 'traditional',
    name: 'Traditional',
    category: 'fixed_wing',
    icon: '✈️',
    description: 'Standard plane with ailerons, elevator, rudder',
    tip: 'Most common setup for planes. Separate control surfaces for each axis.',
    servoCount: 4,
    controlSurfaces: ['aileron_left', 'aileron_right', 'elevator', 'rudder'],
    platformType: PLATFORM_TYPE.AIRPLANE,
    mixerType: MIXER_TYPE.AIRPLANE,
    defaultRules: {
      aileron_left: [{ inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: 100 }],
      aileron_right: [{ inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: -100 }],
      elevator: [{ inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 }],
      rudder: [{ inputSource: SERVO_INPUT_SOURCE.STABILIZED_YAW, rate: 100 }],
      // Not used in this preset
      elevon_left: [],
      elevon_right: [],
      vtail_left: [],
      vtail_right: [],
      yaw_servo: [],
      gimbal_pan: [],
      gimbal_tilt: [],
    },
    // Single motor - throttle only (from iNav legacy AIRPLANE mixer)
    motorMixerRules: [
      { motorIndex: 0, throttle: 1.0, roll: 0, pitch: 0, yaw: 0 },
    ],
  },

  flying_wing: {
    id: 'flying_wing',
    name: 'Flying Wing',
    category: 'fixed_wing',
    icon: '🔺',
    description: 'Delta/flying wing with 2 elevons',
    tip: 'Elevons combine aileron and elevator function. No tail surfaces.',
    servoCount: 2,
    controlSurfaces: ['elevon_left', 'elevon_right'],
    platformType: PLATFORM_TYPE.AIRPLANE,
    mixerType: MIXER_TYPE.FLYING_WING,
    defaultRules: {
      aileron_left: [],
      aileron_right: [],
      elevator: [],
      rudder: [],
      elevon_left: [
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: 100 },
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 },
      ],
      elevon_right: [
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: -100 },
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 },
      ],
      vtail_left: [],
      vtail_right: [],
      yaw_servo: [],
      gimbal_pan: [],
      gimbal_tilt: [],
    },
    // Single pusher motor - throttle only (from iNav legacy FLYING_WING mixer)
    motorMixerRules: [
      { motorIndex: 0, throttle: 1.0, roll: 0, pitch: 0, yaw: 0 },
    ],
  },

  vtail: {
    id: 'vtail',
    name: 'V-Tail',
    category: 'fixed_wing',
    icon: 'V',
    description: 'Plane with V-tail (ruddervators)',
    tip: 'V-tail surfaces combine elevator and rudder. Standard ailerons.',
    servoCount: 4,
    controlSurfaces: ['aileron_left', 'aileron_right', 'vtail_left', 'vtail_right'],
    platformType: PLATFORM_TYPE.AIRPLANE,
    mixerType: MIXER_TYPE.CUSTOM_AIRPLANE,
    defaultRules: {
      aileron_left: [{ inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: 100 }],
      aileron_right: [{ inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: -100 }],
      elevator: [],
      rudder: [],
      elevon_left: [],
      elevon_right: [],
      vtail_left: [
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 },
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_YAW, rate: 50 },
      ],
      vtail_right: [
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 },
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_YAW, rate: -50 },
      ],
      yaw_servo: [],
      gimbal_pan: [],
      gimbal_tilt: [],
    },
    // Single motor - throttle only
    motorMixerRules: [
      { motorIndex: 0, throttle: 1.0, roll: 0, pitch: 0, yaw: 0 },
    ],
  },

  delta: {
    id: 'delta',
    name: 'Delta',
    category: 'fixed_wing',
    icon: '△',
    description: 'Delta wing with elevons and rudder',
    tip: 'Like flying wing but with a vertical tail for rudder.',
    servoCount: 3,
    controlSurfaces: ['elevon_left', 'elevon_right', 'rudder'],
    platformType: PLATFORM_TYPE.AIRPLANE,
    mixerType: MIXER_TYPE.CUSTOM_AIRPLANE,
    defaultRules: {
      aileron_left: [],
      aileron_right: [],
      elevator: [],
      rudder: [{ inputSource: SERVO_INPUT_SOURCE.STABILIZED_YAW, rate: 100 }],
      elevon_left: [
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: 100 },
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 },
      ],
      elevon_right: [
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_ROLL, rate: -100 },
        { inputSource: SERVO_INPUT_SOURCE.STABILIZED_PITCH, rate: 100 },
      ],
      vtail_left: [],
      vtail_right: [],
      yaw_servo: [],
      gimbal_pan: [],
      gimbal_tilt: [],
    },
    // Single motor - throttle only
    motorMixerRules: [
      { motorIndex: 0, throttle: 1.0, roll: 0, pitch: 0, yaw: 0 },
    ],
  },

  tricopter: {
    id: 'tricopter',
    name: 'Tricopter',
    category: 'multirotor',
    icon: 'Y',
    description: 'Tricopter with yaw servo',
    tip: 'Only the rear yaw servo needs configuration. Motors are handled separately.',
    servoCount: 1,
    controlSurfaces: ['yaw_servo'],
    platformType: PLATFORM_TYPE.TRICOPTER,
    mixerType: MIXER_TYPE.TRI,
    defaultRules: {
      aileron_left: [],
      aileron_right: [],
      elevator: [],
      rudder: [],
      elevon_left: [],
      elevon_right: [],
      vtail_left: [],
      vtail_right: [],
      yaw_servo: [{ inputSource: SERVO_INPUT_SOURCE.STABILIZED_YAW, rate: 100 }],
      gimbal_pan: [],
      gimbal_tilt: [],
    },
    // Y3 tricopter motor configuration (from iNav legacy TRI mixer)
    // Note: Yaw is handled by servo, not motors (yaw=0 for all motors)
    motorMixerRules: [
      { motorIndex: 0, throttle: 1.0, roll: 0, pitch: 1.333, yaw: 0 },
      { motorIndex: 1, throttle: 1.0, roll: -1.0, pitch: -0.667, yaw: 0 },
      { motorIndex: 2, throttle: 1.0, roll: 1.0, pitch: -0.667, yaw: 0 },
    ],
  },

  gimbal: {
    id: 'gimbal',
    name: 'Gimbal',
    category: 'other',
    icon: '🎥',
    description: '2-axis camera gimbal (pan/tilt)',
    tip: 'For camera stabilization. Uses RC input, not stabilized output.',
    servoCount: 2,
    controlSurfaces: ['gimbal_pan', 'gimbal_tilt'],
    platformType: PLATFORM_TYPE.MULTIROTOR, // Gimbal typically on quads
    mixerType: MIXER_TYPE.GIMBAL,
    defaultRules: {
      aileron_left: [],
      aileron_right: [],
      elevator: [],
      rudder: [],
      elevon_left: [],
      elevon_right: [],
      vtail_left: [],
      vtail_right: [],
      yaw_servo: [],
      gimbal_pan: [{ inputSource: SERVO_INPUT_SOURCE.RC_YAW, rate: 100 }],
      gimbal_tilt: [{ inputSource: SERVO_INPUT_SOURCE.RC_PITCH, rate: 100 }],
    },
    // Gimbal has no motors - servos only
    motorMixerRules: [],
  },
};

// Get preset by ID
export function getPreset(id: string): AircraftPreset | undefined {
  return AIRCRAFT_PRESETS[id];
}

// Get all presets by category
export function getPresetsByCategory(category: AircraftCategory): AircraftPreset[] {
  return Object.values(AIRCRAFT_PRESETS).filter((p) => p.category === category);
}

// Get default servo assignments for a preset
export function getDefaultAssignments(presetId: string): ControlSurfaceAssignment[] {
  const preset = AIRCRAFT_PRESETS[presetId];
  if (!preset) return [];

  return preset.controlSurfaces.map((surface, index) => ({
    surface,
    servoIndex: index,
    mixerRules: preset.defaultRules[surface] || [],
    reversed: false,
    min: 1000,
    center: 1500,
    max: 2000,
  }));
}
