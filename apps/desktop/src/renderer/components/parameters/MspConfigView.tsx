/**
 * MSP Configuration View
 * Beginner-friendly PID tuning, rates, and modes for Betaflight/iNav
 *
 * Philosophy: "No PhD required" - accessible for beginners, powerful for experts
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import inavLogo from '../../assets/inav-logo.png';
import betaflightLogo from '../../assets/betaflight-logo.svg';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useModesWizardStore } from '../../stores/modes-wizard-store';
import ModesWizard from '../modes/ModesWizard';
import ModesAdvancedEditor from '../modes/ModesAdvancedEditor';
import { ServoWizardInline } from '../servo-wizard';
import NavigationTab from './NavigationTab';

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
const DEFAULT_RATES: Partial<MSPRcTuning> = {
  rcRate: 100,
  rcExpo: 0,
  rcPitchRate: 100,
  rcPitchExpo: 0,
  rcYawRate: 100,
  rcYawExpo: 0,
  rollRate: 70,
  pitchRate: 70,
  yawRate: 70,
};

// Rate Presets - common rate configurations
const RATE_PRESETS = {
  beginner: {
    name: 'Beginner',
    description: 'Slow & predictable - great for learning',
    icon: '🐣',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    rates: {
      rcRate: 80, rcExpo: 20, rollRate: 40,
      rcPitchRate: 80, rcPitchExpo: 20, pitchRate: 40,
      rcYawRate: 80, rcYawExpo: 20, yawRate: 40,
    },
  },
  freestyle: {
    name: 'Freestyle',
    description: 'Balanced for tricks & flow',
    icon: '🎭',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    rates: {
      rcRate: 100, rcExpo: 15, rollRate: 70,
      rcPitchRate: 100, rcPitchExpo: 15, pitchRate: 70,
      rcYawRate: 100, rcYawExpo: 10, yawRate: 65,
    },
  },
  racing: {
    name: 'Racing',
    description: 'Fast & responsive for speed',
    icon: '🏎️',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    rates: {
      rcRate: 120, rcExpo: 5, rollRate: 80,
      rcPitchRate: 120, rcPitchExpo: 5, pitchRate: 80,
      rcYawRate: 110, rcYawExpo: 0, yawRate: 70,
    },
  },
  cinematic: {
    name: 'Cinematic',
    description: 'Ultra-smooth for filming',
    icon: '🎬',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    rates: {
      rcRate: 70, rcExpo: 40, rollRate: 30,
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
const PID_PRESETS = {
  beginner: {
    name: 'Beginner',
    description: 'Smooth & forgiving - great for learning',
    icon: '🐣',
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
    icon: '🎭',
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
    icon: '🏎️',
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
    icon: '🎬',
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

// Slider with beginner-friendly styling
function TuningSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 255,
  color = '#3B82F6',
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  color?: string;
  hint?: string;
}) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div className="group">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium text-gray-200 whitespace-nowrap">{label}</span>
          {hint && (
            <span className="text-xs text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
              {hint}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(Math.max(min, value - 1))}
            className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm"
          >
            -
          </button>
          <input
            type="number"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || 0)))}
            className="w-14 px-2 py-1 text-center text-sm bg-gray-900 border border-gray-700 rounded text-white"
          />
          <button
            onClick={() => onChange(Math.min(max, value + 1))}
            className="w-6 h-6 rounded bg-gray-800 hover:bg-gray-700 text-gray-400 text-sm"
          >
            +
          </button>
        </div>
      </div>
      <div className="relative h-3 bg-gray-800 rounded-full overflow-hidden cursor-pointer"
           onClick={(e) => {
             const rect = e.currentTarget.getBoundingClientRect();
             const x = e.clientX - rect.left;
             const newValue = Math.round((x / rect.width) * (max - min) + min);
             onChange(Math.min(max, Math.max(min, newValue)));
           }}>
        <div
          className="absolute left-0 top-0 h-full rounded-full transition-all"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 transition-all"
          style={{ left: `calc(${percentage}% - 8px)`, borderColor: color }}
        />
      </div>
    </div>
  );
}

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
  saveRates,
  saving,
  modified,
  setModified,
}: {
  rcTuning: MSPRcTuning;
  updateRcTuning: (field: keyof MSPRcTuning, value: number) => void;
  setRcTuning: (rates: MSPRcTuning) => void;
  saveRates: () => Promise<void>;
  saving: boolean;
  modified: boolean;
  setModified: (v: boolean) => void;
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
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-white">Quick Presets</h3>
          <button
            onClick={resetToDefaults}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Pick a preset that matches your flying style, or create your own.
        </p>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(RATE_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key as keyof typeof RATE_PRESETS)}
              className={`p-4 rounded-xl border bg-gradient-to-br ${preset.color} hover:scale-105 transition-all text-left`}
            >
              <div className="text-2xl mb-2">{preset.icon}</div>
              <div className="font-medium text-white">{preset.name}</div>
              <div className="text-xs text-gray-400">{preset.description}</div>
            </button>
          ))}
        </div>

        {/* Custom profiles */}
        {Object.keys(customProfiles).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700/30">
            <h4 className="text-sm font-medium text-gray-400 mb-2">Your Saved Profiles</h4>
            <div className="flex flex-wrap gap-2">
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
            </div>
          </div>
        )}
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
              <TuningSlider
                label="Center Rate"
                value={rcTuning[rcRate] as number}
                onChange={(v) => updateRcTuning(rcRate, v)}
                color={color}
                hint="Sensitivity near center"
              />
              <TuningSlider
                label="Max Rate"
                value={rcTuning[superRate] as number}
                onChange={(v) => updateRcTuning(superRate, v)}
                color={color}
                hint="Full stick speed"
              />
              <TuningSlider
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

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={saveRates}
          disabled={saving || !modified}
          className="px-6 py-3 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white transition-all"
        >
          {saving ? 'Applying...' : '✓ Apply Rate Changes'}
        </button>

        {showSaveDialog ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Profile name..."
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveProfile();
                if (e.key === 'Escape') setShowSaveDialog(false);
              }}
            />
            <button
              onClick={saveProfile}
              disabled={!profileName.trim()}
              className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveDialog(false)}
              className="px-3 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveDialog(true)}
            className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            💾 Save as Profile
          </button>
        )}
      </div>
    </div>
  );
}

// PID Tuning Tab Component with presets, profiles, and reset
function PidTuningTab({
  pid,
  setPid,
  updatePid,
  savePid,
  saving,
  modified,
  setModified,
}: {
  pid: MSPPid;
  setPid: (pids: MSPPid) => void;
  updatePid: (axis: 'roll' | 'pitch' | 'yaw', field: 'p' | 'i' | 'd', value: number) => void;
  savePid: () => Promise<void>;
  saving: boolean;
  modified: boolean;
  setModified: (v: boolean) => void;
}) {
  const [customProfiles, setCustomProfiles] = useState<Record<string, { name: string; data: MSPPid }>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [profileName, setProfileName] = useState('');

  // Load custom profiles on mount
  useEffect(() => {
    setCustomProfiles(loadCustomProfiles<MSPPid>(PID_PROFILES_KEY));
  }, []);

  // Apply a PID preset
  const applyPreset = (presetKey: keyof typeof PID_PRESETS) => {
    const preset = PID_PRESETS[presetKey];
    setPid(preset.pids);
    setModified(true);
  };

  // Reset to Betaflight defaults
  const resetToDefaults = () => {
    setPid(DEFAULT_PIDS);
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

  // Load a custom profile
  const loadProfile = (id: string) => {
    const profile = customProfiles[id];
    if (profile) {
      setPid(profile.data);
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
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-medium text-white">Quick Presets</h3>
          <button
            onClick={resetToDefaults}
            className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            Reset to Defaults
          </button>
        </div>
        <p className="text-sm text-gray-400 mb-4">
          Not sure where to start? Pick a preset that matches your flying style, or create your own.
        </p>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(PID_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(key as keyof typeof PID_PRESETS)}
              className={`p-4 rounded-xl border bg-gradient-to-br ${preset.color} hover:scale-105 transition-all text-left`}
            >
              <div className="text-2xl mb-2">{preset.icon}</div>
              <div className="font-medium text-white">{preset.name}</div>
              <div className="text-xs text-gray-400">{preset.description}</div>
            </button>
          ))}
        </div>

        {/* Custom profiles */}
        {Object.keys(customProfiles).length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-700/30">
            <h4 className="text-sm font-medium text-gray-400 mb-2">Your Saved Tunes</h4>
            <div className="flex flex-wrap gap-2">
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
            </div>
          </div>
        )}
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
            <TuningSlider label="P - Response" value={pid.roll.p} onChange={(v) => updatePid('roll', 'p', v)} color="#3B82F6" hint="Higher = snappier" />
            <TuningSlider label="I - Stability" value={pid.roll.i} onChange={(v) => updatePid('roll', 'i', v)} color="#10B981" hint="Higher = more stable" />
            <TuningSlider label="D - Smoothness" value={pid.roll.d} onChange={(v) => updatePid('roll', 'd', v)} color="#8B5CF6" hint="Higher = smoother" />
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
            <TuningSlider label="P - Response" value={pid.pitch.p} onChange={(v) => updatePid('pitch', 'p', v)} color="#3B82F6" />
            <TuningSlider label="I - Stability" value={pid.pitch.i} onChange={(v) => updatePid('pitch', 'i', v)} color="#10B981" />
            <TuningSlider label="D - Smoothness" value={pid.pitch.d} onChange={(v) => updatePid('pitch', 'd', v)} color="#8B5CF6" />
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
            <TuningSlider label="P - Response" value={pid.yaw.p} onChange={(v) => updatePid('yaw', 'p', v)} color="#3B82F6" />
            <TuningSlider label="I - Stability" value={pid.yaw.i} onChange={(v) => updatePid('yaw', 'i', v)} color="#10B981" />
            <TuningSlider label="D - Smoothness" value={pid.yaw.d} onChange={(v) => updatePid('yaw', 'd', v)} color="#8B5CF6" />
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

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          onClick={savePid}
          disabled={saving || !modified}
          className="px-6 py-3 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-800 disabled:text-gray-500 text-white transition-all"
        >
          {saving ? 'Applying...' : '✓ Apply PID Changes'}
        </button>

        {showSaveDialog ? (
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Tune name..."
              className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:border-blue-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveProfile();
                if (e.key === 'Escape') setShowSaveDialog(false);
              }}
            />
            <button
              onClick={saveProfile}
              disabled={!profileName.trim()}
              className="px-3 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveDialog(false)}
              className="px-3 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSaveDialog(true)}
            className="px-4 py-2 text-sm rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
          >
            💾 Save as Tune
          </button>
        )}
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

// Sensor status card
function SensorCard({
  name,
  available,
  icon,
  description,
}: {
  name: string;
  available: boolean;
  icon: string;
  description: string;
}) {
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
        <div className={`px-2 py-1 text-xs rounded-lg ${
          available ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-800 text-gray-500'
        }`}>
          {available ? 'OK' : 'N/A'}
        </div>
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

type TabId = 'tuning' | 'rates' | 'modes' | 'sensors' | 'servos' | 'navigation';

export function MspConfigView() {
  const { connectionState } = useConnectionStore();
  const { gps, attitude } = useTelemetryStore();
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
  const [modified, setModified] = useState(false);

  // Sensors
  const sensors = useMemo(() => ({
    acc: attitude !== null,
    gyro: true,
    mag: (features & (1 << 0)) !== 0,
    baro: (features & (1 << 1)) !== 0,
    gps: gps !== null && gps.satellites > 0,
  }), [attitude, gps, features]);

  const isInav = connectionState.fcVariant === 'INAV';

  // Check if board has SERVO_TILT feature enabled (bit 5)
  // Some boards don't have servo outputs in multirotor mode
  const hasServoFeature = (features & (1 << 5)) !== 0;

  // Load config
  const loadConfig = useCallback(async () => {
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
      if (rcData) setRcTuning(rcData as MSPRcTuning);
      if (modesData) setModes(modesData as MSPModeRange[]);
      if (typeof featuresData === 'number') setFeatures(featuresData);
      setModified(false);
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

  // Save handlers
  const savePid = async () => {
    if (!pid) return;
    setSaving(true);
    try {
      const success = await window.electronAPI?.mspSetPid(pid);
      if (success) setModified(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveRates = async () => {
    if (!rcTuning) return;
    setSaving(true);
    try {
      const success = await window.electronAPI?.mspSetRcTuning(rcTuning);
      if (success) setModified(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const saveToEeprom = async () => {
    setSaving(true);
    try {
      await window.electronAPI?.mspSaveEeprom();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save to EEPROM');
    } finally {
      setSaving(false);
    }
  };

  // Apply preset
  const applyPreset = (presetKey: keyof typeof PID_PRESETS) => {
    const preset = PID_PRESETS[presetKey];
    setPid(preset.pids);
    setModified(true);
  };

  // Update handlers
  const updatePid = (axis: 'roll' | 'pitch' | 'yaw', field: 'p' | 'i' | 'd', value: number) => {
    if (!pid) return;
    setPid({ ...pid, [axis]: { ...pid[axis], [field]: value } });
    setModified(true);
  };

  const updateRcTuning = (field: keyof MSPRcTuning, value: number) => {
    if (!rcTuning) return;
    setRcTuning({ ...rcTuning, [field]: value });
    setModified(true);
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
              onClick={saveToEeprom}
              disabled={saving}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white shadow-lg shadow-blue-500/25"
            >
              💾 Save to Board
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {[
            { id: 'tuning', label: 'PID Tuning', icon: '🎚️', desc: 'How your quad flies' },
            { id: 'rates', label: 'Rates', icon: '📊', desc: 'How fast it turns' },
            { id: 'modes', label: 'Flight Modes', icon: '🎮', desc: 'Switch functions' },
            // iNav-specific tabs (before Sensors)
            ...(isInav ? [
              { id: 'servos', label: 'Servo Setup', icon: '🛫', desc: 'Configure control surfaces' },
              { id: 'navigation', label: 'Navigation', icon: '🧭', desc: 'RTH & GPS settings' },
            ] : []),
            // Sensors always last
            { id: 'sensors', label: 'Sensors', icon: '📡', desc: 'Hardware status' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-all ${
                activeTab === tab.id
                  ? 'bg-gray-800 text-white shadow-lg'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <div className="text-left">
                <div className="text-sm font-medium">{tab.label}</div>
                <div className="text-xs text-gray-500">{tab.desc}</div>
              </div>
            </button>
          ))}
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
            savePid={savePid}
            saving={saving}
            modified={modified}
            setModified={setModified}
          />
        )}


        {/* Rates Tab */}
        {activeTab === 'rates' && rcTuning && (
          <RatesTab
            rcTuning={rcTuning}
            updateRcTuning={updateRcTuning}
            setRcTuning={setRcTuning}
            saveRates={saveRates}
            saving={saving}
            modified={modified}
            setModified={setModified}
          />
        )}


        {/* Modes Tab */}
        {activeTab === 'modes' && <ModesTabContent />}

        {/* Sensors Tab */}
        {activeTab === 'sensors' && (
          <div className="max-w-full px-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <SensorCard name="Gyroscope" available={sensors.gyro} icon="🔄" description="Measures rotation speed - essential for flight" />
              <SensorCard name="Accelerometer" available={sensors.acc} icon="📐" description="Measures tilt angle - needed for self-level" />
              <SensorCard
                name="GPS"
                available={sensors.gps}
                icon="🛰️"
                description={sensors.gps ? `${gps?.satellites || 0} satellites locked` : 'Not connected - needed for GPS Rescue'}
              />
              <SensorCard name="Barometer" available={sensors.baro} icon="📊" description="Measures altitude via air pressure" />
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

        {/* Servo Setup Wizard (iNav only) */}
        {activeTab === 'servos' && isInav && (
          <ServoWizardInline />
        )}

        {/* Navigation Tab (iNav only) */}
        {activeTab === 'navigation' && isInav && (
          <NavigationTab modified={modified} setModified={setModified} />
        )}
      </div>
    </div>
  );
}
