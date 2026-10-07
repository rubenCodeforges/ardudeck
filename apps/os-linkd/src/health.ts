import type { VehicleState } from './vehicle-state.js';

export type HealthLevel = 'ok' | 'warn' | 'bad' | 'unknown';

export interface VehicleHealth {
  level: HealthLevel;
  /** Plain-language problems, most serious first. */
  issues: string[];
  /** Sensors the autopilot reports as enabled, with their health. */
  sensors: Array<{ name: string; healthy: boolean }>;
}

/** MAV_SYS_STATUS_SENSOR bits worth showing on a ground station, second units folded into the first. */
const SENSORS: ReadonlyArray<{ name: string; bits: number }> = [
  { name: 'Gyro', bits: 0x01 | 0x20000 },
  { name: 'Accel', bits: 0x02 | 0x40000 },
  { name: 'Compass', bits: 0x04 | 0x80000 },
  { name: 'Baro', bits: 0x08 },
  { name: 'Airspeed', bits: 0x10 },
  { name: 'GPS', bits: 0x20 },
  { name: 'Optical flow', bits: 0x40 },
  { name: 'Rangefinder', bits: 0x100 },
  { name: 'Motors', bits: 0x8000 },
  { name: 'RC', bits: 0x10000 },
  { name: 'Geofence', bits: 0x100000 },
  { name: 'AHRS', bits: 0x200000 },
  { name: 'Terrain', bits: 0x400000 },
  { name: 'Logging', bits: 0x1000000 },
  { name: 'Battery', bits: 0x2000000 },
];
const PREARM_BIT = 0x10000000;

/** EKF_STATUS_REPORT flags ArduPilot needs before it trusts its position. */
const EKF_ATTITUDE = 0x01;
const EKF_POS_HORIZ_ABS = 0x10;
const EKF_GPS_GLITCH = 0x8000;

const GPS_FIX_3D = 3;
const LOW_BATTERY_PERCENT = 20;
/** PreArm reasons repeat every few seconds while they apply; older ones are stale. */
const PREARM_FRESH_MS = 30_000;

function sensorList(v: VehicleState): VehicleHealth['sensors'] {
  const s = v.sensors;
  if (!s) return [];
  return SENSORS
    .filter(({ bits }) => (s.enabled & bits) !== 0)
    .map(({ name, bits }) => ({ name, healthy: (s.health & s.enabled & bits) === (s.enabled & bits) }));
}

function recentPrearmReasons(v: VehicleState, now: number): string[] {
  const reasons = v.messages
    .filter((m) => now - m.time < PREARM_FRESH_MS && /^PreArm: /i.test(m.text))
    .map((m) => m.text.replace(/^PreArm: /i, ''));
  return [...new Set(reasons)];
}

/** Turn a vehicle's raw status into one level and a list an operator can act on. */
export function assessHealth(v: VehicleState, now = Date.now()): VehicleHealth {
  if (!v.connected) return { level: 'unknown', issues: ['No heartbeat'], sensors: [] };
  const sensors = sensorList(v);
  const bad: string[] = sensors.filter((s) => !s.healthy).map((s) => `${s.name} unhealthy`);
  const warn: string[] = [];

  if (v.ekfFlags !== null) {
    if ((v.ekfFlags & EKF_ATTITUDE) === 0) bad.push('EKF has no attitude');
    else if ((v.ekfFlags & EKF_POS_HORIZ_ABS) === 0) warn.push('EKF has no position yet');
    if (v.ekfFlags & EKF_GPS_GLITCH) warn.push('GPS glitch');
  }
  if (v.gps.fixType < GPS_FIX_3D && sensors.some((s) => s.name === 'GPS')) warn.push('No 3D GPS fix');
  if (v.battery.remaining !== null && v.battery.remaining < LOW_BATTERY_PERCENT) warn.push(`Battery ${v.battery.remaining}%`);

  const prearmFailing = v.sensors ? (v.sensors.enabled & PREARM_BIT) !== 0 && (v.sensors.health & PREARM_BIT) === 0 : false;
  const reasons = recentPrearmReasons(v, now);
  if (!v.armed && (prearmFailing || reasons.length > 0)) {
    warn.push(...(reasons.length > 0 ? reasons : ['Pre-arm checks failing']));
  }

  const issues = [...bad, ...warn];
  const level: HealthLevel = bad.length > 0 ? 'bad' : warn.length > 0 ? 'warn' : v.sensors ? 'ok' : 'unknown';
  return { level, issues, sensors };
}
