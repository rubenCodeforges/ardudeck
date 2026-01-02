/**
 * Mode Presets for the Modes Wizard
 *
 * These presets provide quick setup options for different flying styles.
 * Each preset includes sensible mode configurations for beginners.
 */

import type { MSPModeRange } from '@ardudeck/msp-ts';

// Box IDs from Betaflight (MSP_FLIGHT_MODE)
export const BOX_ID = {
  ARM: 0,
  ANGLE: 1,
  HORIZON: 2,
  MAG: 3,
  HEADFREE: 4,
  PASSTHRU: 5,
  FAILSAFE: 6,
  GPSRESCUE: 7,
  ANTIGRAVITY: 8,
  BEEPER: 13,
  LEDLOW: 15,
  OSD: 19,
  BLACKBOX: 26,
  AIRMODE: 28,
  ACROTRAINER: 29,
  VTXPITMODE: 30,
  PARALYZE: 36,
  BEEPGPSCOUNT: 39,
  VTXCONTROL: 40,
  LAUNCHCONTROL: 41,
} as const;

// Mode metadata with beginner-friendly descriptions
export const MODE_INFO: Record<
  number,
  {
    name: string;
    icon: string;
    description: string;
    color: string;
    beginner: string;
    essential?: boolean;
  }
> = {
  [BOX_ID.ARM]: {
    name: 'ARM',
    icon: '⚡',
    description: 'Enable motors',
    color: 'bg-red-500',
    beginner:
      'SAFETY SWITCH - Arms/disarms your quad motors. ALWAYS put this on a dedicated switch! When armed, propellers can spin at any moment.',
    essential: true,
  },
  [BOX_ID.ANGLE]: {
    name: 'ANGLE',
    icon: '📐',
    description: 'Self-level',
    color: 'bg-blue-500',
    beginner:
      'BEGINNER MODE - Your quad will automatically level itself when you release the sticks. Maximum tilt angle is limited. Perfect for learning to fly!',
    essential: true,
  },
  [BOX_ID.HORIZON]: {
    name: 'HORIZON',
    icon: '🌅',
    description: 'Self-level + acro',
    color: 'bg-purple-500',
    beginner:
      'INTERMEDIATE MODE - Self-levels near center stick like ANGLE, but allows flips and rolls at full stick. A bridge between ANGLE and ACRO.',
  },
  [BOX_ID.AIRMODE]: {
    name: 'AIRMODE',
    icon: '🌀',
    description: 'Full control at zero throttle',
    color: 'bg-cyan-500',
    beginner:
      'ADVANCED - Keeps full stick authority even at zero throttle. Essential for freestyle tricks and flips. Usually kept on all the time.',
  },
  [BOX_ID.GPSRESCUE]: {
    name: 'GPS RESCUE',
    icon: '🛟',
    description: 'Return to home',
    color: 'bg-green-500',
    beginner:
      'EMERGENCY MODE - Activates GPS return-to-home. Your quad will fly back to where it took off. Requires GPS module! Great for when you lose orientation.',
  },
  [BOX_ID.BEEPER]: {
    name: 'BEEPER',
    icon: '🔊',
    description: 'Find my quad',
    color: 'bg-yellow-500',
    beginner:
      'FINDER - Makes your quad beep loudly to help you find it after a crash. Very useful when your quad lands in tall grass!',
  },
  [BOX_ID.FAILSAFE]: {
    name: 'FAILSAFE',
    icon: '🚨',
    description: 'Emergency landing',
    color: 'bg-orange-500',
    beginner:
      'EMERGENCY - Triggers failsafe behavior (usually landing or disarm). Normally activated automatically when signal is lost.',
  },
  [BOX_ID.BLACKBOX]: {
    name: 'BLACKBOX',
    icon: '📦',
    description: 'Flight logging',
    color: 'bg-gray-500',
    beginner:
      'LOGGING - Records flight data to the SD card for analysis. Useful for tuning PIDs and reviewing crashes.',
  },
  [BOX_ID.VTXPITMODE]: {
    name: 'VTX PIT',
    icon: '📡',
    description: 'Low power video',
    color: 'bg-indigo-500',
    beginner:
      'PIT MODE - Puts your video transmitter in low power mode. Required at races before takeoff to avoid interfering with other pilots.',
  },
  [BOX_ID.ACROTRAINER]: {
    name: 'ACRO TRAINER',
    icon: '🎓',
    description: 'Learning acro',
    color: 'bg-pink-500',
    beginner:
      'LEARNING ACRO - Limits how fast the quad can rotate, making acro mode easier to learn. Great stepping stone from ANGLE to full ACRO.',
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
    icon: '🐣',
    description: 'Safe & simple - great for learning',
    tip: 'Your quad will always stay level. Perfect for learning to hover and basic movements!',
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
    icon: '🎭',
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
    icon: '🏎️',
    description: 'Fast & responsive for speed',
    tip: 'Pure ACRO mode for maximum control. Beeper on AUX3 helps find your quad after a crash!',
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
    icon: '🎬',
    description: 'Ultra-smooth for filming',
    tip: 'GPS Rescue brings your quad home if signal is lost (requires GPS module!). Perfect for long-range filming.',
    gradient: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    modes: [
      // ARM on AUX1 high
      { boxId: BOX_ID.ARM, auxChannel: 0, rangeStart: 1800, rangeEnd: 2100 },
      // ANGLE always on (smooth, stable shots)
      { boxId: BOX_ID.ANGLE, auxChannel: 0, rangeStart: 900, rangeEnd: 2100 },
      // GPS RESCUE on AUX2 high
      { boxId: BOX_ID.GPSRESCUE, auxChannel: 1, rangeStart: 1800, rangeEnd: 2100 },
    ],
    wizardModes: [BOX_ID.ARM, BOX_ID.ANGLE, BOX_ID.GPSRESCUE],
  },
};

// All available modes for advanced editor
export const ALL_MODES = Object.entries(MODE_INFO).map(([boxId, info]) => ({
  boxId: Number(boxId),
  ...info,
}));

// Essential modes that should always be visible
export const ESSENTIAL_MODES = ALL_MODES.filter((m) => m.essential);

// AUX channel names
export const AUX_CHANNELS = [
  { index: 0, name: 'AUX 1', description: 'Usually a 2-position switch' },
  { index: 1, name: 'AUX 2', description: 'Often a 3-position switch' },
  { index: 2, name: 'AUX 3', description: 'Additional switch' },
  { index: 3, name: 'AUX 4', description: 'Additional switch' },
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
