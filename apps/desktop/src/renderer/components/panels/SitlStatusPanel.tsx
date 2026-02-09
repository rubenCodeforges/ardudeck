/**
 * SITL Status Panel
 *
 * Displays SITL-specific telemetry and status information.
 * Useful for debugging arming issues, sensor status, and RC input.
 */

import { useTelemetryStore } from '../../stores/telemetry-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSitlStore } from '../../stores/sitl-store';
import { useFlightControlStore } from '../../stores/flight-control-store';
import { useEffect, useState } from 'react';
import { PanelContainer } from './panel-utils';

// Sensor status indicator
function SensorBadge({ name, status }: { name: string; status: string }) {
  const isOk = status === 'OK' || status === 'FAKE';
  const isNone = status === 'NONE' || !status;

  return (
    <div
      className={`px-2 py-1 rounded text-xs font-medium ${
        isOk
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : isNone
          ? 'bg-zinc-700/50 text-zinc-500 border border-zinc-600/30'
          : 'bg-red-500/20 text-red-400 border border-red-500/30'
      }`}
    >
      {name}: {status || 'N/A'}
    </div>
  );
}

// RC Channel bar
function RCChannelBar({ channel, value, label }: { channel: number; value: number; label: string }) {
  const percentage = ((value - 1000) / 1000) * 100;
  const isCenter = Math.abs(value - 1500) < 50;
  const isLow = value < 1200;
  const isHigh = value > 1800;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500 w-12">{label}</span>
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all ${
            isHigh ? 'bg-green-500' : isLow ? 'bg-red-500' : isCenter ? 'bg-blue-500' : 'bg-amber-500'
          }`}
          style={{ width: `${Math.max(0, Math.min(100, percentage))}%` }}
        />
      </div>
      <span className="text-xs text-zinc-400 w-10 text-right">{value}</span>
    </div>
  );
}

export function SitlStatusPanel() {
  const { flight, position, gps, attitude, battery } = useTelemetryStore();
  const { connectionState } = useConnectionStore();
  const sitlStore = useSitlStore();
  const sitlRunning = sitlStore.isRunning;
  const bridgeConnected = (sitlStore as unknown as Record<string, unknown>).bridgeConnected as boolean | undefined;
  const { channels: gcsChannels, isOverrideActive } = useFlightControlStore();
  // Channel order: RPTY (Roll, Pitch, Throttle, Yaw)
  const [rcChannels, setRcChannels] = useState<number[]>([1500, 1500, 1000, 1500, 1000, 1000, 1000, 1000]);

  // Derive sensor status from actual telemetry data
  // For SITL, we derive status from telemetry values rather than static placeholders
  const sensorStatus = {
    // Gyro/Acc/Mag/Baro are simulated in SITL
    gyro: attitude.roll !== 0 || attitude.pitch !== 0 ? 'FAKE' : 'NONE',
    acc: 'FAKE', // SITL always has fake accelerometer
    mag: attitude.yaw !== 0 ? 'FAKE' : 'NONE',
    baro: position.alt !== 0 ? 'FAKE' : 'NONE',
    // GPS status derived from actual telemetry
    gps: gps.fixType >= 3 ? '3D' : gps.fixType >= 2 ? '2D' : gps.satellites > 0 ? 'ACQ' : 'NONE',
  };

  // Poll RC channels if available
  useEffect(() => {
    if (!connectionState.isConnected || connectionState.protocol !== 'msp') return;

    let pollPending = false;
    const fetchRcChannels = async () => {
      if (pollPending) return;
      pollPending = true;
      try {
        const result = await window.electronAPI.mspGetRc?.();
        if (result?.channels && Array.isArray(result.channels)) {
          setRcChannels(result.channels);
        }
      } catch {
        // RC channels might not be available
      } finally {
        pollPending = false;
      }
    };

    fetchRcChannels();
    const interval = setInterval(fetchRcChannels, 200);
    return () => clearInterval(interval);
  }, [connectionState.isConnected, connectionState.protocol]);

  const isConnected = connectionState.isConnected;
  const isSitl = connectionState.isSitl;
  const armingFlags = flight.armingDisabledReasons || [];

  return (
    <PanelContainer>
      <div className="space-y-4 text-sm">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">SITL Status</span>
          <div className="flex items-center gap-2">
            {sitlRunning ? (
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded">Running</span>
            ) : (
              <span className="px-2 py-0.5 bg-zinc-700 text-zinc-500 text-xs rounded">Stopped</span>
            )}
            {bridgeConnected && (
              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs rounded">Bridge</span>
            )}
          </div>
        </div>

        {/* Firmware Info */}
        {isConnected && (
          <div className="p-2 bg-zinc-800/50 rounded-lg">
            <div className="text-xs text-zinc-500 mb-1">Firmware</div>
            <div className="text-white font-medium">
              {connectionState.fcVariant} {connectionState.fcVersion}
            </div>
            {isSitl && <div className="text-xs text-amber-400 mt-1">SITL Simulation</div>}
          </div>
        )}

        {/* Arming Status */}
        <div className="p-2 bg-zinc-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">Arming</span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-bold ${
                flight.armed
                  ? 'bg-red-500 text-white'
                  : 'bg-zinc-700 text-zinc-400'
              }`}
            >
              {flight.armed ? 'ARMED' : 'DISARMED'}
            </span>
          </div>

          {/* Arming Blockers */}
          {!flight.armed && armingFlags.length > 0 && (
            <div className="space-y-1">
              <div className="text-xs text-red-400">Blockers:</div>
              <div className="flex flex-wrap gap-1">
                {armingFlags.map((flag, i) => (
                  <span
                    key={i}
                    className="px-1.5 py-0.5 bg-red-500/20 text-red-300 text-xs rounded"
                  >
                    {flag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Flight Mode */}
        <div className="p-2 bg-zinc-800/50 rounded-lg">
          <div className="text-xs text-zinc-500 mb-1">Flight Mode</div>
          <div className="text-white font-medium">{flight.mode || 'Unknown'}</div>
        </div>

        {/* Sensors */}
        <div>
          <div className="text-xs text-zinc-500 mb-2">Sensors</div>
          <div className="flex flex-wrap gap-1">
            <SensorBadge name="GYRO" status={sensorStatus.gyro} />
            <SensorBadge name="ACC" status={sensorStatus.acc} />
            <SensorBadge name="MAG" status={sensorStatus.mag} />
            <SensorBadge name="BARO" status={sensorStatus.baro} />
            <SensorBadge name="GPS" status={sensorStatus.gps} />
          </div>
        </div>

        {/* GPS Status */}
        <div className="p-2 bg-zinc-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-zinc-500">GPS</span>
            <span
              className={`text-xs ${
                gps.fixType >= 3 ? 'text-green-400' : 'text-amber-400'
              }`}
            >
              {gps.fixType >= 3 ? '3D Fix' : gps.fixType === 2 ? '2D Fix' : 'No Fix'}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">Sats: </span>
              <span className="text-white">{gps.satellites}</span>
            </div>
            <div>
              <span className="text-zinc-500">HDOP: </span>
              <span className="text-white">{(gps.hdop / 100).toFixed(1)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Lat: </span>
              <span className="text-white">{position.lat.toFixed(6)}</span>
            </div>
            <div>
              <span className="text-zinc-500">Lon: </span>
              <span className="text-white">{position.lon.toFixed(6)}</span>
            </div>
          </div>
        </div>

        {/* Attitude */}
        <div className="p-2 bg-zinc-800/50 rounded-lg">
          <div className="text-xs text-zinc-500 mb-1">Attitude</div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">Roll: </span>
              <span className="text-white">{attitude.roll.toFixed(1)}°</span>
            </div>
            <div>
              <span className="text-zinc-500">Pitch: </span>
              <span className="text-white">{attitude.pitch.toFixed(1)}°</span>
            </div>
            <div>
              <span className="text-zinc-500">Yaw: </span>
              <span className="text-white">{attitude.yaw.toFixed(0)}°</span>
            </div>
          </div>
        </div>

        {/* Altitude */}
        <div className="p-2 bg-zinc-800/50 rounded-lg">
          <div className="text-xs text-zinc-500 mb-1">Altitude</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">MSL: </span>
              <span className="text-white">{position.alt.toFixed(1)}m</span>
            </div>
            <div>
              <span className="text-zinc-500">AGL: </span>
              <span className="text-white">{(position as unknown as Record<string, number>).altAgl?.toFixed(1) || '0.0'}m</span>
            </div>
          </div>
        </div>

        {/* RC Channels - GCS Sending vs FC Receiving */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-500">RC Channels</span>
            {isOverrideActive && (
              <span className="text-xs text-amber-400 animate-pulse">Override Active</span>
            )}
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-2 mb-1 text-xs text-zinc-600">
            <span className="w-12"></span>
            <span className="flex-1 text-center">FC Receives</span>
            <span className="w-10"></span>
            <span className="w-12 text-center">GCS</span>
          </div>

          <div className="space-y-1.5">
            {/* RPTY order: Roll=0, Pitch=1, Throttle=2, Yaw=3 */}
            {[
              { label: 'Roll', idx: 0 },
              { label: 'Pitch', idx: 1 },
              { label: 'Throt', idx: 2 },
              { label: 'Yaw', idx: 3 },
              { label: 'AUX1', idx: 4 },
              { label: 'AUX2', idx: 5 },
              { label: 'AUX3', idx: 6 },
              { label: 'AUX4', idx: 7 },
            ].map(({ label, idx }) => {
              const fcValue = rcChannels[idx] || (idx === 2 ? 1000 : 1500);
              const gcsValue = gcsChannels[idx] || (idx === 2 ? 1000 : 1500);
              const mismatch = isOverrideActive && Math.abs(fcValue - gcsValue) > 50;

              return (
                <div key={idx} className="flex items-center gap-2">
                  <span className={`text-xs w-12 ${mismatch ? 'text-red-400' : 'text-zinc-500'}`}>
                    {label}
                  </span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        fcValue > 1800 ? 'bg-green-500' : fcValue < 1200 ? 'bg-red-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.max(0, Math.min(100, ((fcValue - 1000) / 1000) * 100))}%` }}
                    />
                  </div>
                  <span className={`text-xs w-10 text-right ${mismatch ? 'text-red-400' : 'text-zinc-400'}`}>
                    {fcValue}
                  </span>
                  <span className={`text-xs w-12 text-right font-mono ${
                    isOverrideActive ? (mismatch ? 'text-red-400' : 'text-green-400') : 'text-zinc-600'
                  }`}>
                    {gcsValue}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Warning if mismatch detected */}
          {isOverrideActive && rcChannels.some((fc, i) => Math.abs(fc - (gcsChannels[i] || 1000)) > 50) && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-400">
              FC not receiving GCS values. Check: <code className="bg-zinc-800 px-1 rounded">set receiver_type = MSP</code>
            </div>
          )}
        </div>

        {/* Battery (even if fake) */}
        <div className="p-2 bg-zinc-800/50 rounded-lg">
          <div className="text-xs text-zinc-500 mb-1">Battery</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <span className="text-zinc-500">Voltage: </span>
              <span className="text-white">{battery.voltage.toFixed(2)}V</span>
            </div>
            <div>
              <span className="text-zinc-500">Current: </span>
              <span className="text-white">{battery.current.toFixed(1)}A</span>
            </div>
          </div>
        </div>

        {/* System Info */}
        <div className="text-xs text-zinc-600 border-t border-zinc-800 pt-2">
          <div>System Load: {(flight as unknown as Record<string, number>).cpuLoad || 0}%</div>
        </div>
      </div>
    </PanelContainer>
  );
}

export default SitlStatusPanel;
