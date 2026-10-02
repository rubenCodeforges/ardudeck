/**
 * NavigationTab
 *
 * iNav Navigation configuration for autonomous flight.
 * RTH settings, waypoint navigation, GPS config.
 */

import { useState, useEffect, useCallback } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { pendingDraft, usePendingWritesStore } from '../../stores/msp-pending-writes-store';
import { INAV_NAV_NUMERIC_SETTINGS } from '@ardudeck/msp-ts';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { Compass, Home, PlaneLanding, MapPin, Satellite, AlertTriangle } from 'lucide-react';

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

const NAV_RTH_ALT_MODE_NAMES: Record<number, { nameKey: string; descriptionKey: string }> = {
  0: { nameKey: 'parameters:navigationTab.rthCurrent', descriptionKey: 'parameters:navigationTab.rthCurrentDesc' },
  1: { nameKey: 'parameters:navigationTab.rthExtra', descriptionKey: 'parameters:navigationTab.rthExtraDesc' },
  2: { nameKey: 'parameters:navigationTab.rthFixed', descriptionKey: 'parameters:navigationTab.rthFixedDesc' },
  3: { nameKey: 'parameters:navigationTab.rthMaximum', descriptionKey: 'parameters:navigationTab.rthMaximumDesc' },
  4: { nameKey: 'parameters:navigationTab.rthAtLeast', descriptionKey: 'parameters:navigationTab.rthAtLeastDesc' },
};

// INAV 9 has no NMEA driver; numbers follow msp-ts inav-nav-gps (renderer provider ids)
const GPS_PROVIDER_NAMES: Record<number, string> = {
  1: 'u-blox', // i18n-exempt
  2: 'MSP', // i18n-exempt
  3: 'parameters:navigationTab.gpsFake',
};

const GPS_SBAS_NAMES: Record<number, string> = {
  0: 'parameters:navigationTab.sbasAuto',
  1: 'parameters:navigationTab.sbasEgnos',
  2: 'parameters:navigationTab.sbasWaas',
  3: 'parameters:navigationTab.sbasMsas',
  4: 'parameters:navigationTab.sbasGagan',
  5: 'parameters:navigationTab.sbasNone',
  6: 'parameters:navigationTab.sbasSouthPan',
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

interface NavDraft {
  navConfig: Partial<MSPNavConfig>;
  gpsConfig: MSPGpsConfig | null;
  wpSettings: WaypointSettings;
  wpSettingsSupported: boolean;
}

const PENDING_ID = 'navigation';

async function writeNavigation(d: NavDraft): Promise<boolean> {
  if (!(await window.electronAPI.mspSetNavConfig(d.navConfig))) return false;
  if (d.gpsConfig && !(await window.electronAPI.mspSetGpsConfig(d.gpsConfig))) return false;
  if (d.wpSettingsSupported) {
    const ok = await window.electronAPI.mspSetSettings({ ...d.wpSettings });
    if (!ok) return false;
  }
  return true;
}

export default function NavigationTab() {
  const { t } = useTranslation();
  const draft = pendingDraft<NavDraft>(PENDING_ID);
  const [navConfig, setNavConfig] = useState<Partial<MSPNavConfig>>(draft?.navConfig ?? DEFAULT_NAV_CONFIG);
  const [gpsConfig, setGpsConfig] = useState<MSPGpsConfig | null>(draft?.gpsConfig ?? null);
  const [wpSettings, setWpSettings] = useState<WaypointSettings>(draft?.wpSettings ?? DEFAULT_WP_SETTINGS);
  const [wpSettingsSupported, setWpSettingsSupported] = useState(draft?.wpSettingsSupported ?? false);
  const [dirty, setDirty] = useState(!!draft);
  const [loading, setLoading] = useState(!draft);
  const [error, setError] = useState<string | null>(null);
  const [ranges, setRanges] = useState<Record<string, { min: number; max: number } | null>>({});

  // Input limits come from the FC itself, so a value it would refuse cannot be typed
  useEffect(() => {
    const names = [...Object.values(INAV_NAV_NUMERIC_SETTINGS), 'nav_wp_max_safe_distance'];
    void window.electronAPI.mspGetSettingRanges?.(names).then((r) => { if (r) setRanges(r); }).catch(() => undefined);
  }, []);

  /** FC range for a setting in display units (cm to m by default), else the given fallback. */
  const lim = (setting: string, fallback: [number, number], scale = 100) => {
    const r = ranges[setting];
    return r ? { min: r.min / scale, max: r.max / scale } : { min: fallback[0], max: fallback[1] };
  };

  useEffect(() => {
    if (!dirty) return;
    usePendingWritesStore.getState().put<NavDraft>(PENDING_ID, {
      label: t('parameters:navigationTab.pendingLabel'),
      draft: { navConfig, gpsConfig, wpSettings, wpSettingsSupported },
      write: writeNavigation,
    });
  }, [dirty, navConfig, gpsConfig, wpSettings, wpSettingsSupported, t]);

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
      setError(err instanceof Error ? err.message : t('parameters:navigationTab.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    // unsaved edits from before a tab switch stay on screen instead of the FC values
    if (!pendingDraft(PENDING_ID)) loadConfig();
  }, [loadConfig]);

  const refresh = () => {
    usePendingWritesStore.getState().drop(PENDING_ID);
    setDirty(false);
    void loadConfig();
  };

  // Update nav config
  const updateNavConfig = (updates: Partial<MSPNavConfig>) => {
    setNavConfig((prev) => ({ ...prev, ...updates }));
    setDirty(true);
  };

  // Update GPS config
  const updateGpsConfig = (updates: Partial<MSPGpsConfig>) => {
    if (gpsConfig) {
      setGpsConfig({ ...gpsConfig, ...updates });
      setDirty(true);
    }
  };

  // Update waypoint settings
  const updateWpSettings = (updates: Partial<WaypointSettings>) => {
    setWpSettings((prev) => ({ ...prev, ...updates }));
    setDirty(true);
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
          <p className="text-content-secondary">{t('parameters:navigationTab.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-blue-500/10 rounded-xl border-blue-500/30 p-4 flex items-start gap-4">
        <Compass className="w-6 h-6 text-blue-400" />
        <div>
          <p className="text-blue-400 font-medium">{t('parameters:navigationTab.headerTitle')}</p>
          <p className="text-sm text-content-secondary mt-1">
            <Trans i18nKey="parameters:navigationTab.headerDesc" components={{ b: <strong className="text-content" /> }} />
          </p>
          <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-content-secondary">
            <p><span className="text-green-400 inline-flex items-center gap-1"><Home className="w-3.5 h-3.5" /> {t('parameters:navigationTab.legendRth')}</span>: {t('parameters:navigationTab.legendRthDesc')}</p>
            <p><span className="text-purple-400 inline-flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {t('parameters:navigationTab.legendWaypoints')}</span>: {t('parameters:navigationTab.legendWaypointsDesc')}</p>
            <p><span className="text-amber-400 inline-flex items-center gap-1"><PlaneLanding className="w-3.5 h-3.5" /> {t('parameters:navigationTab.legendLanding')}</span>: {t('parameters:navigationTab.legendLandingDesc')}</p>
            <p><span className="text-blue-400 inline-flex items-center gap-1"><Satellite className="w-3.5 h-3.5" /> {t('parameters:navigationTab.legendGps')}</span>: {t('parameters:navigationTab.legendGpsDesc')}</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border-red-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
            ×
          </button>
        </div>
      )}

      {/* RTH Settings */}
      <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
            <Home className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">{t('parameters:navigationTab.rthTitle')}</h3>
            <p className="text-xs text-content-secondary">{t('parameters:navigationTab.rthDesc')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* RTH Altitude Mode */}
          <div className="space-y-3">
            <label className="text-xs text-content-secondary block">{t('parameters:navigationTab.rthAltMode')}</label>
            <div className="space-y-2">
              {Object.entries(NAV_RTH_ALT_MODE_NAMES).map(([value, info]) => (
                <label
                  key={value}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                    navConfig.rthAltControlMode === Number(value)
                      ? 'bg-green-500/20 border-green-500/50'
                      : 'bg-surface border hover:border'
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
                    <div className="text-sm text-content">{t(info.nameKey)}</div>
                    <div className="text-xs text-content-secondary">{t(info.descriptionKey)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* RTH Altitude & Speeds */}
          <div className="space-y-4">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.rthAltitude')}</label>
              <DraftNumberInput
                value={Number(toM(navConfig.rthAltitude ?? 3000))}
                onCommit={(v) => updateNavConfig({ rthAltitude: fromM(v) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                {...lim(INAV_NAV_NUMERIC_SETTINGS.rthAltitude, [5, 300])}
              />
              <p className="text-[10px] text-content-tertiary mt-1">{t('parameters:navigationTab.rthAltitudeHint')}</p>
            </div>

            <div>
              <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.maxNavSpeed')}</label>
              <DraftNumberInput
                value={Number(toMs(navConfig.maxNavigationSpeed ?? 300))}
                onCommit={(v) => updateNavConfig({ maxNavigationSpeed: fromMs(v) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                {...lim(INAV_NAV_NUMERIC_SETTINGS.maxNavigationSpeed, [0.5, 20])}
                step={0.5}
              />
            </div>

            <div>
              <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.maxClimbRate')}</label>
              <DraftNumberInput
                value={Number(toMs(navConfig.maxClimbRate ?? 500))}
                onCommit={(v) => updateNavConfig({ maxClimbRate: fromMs(v) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                {...lim(INAV_NAV_NUMERIC_SETTINGS.maxClimbRate, [0.5, 10])}
                step={0.5}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Landing Settings */}
      <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <PlaneLanding className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">{t('parameters:navigationTab.landingTitle')}</h3>
            <p className="text-xs text-content-secondary">{t('parameters:navigationTab.landingDesc')}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.descentRate')}</label>
            <DraftNumberInput
              value={Number(toMs(navConfig.landDescendRate ?? 200))}
              onCommit={(v) => updateNavConfig({ landDescendRate: fromMs(v) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              {...lim(INAV_NAV_NUMERIC_SETTINGS.landDescendRate, [0.2, 5])}
              step={0.1}
            />
            <p className="text-[10px] text-content-tertiary mt-1">{t('parameters:navigationTab.descentRateHint')}</p>
          </div>

          <div>
            <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.slowdownMinAlt')}</label>
            <DraftNumberInput
              value={Number(toM(navConfig.landSlowdownMinAlt ?? 500))}
              onCommit={(v) => updateNavConfig({ landSlowdownMinAlt: fromM(v) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              {...lim(INAV_NAV_NUMERIC_SETTINGS.landSlowdownMinAlt, [1, 50])}
            />
            <p className="text-[10px] text-content-tertiary mt-1">{t('parameters:navigationTab.slowdownMinAltHint')}</p>
          </div>

          <div>
            <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.emergencyDescent')}</label>
            <DraftNumberInput
              value={Number(toMs(navConfig.emergencyDescentRate ?? 500))}
              onCommit={(v) => updateNavConfig({ emergencyDescentRate: fromMs(v) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              {...lim(INAV_NAV_NUMERIC_SETTINGS.emergencyDescentRate, [1, 10])}
              step={0.5}
            />
            <p className="text-[10px] text-content-tertiary mt-1">{t('parameters:navigationTab.emergencyDescentHint')}</p>
          </div>
        </div>
      </div>

      {/* Waypoint Settings */}
      <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <MapPin className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">{t('parameters:navigationTab.wpTitle')}</h3>
            <p className="text-xs text-content-secondary">{t('parameters:navigationTab.wpDesc')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.wpRadius')}</label>
            <DraftNumberInput
              value={Number(toM(navConfig.waypointRadius ?? 100))}
              onCommit={(v) => updateNavConfig({ waypointRadius: fromM(v) })}
              className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              {...lim(INAV_NAV_NUMERIC_SETTINGS.waypointRadius, [0.5, 20])}
              step={0.5}
            />
            <p className="text-[10px] text-content-tertiary mt-1">{t('parameters:navigationTab.wpRadiusHint')}</p>
          </div>
        </div>

        {/* Extended waypoint settings (via generic settings API) */}
        {wpSettingsSupported && (
          <>
            <div className="border-t border-subtle pt-4 mt-4">
              <p className="text-xs text-content-secondary mb-3">{t('parameters:navigationTab.advancedMission')}</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.maxSafeDistance')}</label>
                  <DraftNumberInput
                    value={wpSettings.nav_wp_max_safe_distance}
                    onCommit={(v) => updateWpSettings({ nav_wp_max_safe_distance: v })}
                    className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                    {...lim('nav_wp_max_safe_distance', [0, 1500], 1)}
                    step={10}
                  />
                  <p className="text-[10px] text-content-tertiary mt-1">{t('parameters:navigationTab.maxSafeDistanceHint')}</p>
                </div>

                <div>
                  <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.missionRestart')}</label>
                  <select
                    value={wpSettings.nav_wp_mission_restart}
                    onChange={(e) => updateWpSettings({ nav_wp_mission_restart: e.target.value })}
                    className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
                  >
                    <option value="START">{t('parameters:navigationTab.restartStart')}</option>
                    <option value="RESUME">{t('parameters:navigationTab.restartResume')}</option>
                    <option value="SWITCH">{t('parameters:navigationTab.restartSwitch')}</option>
                  </select>
                  <p className="text-[10px] text-content-tertiary mt-1">{t('parameters:navigationTab.missionRestartHint')}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 mt-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wpSettings.nav_wp_load_on_boot === 'ON'}
                  onChange={(e) => updateWpSettings({ nav_wp_load_on_boot: e.target.checked ? 'ON' : 'OFF' })}
                  className="w-4 h-4 rounded border bg-surface-raised text-purple-500"
                />
                <span className="text-sm text-content-secondary">{t('parameters:navigationTab.loadOnBoot')}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wpSettings.nav_mc_wp_slowdown === 'ON'}
                  onChange={(e) => updateWpSettings({ nav_mc_wp_slowdown: e.target.checked ? 'ON' : 'OFF' })}
                  className="w-4 h-4 rounded border bg-surface-raised text-purple-500"
                />
                <span className="text-sm text-content-secondary">{t('parameters:navigationTab.mcSlowdown')}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <select
                  value={wpSettings.nav_fw_wp_turn_smoothing}
                  onChange={(e) => updateWpSettings({ nav_fw_wp_turn_smoothing: e.target.value })}
                  className="px-2 py-1 bg-surface-raised border rounded text-sm text-content focus:outline-none focus:border-blue-500"
                >
                  <option value="OFF">{t('common:off')}</option>
                  <option value="ON">{t('common:on')}</option>
                  <option value="ON-CUT">{t('parameters:navigationTab.turnCut')}</option>
                </select>
                <span className="text-sm text-content-secondary">{t('parameters:navigationTab.turnSmoothing')}</span>
              </label>
            </div>
          </>
        )}
      </div>

      {/* GPS Configuration */}
      {gpsConfig && (
        <div className="bg-surface rounded-xl border-subtle p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Satellite className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-content">{t('parameters:navigationTab.gpsTitle')}</h3>
              <p className="text-xs text-content-secondary">{t('parameters:navigationTab.gpsDesc')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.gpsProvider')}</label>
              <select
                value={gpsConfig.provider}
                onChange={(e) => updateGpsConfig({ provider: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              >
                {Object.entries(GPS_PROVIDER_NAMES).map(([val, name]) => (
                  <option key={val} value={val}>
                    {name.startsWith('parameters:') ? t(name) : name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-content-secondary block mb-1.5">{t('parameters:navigationTab.sbasMode')}</label>
              <select
                value={gpsConfig.sbasMode}
                onChange={(e) => updateGpsConfig({ sbasMode: Number(e.target.value) })}
                className="w-full px-3 py-2 bg-surface-raised border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
              >
                {Object.entries(GPS_SBAS_NAMES).map(([val, name]) => (
                  <option key={val} value={val}>
                    {t(name)}
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
                className="w-4 h-4 rounded border bg-surface-raised text-blue-500"
              />
              <span className="text-sm text-content-secondary">{t('parameters:navigationTab.gpsAutoConfig')}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.autoBaud}
                onChange={(e) => updateGpsConfig({ autoBaud: e.target.checked })}
                className="w-4 h-4 rounded border bg-surface-raised text-blue-500"
              />
              <span className="text-sm text-content-secondary">{t('parameters:navigationTab.gpsAutoBaud')}</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={gpsConfig.ubloxUseGalileo}
                onChange={(e) => updateGpsConfig({ ubloxUseGalileo: e.target.checked })}
                className="w-4 h-4 rounded border bg-surface-raised text-blue-500"
              />
              <span className="text-sm text-content-secondary">{t('parameters:navigationTab.gpsGalileo')}</span>
            </label>
          </div>
        </div>
      )}

      {/* Safety Warning */}
      <div className="bg-amber-500/10 rounded-xl border-amber-500/30 p-4 flex items-start gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-400" />
        <div>
          <p className="text-amber-400 font-medium">{t('parameters:navigationTab.safetyTitle')}</p>
          <ul className="text-sm text-content-secondary mt-1 space-y-1 list-disc list-inside">
            <li>{t('parameters:navigationTab.safety1')}</li>
            <li>{t('parameters:navigationTab.safety2')}</li>
            <li>{t('parameters:navigationTab.safety3')}</li>
            <li>{t('parameters:navigationTab.safety4')}</li>
          </ul>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-3">
        <button
          onClick={refresh}
          className="px-4 py-2 text-sm bg-surface-raised text-content rounded-lg hover:bg-surface-raised"
        >
          {dirty ? t('parameters:navigationTab.discardChanges') : t('common:refresh')}
        </button>
      </div>
    </div>
  );
}
