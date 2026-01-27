/**
 * Mode Presets for the Modes Wizard
 *
 * These presets provide quick setup options for different flying styles.
 * Each preset includes sensible mode configurations for beginners.
 */

import type { MSPModeRange } from '@ardudeck/msp-ts';
import type { LucideIcon } from 'lucide-react';
import {
  Power, Square, Sunrise, Wind, ArrowUpFromLine, Home, MapPin, Map, Plane, Compass,
  Rocket, Gamepad2, Volume2, ShieldAlert, Package, Satellite, Joystick, PlaneTakeoff,
  RotateCw, RotateCcw, Waypoints, Navigation, KeyRound, Turtle, HelpCircle, Radio,
  Baby, Sparkles, Trophy, Video
} from 'lucide-react';

// iNav permanent box IDs (from fc_msp_box.c)
export const BOX_ID = {
  ARM: 0,
  ANGLE: 1,
  HORIZON: 2,
  NAV_ALTHOLD: 3,
  HEADING_HOLD: 5,
  HEADFREE: 6,
  HEADADJ: 7,
  CAMSTAB: 8,
  NAV_RTH: 10,
  NAV_POSHOLD: 11,
  MANUAL: 12,
  BEEPER: 13,
  LEDS_OFF: 15,
  LIGHTS: 16,
  OSD_OFF: 19,
  TELEMETRY: 20,
  AUTO_TUNE: 21,
  BLACKBOX: 26,
  FAILSAFE: 27,
  NAV_WP: 28,
  AIRMODE: 29,
  HOME_RESET: 30,
  GCS_NAV: 31,
  FPV_ANGLE_MIX: 32,
  SURFACE: 33,
  FLAPERON: 34,
  TURN_ASSIST: 35,
  NAV_LAUNCH: 36,
  SERVO_AUTOTRIM: 37,
  CAMERA_1: 39,
  CAMERA_2: 40,
  CAMERA_3: 41,
  OSD_ALT_1: 42,
  OSD_ALT_2: 43,
  OSD_ALT_3: 44,
  NAV_CRUISE: 45,
  MC_BRAKING: 46,
  USER1: 47,
  USER2: 48,
  LOITER_CHANGE: 49,
  MSP_RC_OVERRIDE: 50,
  PREARM: 51,
  TURTLE: 52,
  NAV_COURSE_HOLD: 53,
  AUTO_LEVEL: 54,
  WP_PLANNER: 55,
  SOARING: 56,
  USER3: 57,
  USER4: 58,
  MISSION_CHANGE: 59,
  BEEPER_MUTE: 60,
  MULTI_FUNC: 61,
  MIXER_PROFILE_2: 62,
  MIXER_TRANSITION: 63,
  ANGLE_HOLD: 64,
} as const;

// Mode metadata with beginner-friendly descriptions
export const MODE_INFO: Record<
  number,
  {
    name: string;
    icon: LucideIcon;
    description: string;
    color: string;
    beginner: string;
    essential?: boolean;
    configureTab?: string; // Tab ID to configure this mode's settings
  }
> = {
  [BOX_ID.ARM]: {
    name: 'ARM',
    icon: Power,
    description: 'Enable motors',
    color: 'bg-red-500',
    beginner:
      'SAFETY SWITCH - Arms/disarms your aircraft. ALWAYS put this on a dedicated switch! When armed, propellers can spin at any moment.',
    essential: true,
  },
  [BOX_ID.ANGLE]: {
    name: 'ANGLE',
    icon: Square,
    description: 'Self-level',
    color: 'bg-blue-500',
    beginner:
      'BEGINNER MODE - Your aircraft will automatically level itself when you release the sticks. Maximum tilt angle is limited. Perfect for learning to fly!',
    essential: true,
  },
  [BOX_ID.HORIZON]: {
    name: 'HORIZON',
    icon: Sunrise,
    description: 'Self-level + acro',
    color: 'bg-purple-500',
    beginner:
      'INTERMEDIATE MODE - Self-levels near center stick like ANGLE, but allows flips and rolls at full stick. A bridge between ANGLE and ACRO.',
  },
  [BOX_ID.AIRMODE]: {
    name: 'AIRMODE',
    icon: Wind,
    description: 'Full control at zero throttle',
    color: 'bg-cyan-500',
    beginner:
      'ADVANCED - Keeps full stick authority even at zero throttle. Essential for freestyle tricks and flips. Usually kept on all the time.',
  },
  [BOX_ID.NAV_ALTHOLD]: {
    name: 'NAV ALTHOLD',
    icon: ArrowUpFromLine,
    description: 'Hold altitude',
    color: 'bg-teal-500',
    beginner: 'Holds current altitude using barometer/GPS. Throttle controls climb/descent rate.',
  },
  [BOX_ID.NAV_RTH]: {
    name: 'NAV RTH',
    icon: Home,
    description: 'Return to home',
    color: 'bg-green-500',
    beginner: 'Return To Home - Aircraft will climb to safe altitude and fly back to launch point. Essential safety feature!',
    essential: true,
  },
  [BOX_ID.NAV_POSHOLD]: {
    name: 'NAV POSHOLD',
    icon: MapPin,
    description: 'Hold position',
    color: 'bg-cyan-500',
    beginner: 'GPS position hold - Aircraft will stay in place. Great for aerial photography or when you need to stop.',
  },
  [BOX_ID.NAV_WP]: {
    name: 'NAV WP',
    icon: Map,
    description: 'Waypoint mission',
    color: 'bg-indigo-500',
    beginner: 'Execute uploaded waypoint mission. Aircraft will fly to each waypoint automatically.',
    essential: true,
  },
  [BOX_ID.NAV_CRUISE]: {
    name: 'NAV CRUISE',
    icon: Plane,
    description: 'Cruise control',
    color: 'bg-sky-500',
    beginner: 'Fixed-wing cruise mode - Maintains heading and altitude. Perfect for long-range flights.',
  },
  [BOX_ID.NAV_COURSE_HOLD]: {
    name: 'COURSE HOLD',
    icon: Compass,
    description: 'Hold course',
    color: 'bg-violet-500',
    beginner: 'Maintains current heading while allowing altitude control. Good for flying in a straight line.',
  },
  [BOX_ID.NAV_LAUNCH]: {
    name: 'NAV LAUNCH',
    icon: Rocket,
    description: 'Auto launch',
    color: 'bg-orange-500',
    beginner: 'Automatic launch sequence for fixed-wing. Throw the plane and it will climb to safe altitude.',
    configureTab: 'auto-launch',
  },
  [BOX_ID.GCS_NAV]: {
    name: 'GCS NAV',
    icon: Gamepad2,
    description: 'Ground control',
    color: 'bg-purple-500',
    beginner: 'Allow ground control station to send navigation commands (fly-to-here, etc).',
  },
  [BOX_ID.BEEPER]: {
    name: 'BEEPER',
    icon: Volume2,
    description: 'Find aircraft',
    color: 'bg-yellow-500',
    beginner:
      'FINDER - Makes your aircraft beep loudly to help you find it after a crash. Very useful when it lands in tall grass!',
  },
  [BOX_ID.FAILSAFE]: {
    name: 'FAILSAFE',
    icon: ShieldAlert,
    description: 'Emergency landing',
    color: 'bg-orange-500',
    beginner:
      'EMERGENCY - Triggers failsafe behavior (usually landing or disarm). Normally activated automatically when signal is lost.',
  },
  [BOX_ID.BLACKBOX]: {
    name: 'BLACKBOX',
    icon: Package,
    description: 'Flight logging',
    color: 'bg-gray-500',
    beginner:
      'LOGGING - Records flight data to the SD card for analysis. Useful for tuning PIDs and reviewing crashes.',
  },
  [BOX_ID.VTXPITMODE]: {
    name: 'VTX PIT',
    icon: Satellite,
    description: 'Low power video',
    color: 'bg-indigo-500',
    beginner:
      'PIT MODE - Puts your video transmitter in low power mode. Required at races before takeoff to avoid interfering with other pilots.',
  },
  [BOX_ID.MANUAL]: {
    name: 'MANUAL',
    icon: Joystick,
    description: 'Direct control',
    color: 'bg-rose-500',
    beginner: 'Direct servo/motor control without stabilization. For experienced pilots only!',
  },
  [BOX_ID.FLAPERON]: {
    name: 'FLAPERON',
    icon: PlaneTakeoff,
    description: 'Flaps mode',
    color: 'bg-amber-500',
    beginner: 'Activates flaperons for slower landing approach. Ailerons droop down to act as flaps.',
  },
  [BOX_ID.TURN_ASSIST]: {
    name: 'TURN ASSIST',
    icon: RotateCw,
    description: 'Coordinated turns',
    color: 'bg-lime-500',
    beginner: 'Auto-coordinates rudder with ailerons for smooth turns. Great for fixed-wing beginners.',
  },
  [BOX_ID.HOME_RESET]: {
    name: 'HOME RESET',
    icon: RotateCcw,
    description: 'Reset home position',
    color: 'bg-red-400',
    beginner: 'Sets current position as new home point. Use when you relocate during a session.',
  },
  [BOX_ID.WP_PLANNER]: {
    name: 'WP PLANNER',
    icon: Waypoints,
    description: 'Mission planner',
    color: 'bg-fuchsia-500',
    beginner: 'Enable in-flight waypoint planning via stick commands.',
  },
  [BOX_ID.HEADING_HOLD]: {
    name: 'HEADING HOLD',
    icon: Navigation,
    description: 'Hold heading',
    color: 'bg-emerald-500',
    beginner: 'Maintains current magnetic heading. Useful for flying straight lines.',
  },
  [BOX_ID.PREARM]: {
    name: 'PREARM',
    icon: KeyRound,
    description: 'Pre-arm check',
    color: 'bg-yellow-600',
    beginner: 'Safety switch - must be enabled before arming. Prevents accidental arm.',
  },
  [BOX_ID.TURTLE]: {
    name: 'TURTLE',
    icon: Turtle,
    description: 'Flip over',
    color: 'bg-stone-500',
    beginner: 'Flip crashed aircraft back over using motor spin. For multirotors only.',
  },
};

// Preset configurations
export interface ModePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  tip: string;
  gradient: string;
  modes: MSPModeRange[];
  // Which modes to configure in the wizard (in order)
  wizardModes: number[];
}

export const PRESETS: Record<string, ModePreset> = {
  beginner: {
    id: 'beginner',
    name: 'Beginner',
    icon: 'baby',
    description: 'Safe & simple - great for learning',
    tip: 'Your aircraft will always stay level. Perfect for learning to hover and basic movements!',
    gradient: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    modes: [
      // ARM on AUX1 high (1800-2100)
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE always on (entire range)
      { boxId: BOX_ID.ANGLE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE],
  },

  freestyle: {
    id: 'freestyle',
    name: 'Freestyle',
    icon: 'sparkles',
    description: 'Balanced for tricks & flow',
    tip: 'Three-position switch on AUX2 gives you ANGLE/HORIZON/ACRO. Flip a switch to change your flying style!',
    gradient: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE on AUX2 low (for recovery)
      { boxId: BOX_ID.ANGLE, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // HORIZON on AUX2 mid
      { boxId: BOX_ID.HORIZON, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // AIRMODE always on
      { boxId: BOX_ID.AIRMODE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.HORIZON, BOX_ID.AIRMODE],
  },

  racing: {
    id: 'racing',
    name: 'Racing',
    icon: 'trophy',
    description: 'Fast & responsive for speed',
    tip: 'Pure ACRO mode for maximum control. Beeper on AUX3 helps find your aircraft after a crash!',
    gradient: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // AIRMODE always on
      { boxId: BOX_ID.AIRMODE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
      // BEEPER on AUX3 high
      { boxId: BOX_ID.BEEPER, auxChannel: 2, rangeStart: 1800, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.AIRMODE, BOX_ID.BEEPER],
  },

  cinematic: {
    id: 'cinematic',
    name: 'Cinematic',
    icon: 'video',
    description: 'Ultra-smooth for filming',
    tip: 'NAV RTH brings your aircraft home if signal is lost (requires GPS!). Perfect for long-range filming.',
    gradient: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE always on (smooth, stable shots)
      { boxId: BOX_ID.ANGLE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
      // NAV RTH on AUX2 high
      { boxId: BOX_ID.NAV_RTH, auxChannel: 1, rangeStart: 1800, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.NAV_RTH],
  },

  fixedWing: {
    id: 'fixedWing',
    name: 'Fixed Wing',
    icon: 'plane',
    description: 'For airplanes with navigation',
    tip: 'Complete setup for fixed-wing with launch assist, RTH, and waypoint navigation.',
    gradient: 'from-sky-500/20 to-blue-500/10 border-sky-500/30',
    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // NAV LAUNCH on AUX2 low (for auto-launch)
      { boxId: BOX_ID.NAV_LAUNCH, auxChannel: 1, rangeStart: 900, rangeEnd: 1300 },
      // NAV RTH on AUX2 mid
      { boxId: BOX_ID.NAV_RTH, auxChannel: 1, rangeStart: 1300, rangeEnd: 1700 },
      // NAV WP on AUX2 high (waypoint mission)
      { boxId: BOX_ID.NAV_WP, auxChannel: 1, rangeStart: 1700, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.NAV_LAUNCH, BOX_ID.NAV_RTH, BOX_ID.NAV_WP],
  },
};

// Preset icon mapping (string key -> Lucide component)
export const PRESET_ICONS: Record<string, LucideIcon> = {
  baby: Baby,
  sparkles: Sparkles,
  trophy: Trophy,
  video: Video,
  plane: Plane,
};

// All available modes for advanced editor
export const ALL_MODES = Object.entries(MODE_INFO).map(([boxId, info]) => ({
  boxId: Number(boxId),
  ...info,
}));

// Essential modes that should always be visible
export const ESSENTIAL_MODES = ALL_MODES.filter((m) => m.essential);

// AUX channel names (iNav/Betaflight support up to 12 AUX channels)
export const AUX_CHANNELS = [
  { index: 0, name: 'AUX 1', description: 'Usually a 2-position switch' },
  { index: 1, name: 'AUX 2', description: 'Often a 3-position switch' },
  { index: 2, name: 'AUX 3', description: 'Additional switch' },
  { index: 3, name: 'AUX 4', description: 'Additional switch' },
  { index: 4, name: 'AUX 5', description: 'Additional channel (knob/slider)' },
  { index: 5, name: 'AUX 6', description: 'Additional channel (knob/slider)' },
  { index: 6, name: 'AUX 7', description: 'Additional channel' },
  { index: 7, name: 'AUX 8', description: 'Additional channel' },
  { index: 8, name: 'AUX 9', description: 'Additional channel' },
  { index: 9, name: 'AUX 10', description: 'Additional channel' },
  { index: 10, name: 'AUX 11', description: 'Additional channel' },
  { index: 11, name: 'AUX 12', description: 'Additional channel' },
] as const;

// PWM range constants
export const PWM = {
  MIN: 900,
  MAX: 2100,
  CENTER: 1500,
  // Common ranges for switches
  LOW: { start: 900, end: 1300 },
  MID: { start: 1300, end: 1700 },
  HIGH: { start: 1700, end: 2100 },
  // Full range (always on)
  ALWAYS: { start: 900, end: 2100 },
} as const;

// Convert PWM to step (for MSP protocol)
export function pwmToStep(pwm: number): number {
  return Math.round((pwm - 900) / 25);
}

// Convert step to PWM
export function stepToPwm(step: number): number {
  return 900 + step * 25;
}
