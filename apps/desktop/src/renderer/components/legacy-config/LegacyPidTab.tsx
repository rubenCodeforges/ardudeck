/**
 * Legacy PID Tab
 *
 * PID tuning for legacy F3 boards via CLI commands.
 * Modern UI matching MspConfigView with sliders and presets.
 */

import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useLegacyConfigStore } from '../../stores/legacy-config-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { Egg, Drama, Gauge, Film, type LucideIcon } from 'lucide-react';

// PID Presets - same as modern boards
const PID_PRESETS = {
  beginner: {
    nameKey: 'legacy-config:legacyPidTab.presets.beginner.name',
    descriptionKey: 'legacy-config:legacyPidTab.presets.beginner.description',
    icon: Egg,
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
    pids: {
      roll: { p: 35, i: 40, d: 20, ff: 0 },
      pitch: { p: 38, i: 42, d: 22, ff: 0 },
      yaw: { p: 45, i: 50, d: 0, ff: 0 },
    },
  },
  freestyle: {
    nameKey: 'legacy-config:legacyPidTab.presets.freestyle.name',
    descriptionKey: 'legacy-config:legacyPidTab.presets.freestyle.description',
    icon: Drama,
    color: 'from-purple-500/20 to-violet-500/10 border-purple-500/30',
    pids: {
      roll: { p: 45, i: 45, d: 28, ff: 0 },
      pitch: { p: 48, i: 48, d: 30, ff: 0 },
      yaw: { p: 55, i: 50, d: 0, ff: 0 },
    },
  },
  racing: {
    nameKey: 'legacy-config:legacyPidTab.presets.racing.name',
    descriptionKey: 'legacy-config:legacyPidTab.presets.racing.description',
    icon: Gauge,
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
    pids: {
      roll: { p: 55, i: 50, d: 32, ff: 0 },
      pitch: { p: 58, i: 52, d: 34, ff: 0 },
      yaw: { p: 65, i: 55, d: 0, ff: 0 },
    },
  },
  cinematic: {
    nameKey: 'legacy-config:legacyPidTab.presets.cinematic.name',
    descriptionKey: 'legacy-config:legacyPidTab.presets.cinematic.description',
    icon: Film,
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
  const { t } = useTranslation();
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
      <div className="text-center py-8 text-content-secondary">
        {t('legacy-config:legacyPidTab.noData')}
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
          <Trans
            i18nKey={isAirplane ? 'legacy-config:legacyPidTab.infoFixedWing' : 'legacy-config:legacyPidTab.infoMultirotor'}
            components={{ b: <strong /> }}
          />
        </p>
      </div>

      {/* Presets */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-content">{t('legacy-config:legacyPidTab.quickPresets')}</h3>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            {t('legacy-config:legacyPidTab.saveAsProfile')}
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(PID_PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => applyPreset(preset)}
              className={`p-3 rounded-lg border bg-gradient-to-br ${preset.color} hover:scale-[1.02] transition-all text-left`}
            >
              <div className="mb-1"><preset.icon className="w-6 h-6 text-content mx-auto" /></div>
              <div className="font-medium text-content text-sm">{t(preset.nameKey)}</div>
              <div className="text-xs text-content-secondary mt-0.5">{t(preset.descriptionKey)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Profiles */}
      {Object.keys(customProfiles).length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-content mb-3">{t('legacy-config:legacyPidTab.yourProfiles')}</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(customProfiles).map(([id, profile]) => (
              <div key={id} className="flex items-center gap-1 bg-surface-raised rounded-lg overflow-hidden">
                <button
                  onClick={() => loadProfile(profile.data)}
                  className="px-3 py-1.5 text-sm text-content hover:bg-surface-raised"
                >
                  {profile.name}
                </button>
                <button
                  onClick={() => deleteProfile(id)}
                  className="px-2 py-1.5 text-content-secondary hover:text-red-400 hover:bg-surface-raised"
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
        <div className="p-4 bg-surface-raised rounded-lg border border">
          <h4 className="text-sm font-medium text-content mb-3">{t('legacy-config:legacyPidTab.saveDialogTitle')}</h4>
          <div className="flex gap-2">
            <input
              type="text"
              value={newProfileName}
              onChange={(e) => setNewProfileName(e.target.value)}
              placeholder={t('legacy-config:legacyPidTab.profileNamePlaceholder')}
              className="flex-1 px-3 py-2 bg-surface-input border border rounded text-content text-sm"
              autoFocus
            />
            <button
              onClick={saveCurrentAsProfile}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm font-medium"
            >
              {t('common:save')}
            </button>
            <button
              onClick={() => setShowSaveDialog(false)}
              className="px-4 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded text-sm"
            >
              {t('common:cancel')}
            </button>
          </div>
        </div>
      )}

      {/* PID Sliders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {(['roll', 'pitch', 'yaw'] as const).map((axis) => (
          <div key={axis} className="bg-surface-input rounded-xl p-5 border border-subtle">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: axisColors[axis] }}
              />
              <h3 className="text-lg font-semibold text-content capitalize">{t(`legacy-config:legacyPidTab.axis.${axis}`)}</h3>
            </div>
            <div className="space-y-5">
              <DraggableSlider
                label={t('legacy-config:legacyPidTab.pLabel')}
                hint={t('legacy-config:legacyPidTab.pHint')}
                value={pid[axis].p}
                onChange={(v) => handleChange(axis, 'p', v)}
                color={axisColors[axis]}
                max={200}
              />
              <DraggableSlider
                label={t('legacy-config:legacyPidTab.iLabel')}
                hint={t('legacy-config:legacyPidTab.iHint')}
                value={pid[axis].i}
                onChange={(v) => handleChange(axis, 'i', v)}
                color={axisColors[axis]}
                max={200}
              />
              <DraggableSlider
                label={isAirplane ? t('legacy-config:legacyPidTab.ffLabel') : t('legacy-config:legacyPidTab.dLabel')}
                hint={isAirplane ? t('legacy-config:legacyPidTab.ffHint') : t('legacy-config:legacyPidTab.dHint')}
                value={pid[axis].d}
                onChange={(v) => handleChange(axis, 'd', v)}
                color={axisColors[axis]}
                max={200}
              />
              {/* Only show separate FF slider for multirotors */}
              {!isAirplane && axis !== 'yaw' && (
                <DraggableSlider
                  label={t('legacy-config:legacyPidTab.ffLabel')}
                  hint={t('legacy-config:legacyPidTab.ffHint')}
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
        <div className="bg-surface-input rounded-xl p-5 border border-subtle">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full bg-purple-500" />
            <h3 className="text-lg font-semibold text-content">{t('legacy-config:legacyPidTab.levelTitle')}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <DraggableSlider
              label={t('legacy-config:legacyPidTab.levelPLabel')}
              hint={t('legacy-config:legacyPidTab.levelPHint')}
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
              label={t('legacy-config:legacyPidTab.iLabel')}
              hint={t('legacy-config:legacyPidTab.levelIHint')}
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
              label={t('legacy-config:legacyPidTab.levelDLabel')}
              hint={t('legacy-config:legacyPidTab.levelDHint')}
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
