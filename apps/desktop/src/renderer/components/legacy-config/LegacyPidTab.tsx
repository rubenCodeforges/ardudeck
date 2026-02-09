/**
 * Legacy PID Tab
 *
 * PID tuning for legacy F3 boards via CLI commands.
 * Modern UI matching MspConfigView with sliders and presets.
 */

import { useState } from 'react';
import { useLegacyConfigStore } from '../../stores/legacy-config-store';
import { DraggableSlider } from '../ui/DraggableSlider';

// PID Presets - same as modern boards
const PID_PRESETS = {
  beginner: {
    name: 'Beginner',
    description: 'Smooth & forgiving - great for learning',
    icon: '🐣',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    pids: {
      roll: { p: 35, i: 40, d: 20, ff: 0 },
      pitch: { p: 38, i: 42, d: 22, ff: 0 },
      yaw: { p: 45, i: 50, d: 0, ff: 0 },
    },
  },
  freestyle: {
    name: 'Freestyle',
    description: 'Responsive & smooth for tricks',
    icon: '🎭',
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    pids: {
      roll: { p: 45, i: 45, d: 28, ff: 0 },
      pitch: { p: 48, i: 48, d: 30, ff: 0 },
      yaw: { p: 55, i: 50, d: 0, ff: 0 },
    },
  },
  racing: {
    name: 'Racing',
    description: 'Snappy & precise for speed',
    icon: '🏎️',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    pids: {
      roll: { p: 55, i: 50, d: 32, ff: 0 },
      pitch: { p: 58, i: 52, d: 34, ff: 0 },
      yaw: { p: 65, i: 55, d: 0, ff: 0 },
    },
  },
  cinematic: {
    name: 'Cinematic',
    description: 'Ultra-smooth for video',
    icon: '🎬',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
    pids: {
      roll: { p: 30, i: 35, d: 18, ff: 0 },
      pitch: { p: 32, i: 38, d: 20, ff: 0 },
      yaw: { p: 40, i: 45, d: 0, ff: 0 },
    },
  },
};

// Custom profile storage
const PID_PROFILES_KEY = 'ardudeck_legacy_pid_profiles';

function loadCustomProfiles(): Record<string, { name: string; data: typeof PID_PRESETS.beginner.pids }> {
  try {
    const stored = localStorage.getItem(PID_PROFILES_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveCustomProfiles(profiles: Record<string, { name: string; data: typeof PID_PRESETS.beginner.pids }>): void {
  localStorage.setItem(PID_PROFILES_KEY, JSON.stringify(profiles));
}

export default function LegacyPidTab() {
  const { pid, updatePid, platformType } = useLegacyConfigStore();
  const [customProfiles, setCustomProfiles] = useState(loadCustomProfiles);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  // iNav uses different CLI parameter names based on platform type:
  // - Multirotor: mc_p_roll, mc_i_roll, mc_d_roll
  // - Fixed-wing: fw_p_roll, fw_i_roll, fw_ff_roll (note: ff = feedforward!)
  const isAirplane = platformType === 'airplane';
  const prefix = isAirplane ? 'fw' : 'mc';
  const dTerm = isAirplane ? 'ff' : 'd'; // Fixed-wing uses feedforward instead of derivative

  if (!pid) {
    return (
      <div className="text-center py-8 text-zinc-500">
        No PID data loaded. Run dump command first.
      </div>
    );
  }

  const handleChange = (axis: 'roll' | 'pitch' | 'yaw', field: 'p' | 'i' | 'd' | 'ff', value: number) => {
    const updated = { ...pid };
    updated[axis] = { ...updated[axis], [field]: value };
    updatePid(updated);

    // Send CLI command with correct iNav parameter name
    // For fixed-wing: fw_p_roll, fw_i_roll, fw_ff_roll
    // For multirotor: mc_p_roll, mc_i_roll, mc_d_roll
    let paramSuffix: string;
    if (field === 'ff') {
      paramSuffix = isAirplane ? 'ff' : 'f'; // fw_ff_* or mc_f_* (if exists)
    } else if (field === 'd') {
      paramSuffix = dTerm; // Use 'ff' for airplane, 'd' for multirotor
    } else {
      paramSuffix = field; // 'p' or 'i'
    }
    const paramName = `${prefix}_${paramSuffix}_${axis}`;
    window.electronAPI.cliSendCommand(`set ${paramName} = ${value}`);
  };

  const applyPreset = async (preset: typeof PID_PRESETS.beginner) => {
    const updated = { ...pid, ...preset.pids };
    updatePid(updated);

    console.log('[LegacyPidTab] Applying preset:', preset.name, 'for', platformType);

    // Send all CLI commands with correct iNav parameter names
    // For fixed-wing: fw_p_roll, fw_i_roll, fw_ff_roll (note: ff not d!)
    // For multirotor: mc_p_roll, mc_i_roll, mc_d_roll
    for (const axis of ['roll', 'pitch', 'yaw'] as const) {
      const axisData = preset.pids[axis];
      await window.electronAPI.cliSendCommand(`set ${prefix}_p_${axis} = ${axisData.p}`);
      await new Promise(r => setTimeout(r, 50));
      await window.electronAPI.cliSendCommand(`set ${prefix}_i_${axis} = ${axisData.i}`);
      await new Promise(r => setTimeout(r, 50));
      // Fixed-wing uses 'ff' (feedforward), multirotor uses 'd' (derivative)
      await window.electronAPI.cliSendCommand(`set ${prefix}_${dTerm}_${axis} = ${axisData.d}`);
      await new Promise(r => setTimeout(r, 50));
    }

    console.log('[LegacyPidTab] Preset applied');
  };

  const saveCurrentAsProfile = () => {
    if (!newProfileName.trim()) return;
    const id = `custom_${Date.now()}`;
    const newProfiles = {
      ...customProfiles,
      [id]: { name: newProfileName, data: { roll: { ...pid.roll, ff: pid.roll.ff ?? 0 }, pitch: { ...pid.pitch, ff: pid.pitch.ff ?? 0 }, yaw: { ...pid.yaw, ff: pid.yaw.ff ?? 0 } } },
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

  const loadProfile = async (data: typeof PID_PRESETS.beginner.pids) => {
    const updated = { ...pid, ...data };
    updatePid(updated);

    console.log('[LegacyPidTab] Loading profile for', platformType);

    // Send all CLI commands with correct iNav parameter names
    for (const axis of ['roll', 'pitch', 'yaw'] as const) {
      const axisData = data[axis];
      await window.electronAPI.cliSendCommand(`set ${prefix}_p_${axis} = ${axisData.p}`);
      await new Promise(r => setTimeout(r, 50));
      await window.electronAPI.cliSendCommand(`set ${prefix}_i_${axis} = ${axisData.i}`);
      await new Promise(r => setTimeout(r, 50));
      await window.electronAPI.cliSendCommand(`set ${prefix}_${dTerm}_${axis} = ${axisData.d}`);
      await new Promise(r => setTimeout(r, 50));
    }

    console.log('[LegacyPidTab] Profile loaded');
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
          <strong>Legacy CLI Mode ({isAirplane ? 'Fixed-Wing' : 'Multirotor'}):</strong> Changes are sent immediately via CLI commands.
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
          {Object.entries(PID_PRESETS).map(([key, preset]) => (
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
          <h4 className="text-sm font-medium text-white mb-3">Save Current PIDs as Profile</h4>
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

      {/* PID Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {(['roll', 'pitch', 'yaw'] as const).map((axis) => (
          <div key={axis} className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: axisColors[axis] }}
              />
              <h3 className="text-lg font-semibold text-white capitalize">{axis}</h3>
            </div>
            <div className="space-y-5">
              <DraggableSlider
                label="P - Proportional"
                hint="Responsiveness to stick input"
                value={pid[axis].p}
                onChange={(v) => handleChange(axis, 'p', v)}
                color={axisColors[axis]}
                max={200}
              />
              <DraggableSlider
                label="I - Integral"
                hint="Corrects drift over time"
                value={pid[axis].i}
                onChange={(v) => handleChange(axis, 'i', v)}
                color={axisColors[axis]}
                max={200}
              />
              <DraggableSlider
                label={isAirplane ? "FF - Feed Forward" : "D - Derivative"}
                hint={isAirplane ? "Anticipates stick movement" : "Dampens overshoots"}
                value={pid[axis].d}
                onChange={(v) => handleChange(axis, 'd', v)}
                color={axisColors[axis]}
                max={200}
              />
              {/* Only show separate FF slider for multirotors */}
              {!isAirplane && axis !== 'yaw' && (
                <DraggableSlider
                  label="FF - Feed Forward"
                  hint="Anticipates stick movement"
                  value={pid[axis].ff || 0}
                  onChange={(v) => handleChange(axis, 'ff', v)}
                  color={axisColors[axis]}
                  max={200}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Level Mode PIDs */}
      {pid.level && (
        <div className="bg-zinc-900/50 rounded-xl p-5 border border-zinc-800">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <h3 className="text-lg font-semibold text-white">Level (Angle Mode)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <DraggableSlider
              label="P - Strength"
              hint="How hard it self-levels"
              value={pid.level.p || 0}
              onChange={(v) => {
                const updated = { ...pid, level: { ...pid.level!, p: v } };
                updatePid(updated);
                window.electronAPI.cliSendCommand(`set ${prefix}_p_level = ${v}`);
              }}
              color="#A855F7"
              max={200}
            />
            <DraggableSlider
              label="I - Integral"
              hint="Holds level over time"
              value={pid.level.i || 0}
              onChange={(v) => {
                const updated = { ...pid, level: { ...pid.level!, i: v } };
                updatePid(updated);
                window.electronAPI.cliSendCommand(`set ${prefix}_i_level = ${v}`);
              }}
              color="#A855F7"
              max={200}
            />
            <DraggableSlider
              label="D - Damping"
              hint="Reduces oscillation"
              value={pid.level.d || 0}
              onChange={(v) => {
                const updated = { ...pid, level: { ...pid.level!, d: v } };
                updatePid(updated);
                window.electronAPI.cliSendCommand(`set ${prefix}_d_level = ${v}`);
              }}
              color="#A855F7"
              max={200}
            />
          </div>
        </div>
      )}
    </div>
  );
}
