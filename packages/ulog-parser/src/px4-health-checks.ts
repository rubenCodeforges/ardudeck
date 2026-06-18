// PX4 ULog health-check suite. Mirrors the contract and style of
// @ardudeck/dataflash-parser's runHealthChecks, but keys on PX4 uORB topic and
// field names (SI units, no centi/milli scaling). Each check skips gracefully
// when its source topic is absent so a partial log still yields a report.
import type {
  DataFlashLog,
  DataFlashMessage,
  HealthCheckResult,
  CheckStatus,
} from '@ardudeck/dataflash-parser';

export type { HealthCheckResult, CheckStatus } from '@ardudeck/dataflash-parser';

/** PX4 navigation_state (vehicle_status.nav_state) -> human name. Values from
 *  PX4 VehicleStatus.msg NAVIGATION_STATE_* constants. */
const PX4_NAV_STATE_NAMES: Record<number, string> = {
  0: 'Manual', 1: 'Altitude', 2: 'Position', 3: 'Mission', 4: 'Hold',
  5: 'Return', 6: 'Position Slow', 8: 'Altitude Cruise', 10: 'Acro',
  12: 'Descend', 13: 'Termination', 14: 'Offboard', 15: 'Stabilized',
  17: 'Takeoff', 18: 'Land', 19: 'Follow Target', 20: 'Precision Land',
  21: 'Orbit', 22: 'VTOL Takeoff',
};

export function px4ModeName(navState: number): string {
  return PX4_NAV_STATE_NAMES[navState] ?? `Mode ${navState}`;
}

function num(msg: DataFlashMessage, field: string): number | undefined {
  const val = msg.fields[field];
  return typeof val === 'number' ? val : undefined;
}

function checkBattery(log: DataFlashLog): HealthCheckResult {
  const bat = log.messages.get('battery_status');
  if (!bat || bat.length === 0) {
    return { id: 'battery', name: 'Battery', status: 'skip', summary: 'No battery data', details: 'battery_status messages not found in log' };
  }

  let maxVolt = 0, minVolt = Infinity, maxCurr = 0, maxDischarged = 0;
  for (const msg of bat) {
    const volt = num(msg, 'voltage_v') ?? 0;
    const curr = num(msg, 'current_a') ?? 0;
    const disc = num(msg, 'discharged_mah') ?? 0;
    if (volt > maxVolt) maxVolt = volt;
    if (volt > 0 && volt < minVolt) minVolt = volt;
    if (curr > maxCurr) maxCurr = curr;
    if (disc > maxDischarged) maxDischarged = disc;
  }
  if (minVolt === Infinity) minVolt = 0;

  const sag = maxVolt - minVolt;
  let status: CheckStatus = 'pass';
  let summary = `${minVolt.toFixed(1)}V - ${maxVolt.toFixed(1)}V, peak ${maxCurr.toFixed(0)}A`;

  if (sag > 2.0) {
    status = 'fail';
    summary = `Severe voltage sag: ${sag.toFixed(1)}V drop (${maxVolt.toFixed(1)}V → ${minVolt.toFixed(1)}V)`;
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
    details: `Range: ${minVolt.toFixed(1)}V - ${maxVolt.toFixed(1)}V. Sag: ${sag.toFixed(1)}V. Peak current: ${maxCurr.toFixed(1)}A. Discharged: ${maxDischarged.toFixed(0)} mAh.`,
    recommendation,
    explorerPreset: { types: ['battery_status'], fields: { battery_status: ['voltage_v', 'current_a'] } },
    values: { maxVolt, minVolt, sag, maxCurr, maxDischarged },
  };
}

function checkGps(log: DataFlashLog): HealthCheckResult {
  // Newer PX4 logs use sensor_gps; older use vehicle_gps_position. Same fields.
  const gps = log.messages.get('vehicle_gps_position') ?? log.messages.get('sensor_gps');
  if (!gps || gps.length === 0) {
    return { id: 'gps', name: 'GPS Quality', status: 'skip', summary: 'No GPS data', details: 'vehicle_gps_position / sensor_gps messages not found in log' };
  }
  const topic = log.messages.has('vehicle_gps_position') ? 'vehicle_gps_position' : 'sensor_gps';

  let minFix = Infinity, minSats = Infinity, maxHdop = 0, fix3dCount = 0;
  // Prefer hdop; fall back to eph (meters) when hdop is absent.
  let usedEph = false;
  for (const msg of gps) {
    const fix = num(msg, 'fix_type') ?? 0;
    const sats = num(msg, 'satellites_used') ?? 0;
    let acc = num(msg, 'hdop');
    if (acc === undefined) {
      acc = num(msg, 'eph') ?? 99;
      usedEph = true;
    }
    if (fix < minFix) minFix = fix;
    if (sats < minSats) minSats = sats;
    if (acc > maxHdop) maxHdop = acc;
    if (fix >= 3) fix3dCount++;
  }
  if (minFix === Infinity) minFix = 0;
  if (minSats === Infinity) minSats = 0;

  const fix3dPct = (fix3dCount / gps.length) * 100;
  const accLabel = usedEph ? 'EPH' : 'HDop';
  let status: CheckStatus = 'pass';
  let summary = `Min sats: ${minSats}, Max ${accLabel}: ${maxHdop.toFixed(1)}, 3D fix: ${fix3dPct.toFixed(0)}%`;

  if (minSats < 6 || maxHdop > 3.0 || fix3dPct < 80) {
    status = 'fail';
    summary = `Poor GPS: min ${minSats} sats, ${accLabel} ${maxHdop.toFixed(1)}, ${fix3dPct.toFixed(0)}% 3D fix`;
  } else if (minSats < 10 || maxHdop > 2.0 || fix3dPct < 95) {
    status = 'warn';
    summary = `Marginal GPS: min ${minSats} sats, ${accLabel} ${maxHdop.toFixed(1)}`;
  }

  const recommendation = status !== 'pass'
    ? 'Improve GPS antenna placement, move away from electronics. Check for RF interference. Wait for more satellites before arming.'
    : undefined;

  const accField = usedEph ? 'eph' : 'hdop';
  return {
    id: 'gps', name: 'GPS Quality', status, summary,
    details: `Min fix type: ${minFix}. Satellites: min ${minSats}. ${accLabel}: max ${maxHdop.toFixed(1)}. 3D fix: ${fix3dPct.toFixed(0)}% of samples.`,
    recommendation,
    explorerPreset: { types: [topic], fields: { [topic]: ['satellites_used', accField] } },
    values: { minFix, minSats, maxHdop, fix3dPct },
  };
}

function checkVibration(log: DataFlashLog): HealthCheckResult {
  const imu = log.messages.get('vehicle_imu_status');
  if (imu && imu.length > 0) {
    let peak = 0;
    for (const msg of imu) {
      const v = num(msg, 'accel_vibration_metric') ?? 0;
      if (v > peak) peak = v;
    }
    return vibrationResult(peak, 'vehicle_imu_status', 'accel_vibration_metric');
  }

  // Fallback: derive a peak vibration metric from sensor_combined accelerometer
  // as the per-sample deviation magnitude from the mean acceleration vector.
  const sc = log.messages.get('sensor_combined');
  if (sc && sc.length > 0) {
    let sumX = 0, sumY = 0, sumZ = 0, n = 0;
    for (const msg of sc) {
      const x = num(msg, 'accelerometer_m_s2[0]');
      const y = num(msg, 'accelerometer_m_s2[1]');
      const z = num(msg, 'accelerometer_m_s2[2]');
      if (x === undefined || y === undefined || z === undefined) continue;
      sumX += x; sumY += y; sumZ += z; n++;
    }
    if (n > 0) {
      const mx = sumX / n, my = sumY / n, mz = sumZ / n;
      let peak = 0;
      for (const msg of sc) {
        const x = num(msg, 'accelerometer_m_s2[0]');
        const y = num(msg, 'accelerometer_m_s2[1]');
        const z = num(msg, 'accelerometer_m_s2[2]');
        if (x === undefined || y === undefined || z === undefined) continue;
        const dev = Math.hypot(x - mx, y - my, z - mz);
        if (dev > peak) peak = dev;
      }
      return vibrationResult(peak, 'sensor_combined', 'accelerometer_m_s2[0]', 'accelerometer_m_s2[1]', 'accelerometer_m_s2[2]');
    }
  }

  return { id: 'vibration', name: 'Vibration', status: 'skip', summary: 'No vibration data', details: 'vehicle_imu_status / sensor_combined messages not found in log' };
}

function vibrationResult(peak: number, topic: string, ...fields: string[]): HealthCheckResult {
  // Thresholds mirror the ArduPilot m/s^2 heuristic (warn >30, fail >60) and
  // may need tuning against real PX4 data once samples are available.
  let status: CheckStatus = 'pass';
  let summary = `Peak: ${peak.toFixed(1)} m/s²`;
  if (peak > 60) {
    status = 'fail';
    summary = `Excessive vibration: ${peak.toFixed(1)} m/s²`;
  } else if (peak > 30) {
    status = 'warn';
    summary = `Elevated vibration: ${peak.toFixed(1)} m/s²`;
  }

  const recommendation = status === 'fail'
    ? 'Check propeller balance, motor bearings, and flight controller mounting. Consider adding vibration dampening.'
    : status === 'warn'
    ? 'Vibration is above ideal levels. Check propeller balance and motor mounts.'
    : undefined;

  return {
    id: 'vibration', name: 'Vibration', status, summary,
    details: `Peak vibration metric: ${peak.toFixed(1)} m/s² (from ${topic}).`,
    recommendation,
    explorerPreset: { types: [topic], fields: { [topic]: fields } },
    values: { peak },
  };
}

function checkEkf(log: DataFlashLog): HealthCheckResult {
  const est = log.messages.get('estimator_status');
  if (!est || est.length === 0) {
    return { id: 'ekf', name: 'EKF Health', status: 'skip', summary: 'No EKF data', details: 'estimator_status messages not found in log' };
  }

  const ratioFields = [
    'mag_test_ratio', 'vel_test_ratio', 'pos_test_ratio',
    'hgt_test_ratio', 'tas_test_ratio', 'hagl_test_ratio',
  ];
  let worstRatio = 0, worstField = '';
  // A ratio >= 1.0 is a failing innovation check. We require it to recur in a
  // meaningful share of samples (>=10%) before failing, so a single transient
  // spike does not flag the whole flight.
  let failingSamples = 0;
  for (const msg of est) {
    let sampleMax = 0;
    for (const f of ratioFields) {
      const r = num(msg, f);
      if (r === undefined) continue;
      if (r > sampleMax) sampleMax = r;
      if (r > worstRatio) { worstRatio = r; worstField = f; }
    }
    if (sampleMax >= 1.0) failingSamples++;
  }

  const failPct = (failingSamples / est.length) * 100;
  let status: CheckStatus = 'pass';
  let summary = `EKF healthy (worst ratio ${worstRatio.toFixed(2)})`;

  if (worstRatio >= 1.0 && failPct >= 10) {
    status = 'fail';
    summary = `EKF innovation failures: ${worstField} peaked at ${worstRatio.toFixed(2)} in ${failPct.toFixed(0)}% of samples`;
  } else if (worstRatio > 0.5) {
    status = 'warn';
    summary = `Marginal EKF: ${worstField} peaked at ${worstRatio.toFixed(2)}`;
  }

  const recommendation = status !== 'pass'
    ? 'High estimator test ratios indicate position/velocity/heading estimation problems. Check GPS quality, compass calibration, and vibration levels.'
    : undefined;

  return {
    id: 'ekf', name: 'EKF Health', status, summary,
    details: `Worst test ratio: ${worstField || 'none'} = ${worstRatio.toFixed(2)}. Samples with a ratio >= 1.0: ${failingSamples}/${est.length} (${failPct.toFixed(1)}%).`,
    recommendation,
    explorerPreset: { types: ['estimator_status'], fields: { estimator_status: ['mag_test_ratio', 'vel_test_ratio', 'pos_test_ratio'] } },
    values: { worstRatio, failPct },
  };
}

function checkFlightModes(log: DataFlashLog): HealthCheckResult {
  const status = log.messages.get('vehicle_status');
  if (!status || status.length === 0) {
    return { id: 'flight-modes', name: 'Flight Modes', status: 'skip', summary: 'No mode data', details: 'vehicle_status messages not found in log' };
  }

  // Collapse consecutive identical nav_state samples into a mode timeline.
  const segments: Array<{ name: string; timeUs: number }> = [];
  let lastNav = NaN;
  for (const msg of status) {
    const nav = num(msg, 'nav_state');
    if (nav === undefined) continue;
    if (nav !== lastNav) {
      segments.push({ name: px4ModeName(nav), timeUs: msg.timeUs });
      lastNav = nav;
    }
  }

  if (segments.length === 0) {
    return { id: 'flight-modes', name: 'Flight Modes', status: 'skip', summary: 'No nav_state samples', details: 'vehicle_status present but no nav_state field found' };
  }

  const uniqueNames = [...new Set(segments.map((s) => s.name))];
  return {
    id: 'flight-modes', name: 'Flight Modes', status: 'info',
    summary: `${segments.length} mode change(s): ${uniqueNames.join(', ')}`,
    details: segments.map((s) => `${(s.timeUs / 1_000_000).toFixed(1)}s: ${s.name}`).join(' → '),
    values: { segments: segments.length, unique: uniqueNames.length },
  };
}

function checkArming(log: DataFlashLog): HealthCheckResult {
  const status = log.messages.get('vehicle_status');
  if (!status || status.length === 0) {
    return { id: 'arming', name: 'Arming', status: 'skip', summary: 'No arming data', details: 'vehicle_status messages not found in log' };
  }

  // arming_state semantics vary by PX4 version (newer: 0 init, 1 standby,
  // 2 armed; older: 1 standby, 2 armed). In both, value 2 is ARMED, so we
  // treat the armed predicate best-effort as arming_state === 2.
  let armCount = 0, disarmCount = 0, armedDurationUs = 0;
  let wasArmed = false, lastArmStartUs = 0, sawState = false;
  for (const msg of status) {
    const st = num(msg, 'arming_state');
    if (st === undefined) continue;
    sawState = true;
    const armed = st === 2;
    if (armed && !wasArmed) {
      armCount++;
      lastArmStartUs = msg.timeUs;
    } else if (!armed && wasArmed) {
      disarmCount++;
      armedDurationUs += msg.timeUs - lastArmStartUs;
    }
    wasArmed = armed;
  }
  // Still armed at end of log: account up to the last timestamp.
  if (wasArmed) {
    const lastTs = status[status.length - 1]?.timeUs ?? lastArmStartUs;
    armedDurationUs += lastTs - lastArmStartUs;
  }

  if (!sawState) {
    return { id: 'arming', name: 'Arming', status: 'skip', summary: 'No arming_state samples', details: 'vehicle_status present but no arming_state field found' };
  }

  const armedDurationS = armedDurationUs / 1_000_000;
  return {
    id: 'arming', name: 'Arming', status: 'info',
    summary: `${armCount} arm event(s), ${armedDurationS.toFixed(0)}s armed`,
    details: `Arm events: ${armCount}. Disarm events: ${disarmCount}. Total armed time: ${armedDurationS.toFixed(1)}s. (arming_state == 2 treated as ARMED.)`,
    values: { armCount, disarmCount, armedDurationS },
  };
}

function checkEvents(log: DataFlashLog): HealthCheckResult {
  const strings = log.messages.get('LOGGED_STRING');
  if (!strings || strings.length === 0) {
    return { id: 'events', name: 'Log Events', status: 'skip', summary: 'No log events', details: 'LOGGED_STRING messages not found in log' };
  }

  // syslog levels: 0-3 error class, 4 warning, 5-7 info.
  const errors: DataFlashMessage[] = [];
  const warnings: DataFlashMessage[] = [];
  for (const msg of strings) {
    const level = num(msg, 'Level') ?? 7;
    if (level <= 3) errors.push(msg);
    else if (level === 4) warnings.push(msg);
  }

  const fmt = (msg: DataFlashMessage): string => {
    const timeS = (msg.timeUs / 1e6).toFixed(1);
    const text = typeof msg.fields['Message'] === 'string' ? msg.fields['Message'] : '';
    return `${timeS}s: ${text}`;
  };
  const sample = [...errors, ...warnings].slice(0, 8).map(fmt).join('; ');

  let status: CheckStatus = 'pass';
  let summary = 'No errors or warnings logged';
  if (errors.length > 0) {
    status = 'fail';
    summary = `${errors.length} error event(s), ${warnings.length} warning(s)`;
  } else if (warnings.length > 0) {
    status = 'warn';
    summary = `${warnings.length} warning event(s)`;
  }

  const recommendation = status !== 'pass'
    ? 'Review the logged events for the underlying cause (sensor failures, failsafes, calibration issues) around the listed timestamps.'
    : undefined;

  return {
    id: 'events', name: 'Log Events', status, summary,
    details: sample.length > 0 ? sample : 'No error or warning level messages.',
    recommendation,
    values: { errors: errors.length, warnings: warnings.length },
  };
}

function checkFlightStats(log: DataFlashLog): HealthCheckResult {
  const local = log.messages.get('vehicle_local_position');
  const global = log.messages.get('vehicle_global_position');
  if ((!local || local.length === 0) && (!global || global.length === 0)) {
    return { id: 'flight-stats', name: 'Flight Statistics', status: 'skip', summary: 'No position data', details: 'vehicle_local_position / vehicle_global_position messages not found in log' };
  }

  let maxAltitude = 0, maxHorizSpeed = 0, distance = 0;
  let haveAltitude = false;

  if (local && local.length > 0) {
    let prevX: number | undefined, prevY: number | undefined;
    for (const msg of local) {
      const z = num(msg, 'z');
      if (z !== undefined) {
        const alt = -z; // NED: negative z is up.
        if (alt > maxAltitude) maxAltitude = alt;
        haveAltitude = true;
      }
      const vx = num(msg, 'vx') ?? 0;
      const vy = num(msg, 'vy') ?? 0;
      const speed = Math.hypot(vx, vy);
      if (speed > maxHorizSpeed) maxHorizSpeed = speed;
      const x = num(msg, 'x');
      const y = num(msg, 'y');
      if (x !== undefined && y !== undefined) {
        if (prevX !== undefined && prevY !== undefined) {
          distance += Math.hypot(x - prevX, y - prevY);
        }
        prevX = x; prevY = y;
      }
    }
  }

  // Global AMSL altitude fallback when local position altitude is unavailable.
  if (!haveAltitude && global && global.length > 0) {
    for (const msg of global) {
      const alt = num(msg, 'alt');
      if (alt === undefined) continue;
      if (alt > maxAltitude) maxAltitude = alt;
      haveAltitude = true;
    }
  }

  const durationS = (log.timeRange.endUs - log.timeRange.startUs) / 1_000_000;
  const altStr = haveAltitude ? `${maxAltitude.toFixed(0)} m` : 'n/a';

  return {
    id: 'flight-stats', name: 'Flight Statistics', status: 'info',
    summary: `Max alt ${altStr}, max speed ${maxHorizSpeed.toFixed(1)} m/s, ${distance.toFixed(0)} m traveled, ${durationS.toFixed(0)}s`,
    details: `Max altitude: ${altStr}. Max horizontal speed: ${maxHorizSpeed.toFixed(1)} m/s. Horizontal distance: ${distance.toFixed(1)} m. Duration: ${durationS.toFixed(1)}s.`,
    values: { maxAltitude, maxHorizSpeed, distance, durationS },
  };
}

/** Run all PX4 health checks. Order: hardware health (battery, GPS, vibration,
 *  EKF) first, then operational context (flight modes, arming, events), then
 *  the descriptive flight statistics last. */
export function runPx4HealthChecks(log: DataFlashLog): HealthCheckResult[] {
  return [
    checkBattery(log),
    checkGps(log),
    checkVibration(log),
    checkEkf(log),
    checkFlightModes(log),
    checkArming(log),
    checkEvents(log),
    checkFlightStats(log),
  ];
}
