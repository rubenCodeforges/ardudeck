/**
 * PX4 SITL Tab
 *
 * Configuration and control panel for PX4 SITL simulator. Visually a sibling of
 * ArduPilotSitlTab, but PX4-appropriate: PX4 ships a single per-track bundle
 * (covering every airframe via PX4_SIM_MODEL) instead of per-frame binaries, so
 * there is no custom-frame catalog, no frame sync, and no ArduDeck sim-engine /
 * FlightGear / virtual-RC surfaces here. Physics come from a bundled backend
 * (jMAVSim by default) selected below.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { usePx4SitlStore } from '../../stores/px4-sitl-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { Px4VehicleType, Px4ReleaseTrack, Px4SimulatorBackend } from '../../../shared/ipc-channels';
import { getIpLocation } from '../../utils/ip-geolocation';
import { getElevation } from '../../utils/elevation-api';
import {
  altitudeValueFromMeters,
  toMetersFromAltitudeUnit,
  UNIT_LABELS,
} from '../../../shared/user-units.js';

/** Prefer the i18n key; falls back to the literal. */
function pxText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

// Inline SVG paths (24x24) so the tiles render identically to the ArduPilot tab.
// Copter/plane/rover reuse the ArduPilot tab's exact paths; VTOL uses a
// plane-takeoff glyph (lucide) to distinguish the transitioning airframe class.
const VEHICLE_TYPE_OPTIONS: Array<{ value: Px4VehicleType; label: string; labelKey: string; icon: string }> = [
  { value: 'copter', label: 'Copter', labelKey: 'sitl.px4.vehicle-type.copter', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { value: 'plane', label: 'Plane', labelKey: 'sitl.px4.vehicle-type.plane', icon: 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z' },
  { value: 'vtol', label: 'VTOL', labelKey: 'sitl.px4.vehicle-type.vtol', icon: 'M2 22h20M6.36 17.4 4 17l-2-4 1.1-.55a2 2 0 0 1 1.8 0l.17.1a2 2 0 0 0 1.8 0L8 12 5 6l.9-.45a2 2 0 0 1 2.09.2l4.02 3a2 2 0 0 0 2.1.2l4.19-2.06a2.41 2.41 0 0 1 1.73-.17L21 7a1.4 1.4 0 0 1 .87 1.99l-.38.76c-.23.46-.6.84-1.07 1.08L7.58 17.2a2 2 0 0 1-1.22.18Z' },
  { value: 'rover', label: 'Rover', labelKey: 'sitl.px4.vehicle-type.rover', icon: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z' },
];

// Physics backend bundled with the PX4 download. jMAVSim is the lightweight
// default; Gazebo needs a local install; "None" spawns the flight stack alone
// for a MAVLink-only link with no physics.
const SIMULATOR_OPTIONS: Array<{ value: Px4SimulatorBackend; label: string; labelKey: string; description: string; descriptionKey: string }> = [
  { value: 'jmavsim', label: 'jMAVSim', labelKey: 'sitl.px4.backend.jmavsim', description: 'Default, lightweight (needs Java)', descriptionKey: 'sitl.px4.backend.jmavsim-desc' },
  { value: 'gz', label: 'Gazebo (needs local install)', labelKey: 'sitl.px4.backend.gazebo', description: 'Higher-fidelity physics; requires Gazebo installed locally', descriptionKey: 'sitl.px4.backend.gazebo-desc' },
  { value: 'none', label: 'None (link only)', labelKey: 'sitl.px4.backend.none', description: 'Flight stack only, no physics backend', descriptionKey: 'sitl.px4.backend.none-desc' },
];

// One-click home presets. CMAC mirrors ArduPilot's canonical SITL home; the
// rest are well-known open spaces.
const HOME_PRESETS: Array<{ name: string; nameKey: string; lat: number; lng: number; alt: number; heading: number }> = [
  { name: 'CMAC (default)', nameKey: 'sitl.px4.home.preset.cmac', lat: -35.363262, lng: 149.165237, alt: 584, heading: 353 },
  { name: 'SF Bay', nameKey: 'sitl.px4.home.preset.sf-bay', lat: 37.8, lng: -122.4, alt: 0, heading: 270 },
  { name: 'Nevada Desert', nameKey: 'sitl.px4.home.preset.nevada', lat: 36.0, lng: -115.0, alt: 610, heading: 0 },
  { name: 'Swiss Alps', nameKey: 'sitl.px4.home.preset.alps', lat: 46.5, lng: 8.0, alt: 1800, heading: 90 },
];

const RELEASE_TRACK_OPTIONS: Array<{ value: Px4ReleaseTrack; label: string; labelKey: string; description: string; descriptionKey: string }> = [
  { value: 'stable', label: 'Stable', labelKey: 'sitl.px4.release.stable', description: 'Recommended for most users', descriptionKey: 'sitl.px4.release.stable-desc' },
  { value: 'beta', label: 'Beta', labelKey: 'sitl.px4.release.beta', description: 'Release candidates and testing', descriptionKey: 'sitl.px4.release.beta-desc' },
  { value: 'dev', label: 'Dev', labelKey: 'sitl.px4.release.dev', description: 'Latest development builds', descriptionKey: 'sitl.px4.release.dev-desc' },
];

export default function Px4SitlTab() {
  const { t } = useTranslation('views');
  const {
    vehicleType,
    releaseTrack,
    simulator,
    homeLocation,
    speedup,
    wipeOnStart,
    isRunning,
    isStarting,
    isStopping,
    binaryInfo,
    isDownloading,
    downloadProgress,
    platform,
    consoleLines,
    lastError,
    setVehicleType,
    setReleaseTrack,
    setSimulator,
    setHomeLocation,
    setSpeedup,
    setWipeOnStart,
    checkPlatform,
    checkBinary,
    download,
    start,
    stop,
    subscribeToEvents,
  } = usePx4SitlStore();

  const { connectionState } = useConnectionStore();
  const { unitPreferences, setPendingSitlSwitch } = useSettingsStore();
  const altitudeUnit = unitPreferences.altitude;
  const homeAltitudeDisplay = altitudeValueFromMeters(homeLocation.alt, altitudeUnit);
  const [homeAltitudeDraft, setHomeAltitudeDraft] = useState(() => String(Number(homeAltitudeDisplay.toFixed(altitudeUnit === 'km' ? 3 : 1))));
  const [homeAltitudeFocused, setHomeAltitudeFocused] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);

  // Geolocation state
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isMatchingTerrain, setIsMatchingTerrain] = useState(false);

  useEffect(() => {
    if (!homeAltitudeFocused) {
      setHomeAltitudeDraft(String(Number(homeAltitudeDisplay.toFixed(altitudeUnit === 'km' ? 3 : 1))));
    }
  }, [altitudeUnit, homeAltitudeDisplay, homeAltitudeFocused]);

  // Resolve the user's approximate location via IP geolocation, then look up the
  // real ground elevation so the flat-plane home altitude matches real terrain.
  const getCurrentLocation = useCallback(async () => {
    setIsGettingLocation(true);
    setLocationError(null);
    try {
      const loc = await getIpLocation();
      if (loc.source === 'default') {
        setLocationError(t('sitl.px4.location.error-determine'));
        return;
      }
      const lat = Math.round(loc.lat * 10000) / 10000;
      const lng = Math.round(loc.lon * 10000) / 10000;
      const elevation = await getElevation(lat, lng).catch(() => null);
      setHomeLocation({
        lat,
        lng,
        // Prefer the real ground elevation; on lookup failure keep the previous
        // alt rather than coercing to 0 (which can spawn planes airborne).
        alt: elevation ?? homeLocation.alt,
        heading: homeLocation.heading,
      });
    } catch {
      setLocationError(t('sitl.px4.location.error-get'));
    } finally {
      setIsGettingLocation(false);
    }
  }, [setHomeLocation, homeLocation.alt, homeLocation.heading, t]);

  /** Re-fetch real elevation for the CURRENT lat/lng without touching lat/lng. */
  const matchTerrainElevation = useCallback(async () => {
    setIsMatchingTerrain(true);
    setLocationError(null);
    try {
      const elevation = await getElevation(homeLocation.lat, homeLocation.lng);
      if (elevation === null) {
        setLocationError(t('sitl.px4.location.error-terrain'));
        return;
      }
      setHomeLocation({ ...homeLocation, alt: elevation });
    } catch {
      setLocationError(t('sitl.px4.location.error-terrain'));
    } finally {
      setIsMatchingTerrain(false);
    }
  }, [setHomeLocation, homeLocation, t]);

  // Subscribe to process events and reconcile platform + bundle status on mount.
  useEffect(() => {
    checkPlatform();
    const cleanup = subscribeToEvents();
    return cleanup;
  }, [subscribeToEvents, checkPlatform]);

  // Re-check the bundle when the release track changes (bundle is per-track).
  useEffect(() => {
    checkBinary();
  }, [releaseTrack, checkBinary]);

  // When PX4 SITL comes up, flag the connection panel to switch to UDP 14550 and
  // auto-connect, matching how the ArduPilot tab hands off to TCP 5760.
  useEffect(() => {
    if (isRunning) setPendingSitlSwitch(true);
  }, [isRunning, setPendingSitlSwitch]);

  // Auto-scroll console output to the bottom.
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [consoleLines]);

  const platformBlocked = Boolean(platform && !platform.supported);

  return (
    <div className="flex flex-col gap-4">
      {/* No header here: SitlView already renders the "SITL Simulator" title,
          the firmware toggle, and the running/stopped pill above the tab, same
          as the ArduPilot tab. */}

      {/* Platform error banner */}
      {platformBlocked && platform?.error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-red-400">{t('sitl.px4.platform-error')}</h3>
              <p className="text-xs text-red-300/80 mt-1">{platform.error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Type Selection */}
      <div className="bg-surface-input border border-subtle rounded-xl p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content">{t('sitl.px4.vehicle-type.title')}</h3>
            <p className="text-xs text-content-secondary">{t('sitl.px4.vehicle-type.subtitle')}</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {VEHICLE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setVehicleType(opt.value)}
              disabled={isRunning || isStarting}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                vehicleType === opt.value
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                  : 'bg-surface border text-content-secondary hover:bg-surface hover:text-content'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
              </svg>
              <span className="text-xs font-medium">{pxText(t, opt.labelKey, opt.label)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Physics/Backend & Home/Scenarios row */}
      <div className="grid grid-cols-2 gap-4 items-start">
        {/* Physics & Backend */}
        <div className="bg-surface-input border border-subtle rounded-xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-content">{t('sitl.px4.physics.title')}</h3>
              <p className="text-xs text-content-secondary">{t('sitl.px4.physics.subtitle')}</p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Simulator backend */}
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('sitl.px4.backend.label')}</label>
              <div className="grid grid-cols-1 gap-1">
                {SIMULATOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setSimulator(opt.value)}
                    disabled={isRunning || isStarting}
                    className={`flex items-center justify-between px-3 py-2 text-xs rounded-lg border transition-colors ${
                      simulator === opt.value
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                        : 'bg-surface border text-content-secondary hover:bg-surface hover:text-content'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={pxText(t, opt.descriptionKey, opt.description)}
                  >
                    <span className="font-medium">{pxText(t, opt.labelKey, opt.label)}</span>
                    {opt.value === 'jmavsim' && (
                      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-blue-500/15 text-blue-300">{t('sitl.px4.backend.recommended')}</span>
                    )}
                  </button>
                ))}
              </div>
              {/* jMAVSim runs on the JVM. We surface the requirement rather than
                  blocking start, since Java may be present but undetectable. */}
              {simulator === 'jmavsim' && platform?.needsJava && (
                <p className="mt-1.5 text-[10px] text-content-tertiary leading-tight">
                  {t('sitl.px4.backend.java-hint')}
                </p>
              )}
            </div>

            {/* Release Track */}
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('sitl.px4.release.label')}</label>
              <div className="grid grid-cols-3 gap-1">
                {RELEASE_TRACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setReleaseTrack(opt.value)}
                    disabled={isRunning || isStarting}
                    className={`px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                      releaseTrack === opt.value
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                        : 'bg-surface border text-content-secondary hover:bg-surface'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={pxText(t, opt.descriptionKey, opt.description)}
                  >
                    {pxText(t, opt.labelKey, opt.label)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Home & Scenarios */}
        <div className="bg-surface-input border border-subtle rounded-xl p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-content">{t('sitl.px4.home.title')}</h3>
              <p className="text-xs text-content-secondary">{t('sitl.px4.home.subtitle')}</p>
            </div>
          </div>

          {/* Scenario presets — populate the home fields below */}
          <div className="mb-4">
            <label className="block text-xs text-content-secondary mb-1.5">{t('sitl.px4.home.scenario-presets')}</label>
            <div className="grid grid-cols-2 gap-2">
              {HOME_PRESETS.map((p) => {
                const active =
                  Math.abs(homeLocation.lat - p.lat) < 1e-4 && Math.abs(homeLocation.lng - p.lng) < 1e-4;
                return (
                  <button
                    key={p.name}
                    onClick={() => setHomeLocation({ lat: p.lat, lng: p.lng, alt: p.alt, heading: p.heading })}
                    disabled={isRunning || isStarting}
                    data-tip={`${p.lat.toFixed(4)}, ${p.lng.toFixed(4)} · ${p.alt}m`}
                    className={`px-2 py-2 text-xs rounded-lg border transition-colors ${
                      active
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                        : 'bg-surface border text-content-secondary hover:bg-surface hover:text-content'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {pxText(t, p.nameKey, p.name)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Home location fields — populated by presets above */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('sitl.px4.home.latitude')}</label>
              <DraftNumberInput
                step="0.0001"
                min={-90}
                max={90}
                value={homeLocation.lat}
                onCommit={(v) => setHomeLocation({ ...homeLocation, lat: v })}
                disabled={isRunning || isStarting}
                className="w-full px-2 py-1.5 text-sm bg-surface-raised text-content border border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('sitl.px4.home.longitude')}</label>
              <DraftNumberInput
                step="0.0001"
                min={-180}
                max={180}
                value={homeLocation.lng}
                onCommit={(v) => setHomeLocation({ ...homeLocation, lng: v })}
                disabled={isRunning || isStarting}
                className="w-full px-2 py-1.5 text-sm bg-surface-raised text-content border border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('sitl.px4.home.altitude')}</label>
              <div className="relative">
                <input
                  type="number"
                  value={homeAltitudeDraft}
                  onFocus={() => setHomeAltitudeFocused(true)}
                  onChange={(e) => {
                    const next = e.target.value;
                    setHomeAltitudeDraft(next);
                    if (next.trim() === '') return;
                    const displayValue = Number(next);
                    if (!Number.isFinite(displayValue)) return;
                    setHomeLocation({ ...homeLocation, alt: toMetersFromAltitudeUnit(displayValue, altitudeUnit) });
                  }}
                  onBlur={() => {
                    setHomeAltitudeFocused(false);
                    const displayValue = Number(homeAltitudeDraft);
                    if (homeAltitudeDraft.trim() === '' || !Number.isFinite(displayValue)) {
                      setHomeAltitudeDraft(String(Number(homeAltitudeDisplay.toFixed(altitudeUnit === 'km' ? 3 : 1))));
                      return;
                    }
                    if (displayValue === Number(homeAltitudeDisplay.toFixed(altitudeUnit === 'km' ? 3 : 1))) return;
                    setHomeLocation({ ...homeLocation, alt: toMetersFromAltitudeUnit(displayValue, altitudeUnit) });
                  }}
                  step={altitudeUnit === 'km' ? 0.001 : 1}
                  disabled={isRunning || isStarting}
                  className="w-full px-2 pr-10 py-1.5 text-sm bg-surface-raised text-content border border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-content-secondary pointer-events-none">
                  {UNIT_LABELS.altitude[altitudeUnit]}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-content-secondary mb-1">{t('sitl.px4.home.heading')}</label>
              <DraftNumberInput
                value={homeLocation.heading}
                onCommit={(v) => setHomeLocation({ ...homeLocation, heading: v })}
                disabled={isRunning || isStarting}
                min={0}
                max={359}
                className="w-full px-2 py-1.5 text-sm bg-surface-raised text-content border border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <p className="text-xs text-content-tertiary">{t('sitl.px4.home.default-preset')}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => void matchTerrainElevation()}
                disabled={isRunning || isStarting || isMatchingTerrain}
                data-tip={t('sitl.px4.home.match-terrain-tip')}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isMatchingTerrain ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('sitl.px4.home.matching')}
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 001.7-9.7 6 6 0 00-11.6-1.5A4.5 4.5 0 003 15z" />
                    </svg>
                    {t('sitl.px4.home.match-terrain')}
                  </>
                )}
              </button>
              <button
                onClick={getCurrentLocation}
                disabled={isRunning || isStarting || isGettingLocation}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGettingLocation ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {t('sitl.px4.home.getting')}
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {t('sitl.px4.home.use-my-location')}
                  </>
                )}
              </button>
            </div>
          </div>
          {locationError && (
            <p className="mt-2 text-xs text-red-400">{locationError}</p>
          )}
        </div>
      </div>

      {/* Run — launch settings + bundle status + start/stop */}
      <div className="bg-surface-input border border-subtle rounded-xl p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content">{t('sitl.px4.run.title')}</h3>
            <p className="text-xs text-content-secondary">{t('sitl.px4.run.subtitle')}</p>
          </div>
        </div>

        {/* Launch settings strip */}
        <div className="flex items-end gap-4 mb-4 flex-wrap">
          <div className="w-28">
            <label
              className="flex items-center gap-1 text-xs text-content-secondary mb-1 cursor-help"
              data-tip={t('sitl.px4.run.sim-speed-tip')}
            >
              {t('sitl.px4.run.sim-speed')}
              <svg className="w-3 h-3 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </label>
            <div className="relative">
              <DraftNumberInput
                value={speedup}
                integer
                onCommit={setSpeedup}
                disabled={isRunning || isStarting}
                min={1}
                max={10}
                className="w-full px-2 py-1.5 pr-6 text-sm bg-surface-raised text-content border border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-content-tertiary pointer-events-none">x</span>
            </div>
          </div>
          <label className="flex items-center gap-2 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={wipeOnStart}
              onChange={(e) => setWipeOnStart(e.target.checked)}
              disabled={isRunning || isStarting}
              className="w-4 h-4 rounded border bg-surface-raised text-blue-500 focus:ring-blue-500/50"
            />
            <span className="text-xs text-content-secondary">{t('sitl.px4.run.wipe-params')}</span>
          </label>
        </div>

        {/* Bundle status + start/stop */}
        <div className="flex items-center justify-between rounded-lg border border-subtle bg-surface px-3 py-3">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${binaryInfo?.exists ? 'bg-green-400' : 'bg-amber-400'}`} />
            <div>
              <span className="text-sm text-content">
                {vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1)} ({releaseTrack})
              </span>
              <p className="text-xs text-content-secondary">
                {!binaryInfo?.exists
                  ? t('sitl.px4.run.bundle-missing')
                  : t('sitl.px4.run.ready-at', { name: binaryInfo.path?.split('/').pop() })}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!binaryInfo?.exists && !isDownloading && (
              <button
                onClick={download}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
              >
                {t('sitl.px4.run.download')}
              </button>
            )}

            {isDownloading && downloadProgress && (
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-surface-inset rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${downloadProgress.progress}%` }}
                  />
                </div>
                <span className="text-xs text-content-secondary">{downloadProgress.progress}%</span>
              </div>
            )}

            {/* Start/Stop */}
            {binaryInfo?.exists && (
              !isRunning ? (
                <button
                  onClick={start}
                  disabled={isStarting || platformBlocked || connectionState.isConnected}
                  data-tip={platformBlocked ? platform?.error : undefined}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isStarting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('sitl.px4.run.starting')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                      </svg>
                      {t('sitl.px4.run.start')}
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={stop}
                  disabled={isStopping}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isStopping ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {t('sitl.px4.run.stopping')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      {t('sitl.px4.run.stop')}
                    </>
                  )}
                </button>
              )
            )}
          </div>
        </div>

        {/* Platform-blocked hint */}
        {platformBlocked && platform?.error && (
          <div className="mt-3 text-xs text-rose-400">{platform.error}</div>
        )}
      </div>

      {/* Connection hint */}
      {isRunning && !connectionState.isConnected && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-300">
            <span className="font-medium">{t('sitl.px4.hint.running-title')}</span>{' '}
            {t('sitl.px4.hint.connect-via')} <code className="px-1.5 py-0.5 bg-blue-500/20 rounded text-blue-200 font-mono">127.0.0.1:14550</code>
          </div>
        </div>
      )}

      {/* Error display */}
      {lastError && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-red-300">{lastError}</div>
        </div>
      )}

      {/* Console output — shown when running or output exists */}
      {(isRunning || consoleLines.length > 0) && (
        <div className="flex-1 flex flex-col overflow-hidden bg-surface-input border border-subtle rounded-lg min-h-[200px]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-subtle bg-surface-input">
            <span className="text-xs font-medium text-content-secondary">{t('sitl.px4.output.heading')}</span>
          </div>
          <div
            ref={outputRef}
            className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed max-h-[300px]"
          >
            {consoleLines.length === 0 ? (
              <div className="text-content-tertiary italic">
                {t('sitl.px4.output.empty')}
              </div>
            ) : (
              consoleLines.map((line, idx) => (
                <div
                  key={idx}
                  className={
                    line.includes('ERROR') || line.includes('error')
                      ? 'text-red-400'
                      : line.startsWith('---')
                        ? 'text-blue-400 font-medium'
                        : line.includes('PX4') || line.includes('INFO')
                          ? 'text-green-400'
                          : 'text-content'
                  }
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
