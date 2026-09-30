/**
 * SITL View
 *
 * Main view for SITL (Software-In-The-Loop) simulation.
 * Supports both iNav SITL (MSP) and ArduPilot SITL (MAVLink).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSitlStore } from '../../stores/sitl-store';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import { usePx4SitlStore } from '../../stores/px4-sitl-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import ArduPilotSitlTab from './ArduPilotSitlTab';
import Px4SitlTab from './Px4SitlTab';
import type { VirtualRCState } from '../../../shared/ipc-channels';

/** Prefer the i18n key; falls back to the literal. */
function sText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

type SitlTab = 'inav' | 'ardupilot' | 'px4';

// Aircraft options for FlightGear
const AIRCRAFT_OPTIONS = [
  { value: 'c172p', label: 'Cessna 172P', description: 'Classic trainer aircraft' },
  { value: 'c182s', label: 'Cessna 182S', description: 'High-performance single' },
  { value: 'pa28-161', label: 'Piper Cherokee', description: 'Popular trainer' },
  { value: 'ufo', label: 'UFO', description: 'For testing (instant response)' },
];

// Common airports
const AIRPORT_OPTIONS = [
  { value: 'KSFO', label: 'San Francisco (KSFO)', labelKey: 'sitl.view.airport.ksfo' },
  { value: 'KLAX', label: 'Los Angeles (KLAX)', labelKey: 'sitl.view.airport.klax' },
  { value: 'KJFK', label: 'New York JFK (KJFK)', labelKey: 'sitl.view.airport.kjfk' },
  { value: 'EGLL', label: 'London Heathrow (EGLL)', labelKey: 'sitl.view.airport.egll' },
  { value: 'LFPG', label: 'Paris CDG (LFPG)', labelKey: 'sitl.view.airport.lfpg' },
];

export default function SitlView() {
  const { t } = useTranslation('views');
  const {
    isRunning,
    isStarting,
    isStopping,
    isStatusChecked,
    output,
    profiles,
    currentProfileName,
    lastError,
    lastCommand,
    startSitl,
    stopSitl,
    clearOutput,
    selectProfile,
    createProfile,
    deleteProfile,
    getCurrentProfile,
    initListeners,
    checkStatus,
    // Visual simulator state
    detectedSimulators,
    selectedSimulator,
    setSelectedSimulator,
    // FlightGear
    isFlightGearRunning,
    isFlightGearStarting,
    flightGearError,
    customFlightGearPath,
    flightGearConfig,
    setCustomFlightGearPath,
    browseFlightGear,
    setFlightGearConfig,
    // X-Plane
    isXPlaneRunning,
    isXPlaneStarting,
    xplaneError,
    customXPlanePath,
    setCustomXPlanePath,
    browseXPlane,
    // Bridge (FlightGear only)
    isBridgeRunning,
    // Combined
    launchWithSimulator,
    stopWithSimulator,
    // Legacy compat
    simulatorEnabled,
    setSimulatorEnabled,
  } = useSitlStore();

  const { connectionState } = useConnectionStore();
  const { setPendingSitlSwitch } = useSettingsStore();
  const ardupilotSitlStore = useArduPilotSitlStore();
  const px4SitlStore = usePx4SitlStore();
  const outputRef = useRef<HTMLDivElement>(null);
  // Remember the last-used firmware tab across sessions; a PX4 user should
  // not land on ArduPilot every time they open the view.
  const [activeTab, setActiveTab] = useState<SitlTab>(() => {
    try {
      const saved = localStorage.getItem('ardudeck.sitlTab');
      return saved === 'inav' || saved === 'ardupilot' || saved === 'px4' ? saved : 'ardupilot';
    } catch {
      return 'ardupilot';
    }
  });
  useEffect(() => {
    try { localStorage.setItem('ardudeck.sitlTab', activeTab); } catch { /* non-fatal */ }
  }, [activeTab]);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDesc, setNewProfileDesc] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Virtual RC state for SIM receiver control
  const [virtualRC, setVirtualRC] = useState<VirtualRCState>({
    roll: 0,
    pitch: 0,
    yaw: 0,
    throttle: -1,  // Minimum for safety
    aux1: 0,
    aux2: 0,
    aux3: 0,
    aux4: 0,
  });

  // GPS MSP sender state (for gps_provider=MSP)
  const [gpsSenderEnabled, setGpsSenderEnabled] = useState(false);

  // Load virtual RC state when bridge is running
  useEffect(() => {
    if (isBridgeRunning) {
      window.electronAPI.virtualRCGet().then(setVirtualRC);
    }
  }, [isBridgeRunning]);

  // Update virtual RC value
  const updateVirtualRC = useCallback(async (key: keyof VirtualRCState, value: number) => {
    const newState = { ...virtualRC, [key]: value };
    setVirtualRC(newState);
    await window.electronAPI.virtualRCSet({ [key]: value });
  }, [virtualRC]);

  // Reset virtual RC to defaults
  const resetVirtualRC = useCallback(async () => {
    await window.electronAPI.virtualRCReset();
    const state = await window.electronAPI.virtualRCGet();
    setVirtualRC(state);
  }, []);

  // Convert normalized value (-1 to +1) to PWM (1000-2000)
  const normalizedToPWM = (value: number): number => {
    return Math.round(1500 + (value * 500));
  };

  // Initialize listeners and check status on mount
  useEffect(() => {
    checkStatus();
    const cleanup = initListeners();
    return cleanup;
  }, [initListeners, checkStatus]);

  // Switch connection panel to TCP when SITL starts
  useEffect(() => {
    if (isRunning) {
      // Set flag to tell ConnectionPanel to switch to TCP
      setPendingSitlSwitch(true);
    }
  }, [isRunning, setPendingSitlSwitch]);

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleCreateProfile = () => {
    if (newProfileName.trim()) {
      createProfile(newProfileName.trim(), newProfileDesc.trim() || undefined);
      setNewProfileName('');
      setNewProfileDesc('');
      setShowNewProfile(false);
    }
  };

  const handleDeleteProfile = async () => {
    const profile = getCurrentProfile();
    if (profile && !profile.isStandard) {
      await deleteProfile(profile.name);
      setShowDeleteConfirm(false);
    }
  };

  const currentProfile = getCurrentProfile();
  const canDelete = currentProfile && !currentProfile.isStandard;

  // Determine if any SITL is running
  const anyRunning = isRunning || ardupilotSitlStore.isRunning || px4SitlStore.isRunning;
  const activeRunningTab = isRunning ? 'inav' : ardupilotSitlStore.isRunning ? 'ardupilot' : px4SitlStore.isRunning ? 'px4' : null;

  return (
    <div className="h-full flex flex-col bg-surface-base">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <div className="flex items-center gap-3">
          {/* SITL icon */}
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-content">{t('sitl.view.title')}</h1>
            <p className="text-xs text-content-secondary">
              {t('sitl.view.subtitle')}
            </p>
          </div>
        </div>

        {/* Tab switcher. A tab locks while a DIFFERENT sim is running (they share
            MAVLink/MSP ports and would collide), so you must stop the running one
            before switching. */}
        <div className="flex items-center gap-1 bg-surface-input border border-subtle rounded-lg p-1">
            <button
              onClick={() => setActiveTab('inav')}
              disabled={anyRunning && activeRunningTab !== 'inav'}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'inav'
                  ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                  : 'text-content-secondary hover:text-content hover:bg-surface'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={anyRunning && activeRunningTab !== 'inav' ? t('sitl.view.tab.locked-tooltip') : undefined}
            >
              iNav (MSP)
            </button>
            <button
              onClick={() => setActiveTab('ardupilot')}
              disabled={anyRunning && activeRunningTab !== 'ardupilot'}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'ardupilot'
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  : 'text-content-secondary hover:text-content hover:bg-surface'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={anyRunning && activeRunningTab !== 'ardupilot' ? t('sitl.view.tab.locked-tooltip') : undefined}
            >
              ArduPilot (MAVLink)
            </button>
            <button
              onClick={() => setActiveTab('px4')}
              disabled={anyRunning && activeRunningTab !== 'px4'}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeTab === 'px4'
                  ? 'bg-teal-500/20 text-teal-400 border border-teal-500/30'
                  : 'text-content-secondary hover:text-content hover:bg-surface'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
              title={anyRunning && activeRunningTab !== 'px4' ? t('sitl.view.tab.locked-tooltip') : undefined}
            >
              PX4 (MAVLink)
            </button>
          </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            anyRunning
              ? 'bg-green-500/10 text-green-400 border border-green-500/30'
              : 'bg-surface-raised text-content-secondary border border'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              anyRunning ? 'bg-green-400' : 'bg-zinc-500'
            }`} />
            {anyRunning
              ? t('sitl.view.status.running', { name: activeRunningTab === 'inav' ? 'iNav' : activeRunningTab === 'px4' ? 'PX4' : 'ArduPilot' })
              : t('sitl.view.status.stopped')}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-y-auto p-4 gap-4">
        {/* ArduPilot SITL Tab */}
        {activeTab === 'ardupilot' && <ArduPilotSitlTab />}

        {/* PX4 SITL Tab */}
        {activeTab === 'px4' && <Px4SitlTab />}

        {/* iNav SITL Tab */}
        {activeTab === 'inav' && (
          <>
        {/* Profile selection card */}
        <div className="bg-surface-input border border-subtle rounded-lg p-4">
          <div className="flex items-start gap-4">
            {/* Profile info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <label className="text-sm font-medium text-content">{t('sitl.view.profile.label')}</label>
                <select
                  value={currentProfileName ?? ''}
                  onChange={(e) => selectProfile(e.target.value)}
                  disabled={isRunning || isStarting}
                  className="px-3 py-1.5 bg-surface-raised text-content text-sm border border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
                >
                  {profiles.map((profile) => (
                    <option key={profile.name} value={profile.name}>
                      {profile.name} {profile.isStandard ? '' : t('sitl.view.profile.custom-suffix')}
                    </option>
                  ))}
                </select>

                {/* New profile button */}
                <button
                  onClick={() => setShowNewProfile(true)}
                  disabled={isRunning || isStarting}
                  className="px-2 py-1.5 text-xs font-medium text-content bg-surface-raised hover:bg-surface-raised border border rounded-lg transition-colors disabled:opacity-50"
                  title={t('sitl.view.profile.create-tooltip')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>

                {/* Delete profile button */}
                {canDelete && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isRunning || isStarting}
                    className="px-2 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                    title={t('sitl.view.profile.delete-tooltip')}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Profile description */}
              {currentProfile && (
                <div className="text-xs text-content-secondary mb-3">
                  {currentProfile.description || t('sitl.view.profile.default-description')}
                </div>
              )}

              {/* What is a profile? */}
              <div className="text-xs text-content-tertiary border-t border-subtle pt-3">
                <span className="text-content-secondary">{t('sitl.view.profile.what-is-title')}</span>{' '}
                {t('sitl.view.profile.what-is-body')}
              </div>
            </div>

            {/* Start/Stop buttons */}
            <div className="flex flex-col gap-2">
              {!isRunning ? (
                <button
                  onClick={launchWithSimulator}
                  disabled={!isStatusChecked || isStarting || isFlightGearStarting || connectionState.isConnected}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {!isStatusChecked ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('sitl.view.action.checking')}
                    </>
                  ) : isStarting || isFlightGearStarting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('sitl.view.action.starting')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {simulatorEnabled ? t('sitl.view.action.launch-simulation') : t('sitl.view.action.start-sitl')}
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={stopWithSimulator}
                  disabled={isStopping}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isStopping ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('sitl.view.action.stopping')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      {simulatorEnabled ? t('sitl.view.action.stop-simulation') : t('sitl.view.action.stop-sitl')}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Visual Simulator Section */}
        <div className="bg-surface-input border border-subtle rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              <h3 className="text-sm font-medium text-content">{t('sitl.view.simulator.heading')}</h3>
            </div>

            {/* Simulator selection dropdown - temporarily disabled */}
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded">
                {t('sitl.view.simulator.coming-soon')}
              </span>
              <select
                value="none"
                onChange={(e) => setSelectedSimulator(e.target.value as 'flightgear' | 'xplane' | 'none')}
                disabled={true}
                className="px-2 py-1 text-xs bg-surface-raised text-content border border rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="none">{t('sitl.view.simulator.none')}</option>
                <option value="xplane">{t('sitl.view.simulator.xplane-recommended')}</option>
                <option value="flightgear">FlightGear</option>
              </select>
            </div>
          </div>

          {/* Simulator-specific content */}
          {selectedSimulator !== 'none' && (
            <>
              {/* X-Plane Config */}
              {selectedSimulator === 'xplane' && (() => {
                const xplane = detectedSimulators.find((s) => s.name === 'xplane');
                const isInstalled = xplane?.installed ?? false;

                return (
                  <>
                    {/* Detection status row */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isInstalled ? 'bg-green-400' : 'bg-amber-400'}`} />
                        <span className="text-xs text-content-secondary">
                          {isInstalled ? (
                            <>{t('sitl.view.xplane.detected')}{xplane?.version ? ` (v${xplane.version})` : ''}</>
                          ) : (
                            <>
                              {t('sitl.view.xplane.not-found')}{' '}
                              <a href="https://www.x-plane.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                                {t('sitl.view.xplane.get')}
                              </a>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={browseXPlane} disabled={isRunning} className="px-2 py-1 text-xs text-content bg-surface-raised hover:bg-surface-raised border border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          {t('sitl.view.action.browse')}
                        </button>
                        {customXPlanePath && (
                          <button onClick={() => setCustomXPlanePath(null)} disabled={isRunning} className="px-2 py-1 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            {t('sitl.view.action.clear')}
                          </button>
                        )}
                      </div>
                    </div>

                    {customXPlanePath && (
                      <div className="mb-3 px-2 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-300">
                        <span className="text-blue-400">{t('sitl.view.custom-path')}</span>{' '}
                        <span className="font-mono text-blue-200 break-all">{customXPlanePath}</span>
                      </div>
                    )}

                    {/* X-Plane setup instructions */}
                    <div className="p-3 bg-surface border border rounded text-xs text-content-secondary mb-3">
                      <div className="font-medium text-content mb-2">{t('sitl.view.xplane.setup-heading')}</div>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>{t('sitl.view.xplane.step-output')}</li>
                        <li>{t('sitl.view.xplane.step-send-to')} <span className="font-mono text-blue-300">127.0.0.1:49000</span></li>
                        <li>{t('sitl.view.xplane.step-enable')}</li>
                      </ol>
                    </div>

                    {/* Running status */}
                    {(isXPlaneRunning || isXPlaneStarting) && (
                      <div className="flex items-center gap-2 mb-3">
                        <div className={`w-2 h-2 rounded-full ${isXPlaneRunning ? 'bg-green-400' : 'bg-amber-400'}`} />
                        <span className="text-xs text-content-secondary">{isXPlaneStarting ? t('sitl.view.xplane.starting') : t('sitl.view.xplane.running')}</span>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* FlightGear Config */}
              {selectedSimulator === 'flightgear' && (() => {
                const flightGear = detectedSimulators.find((s) => s.name === 'flightgear');
                const isInstalled = flightGear?.installed ?? false;

                return (
                  <>
                    {/* Detection status row */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isInstalled ? 'bg-green-400' : 'bg-amber-400'}`} />
                        <span className="text-xs text-content-secondary">
                          {isInstalled ? (
                            <>{t('sitl.view.flightgear.detected')}{flightGear?.path ? ` at ${flightGear.path}` : ''}</>
                          ) : (
                            <>
                              {t('sitl.view.flightgear.not-found')}{' '}
                              <a href="https://www.flightgear.org/download/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline">
                                {t('sitl.view.flightgear.download')}
                              </a>
                            </>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={browseFlightGear} disabled={isRunning} className="px-2 py-1 text-xs text-content bg-surface-raised hover:bg-surface-raised border border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                          {t('sitl.view.action.browse')}
                        </button>
                        {customFlightGearPath && (
                          <button onClick={() => setCustomFlightGearPath(null)} disabled={isRunning} className="px-2 py-1 text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                            {t('sitl.view.action.clear')}
                          </button>
                        )}
                      </div>
                    </div>

                    {customFlightGearPath && (
                      <div className="mb-3 px-2 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded text-xs text-blue-300">
                        <span className="text-blue-400">{t('sitl.view.custom-path')}</span>{' '}
                        <span className="font-mono text-blue-200 break-all">{customFlightGearPath}</span>
                      </div>
                    )}

                    {/* FlightGear config options */}
                    {isInstalled && (
                      <div className="grid grid-cols-2 gap-3 pt-3 border-t border-subtle">
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('sitl.view.flightgear.aircraft')}</label>
                          <select value={flightGearConfig.aircraft} onChange={(e) => setFlightGearConfig({ aircraft: e.target.value })} disabled={isRunning} className="w-full px-2 py-1.5 text-xs bg-surface-raised text-content border border rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50">
                            {AIRCRAFT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{opt.label}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('sitl.view.flightgear.airport')}</label>
                          <select value={flightGearConfig.airport} onChange={(e) => setFlightGearConfig({ airport: e.target.value })} disabled={isRunning} className="w-full px-2 py-1.5 text-xs bg-surface-raised text-content border border rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50">
                            {AIRPORT_OPTIONS.map((opt) => (<option key={opt.value} value={opt.value}>{sText(t, opt.labelKey, opt.label)}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('sitl.view.flightgear.time-of-day')}</label>
                          <select value={flightGearConfig.timeOfDay} onChange={(e) => setFlightGearConfig({ timeOfDay: e.target.value as typeof flightGearConfig.timeOfDay })} disabled={isRunning} className="w-full px-2 py-1.5 text-xs bg-surface-raised text-content border border rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50">
                            <option value="dawn">{t('sitl.view.flightgear.time.dawn')}</option>
                            <option value="morning">{t('sitl.view.flightgear.time.morning')}</option>
                            <option value="noon">{t('sitl.view.flightgear.time.noon')}</option>
                            <option value="afternoon">{t('sitl.view.flightgear.time.afternoon')}</option>
                            <option value="dusk">{t('sitl.view.flightgear.time.dusk')}</option>
                            <option value="night">{t('sitl.view.flightgear.time.night')}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-content-secondary mb-1">{t('sitl.view.flightgear.weather')}</label>
                          <select value={flightGearConfig.weather} onChange={(e) => setFlightGearConfig({ weather: e.target.value as typeof flightGearConfig.weather })} disabled={isRunning} className="w-full px-2 py-1.5 text-xs bg-surface-raised text-content border border rounded focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50">
                            <option value="clear">{t('sitl.view.flightgear.weather.clear')}</option>
                            <option value="cloudy">{t('sitl.view.flightgear.weather.cloudy')}</option>
                            <option value="rain">{t('sitl.view.flightgear.weather.rain')}</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {/* Running status indicators */}
                    {(isFlightGearRunning || isBridgeRunning) && (
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-subtle">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${isFlightGearRunning ? 'bg-green-400' : 'bg-zinc-500'}`} />
                          <span className="text-xs text-content-secondary">FlightGear</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${isBridgeRunning ? 'bg-green-400' : 'bg-zinc-500'}`} />
                          <span className="text-xs text-content-secondary">{t('sitl.view.flightgear.bridge')}</span>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}

              {/* Error display */}
              {(flightGearError || xplaneError) && (
                <div className="mt-3 pt-3 border-t border-subtle text-xs text-red-400">
                  {flightGearError || xplaneError}
                </div>
              )}
            </>
          )}

          {/* Help text */}
          <div className="mt-3 pt-3 border-t border-subtle text-xs text-content-tertiary">
            <span className="text-content-secondary">{t('sitl.view.help.title')}</span>{' '}
            {selectedSimulator === 'xplane'
              ? t('sitl.view.help.xplane')
              : selectedSimulator === 'flightgear'
              ? t('sitl.view.help.flightgear')
              : t('sitl.view.help.default')}
          </div>
        </div>

        {/* Virtual RC Control - show when simulator is active */}
        {selectedSimulator !== 'none' && (isXPlaneRunning || isBridgeRunning) && (
          <div className="bg-surface-input border border-subtle rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <h3 className="text-sm font-medium text-content">{t('sitl.view.rc.heading')}</h3>
              </div>
              <button
                onClick={resetVirtualRC}
                className="px-2 py-1 text-xs text-content-secondary hover:text-content bg-surface-raised hover:bg-surface-raised rounded transition-colors"
              >
                {t('sitl.view.action.reset')}
              </button>
            </div>

            <div className="text-xs text-content-secondary mb-3">
              {t('sitl.view.rc.sim-intro-before')} <code className="px-1 py-0.5 bg-surface-raised rounded text-content-secondary">receiver_type = SIM</code>{t('sitl.view.rc.sim-intro-after')}
            </div>

            {/* Main sticks */}
            <div className="grid grid-cols-4 gap-3 mb-3">
              {/* Throttle */}
              <div>
                <label className="block text-xs text-content-secondary mb-1">
                  {t('sitl.view.rc.throttle')} <span className="text-content-tertiary">{normalizedToPWM(virtualRC.throttle)}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={virtualRC.throttle}
                  onChange={(e) => updateVirtualRC('throttle', parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
              {/* Roll */}
              <div>
                <label className="block text-xs text-content-secondary mb-1">
                  {t('sitl.view.rc.roll')} <span className="text-content-tertiary">{normalizedToPWM(virtualRC.roll)}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={virtualRC.roll}
                  onChange={(e) => updateVirtualRC('roll', parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              {/* Pitch */}
              <div>
                <label className="block text-xs text-content-secondary mb-1">
                  {t('sitl.view.rc.pitch')} <span className="text-content-tertiary">{normalizedToPWM(virtualRC.pitch)}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={virtualRC.pitch}
                  onChange={(e) => updateVirtualRC('pitch', parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
              {/* Yaw */}
              <div>
                <label className="block text-xs text-content-secondary mb-1">
                  {t('sitl.view.rc.yaw')} <span className="text-content-tertiary">{normalizedToPWM(virtualRC.yaw)}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={virtualRC.yaw}
                  onChange={(e) => updateVirtualRC('yaw', parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>
            </div>

            {/* AUX channels */}
            <div className="grid grid-cols-4 gap-3 pt-3 border-t border-subtle">
              {/* AUX1 */}
              <div>
                <label className="block text-xs text-content-secondary mb-1">
                  AUX1 <span className="text-content-tertiary">{normalizedToPWM(virtualRC.aux1)}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={virtualRC.aux1}
                  onChange={(e) => updateVirtualRC('aux1', parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
              {/* AUX2 */}
              <div>
                <label className="block text-xs text-content-secondary mb-1">
                  AUX2 <span className="text-content-tertiary">{normalizedToPWM(virtualRC.aux2)}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={virtualRC.aux2}
                  onChange={(e) => updateVirtualRC('aux2', parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
              {/* AUX3 */}
              <div>
                <label className="block text-xs text-content-secondary mb-1">
                  AUX3 <span className="text-content-tertiary">{normalizedToPWM(virtualRC.aux3)}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={virtualRC.aux3}
                  onChange={(e) => updateVirtualRC('aux3', parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-green-500"
                />
              </div>
              {/* AUX4 (ARM) - highlighted */}
              <div>
                <label className="block text-xs text-amber-400 font-medium mb-1">
                  {t('sitl.view.rc.aux4-arm')} <span className="text-amber-500">{normalizedToPWM(virtualRC.aux4)}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={virtualRC.aux4}
                  onChange={(e) => updateVirtualRC('aux4', parseFloat(e.target.value))}
                  className="w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            </div>

            {/* Quick ARM button */}
            <div className="mt-3 pt-3 border-t border-subtle">
              <button
                onClick={() => {
                  // Set AUX4 to high (1900 PWM = 0.8 normalized)
                  // Also set throttle to minimum for safety
                  updateVirtualRC('throttle', -1);
                  updateVirtualRC('aux4', 0.8);
                }}
                className="w-full py-2 text-sm font-medium text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-lg transition-colors"
              >
                {t('sitl.view.rc.set-arm')}
              </button>
            </div>

            {/* GPS MSP Sender toggle - for gps_provider=MSP */}
            <div className="mt-3 pt-3 border-t border-subtle">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-content">{t('sitl.view.rc.gps-sender')}</div>
                  <div className="text-xs text-content-secondary">
                    {t('sitl.view.rc.gps-sender-help-before')} <code className="px-1 bg-surface-raised rounded">gps_provider = MSP</code>{t('sitl.view.rc.gps-sender-help-after')}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (gpsSenderEnabled) {
                      await window.electronAPI.mspStopGpsSender();
                      setGpsSenderEnabled(false);
                    } else {
                      await window.electronAPI.mspStartGpsSender();
                      setGpsSenderEnabled(true);
                    }
                  }}
                  disabled={!connectionState.isConnected}
                  className={`relative w-10 h-5 rounded-full transition-colors ${
                    gpsSenderEnabled ? 'bg-green-500' : 'bg-surface-inset'
                  } ${!connectionState.isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white border border-strong shadow-sm rounded-full transition-transform ${
                      gpsSenderEnabled ? 'translate-x-5' : ''
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Connection hint */}
        {isRunning && !connectionState.isConnected && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-300">
              <span className="font-medium">{t('sitl.view.hint.running-title')}</span>{' '}
              {t('sitl.view.hint.connect-before')} <code className="px-1.5 py-0.5 bg-blue-500/20 rounded text-blue-200 font-mono">127.0.0.1:5760</code>
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

        {/* Output log */}
        <div className="flex-1 flex flex-col overflow-hidden bg-surface-input border border-subtle rounded-lg">
          <div className="flex items-center justify-between px-3 py-2 border-b border-subtle bg-surface-input">
            <span className="text-xs font-medium text-content-secondary">{t('sitl.view.output.heading')}</span>
            <div className="flex items-center gap-2">
              {lastCommand && (
                <span className="text-xs text-content-secondary font-mono truncate max-w-md" title={lastCommand}>
                  {lastCommand.split('/').pop()}
                </span>
              )}
              <button
                onClick={clearOutput}
                disabled={output.length === 0}
                className="px-2 py-1 text-xs text-content-secondary hover:text-content transition-colors disabled:opacity-50"
                title={t('sitl.view.output.clear-tooltip')}
              >
                {t('sitl.view.output.clear')}
              </button>
            </div>
          </div>
          <div
            ref={outputRef}
            className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed"
          >
            {output.length === 0 ? (
              <div className="text-content-tertiary italic">
                {t('sitl.view.output.empty')}
              </div>
            ) : (
              output.map((line, idx) => {
                // Filter out verbose EEPROM programming messages
                if (line.includes('[EEPROM] Program word')) return null;

                return (
                  <div
                    key={idx}
                    className={
                      line.startsWith('[ERROR]')
                        ? 'text-red-400'
                        : line.startsWith('---')
                          ? 'text-purple-400 font-medium'
                          : line.startsWith('Command:')
                            ? 'text-blue-400'
                            : line.includes('[SYSTEM]') || line.includes('[SIM]')
                              ? 'text-green-400'
                              : line.includes('[EEPROM]')
                                ? 'text-yellow-400'
                                : 'text-content'
                    }
                  >
                    {line}
                  </div>
                );
              })
            )}
          </div>
        </div>
          </>
        )}
      </div>

      {/* New Profile Modal */}
      {showNewProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-input border border rounded-xl p-6 w-[420px] shadow-xl">
            <h3 className="text-lg font-semibold text-content mb-1">{t('sitl.view.new-profile.title')}</h3>
            <p className="text-xs text-content-secondary mb-4">
              {t('sitl.view.new-profile.description')}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-content-secondary mb-1">{t('sitl.view.new-profile.name')}</label>
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder={t('sitl.view.new-profile.name-placeholder')}
                  className="w-full px-3 py-2 bg-surface-raised text-content border border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProfile();
                    if (e.key === 'Escape') setShowNewProfile(false);
                  }}
                />
              </div>

              <div>
                <label className="block text-sm text-content-secondary mb-1">{t('sitl.view.new-profile.desc')}</label>
                <input
                  type="text"
                  value={newProfileDesc}
                  onChange={(e) => setNewProfileDesc(e.target.value)}
                  placeholder={t('sitl.view.new-profile.desc-placeholder')}
                  className="w-full px-3 py-2 bg-surface-raised text-content border border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProfile();
                    if (e.key === 'Escape') setShowNewProfile(false);
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowNewProfile(false);
                  setNewProfileName('');
                  setNewProfileDesc('');
                }}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
              >
                {t('sitl.view.action.cancel')}
              </button>
              <button
                onClick={handleCreateProfile}
                disabled={!newProfileName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors disabled:opacity-50"
              >
                {t('sitl.view.new-profile.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && currentProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-input border border rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold text-content mb-2">{t('sitl.view.delete.title')}</h3>
            <p className="text-sm text-content-secondary mb-4">
              {t('sitl.view.delete.confirm-before')}<span className="text-content">{currentProfile.name}</span>{t('sitl.view.delete.confirm-after')}
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
              >
                {t('sitl.view.action.cancel')}
              </button>
              <button
                onClick={handleDeleteProfile}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                {t('sitl.view.action.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
