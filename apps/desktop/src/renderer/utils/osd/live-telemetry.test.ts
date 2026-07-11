import { describe, it, expect } from 'vitest';
import {
  haversineMeters,
  bearingDeg,
  createOsdLiveTracker,
  buildLiveTelemetry,
  pickForwardTarget,
  type LiveTelemetrySnapshot,
} from './live-telemetry';

function snap(overrides: Partial<LiveTelemetrySnapshot> = {}): LiveTelemetrySnapshot {
  return {
    attitude: { roll: 0, pitch: 0, yaw: 0 },
    position: { lat: 0, lon: 0, alt: 100, relativeAlt: 50 },
    gps: { satellites: 12, hdop: 0.9, lat: 0, lon: 0 },
    battery: { voltage: 22.2, current: 10, remaining: 80, cellCount: 6, cellVoltage: 3.7, mahDrawn: 1200 },
    vfrHud: { airspeed: 12, groundspeed: 15, heading: 90, throttle: 50, alt: 50, climb: 1.5 },
    wind: { direction: 270, speed: 4, speedZ: 0.5 },
    flight: { mode: 'LOITER', armed: true },
    rcChannels: { rssi: 254 },
    escTelemetry: null,
    ...overrides,
  };
}

describe('geo helpers', () => {
  it('computes ~111km per degree of latitude', () => {
    expect(haversineMeters(0, 0, 1, 0)).toBeGreaterThan(110_000);
    expect(haversineMeters(0, 0, 1, 0)).toBeLessThan(112_000);
  });
  it('bearing due east is ~90deg', () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 0);
  });
});

describe('pickForwardTarget', () => {
  // Points east (seq1, near) and further east (seq2, far) of an aircraft at origin.
  const pts = [
    { latitude: 0, longitude: 0.01, seq: 1 },
    { latitude: 0, longitude: 0.02, seq: 2 },
    { latitude: 0, longitude: -0.01, seq: 3 }, // west (behind when heading east)
  ];

  it('returns null with no points', () => {
    expect(pickForwardTarget(0, 0, 90, [])).toBeNull();
  });

  it('picks the nearest waypoint ahead when heading east', () => {
    const t = pickForwardTarget(0, 0, 90, pts);
    expect(t?.seq).toBe(1);
    expect(t?.bearing).toBeCloseTo(90, 0);
  });

  it('skips a waypoint that has fallen behind (auto-advance)', () => {
    // Aircraft now past seq1 (at lon 0.015), still heading east -> seq1 is behind.
    const t = pickForwardTarget(0, 0.015, 90, pts);
    expect(t?.seq).toBe(2);
  });

  it('falls back to nearest overall when nothing is ahead', () => {
    // Heading west with only eastern points ahead-of-nose excluded -> nearest of all.
    const eastOnly = [
      { latitude: 0, longitude: 0.02, seq: 2 },
      { latitude: 0, longitude: 0.01, seq: 1 },
    ];
    const t = pickForwardTarget(0, 0, 270, eastOnly);
    expect(t?.seq).toBe(1); // nearest, even though behind
  });
});

describe('buildLiveTelemetry', () => {
  it('maps core telemetry and derives power', () => {
    const t = createOsdLiveTracker(1000);
    const v = buildLiveTelemetry(snap(), null, t, 1000);
    expect(v.batteryVoltage).toBe(22.2);
    expect(v.powerWatts).toBeCloseTo(222, 0);
    expect(v.speed).toBe(15);
    expect(v.isArmed).toBe(true);
    expect(v.flightMode).toBe('LOITER');
  });

  it('tracks flight time from arm and on time from start', () => {
    const t = createOsdLiveTracker(0);
    // disarmed first
    buildLiveTelemetry(snap({ flight: { mode: 'STAB', armed: false } }), null, t, 5_000);
    expect(t.lastFlightTimeS).toBe(0);
    // arm at t=10s
    buildLiveTelemetry(snap({ flight: { mode: 'STAB', armed: true } }), null, t, 10_000);
    // still armed at t=70s -> 60s flight time
    const v = buildLiveTelemetry(snap({ flight: { mode: 'STAB', armed: true } }), null, t, 70_000);
    expect(v.flightTime).toBe(60);
    expect(v.onTime).toBe(70);
  });

  it('freezes flight time after disarm', () => {
    const t = createOsdLiveTracker(0);
    buildLiveTelemetry(snap({ flight: { mode: 'X', armed: true } }), null, t, 0);
    buildLiveTelemetry(snap({ flight: { mode: 'X', armed: true } }), null, t, 30_000);
    const v = buildLiveTelemetry(snap({ flight: { mode: 'X', armed: false } }), null, t, 90_000);
    expect(v.flightTime).toBe(30);
  });

  it('computes home distance and relative bearing', () => {
    const t = createOsdLiveTracker(0);
    // aircraft at 47,-122 heading east(90); home is due north (~111km away)
    const v = buildLiveTelemetry(
      snap({ gps: { satellites: 10, hdop: 1, lat: 47, lon: -122 }, vfrHud: { ...snap().vfrHud, heading: 90 } }),
      { lat: 48, lon: -122 },
      t,
      0,
    );
    expect(v.distance).toBeGreaterThan(110_000);
    // home is north (0deg), heading east (90) -> relative bearing 270
    expect(v.homeDirection).toBeCloseTo(270, 0);
  });

  it('tracks max speed while armed', () => {
    const t = createOsdLiveTracker(0);
    buildLiveTelemetry(snap({ vfrHud: { ...snap().vfrHud, groundspeed: 15 } }), null, t, 0);
    buildLiveTelemetry(snap({ vfrHud: { ...snap().vfrHud, groundspeed: 31 } }), null, t, 1000);
    const v = buildLiveTelemetry(snap({ vfrHud: { ...snap().vfrHud, groundspeed: 20 } }), null, t, 2000);
    expect(v.maxSpeed).toBe(31);
  });

  it('takes hottest temp and fastest rpm from ESC telemetry', () => {
    const t = createOsdLiveTracker(0);
    const v = buildLiveTelemetry(
      snap({ escTelemetry: { motors: [{ rpm: 8000, tempC: 40 }, undefined, { rpm: 9500, tempC: 62 }] } }),
      null,
      t,
      0,
    );
    expect(v.escTemp).toBe(62);
    expect(v.escRpm).toBe(9500);
  });

  it('converts RC rssi to percent', () => {
    const t = createOsdLiveTracker(0);
    expect(buildLiveTelemetry(snap({ rcChannels: { rssi: 255 } }), null, t, 0).rssi).toBe(0);
    expect(buildLiveTelemetry(snap({ rcChannels: { rssi: 127 } }), null, t, 0).rssi).toBeCloseTo(50, 0);
  });
});

describe('buildLiveTelemetry never emits undefined numeric fields (OSD crash regression)', () => {
  // Repro: a Windows user connected to an FC opened the OSD tool and it crashed
  // the whole view with "Cannot read properties of undefined (reading 'toString')".
  // Cause: a partial telemetry frame (GPS before lock) left gps.satellites
  // undefined; renderGpsSats did `sats.toString()` on it.
  it('coalesces a partial GPS frame (undefined satellites/hdop) to numbers', () => {
    const t = createOsdLiveTracker(0);
    const partial = snap({
      // @ts-expect-error simulate a partial frame the store can hold pre-lock
      gps: { lat: 0, lon: 0 },
    });
    const v = buildLiveTelemetry(partial, null, t, 0);
    expect(typeof v.gpsSats).toBe('number');
    expect(typeof v.gpsHdop).toBe('number');
    expect(Number.isNaN(v.gpsSats)).toBe(false);
  });

  it('renders the gps_sats OSD element without throwing on a partial frame', async () => {
    const { OsdScreenBuffer } = await import('./font-renderer');
    const { renderElement } = await import('./element-renderers');
    const t = createOsdLiveTracker(0);
    // @ts-expect-error partial frame: vfrHud/gps/battery fields absent
    const partial = snap({ gps: {}, vfrHud: {}, battery: {}, wind: {}, position: {} });
    const values = buildLiveTelemetry(partial, null, t, 0);
    const buf = new OsdScreenBuffer('PAL');
    // Would previously throw TypeError on undefined.toString()/.toFixed().
    for (const id of ['gps_sats', 'gps_hdop', 'latitude', 'longitude', 'vario', 'altitude']) {
      expect(() => renderElement(buf, id, 2, 2, values)).not.toThrow();
    }
  });
});
