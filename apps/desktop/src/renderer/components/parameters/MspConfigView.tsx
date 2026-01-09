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
import { useMspTelemetryStore } from '../../stores/msp-telemetry-store';
import { useModesWizardStore } from '../../stores/modes-wizard-store';
import ModesWizard from '../modes/ModesWizard';
import ModesAdvancedEditor from '../modes/ModesAdvancedEditor';
import ServoTuningTab from './ServoTuningTab';
import ServoMixerTab from './ServoMixerTab';
import MotorMixerTab from './MotorMixerTab';
import NavigationTab from './NavigationTab';
import SafetyTab from './SafetyTab';
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
const MODE_INFO: Record<number, { name: string; icon: string; description: string; color: string; beginner: string }> = {
  0: { name: 'ARM', icon: '⚡', description: 'Enable motors', color: 'bg-red-500', beginner: 'SAFETY SWITCH - Arms/disarms your quad. Always have this on a switch!' },
  1: { name: 'ANGLE', icon: '📐', description: 'Self-level', color: 'bg-blue-500', beginner: 'BEGINNER MODE - Quad stays level automatically. Best for learning!' },
  2: { name: 'HORIZON', icon: '🌅', description: 'Hybrid mode', color: 'bg-cyan-500', beginner: 'TRAINING MODE - Self-levels at center, allows flips at full stick' },
  3: { name: 'MAG', icon: '🧭', description: 'Heading hold', color: 'bg-purple-500', beginner: 'Holds compass direction - useful for FPV orientation' },
  5: { name: 'PASSTHRU', icon: '➡️', description: 'Direct control', color: 'bg-gray-500', beginner: 'Bypasses flight controller for fixed-wing' },
  6: { name: 'FAILSAFE', icon: '🛡️', description: 'Emergency', color: 'bg-orange-500', beginner: 'EMERGENCY MODE - Activates if signal lost' },
  7: { name: 'GPS RESCUE', icon: '🛰️', description: 'Return home', color: 'bg-green-500', beginner: 'Automatically flies back to home position (needs GPS)' },
  13: { name: 'BEEPER', icon: '🔊', description: 'Find quad', color: 'bg-yellow-500', beginner: 'Makes your quad beep - great for finding it in grass!' },
  19: { name: 'OSD DISABLE', icon: '📺', description: 'Hide OSD', color: 'bg-gray-500', beginner: 'Turns off on-screen display' },
  26: { name: 'BLACKBOX', icon: '📦', description: 'Logging', color: 'bg-pink-500', beginner: 'Records flight data for tuning analysis' },
  28: { name: 'AIRMODE', icon: '💨', description: 'Full control', color: 'bg-cyan-500', beginner: 'Keeps PID active at zero throttle - enables better flips' },
  36: { name: 'PARALYZE', icon: '🔒', description: 'Lock FC', color: 'bg-red-500', beginner: 'Completely locks quad - use for transport' },
};


// Rate curve visualization with better visuals
function RateCurve({
  rcRate,
  superRate,
  expo,
  color,
}: {
  rcRate: number;
  superRate: number;
  expo: number;
  color: string;
}) {
  const points = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 100; i += 2) {
      const stick = i / 100;
      const rcRateFactor = rcRate / 100;
      const superRateFactor = superRate / 100;
      const expoFactor = expo / 100;
      const expoValue = stick * Math.pow(Math.abs(stick), 3) * expoFactor + stick * (1 - expoFactor);
      const rate = rcRateFactor * (1 + Math.abs(expoValue) * superRateFactor * 0.01) * expoValue;
      const x = 5 + (i / 100) * 90;
      const y = 95 - Math.min(rate * 100, 90);
      pts.push(`${x},${y}`);
    }
    return pts.join(' ');
  }, [rcRate, superRate, expo]);

  const maxRate = useMemo(() => {
    const rcRateFactor = rcRate / 100;
    const superRateFactor = superRate / 100;
    return Math.round(rcRateFactor * (1 + superRateFactor) * 200 * 1.8);
  }, [rcRate, superRate]);

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
    const preset = RATE_PRESETS[presetKey];
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
        <span className="text-2xl">💡</span>
        <div>
          <p className="text-blue-400 font-medium">What are rates?</p>
          <p className="text-sm text-gray-400">Rates control how fast your quad spins when you move the sticks. Higher = faster rotation.</p>
        </div>
      </div>

      {/* Presets - same pattern as PIDs */}
      <div className="bg-gradient-to-r from-gray-800/50 to-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <h3 className="text-lg font-medium text-white mb-2">Quick Presets</h3>
        <p className="text-sm text-gray-400 mb-4">
          Pick a preset that matches your flying style, or create your own.
        </p>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(RATE_PRESETS).map(([key, preset]) => {
            const Icon = preset.icon;
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`p-4 rounded-xl border bg-gradient-to-br ${preset.color} hover:scale-105 transition-all text-left`}
              >
                <Icon className={`w-6 h-6 mb-2 ${preset.iconColor}`} />
                <div className="font-medium text-white">{preset.name}</div>
                <div className="text-xs text-gray-400">{preset.description}</div>
              </button>
            );
          })}
          {/* Stock/Default preset */}
          <button
            onClick={resetToDefaults}
            className="p-4 rounded-xl border bg-gradient-to-br from-gray-600/20 to-gray-700/10 border-gray-600/30 hover:scale-105 transition-all text-left"
          >
            <RotateCcw className="w-6 h-6 mb-2 text-gray-400" />
            <div className="font-medium text-white">Stock</div>
            <div className="text-xs text-gray-400">Factory defaults</div>
          </button>
        </div>

        {/* My Presets - always visible */}
        <div className="mt-4 pt-4 border-t border-gray-700/30">
          <h4 className="text-sm font-medium text-gray-400 mb-2">My Presets</h4>
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
            {/* Add preset button/input */}
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
                title="Save current settings as a preset"
              >
                <span>+</span> Add Current
              </button>
            )}
          </div>
          {Object.keys(customProfiles).length === 0 && !showSaveDialog && (
            <p className="text-xs text-gray-600 mt-2">No custom presets yet</p>
          )}
        </div>
      </div>

      {/* Rate sliders */}
      <div className="grid grid-cols-3 gap-5">
        {[
          { axis: 'Roll', icon: '↔️', color: '#3B82F6', rcRate: 'rcRate' as const, superRate: 'rollRate' as const, expo: 'rcExpo' as const },
          { axis: 'Pitch', icon: '↕️', color: '#10B981', rcRate: 'rcPitchRate' as const, superRate: 'pitchRate' as const, expo: 'rcPitchExpo' as const },
          { axis: 'Yaw', icon: '🔄', color: '#F97316', rcRate: 'rcYawRate' as const, superRate: 'yawRate' as const, expo: 'rcYawExpo' as const },
        ].map(({ axis, icon, color, rcRate, superRate, expo }) => (
          <div key={axis} className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
            <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
              <span>{icon}</span> {axis}
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
                label="Expo"
                value={rcTuning[expo] as number}
                onChange={(v) => updateRcTuning(expo, v)}
                max={100}
                color={color}
                hint="Curve softness"
              />
            </div>
            <div className="mt-4">
              <RateCurve
                rcRate={rcTuning[rcRate] as number}
                superRate={rcTuning[superRate] as number}
                expo={rcTuning[expo] as number}
                color={color}
              />
            </div>
          </div>
        ))}
      </div>

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
    const preset = PID_PRESETS[presetKey];
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
      {/* Presets - beginner friendly */}
      <div className="bg-gradient-to-r from-gray-800/50 to-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <h3 className="text-lg font-medium text-white mb-2">Quick Presets</h3>
        <p className="text-sm text-gray-400 mb-4">
          Pick a preset that matches your flying style, or create your own.
        </p>
        <div className="grid grid-cols-5 gap-3">
          {Object.entries(PID_PRESETS).map(([key, preset]) => {
            const Icon = preset.icon;
            return (
              <button
                key={key}
                onClick={() => applyPreset(key)}
                className={`p-4 rounded-xl border bg-gradient-to-br ${preset.color} hover:scale-105 transition-all text-left`}
              >
                <Icon className={`w-6 h-6 mb-2 ${preset.iconColor}`} />
                <div className="font-medium text-white">{preset.name}</div>
                <div className="text-xs text-gray-400">{preset.description}</div>
              </button>
            );
          })}
          {/* Stock/Default preset */}
          <button
            onClick={resetToDefaults}
            className="p-4 rounded-xl border bg-gradient-to-br from-gray-600/20 to-gray-700/10 border-gray-600/30 hover:scale-105 transition-all text-left"
          >
            <RotateCcw className="w-6 h-6 mb-2 text-gray-400" />
            <div className="font-medium text-white">Stock</div>
            <div className="text-xs text-gray-400">Factory defaults</div>
          </button>
        </div>

        {/* My Presets - always visible */}
        <div className="mt-4 pt-4 border-t border-gray-700/30">
          <h4 className="text-sm font-medium text-gray-400 mb-2">My Presets</h4>
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
            {/* Add preset button/input */}
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
                title="Save current settings as a preset"
              >
                <span>+</span> Add Current
              </button>
            )}
          </div>
          {Object.keys(customProfiles).length === 0 && !showSaveDialog && (
            <p className="text-xs text-gray-600 mt-2">No custom presets yet</p>
          )}
        </div>
      </div>

      {/* PID Sliders */}
      <div className="grid grid-cols-3 gap-5">
        {/* Roll */}
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl border border-blue-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center text-xl">↔️</div>
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
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center text-xl">↕️</div>
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
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center text-xl">🔄</div>
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
          <span>💡</span> What do these numbers mean?
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
    icon: '❓',
    description: 'Unknown',
    color: 'bg-gray-500',
    beginner: 'Unknown mode',
  };

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
        <div className={`w-10 h-10 rounded-lg ${info.color} flex items-center justify-center text-xl`}>
          {info.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">{info.name}</span>
            {isActive && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/30 text-emerald-400 animate-pulse">
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

// Enhanced Sensor card with live value display
function SensorCard({
  name,
  available,
  icon,
  description,
  liveValue,
  unit,
}: {
  name: string;
  available: boolean;
  icon: string;
  description: string;
  liveValue?: string | number | null;
  unit?: string;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const prevValueRef = useRef(liveValue);

  // Pulse animation when value changes
  useEffect(() => {
    if (liveValue !== prevValueRef.current && liveValue != null) {
      setIsUpdating(true);
      const timer = setTimeout(() => setIsUpdating(false), 300);
      prevValueRef.current = liveValue;
      return () => clearTimeout(timer);
    }
  }, [liveValue]);

  return (
    <div className={`p-4 rounded-xl border transition-all ${
      available
        ? 'bg-emerald-500/10 border-emerald-500/30'
        : 'bg-gray-800/30 border-gray-700/30'
    }`}>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
          available ? 'bg-emerald-500/20' : 'bg-gray-800'
        }`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className={`font-medium ${available ? 'text-emerald-400' : 'text-gray-400'}`}>
            {name}
          </div>
          <div className="text-xs text-gray-500">{description}</div>
        </div>
        {/* Live value display */}
        {liveValue != null && available && (
          <div className={`px-3 py-1.5 rounded-lg font-mono text-sm transition-all ${
            isUpdating
              ? 'bg-cyan-500/30 text-cyan-300 scale-105'
              : 'bg-gray-800/50 text-gray-300'
          }`}>
            {typeof liveValue === 'number' ? liveValue.toFixed(1) : liveValue}
            {unit && <span className="text-xs text-gray-500 ml-1">{unit}</span>}
          </div>
        )}
        <div className={`px-2 py-1 text-xs rounded-lg ${
          available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-500'
        }`}>
          {available ? 'OK' : 'N/A'}
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
function ModesTabContent() {
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
  const MODE_DISPLAY: Record<number, { name: string; icon: string; color: string }> = {
    0: { name: 'ARM', icon: '⚡', color: 'bg-red-500' },
    1: { name: 'ANGLE', icon: '📐', color: 'bg-blue-500' },
    2: { name: 'HORIZON', icon: '🌅', color: 'bg-purple-500' },
    7: { name: 'GPS RESCUE', icon: '🛟', color: 'bg-green-500' },
    13: { name: 'BEEPER', icon: '🔊', color: 'bg-yellow-500' },
    28: { name: 'AIRMODE', icon: '🌀', color: 'bg-cyan-500' },
  };

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
        <div className="bg-purple-500/10 rounded-xl border border-purple-500/30 p-4 flex items-center gap-4 flex-1 mr-4">
          <span className="text-2xl">🎮</span>
          <div>
            <p className="text-purple-400 font-medium">Flight Modes</p>
            <p className="text-sm text-gray-400">
              Configure how your quad responds to switch positions on your transmitter.
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
            <div className="text-center py-12 bg-zinc-800/30 rounded-xl border border-zinc-700/50">
              <span className="text-5xl mb-4 block">🎮</span>
              <h3 className="text-lg font-medium text-zinc-300 mb-2">No Modes Configured</h3>
              <p className="text-sm text-zinc-500 max-w-md mx-auto mb-6">
                Your flight controller doesn't have any modes set up yet.
                Use the wizard to configure recommended modes for your flying style.
              </p>
              <button
                onClick={openWizard}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 mx-auto"
              >
                <span>🧙</span>
                Start Setup Wizard
              </button>
            </div>
          ) : (
            /* Show existing modes */
            <div className="space-y-4">
              {/* Mode cards */}
              <div className="grid gap-3">
                {originalModes.map((mode, idx) => {
                  const info = MODE_DISPLAY[mode.boxId] || {
                    name: `Mode ${mode.boxId}`,
                    icon: '❓',
                    color: 'bg-zinc-500'
                  };
                  const rcValue = getRcValue(mode.auxChannel);
                  const isActive = rcValue >= mode.rangeStart && rcValue <= mode.rangeEnd;

                  return (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border transition-all ${
                        isActive
                          ? 'bg-zinc-800/80 border-green-500/50 shadow-lg shadow-green-500/10'
                          : 'bg-zinc-800/50 border-zinc-700/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg ${info.color}/20 flex items-center justify-center`}>
                            <span className="text-xl">{info.icon}</span>
                          </div>
                          <div>
                            <div className="font-medium text-zinc-100">{info.name}</div>
                            <div className="text-xs text-zinc-500">
                              {AUX_NAMES[mode.auxChannel] || `AUX ${mode.auxChannel + 1}`} · {mode.rangeStart}-{mode.rangeEnd}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-xs text-zinc-500">Current</div>
                            <div className="font-mono text-sm text-yellow-400">{rcValue}</div>
                          </div>
                          {isActive ? (
                            <span className="px-2 py-1 text-xs bg-green-500/20 text-green-400 rounded-full animate-pulse">
                              ACTIVE
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs bg-zinc-700/50 text-zinc-500 rounded-full">
                              INACTIVE
                            </span>
                          )}
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
                  <span>🧙</span>
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

type TabId = 'tuning' | 'rates' | 'modes' | 'sensors' | 'servo-tuning' | 'servo-mixer' | 'motor-mixer' | 'navigation' | 'safety';

export function MspConfigView() {
  const { connectionState, platformChangeInProgress, setPlatformChangeInProgress } = useConnectionStore();
  const { gps, attitude } = useTelemetryStore();
  // MSP telemetry for real-time sensor values
  const mspAttitude = useMspTelemetryStore((s) => s.attitude);
  const mspAltitude = useMspTelemetryStore((s) => s.altitude);
  const mspGps = useMspTelemetryStore((s) => s.gps);
  const mspAnalog = useMspTelemetryStore((s) => s.analog);
  const { hasChanges: modesHaveChanges, saveToFC: saveModesToFC, isSaving: modesSaving } = useModesWizardStore();
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
  const [pidRatesModified, setPidRatesModified] = useState(false);

  // Combined modified state: PIDs/rates OR modes have changes
  const modified = pidRatesModified || modesHaveChanges();

  // Sensors
  const sensors = useMemo(() => ({
    acc: attitude !== null,
    gyro: true,
    mag: (features & (1 << 0)) !== 0,
    baro: (features & (1 << 1)) !== 0,
    gps: gps !== null && gps.satellites > 0,
  }), [attitude, gps, features]);

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
      await window.electronAPI?.connect({ host: '127.0.0.1', tcpPort: 5760 });

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


  // Check for legacy iNav (< 2.3.0) which has different CLI params and no per-axis RC rates
  const isLegacyInav = useMemo(() => {
    if (!isInav || !connectionState.fcVersion) return false;
    const version = connectionState.fcVersion; // e.g., "2.0.0" or "2.3.0"
    const parts = version.split('.').map(Number);
    if (parts.length < 2) return false;
    const [major, minor] = parts;
    // iNav < 2.3.0 is considered legacy
    return major < 2 || (major === 2 && minor < 3);
  }, [isInav, connectionState.fcVersion]);

  // Check if board has SERVO_TILT feature enabled (bit 5)
  // Some boards don't have servo outputs in multirotor mode
  const hasServoFeature = (features & (1 << 5)) !== 0;

  // Load config
  const loadConfig = useCallback(async () => {
    console.log('[UI] loadConfig called - this will reset modified state!');
    setLoading(true);
    setError(null);
    try {
      const [pidData, rcData, modesData, featuresData] = await Promise.all([
        window.electronAPI?.mspGetPid(),
        window.electronAPI?.mspGetRcTuning(),
        window.electronAPI?.mspGetModeRanges(),
        window.electronAPI?.mspGetFeatures(),
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
      if (typeof featuresData === 'number') setFeatures(featuresData);
      console.log('[UI] loadConfig complete, setting modified=false');
      setPidRatesModified(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (connectionState.isConnected && connectionState.protocol === 'msp') {
      loadConfig();
    }
  }, [connectionState.isConnected, connectionState.protocol, loadConfig]);

  // Single save function that saves everything (PIDs + Rates + Modes + EEPROM)
  const saveAll = async () => {
    if (!modified) return;
    setSaving(true);
    setError(null);
    console.log('[UI] saveAll: saving PIDs, Rates, Modes, and EEPROM');

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

      // Save to EEPROM (only if we saved PIDs/Rates - modes saveToFC handles its own EEPROM)
      if (pidRatesModified) {
        console.log('[UI] Saving to EEPROM...');
        const eepromSuccess = await window.electronAPI?.mspSaveEeprom();
        if (!eepromSuccess) {
          setError('Failed to save to EEPROM');
          return;
        }
      }

      setPidRatesModified(false);
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
          <span>⚠️</span> {error}
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
        {activeTab === 'modes' && <ModesTabContent />}

        {/* Sensors Tab */}
        {activeTab === 'sensors' && (
          <div className="max-w-full px-4 space-y-4">
            {/* Sensor Status Cards */}
            <div className="grid grid-cols-2 gap-4">
              <SensorCard
                name="Gyroscope"
                available={sensors.gyro}
                icon="🔄"
                description="Measures rotation speed - essential for flight"
              />
              <SensorCard
                name="Accelerometer"
                available={sensors.acc}
                icon="📐"
                description="Measures tilt angle - needed for self-level"
                liveValue={`${mspAttitude.roll.toFixed(0)}° / ${mspAttitude.pitch.toFixed(0)}°`}
              />
              <SensorCard
                name="GPS"
                available={sensors.gps}
                icon="🛰️"
                description={sensors.gps ? `${mspGps?.satellites || gps?.satellites || 0} satellites locked` : 'Not connected - needed for GPS Rescue'}
                liveValue={sensors.gps ? `${mspGps?.satellites || gps?.satellites || 0} sats` : undefined}
              />
              <SensorCard
                name="Barometer"
                available={sensors.baro}
                icon="📊"
                description="Measures altitude via air pressure"
                liveValue={sensors.baro ? mspAltitude.altitude : undefined}
                unit="m"
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
                    { label: 'Roll', value: mspAttitude.roll, unit: '°' },
                    { label: 'Pitch', value: mspAttitude.pitch, unit: '°' },
                    { label: 'Yaw', value: mspAttitude.yaw, unit: '°' },
                  ]}
                />

                {/* Altitude Card */}
                <TelemetryCard
                  title="Altitude"
                  icon="📏"
                  values={[
                    { label: 'Alt', value: mspAltitude.altitude, unit: 'm' },
                    { label: 'Vario', value: mspAltitude.vario, unit: 'm/s' },
                    { label: 'Voltage', value: mspAnalog.voltage, unit: 'V' },
                  ]}
                />
              </div>

              {/* GPS Data Card (only if GPS available) */}
              {sensors.gps && (
                <div className="p-4 rounded-xl border bg-blue-500/10 border-blue-500/30">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🛰️</span>
                    <span className="font-medium text-blue-300">GPS Position</span>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <div className="text-center">
                      <div className="text-lg font-mono text-cyan-400">
                        {(mspGps?.lat || gps?.lat || 0).toFixed(6)}
                      </div>
                      <div className="text-xs text-gray-500">Latitude</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono text-cyan-400">
                        {(mspGps?.lon || gps?.lon || 0).toFixed(6)}
                      </div>
                      <div className="text-xs text-gray-500">Longitude</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono text-cyan-400">
                        {(mspGps?.alt || gps?.alt || 0).toFixed(1)}
                        <span className="text-xs text-gray-500 ml-1">m</span>
                      </div>
                      <div className="text-xs text-gray-500">GPS Alt</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-mono text-cyan-400">
                        {(mspGps?.speed || 0).toFixed(1)}
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
                  <span className="text-2xl">⚠️</span>
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

        {/* Safety Tab (Receiver/Failsafe) */}
        {activeTab === 'safety' && (
          <SafetyTab isInav={isInav} />
        )}
      </div>
    </div>
  );
}
