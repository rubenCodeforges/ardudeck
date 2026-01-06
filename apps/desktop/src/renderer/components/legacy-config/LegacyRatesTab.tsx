/**
 * Legacy Rates Tab
 *
 * Rate configuration for legacy F3 boards via CLI commands.
 * Modern UI with rate curve visualization and presets.
 */

import { useState, useMemo } from 'react';
import { useLegacyConfigStore } from '../../stores/legacy-config-store';

// Rate Presets
const RATE_PRESETS = {
  beginner: {
    name: 'Beginner',
    description: 'Slow & predictable - great for learning',
    icon: '🐣',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    rates: { rcRate: 80, rcExpo: 20, rollRate: 40, pitchRate: 40, yawRate: 40, rcYawExpo: 20 },
  },
  freestyle: {
    name: 'Freestyle',
    description: 'Balanced for tricks & flow',
    icon: '🎭',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    rates: { rcRate: 100, rcExpo: 15, rollRate: 70, pitchRate: 70, yawRate: 65, rcYawExpo: 10 },
  },
  racing: {
    name: 'Racing',
    description: 'Fast & responsive for speed',
    icon: '🏎️',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    rates: { rcRate: 120, rcExpo: 5, rollRate: 80, pitchRate: 80, yawRate: 70, rcYawExpo: 0 },
  },
  cinematic: {
    name: 'Cinematic',
    description: 'Ultra-smooth for filming',
    icon: '🎬',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    rates: { rcRate: 70, rcExpo: 40, rollRate: 30, pitchRate: 30, yawRate: 25, rcYawExpo: 30 },
  },
};

// Custom profile storage
const RATE_PROFILES_KEY = 'ardudeck_legacy_rate_profiles';

function loadCustomProfiles(): Record<string, { name: string; data: typeof RATE_PRESETS.beginner.rates }> {
  try {
    const stored = localStorage.getItem(RATE_PROFILES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveCustomProfiles(profiles: Record<string, { name: string; data: typeof RATE_PRESETS.beginner.rates }>): void {
  localStorage.setItem(RATE_PROFILES_KEY, JSON.stringify(profiles));
}

// Tuning slider component
function TuningSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 255,
  color = '#3B82F6',
  hint,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  color?: string;
  hint?: string;
  suffix?: string;
}) {
  const percentage = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <span className="text-sm font-medium text-gray-200">{label}</span>
          {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(Math.max(min, value - 1))}
            className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm"
          >
            -
          </button>
          <div className="flex items-center">
            <input
              type="number"
              min={min}
              max={max}
              value={value}
              onChange={(e) => onChange(Math.min(max, Math.max(min, parseInt(e.target.value) || 0)))}
              className="w-14 px-2 py-1 text-center text-sm bg-zinc-900 border border-zinc-700 rounded text-white"
            />
            {suffix && <span className="text-xs text-zinc-500 ml-1">{suffix}</span>}
          </div>
          <button
            onClick={() => onChange(Math.min(max, value + 1))}
            className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-sm"
          >
            +
          </button>
        </div>
      </div>
      <div
        className="relative h-3 bg-zinc-800 rounded-full overflow-hidden cursor-pointer"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const newValue = Math.round((x / rect.width) * (max - min) + min);
          onChange(Math.min(max, Math.max(min, newValue)));
        }}
      >
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

// Rate curve visualization
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
    return Math.round(superRate * 10);
  }, [superRate]);

  return (
    <div className="bg-zinc-900/50 rounded-lg p-3 border border-zinc-800">
      <div className="flex items-center justify-between text-xs text-zinc-500 mb-2">
        <span>Response Curve</span>
        <span className="text-zinc-400">Max: <span style={{ color }}>{maxRate}°/s</span></span>
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

export default function LegacyRatesTab() {
  const { rates, updateRates } = useLegacyConfigStore();
  const [customProfiles, setCustomProfiles] = useState(loadCustomProfiles);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  if (!rates) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No rates data loaded. Run dump command first.
      </div>
    );
  }

  const handleChange = (field: keyof typeof rates, value: number, paramName: string) => {
    const updated = { ...rates, [field]: value };
    updateRates(updated);
    window.electronAPI.cliSendCommand(`set ${paramName} = ${value}`);
  };

  const applyPreset = async (preset: typeof RATE_PRESETS.beginner) => {
    const updated = { ...rates, ...preset.rates };
    updateRates(updated);

    console.log('[LegacyRatesTab] Applying preset:', preset.name);

    // Send all CLI commands with delays
    await window.electronAPI.cliSendCommand(`set rc_rate = ${preset.rates.rcRate}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set rc_expo = ${preset.rates.rcExpo}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set roll_rate = ${preset.rates.rollRate}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set pitch_rate = ${preset.rates.pitchRate}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set yaw_rate = ${preset.rates.yawRate}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set rc_yaw_expo = ${preset.rates.rcYawExpo}`);

    console.log('[LegacyRatesTab] Preset applied');
  };

  const saveCurrentAsProfile = () => {
    if (!newProfileName.trim()) return;
    const id = `custom_${Date.now()}`;
    const newProfiles = {
      ...customProfiles,
      [id]: {
        name: newProfileName,
        data: {
          rcRate: rates.rcRate,
          rcExpo: rates.rcExpo,
          rollRate: rates.rollRate,
          pitchRate: rates.pitchRate,
          yawRate: rates.yawRate,
          rcYawExpo: rates.rcYawExpo,
        },
      },
    };
    setCustomProfiles(newProfiles);
    saveCustomProfiles(newProfiles);
    setShowSaveDialog(false);
    setNewProfileName('');
  };

  const deleteProfile = (id: string) => {
    const newProfiles = { ...customProfiles };
    delete newProfiles[id];
    setCustomProfiles(newProfiles);
    saveCustomProfiles(newProfiles);
  };

  const loadProfile = async (data: typeof RATE_PRESETS.beginner.rates) => {
    const updated = { ...rates, ...data };
    updateRates(updated);

    console.log('[LegacyRatesTab] Loading profile');

    await window.electronAPI.cliSendCommand(`set rc_rate = ${data.rcRate}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set rc_expo = ${data.rcExpo}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set roll_rate = ${data.rollRate}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set pitch_rate = ${data.pitchRate}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set yaw_rate = ${data.yawRate}`);
    await new Promise(r => setTimeout(r, 50));
    await window.electronAPI.cliSendCommand(`set rc_yaw_expo = ${data.rcYawExpo}`);

    console.log('[LegacyRatesTab] Profile loaded');
  };

  const axisColors = {
    roll: '#EF4444',
    pitch: '#22C55E',
    yaw: '#3B82F6',
  };

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <p className="text-sm text-amber-300">
          <strong>Legacy CLI Mode:</strong> Changes are sent immediately via CLI commands.
          Click "Save to EEPROM" when done to persist changes.
        </p>
      </div>

      {/* Presets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-zinc-300">Quick Presets</h3>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            + Save Current as Profile
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(RATE_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(preset)}
              className={`p-3 rounded-lg border bg-gradient-to-br ${preset.color} hover:scale-[1.02] transition-all text-left`}
            >
              <div className="text-2xl mb-1">{preset.icon}</div>
              <div className="font-medium text-white text-sm">{preset.name}</div>
              <div className="text-xs text-zinc-400 mt-0.5">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Profiles */}
      {Object.keys(customProfiles).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Your Profiles</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(customProfiles).map(([id, profile]) => (
              <div key={id} className="flex items-center gap-1 bg-zinc-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => loadProfile(profile.data)}
                  className="px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700"
                >
                  {profile.name}
                </button>
                <button
                  onClick={() => deleteProfile(id)}
                  className="px-2 py-1.5 text-zinc-500 hover:text-red-400 hover:bg-zinc-700"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Profile Dialog */}
      {showSaveDialog && (
        <div className="p-4 bg-zinc-800 rounded-lg border border-zinc-700">
          <h4 className="text-sm font-medium text-white mb-3">Save Current Rates as Profile</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder="Profile name..."
              className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-white text-sm"
              autoFocus
            />
            <button
              onClick={saveCurrentAsProfile}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium"
            >
              Save
            </button>
            <button
              onClick={() => setShowSaveDialog(false)}
              className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Rate Curves + Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {(['roll', 'pitch', 'yaw'] as const).map((axis) => {
          const rateKey = `${axis}Rate` as 'rollRate' | 'pitchRate' | 'yawRate';
          const expoKey = axis === 'yaw' ? 'rcYawExpo' : 'rcExpo';

          return (
            <div key={axis} className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: axisColors[axis] }} />
                <h3 className="text-lg font-semibold text-white capitalize">{axis}</h3>
              </div>

              {/* Rate Curve */}
              <div className="mb-5">
                <RateCurve
                  rcRate={rates.rcRate}
                  superRate={rates[rateKey]}
                  expo={rates[expoKey]}
                  color={axisColors[axis]}
                />
              </div>

              {/* Sliders */}
              <div className="space-y-4">
                <TuningSlider
                  label="Rate"
                  hint="Maximum rotation speed"
                  value={rates[rateKey]}
                  onChange={(v) => handleChange(rateKey, v, `${axis}_rate`)}
                  color={axisColors[axis]}
                  max={180}
                  suffix="°/s"
                />
                <TuningSlider
                  label="Expo"
                  hint="Center stick sensitivity"
                  value={rates[expoKey]}
                  onChange={(v) => handleChange(expoKey, v, axis === 'yaw' ? 'rc_yaw_expo' : 'rc_expo')}
                  color={axisColors[axis]}
                  max={100}
                  suffix="%"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Global RC Rate */}
      <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800">
        <h3 className="text-lg font-semibold text-white mb-4">Global Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TuningSlider
            label="RC Rate"
            hint="Overall stick sensitivity multiplier"
            value={rates.rcRate}
            onChange={(v) => handleChange('rcRate', v, 'rc_rate')}
            color="#8B5CF6"
            max={200}
          />
          <div className="grid grid-cols-2 gap-4">
            <TuningSlider
              label="Throttle Mid"
              hint="Hover point"
              value={rates.throttleMid}
              onChange={(v) => handleChange('throttleMid', v, 'thr_mid')}
              color="#F59E0B"
              max={100}
              suffix="%"
            />
            <TuningSlider
              label="Throttle Expo"
              hint="Throttle curve"
              value={rates.throttleExpo}
              onChange={(v) => handleChange('throttleExpo', v, 'thr_expo')}
              color="#F59E0B"
              max={100}
              suffix="%"
            />
          </div>
        </div>
      </div>

      {/* TPA */}
      <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-semibold text-white">Throttle PID Attenuation</h3>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">TPA</span>
        </div>
        <p className="text-sm text-zinc-400 mb-4">
          Reduces PID strength at high throttle to prevent oscillations during fast flight.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <TuningSlider
            label="TPA Rate"
            hint="How much to reduce PIDs at full throttle"
            value={rates.tpaRate}
            onChange={(v) => handleChange('tpaRate', v, 'tpa_rate')}
            color="#10B981"
            max={100}
            suffix="%"
          />
          <TuningSlider
            label="TPA Breakpoint"
            hint="Throttle level where TPA starts"
            value={rates.tpaBreakpoint}
            onChange={(v) => handleChange('tpaBreakpoint', v, 'tpa_breakpoint')}
            color="#10B981"
            min={1000}
            max={2000}
          />
        </div>
      </div>
    </div>
  );
}
