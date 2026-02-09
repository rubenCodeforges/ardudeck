/**
 * Betaflight Dashboard
 *
 * Main view for Betaflight/iNav/Cleanflight boards.
 * Provides connection UI and real-time telemetry display.
 */

import { useEffect, useState } from 'react';
import { useMspTelemetryStore, setupMspTelemetryListeners } from '../../stores/msp-telemetry-store';

interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  vendorId?: string;
  productId?: string;
}

export function BetaflightDashboard() {
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [baudRate, setBaudRate] = useState<number>(115200);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telemetryRunning, setTelemetryRunning] = useState(false);

  // MSP telemetry store
  const connection = useMspTelemetryStore((s) => s.connection);
  const attitude = useMspTelemetryStore((s) => s.attitude);
  const altitude = useMspTelemetryStore((s) => s.altitude);
  const analog = useMspTelemetryStore((s) => s.analog);
  const status = useMspTelemetryStore((s) => s.status);
  const rc = useMspTelemetryStore((s) => s.rc);
  const motors = useMspTelemetryStore((s) => s.motors);
  const gps = useMspTelemetryStore((s) => s.gps);
  const lastUpdate = useMspTelemetryStore((s) => s.lastUpdate);

  // Setup IPC listeners on mount
  useEffect(() => {
    const cleanup = setupMspTelemetryListeners();
    return cleanup;
  }, []);

  // List serial ports
  const refreshPorts = async () => {
    try {
      const result = await window.electronAPI.listSerialPorts();
      if (result.success && result.ports) {
        setPorts(result.ports);
        if (result.ports.length > 0 && !selectedPort) {
          setSelectedPort(result.ports[0]!.path);
        }
      }
    } catch (e) {
      console.error('Failed to list ports:', e);
    }
  };

  useEffect(() => {
    refreshPorts();
  }, []);

  // Connect to MSP board
  const handleConnect = async () => {
    if (!selectedPort) return;

    setConnecting(true);
    setError(null);

    try {
      await window.electronAPI.mspConnect({
        port: selectedPort,
        baudRate,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    try {
      if (telemetryRunning) {
        await window.electronAPI.mspStopTelemetry();
        setTelemetryRunning(false);
      }
      await window.electronAPI.mspDisconnect();
    } catch (e) {
      console.error('Disconnect error:', e);
    }
  };

  // Start/stop telemetry
  const toggleTelemetry = async () => {
    try {
      if (telemetryRunning) {
        await window.electronAPI.mspStopTelemetry();
        setTelemetryRunning(false);
      } else {
        await window.electronAPI.mspStartTelemetry(10); // 10Hz
        setTelemetryRunning(true);
      }
    } catch (e) {
      console.error('Telemetry toggle error:', e);
    }
  };

  // Commands
  const handleCalibrateAcc = async () => {
    const result = await window.electronAPI.mspCalibrateAcc();
    if (result) {
      alert('Accelerometer calibration started. Keep the board still!');
    }
  };

  const handleReboot = async () => {
    if (confirm('Reboot the flight controller?')) {
      await window.electronAPI.mspReboot();
    }
  };

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Betaflight / MSP</h1>
            <p className="text-gray-400 text-sm mt-1">
              Connect to Betaflight, iNav, or Cleanflight boards
            </p>
          </div>
        </div>

        {/* Connection Panel */}
        <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-3 h-3 rounded-full ${connection.isConnected ? 'bg-emerald-400' : 'bg-gray-500'}`} />
            <h2 className="text-lg font-semibold text-white">Connection</h2>
            {connection.isConnected && (
              <span className="text-sm text-gray-400">
                {connection.fcVariant} {connection.fcVersion} on {connection.boardId}
              </span>
            )}
          </div>

          {!connection.isConnected ? (
            <div className="flex items-center gap-4">
              {/* Port select */}
              <div className="flex-1">
                <label className="block text-xs text-gray-400 mb-1">Port</label>
                <div className="flex gap-2">
                  <select
                    value={selectedPort}
                    onChange={(e) => setSelectedPort(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
                  >
                    {ports.map((port) => (
                      <option key={port.path} value={port.path}>
                        {port.path} {port.manufacturer && `(${port.manufacturer})`}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={refreshPorts}
                    className="px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-300 transition-colors"
                    title="Refresh ports"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Baud rate */}
              <div>
                <label className="block text-xs text-gray-400 mb-1">Baud Rate</label>
                <select
                  value={baudRate}
                  onChange={(e) => setBaudRate(Number(e.target.value))}
                  className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value={115200}>115200</option>
                  <option value={230400}>230400</option>
                  <option value={420000}>420000</option>
                  <option value={500000}>500000</option>
                  <option value={921600}>921600</option>
                </select>
              </div>

              {/* Connect button */}
              <div>
                <label className="block text-xs text-transparent mb-1">Action</label>
                <button
                  onClick={handleConnect}
                  disabled={connecting || !selectedPort}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  {connecting ? 'Connecting...' : 'Connect'}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <button
                onClick={toggleTelemetry}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  telemetryRunning
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                {telemetryRunning ? 'Stop Telemetry' : 'Start Telemetry'}
              </button>

              <button
                onClick={handleCalibrateAcc}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Calibrate ACC
              </button>

              <button
                onClick={handleReboot}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
              >
                Reboot
              </button>

              <div className="flex-1" />

              <button
                onClick={handleDisconnect}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
              >
                Disconnect
              </button>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Telemetry Display */}
        {connection.isConnected && (
          <div className="grid grid-cols-4 gap-4">
            {/* Attitude */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Attitude</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Roll</span>
                  <span className="text-white font-mono">{attitude.roll.toFixed(1)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Pitch</span>
                  <span className="text-white font-mono">{attitude.pitch.toFixed(1)}°</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Yaw</span>
                  <span className="text-white font-mono">{attitude.yaw.toFixed(1)}°</span>
                </div>
              </div>
            </div>

            {/* Battery/Analog */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Battery</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Voltage</span>
                  <span className="text-white font-mono">{(analog.voltage / 10).toFixed(1)}V</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Current</span>
                  <span className="text-white font-mono">{(analog.current / 100).toFixed(1)}A</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">mAh Used</span>
                  <span className="text-white font-mono">{analog.mAhDrawn}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">RSSI</span>
                  <span className="text-white font-mono">{analog.rssi}%</span>
                </div>
              </div>
            </div>

            {/* Status */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Status</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Armed</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    status.isArmed ? 'bg-red-500/20 text-red-400' : 'bg-gray-600 text-gray-400'
                  }`}>
                    {status.isArmed ? 'ARMED' : 'DISARMED'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">CPU Load</span>
                  <span className="text-white font-mono">{status.cpuLoad}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Cycle Time</span>
                  <span className="text-white font-mono">{status.cycleTime}µs</span>
                </div>
              </div>
            </div>

            {/* GPS */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">GPS</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Fix</span>
                  <span className="text-white font-mono">{gps.fixType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Satellites</span>
                  <span className="text-white font-mono">{gps.satellites}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Lat</span>
                  <span className="text-white font-mono">{gps.lat.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Lon</span>
                  <span className="text-white font-mono">{gps.lon.toFixed(6)}</span>
                </div>
              </div>
            </div>

            {/* Altitude */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Altitude</h3>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-500">Altitude</span>
                  <span className="text-white font-mono">{altitude.altitude.toFixed(1)}m</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Vario</span>
                  <span className="text-white font-mono">{altitude.vario.toFixed(1)}m/s</span>
                </div>
              </div>
            </div>

            {/* RC Channels */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4 col-span-2">
              <h3 className="text-sm font-medium text-gray-400 mb-3">RC Channels</h3>
              <div className="grid grid-cols-4 gap-2">
                {rc.channels.slice(0, 8).map((value, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">CH{i + 1}</span>
                      <span className="text-gray-400 font-mono">{value}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${((value - 1000) / 1000) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Motors */}
            <div className="bg-gray-800/50 rounded-xl border border-gray-700/50 p-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Motors</h3>
              <div className="grid grid-cols-2 gap-2">
                {motors.values.slice(0, 4).map((value, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500">M{i + 1}</span>
                      <span className="text-gray-400 font-mono">{value}</span>
                    </div>
                    <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${((value - 1000) / 1000) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Last update */}
        {connection.isConnected && lastUpdate > 0 && (
          <div className="text-center text-xs text-gray-500">
            Last update: {new Date(lastUpdate).toLocaleTimeString()}
          </div>
        )}
      </div>
    </div>
  );
}
