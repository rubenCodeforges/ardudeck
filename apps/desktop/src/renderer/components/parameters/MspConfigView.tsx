/**
 * MSP Configuration View
 * Beginner-friendly PID tuning, rates, and modes for Betaflight/iNav
 *
 * Philosophy: "No PhD required" - accessible for beginners, powerful for experts
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import inavLogo from '../../assets/inav-logo.png';
import betaflightLogo from '../../assets/betaflight-logo.svg';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useModesWizardStore } from '../../stores/modes-wizard-store';
import { useQuickSetupStore } from '../../stores/quick-setup-store';
import ModesWizard from '../modes/ModesWizard';
import QuickSetupWizard from '../quick-setup/QuickSetupWizard';
import ModesAdvancedEditor from '../modes/ModesAdvancedEditor';
import ServoTuningTab from './ServoTuningTab';
import ServoMixerTab from './ServoMixerTab';
import MotorMixerTab from './MotorMixerTab';
import NavigationTab from './NavigationTab';
import SafetyTab, { type SafetyTabHandle } from './SafetyTab';
import AutoLaunchTab from './AutoLaunchTab';
// GpsRescueTab removed - GPS Rescue is now integrated into SafetyTab
import FilterConfigTab from './FilterConfigTab';
import VtxConfigTab from './VtxConfigTab';
import { DraggableSlider } from '../ui/DraggableSlider';
import {
  SlidersHorizontal,
  Gauge,
  Gamepad2,
  Shuffle,
  Cog,
  Compass,
  Radio,
  Shield,
  ChevronDown,
  Layers,
  Egg,
  Drama,
  Zap,
  Film,
  RotateCcw,
  Rocket,
  Power,
  Square,
  Sunrise,
  ArrowUpFromLine,
  Navigation,
  Move3d,
  RotateCw,
  Camera,
  Home,
  MapPin,
  Joystick,
  Volume2,
  Lightbulb,
  Flashlight,
  Monitor,
  Satellite,
  Settings2,
  Package,
  ShieldAlert,
  Map,
  Wind,
  Lock,
  PlaneTakeoff,
  Scissors,
  Plane,
  OctagonX,
  KeyRound,
  Turtle,
  Waypoints,
  CloudSun,
  Wand2,
  HelpCircle,
  Waves,
  MoveHorizontal,
  MoveVertical,
  RefreshCw,
  Info,
  Ruler,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

// Types
interface MSPPidCoefficients {
  p: number;
  i: number;
  d: number;
}

interface MSPPid {
  roll: MSPPidCoefficients;
  pitch: MSPPidCoefficients;
  yaw: MSPPidCoefficients;
}

interface MSPRcTuning {
  rcRate: number;
  rcExpo: number;
  rollPitchRate: number;
  yawRate: number;
  dynThrPID: number;
  throttleMid: number;
  throttleExpo: number;
  tpaBreakpoint: number;
  rcYawExpo: number;
  rcYawRate: number;
  rcPitchRate: number;
  rcPitchExpo: number;
  rollRate: number;
  pitchRate: number;
  yawRateLimit: number;
  ratesType: number;
  throttleLimitType?: number;
  throttleLimitPercent?: number;
  rollRateLimit?: number;
  pitchRateLimit?: number;
}

interface MSPModeRange {
  boxId: number;
  auxChannel: number;
  rangeStart: number;
  rangeEnd: number;
}

// Default Betaflight PIDs (for reset functionality)
const DEFAULT_PIDS: MSPPid = {
  roll: { p: 42, i: 85, d: 35 },
  pitch: { p: 46, i: 90, d: 38 },
  yaw: { p: 35, i: 90, d: 0 },
};

// Default Betaflight rates (for reset functionality)
// Note: rollPitchRate is the legacy combined rate field - old iNav uses this, not separate rollRate/pitchRate
const DEFAULT_RATES: Partial<MSPRcTuning> = {
  rcRate: 100,
  rcExpo: 0,
  rcPitchRate: 100,
  rcPitchExpo: 0,
  rcYawRate: 100,
  rcYawExpo: 0,
  rollPitchRate: 70, // Legacy combined rate for old iNav
  rollRate: 70,
  pitchRate: 70,
  yawRate: 70,
  throttleLimitType: 0,
  throttleLimitPercent: 100,
  rollRateLimit: 1998,
  pitchRateLimit: 1998,
  yawRateLimit: 1998,
};

// Rate Presets - common rate configurations
// Note: rollPitchRate is legacy combined rate for old iNav - must match rollRate for compatibility
const RATE_PRESETS: Record<string, {
  name: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  color: string;
  rates: Partial<MSPRcTuning>;
}> = {
  beginner: {
    name: 'Beginner',
    description: 'Slow & predictable - great for learning',
    icon: Egg,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    rates: {
      rcRate: 80, rcExpo: 20, rollPitchRate: 40, rollRate: 40,
      rcPitchRate: 80, rcPitchExpo: 20, pitchRate: 40,
      rcYawRate: 80, rcYawExpo: 20, yawRate: 40,
    },
  },
  freestyle: {
    name: 'Freestyle',
    description: 'Balanced for tricks & flow',
    icon: Drama,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    rates: {
      rcRate: 100, rcExpo: 15, rollPitchRate: 70, rollRate: 70,
      rcPitchRate: 100, rcPitchExpo: 15, pitchRate: 70,
      rcYawRate: 100, rcYawExpo: 10, yawRate: 65,
    },
  },
  racing: {
    name: 'Racing',
    description: 'Fast & responsive for speed',
    icon: Zap,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    rates: {
      rcRate: 120, rcExpo: 5, rollPitchRate: 80, rollRate: 80,
      rcPitchRate: 120, rcPitchExpo: 5, pitchRate: 80,
      rcYawRate: 110, rcYawExpo: 0, yawRate: 70,
    },
  },
  cinematic: {
    name: 'Cinematic',
    description: 'Ultra-smooth for filming',
    icon: Film,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    rates: {
      rcRate: 70, rcExpo: 40, rollPitchRate: 30, rollRate: 30,
      rcPitchRate: 70, rcPitchExpo: 40, pitchRate: 30,
      rcYawRate: 60, rcYawExpo: 30, yawRate: 25,
    },
  },
};

// Custom profile storage keys
const PID_PROFILES_KEY = 'ardudeck_pid_profiles';
const RATE_PROFILES_KEY = 'ardudeck_rate_profiles';

// Load custom profiles from localStorage
function loadCustomProfiles<T>(key: string): Record<string, { name: string; data: T }> {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Save custom profiles to localStorage
function saveCustomProfiles<T>(key: string, profiles: Record<string, { name: string; data: T }>): void {
  localStorage.setItem(key, JSON.stringify(profiles));
}

// PID Presets - make tuning accessible
const PID_PRESETS: Record<string, {
  name: string;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  color: string;
  pids: { roll: MSPPidCoefficients; pitch: MSPPidCoefficients; yaw: MSPPidCoefficients };
}> = {
  beginner: {
    name: 'Beginner',
    description: 'Smooth & forgiving - great for learning',
    icon: Egg,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    pids: {
      roll: { p: 35, i: 40, d: 20 },
      pitch: { p: 38, i: 42, d: 22 },
      yaw: { p: 45, i: 50, d: 0 },
    },
  },
  freestyle: {
    name: 'Freestyle',
    description: 'Responsive & smooth for tricks',
    icon: Drama,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    pids: {
      roll: { p: 45, i: 45, d: 28 },
      pitch: { p: 48, i: 48, d: 30 },
      yaw: { p: 55, i: 50, d: 0 },
    },
  },
  racing: {
    name: 'Racing',
    description: 'Snappy & precise for speed',
    icon: Zap,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    pids: {
      roll: { p: 55, i: 50, d: 32 },
      pitch: { p: 58, i: 52, d: 34 },
      yaw: { p: 65, i: 55, d: 0 },
    },
  },
  cinematic: {
    name: 'Cinematic',
    description: 'Ultra-smooth for video',
    icon: Film,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    pids: {
      roll: { p: 30, i: 35, d: 18 },
      pitch: { p: 32, i: 38, d: 20 },
      yaw: { p: 40, i: 45, d: 0 },
    },
  },
};

// Mode definitions with beginner-friendly explanations
// iNav permanent box IDs (from fc_msp_box.c) - must match mode-presets.ts BOX_ID
const MODE_INFO: Record<number, { name: string; icon: LucideIcon; description: string; color: string; beginner: string; configureTab?: string }> = {
  0: { name: 'ARM', icon: Power, description: 'Enable motors', color: 'bg-red-500', beginner: 'SAFETY SWITCH - Arms/disarms your aircraft. Always have this on a switch!' },
  1: { name: 'ANGLE', icon: Square, description: 'Self-level', color: 'bg-blue-500', beginner: 'BEGINNER MODE - Aircraft stays level automatically. Best for learning!' },
  2: { name: 'HORIZON', icon: Sunrise, description: 'Hybrid mode', color: 'bg-cyan-500', beginner: 'TRAINING MODE - Self-levels at center, allows flips at full stick' },
  3: { name: 'NAV ALTHOLD', icon: ArrowUpFromLine, description: 'Hold altitude', color: 'bg-teal-500', beginner: 'Holds current altitude using barometer/GPS. Throttle controls climb/descent rate.' },
  5: { name: 'HEADING HOLD', icon: Navigation, description: 'Hold heading', color: 'bg-emerald-500', beginner: 'Maintains current magnetic heading. Useful for flying straight lines.' },
  6: { name: 'HEADFREE', icon: Move3d, description: 'Headless mode', color: 'bg-purple-500', beginner: 'Stick directions are relative to pilot, not aircraft - useful for beginners' },
  7: { name: 'HEADADJ', icon: RotateCw, description: 'Head adjust', color: 'bg-gray-500', beginner: 'Resets headfree reference direction' },
  8: { name: 'CAMSTAB', icon: Camera, description: 'Camera stabilization', color: 'bg-indigo-500', beginner: 'Stabilizes camera servo output' },
  10: { name: 'NAV RTH', icon: Home, description: 'Return to home', color: 'bg-green-500', beginner: 'Return To Home - Aircraft will climb to safe altitude and fly back to launch point. Essential safety feature!' },
  11: { name: 'NAV POSHOLD', icon: MapPin, description: 'Hold position', color: 'bg-cyan-500', beginner: 'GPS position hold - Aircraft will stay in place. Great for aerial photography or when you need to stop.' },
  12: { name: 'MANUAL', icon: Joystick, description: 'Direct control', color: 'bg-rose-500', beginner: 'Direct servo/motor control without stabilization. For experienced pilots only!' },
  13: { name: 'BEEPER', icon: Volume2, description: 'Find aircraft', color: 'bg-yellow-500', beginner: 'Makes your aircraft beep - great for finding it in grass!' },
  15: { name: 'LEDS OFF', icon: Lightbulb, description: 'Disable LEDs', color: 'bg-gray-500', beginner: 'Turns off LED strip' },
  16: { name: 'LIGHTS', icon: Flashlight, description: 'Navigation lights', color: 'bg-amber-500', beginner: 'Turns on navigation lights' },
  19: { name: 'OSD OFF', icon: Monitor, description: 'Hide OSD', color: 'bg-gray-500', beginner: 'Turns off on-screen display' },
  20: { name: 'TELEMETRY', icon: Satellite, description: 'Telemetry output', color: 'bg-blue-500', beginner: 'Enables telemetry transmission' },
  21: { name: 'AUTO TUNE', icon: Settings2, description: 'PID autotune', color: 'bg-violet-500', beginner: 'Automatically tunes PID values during flight' },
  26: { name: 'BLACKBOX', icon: Package, description: 'Flight logging', color: 'bg-pink-500', beginner: 'Records flight data for tuning analysis' },
  27: { name: 'FAILSAFE', icon: ShieldAlert, description: 'Emergency', color: 'bg-orange-500', beginner: 'EMERGENCY MODE - Triggers failsafe behavior. Normally activated automatically when signal is lost.' },
  28: { name: 'NAV WP', icon: Map, description: 'Waypoint mission', color: 'bg-indigo-500', beginner: 'Execute uploaded waypoint mission. Aircraft will fly to each waypoint automatically.' },
  29: { name: 'AIRMODE', icon: Wind, description: 'Full control at zero throttle', color: 'bg-cyan-500', beginner: 'Keeps full stick authority even at zero throttle. Essential for freestyle tricks and flips.' },
  30: { name: 'HOME RESET', icon: RotateCcw, description: 'Reset home position', color: 'bg-red-400', beginner: 'Sets current position as new home point. Use when you relocate during a session.' },
  31: { name: 'GCS NAV', icon: Gamepad2, description: 'Ground control', color: 'bg-purple-500', beginner: 'Allow ground control station to send navigation commands (fly-to-here, etc).' },
  34: { name: 'FLAPERON', icon: PlaneTakeoff, description: 'Flaps mode', color: 'bg-amber-500', beginner: 'Activates flaperons for slower landing approach. Ailerons droop down to act as flaps.' },
  35: { name: 'TURN ASSIST', icon: RotateCw, description: 'Coordinated turns', color: 'bg-lime-500', beginner: 'Auto-coordinates rudder with ailerons for smooth turns. Great for fixed-wing beginners.' },
  36: { name: 'NAV LAUNCH', icon: Rocket, description: 'Auto launch', color: 'bg-orange-500', beginner: 'Automatic launch sequence for fixed-wing. Throw the plane and it will climb to safe altitude.', configureTab: 'auto-launch' },
  37: { name: 'SERVO AUTOTRIM', icon: Scissors, description: 'Auto trim servos', color: 'bg-gray-500', beginner: 'Automatically adjusts servo trim during flight' },
  45: { name: 'NAV CRUISE', icon: Plane, description: 'Cruise control', color: 'bg-sky-500', beginner: 'Fixed-wing cruise mode - Maintains heading and altitude. Perfect for long-range flights.' },
  46: { name: 'MC BRAKING', icon: OctagonX, description: 'Multirotor braking', color: 'bg-red-500', beginner: 'Aggressive braking when releasing sticks on multirotor' },
  51: { name: 'PREARM', icon: KeyRound, description: 'Pre-arm check', color: 'bg-yellow-600', beginner: 'Safety switch - must be enabled before arming. Prevents accidental arm.' },
  52: { name: 'TURTLE', icon: Turtle, description: 'Flip over', color: 'bg-stone-500', beginner: 'Flip crashed aircraft back over using motor spin. For multirotors only.' },
  53: { name: 'COURSE HOLD', icon: Compass, description: 'Hold course', color: 'bg-violet-500', beginner: 'Maintains current heading while allowing altitude control. Good for flying in a straight line.' },
  55: { name: 'WP PLANNER', icon: Waypoints, description: 'Mission planner', color: 'bg-fuchsia-500', beginner: 'Enable in-flight waypoint planning via stick commands.' },
  56: { name: 'SOARING', icon: CloudSun, description: 'Thermal soaring', color: 'bg-sky-400', beginner: 'Enables thermal detection and circling for gliders' },
};


// Betaflight Rate Types - different curve algorithms
const RATE_TYPES = [
  { value: 0, label: 'Betaflight', description: 'Classic exponential + super rate' },
  { value: 1, label: 'Raceflight', description: 'Polynomial curves for racing' },
  { value: 2, label: 'KISS', description: 'Linear rate response' },
  { value: 3, label: 'Actual', description: 'Precise deg/s control (popular)' },
  { value: 4, label: 'Quick', description: 'Rapid response curves' },
];

// Quick Preset Selector Component
function PresetSelector<T extends Record<string, { name: string; description: string; icon: LucideIcon; iconColor: string; color: string }>>({
  presets,
  onApply,
  label = 'Quick Presets',
}: {
  presets: T;
  onApply: (key: keyof T) => void;
  label?: string;
}) {
  return (
    <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/5 rounded-xl border border-indigo-500/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
            <Wand2 className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <p className="text-indigo-300 font-medium">{label}</p>
            <p className="text-xs text-gray-500">Click to apply a tuning style</p>
          </div>
        </div>
        <div className="flex gap-2">
          {Object.entries(presets).map(([key, preset]) => {
            const IconComponent = preset.icon;
            return (
              <button
                key={key}
                onClick={() => onApply(key as keyof T)}
                className={`group flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-br ${preset.color} border hover:scale-105 transition-all duration-150`}
                title={preset.description}
              >
                <IconComponent className={`w-4 h-4 ${preset.iconColor}`} />
                <span className="text-sm text-gray-200 group-hover:text-white">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Calculate rate (deg/s) at a given stick position.
 * Formulas match Betaflight Configurator's RateCurve.js exactly.
 *
 * ArduDeck stores raw U8 values (0-255). BF Configurator stores decimals (divided by 100).
 * Each rate type scales these differently before applying the formula.
 *
 * @param stick - Stick position 0..1 (positive half only)
 * @param rcRate - Raw U8 RC rate value from FC
 * @param superRate - Raw U8 rate value from FC
 * @param expo - Raw U8 expo value from FC
 * @param ratesType - 0=Betaflight, 1=Raceflight, 2=KISS, 3=Actual, 4=Quick
 */
function calculateRate(stick: number, rcRate: number, superRate: number, expo: number, ratesType: number): number {
  const absStick = Math.abs(stick);

  switch (ratesType) {
    case 0: { // Betaflight — from getBetaflightRates()
      let rcRateF = rcRate / 100;
      if (rcRateF > 2) rcRateF += (rcRateF - 2) * 14.54;
      const rateF = superRate / 100;
      const expoF = expo / 100;

      let rcCommandf = stick;
      if (expoF > 0) {
        rcCommandf = stick * Math.pow(absStick, 3) * expoF + stick * (1 - expoF);
      }
      let angleRate = 200 * rcRateF * rcCommandf;
      if (rateF > 0) {
        angleRate *= 1 / Math.max(0.01, 1 - absStick * rateF);
      }
      return angleRate;
    }

    case 1: { // Raceflight — from getRaceflightRates()
      // BF scales: rate*100, rcRate*1000, expo*100
      const rateF = superRate;     // ArduDeck raw 40 = BF 0.40*100
      const rcRateF = rcRate * 10; // ArduDeck raw 80 = BF 0.80*1000
      const expoF = expo;          // ArduDeck raw 20 = BF 0.20*100

      let angularVel = (1 + 0.01 * expoF * (stick * stick - 1.0)) * stick;
      angularVel = angularVel * (rcRateF + Math.abs(angularVel) * rcRateF * rateF * 0.01);
      return angularVel;
    }

    case 2: { // KISS — from getKISSRates()
      // BF uses raw decimals (divided by 100)
      const rateF = superRate / 100;
      const rcRateF = rcRate / 100;
      const expoF = expo / 100;

      const kissRpy = 1 - absStick * rateF;
      const kissTempCurve = stick * stick;
      const rcCmd = (stick * kissTempCurve * expoF + stick * (1 - expoF)) * (rcRateF / 10);
      return 2000.0 * (1.0 / kissRpy) * rcCmd;
    }

    case 3: { // Actual — from getActualRates()
      // BF scales: rate*1000, rcRate*1000 (both are deg/s)
      const maxRate = superRate * 10;   // ArduDeck raw 40 → 400 deg/s
      const centerRate = rcRate * 10;   // ArduDeck raw 80 → 800 deg/s
      const expoF = expo / 100;

      const expof = absStick * (Math.pow(stick, 5) * expoF + stick * (1 - expoF));
      const angularVel = Math.max(0, maxRate - centerRate);
      return stick * centerRate + angularVel * expof;
    }

    case 4: { // Quick — from getQuickRates()
      // BF scales: rate*1000 only
      const rateF = superRate * 10;            // ArduDeck raw 40 → 400 deg/s
      let rcRateF = (rcRate / 100) * 200;      // ArduDeck raw 80 → 160 deg/s
      const expoF = expo / 100;
      const rateClamped = Math.max(rateF, rcRateF);

      const superExpoConfig = (rateClamped / rcRateF - 1) / (rateClamped / rcRateF);
      const curve = Math.pow(absStick, 3) * expoF + absStick * (1 - expoF);
      const angularVel = 1.0 / (1.0 - curve * superExpoConfig);
      return stick * rcRateF * angularVel;
    }

    default:
      return stick * rcRate;
  }
}

/**
 * Calculate max rate at full stick deflection.
 * Expo doesn't affect max rate at full stick for any rate type.
 */
function calculateMaxRate(rcRate: number, superRate: number, ratesType: number): number {
  return Math.round(Math.abs(calculateRate(1, rcRate, superRate, 0, ratesType)));
}

// Combined rates preview graph - centered at 0 like Betaflight Configurator
function CombinedRatesCurve({ rcTuning }: { rcTuning: MSPRcTuning }) {
  const axes = useMemo(() => [
    { label: 'Roll', color: '#3B82F6', rcRate: rcTuning.rcRate, superRate: rcTuning.rollRate, expo: rcTuning.rcExpo },
    { label: 'Pitch', color: '#10B981', rcRate: rcTuning.rcPitchRate, superRate: rcTuning.pitchRate, expo: rcTuning.rcPitchExpo },
    { label: 'Yaw', color: '#F97316', rcRate: rcTuning.rcYawRate, superRate: rcTuning.yawRate, expo: rcTuning.rcYawExpo },
  ], [rcTuning]);

  // Graph layout constants
  const gLeft = 60, gRight = 590, gTop = 20, gBottom = 280;
  const gW = gRight - gLeft, gH = gBottom - gTop;
  const gCx = gLeft + gW / 2, gCy = gTop + gH / 2;

  // Calculate the global max rate across all axes for shared Y-axis
  const globalMax = useMemo(() => {
    let max = 0;
    for (const ax of axes) {
      for (let i = 0; i <= 100; i += 2) {
        const rate = Math.abs(calculateRate(i / 100, ax.rcRate, ax.superRate, ax.expo, rcTuning.ratesType));
        if (rate > max) max = rate;
      }
    }
    return Math.max(Math.ceil(max / 50) * 50, 100);
  }, [axes, rcTuning.ratesType]);

  // Map stick (-1..+1) to x, rate (-max..+max) to y
  const stickToX = (s: number) => gCx + (s / 1) * (gW / 2);
  const rateToY = (r: number) => gCy - (r / globalMax) * (gH / 2);

  // Generate full-range points for each axis (stick from -1 to +1)
  const curves = useMemo(() => {
    return axes.map(ax => {
      const pts: string[] = [];
      for (let i = -100; i <= 100; i += 2) {
        const stick = i / 100;
        const rate = calculateRate(stick, ax.rcRate, ax.superRate, ax.expo, rcTuning.ratesType);
        pts.push(`${stickToX(stick)},${rateToY(rate)}`);
      }
      return { ...ax, points: pts.join(' '), maxRate: Math.round(Math.abs(calculateRate(1, ax.rcRate, ax.superRate, ax.expo, rcTuning.ratesType))) };
    });
  }, [axes, globalMax, rcTuning.ratesType]);

  // Y-axis tick marks (symmetric: -max to +max)
  const yTicks = useMemo(() => {
    const step = globalMax <= 200 ? 50 : globalMax <= 500 ? 100 : globalMax <= 1000 ? 200 : 500;
    const ticks: number[] = [0];
    for (let v = step; v <= globalMax; v += step) {
      ticks.push(v);
      ticks.push(-v);
    }
    return ticks;
  }, [globalMax]);

  return (
    <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-400">Rates Preview</h3>
        <div className="flex items-center gap-4">
          {curves.map(c => (
            <div key={c.label} className="flex items-center gap-1.5">
              <div className="w-3 h-0.5 rounded" style={{ backgroundColor: c.color }} />
              <span className="text-xs text-gray-400">{c.label}</span>
              <span className="text-xs font-medium" style={{ color: c.color }}>{c.maxRate}°/s</span>
            </div>
          ))}
        </div>
      </div>
      <svg viewBox="0 0 620 310" className="w-full" style={{ height: 280 }}>
        {/* Background */}
        <rect x={gLeft} y={gTop} width={gW} height={gH} fill="#111827" rx="4" />

        {/* Y grid lines & labels */}
        {yTicks.map(v => {
          const y = rateToY(v);
          return (
            <g key={`y-${v}`}>
              <line x1={gLeft} y1={y} x2={gRight} y2={y} stroke={v === 0 ? '#374151' : '#1F2937'} strokeWidth={v === 0 ? '1' : '0.5'} />
              <text x={gLeft - 5} y={y + 3} fill="#6B7280" fontSize="9" textAnchor="end">{v}</text>
            </g>
          );
        })}

        {/* X grid lines & labels */}
        {[-100, -50, 0, 50, 100].map(pct => {
          const x = stickToX(pct / 100);
          return (
            <g key={`x-${pct}`}>
              <line x1={x} y1={gTop} x2={x} y2={gBottom} stroke={pct === 0 ? '#374151' : '#1F2937'} strokeWidth={pct === 0 ? '1' : '0.5'} />
              <text x={x} y={gBottom + 14} fill="#6B7280" fontSize="9" textAnchor="middle">{pct}%</text>
            </g>
          );
        })}

        {/* Axis labels */}
        <text x={gLeft - 35} y={gCy} fill="#6B7280" fontSize="10" textAnchor="middle" transform={`rotate(-90, ${gLeft - 35}, ${gCy})`}>deg/s</text>

        {/* Curves */}
        {curves.map(c => (
          <polyline key={c.label} fill="none" stroke={c.color} strokeWidth="2" points={c.points} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Max rate markers at full stick (right edge) */}
        {curves.map(c => {
          const y = rateToY(c.maxRate);
          return (
            <g key={`marker-${c.label}`}>
              <circle cx={gRight} cy={y} r="3" fill={c.color} />
              <text x={gRight + 6} y={y + 3} fill={c.color} fontSize="9" fontWeight="600">{c.maxRate}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Rate curve visualization with better visuals
function RateCurve({
  rcRate,
  superRate,
  expo,
  color,
  ratesType = 0,
}: {
  rcRate: number;
  superRate: number;
  expo: number;
  color: string;
  ratesType?: number;
}) {
  const points = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 100; i += 2) {
      const stick = i / 100;
      const rate = calculateRate(stick, rcRate, superRate, expo, ratesType);
      const x = 5 + (i / 100) * 90;
      // Normalize the rate for display (cap at 90% height)
      const maxRate = calculateMaxRate(rcRate, superRate, ratesType);
      const normalizedRate = maxRate > 0 ? (rate / maxRate) * 90 : 0;
      const y = 95 - Math.min(normalizedRate, 90);
      pts.push(`${x},${y}`);
    }
    return pts.join(' ');
  }, [rcRate, superRate, expo, ratesType]);

  const maxRate = useMemo(() => {
    return calculateMaxRate(rcRate, superRate, ratesType);
  }, [rcRate, superRate, ratesType]);

  return (
    <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
      <div className="flex items-center justify-between text-xs text-gray-500 mb-2">
        <span>Response Curve</span>
        <span className="text-gray-400">Max: <span style={{ color }}>{maxRate}°/s</span></span>
      </div>
      <svg viewBox="0 0 100 100" className="w-full h-24">
        {/* Grid */}
        <line x1="5" y1="95" x2="95" y2="95" stroke="#374151" strokeWidth="0.5" />
        <line x1="5" y1="50" x2="95" y2="50" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
        <line x1="5" y1="5" x2="5" y2="95" stroke="#374151" strokeWidth="0.5" />
        <line x1="50" y1="5" x2="50" y2="95" stroke="#374151" strokeWidth="0.5" strokeDasharray="2,2" />
        {/* Labels */}
        <text x="50" y="99" fill="#6B7280" fontSize="4" textAnchor="middle">Stick</text>
        <text x="2" y="50" fill="#6B7280" fontSize="4" textAnchor="middle" transform="rotate(-90, 2, 50)">Rate</text>
        {/* Curve */}
        <polyline fill="none" stroke={color} strokeWidth="2.5" points={points} strokeLinecap="round" />
      </svg>
    </div>
  );
}

// Rates Tab Component with presets, profiles, and reset
function RatesTab({
  rcTuning,
  updateRcTuning,
  setRcTuning,
  setModified,
  isLegacyInav = false,
  isInav = false,
}: {
  rcTuning: MSPRcTuning;
  updateRcTuning: (field: keyof MSPRcTuning, value: number) => void;
  setRcTuning: (rates: MSPRcTuning) => void;
  setModified: (v: boolean) => void;
  isLegacyInav?: boolean;  // Legacy iNav < 2.3.0 has no per-axis RC rates
  isInav?: boolean;  // iNav firmware (RC_RATE is fixed at 100)
}) {
  const [customProfiles, setCustomProfiles] = useState<Record<string, { name: string; data: Partial<MSPRcTuning> }>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [profileName, setProfileName] = useState('');

  // Load custom profiles on mount
  useEffect(() => {
    setCustomProfiles(loadCustomProfiles<Partial<MSPRcTuning>>(RATE_PROFILES_KEY));
  }, []);

  // Apply a rate preset
  const applyPreset = (presetKey: keyof typeof RATE_PRESETS) => {
    const preset = RATE_PRESETS[presetKey]!;
    setRcTuning({ ...rcTuning, ...preset.rates });
    setModified(true);
  };

  // Reset to Betaflight defaults
  const resetToDefaults = () => {
    setRcTuning({ ...rcTuning, ...DEFAULT_RATES });
    setModified(true);
  };

  // Save current rates as custom profile
  const saveProfile = () => {
    if (!profileName.trim()) return;
    const id = `custom-${Date.now()}`;
    const newProfiles = {
      ...customProfiles,
      [id]: {
        name: profileName.trim(),
        data: {
          rcRate: rcTuning.rcRate,
          rcExpo: rcTuning.rcExpo,
          rcPitchRate: rcTuning.rcPitchRate,
          rcPitchExpo: rcTuning.rcPitchExpo,
          rcYawRate: rcTuning.rcYawRate,
          rcYawExpo: rcTuning.rcYawExpo,
          rollRate: rcTuning.rollRate,
          pitchRate: rcTuning.pitchRate,
          yawRate: rcTuning.yawRate,
        },
      },
    };
    setCustomProfiles(newProfiles);
    saveCustomProfiles(RATE_PROFILES_KEY, newProfiles);
    setProfileName('');
    setShowSaveDialog(false);
  };

  // Load a custom profile
  const loadProfile = (id: string) => {
    const profile = customProfiles[id];
    if (profile) {
      setRcTuning({ ...rcTuning, ...profile.data });
      setModified(true);
    }
  };

  // Delete a custom profile
  const deleteProfile = (id: string) => {
    const newProfiles = { ...customProfiles };
    delete newProfiles[id];
    setCustomProfiles(newProfiles);
    saveCustomProfiles(RATE_PROFILES_KEY, newProfiles);
  };

  return (
    <div className="max-w-full px-4 space-y-6">
      {/* Info card */}
      <div className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4 flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <Info className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <p className="text-blue-400 font-medium">What are rates?</p>
          <p className="text-sm text-gray-400">Rates control how fast your quad spins when you move the sticks. Higher = faster rotation.</p>
        </div>
      </div>

      {/* Quick Presets */}
      <PresetSelector
        presets={RATE_PRESETS}
        onApply={(key) => applyPreset(key as keyof typeof RATE_PRESETS)}
        label="Quick Presets"
      />

      {/* Rate Type Selector (Betaflight only) */}
      {!isInav && (
        <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/5 rounded-xl border border-orange-500/30 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Gauge className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <p className="text-orange-300 font-medium">Rate Profile Type</p>
                <p className="text-xs text-gray-500">
                  {RATE_TYPES.find(t => t.value === rcTuning.ratesType)?.description || 'Select curve algorithm'}
                </p>
              </div>
            </div>
            <select
              value={rcTuning.ratesType}
              onChange={(e) => {
                updateRcTuning('ratesType', parseInt(e.target.value, 10));
              }}
              className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-orange-500 cursor-pointer"
            >
              {RATE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* My Custom Profiles */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-gray-400">My Profiles</h4>
            <button
              onClick={resetToDefaults}
              className="px-2 py-1 text-xs rounded bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
              title="Reset to factory defaults"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {Object.entries(customProfiles).map(([id, profile]) => (
              <div key={id} className="flex items-center gap-1 bg-gray-700/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => loadProfile(id)}
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-600/50 transition-colors"
                >
                  {profile.name}
                </button>
                <button
                  onClick={() => deleteProfile(id)}
                  className="px-2 py-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-600/50 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
            {showSaveDialog ? (
              <div className="flex items-center gap-1 bg-gray-700/50 rounded-lg overflow-hidden">
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Name..."
                  className="w-24 px-2 py-1.5 bg-transparent text-white text-sm focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveProfile();
                    if (e.key === 'Escape') setShowSaveDialog(false);
                  }}
                />
                <button
                  onClick={saveProfile}
                  disabled={!profileName.trim()}
                  className="px-2 py-1.5 text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 transition-colors"
                >
                  ✓
                </button>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-2 py-1.5 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveDialog(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
                title="Save current settings as a profile"
              >
                <span>+</span> Save
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Rate sliders */}
      <div className="grid grid-cols-3 gap-5">
        {[
          { axis: 'Roll', Icon: MoveHorizontal, color: '#3B82F6', rcRate: 'rcRate' as const, superRate: 'rollRate' as const, expo: 'rcExpo' as const },
          { axis: 'Pitch', Icon: MoveVertical, color: '#10B981', rcRate: 'rcPitchRate' as const, superRate: 'pitchRate' as const, expo: 'rcPitchExpo' as const },
          { axis: 'Yaw', Icon: RefreshCw, color: '#F97316', rcRate: 'rcYawRate' as const, superRate: 'yawRate' as const, expo: 'rcYawExpo' as const },
        ].map(({ axis, Icon, color, rcRate, superRate, expo }) => (
          <div key={axis} className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <Icon className="w-5 h-5" style={{ color }} /> {axis}
            </h3>
            <div className="space-y-4">
              {/* Center Rate - hidden for ALL iNav (RC_RATE is always fixed at 100 in iNav) */}
              {/* Only show for Betaflight which supports configurable rcRate */}
              {!isInav && (
                <DraggableSlider
                  label="Center Rate"
                  value={rcTuning[rcRate] as number}
                  onChange={(v) => updateRcTuning(rcRate, v)}
                  color={color}
                  hint="Sensitivity near center"
                />
              )}
              <DraggableSlider
                label="Max Rate"
                value={rcTuning[superRate] as number}
                onChange={(v) => updateRcTuning(superRate, v)}
                color={color}
                hint="Full stick speed"
                max={isLegacyInav ? 1000 : 200}
              />
              <DraggableSlider
                label={isInav && axis === 'Pitch' ? 'Expo (linked to Roll)' : 'Expo'}
                value={rcTuning[expo] as number}
                onChange={(v) => updateRcTuning(expo, v)}
                max={100}
                color={color}
                hint={isInav && axis === 'Pitch' ? 'Shared with Roll in iNav' : 'Curve softness'}
              />
            </div>
            <div className="mt-4">
              <RateCurve
                rcRate={rcTuning[rcRate] as number}
                superRate={rcTuning[superRate] as number}
                expo={rcTuning[expo] as number}
                color={color}
                ratesType={rcTuning.ratesType}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Combined Rates Preview Graph */}
      <CombinedRatesCurve rcTuning={rcTuning} />

    </div>
  );
}

// PID Tuning Tab Component with presets, profiles, and reset
function PidTuningTab({
  pid,
  setPid,
  updatePid,
  setModified,
}: {
  pid: MSPPid;
  setPid: (pids: MSPPid) => void;
  updatePid: (axis: 'roll' | 'pitch' | 'yaw', field: 'p' | 'i' | 'd', value: number) => void;
  setModified: (v: boolean) => void;
}) {
  const [customProfiles, setCustomProfiles] = useState<Record<string, { name: string; data: MSPPid }>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [profileName, setProfileName] = useState('');

  // Load custom profiles on mount
  useEffect(() => {
    setCustomProfiles(loadCustomProfiles<MSPPid>(PID_PROFILES_KEY));
  }, []);

  // Apply a PID preset (merge with current to preserve altHold, posHold, etc.)
  const applyPreset = (presetKey: keyof typeof PID_PRESETS) => {
    const preset = PID_PRESETS[presetKey]!;
    // IMPORTANT: Merge with current pid to preserve optional PIDs (altHold, posHold, level, mag, etc.)
    // Without this, MSP_SET_PID sends 9 bytes instead of 30, causing the command to fail
    setPid({ ...pid, ...preset.pids });
    setModified(true);
  };

  // Reset to Betaflight defaults (merge to preserve optional PIDs)
  const resetToDefaults = () => {
    setPid({ ...pid, ...DEFAULT_PIDS });
    setModified(true);
  };

  // Save current PIDs as custom profile
  const saveProfile = () => {
    if (!profileName.trim()) return;
    const id = `custom-${Date.now()}`;
    const newProfiles = {
      ...customProfiles,
      [id]: {
        name: profileName.trim(),
        data: { ...pid },
      },
    };
    setCustomProfiles(newProfiles);
    saveCustomProfiles(PID_PROFILES_KEY, newProfiles);
    setProfileName('');
    setShowSaveDialog(false);
  };

  // Load a custom profile (merge to preserve optional PIDs)
  const loadProfile = (id: string) => {
    const profile = customProfiles[id];
    if (profile) {
      setPid({ ...pid, ...profile.data });
      setModified(true);
    }
  };

  // Delete a custom profile
  const deleteProfile = (id: string) => {
    const newProfiles = { ...customProfiles };
    delete newProfiles[id];
    setCustomProfiles(newProfiles);
    saveCustomProfiles(PID_PROFILES_KEY, newProfiles);
  };

  return (
    <div className="max-w-full px-4 space-y-6">
      {/* Quick Presets */}
      <PresetSelector
        presets={PID_PRESETS}
        onApply={(key) => applyPreset(key as keyof typeof PID_PRESETS)}
        label="Quick Presets"
      />

      {/* My Custom Profiles */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium text-gray-400">My Profiles</h4>
            <button
              onClick={resetToDefaults}
              className="px-2 py-1 text-xs rounded bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
              title="Reset to factory defaults"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {Object.entries(customProfiles).map(([id, profile]) => (
              <div key={id} className="flex items-center gap-1 bg-gray-700/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => loadProfile(id)}
                  className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-600/50 transition-colors"
                >
                  {profile.name}
                </button>
                <button
                  onClick={() => deleteProfile(id)}
                  className="px-2 py-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-600/50 transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
            {showSaveDialog ? (
              <div className="flex items-center gap-1 bg-gray-700/50 rounded-lg overflow-hidden">
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Name..."
                  className="w-24 px-2 py-1.5 bg-transparent text-white text-sm focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveProfile();
                    if (e.key === 'Escape') setShowSaveDialog(false);
                  }}
                />
                <button
                  onClick={saveProfile}
                  disabled={!profileName.trim()}
                  className="px-2 py-1.5 text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 transition-colors"
                >
                  ✓
                </button>
                <button
                  onClick={() => setShowSaveDialog(false)}
                  className="px-2 py-1.5 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveDialog(true)}
                className="px-3 py-1.5 text-sm rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
                title="Save current settings as a profile"
              >
                <span>+</span> Save
              </button>
            )}
          </div>
        </div>
      </div>

      {/* PID Sliders */}
      <div className="grid grid-cols-3 gap-5">
        {/* Roll */}
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl border border-blue-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <MoveHorizontal className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Roll</h3>
              <p className="text-xs text-gray-500">Left/right tilt</p>
            </div>
          </div>
          <div className="space-y-5">
            <DraggableSlider label="P - Response" value={pid.roll.p} onChange={(v) => updatePid('roll', 'p', v)} color="#3B82F6" hint="Higher = snappier" />
            <DraggableSlider label="I - Stability" value={pid.roll.i} onChange={(v) => updatePid('roll', 'i', v)} color="#10B981" hint="Higher = more stable" />
            <DraggableSlider label="D - Smoothness" value={pid.roll.d} onChange={(v) => updatePid('roll', 'd', v)} color="#8B5CF6" hint="Higher = smoother" />
          </div>
        </div>

        {/* Pitch */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-xl border border-emerald-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <MoveVertical className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Pitch</h3>
              <p className="text-xs text-gray-500">Forward/back tilt</p>
            </div>
          </div>
          <div className="space-y-5">
            <DraggableSlider label="P - Response" value={pid.pitch.p} onChange={(v) => updatePid('pitch', 'p', v)} color="#3B82F6" hint="Higher = snappier" />
            <DraggableSlider label="I - Stability" value={pid.pitch.i} onChange={(v) => updatePid('pitch', 'i', v)} color="#10B981" hint="Higher = more stable" />
            <DraggableSlider label="D - Smoothness" value={pid.pitch.d} onChange={(v) => updatePid('pitch', 'd', v)} color="#8B5CF6" hint="Higher = smoother" />
          </div>
        </div>

        {/* Yaw */}
        <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 rounded-xl border border-orange-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Yaw</h3>
              <p className="text-xs text-gray-500">Rotation</p>
            </div>
          </div>
          <div className="space-y-5">
            <DraggableSlider label="P - Response" value={pid.yaw.p} onChange={(v) => updatePid('yaw', 'p', v)} color="#3B82F6" hint="Higher = snappier" />
            <DraggableSlider label="I - Stability" value={pid.yaw.i} onChange={(v) => updatePid('yaw', 'i', v)} color="#10B981" hint="Higher = more stable" />
            <DraggableSlider label="D - Smoothness" value={pid.yaw.d} onChange={(v) => updatePid('yaw', 'd', v)} color="#8B5CF6" hint="Higher = smoother" />
          </div>
        </div>
      </div>

      {/* Help card */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <h4 className="font-medium text-gray-300 mb-3 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-400" /> What do these numbers mean?
        </h4>
        <div className="grid grid-cols-3 gap-6 text-sm">
          <div>
            <span className="text-blue-400 font-medium">P (Response)</span>
            <p className="text-gray-500 mt-1">How quickly your quad reacts. Too high = oscillation/vibration. Too low = mushy feeling.</p>
          </div>
          <div>
            <span className="text-emerald-400 font-medium">I (Stability)</span>
            <p className="text-gray-500 mt-1">Keeps your quad on target. Helps fight wind and drift. Too high = slow wobbles.</p>
          </div>
          <div>
            <span className="text-purple-400 font-medium">D (Smoothness)</span>
            <p className="text-gray-500 mt-1">Dampens overshooting. Too high = hot motors and noise. Too low = bouncy stops.</p>
          </div>
        </div>
      </div>

    </div>
  );
}

// Mode channel indicator with live RC value
function ModeChannelIndicator({
  mode,
  rcValue,
  onRangeChange,
}: {
  mode: MSPModeRange;
  rcValue: number;
  onRangeChange?: (start: number, end: number) => void;
}) {
  const info = MODE_INFO[mode.boxId] || {
    name: `Mode ${mode.boxId}`,
    icon: HelpCircle,
    description: 'Unknown',
    color: 'bg-gray-500',
    beginner: 'Unknown mode',
  };
  const IconComponent = info.icon;

  // Calculate positions
  const rangeStart = ((mode.rangeStart - 900) / 1200) * 100;
  const rangeWidth = ((mode.rangeEnd - mode.rangeStart) / 1200) * 100;
  const rcPosition = ((rcValue - 900) / 1200) * 100;
  const isActive = rcValue >= mode.rangeStart && rcValue <= mode.rangeEnd;

  return (
    <div className={`rounded-xl border p-4 transition-all ${
      isActive
        ? 'bg-gradient-to-r from-emerald-500/20 to-green-500/10 border-emerald-500/50 shadow-lg shadow-emerald-500/10'
        : 'bg-gray-800/30 border-gray-700/30'
    }`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg ${info.color}/20 flex items-center justify-center`}>
          <IconComponent className={`w-5 h-5 ${info.color.replace('bg-', 'text-')}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">{info.name}</span>
            {isActive && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/30 text-emerald-400">
                ACTIVE
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">{info.beginner}</p>
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">AUX {mode.auxChannel + 1}</div>
          <div className={`text-xs ${isActive ? 'text-emerald-400' : 'text-gray-500'}`}>
            {mode.rangeStart} - {mode.rangeEnd}
          </div>
        </div>
      </div>

      {/* Channel bar with live indicator */}
      <div className="relative h-6 bg-gray-900 rounded-full overflow-hidden">
        {/* Range highlight */}
        <div
          className={`absolute h-full transition-all ${isActive ? 'bg-emerald-500/40' : 'bg-blue-500/30'}`}
          style={{ left: `${rangeStart}%`, width: `${rangeWidth}%` }}
        />
        {/* Current RC position indicator */}
        <div
          className={`absolute top-0 h-full w-1 transition-all ${isActive ? 'bg-emerald-400' : 'bg-yellow-400'}`}
          style={{ left: `${Math.min(100, Math.max(0, rcPosition))}%` }}
        />
        {/* Scale markers */}
        <div className="absolute inset-0 flex justify-between px-1 items-center text-[8px] text-gray-600">
          <span>900</span>
          <span>1500</span>
          <span>2100</span>
        </div>
      </div>

      {/* Current value */}
      <div className="mt-2 text-center text-xs text-gray-500">
        Current: <span className={isActive ? 'text-emerald-400' : 'text-yellow-400'}>{rcValue}</span>
      </div>
    </div>
  );
}

// Enhanced Sensor card with live value display and optional toggle
function SensorCard({
  name,
  available,
  Icon,
  description,
  liveValue,
  unit,
  canToggle,
  isEnabled,
  onToggle,
  toggleSaving,
}: {
  name: string;
  available: boolean;
  Icon: LucideIcon;
  description: string;
  liveValue?: string | number | null;
  unit?: string;
  canToggle?: boolean;
  isEnabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  toggleSaving?: boolean;
}) {
  // Determine the effective state for clearer display
  const featureEnabled = canToggle ? isEnabled : undefined;
  const hardwareDetected = available;

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      hardwareDetected
        ? 'bg-emerald-500/10 border-emerald-500/30'
        : featureEnabled
          ? 'bg-yellow-500/10 border-yellow-500/30' // Feature ON but no hardware
          : 'bg-gray-800/30 border-gray-700/30'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
          hardwareDetected ? 'bg-emerald-500/20' : featureEnabled ? 'bg-yellow-500/20' : 'bg-gray-800'
        }`}>
          <Icon className={`w-5 h-5 ${hardwareDetected ? 'text-emerald-400' : featureEnabled ? 'text-yellow-400' : 'text-gray-500'}`} />
        </div>
        <div className="flex-1">
          <div className={`font-medium ${hardwareDetected ? 'text-emerald-400' : featureEnabled ? 'text-yellow-400' : 'text-gray-400'}`}>
            {name}
          </div>
          <div className="text-xs text-gray-500">
            {!hardwareDetected && featureEnabled
              ? 'Feature enabled but hardware not detected'
              : description}
          </div>
        </div>
        {/* Live value display */}
        {liveValue != null && hardwareDetected && (
          <div className="px-3 py-1.5 rounded-lg font-mono text-sm bg-gray-800/50 text-gray-300">
            {typeof liveValue === 'number' ? liveValue.toFixed(1) : liveValue}
            {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
          </div>
        )}
        {/* Feature toggle switch */}
        {canToggle && onToggle && (
          <button
            onClick={() => onToggle(!isEnabled)}
            disabled={toggleSaving}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              toggleSaving ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            } ${isEnabled ? 'bg-emerald-500' : 'bg-gray-600'}`}
            title={isEnabled ? `Disable ${name} feature` : `Enable ${name} feature`}
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              isEnabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </button>
        )}
        <div className={`px-2 py-1 text-xs rounded-lg ${
          hardwareDetected
            ? 'bg-emerald-500/20 text-emerald-400'
            : featureEnabled
              ? 'bg-yellow-500/20 text-yellow-400'
              : 'bg-gray-800 text-gray-500'
        }`}>
          {hardwareDetected ? 'OK' : featureEnabled ? 'ON' : 'OFF'}
        </div>
      </div>
    </div>
  );
}

// Telemetry value card for displaying multiple live values
function TelemetryCard({
  title,
  icon,
  values,
}: {
  title: string;
  icon: string;
  values: Array<{ label: string; value: number | string; unit?: string }>;
}) {
  return (
    <div className="p-4 rounded-xl border bg-gray-800/30 border-gray-700/30">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-lg">{icon}</span>
        <span className="font-medium text-gray-300">{title}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {values.map(({ label, value, unit }) => (
          <div key={label} className="text-center">
            <div className="text-lg font-mono text-cyan-400">
              {typeof value === 'number' ? value.toFixed(1) : value}
              {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
            </div>
            <div className="text-xs text-gray-500">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Modes Tab Content - Uses the new modes wizard and advanced editor
function ModesTabContent({ onNavigateToTab }: { onNavigateToTab?: (tabId: string) => void }) {
  const {
    isWizardOpen,
    viewMode,
    setViewMode,
    openWizard,
    closeWizard,
    originalModes,
    rcChannels,
    isLoading,
    loadFromFC,
    startRcPolling,
    stopRcPolling,
    lastSaveSuccess,
  } = useModesWizardStore();

  const { connectionState } = useConnectionStore();
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // Load modes and start RC polling on mount
  useEffect(() => {
    loadFromFC();
    startRcPolling();
    return () => stopRcPolling();
  }, [loadFromFC, startRcPolling, stopRcPolling]);

  // Show success toast when lastSaveSuccess becomes true
  useEffect(() => {
    if (lastSaveSuccess) {
      setShowSuccessToast(true);
      const timer = setTimeout(() => setShowSuccessToast(false), 4000);
      return () => clearTimeout(timer);
    }
  }, [lastSaveSuccess]);

  const getRcValue = (auxChannel: number) => rcChannels[auxChannel + 4] || 1500;

  // Mode info for display
  // Use MODE_INFO for consistency - derive simplified display from it
  const MODE_DISPLAY: Record<number, { name: string; Icon: LucideIcon; color: string }> = Object.fromEntries(
    Object.entries(MODE_INFO).map(([id, info]) => [id, { name: info.name, Icon: info.icon, color: info.color }])
  );

  const AUX_NAMES = ['AUX 1', 'AUX 2', 'AUX 3', 'AUX 4'];

  return (
    <div className="max-w-full px-4 space-y-4">
      {/* Success toast */}
      {showSuccessToast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white rounded-lg shadow-xl flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="font-medium">Modes saved to flight controller!</span>
        </div>
      )}

      {/* Header with view toggle */}
      <div className="flex items-center justify-between">
        <div className="bg-gradient-to-br from-purple-500/15 to-fuchsia-600/10 rounded-xl border border-purple-500/30 p-4 flex items-center gap-4 flex-1 mr-4">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
            <Radio className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <p className="text-purple-300 font-medium">Flight Modes</p>
            <p className="text-sm text-purple-200/60">
              Configure how your {connectionState.vehicleType?.toLowerCase() || 'aircraft'} responds to switch positions on your transmitter.
            </p>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-zinc-800 p-0.5">
            <button
              onClick={() => setViewMode('wizard')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                viewMode === 'wizard'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Simple
            </button>
            <button
              onClick={() => setViewMode('advanced')}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                viewMode === 'advanced'
                  ? 'bg-blue-600 text-white'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Advanced
            </button>
          </div>
        </div>
      </div>

      {/* Simple view - shows current modes + wizard button */}
      {viewMode === 'wizard' && (
        <>
          {/* Loading state */}
          {isLoading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto" />
              <p className="text-sm text-zinc-500 mt-2">Loading modes from flight controller...</p>
            </div>
          ) : originalModes.length === 0 ? (
            /* No modes configured - show wizard prompt */
            <div className="text-center py-12 bg-gradient-to-br from-zinc-800/50 to-zinc-900/30 rounded-xl border border-zinc-700/50">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                <Radio className="w-8 h-8 text-purple-400" />
              </div>
              <h3 className="text-lg font-medium text-zinc-300 mb-2">No Modes Configured</h3>
              <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
                Your flight controller doesn't have any modes set up yet.
                Use the wizard to configure recommended modes for your flying style.
              </p>
              <button
                onClick={openWizard}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
              >
                <Wand2 className="w-4 h-4" />
                Start Setup Wizard
              </button>
            </div>
          ) : (
            /* Show existing modes */
            <div className="space-y-4">
              {/* Helper tip for newbies */}
              <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <HelpCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-sm text-blue-200/80">
                  <strong>How this works:</strong> Each mode is triggered by a switch on your transmitter.
                  Move your switches to see which modes activate. The bar shows where your switch needs to be.
                </p>
              </div>

              {/* Mode cards */}
              <div className="grid gap-3">
                {originalModes.map((mode, idx) => {
                  const modeInfo = MODE_INFO[mode.boxId];
                  const info = MODE_DISPLAY[mode.boxId] || {
                    name: `Mode ${mode.boxId}`,
                    Icon: HelpCircle,
                    color: 'bg-zinc-500'
                  };
                  const IconComponent = info.Icon;
                  const rcValue = getRcValue(mode.auxChannel);
                  const isActive = rcValue >= mode.rangeStart && rcValue <= mode.rangeEnd;

                  // Calculate position percentages for the visual bar (900-2100 range)
                  const rangeMin = 900;
                  const rangeMax = 2100;
                  const totalRange = rangeMax - rangeMin;
                  const activeStartPercent = ((mode.rangeStart - rangeMin) / totalRange) * 100;
                  const activeWidthPercent = ((mode.rangeEnd - mode.rangeStart) / totalRange) * 100;
                  const currentPercent = ((rcValue - rangeMin) / totalRange) * 100;

                  // Friendly switch names
                  const switchNames = ['Switch A', 'Switch B', 'Switch C', 'Switch D', 'Switch E', 'Switch F', 'Switch G', 'Switch H'];
                  const switchName = switchNames[mode.auxChannel] || `Switch ${mode.auxChannel + 1}`;

                  // Convert PWM range to friendly position description
                  const getPositionName = (pwm: number) => {
                    if (pwm <= 1100) return 'Low';
                    if (pwm <= 1400) return 'Low-Mid';
                    if (pwm <= 1600) return 'Mid';
                    if (pwm <= 1800) return 'Mid-High';
                    return 'High';
                  };
                  const startPos = getPositionName(mode.rangeStart);
                  const endPos = getPositionName(mode.rangeEnd);
                  const positionDescription = startPos === endPos
                    ? `${startPos} position`
                    : `${startPos} to ${endPos}`;

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-green-500/10 to-transparent border-green-500/50 shadow-lg shadow-green-500/10'
                          : 'bg-zinc-800/50 border-zinc-700/50 hover:border-zinc-600/50'
                      }`}
                    >
                      {/* Top row: Icon, Name, Status */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${info.color}/20 flex items-center justify-center`}>
                            <IconComponent className={`w-5 h-5 ${info.color.replace('bg-', 'text-')}`} />
                          </div>
                          <div>
                            <div className="font-medium text-zinc-100">{info.name}</div>
                            <div className="text-xs text-zinc-400">
                              {modeInfo?.beginner || modeInfo?.description || 'Flight mode'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Configure button for modes with settings */}
                          {modeInfo?.configureTab && onNavigateToTab && (
                            <button
                              onClick={() => onNavigateToTab(modeInfo.configureTab!)}
                              className="px-2 py-1 text-xs bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg transition-colors flex items-center gap-1"
                              title={`Configure ${info.name} settings`}
                            >
                              <Settings2 className="w-3 h-3" />
                              Configure
                            </button>
                          )}
                          {isActive ? (
                            <span className="px-3 py-1 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="px-3 py-1 text-xs bg-zinc-700/50 text-zinc-500 rounded-full">
                              INACTIVE
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Visual range bar */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs text-zinc-500">
                          <span>{switchName}</span>
                          <span className={isActive ? 'text-green-400' : 'text-zinc-400'}>
                            Position: {rcValue < 1300 ? 'Low' : rcValue < 1700 ? 'Mid' : 'High'}
                          </span>
                        </div>
                        <div className="relative h-4 bg-zinc-700/50 rounded-full overflow-hidden">
                          {/* Active zone highlight */}
                          <div
                            className={`absolute top-0 bottom-0 rounded-full ${isActive ? 'bg-green-500/40' : 'bg-blue-500/20'}`}
                            style={{
                              left: `${activeStartPercent}%`,
                              width: `${activeWidthPercent}%`
                            }}
                          />
                          {/* Current position marker */}
                          <div
                            className={`absolute top-0 bottom-0 w-1.5 rounded-full transition-all ${
                              isActive ? 'bg-green-400 shadow-lg shadow-green-400/50' : 'bg-yellow-400'
                            }`}
                            style={{ left: `calc(${currentPercent}% - 3px)` }}
                          />
                          {/* Low/Mid/High labels */}
                          <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] text-zinc-500 pointer-events-none">
                            <span>Low</span>
                            <span>Mid</span>
                            <span>High</span>
                          </div>
                        </div>
                        <div className="text-[10px] text-zinc-600 text-center">
                          Activates when {switchName} is in {positionDescription}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Reconfigure button */}
              <div className="flex justify-center pt-4">
                <button
                  onClick={openWizard}
                  className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg text-sm transition-colors flex items-center gap-2"
                >
                  <Wand2 className="w-4 h-4" />
                  Reconfigure with Wizard
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Advanced editor (shown in advanced mode) */}
      {viewMode === 'advanced' && <ModesAdvancedEditor />}

      {/* Wizard modal */}
      <ModesWizard isOpen={isWizardOpen} onClose={closeWizard} />
    </div>
  );
}

type TabId = 'tuning' | 'rates' | 'modes' | 'sensors' | 'servo-tuning' | 'servo-mixer' | 'motor-mixer' | 'navigation' | 'auto-launch' | 'safety' | 'filters' | 'vtx';

export function MspConfigView() {
  const { connectionState, platformChangeInProgress, setPlatformChangeInProgress } = useConnectionStore();
  // Use same telemetry store as OSD (populated by MSP polling via TELEMETRY_BATCH)
  const { gps, attitude, flight, vfrHud, battery } = useTelemetryStore();
  const { hasChanges: modesHaveChanges, saveToFC: saveModesToFC, isSaving: modesSaving } = useModesWizardStore();
  const { openWizard: openQuickSetup, isOpen: quickSetupOpen, applySuccess: quickSetupSuccess } = useQuickSetupStore();
  const [activeTab, setActiveTab] = useState<TabId>('tuning');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // RC channel values (simulated for now - would come from MSP_RC)
  const [rcChannels] = useState([1500, 1500, 1000, 1500, 1000, 1500, 1500, 1500]);

  // Config state
  const [pid, setPid] = useState<MSPPid | null>(null);
  const [rcTuning, setRcTuning] = useState<MSPRcTuning | null>(null);
  const [modes, setModes] = useState<MSPModeRange[]>([]);
  const [features, setFeatures] = useState<number>(0);
  const [featureSaving, setFeatureSaving] = useState(false); // Saving feature toggle
  const [pidRatesModified, setPidRatesModified] = useState(false);
  const [safetyModified, setSafetyModified] = useState(false);
  const safetyRef = useRef<SafetyTabHandle>(null);
  const [currentPlatformType, setCurrentPlatformType] = useState<number>(0); // 0=multirotor, 1=airplane
  const [configActiveSensors, setConfigActiveSensors] = useState<number>(0); // Fetched once on config load

  // Feature bit constants (from MSP_FEATURE_CONFIG)
  const FEATURE_GPS = 7;      // GPS feature enable
  const FEATURE_SONAR = 9;    // Rangefinder/Sonar feature enable
  const FEATURE_TELEMETRY = 10;
  const FEATURE_LED_STRIP = 16;
  const FEATURE_OSD = 18;

  // Combined modified state: PIDs/rates OR modes OR safety have changes
  const modified = pidRatesModified || modesHaveChanges() || safetyModified;

  // Sensors - use activeSensors from config load or telemetry
  // Betaflight sensor flags (from sensor_helpers.js):
  // bit 0: ACC, bit 1: BARO, bit 2: MAG, bit 3: GPS, bit 4: SONAR, bit 5: GYRO
  const activeSensors = configActiveSensors || flight?.activeSensors || 0;
  const sensors = useMemo(() => ({
    acc: (activeSensors & (1 << 0)) !== 0,   // bit 0
    baro: (activeSensors & (1 << 1)) !== 0,  // bit 1
    mag: (activeSensors & (1 << 2)) !== 0,   // bit 2
    gps: (activeSensors & (1 << 3)) !== 0,   // bit 3
    sonar: (activeSensors & (1 << 4)) !== 0, // bit 4
    gyro: (activeSensors & (1 << 5)) !== 0,  // bit 5
  }), [activeSensors]);

  const isInav = connectionState.fcVariant === 'INAV';

  // Platform change state (iNav only)
  const [showPlatformDropdown, setShowPlatformDropdown] = useState(false);
  const [showMixingDropdown, setShowMixingDropdown] = useState(false);
  const [platformChangeState, setPlatformChangeState] = useState<'idle' | 'changing' | 'saving' | 'rebooting' | 'reconnecting' | 'error'>('idle');
  const [platformChangeError, setPlatformChangeError] = useState<string | null>(null);
  const [platformChangeTarget, setPlatformChangeTarget] = useState<string | null>(null);

  // Platform options for iNav
  const PLATFORM_OPTIONS = [
    { value: 0, label: 'Multirotor' },
    { value: 1, label: 'Airplane' },
    { value: 2, label: 'Helicopter' },
    { value: 3, label: 'Tricopter' },
  ];

  // Handle platform change with auto-reconnect
  const handlePlatformChange = async (platformType: number) => {
    const targetLabel = PLATFORM_OPTIONS.find(o => o.value === platformType)?.label || 'Unknown';

    setShowPlatformDropdown(false);
    setPlatformChangeTarget(targetLabel);
    setPlatformChangeState('changing');
    setPlatformChangeError(null);
    setPlatformChangeInProgress(true);

    try {
      // 1. Set platform type
      const success = await window.electronAPI?.mspSetInavPlatformType(platformType);
      if (!success) throw new Error('Failed to change platform type');

      // 2. Save to EEPROM
      setPlatformChangeState('saving');
      await window.electronAPI?.mspSaveEeprom();
      await new Promise(r => setTimeout(r, 200));

      // 3. Reboot
      setPlatformChangeState('rebooting');
      window.electronAPI?.mspReboot().catch(() => {});

      // 4. Wait for reboot
      await new Promise(r => setTimeout(r, 4000));

      // 5. Auto-reconnect
      setPlatformChangeState('reconnecting');
      await window.electronAPI?.connect({ type: 'tcp', host: '127.0.0.1', tcpPort: 5760, protocol: 'msp' });

      // 6. Clear overlay - but keep platformChangeInProgress true!
      // The useEffect below will clear it once we're connected
      setPlatformChangeState('idle');
      setPlatformChangeTarget(null);

    } catch (err) {
      console.error('Platform change error:', err);
      setPlatformChangeState('error');
      setPlatformChangeError(err instanceof Error ? err.message : 'Unknown error');
    }
  };

  // Clear platformChangeInProgress ONLY when connected
  useEffect(() => {
    if (platformChangeInProgress && connectionState.isConnected) {
      setPlatformChangeInProgress(false);
    }
  }, [connectionState.isConnected, platformChangeInProgress, setPlatformChangeInProgress]);

  const clearPlatformChangeState = () => {
    setPlatformChangeState('idle');
    setPlatformChangeError(null);
    setPlatformChangeTarget(null);
    setPlatformChangeInProgress(false);
  };

  /**
   * Toggle a hardware sensor via CLI setting (baro_hardware, mag_hardware, etc.)
   * These are not feature flags - they control hardware enablement.
   * Uses CLI commands for Betaflight (MSP2 settings are iNav-only).
   */
  const handleHardwareSensorToggle = async (settingName: string, enabled: boolean) => {
    setFeatureSaving(true);
    try {
      const value = enabled ? 'AUTO' : 'NONE';
      console.log(`[UI] Setting ${settingName} to ${value}`);

      // Try MSP2 settings first (iNav), fall back to CLI (Betaflight)
      let success = await window.electronAPI?.mspSetSetting(settingName, value);

      if (!success) {
        // MSP2 settings failed - use CLI command for Betaflight
        console.log(`[UI] MSP2 settings not supported, using CLI for ${settingName}`);
        const cliCommand = `set ${settingName} = ${value}`;
        await window.electronAPI?.cliSendCommand(cliCommand);
        await new Promise(r => setTimeout(r, 100));
        // Save via CLI - this triggers FC reboot in Betaflight
        await window.electronAPI?.cliSendCommand('save');
        console.log(`[UI] ${settingName} set to ${value} via CLI - FC will reboot`);
        setError(`${settingName} set to ${value}. FC is rebooting...`);
        success = true;
      } else {
        // MSP2 worked - save to EEPROM
        await window.electronAPI?.mspSaveEeprom();
        console.log(`[UI] ${settingName} set to ${value} - reboot required`);
        setError(`${settingName} changed to ${value}. Reboot FC to apply.`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Hardware toggle error: ${errorMsg}`);
      console.error('[UI] Hardware sensor toggle error:', err);
    } finally {
      setFeatureSaving(false);
    }
  };

  /**
   * Toggle a feature bit in the feature bitmask.
   * Updates locally and saves to EEPROM immediately.
   */
  const handleFeatureToggle = async (bit: number, enabled: boolean) => {
    setFeatureSaving(true);
    try {
      // If features is 0, try to reload first to avoid wiping out all features
      let currentFeatures = features;
      if (currentFeatures === 0) {
        console.log('[UI] Features is 0, reloading before toggle...');
        const reloaded = await window.electronAPI?.mspGetFeatures();
        if (typeof reloaded === 'number') {
          currentFeatures = reloaded;
          setFeatures(reloaded);
          console.log('[UI] Reloaded features:', reloaded.toString(2).padStart(32, '0'));
        } else {
          setError('Failed to load features - cannot toggle');
          return;
        }
      }

      const newFeatures = enabled
        ? currentFeatures | (1 << bit)      // Enable: set bit
        : currentFeatures & ~(1 << bit);    // Disable: clear bit

      console.log(`[UI] Toggling feature bit ${bit} to ${enabled}, features: ${currentFeatures.toString(2)} -> ${newFeatures.toString(2)}`);

      const success = await window.electronAPI?.mspSetFeatures(newFeatures);
      if (success) {
        setFeatures(newFeatures);
        // Delay before EEPROM save (Betaflight needs 100ms to process settings)
        await new Promise(r => setTimeout(r, 100));
        // Save to EEPROM
        await window.electronAPI?.mspSaveEeprom();
        console.log(`[UI] Feature bit ${bit} ${enabled ? 'enabled' : 'disabled'} and saved`);
      } else {
        setError('Failed to set features');
        console.error('[UI] Failed to set features');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(`Feature toggle error: ${errorMsg}`);
      console.error('[UI] Feature toggle error:', err);
    } finally {
      setFeatureSaving(false);
    }
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowPlatformDropdown(false);
      setShowMixingDropdown(false);
    };
    if (showPlatformDropdown || showMixingDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showPlatformDropdown, showMixingDropdown]);

  // Start MSP telemetry polling when Sensors tab is active
  // Same pattern as OsdView - start on tab enter, stop on tab leave
  useEffect(() => {
    if (activeTab === 'sensors' && connectionState.isConnected) {
      // Small delay to ensure connection is stable
      const startTimeout = setTimeout(() => {
        console.log('[UI] Starting MSP telemetry for Sensors tab');
        window.electronAPI?.mspStartTelemetry(10); // 10Hz
      }, 100);

      return () => {
        clearTimeout(startTimeout);
        console.log('[UI] Stopping MSP telemetry (leaving Sensors tab)');
        window.electronAPI?.mspStopTelemetry();
      };
    }
  }, [activeTab, connectionState.isConnected]);

  // Check for legacy iNav (< 2.3.0) which has different CLI params and no per-axis RC rates
  const isLegacyInav = useMemo(() => {
    if (!isInav || !connectionState.fcVersion) return false;
    const version = connectionState.fcVersion; // e.g., "2.0.0" or "2.3.0"
    const parts = version.split('.').map(Number);
    if (parts.length < 2) return false;
    const [major, minor] = parts;
    // iNav < 2.3.0 is considered legacy
    return major! < 2 || (major === 2 && minor! < 3);
  }, [isInav, connectionState.fcVersion]);

  // Check if board has SERVO_TILT feature enabled (bit 5)
  // Some boards don't have servo outputs in multirotor mode
  const hasServoFeature = (features & (1 << 5)) !== 0;

  // Track if a load is already in progress (prevent duplicate calls from StrictMode or rapid triggers)
  const loadInProgressRef = useRef(false);

  // Load config
  const loadConfig = useCallback(async () => {
    // Prevent duplicate concurrent calls
    if (loadInProgressRef.current) {
      console.log('[UI] loadConfig skipped - already in progress');
      return;
    }
    loadInProgressRef.current = true;
    console.log('[UI] loadConfig called - this will reset modified state!');
    setLoading(true);
    setError(null);
    try {
      // First batch: essential config (PID, rates, modes)
      const [pidData, rcData, modesData] = await Promise.all([
        window.electronAPI?.mspGetPid(),
        window.electronAPI?.mspGetRcTuning(),
        window.electronAPI?.mspGetModeRanges(),
      ]);

      // Second batch: features and status (separate to avoid MSP overload)
      const [featuresData, mixerConfig, statusData] = await Promise.all([
        window.electronAPI?.mspGetFeatures(),
        window.electronAPI?.mspGetInavMixerConfig?.(),
        window.electronAPI?.mspGetStatus?.(),
      ]);
      if (pidData) setPid(pidData as MSPPid);
      if (rcData) {
        const rc = rcData as MSPRcTuning;
        // Normalize for old iNav which uses combined fields:
        // - rollPitchRate instead of separate rollRate/pitchRate
        // - rcRate/rcExpo for both roll AND pitch (no separate rcPitchRate/rcPitchExpo)
        const isOldINav = rc.rcPitchRate === 0 && rc.rollRate === 0;
        if (isOldINav) {
          console.log(`[UI] Old iNav detected: normalizing combined fields`);
          // Max rates: use rollPitchRate for both roll and pitch
          if (rc.rollPitchRate > 0) {
            rc.rollRate = rc.rollPitchRate;
            rc.pitchRate = rc.rollPitchRate;
          }
          // Center rates: use rcRate for pitch too (old iNav has no rcPitchRate)
          rc.rcPitchRate = rc.rcRate;
          // Expo: use rcExpo for pitch too (old iNav has no rcPitchExpo)
          rc.rcPitchExpo = rc.rcExpo;
        }
        setRcTuning(rc);
      }
      if (modesData) setModes(modesData as MSPModeRange[]);
      if (typeof featuresData === 'number') {
        setFeatures(featuresData);
        console.log('[UI] Features loaded:', featuresData, 'binary:', featuresData.toString(2).padStart(32, '0'));
        console.log('[UI] GPS feature (bit 7):', (featuresData & (1 << 7)) !== 0 ? 'ENABLED' : 'DISABLED');
      } else {
        console.warn('[UI] Features not loaded - featuresData is:', featuresData);
      }
      if (mixerConfig && typeof mixerConfig.platformType === 'number') {
        setCurrentPlatformType(mixerConfig.platformType);
        console.log('[UI] Platform type:', mixerConfig.platformType === 1 ? 'Airplane' : 'Other');
      }
      if (statusData) {
        setConfigActiveSensors(statusData.activeSensors);
        console.log('[UI] Active sensors:', statusData.activeSensors.toString(2).padStart(8, '0'));
      }
      console.log('[UI] loadConfig complete, setting modified=false');
      setPidRatesModified(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
      loadInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (connectionState.isConnected && connectionState.protocol === 'msp') {
      loadConfig();
    }
  }, [connectionState.isConnected, connectionState.protocol, loadConfig]);

  // Track previous Quick Setup open state to detect when it closes
  const prevQuickSetupOpenRef = useRef(quickSetupOpen);

  // Refresh config after Quick Setup wizard closes successfully
  useEffect(() => {
    // Only reload when wizard transitions from open (true) to closed (false) with success
    const wasOpen = prevQuickSetupOpenRef.current;
    prevQuickSetupOpenRef.current = quickSetupOpen;

    if (wasOpen && !quickSetupOpen && quickSetupSuccess) {
      console.log('[MspConfigView] Quick Setup completed successfully, refreshing config...');
      loadConfig();
    }
  }, [quickSetupOpen, quickSetupSuccess, loadConfig]);

  // Single save function that saves everything (PIDs + Rates + Modes + Safety + EEPROM)
  const saveAll = async () => {
    if (!modified) return;
    setSaving(true);
    setError(null);
    console.log('[UI] saveAll: saving PIDs, Rates, Modes, Safety, and EEPROM');

    try {
      // Save PIDs if available and modified
      if (pid && pidRatesModified) {
        console.log('[UI] Saving PIDs...');
        const pidSuccess = await window.electronAPI?.mspSetPid(pid);
        if (!pidSuccess) {
          setError('Failed to save PIDs');
          return;
        }
      }

      // Save Rates if available and modified
      if (rcTuning && pidRatesModified) {
        console.log('[UI] Saving Rates...');
        const ratesSuccess = await window.electronAPI?.mspSetRcTuning(rcTuning);
        if (!ratesSuccess) {
          setError('Failed to save Rates');
          return;
        }
      }

      // Save Modes if they have changes
      if (modesHaveChanges()) {
        console.log('[UI] Saving Modes...');
        const modesSuccess = await saveModesToFC();
        if (!modesSuccess) {
          setError('Failed to save Modes');
          return;
        }
      }

      // Save Safety settings if modified
      if (safetyModified && safetyRef.current) {
        console.log('[UI] Saving Safety...');
        const safetySuccess = await safetyRef.current.save();
        if (!safetySuccess) {
          setError('Failed to save Safety settings');
          return;
        }
      }

      // Save to EEPROM once (modes saveToFC handles its own EEPROM)
      if (pidRatesModified || safetyModified) {
        console.log('[UI] Saving to EEPROM...');
        const eepromSuccess = await window.electronAPI?.mspSaveEeprom();
        if (!eepromSuccess) {
          setError('Failed to save to EEPROM');
          return;
        }
      }

      setPidRatesModified(false);
      setSafetyModified(false);
      console.log('[UI] All settings saved successfully');
    } catch (err) {
      console.error('[UI] Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // Update handlers
  const updatePid = (axis: 'roll' | 'pitch' | 'yaw', field: 'p' | 'i' | 'd', value: number) => {
    if (!pid) return;
    console.log(`[UI] updatePid: ${axis}.${field} = ${value}, setting modified=true`);
    setPid({ ...pid, [axis]: { ...pid[axis], [field]: value } });
    setPidRatesModified(true);
    console.log('[UI] modified state set to true');
  };

  const updateRcTuning = (field: keyof MSPRcTuning, value: number) => {
    if (!rcTuning) return;
    const updates: Partial<MSPRcTuning> = { [field]: value };

    // iNav supports separate rollRate/pitchRate via MSP2 0x2007/0x2008
    // Only sync rollPitchRate for legacy compatibility (won't affect modern iNav)
    if (field === 'rollRate' || field === 'pitchRate') {
      updates.rollPitchRate = value;
    }

    // iNav uses same expo for Roll AND Pitch - keep them synced
    if (isInav) {
      if (field === 'rcExpo') {
        updates.rcPitchExpo = value;
      } else if (field === 'rcPitchExpo') {
        updates.rcExpo = value;
      }
    }

    setRcTuning({ ...rcTuning, ...updates });
    setPidRatesModified(true);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-gray-400">Loading your settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-950">
      {/* Platform Change Overlay */}
      {platformChangeState !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 max-w-md mx-4 shadow-2xl text-center">
            {/* Icon based on state */}
            {platformChangeState === 'error' ? (
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Title */}
            <h3 className="text-lg font-semibold text-white mb-2">
              {platformChangeState === 'changing' && `Changing to ${platformChangeTarget}`}
              {platformChangeState === 'saving' && 'Saving Configuration'}
              {platformChangeState === 'rebooting' && 'Rebooting Board'}
              {platformChangeState === 'reconnecting' && 'Reconnecting'}
              {platformChangeState === 'error' && 'Change Failed'}
            </h3>

            {/* Message */}
            <p className="text-sm text-zinc-400 mb-4">
              {platformChangeState === 'changing' && 'Sending platform change command...'}
              {platformChangeState === 'saving' && 'Writing to EEPROM...'}
              {platformChangeState === 'rebooting' && 'Waiting for board to reboot...'}
              {platformChangeState === 'reconnecting' && 'Connecting to board...'}
              {platformChangeState === 'error' && (platformChangeError || 'An error occurred')}
            </p>

            {/* Progress indicator for non-terminal states */}
            {(platformChangeState === 'changing' || platformChangeState === 'saving' || platformChangeState === 'rebooting' || platformChangeState === 'reconnecting') && (
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                <div className="flex gap-1">
                  <div className={`w-2 h-2 rounded-full ${platformChangeState === 'changing' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                  <div className={`w-2 h-2 rounded-full ${platformChangeState === 'saving' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                  <div className={`w-2 h-2 rounded-full ${platformChangeState === 'rebooting' || platformChangeState === 'reconnecting' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                </div>
              </div>
            )}

            {/* Dismiss button only for errors */}
            {platformChangeState === 'error' && (
              <button
                onClick={clearPlatformChangeState}
                className="mt-4 px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-gray-800/50 bg-gradient-to-r from-gray-900/90 to-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg overflow-hidden ${
              connectionState.fcVariant === 'INAV'
                ? 'bg-white'
                : 'bg-gradient-to-br from-orange-500 to-red-600'
            }`}>
              <img
                src={connectionState.fcVariant === 'INAV' ? inavLogo : betaflightLogo}
                alt={connectionState.fcVariant === 'INAV' ? 'iNav' : 'Betaflight'}
                className="w-10 h-10 object-contain"
              />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {connectionState.fcVariant === 'BTFL' ? 'Betaflight' : connectionState.fcVariant === 'INAV' ? 'iNav' : connectionState.fcVariant} Tuning
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span className="text-blue-400">{connectionState.fcVersion}</span>
                {connectionState.vehicleType && isInav && (
                  <>
                    <span>•</span>
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowPlatformDropdown(!showPlatformDropdown);
                        }}
                        disabled={platformChangeState !== 'idle'}
                        className="text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer flex items-center gap-1 disabled:opacity-50"
                        title="Click to change platform type"
                      >
                        {connectionState.vehicleType}
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {showPlatformDropdown && (
                        <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[140px]">
                          {PLATFORM_OPTIONS.map((opt) => (
                            <button
                              key={opt.value}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlatformChange(opt.value);
                              }}
                              disabled={connectionState.vehicleType === opt.label}
                              className={`w-full px-3 py-2 text-left text-sm hover:bg-zinc-700 first:rounded-t-lg last:rounded-b-lg ${
                                connectionState.vehicleType === opt.label
                                  ? 'text-emerald-400 bg-emerald-500/10'
                                  : 'text-gray-300'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
                {connectionState.vehicleType && !isInav && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400">{connectionState.vehicleType}</span>
                  </>
                )}
                <span>•</span>
                <span>{connectionState.boardId}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Setup Button */}
            <button
              onClick={() => openQuickSetup('msp', connectionState.fcVariant || undefined, connectionState.fcVersion || undefined)}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-lg shadow-blue-500/20 flex items-center gap-2 transition-all"
            >
              <Rocket className="w-4 h-4" />
              Quick Setup
            </button>

            {modified && (
              <span className="px-3 py-1 text-sm rounded-lg bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                Unsaved
              </span>
            )}
            <button
              onClick={loadConfig}
              disabled={loading}
              className="px-4 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
            >
              Refresh
            </button>
            <button
              onClick={saveAll}
              disabled={saving || !modified}
              className={`px-5 py-2 text-sm font-medium rounded-lg shadow-lg transition-all ${
                modified
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-500/25'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
            >
              {saving ? '💾 Saving...' : '💾 Save All Changes'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mt-4 flex-wrap items-center">
          {/* Main tabs */}
          {[
            { id: 'tuning', label: 'PID Tuning', icon: SlidersHorizontal, color: 'text-blue-400' },
            { id: 'rates', label: 'Rates', icon: Gauge, color: 'text-purple-400' },
            { id: 'modes', label: 'Modes', icon: Gamepad2, color: 'text-green-400' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-gray-800 text-white shadow-lg'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? tab.color : `${tab.color} opacity-50`}`} />
                <span className="text-sm font-medium">{tab.label}</span>
              </button>
            );
          })}

          {/* Mixing dropdown (iNav only) */}
          {isInav && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMixingDropdown(!showMixingDropdown);
                }}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                  ['servo-tuning', 'servo-mixer', 'motor-mixer'].includes(activeTab)
                    ? 'bg-gray-800 text-white shadow-lg'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                <Layers className={`w-4 h-4 ${
                  ['servo-tuning', 'servo-mixer', 'motor-mixer'].includes(activeTab)
                    ? 'text-cyan-400'
                    : 'text-cyan-400 opacity-50'
                }`} />
                <span className="text-sm font-medium">
                  {activeTab === 'servo-tuning' ? 'Servo Tuning' :
                   activeTab === 'servo-mixer' ? 'Servo Mixer' :
                   activeTab === 'motor-mixer' ? 'Motor Mixer' : 'Mixing'}
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showMixingDropdown ? 'rotate-180' : ''}`} />
              </button>
              {showMixingDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[180px] py-1">
                  {[
                    { id: 'servo-tuning', label: 'Servo Tuning', icon: SlidersHorizontal, color: 'text-orange-400', desc: 'Endpoints' },
                    { id: 'servo-mixer', label: 'Servo Mixer', icon: Shuffle, color: 'text-cyan-400', desc: 'Surfaces' },
                    { id: 'motor-mixer', label: 'Motor Mixer', icon: Cog, color: 'text-rose-400', desc: 'Motors' },
                  ].map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveTab(item.id as typeof activeTab);
                          setShowMixingDropdown(false);
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center gap-3 hover:bg-zinc-700 transition-colors ${
                          isActive ? 'bg-zinc-700/50' : ''
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${item.color}`} />
                        <div className="flex-1">
                          <div className={`text-sm ${isActive ? 'text-white' : 'text-gray-300'}`}>{item.label}</div>
                          <div className="text-xs text-gray-500">{item.desc}</div>
                        </div>
                        {isActive && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Navigation (iNav only) */}
          {isInav && (
            <button
              onClick={() => setActiveTab('navigation')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'navigation'
                  ? 'bg-gray-800 text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <Compass className={`w-4 h-4 ${activeTab === 'navigation' ? 'text-amber-400' : 'text-amber-400 opacity-50'}`} />
              <span className="text-sm font-medium">Navigation</span>
            </button>
          )}

          {/* Auto Launch (iNav Airplane only) */}
          {isInav && currentPlatformType === 1 && (
            <button
              onClick={() => setActiveTab('auto-launch')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'auto-launch'
                  ? 'bg-gray-800 text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <PlaneTakeoff className={`w-4 h-4 ${activeTab === 'auto-launch' ? 'text-orange-400' : 'text-orange-400 opacity-50'}`} />
              <span className="text-sm font-medium">Auto Launch</span>
            </button>
          )}

          {/* Filters (Betaflight only) */}
          {!isInav && (
            <button
              onClick={() => setActiveTab('filters')}
              className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === 'filters'
                  ? 'bg-gray-800 text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <Waves className={`w-4 h-4 ${activeTab === 'filters' ? 'text-purple-400' : 'text-purple-400 opacity-50'}`} />
              <span className="text-sm font-medium">Filters</span>
            </button>
          )}

          {/* VTX Config */}
          <button
            onClick={() => setActiveTab('vtx')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'vtx'
                ? 'bg-gray-800 text-white shadow-lg'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <Radio className={`w-4 h-4 ${activeTab === 'vtx' ? 'text-pink-400' : 'text-pink-400 opacity-50'}`} />
            <span className="text-sm font-medium">VTX</span>
          </button>

          {/* Launch Control (Betaflight only) - Coming Soon */}
          {!isInav && (
            <button
              disabled
              title="Coming Soon - Launch Control for race starts"
              className="px-3 py-2 rounded-lg flex items-center gap-2 text-gray-600 cursor-not-allowed opacity-50"
            >
              <Rocket className="w-4 h-4 text-cyan-400 opacity-50" />
              <span className="text-sm font-medium">Launch Control</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-500">Soon</span>
            </button>
          )}

          {/* Safety (Receiver/Failsafe) */}
          <button
            onClick={() => setActiveTab('safety')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'safety'
                ? 'bg-gray-800 text-white shadow-lg'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <Shield className={`w-4 h-4 ${activeTab === 'safety' ? 'text-red-400' : 'text-red-400 opacity-50'}`} />
            <span className="text-sm font-medium">Safety</span>
          </button>

          {/* Sensors */}
          <button
            onClick={() => setActiveTab('sensors')}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
              activeTab === 'sensors'
                ? 'bg-gray-800 text-white shadow-lg'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
            }`}
          >
            <Radio className={`w-4 h-4 ${activeTab === 'sensors' ? 'text-emerald-400' : 'text-emerald-400 opacity-50'}`} />
            <span className="text-sm font-medium">Sensors</span>
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/30 text-red-400 text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-red-300">×</button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* PID Tuning Tab */}
        {activeTab === 'tuning' && pid && (
          <PidTuningTab
            pid={pid}
            setPid={setPid}
            updatePid={updatePid}
            setModified={setPidRatesModified}
          />
        )}


        {/* Rates Tab */}
        {activeTab === 'rates' && rcTuning && (
          <RatesTab
            rcTuning={rcTuning}
            updateRcTuning={updateRcTuning}
            setRcTuning={setRcTuning}
            setModified={setPidRatesModified}
            isLegacyInav={isLegacyInav}
            isInav={isInav}
          />
        )}


        {/* Modes Tab */}
        {activeTab === 'modes' && <ModesTabContent onNavigateToTab={(tabId) => setActiveTab(tabId as TabId)} />}

        {/* Sensors Tab */}
        {activeTab === 'sensors' && (
          <div className="max-w-full px-4 space-y-4">
            {/* Sensor Status Cards */}
            <div className="grid grid-cols-2 gap-4">
              <SensorCard
                name="Gyroscope"
                available={sensors.gyro}
                Icon={RefreshCw}
                description="Measures rotation speed - essential for flight"
              />
              <SensorCard
                name="Accelerometer"
                available={sensors.acc}
                Icon={Ruler}
                description="Measures tilt angle - needed for self-level"
                liveValue={`${(attitude?.roll ?? 0).toFixed(0)}° / ${(attitude?.pitch ?? 0).toFixed(0)}°`}
              />
              <SensorCard
                name="GPS"
                available={sensors.gps}
                Icon={Satellite}
                description={sensors.gps ? `${gps?.satellites || 0} satellites locked` : 'Feature disabled or not connected'}
                liveValue={sensors.gps ? `${gps?.satellites || 0} sats` : undefined}
                canToggle={true}
                isEnabled={(features & (1 << FEATURE_GPS)) !== 0}
                onToggle={(enabled) => handleFeatureToggle(FEATURE_GPS, enabled)}
                toggleSaving={featureSaving}
              />
              <SensorCard
                name="Barometer"
                available={sensors.baro}
                Icon={Gauge}
                description="Measures altitude via air pressure"
                liveValue={sensors.baro ? (vfrHud?.alt ?? 0) : undefined}
                unit="m"
                canToggle={true}
                isEnabled={sensors.baro}
                onToggle={(enabled) => handleHardwareSensorToggle('baro_hardware', enabled)}
                toggleSaving={featureSaving}
              />
              <SensorCard
                name="Magnetometer"
                available={sensors.mag}
                Icon={Compass}
                description="Measures heading - needed for GPS navigation"
                liveValue={sensors.mag ? `${(attitude?.yaw ?? 0).toFixed(0)}°` : undefined}
                canToggle={true}
                isEnabled={sensors.mag}
                onToggle={(enabled) => handleHardwareSensorToggle('mag_hardware', enabled)}
                toggleSaving={featureSaving}
              />
              <SensorCard
                name="Rangefinder"
                available={sensors.sonar}
                Icon={Ruler}
                description="Measures distance to ground - for precise landings"
                canToggle={true}
                isEnabled={(features & (1 << FEATURE_SONAR)) !== 0}
                onToggle={(enabled) => handleFeatureToggle(FEATURE_SONAR, enabled)}
                toggleSaving={featureSaving}
              />
            </div>

            {/* Live Telemetry Section */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Live Telemetry</h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Attitude Card */}
                <TelemetryCard
                  title="Attitude"
                  icon="🎯"
                  values={[
                    { label: 'Roll', value: attitude?.roll ?? 0, unit: '°' },
                    { label: 'Pitch', value: attitude?.pitch ?? 0, unit: '°' },
                    { label: 'Yaw', value: attitude?.yaw ?? 0, unit: '°' },
                  ]}
                />

                {/* Altitude Card */}
                <TelemetryCard
                  title="Altitude"
                  icon="📏"
                  values={[
                    { label: 'Alt', value: vfrHud?.alt ?? 0, unit: 'm' },
                    { label: 'Vario', value: vfrHud?.climb ?? 0, unit: 'm/s' },
                    { label: 'Voltage', value: battery?.voltage ?? 0, unit: 'V' },
                  ]}
                />
              </div>

              {/* GPS Data Card (only if GPS available) */}
              {sensors.gps && (
                <div className="p-4 rounded-xl border bg-blue-500/10 border-blue-500/30">
                  <div className="flex items-center gap-2 mb-3">
                    <Satellite className="w-5 h-5 text-blue-400" />
                    <span className="font-medium text-blue-300">GPS Position</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <div className="text-lg font-mono text-cyan-400">
                        {(gps?.lat || 0).toFixed(6)}
                      </div>
                      <div className="text-xs text-gray-500">Latitude</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono text-cyan-400">
                        {(gps?.lon || 0).toFixed(6)}
                      </div>
                      <div className="text-xs text-gray-500">Longitude</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono text-cyan-400">
                        {(gps?.alt || 0).toFixed(1)}
                        <span className="text-xs text-gray-500 ml-1">m</span>
                      </div>
                      <div className="text-xs text-gray-500">GPS Alt</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono text-cyan-400">
                        {(vfrHud?.groundspeed || 0).toFixed(1)}
                        <span className="text-xs text-gray-500 ml-1">m/s</span>
                      </div>
                      <div className="text-xs text-gray-500">Speed</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {!sensors.gps && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="w-6 h-6 text-yellow-400" />
                  <div>
                    <h4 className="font-medium text-yellow-400">GPS Not Connected</h4>
                    <p className="text-sm text-gray-400">
                      To use GPS Rescue (automatic return home), connect a GPS module to your flight controller.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isInav ? (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🗺️</span>
                  <div>
                    <h4 className="font-medium text-green-400">iNav - Mission Planning Available!</h4>
                    <p className="text-sm text-gray-400">
                      Your board runs iNav which supports autonomous waypoint missions. Check Mission Planning in the navigation.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-gray-800/30 border border-gray-700/30 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">ℹ️</span>
                  <div>
                    <h4 className="font-medium text-gray-300">Betaflight - FPV Racing & Freestyle</h4>
                    <p className="text-sm text-gray-500">
                      Betaflight is optimized for manual flight. For autonomous missions and GPS navigation, consider flashing iNav firmware.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Servo Tuning Tab (iNav only) */}
        {activeTab === 'servo-tuning' && isInav && (
          <ServoTuningTab />
        )}

        {/* Servo Mixer Tab (iNav only) */}
        {activeTab === 'servo-mixer' && isInav && (
          <ServoMixerTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Motor Mixer Tab (iNav only) */}
        {activeTab === 'motor-mixer' && isInav && (
          <MotorMixerTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Navigation Tab (iNav only) */}
        {activeTab === 'navigation' && isInav && (
          <NavigationTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Auto Launch Tab (iNav Airplane only) */}
        {activeTab === 'auto-launch' && isInav && currentPlatformType === 1 && (
          <AutoLaunchTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Filter Config Tab (Betaflight only) */}
        {activeTab === 'filters' && !isInav && (
          <FilterConfigTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* VTX Config Tab */}
        {activeTab === 'vtx' && (
          <VtxConfigTab modified={modified} setModified={setPidRatesModified} />
        )}

        {/* Safety Tab (Receiver/Failsafe) */}
        {activeTab === 'safety' && (
          <SafetyTab ref={safetyRef} isInav={isInav} setModified={setSafetyModified} />
        )}
      </div>

      {/* Quick Setup Wizard Modal */}
      <QuickSetupWizard />
    </div>
  );
}
