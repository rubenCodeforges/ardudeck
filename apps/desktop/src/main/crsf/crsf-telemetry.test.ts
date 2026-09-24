import { describe, it, expect } from 'vitest';
import { buildCrsfFrame, extractCrsfFrames, CRSF_FRAMETYPE_LINK_STATISTICS } from '../link-doctor/crsf-protocol.js';
import {
  CRSF_FRAMETYPE_ATTITUDE,
  CRSF_FRAMETYPE_BARO_ALTITUDE,
  CRSF_FRAMETYPE_BATTERY_SENSOR,
  CRSF_FRAMETYPE_FLIGHT_MODE,
  CRSF_FRAMETYPE_GPS,
  CRSF_FRAMETYPE_RC_CHANNELS_PACKED,
  CRSF_FRAMETYPE_VARIO,
  applyCrsfFrame,
  armedFromMode,
  createCrsfState,
  crsfBatch,
  decodeAttitude,
  decodeBaroAltitude,
  decodeBattery,
  decodeFlightMode,
  decodeGps,
  decodeLinkStatistics,
  decodeRcChannels,
  decodeVario,
  fixTypeFromSatellites,
} from './crsf-telemetry.js';
import type { CrsfFrame } from '../link-doctor/crsf-protocol.js';

/** Round-trip through the real framing so the tests exercise what the wire gives. */
function frameOf(type: number, payload: number[]): CrsfFrame {
  const bytes = buildCrsfFrame(type, new Uint8Array(payload));
  const { frames } = extractCrsfFrames(bytes);
  expect(frames).toHaveLength(1);
  return frames[0]!;
}

function be32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}

function be16(v: number): number[] {
  return [(v >>> 8) & 0xff, v & 0xff];
}

const GPS_PAYLOAD = [
  ...be32(525200000),
  ...be32(134050000),
  ...be16(360),
  ...be16(9000),
  ...be16(1100),
  12,
];

describe('CRSF telemetry decoders', () => {
  it('decodes a GPS frame into degrees, m/s and metres MSL', () => {
    const gps = decodeGps(frameOf(CRSF_FRAMETYPE_GPS, GPS_PAYLOAD));
    expect(gps).not.toBeNull();
    expect(gps!.lat).toBeCloseTo(52.52, 6);
    expect(gps!.lon).toBeCloseTo(13.405, 6);
    expect(gps!.groundspeedMs).toBeCloseTo(10, 3);
    expect(gps!.headingDeg).toBeCloseTo(90, 3);
    expect(gps!.altitudeM).toBe(100);
    expect(gps!.satellites).toBe(12);
  });

  it('decodes southern and western hemispheres as negative', () => {
    const gps = decodeGps(frameOf(CRSF_FRAMETYPE_GPS, [
      ...be32(-338680000 >>> 0),
      ...be32(-1512150000 >>> 0),
      ...be16(0),
      ...be16(0),
      ...be16(1000),
      7,
    ]));
    expect(gps!.lat).toBeCloseTo(-33.868, 5);
    expect(gps!.lon).toBeCloseTo(-151.215, 5);
    expect(gps!.altitudeM).toBe(0);
  });

  it('decodes battery volts, amps, mAh and percent', () => {
    const battery = decodeBattery(frameOf(CRSF_FRAMETYPE_BATTERY_SENSOR, [
      ...be16(168),
      ...be16(125),
      0x00, 0x04, 0xd2,
      75,
    ]));
    expect(battery).toEqual({ voltage: 16.8, current: 12.5, mahDrawn: 1234, remaining: 75 });
  });

  it('decodes attitude radians into degrees with yaw wrapped to 0-360', () => {
    const attitude = decodeAttitude(frameOf(CRSF_FRAMETYPE_ATTITUDE, [
      ...be16(1000),
      ...be16(0xffff & -2000),
      ...be16(0xffff & -15708),
    ]));
    expect(attitude!.pitchDeg).toBeCloseTo(5.73, 2);
    expect(attitude!.rollDeg).toBeCloseTo(-11.46, 2);
    expect(attitude!.yawDeg).toBeCloseTo(270, 1);
  });

  it('decodes both baro altitude encodings', () => {
    expect(decodeBaroAltitude(frameOf(CRSF_FRAMETYPE_BARO_ALTITUDE, be16(10250)))).toBeCloseTo(25, 6);
    expect(decodeBaroAltitude(frameOf(CRSF_FRAMETYPE_BARO_ALTITUDE, be16(0x8000 | 250)))).toBe(250);
    expect(decodeBaroAltitude(frameOf(CRSF_FRAMETYPE_BARO_ALTITUDE, be16(9990)))).toBeCloseTo(-1, 6);
  });

  it('decodes vario centimetres per second as metres per second', () => {
    expect(decodeVario(frameOf(CRSF_FRAMETYPE_VARIO, be16(0xffff & -150)))).toBeCloseTo(-1.5, 6);
  });

  it('decodes a null-terminated flight mode string', () => {
    expect(decodeFlightMode(frameOf(CRSF_FRAMETYPE_FLIGHT_MODE, [0x41, 0x4e, 0x47, 0x4c, 0x00]))).toBe('ANGL');
  });

  it('decodes link statistics, taking the better antenna and the power table', () => {
    const link = decodeLinkStatistics(frameOf(CRSF_FRAMETYPE_LINK_STATISTICS, [
      60, 70, 100, 8, 0, 2, 3, 65, 99, 0xff & -5,
    ]));
    expect(link).toEqual({
      uplinkRssiDbm: -60,
      uplinkLq: 100,
      uplinkSnrDb: 8,
      activeAntenna: 0,
      rfMode: 2,
      txPowerMw: 100,
      downlinkRssiDbm: -65,
      downlinkLq: 99,
      downlinkSnrDb: -5,
    });
  });

  it('unpacks 16 RC channels from the 11-bit packing', () => {
    // 992 ticks is stick centre in CRSF.
    const packed = new Uint8Array(22);
    let acc = 0;
    let bits = 0;
    let at = 0;
    for (let i = 0; i < 16; i++) {
      acc |= 992 << bits;
      bits += 11;
      while (bits >= 8) {
        packed[at++] = acc & 0xff;
        acc >>>= 8;
        bits -= 8;
      }
    }
    const channels = decodeRcChannels(frameOf(CRSF_FRAMETYPE_RC_CHANNELS_PACKED, Array.from(packed)));
    expect(channels).toHaveLength(16);
    for (const us of channels!) expect(us).toBeGreaterThan(1495);
    for (const us of channels!) expect(us).toBeLessThan(1505);
  });

  it('returns null for a truncated frame rather than inventing numbers', () => {
    expect(decodeGps(frameOf(CRSF_FRAMETYPE_GPS, [1, 2, 3]))).toBeNull();
    expect(decodeBattery(frameOf(CRSF_FRAMETYPE_BATTERY_SENSOR, [1, 2]))).toBeNull();
    expect(decodeAttitude(frameOf(CRSF_FRAMETYPE_ATTITUDE, [1, 2]))).toBeNull();
    expect(decodeLinkStatistics(frameOf(CRSF_FRAMETYPE_LINK_STATISTICS, [1, 2, 3]))).toBeNull();
  });
});

describe('armed state from the flight mode string', () => {
  it('treats the INAV ground strings as disarmed', () => {
    expect(armedFromMode('OK')).toBe(false);
    expect(armedFromMode('WAIT')).toBe(false);
    expect(armedFromMode('!ERR')).toBe(false);
  });

  it('treats the Betaflight trailing star as disarmed', () => {
    expect(armedFromMode('ANGL*')).toBe(false);
  });

  it('treats a real flight mode as armed, failsafe included', () => {
    expect(armedFromMode('ANGL')).toBe(true);
    expect(armedFromMode('RTH')).toBe(true);
    expect(armedFromMode('!FS!')).toBe(true);
  });
});

describe('CRSF telemetry state', () => {
  it('counts a decoded frame and stamps liveness', () => {
    const state = createCrsfState();
    expect(applyCrsfFrame(state, frameOf(CRSF_FRAMETYPE_GPS, GPS_PAYLOAD), 1000)).toBe(true);
    expect(state.framesDecoded).toBe(1);
    expect(state.lastFrameAtMs).toBe(1000);
  });

  it('does not treat link statistics as the vehicle being alive', () => {
    const state = createCrsfState();
    const alive = applyCrsfFrame(
      state,
      frameOf(CRSF_FRAMETYPE_LINK_STATISTICS, [60, 70, 100, 8, 0, 2, 3, 65, 99, 0]),
      1000,
    );
    expect(alive).toBe(false);
    expect(state.lastFrameAtMs).toBe(0);
    expect(state.link).not.toBeNull();
  });

  it('ignores frame types it does not map without counting them as telemetry', () => {
    const state = createCrsfState();
    expect(applyCrsfFrame(state, frameOf(0x29, [1, 2, 3]), 1000)).toBe(false);
    expect(state.framesIgnored).toBe(1);
    expect(state.framesDecoded).toBe(0);
  });

  it('rejects a truncated telemetry frame without touching liveness', () => {
    const state = createCrsfState();
    expect(applyCrsfFrame(state, frameOf(CRSF_FRAMETYPE_GPS, [1, 2]), 1000)).toBe(false);
    expect(state.lastFrameAtMs).toBe(0);
    expect(state.gps).toBeNull();
  });
});

describe('telemetry batch', () => {
  it('is empty before anything has been decoded', () => {
    expect(crsfBatch(createCrsfState())).toEqual({});
  });

  it('fills gps, position and the HUD from a GPS frame', () => {
    const state = createCrsfState();
    applyCrsfFrame(state, frameOf(CRSF_FRAMETYPE_GPS, GPS_PAYLOAD), 1000);
    const batch = crsfBatch(state);
    expect(batch.gps).toMatchObject({ fixType: 3, satellites: 12, alt: 100 });
    expect(batch.position).toMatchObject({ lat: 52.52, alt: 100 });
    expect(batch.vfrHud!.groundspeed).toBeCloseTo(10, 3);
    expect(batch.vfrHud!.heading).toBeCloseTo(90, 3);
  });

  it('prefers baro altitude over GPS altitude in the HUD', () => {
    const state = createCrsfState();
    applyCrsfFrame(state, frameOf(CRSF_FRAMETYPE_GPS, GPS_PAYLOAD), 1000);
    applyCrsfFrame(state, frameOf(CRSF_FRAMETYPE_BARO_ALTITUDE, be16(10250)), 1000);
    const batch = crsfBatch(state);
    expect(batch.vfrHud!.alt).toBeCloseTo(25, 6);
    expect(batch.gps!.alt).toBe(100);
    expect(batch.position!.relativeAlt).toBeCloseTo(25, 6);
  });

  it('reports no airspeed rather than passing ground speed off as one', () => {
    const state = createCrsfState();
    applyCrsfFrame(state, frameOf(CRSF_FRAMETYPE_GPS, GPS_PAYLOAD), 1000);
    expect(crsfBatch(state).vfrHud!.airspeed).toBe(0);
  });

  it('maps link quality onto the gauge scale the link instrument reads', () => {
    const state = createCrsfState();
    applyCrsfFrame(state, frameOf(CRSF_FRAMETYPE_LINK_STATISTICS, [60, 70, 100, 8, 0, 2, 3, 65, 50, 0]), 1000);
    const batch = crsfBatch(state);
    expect(batch.radioStatus!.rssi).toBe(254);
    expect(batch.radioStatus!.remRssi).toBe(127);
  });

  it('carries the flight mode and armed state', () => {
    const state = createCrsfState();
    applyCrsfFrame(state, frameOf(CRSF_FRAMETYPE_FLIGHT_MODE, [0x57, 0x41, 0x49, 0x54, 0x00]), 1000);
    expect(crsfBatch(state).flight).toMatchObject({ mode: 'WAIT', armed: false });
  });

  it('still reports a flight slot when no mode frame has arrived', () => {
    const state = createCrsfState();
    applyCrsfFrame(state, frameOf(CRSF_FRAMETYPE_GPS, GPS_PAYLOAD), 1000);
    expect(crsfBatch(state).flight).toEqual({ mode: 'Unknown', modeNum: 0, armed: false, isFlying: false });
  });

  it('infers a fix type from the satellite count', () => {
    expect(fixTypeFromSatellites(0)).toBe(0);
    expect(fixTypeFromSatellites(3)).toBe(2);
    expect(fixTypeFromSatellites(9)).toBe(3);
  });
});
