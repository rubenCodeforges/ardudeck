/**
 * NavigationTab
 *
 * iNav Navigation configuration for autonomous flight.
 * RTH settings, waypoint navigation, GPS config.
 */

import { useState, useEffect, useCallback } from 'react';

// Types matching msp-ts
interface MSPNavConfig {
  userControlMode: number;
  maxNavigationSpeed: number;
  maxClimbRate: number;
  maxManualSpeed: number;
  maxManualClimbRate: number;
  landDescendRate: number;
  landSlowdownMinAlt: number;
  landSlowdownMaxAlt: number;
  emergencyDescentRate: number;
  rthAltControlMode: number;
  rthAbortThreshold: number;
  rthAltitude: number;
  waypointRadius: number;
  waypointSafeAlt: number;
  maxBankAngle: number;
  useThrottleMidForAlthold: boolean;
  hoverThrottle: number;
}

interface MSPGpsConfig {
  provider: number;
  sbasMode: number;
  autoConfig: boolean;
  autoBaud: boolean;
  homePointOnce: boolean;
  ubloxUseGalileo: boolean;
}

const NAV_RTH_ALT_MODE = {
  CURRENT: 0,
  EXTRA: 1,
  FIXED: 2,
  MAX: 3,
  AT_LEAST: 4,
} as const;

const NAV_RTH_ALT_MODE_NAMES: Record<number, { name: string; description: string }> = {
  0: { name: 'Current', description: 'Stay at current height — could hit obstacles!' },
  1: { name: 'Extra', description: 'Climb higher by RTH Altitude before returning' },
  2: { name: 'Fixed', description: 'Always return at exactly RTH Altitude' },
  3: { name: 'Maximum', description: 'Use higher of current or RTH Altitude' },
  4: { name: 'At Least (Recommended)', description: 'Climb to RTH Altitude if below, otherwise stay' },
};

const GPS_PROVIDER_NAMES: Record<number, string> = {
  0: 'NMEA',
  1: 'u-blox',
  2: 'MSP',
  3: 'Fake (Testing)',
};

const GPS_SBAS_NAMES: Record<number, string> = {
  0: 'Auto',
  1: 'EGNOS (Europe)',
  2: 'WAAS (USA)',
  3: 'MSAS (Japan)',
  4: 'GAGAN (India)',
  5: 'None',
};

// Default nav config (iNav defaults)
const DEFAULT_NAV_CONFIG: Partial<MSPNavConfig> = {
  maxNavigationSpeed: 300,     // 3 m/s
  maxClimbRate: 500,           // 5 m/s
  waypointRadius: 100,         // 1 m
  waypointSafeAlt: 2000,       // 20 m
  rthAltControlMode: NAV_RTH_ALT_MODE.AT_LEAST,
  rthAltitude: 3000,           // 30 m
  landDescendRate: 200,        // 2 m/s
  emergencyDescentRate: 500,   // 5 m/s
};

// Extended waypoint settings (CLI parameters via MSP2 COMMON_SETTING)
interface WaypointSettings {
  nav_wp_load_on_boot: string; // ON/OFF
  nav_wp_max_safe_distance: number; // 0-1500 (meters)
  nav_wp_mission_restart: string; // START/RESUME/SWITCH
  nav_mc_wp_slowdown: string; // ON/OFF (multicopter)
  nav_fw_wp_turn_smoothing: string; // OFF/ON/ON-CUT (fixed-wing)
}

const DEFAULT_WP_SETTINGS: WaypointSettings = {
  nav_wp_load_on_boot: 'OFF',
  nav_wp_max_safe_distance: 100,
  nav_wp_mission_restart: 'RESUME',
  nav_mc_wp_slowdown: 'ON',
  nav_fw_wp_turn_smoothing: 'OFF',
};

interface Props {
  modified: boolean;
  setModified: (v: boolean) => void;
}

export default function NavigationTab({ modified, setModified }: Props) {
  const [navConfig, setNavConfig] = useState<Partial<MSPNavConfig>>(DEFAULT_NAV_CONFIG);
  const [gpsConfig, setGpsConfig] = useState<MSPGpsConfig | null>(null);
  const [wpSettings, setWpSettings] = useState<WaypointSettings>(DEFAULT_WP_SETTINGS);
  const [wpSettingsSupported, setWpSettingsSupported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load navigation configuration
  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nav = await window.electronAPI.mspGetNavConfig();
      if (nav) {
        setNavConfig((prev) => ({ ...prev, ...nav }));
      }

      const gps = await window.electronAPI.mspGetGpsConfig();
      if (gps) {
        setGpsConfig(gps as MSPGpsConfig);
      }

      // Load extended waypoint settings via generic settings API
      try {
        const wpSettingNames = [
          'nav_wp_load_on_boot',
          'nav_wp_max_safe_distance',
          'nav_wp_mission_restart',
          'nav_mc_wp_slowdown',
          'nav_fw_wp_turn_smoothing',
        ];
        const settings = await window.electronAPI.mspGetSettings(wpSettingNames);

        // Check if we got any valid settings back
        const hasValidSettings = Object.values(settings).some(v => v !== null);
        setWpSettingsSupported(hasValidSettings);

        if (hasValidSettings) {
          setWpSettings({
            nav_wp_load_on_boot: String(settings.nav_wp_load_on_boot ?? 'OFF'),
            nav_wp_max_safe_distance: Number(settings.nav_wp_max_safe_distance ?? 100),
            nav_wp_mission_restart: String(settings.nav_wp_mission_restart ?? 'RESUME'),
            nav_mc_wp_slowdown: String(settings.nav_mc_wp_slowdown ?? 'ON'),
            nav_fw_wp_turn_smoothing: String(settings.nav_fw_wp_turn_smoothing ?? 'OFF'),
          });
          console.log('[Navigation] Loaded waypoint settings:', settings);
        }
      } catch (wpErr) {
        console.log('[Navigation] Extended waypoint settings not available:', wpErr);
        setWpSettingsSupported(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load navigation config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  // Update nav config
  const updateNavConfig = (updates: Partial<MSPNavConfig>) => {
    setNavConfig((prev) => ({ ...prev, ...updates }));
    setModified(true);
  };

  // Update GPS config
  const updateGpsConfig = (updates: Partial<MSPGpsConfig>) => {
    if (gpsConfig) {
      setGpsConfig({ ...gpsConfig, ...updates });
      setModified(true);
    }
  };

  // Update waypoint settings
  const updateWpSettings = (updates: Partial<WaypointSettings>) => {
    setWpSettings((prev) => ({ ...prev, ...updates }));
    setModified(true);
  };

  // Save all changes
  const saveAll = async () => {
    setError(null);
    try {
      console.log('[Navigation] Saving nav config...');
      const navSuccess = await window.electronAPI.mspSetNavConfig(navConfig);
      if (!navSuccess) {
        // MSP2 might not be supported on old iNav - try GPS config only
        console.log('[Navigation] Nav config save failed (may not be supported on old iNav)');
      }

      if (gpsConfig) {
        console.log('[Navigation] Saving GPS config...');
        const gpsSuccess = await window.electronAPI.mspSetGpsConfig(gpsConfig);
        if (!gpsSuccess) {
          setError('Failed to set GPS config');
          return;
        }
      }

      // Save extended waypoint settings via generic settings API
      if (wpSettingsSupported) {
        console.log('[Navigation] Saving waypoint settings...');
        const wpSuccess = await window.electronAPI.mspSetSettings({
          nav_wp_load_on_boot: wpSettings.nav_wp_load_on_boot,
          nav_wp_max_safe_distance: wpSettings.nav_wp_max_safe_distance,
          nav_wp_mission_restart: wpSettings.nav_wp_mission_restart,
          nav_mc_wp_slowdown: wpSettings.nav_mc_wp_slowdown,
          nav_fw_wp_turn_smoothing: wpSettings.nav_fw_wp_turn_smoothing,
        });
        if (!wpSuccess) {
          console.log('[Navigation] Some waypoint settings failed to save');
        }
      }

      // Save to EEPROM
      console.log('[Navigation] Saving to EEPROM...');
      const eepromSuccess = await window.electronAPI.mspSaveEeprom();
      if (!eepromSuccess) {
        setError('Config sent but EEPROM save failed - changes may not persist');
        return;
      }

      console.log('[Navigation] Saved successfully');
      setModified(false);
    } catch (err) {
      console.error('[Navigation] Save error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
  };

  // Convert cm/s to m/s for display
  const toMs = (cms: number) => (cms / 100).toFixed(1);
  const fromMs = (ms: number) => Math.round(ms * 100);

  // Convert cm to m for display
  const toM = (cm: number) => (cm / 100).toFixed(0);
  const fromM = (m: number) => Math.round(m * 100);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mb-2 mx-auto" />
          <p className="text-gray-400">Loading navigation configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4 flex items-start gap-4">
        <span className="text-2xl">🧭</span>
        <div>
          <p className="text-blue-400 font-medium">Navigation Settings (iNav) — Autonomous Flight</p>
          <p className="text-sm text-zinc-400 mt-1">
            These settings control what happens when your aircraft flies <strong className="text-zinc-300">without your input</strong> —
            like flying home automatically or following a mission.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-zinc-500">
            <p><span className="text-green-400">🏠 RTH</span> — "Return To Home" flies back to where it took off</p>
            <p><span className="text-purple-400">📍 Waypoints</span> — Pre-planned GPS points the aircraft will fly to</p>
            <p><span className="text-amber-400">🛬 Landing</span> — How fast/slow it comes down after RTH</p>
            <p><span className="text-blue-400">🛰️ GPS</span> — Satellite settings (usually leave on Auto)</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* RTH Settings */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <span className="text-xl">🏠</span>
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Return to Home (RTH)</h3>
            <p className="text-xs text-zinc-500">What happens when RTH is triggered</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* RTH Altitude Mode */}
          <div className="space-y-3">
            <label className="text-xs text-zinc-400 block">RTH Altitude Mode</label>
            <div className="space-y-2">
              {Object.entries(NAV_RTH_ALT_MODE_NAMES).map(([value, info]) => (
                <label
                  key={value}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                    navConfig.rthAltControlMode === Number(value)
                      ? 'bg-green-500/20 border border-green-500/50'
                      : 'bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="rthAltMode"
                    value={value}
                    checked={navConfig.rthAltControlMode === Number(value)}
                    onChange={() => updateNavConfig({ rthAltControlMode: Number(value) })}
                    className="w-4 h-4 text-green-500"
                  />
                  <div>
                    <div className="text-sm text-white">{info.name}</div>
                    <div className="text-xs text-zinc-500">{info.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* RTH Altitude & Speeds */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">RTH Altitude (m)</label>
              <input
                type="number"
                value={toM(navConfig.rthAltitude ?? 3000)}
                onChange={(e) => updateNavConfig({ rthAltitude: fromM(Number(e.target.value)) })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                min={5}
                max={300}
              />
              <p className="text-[10px] text-zinc-600 mt-1">Used with Fixed/Max/At Least modes</p>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Max Navigation Speed (m/s)</label>
              <input
                type="number"
                value={toMs(navConfig.maxNavigationSpeed ?? 300)}
                onChange={(e) => updateNavConfig({ maxNavigationSpeed: fromMs(Number(e.target.value)) })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                min={0.5}
                max={20}
                step={0.5}
              />
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">Max Climb Rate (m/s)</label>
              <input
                type="number"
                value={toMs(navConfig.maxClimbRate ?? 500)}
                onChange={(e) => updateNavConfig({ maxClimbRate: fromMs(Number(e.target.value)) })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                min={0.5}
                max={10}
                step={0.5}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Landing Settings */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <span className="text-xl">🛬</span>
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Landing Configuration</h3>
            <p className="text-xs text-zinc-500">How the aircraft lands after RTH</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Descent Rate (m/s)</label>
            <input
              type="number"
              value={toMs(navConfig.landDescendRate ?? 200)}
              onChange={(e) => updateNavConfig({ landDescendRate: fromMs(Number(e.target.value)) })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              min={0.2}
              max={5}
              step={0.1}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Slower = softer landing</p>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Slowdown Min Alt (m)</label>
            <input
              type="number"
              value={toM(navConfig.landSlowdownMinAlt ?? 500)}
              onChange={(e) => updateNavConfig({ landSlowdownMinAlt: fromM(Number(e.target.value)) })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              min={1}
              max={50}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Start slowing at this alt</p>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Emergency Descent (m/s)</label>
            <input
              type="number"
              value={toMs(navConfig.emergencyDescentRate ?? 500)}
              onChange={(e) => updateNavConfig({ emergencyDescentRate: fromMs(Number(e.target.value)) })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              min={1}
              max={10}
              step={0.5}
            />
            <p className="text-[10px] text-zinc-600 mt-1">GPS loss descent rate</p>
          </div>
        </div>
      </div>

      {/* Waypoint Settings */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <span className="text-xl">📍</span>
          </div>
          <div>
            <h3 className="text-sm font-medium text-white">Waypoint Navigation</h3>
            <p className="text-xs text-zinc-500">Settings for mission waypoints</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Waypoint Radius (m)</label>
            <input
              type="number"
              value={toM(navConfig.waypointRadius ?? 100)}
              onChange={(e) => updateNavConfig({ waypointRadius: fromM(Number(e.target.value)) })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              min={0.5}
              max={20}
              step={0.5}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Waypoint considered reached within this radius</p>
          </div>

          <div>
            <label className="text-xs text-zinc-400 block mb-1.5">Safe Altitude (m)</label>
            <input
              type="number"
              value={toM(navConfig.waypointSafeAlt ?? 2000)}
              onChange={(e) => updateNavConfig({ waypointSafeAlt: fromM(Number(e.target.value)) })}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              min={5}
              max={200}
            />
            <p className="text-[10px] text-zinc-600 mt-1">Minimum safe altitude for missions</p>
          </div>
        </div>

        {/* Extended waypoint settings (via generic settings API) */}
        {wpSettingsSupported && (
          <>
            <div className="border-t border-zinc-700/50 pt-4 mt-4">
              <p className="text-xs text-zinc-500 mb-3">Advanced Mission Settings</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">Max Safe Distance (m)</label>
                  <input
                    type="number"
                    value={wpSettings.nav_wp_max_safe_distance}
                    onChange={(e) => updateWpSettings({ nav_wp_max_safe_distance: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                    min={0}
                    max={1500}
                    step={10}
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">Max distance from home (0 = disabled)</p>
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1.5">Mission Restart Mode</label>
                  <select
                    value={wpSettings.nav_wp_mission_restart}
                    onChange={(e) => updateWpSettings({ nav_wp_mission_restart: e.target.value })}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="START">Start from beginning</option>
                    <option value="RESUME">Resume from last WP</option>
                    <option value="SWITCH">Switch to next mission</option>
                  </select>
                  <p className="text-[10px] text-zinc-600 mt-1">What happens after RTH</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wpSettings.nav_wp_load_on_boot === 'ON'}
                  onChange={(e) => updateWpSettings({ nav_wp_load_on_boot: e.target.checked ? 'ON' : 'OFF' })}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-purple-500"
                />
                <span className="text-sm text-zinc-400">Load mission on boot</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wpSettings.nav_mc_wp_slowdown === 'ON'}
                  onChange={(e) => updateWpSettings({ nav_mc_wp_slowdown: e.target.checked ? 'ON' : 'OFF' })}
                  className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-purple-500"
                />
                <span className="text-sm text-zinc-400">Slowdown at waypoints (MC)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <select
                  value={wpSettings.nav_fw_wp_turn_smoothing}
                  onChange={(e) => updateWpSettings({ nav_fw_wp_turn_smoothing: e.target.value })}
                  className="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="OFF">Off</option>
                  <option value="ON">On</option>
                  <option value="ON-CUT">On + Cut throttle</option>
                </select>
                <span className="text-sm text-zinc-400">Turn smoothing (FW)</span>
              </label>
            </div>
          </>
        )}
      </div>

      {/* GPS Configuration */}
      {gpsConfig && (
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <span className="text-xl">🛰️</span>
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">GPS Configuration</h3>
              <p className="text-xs text-zinc-500">GPS module settings</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">GPS Provider</label>
              <select
                value={gpsConfig.provider}
                onChange={(e) => updateGpsConfig({ provider: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {Object.entries(GPS_PROVIDER_NAMES).map(([val, name]) => (
                  <option key={val} value={val}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-zinc-400 block mb-1.5">SBAS Mode</label>
              <select
                value={gpsConfig.sbasMode}
                onChange={(e) => updateGpsConfig({ sbasMode: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
              >
                {Object.entries(GPS_SBAS_NAMES).map(([val, name]) => (
                  <option key={val} value={val}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.autoConfig}
                onChange={(e) => updateGpsConfig({ autoConfig: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500"
              />
              <span className="text-sm text-zinc-400">Auto-configure GPS</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.autoBaud}
                onChange={(e) => updateGpsConfig({ autoBaud: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500"
              />
              <span className="text-sm text-zinc-400">Auto-detect baud rate</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.ubloxUseGalileo}
                onChange={(e) => updateGpsConfig({ ubloxUseGalileo: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500"
              />
              <span className="text-sm text-zinc-400">Enable Galileo (u-blox)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.homePointOnce}
                onChange={(e) => updateGpsConfig({ homePointOnce: e.target.checked })}
                className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-blue-500"
              />
              <span className="text-sm text-zinc-400">Set home once (don't update)</span>
            </label>
          </div>
        </div>
      )}

      {/* Safety Warning */}
      <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-start gap-4">
        <span className="text-2xl">⚠️</span>
        <div>
          <p className="text-amber-400 font-medium">Important Safety Notes</p>
          <ul className="text-sm text-zinc-400 mt-1 space-y-1 list-disc list-inside">
            <li>Always test RTH in an open area before relying on it</li>
            <li>Ensure RTH altitude is above all obstacles in your flying area</li>
            <li>Check GPS satellite count (8+) before autonomous flight</li>
            <li>Configure failsafe to RTH for added safety</li>
          </ul>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={loadConfig}
          className="px-4 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700"
        >
          Refresh
        </button>
        <button
          onClick={saveAll}
          disabled={!modified}
          className={`px-4 py-2 text-sm rounded-lg ${
            modified
              ? 'bg-blue-500 text-white hover:bg-blue-400'
              : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
          }`}
        >
          Save Navigation Config
        </button>
      </div>
    </div>
  );
}
