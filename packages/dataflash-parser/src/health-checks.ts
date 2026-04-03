import type { DataFlashLog, DataFlashMessage } from './types.js';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'skip' | 'info';

/** Fields to pre-select when jumping to Explorer from a health card */
export interface ExplorerPreset {
  types: string[];
  fields: Record<string, string[]>;
}

export interface HealthCheckResult {
  id: string;
  name: string;
  status: CheckStatus;
  summary: string;
  details: string;
  recommendation?: string;
  explorerPreset?: ExplorerPreset;
  values?: Record<string, number | string>;
}

/** ArduPilot Copter flight mode names */
export const COPTER_MODE_NAMES: Record<number, string> = {
  0: 'STABILIZE', 1: 'ACRO', 2: 'ALT_HOLD', 3: 'AUTO', 4: 'GUIDED',
  5: 'LOITER', 6: 'RTL', 7: 'CIRCLE', 9: 'LAND', 11: 'DRIFT',
  13: 'SPORT', 14: 'FLIP', 15: 'AUTOTUNE', 16: 'POSHOLD', 17: 'BRAKE',
  18: 'THROW', 19: 'AVOID_ADSB', 20: 'GUIDED_NOGPS', 21: 'SMART_RTL',
  22: 'FLOWHOLD', 23: 'FOLLOW', 24: 'ZIGZAG', 25: 'SYSTEMID',
  26: 'AUTOROTATE', 27: 'AUTO_RTL',
};

export const PLANE_MODE_NAMES: Record<number, string> = {
  0: 'MANUAL', 1: 'CIRCLE', 2: 'STABILIZE', 3: 'TRAINING', 4: 'ACRO',
  5: 'FBWA', 6: 'FBWB', 7: 'CRUISE', 8: 'AUTOTUNE', 10: 'AUTO',
  11: 'RTL', 12: 'LOITER', 14: 'AVOID_ADSB', 15: 'GUIDED',
  17: 'QSTABILIZE', 18: 'QHOVER', 19: 'QLOITER', 20: 'QLAND',
  21: 'QRTL', 22: 'QAUTOTUNE', 23: 'QACRO', 25: 'THERMAL',
};

export const ROVER_MODE_NAMES: Record<number, string> = {
  0: 'MANUAL', 1: 'ACRO', 3: 'STEERING', 4: 'HOLD', 5: 'LOITER',
  6: 'FOLLOW', 7: 'SIMPLE', 10: 'AUTO', 11: 'RTL', 12: 'SMART_RTL',
  15: 'GUIDED',
};

/** Get mode name from number, using vehicle type to pick the right map */
export function getModeName(modeNum: number, vehicleType: string): string {
  const map = vehicleType === 'plane' ? PLANE_MODE_NAMES
    : vehicleType === 'rover' ? ROVER_MODE_NAMES
    : COPTER_MODE_NAMES;
  return map[modeNum] ?? `MODE_${modeNum}`;
}

const FAILSAFE_EVENT_IDS = new Set([
  9, 10, 11, 17, 28, 33, 43, 56,
]);

const CRASH_EVENT_IDS = new Set([15, 16]);

function num(msg: DataFlashMessage, field: string): number | undefined {
  const val = msg.fields[field];
  return typeof val === 'number' ? val : undefined;
}

function checkVibration(log: DataFlashLog): HealthCheckResult {
  const vibes = log.messages.get('VIBE');
  if (!vibes || vibes.length === 0) {
    return { id: 'vibration', name: 'Vibration', status: 'skip', summary: 'No vibration data', details: 'VIBE messages not found in log' };
  }

  let maxX = 0, maxY = 0, maxZ = 0, totalClips = 0;
  for (const msg of vibes) {
    const x = Math.abs(num(msg, 'VibeX') ?? 0);
    const y = Math.abs(num(msg, 'VibeY') ?? 0);
    const z = Math.abs(num(msg, 'VibeZ') ?? 0);
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
    totalClips += (num(msg, 'Clip0') ?? 0) + (num(msg, 'Clip1') ?? 0) + (num(msg, 'Clip2') ?? 0);
  }

  const maxVibe = Math.max(maxX, maxY, maxZ);
  let status: CheckStatus = 'pass';
  let summary = `Peak: ${maxVibe.toFixed(1)} m/s\u00B2`;

  if (maxVibe > 60 || totalClips > 0) {
    status = 'fail';
    summary = `Excessive vibration: ${maxVibe.toFixed(1)} m/s\u00B2` + (totalClips > 0 ? `, ${totalClips} clipping events` : '');
  } else if (maxVibe > 30) {
    status = 'warn';
    summary = `Elevated vibration: ${maxVibe.toFixed(1)} m/s\u00B2`;
  }

  const recommendation = status === 'fail'
    ? 'Check propeller balance, motor bearings, and flight controller mounting. Consider adding vibration dampening.'
    : status === 'warn'
    ? 'Vibration is above ideal levels. Check propeller balance and motor mounts.'
    : undefined;

  return {
    id: 'vibration', name: 'Vibration', status, summary,
    details: `X: ${maxX.toFixed(1)}, Y: ${maxY.toFixed(1)}, Z: ${maxZ.toFixed(1)} m/s\u00B2 peak. ${totalClips} clipping events.`,
    recommendation,
    explorerPreset: { types: ['VIBE'], fields: { VIBE: ['VibeX', 'VibeY', 'VibeZ'] } },
    values: { maxX, maxY, maxZ, totalClips },
  };
}

function checkGps(log: DataFlashLog): HealthCheckResult {
  const gps = log.messages.get('GPS');
  if (!gps || gps.length === 0) {
    return { id: 'gps', name: 'GPS Quality', status: 'skip', summary: 'No GPS data', details: 'GPS messages not found in log' };
  }

  let minSats = Infinity, maxHdop = 0, fix3dCount = 0;
  for (const msg of gps) {
    const sats = num(msg, 'NSats') ?? 0;
    const hdop = num(msg, 'HDop') ?? 99;
    const status = num(msg, 'Status') ?? 0;
    if (sats < minSats) minSats = sats;
    if (hdop > maxHdop) maxHdop = hdop;
    if (status >= 3) fix3dCount++;
  }

  const fix3dPct = (fix3dCount / gps.length) * 100;
  let status: CheckStatus = 'pass';
  let summary = `Min sats: ${minSats}, Max HDop: ${maxHdop.toFixed(1)}, 3D fix: ${fix3dPct.toFixed(0)}%`;

  if (minSats < 6 || maxHdop > 3.0 || fix3dPct < 80) {
    status = 'fail';
    summary = `Poor GPS: min ${minSats} sats, HDop ${maxHdop.toFixed(1)}, ${fix3dPct.toFixed(0)}% 3D fix`;
  } else if (minSats < 10 || maxHdop > 2.0 || fix3dPct < 95) {
    status = 'warn';
    summary = `Marginal GPS: min ${minSats} sats, HDop ${maxHdop.toFixed(1)}`;
  }

  const recommendation = status !== 'pass'
    ? 'Improve GPS antenna placement — move away from electronics. Check for RF interference. Wait for more satellites before arming.'
    : undefined;

  return {
    id: 'gps', name: 'GPS Quality', status, summary,
    details: `Satellites: min ${minSats}. HDop: max ${maxHdop.toFixed(1)}. 3D fix: ${fix3dPct.toFixed(0)}% of samples.`,
    recommendation,
    explorerPreset: { types: ['GPS'], fields: { GPS: ['NSats', 'HDop'] } },
    values: { minSats, maxHdop, fix3dPct },
  };
}

function checkBattery(log: DataFlashLog): HealthCheckResult {
  const bat = log.messages.get('BAT');
  if (!bat || bat.length === 0) {
    return { id: 'battery', name: 'Battery', status: 'skip', summary: 'No battery data', details: 'BAT messages not found in log' };
  }

  let maxVolt = 0, minVolt = Infinity, maxCurr = 0;
  for (const msg of bat) {
    const volt = num(msg, 'Volt') ?? 0;
    const curr = num(msg, 'Curr') ?? 0;
    if (volt > maxVolt) maxVolt = volt;
    if (volt > 0 && volt < minVolt) minVolt = volt;
    if (curr > maxCurr) maxCurr = curr;
  }

  const sag = maxVolt - minVolt;
  let status: CheckStatus = 'pass';
  let summary = `${minVolt.toFixed(1)}V - ${maxVolt.toFixed(1)}V, peak ${maxCurr.toFixed(0)}A`;

  if (sag > 2.0) {
    status = 'fail';
    summary = `Severe voltage sag: ${sag.toFixed(1)}V drop (${maxVolt.toFixed(1)}V \u2192 ${minVolt.toFixed(1)}V)`;
  } else if (sag > 1.0) {
    status = 'warn';
    summary = `Voltage sag: ${sag.toFixed(1)}V drop under ${maxCurr.toFixed(0)}A load`;
  }

  const recommendation = status === 'fail'
    ? 'Battery cannot handle the current draw. Use a higher C-rating battery, reduce weight, or check for a failing motor drawing excess current.'
    : status === 'warn'
    ? 'Some voltage sag under load. Monitor battery health and consider a higher C-rating pack.'
    : undefined;

  return {
    id: 'battery', name: 'Battery', status, summary,
    details: `Range: ${minVolt.toFixed(1)}V - ${maxVolt.toFixed(1)}V. Sag: ${sag.toFixed(1)}V. Peak current: ${maxCurr.toFixed(1)}A.`,
    recommendation,
    explorerPreset: { types: ['BAT'], fields: { BAT: ['Volt', 'Curr'] } },
    values: { maxVolt, minVolt, sag, maxCurr },
  };
}

function checkCompass(log: DataFlashLog): HealthCheckResult {
  const mag = log.messages.get('MAG');
  if (!mag || mag.length === 0) {
    return { id: 'compass', name: 'Compass', status: 'skip', summary: 'No compass data', details: 'MAG messages not found in log' };
  }

  let maxOfsX = 0, maxOfsY = 0, maxOfsZ = 0;
  for (const msg of mag) {
    const ox = Math.abs(num(msg, 'OfsX') ?? 0);
    const oy = Math.abs(num(msg, 'OfsY') ?? 0);
    const oz = Math.abs(num(msg, 'OfsZ') ?? 0);
    if (ox > maxOfsX) maxOfsX = ox;
    if (oy > maxOfsY) maxOfsY = oy;
    if (oz > maxOfsZ) maxOfsZ = oz;
  }

  const maxOfs = Math.max(maxOfsX, maxOfsY, maxOfsZ);
  let status: CheckStatus = 'pass';
  let summary = `Max offset: ${maxOfs.toFixed(0)}`;

  if (maxOfs > 600) {
    status = 'fail';
    summary = `Compass offsets very high: ${maxOfs.toFixed(0)} \u2014 recalibrate`;
  } else if (maxOfs > 300) {
    status = 'warn';
    summary = `Compass offsets elevated: ${maxOfs.toFixed(0)}`;
  }

  const recommendation = status !== 'pass'
    ? 'Run compass calibration. Move compass away from power wires and motors. Run CompassMot to measure interference.'
    : undefined;

  return {
    id: 'compass', name: 'Compass', status, summary,
    details: `Offsets X: ${maxOfsX.toFixed(0)}, Y: ${maxOfsY.toFixed(0)}, Z: ${maxOfsZ.toFixed(0)}.`,
    recommendation,
    explorerPreset: { types: ['MAG'], fields: { MAG: ['MagX', 'MagY', 'MagZ'] } },
    values: { maxOfsX, maxOfsY, maxOfsZ },
  };
}

function checkFailsafe(log: DataFlashLog): HealthCheckResult {
  const events = log.messages.get('EV');
  if (!events || events.length === 0) {
    return { id: 'failsafe', name: 'Failsafe Events', status: 'skip', summary: 'No event data', details: 'EV messages not found in log' };
  }

  const failsafes: DataFlashMessage[] = [];
  const crashes: DataFlashMessage[] = [];
  for (const msg of events) {
    const id = num(msg, 'Id') ?? 0;
    if (FAILSAFE_EVENT_IDS.has(id)) failsafes.push(msg);
    if (CRASH_EVENT_IDS.has(id)) crashes.push(msg);
  }

  if (crashes.length > 0) {
    return {
      id: 'failsafe', name: 'Failsafe Events', status: 'fail',
      summary: `${crashes.length} crash event(s), ${failsafes.length} failsafe event(s)`,
      details: `Detected ${crashes.length} crash and ${failsafes.length} failsafe events in flight log.`,
      recommendation: 'Review ATT (Attitude) data around the crash event. Compare DesRoll vs Roll to identify mechanical failure or loss of control.',
      explorerPreset: { types: ['ATT'], fields: { ATT: ['DesRoll', 'Roll', 'DesPitch', 'Pitch'] } },
      values: { failsafeCount: failsafes.length, crashCount: crashes.length },
    };
  }

  if (failsafes.length > 0) {
    return {
      id: 'failsafe', name: 'Failsafe Events', status: 'fail',
      summary: `${failsafes.length} failsafe event(s) detected`,
      details: `Detected ${failsafes.length} failsafe events in flight log.`,
      recommendation: 'Check failsafe configuration. Review battery voltage, RC signal, and GPS quality around the event time.',
      explorerPreset: { types: ['BAT', 'GPS'], fields: { BAT: ['Volt', 'Curr'], GPS: ['NSats', 'HDop'] } },
      values: { failsafeCount: failsafes.length, crashCount: 0 },
    };
  }

  return { id: 'failsafe', name: 'Failsafe Events', status: 'pass', summary: 'No failsafe events', details: 'No failsafe or crash events detected.' };
}

function checkPower(log: DataFlashLog): HealthCheckResult {
  const powr = log.messages.get('POWR');
  if (!powr || powr.length === 0) {
    return { id: 'power', name: 'Power', status: 'skip', summary: 'No power data', details: 'POWR messages not found in log' };
  }

  let minVcc = Infinity, brownoutCount = 0;
  for (const msg of powr) {
    const vcc = num(msg, 'Vcc') ?? 5.0;
    if (vcc < minVcc) minVcc = vcc;
    if (vcc < 4.5) brownoutCount++;
  }

  let status: CheckStatus = 'pass';
  let summary = `Min Vcc: ${minVcc.toFixed(2)}V`;

  if (minVcc < 4.3) {
    status = 'fail';
    summary = `Brown-out detected: Vcc dropped to ${minVcc.toFixed(2)}V`;
  } else if (minVcc < 4.6) {
    status = 'warn';
    summary = `Low Vcc: ${minVcc.toFixed(2)}V`;
  }

  const recommendation = status === 'fail'
    ? 'Board power supply is unstable. Check power module, BEC, and wiring. Voltage drops below 4.5V can cause flight controller resets mid-flight.'
    : status === 'warn'
    ? 'Board voltage is marginally low. Verify power module output and check for voltage ripple.'
    : undefined;

  return {
    id: 'power', name: 'Power', status, summary,
    details: `Min Vcc: ${minVcc.toFixed(2)}V. Low voltage samples: ${brownoutCount}.`,
    recommendation,
    explorerPreset: { types: ['POWR'], fields: { POWR: ['Vcc'] } },
    values: { minVcc, brownoutCount },
  };
}

function checkFlightModes(log: DataFlashLog): HealthCheckResult {
  const modes = log.messages.get('MODE');
  if (!modes || modes.length === 0) {
    return { id: 'flight-modes', name: 'Flight Modes', status: 'skip', summary: 'No mode data', details: 'MODE messages not found in log' };
  }

  const vehicleType = log.metadata.vehicleType || 'copter';
  const modeNames = modes.map((m) => {
    const modeNum = num(m, 'ModeNum') ?? num(m, 'Mode') ?? 0;
    // Prefer the Name field if the log has it (newer ArduPilot), otherwise decode
    const nameField = m.fields['Name'];
    if (typeof nameField === 'string' && nameField.length > 0) return nameField;
    return getModeName(modeNum, vehicleType);
  });

  return {
    id: 'flight-modes', name: 'Flight Modes', status: 'info',
    summary: `${modes.length} mode change(s): ${[...new Set(modeNames)].join(', ')}`,
    details: modeNames.map((n, i) => {
      const timeS = ((modes[i]?.timeUs ?? 0) / 1_000_000).toFixed(1);
      return `${timeS}s: ${n}`;
    }).join(' \u2192 '),
  };
}

function checkEkf(log: DataFlashLog): HealthCheckResult {
  const nkf = log.messages.get('NKF4') ?? log.messages.get('EKF4');
  if (!nkf || nkf.length === 0) {
    return { id: 'ekf', name: 'EKF Health', status: 'skip', summary: 'No EKF data', details: 'NKF4/EKF4 messages not found in log' };
  }

  let maxSV = 0, badCount = 0;
  for (const msg of nkf) {
    const sv = num(msg, 'SV') ?? 0;
    if (sv > maxSV) maxSV = sv;
    if (sv !== 0) badCount++;
  }

  const badPct = (badCount / nkf.length) * 100;
  let status: CheckStatus = 'pass';
  let summary = 'EKF healthy';

  if (badPct > 20) {
    status = 'fail';
    summary = `EKF issues in ${badPct.toFixed(0)}% of samples`;
  } else if (badPct > 5) {
    status = 'warn';
    summary = `Minor EKF issues in ${badPct.toFixed(0)}% of samples`;
  }

  const recommendation = status !== 'pass'
    ? 'EKF variance indicates position/velocity estimation problems. Check GPS quality, compass calibration, and vibration levels.'
    : undefined;
  const nkfType = log.messages.has('NKF4') ? 'NKF4' : 'EKF4';

  return {
    id: 'ekf', name: 'EKF Health', status, summary,
    details: `Innovation flags non-zero in ${badCount}/${nkf.length} samples (${badPct.toFixed(1)}%).`,
    recommendation,
    explorerPreset: { types: [nkfType], fields: { [nkfType]: ['SV', 'SP', 'SH'] } },
    values: { maxSV, badPct },
  };
}

/** Run all health checks against a parsed log */
export function runHealthChecks(log: DataFlashLog): HealthCheckResult[] {
  return [
    checkVibration(log),
    checkGps(log),
    checkBattery(log),
    checkCompass(log),
    checkEkf(log),
    checkFailsafe(log),
    checkPower(log),
    checkFlightModes(log),
  ];
}
