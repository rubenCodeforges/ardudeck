/**
 * ArduPilot SITL Tab
 *
 * Configuration and control panel for ArduPilot SITL simulator.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { useArduPilotSitlStore, ARDUPILOT_MODELS } from '../../stores/ardupilot-sitl-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { VirtualRCState, ArduPilotVehicleType, ArduPilotReleaseTrack } from '../../../shared/ipc-channels';

const VEHICLE_TYPE_OPTIONS: Array<{ value: ArduPilotVehicleType; label: string; icon: string }> = [
  { value: 'copter', label: 'Copter', icon: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5' },
  { value: 'plane', label: 'Plane', icon: 'M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z' },
  { value: 'rover', label: 'Rover', icon: 'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z' },
  { value: 'sub', label: 'Sub', icon: 'M11 19v-4H9.5C7.01 15 5 12.99 5 10.5S7.01 6 9.5 6h5C17.99 6 20 8.01 20 10.5S17.99 15 15.5 15H14v4h-3z' },
];

const RELEASE_TRACK_OPTIONS: Array<{ value: ArduPilotReleaseTrack; label: string; description: string }> = [
  { value: 'stable', label: 'Stable', description: 'Recommended for most users' },
  { value: 'beta', label: 'Beta', description: 'Release candidates and testing' },
  { value: 'dev', label: 'Dev', description: 'Latest development builds' },
];

export default function ArduPilotSitlTab() {
  const {
    platformSupported,
    platformError,
    usesDocker,
    isRunning,
    isStarting,
    isStopping,
    isStatusChecked,
    isDownloading,
    downloadProgress,
    binaryInfo,
    output,
    vehicleType,
    model,
    releaseTrack,
    homeLocation,
    speedup,
    wipeOnStart,
    lastCommand,
    lastError,
    isRcSending,
    rcState,
    start,
    stop,
    download,
    checkBinary,
    clearOutput,
    setVehicleType,
    setModel,
    setReleaseTrack,
    setHomeLocation,
    setSpeedup,
    setWipeOnStart,
    startRcSender,
    stopRcSender,
    setRcState,
    resetRcState,
    initListeners,
    checkStatus,
  } = useArduPilotSitlStore();

  const { connectionState } = useConnectionStore();
  const { setPendingSitlSwitch } = useSettingsStore();
  const outputRef = useRef<HTMLDivElement>(null);

  // Geolocation state
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Get current location using browser geolocation API
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHomeLocation({
          lat: Math.round(position.coords.latitude * 10000) / 10000,
          lng: Math.round(position.coords.longitude * 10000) / 10000,
          alt: Math.round(position.coords.altitude || 10),
          heading: homeLocation.heading, // Keep existing heading
        });
        setIsGettingLocation(false);
      },
      (error) => {
        setIsGettingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location permission denied');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location unavailable');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out');
            break;
          default:
            setLocationError('Unable to get location');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [setHomeLocation, homeLocation.heading]);

  // Initialize listeners and check status on mount
  useEffect(() => {
    checkStatus();
    const cleanup = initListeners();
    return cleanup;
  }, [initListeners, checkStatus]);

  // Check binary when vehicle type or release track changes
  useEffect(() => {
    checkBinary();
  }, [vehicleType, releaseTrack, checkBinary]);

  // Switch connection panel to TCP when SITL starts
  useEffect(() => {
    if (isRunning) {
      setPendingSitlSwitch(true);
    }
  }, [isRunning, setPendingSitlSwitch]);

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  // Convert normalized value (-1 to +1) to PWM (1000-2000)
  const normalizedToPWM = (value: number): number => {
    return Math.round(1500 + value * 500);
  };

  // Update RC value
  const updateRC = useCallback(async (key: keyof VirtualRCState, value: number) => {
    await setRcState({ [key]: value });
  }, [setRcState]);

  const modelOptions = ARDUPILOT_MODELS[vehicleType] ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Docker Info Banner (macOS) */}
      {usesDocker && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-blue-400">Docker Mode (macOS)</h3>
              <p className="text-xs text-blue-300/80 mt-1">
                SITL will run in Docker container. Make sure Docker Desktop is running.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Platform Error */}
      {!platformSupported && platformError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="text-sm font-medium text-red-400">Platform Error</h3>
              <p className="text-xs text-red-300/80 mt-1">{platformError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Vehicle Type Selection */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-white mb-3">Vehicle Type</h3>
        <div className="grid grid-cols-4 gap-2">
          {VEHICLE_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setVehicleType(opt.value)}
              disabled={isRunning || isStarting}
              className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-colors ${
                vehicleType === opt.value
                  ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                  : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-white'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d={opt.icon} />
              </svg>
              <span className="text-xs font-medium">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Configuration Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Model & Release Track */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3">Configuration</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Frame/Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={isRunning || isStarting}
                className="w-full px-3 py-1.5 text-sm bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/50 disabled:opacity-50"
              >
                {modelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Release Track</label>
              <div className="grid grid-cols-3 gap-1">
                {RELEASE_TRACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setReleaseTrack(opt.value)}
                    disabled={isRunning || isStarting}
                    className={`px-2 py-1.5 text-xs rounded-lg border transition-colors ${
                      releaseTrack === opt.value
                        ? 'bg-blue-500/20 border-blue-500/50 text-blue-400'
                        : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    title={opt.description}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="block text-xs text-zinc-500 mb-1">Speedup</label>
                <input
                  type="number"
                  value={speedup}
                  onChange={(e) => setSpeedup(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={isRunning || isStarting}
                  min={1}
                  max={10}
                  className="w-full px-2 py-1.5 text-sm bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  type="checkbox"
                  checked={wipeOnStart}
                  onChange={(e) => setWipeOnStart(e.target.checked)}
                  disabled={isRunning || isStarting}
                  className="w-4 h-4 rounded border-zinc-700 bg-zinc-800 text-blue-500 focus:ring-blue-500/50"
                />
                <label className="text-xs text-zinc-400">Wipe EEPROM</label>
              </div>
            </div>
          </div>
        </div>

        {/* Home Location */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
          <h3 className="text-sm font-medium text-white mb-3">Home Location</h3>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Latitude</label>
              <input
                type="number"
                step="0.0001"
                value={homeLocation.lat}
                onChange={(e) => setHomeLocation({ ...homeLocation, lat: parseFloat(e.target.value) || 0 })}
                disabled={isRunning || isStarting}
                className="w-full px-2 py-1.5 text-sm bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Longitude</label>
              <input
                type="number"
                step="0.0001"
                value={homeLocation.lng}
                onChange={(e) => setHomeLocation({ ...homeLocation, lng: parseFloat(e.target.value) || 0 })}
                disabled={isRunning || isStarting}
                className="w-full px-2 py-1.5 text-sm bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Altitude (m)</label>
              <input
                type="number"
                value={homeLocation.alt}
                onChange={(e) => setHomeLocation({ ...homeLocation, alt: parseFloat(e.target.value) || 0 })}
                disabled={isRunning || isStarting}
                className="w-full px-2 py-1.5 text-sm bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Heading</label>
              <input
                type="number"
                value={homeLocation.heading}
                onChange={(e) => setHomeLocation({ ...homeLocation, heading: parseFloat(e.target.value) || 0 })}
                disabled={isRunning || isStarting}
                min={0}
                max={359}
                className="w-full px-2 py-1.5 text-sm bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-zinc-600">Default: San Francisco Bay Area</p>
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
                  Getting...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Use My Location
                </>
              )}
            </button>
          </div>
          {locationError && (
            <p className="mt-2 text-xs text-red-400">{locationError}</p>
          )}
        </div>
      </div>

      {/* Binary Status & Download */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${binaryInfo?.exists ? 'bg-green-400' : 'bg-amber-400'}`} />
            <div>
              <span className="text-sm text-white">
                {vehicleType.charAt(0).toUpperCase() + vehicleType.slice(1)} ({releaseTrack})
              </span>
              <p className="text-xs text-zinc-500">
                {binaryInfo?.exists
                  ? `Ready at ${binaryInfo.path?.split('/').pop()}`
                  : 'Binary not downloaded'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!binaryInfo?.exists && !isDownloading && (
              <button
                onClick={download}
                className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
              >
                Download
              </button>
            )}

            {isDownloading && downloadProgress && (
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-zinc-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 transition-all"
                    style={{ width: `${downloadProgress.progress}%` }}
                  />
                </div>
                <span className="text-xs text-zinc-400">{downloadProgress.progress}%</span>
              </div>
            )}

            {!isRunning ? (
              <button
                onClick={start}
                disabled={!isStatusChecked || isStarting || !binaryInfo?.exists || connectionState.isConnected}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isStarting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Starting...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    </svg>
                    Start
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
                    Stopping...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                    </svg>
                    Stop
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Connection hint */}
      {isRunning && !connectionState.isConnected && (
        <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-300">
            <span className="font-medium">SITL is running!</span>{' '}
            Connect via TCP — <code className="px-1.5 py-0.5 bg-blue-500/20 rounded text-blue-200 font-mono">127.0.0.1:5760</code>
          </div>
        </div>
      )}

      {/* Virtual RC Control */}
      {isRunning && (
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <h3 className="text-sm font-medium text-white">Virtual RC Control (UDP)</h3>
              <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${isRcSending ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700 text-zinc-400'}`}>
                {isRcSending ? '50Hz' : 'Off'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={isRcSending ? stopRcSender : startRcSender}
                className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                  isRcSending
                    ? 'text-red-400 bg-red-500/10 hover:bg-red-500/20'
                    : 'text-green-400 bg-green-500/10 hover:bg-green-500/20'
                }`}
              >
                {isRcSending ? 'Stop' : 'Start'} RC
              </button>
              <button
                onClick={resetRcState}
                className="px-2 py-1 text-xs text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Main sticks */}
          <div className="grid grid-cols-4 gap-3 mb-3">
            {/* Throttle */}
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Throttle <span className="text-zinc-600">{normalizedToPWM(rcState.throttle)}</span>
              </label>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={rcState.throttle}
                onChange={(e) => updateRC('throttle', parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Roll <span className="text-zinc-600">{normalizedToPWM(rcState.roll)}</span>
              </label>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={rcState.roll}
                onChange={(e) => updateRC('roll', parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Pitch <span className="text-zinc-600">{normalizedToPWM(rcState.pitch)}</span>
              </label>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={rcState.pitch}
                onChange={(e) => updateRC('pitch', parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">
                Yaw <span className="text-zinc-600">{normalizedToPWM(rcState.yaw)}</span>
              </label>
              <input
                type="range"
                min="-1"
                max="1"
                step="0.1"
                value={rcState.yaw}
                onChange={(e) => updateRC('yaw', parseFloat(e.target.value))}
                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>

          {/* AUX channels */}
          <div className="grid grid-cols-4 gap-3 pt-3 border-t border-zinc-800">
            {(['aux1', 'aux2', 'aux3', 'aux4'] as const).map((key, idx) => (
              <div key={key}>
                <label className={`block text-xs mb-1 ${key === 'aux4' ? 'text-amber-400 font-medium' : 'text-zinc-500'}`}>
                  {key === 'aux4' ? 'AUX4 (ARM)' : `AUX${idx + 1}`}{' '}
                  <span className={key === 'aux4' ? 'text-amber-500' : 'text-zinc-600'}>{normalizedToPWM(rcState[key])}</span>
                </label>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={rcState[key]}
                  onChange={(e) => updateRC(key, parseFloat(e.target.value))}
                  className={`w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer ${key === 'aux4' ? 'accent-amber-500' : 'accent-green-500'}`}
                />
              </div>
            ))}
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
      <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900 border border-zinc-800 rounded-lg min-h-[200px]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
          <span className="text-xs font-medium text-zinc-400">Console Output</span>
          <div className="flex items-center gap-2">
            {lastCommand && (
              <span className="text-xs text-zinc-500 font-mono truncate max-w-md" title={lastCommand}>
                {lastCommand.split('/').pop()?.slice(0, 50)}
              </span>
            )}
            <button
              onClick={clearOutput}
              disabled={output.length === 0}
              className="px-2 py-1 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            >
              Clear
            </button>
          </div>
        </div>
        <div
          ref={outputRef}
          className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed max-h-[300px]"
        >
          {output.length === 0 ? (
            <div className="text-zinc-600 italic">
              No output yet. Start SITL to see process output.
            </div>
          ) : (
            output.map((line, idx) => (
              <div
                key={idx}
                className={
                  line.includes('ERROR') || line.includes('error')
                    ? 'text-red-400'
                    : line.startsWith('---')
                      ? 'text-blue-400 font-medium'
                      : line.includes('ArduPilot') || line.includes('SITL')
                        ? 'text-green-400'
                        : 'text-zinc-300'
                }
              >
                {line}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
