/**
 * Sensors Tab for MAVLink/ArduPilot
 *
 * Displays live sensor telemetry data:
 * - Attitude (roll/pitch/yaw)
 * - GPS status (fix, satellites, HDOP)
 * - Battery (voltage, current, remaining)
 * - Altitude and climb rate
 * - Sensor health indicators
 */

import React, { useEffect, useState } from 'react';
import {
  Compass,
  Navigation,
  Satellite,
  Battery,
  Gauge,
  Thermometer,
  Activity,
  Wifi,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useTelemetryStore } from '../../stores/telemetry-store';

// Sensor status indicator
function SensorStatus({
  name,
  healthy,
  enabled,
  icon: Icon,
}: {
  name: string;
  healthy: boolean;
  enabled: boolean;
  icon: React.ElementType;
}) {
  const status = !enabled ? 'disabled' : healthy ? 'healthy' : 'unhealthy';
  const colors = {
    healthy: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    unhealthy: 'bg-red-500/20 border-red-500/30 text-red-400',
    disabled: 'bg-zinc-800/50 border-zinc-700/30 text-zinc-500',
  };
  const StatusIcon = status === 'healthy' ? CheckCircle : status === 'unhealthy' ? XCircle : AlertTriangle;

  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border ${colors[status]}`}>
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{name}</span>
      </div>
      <StatusIcon className="w-4 h-4" />
    </div>
  );
}

// Telemetry value card
function TelemetryValue({
  label,
  value,
  unit,
  color = 'text-cyan-400',
  size = 'normal',
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  size?: 'small' | 'normal' | 'large';
}) {
  const sizeClasses = {
    small: 'text-lg',
    normal: 'text-2xl',
    large: 'text-4xl',
  };

  return (
    <div className="text-center">
      <div className={`font-mono ${color} ${sizeClasses[size]}`}>
        {typeof value === 'number' ? value.toFixed(1) : value}
        {unit && <span className="text-xs text-zinc-500 ml-1">{unit}</span>}
      </div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
    </div>
  );
}

const SensorsTab: React.FC = () => {
  const { attitude, gps, battery, vfrHud } = useTelemetryStore();
  const sysStatus = null as { onboardControlSensorsHealth: number; onboardControlSensorsEnabled: number } | null;
  const heartbeat = null as { autopilot?: string } | null;
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Track last update time
  useEffect(() => {
    if (attitude || gps || battery) {
      setLastUpdate(new Date());
    }
  }, [attitude, gps, battery]);

  // Parse system status for sensor health
  const sensorHealth = {
    gyro: sysStatus ? (sysStatus.onboardControlSensorsHealth & 1) !== 0 : true,
    accel: sysStatus ? (sysStatus.onboardControlSensorsHealth & 2) !== 0 : true,
    mag: sysStatus ? (sysStatus.onboardControlSensorsHealth & 4) !== 0 : true,
    baro: sysStatus ? (sysStatus.onboardControlSensorsHealth & 8) !== 0 : true,
    gps: sysStatus ? (sysStatus.onboardControlSensorsHealth & 32) !== 0 : gps !== null,
    battery: sysStatus ? (sysStatus.onboardControlSensorsHealth & 128) !== 0 : battery !== null,
  };

  const sensorEnabled = {
    gyro: sysStatus ? (sysStatus.onboardControlSensorsEnabled & 1) !== 0 : true,
    accel: sysStatus ? (sysStatus.onboardControlSensorsEnabled & 2) !== 0 : true,
    mag: sysStatus ? (sysStatus.onboardControlSensorsEnabled & 4) !== 0 : true,
    baro: sysStatus ? (sysStatus.onboardControlSensorsEnabled & 8) !== 0 : true,
    gps: sysStatus ? (sysStatus.onboardControlSensorsEnabled & 32) !== 0 : true,
    battery: sysStatus ? (sysStatus.onboardControlSensorsEnabled & 128) !== 0 : true,
  };

  // GPS fix type names
  const gpsFixTypes: Record<number, string> = {
    0: 'No GPS',
    1: 'No Fix',
    2: '2D Fix',
    3: '3D Fix',
    4: 'DGPS',
    5: 'RTK Float',
    6: 'RTK Fixed',
  };

  return (
    <div className="p-6 space-y-6">
      {/* Connection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className={`w-5 h-5 ${lastUpdate ? 'text-emerald-400 animate-pulse' : 'text-zinc-500'}`} />
          <span className="text-sm text-zinc-400">
            {lastUpdate ? `Last update: ${lastUpdate.toLocaleTimeString()}` : 'Waiting for telemetry...'}
          </span>
        </div>
        {heartbeat && (
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <Wifi className="w-4 h-4" />
            <span>{heartbeat.autopilot || 'Unknown'}</span>
          </div>
        )}
      </div>

      {/* Main telemetry grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Attitude Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Compass className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Attitude</h3>
              <p className="text-xs text-zinc-500">Aircraft orientation</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <TelemetryValue
              label="Roll"
              value={attitude?.roll ?? 0}
              unit="°"
              color="text-blue-400"
            />
            <TelemetryValue
              label="Pitch"
              value={attitude?.pitch ?? 0}
              unit="°"
              color="text-emerald-400"
            />
            <TelemetryValue
              label="Yaw"
              value={attitude?.yaw ?? 0}
              unit="°"
              color="text-orange-400"
            />
          </div>

          {/* Visual attitude indicator placeholder */}
          <div className="h-24 bg-zinc-800/50 rounded-lg flex items-center justify-center">
            <div
              className="w-16 h-16 border-2 border-blue-400 rounded"
              style={{
                transform: `rotate(${attitude?.roll ?? 0}deg)`,
                transition: 'transform 0.1s',
              }}
            >
              <div
                className="w-full h-1/2 bg-blue-400/20"
                style={{
                  transform: `translateY(${-(attitude?.pitch ?? 0) / 2}px)`,
                }}
              />
            </div>
          </div>
        </div>

        {/* GPS Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Satellite className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">GPS Status</h3>
              <p className="text-xs text-zinc-500">Position and fix quality</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <TelemetryValue
              label="Fix Type"
              value={gpsFixTypes[gps?.fixType ?? 0] || 'Unknown'}
              color={gps?.fixType && gps.fixType >= 3 ? 'text-emerald-400' : 'text-amber-400'}
            />
            <TelemetryValue
              label="Satellites"
              value={gps?.satellites ?? 0}
              color={gps?.satellites && gps.satellites >= 8 ? 'text-emerald-400' : 'text-amber-400'}
            />
            <TelemetryValue
              label="HDOP"
              value={gps?.hdop ?? 99}
              color={gps?.hdop && gps.hdop < 2 ? 'text-emerald-400' : 'text-amber-400'}
            />
          </div>

          {gps && (
            <div className="bg-zinc-800/50 rounded-lg p-3 space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Latitude</span>
                <span className="font-mono text-zinc-300">{gps.lat?.toFixed(6) ?? 'N/A'}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Longitude</span>
                <span className="font-mono text-zinc-300">{gps.lon?.toFixed(6) ?? 'N/A'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Battery Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Battery className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Battery</h3>
              <p className="text-xs text-zinc-500">Power status</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <TelemetryValue
              label="Voltage"
              value={battery?.voltage ?? 0}
              unit="V"
              color={battery?.voltage && battery.voltage > 3.5 * 4 ? 'text-emerald-400' : 'text-red-400'}
            />
            <TelemetryValue
              label="Current"
              value={battery?.current ?? 0}
              unit="A"
              color="text-amber-400"
            />
            <TelemetryValue
              label="Remaining"
              value={battery?.remaining ?? 0}
              unit="%"
              color={battery?.remaining && battery.remaining > 20 ? 'text-emerald-400' : 'text-red-400'}
            />
          </div>

          {/* Battery bar */}
          <div className="space-y-1">
            <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (battery?.remaining ?? 0) > 50
                    ? 'bg-emerald-500'
                    : (battery?.remaining ?? 0) > 20
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${battery?.remaining ?? 0}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>0%</span>
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* Altitude & Speed Card */}
        <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Gauge className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Flight Data</h3>
              <p className="text-xs text-zinc-500">Altitude and speed</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <TelemetryValue
              label="Altitude"
              value={vfrHud?.alt ?? 0}
              unit="m"
              color="text-purple-400"
              size="large"
            />
            <TelemetryValue
              label="Climb Rate"
              value={vfrHud?.climb ?? 0}
              unit="m/s"
              color={(vfrHud?.climb ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}
              size="large"
            />
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2">
            <TelemetryValue
              label="Ground Speed"
              value={vfrHud?.groundspeed ?? 0}
              unit="m/s"
              color="text-cyan-400"
              size="small"
            />
            <TelemetryValue
              label="Air Speed"
              value={vfrHud?.airspeed ?? 0}
              unit="m/s"
              color="text-cyan-400"
              size="small"
            />
            <TelemetryValue
              label="Heading"
              value={vfrHud?.heading ?? 0}
              unit="°"
              color="text-cyan-400"
              size="small"
            />
          </div>
        </div>
      </div>

      {/* Sensor Health */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <h3 className="text-sm font-medium text-white">Sensor Health</h3>
        <div className="grid grid-cols-6 gap-3">
          <SensorStatus name="Gyro" healthy={sensorHealth.gyro} enabled={sensorEnabled.gyro} icon={Activity} />
          <SensorStatus name="Accel" healthy={sensorHealth.accel} enabled={sensorEnabled.accel} icon={Navigation} />
          <SensorStatus name="Compass" healthy={sensorHealth.mag} enabled={sensorEnabled.mag} icon={Compass} />
          <SensorStatus name="Baro" healthy={sensorHealth.baro} enabled={sensorEnabled.baro} icon={Thermometer} />
          <SensorStatus name="GPS" healthy={sensorHealth.gps} enabled={sensorEnabled.gps} icon={Satellite} />
          <SensorStatus name="Battery" healthy={sensorHealth.battery} enabled={sensorEnabled.battery} icon={Battery} />
        </div>
      </div>

      {/* No data warning */}
      {!attitude && !gps && !battery && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            No telemetry data received. Make sure you're connected to the flight controller.
          </p>
        </div>
      )}
    </div>
  );
};

export default SensorsTab;
