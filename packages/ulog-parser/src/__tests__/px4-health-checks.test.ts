import { describe, it, expect } from 'vitest';
import type { DataFlashLog, DataFlashMessage } from '@ardudeck/dataflash-parser';
import { runPx4HealthChecks, px4ModeName } from '../px4-health-checks.js';
import type { HealthCheckResult } from '../px4-health-checks.js';

// Build a terse DataFlashLog from a partial messages map. Each entry is an
// array of field records; we wrap them into DataFlashMessage objects, using
// the field 'timestamp' (PX4 microseconds) as timeUs when present.
function makeLog(
  messages: Record<string, Array<Record<string, number | string>>>,
  timeRange: { startUs: number; endUs: number } = { startUs: 0, endUs: 0 },
): DataFlashLog {
  const map = new Map<string, DataFlashMessage[]>();
  for (const [type, rows] of Object.entries(messages)) {
    map.set(
      type,
      rows.map((fields) => {
        const t = fields['timestamp'] ?? fields['timeUs'];
        return {
          type,
          timeUs: typeof t === 'number' ? t : 0,
          fields,
        };
      }),
    );
  }
  return {
    format: 'ulog',
    formats: new Map(),
    messages: map,
    metadata: {
      vehicleType: '',
      firmwareVersion: '',
      firmwareString: '',
      boardType: '',
      gitHash: '',
    },
    timeRange,
    messageTypes: Array.from(map.keys()).sort(),
    unitLabels: new Map(),
    multValues: new Map(),
  };
}

function find(results: HealthCheckResult[], id: string): HealthCheckResult {
  const r = results.find((x) => x.id === id);
  if (!r) throw new Error(`no result with id ${id}`);
  return r;
}

describe('px4ModeName', () => {
  it('maps known nav_state values', () => {
    expect(px4ModeName(0)).toBe('Manual');
    expect(px4ModeName(3)).toBe('Mission');
    expect(px4ModeName(5)).toBe('Return');
    expect(px4ModeName(22)).toBe('VTOL Takeoff');
  });
  it('falls back to Mode <n> for unknown values', () => {
    expect(px4ModeName(99)).toBe('Mode 99');
    expect(px4ModeName(7)).toBe('Mode 7');
  });
});

describe('runPx4HealthChecks ordering and completeness', () => {
  it('returns all eight checks in a stable order', () => {
    const results = runPx4HealthChecks(makeLog({}));
    expect(results.map((r) => r.id)).toEqual([
      'battery',
      'gps',
      'vibration',
      'ekf',
      'flight-modes',
      'arming',
      'events',
      'flight-stats',
    ]);
  });
  it('skips every check gracefully on an empty log', () => {
    const results = runPx4HealthChecks(makeLog({}));
    for (const r of results) {
      expect(['skip', 'info']).toContain(r.status);
    }
  });
});

describe('checkBattery', () => {
  it('passes within range', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          battery_status: [
            { voltage_v: 16.8, current_a: 5, discharged_mah: 0 },
            { voltage_v: 16.5, current_a: 20, discharged_mah: 500 },
          ],
        }),
      ),
      'battery',
    );
    expect(r.status).toBe('pass');
    expect(r.explorerPreset?.types).toEqual(['battery_status']);
  });
  it('warns on moderate sag (>1.0V)', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          battery_status: [
            { voltage_v: 16.8, current_a: 5 },
            { voltage_v: 15.4, current_a: 60 },
          ],
        }),
      ),
      'battery',
    );
    expect(r.status).toBe('warn');
  });
  it('fails on severe sag (>2.0V)', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          battery_status: [
            { voltage_v: 16.8, current_a: 5 },
            { voltage_v: 14.0, current_a: 90 },
          ],
        }),
      ),
      'battery',
    );
    expect(r.status).toBe('fail');
    expect(r.values?.sag).toBeCloseTo(2.8, 5);
  });
  it('ignores zero-voltage samples in min voltage', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          battery_status: [
            { voltage_v: 0, current_a: 0 },
            { voltage_v: 16.0, current_a: 10 },
            { voltage_v: 15.5, current_a: 20 },
          ],
        }),
      ),
      'battery',
    );
    expect(r.values?.minVolt).toBeCloseTo(15.5, 5);
  });
  it('skips when absent', () => {
    expect(find(runPx4HealthChecks(makeLog({})), 'battery').status).toBe('skip');
  });
});

describe('checkGps', () => {
  it('passes with good fix', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_gps_position: [
            { fix_type: 3, satellites_used: 14, hdop: 0.8 },
            { fix_type: 4, satellites_used: 16, hdop: 0.7 },
          ],
        }),
      ),
      'gps',
    );
    expect(r.status).toBe('pass');
  });
  it('fails on low satellites', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_gps_position: [
            { fix_type: 3, satellites_used: 5, hdop: 1.0 },
            { fix_type: 3, satellites_used: 8, hdop: 1.1 },
          ],
        }),
      ),
      'gps',
    );
    expect(r.status).toBe('fail');
    expect(r.values?.minSats).toBe(5);
  });
  it('fails when fewer than 80% of samples are 3D fix', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_gps_position: [
            { fix_type: 1, satellites_used: 12, hdop: 1.0 },
            { fix_type: 1, satellites_used: 12, hdop: 1.0 },
            { fix_type: 3, satellites_used: 12, hdop: 1.0 },
          ],
        }),
      ),
      'gps',
    );
    expect(r.status).toBe('fail');
  });
  it('reads from sensor_gps when vehicle_gps_position absent', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          sensor_gps: [{ fix_type: 3, satellites_used: 12, hdop: 0.9 }],
        }),
      ),
      'gps',
    );
    expect(r.status).toBe('pass');
  });
  it('falls back to eph when hdop missing', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_gps_position: [
            { fix_type: 3, satellites_used: 12, eph: 0.9 },
          ],
        }),
      ),
      'gps',
    );
    expect(r.status).toBe('pass');
    expect(r.values?.maxHdop).toBeCloseTo(0.9, 5);
  });
  it('skips when absent', () => {
    expect(find(runPx4HealthChecks(makeLog({})), 'gps').status).toBe('skip');
  });
});

describe('checkVibration', () => {
  it('passes with low vibration', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_imu_status: [
            { accel_vibration_metric: 5, gyro_vibration_metric: 0.01 },
            { accel_vibration_metric: 8, gyro_vibration_metric: 0.02 },
          ],
        }),
      ),
      'vibration',
    );
    expect(r.status).toBe('pass');
  });
  it('warns above 30', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_imu_status: [{ accel_vibration_metric: 35 }],
        }),
      ),
      'vibration',
    );
    expect(r.status).toBe('warn');
  });
  it('fails above 60', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_imu_status: [{ accel_vibration_metric: 70 }],
        }),
      ),
      'vibration',
    );
    expect(r.status).toBe('fail');
    expect(r.values?.peak).toBe(70);
  });
  it('falls back to sensor_combined accelerometer magnitude', () => {
    // Magnitude of (0,0,9.8) variation. We feed accel vectors; check derives a
    // vibration metric from the spread. Just confirm it does not skip and
    // produces a sensible peak.
    const r = find(
      runPx4HealthChecks(
        makeLog({
          sensor_combined: [
            { 'accelerometer_m_s2[0]': 0.5, 'accelerometer_m_s2[1]': 0.3, 'accelerometer_m_s2[2]': 9.8 },
            { 'accelerometer_m_s2[0]': 40, 'accelerometer_m_s2[1]': 0, 'accelerometer_m_s2[2]': 0 },
          ],
        }),
      ),
      'vibration',
    );
    expect(r.status).not.toBe('skip');
  });
  it('skips when absent', () => {
    expect(find(runPx4HealthChecks(makeLog({})), 'vibration').status).toBe('skip');
  });
});

describe('checkEkf', () => {
  it('passes with low test ratios', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          estimator_status: [
            { mag_test_ratio: 0.2, vel_test_ratio: 0.1, pos_test_ratio: 0.3 },
            { mag_test_ratio: 0.25, vel_test_ratio: 0.15, pos_test_ratio: 0.2 },
          ],
        }),
      ),
      'ekf',
    );
    expect(r.status).toBe('pass');
  });
  it('warns when a ratio exceeds 0.5', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          estimator_status: [
            { mag_test_ratio: 0.7, vel_test_ratio: 0.1, pos_test_ratio: 0.1 },
            { mag_test_ratio: 0.6, vel_test_ratio: 0.1, pos_test_ratio: 0.1 },
          ],
        }),
      ),
      'ekf',
    );
    expect(r.status).toBe('warn');
    expect(r.values?.worstRatio).toBeCloseTo(0.7, 5);
  });
  it('fails when a ratio is >=1.0 across a meaningful share of samples', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          estimator_status: [
            { mag_test_ratio: 1.5, vel_test_ratio: 0.1, pos_test_ratio: 0.1 },
            { mag_test_ratio: 1.2, vel_test_ratio: 0.1, pos_test_ratio: 0.1 },
            { mag_test_ratio: 1.1, vel_test_ratio: 0.1, pos_test_ratio: 0.1 },
          ],
        }),
      ),
      'ekf',
    );
    expect(r.status).toBe('fail');
    expect(r.values?.worstRatio).toBeCloseTo(1.5, 5);
  });
  it('does not fail on a single transient ratio spike', () => {
    // One bad sample out of many is not a meaningful share -> warn at most.
    const rows = Array.from({ length: 50 }, () => ({
      mag_test_ratio: 0.2,
      vel_test_ratio: 0.2,
      pos_test_ratio: 0.2,
    }));
    rows[0] = { mag_test_ratio: 1.4, vel_test_ratio: 0.2, pos_test_ratio: 0.2 };
    const r = find(runPx4HealthChecks(makeLog({ estimator_status: rows })), 'ekf');
    expect(r.status).not.toBe('fail');
  });
  it('skips when absent', () => {
    expect(find(runPx4HealthChecks(makeLog({})), 'ekf').status).toBe('skip');
  });
});

describe('checkFlightModes', () => {
  it('collapses consecutive identical nav_state and maps names', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_status: [
            { timestamp: 1_000_000, nav_state: 0 },
            { timestamp: 2_000_000, nav_state: 0 },
            { timestamp: 3_000_000, nav_state: 3 },
            { timestamp: 4_000_000, nav_state: 3 },
            { timestamp: 5_000_000, nav_state: 5 },
          ],
        }),
      ),
      'flight-modes',
    );
    expect(r.status).toBe('info');
    // Three distinct segments after collapsing.
    expect(r.summary).toContain('3');
    expect(r.summary).toContain('Manual');
    expect(r.summary).toContain('Mission');
    expect(r.summary).toContain('Return');
    expect(r.details).toContain('1.0s: Manual');
    expect(r.details).toContain('3.0s: Mission');
    expect(r.details).toContain('5.0s: Return');
    // Collapsed: Manual should appear once in the timeline.
    expect(r.details.match(/Manual/g)?.length).toBe(1);
  });
  it('skips when absent', () => {
    expect(find(runPx4HealthChecks(makeLog({})), 'flight-modes').status).toBe('skip');
  });
});

describe('checkArming', () => {
  it('reports arm/disarm count and armed duration', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_status: [
            { timestamp: 1_000_000, arming_state: 1 },
            { timestamp: 2_000_000, arming_state: 2 },
            { timestamp: 12_000_000, arming_state: 1 },
          ],
        }),
      ),
      'arming',
    );
    expect(r.status).toBe('info');
    expect(r.values?.armCount).toBe(1);
    expect(r.values?.armedDurationS).toBeCloseTo(10, 1);
  });
  it('skips when absent', () => {
    expect(find(runPx4HealthChecks(makeLog({})), 'arming').status).toBe('skip');
  });
});

describe('checkEvents', () => {
  it('passes when no error or warning strings', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          LOGGED_STRING: [
            { timestamp: 1_000_000, Level: 6, Message: 'info: boot ok' },
          ],
        }),
      ),
      'events',
    );
    expect(r.status).toBe('pass');
  });
  it('warns on warning-level strings (Level==4)', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          LOGGED_STRING: [
            { timestamp: 1_000_000, Level: 4, Message: 'low battery' },
            { timestamp: 2_000_000, Level: 6, Message: 'ok' },
          ],
        }),
      ),
      'events',
    );
    expect(r.status).toBe('warn');
    expect(r.values?.warnings).toBe(1);
  });
  it('fails on error-level strings (Level<=3)', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          LOGGED_STRING: [
            { timestamp: 3_500_000, Level: 2, Message: 'critical sensor failure' },
            { timestamp: 4_000_000, Level: 4, Message: 'warn' },
          ],
        }),
      ),
      'events',
    );
    expect(r.status).toBe('fail');
    expect(r.values?.errors).toBe(1);
    expect(r.values?.warnings).toBe(1);
    expect(r.details).toContain('3.5s');
    expect(r.details).toContain('critical sensor failure');
  });
  it('skips when no LOGGED_STRING records', () => {
    expect(find(runPx4HealthChecks(makeLog({})), 'events').status).toBe('skip');
  });
});

describe('checkFlightStats', () => {
  it('computes max altitude from -z, max horizontal speed, distance, duration', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog(
          {
            vehicle_local_position: [
              { timestamp: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
              { timestamp: 1_000_000, x: 3, y: 4, z: -50, vx: 3, vy: 4, vz: -1 },
              { timestamp: 2_000_000, x: 6, y: 8, z: -20, vx: 6, vy: 8, vz: 0 },
            ],
          },
          { startUs: 0, endUs: 2_000_000 },
        ),
      ),
      'flight-stats',
    );
    expect(r.status).toBe('info');
    // max altitude = max(-z) = 50
    expect(r.values?.maxAltitude).toBeCloseTo(50, 5);
    // max horizontal speed = sqrt(6^2+8^2)=10
    expect(r.values?.maxHorizSpeed).toBeCloseTo(10, 5);
    // distance = dist((0,0)->(3,4)) + dist((3,4)->(6,8)) = 5 + 5 = 10
    expect(r.values?.distance).toBeCloseTo(10, 5);
    // duration from timeRange
    expect(r.values?.durationS).toBeCloseTo(2, 5);
  });
  it('uses vehicle_global_position alt when local absent', () => {
    const r = find(
      runPx4HealthChecks(
        makeLog({
          vehicle_global_position: [
            { timestamp: 0, lat: 1, lon: 2, alt: 100 },
            { timestamp: 1_000_000, lat: 1, lon: 2, alt: 180 },
          ],
        }),
      ),
      'flight-stats',
    );
    expect(r.status).toBe('info');
    expect(r.values?.maxAltitude).toBeCloseTo(180, 5);
  });
  it('skips when absent', () => {
    expect(find(runPx4HealthChecks(makeLog({})), 'flight-stats').status).toBe('skip');
  });
});
