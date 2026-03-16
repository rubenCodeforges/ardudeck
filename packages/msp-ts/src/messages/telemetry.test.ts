/**
 * Tests for MSP telemetry conversion helpers and batch assembly logic.
 *
 * Covers the fix for issue #73: map panel showing wrong altitude value.
 * The bug was that `batch.position.relativeAlt` used GPS altitude (MSL)
 * instead of barometer altitude (relative to takeoff point).
 */
import { describe, it, expect } from 'vitest';
import {
  altitudeToMeters,
  gpsToDecimalDegrees,
  deserializeAltitude,
  deserializeRawGps,
} from './telemetry.js';
import { PayloadBuilder } from '../core/msp-serializer.js';

// =============================================================================
// altitudeToMeters
// =============================================================================

describe('altitudeToMeters', () => {
  it('converts altitude from cm to meters', () => {
    const result = altitudeToMeters({ altitude: 5000, vario: 0, baroAltitude: 5000 });
    expect(result.altitudeM).toBe(50);
  });

  it('converts vario from cm/s to m/s', () => {
    const result = altitudeToMeters({ altitude: 0, vario: 250, baroAltitude: 0 });
    expect(result.varioMs).toBe(2.5);
  });

  it('handles negative altitude (below takeoff point)', () => {
    const result = altitudeToMeters({ altitude: -300, vario: -50, baroAltitude: -300 });
    expect(result.altitudeM).toBe(-3);
    expect(result.varioMs).toBe(-0.5);
  });

  it('handles zero altitude', () => {
    const result = altitudeToMeters({ altitude: 0, vario: 0, baroAltitude: 0 });
    expect(result.altitudeM).toBe(0);
    expect(result.varioMs).toBe(0);
  });
});

// =============================================================================
// gpsToDecimalDegrees
// =============================================================================

describe('gpsToDecimalDegrees', () => {
  it('converts GPS lat/lon from 1e-7 degrees to decimal degrees', () => {
    const result = gpsToDecimalDegrees({
      fixType: 3,
      numSat: 12,
      lat: 473977610,   // 47.3977610 degrees
      lon: 85249540,    // 8.5249540 degrees
      alt: 408,         // 408 meters MSL
      groundSpeed: 500, // 5 m/s
      groundCourse: 1800, // 180 degrees
      hdop: 120,
    });

    expect(result.latDeg).toBeCloseTo(47.397761, 5);
    expect(result.lonDeg).toBeCloseTo(8.524954, 5);
    expect(result.altM).toBe(408);       // GPS altitude in meters (MSL)
    expect(result.speedMs).toBe(5);       // cm/s to m/s
    expect(result.courseDeg).toBe(180);   // 0.1 degrees to degrees
  });

  it('returns GPS altitude in meters directly (no cm conversion)', () => {
    // GPS altitude from MSP_RAW_GPS is already in meters
    const result = gpsToDecimalDegrees({
      fixType: 3, numSat: 10,
      lat: 0, lon: 0,
      alt: 150,          // 150 meters MSL
      groundSpeed: 0, groundCourse: 0, hdop: 0,
    });
    expect(result.altM).toBe(150);
  });
});

// =============================================================================
// Issue #73: GPS altitude vs barometer altitude distinction
// =============================================================================

describe('issue #73: position.relativeAlt must use barometer altitude, not GPS altitude', () => {
  /**
   * The core of the bug: GPS altitude (MSL) and barometer altitude (relative)
   * are fundamentally different values. When a drone takes off from 100m elevation,
   * GPS altitude might read ~100m while barometer altitude reads ~0m.
   *
   * The map panel displays `position.relativeAlt` which should show height
   * above takeoff point (barometer), not height above sea level (GPS).
   */
  it('GPS altitude and barometer altitude produce different values for same flight', () => {
    // Simulate: drone at 100m MSL elevation, hovering 15m above takeoff
    const gpsAlt = 100;      // GPS reads 100m MSL
    const baroAltCm = 1500;  // Barometer reads 15m relative to takeoff (in cm)

    const gpsResult = gpsToDecimalDegrees({
      fixType: 3, numSat: 12,
      lat: 473977610, lon: 85249540,
      alt: gpsAlt,
      groundSpeed: 0, groundCourse: 0, hdop: 100,
    });

    const baroResult = altitudeToMeters({
      altitude: baroAltCm,
      vario: 0,
      baroAltitude: baroAltCm,
    });

    // GPS altitude is absolute MSL
    expect(gpsResult.altM).toBe(100);

    // Barometer altitude is relative to takeoff
    expect(baroResult.altitudeM).toBe(15);

    // These are NOT the same value - the bug was using gpsResult.altM for relativeAlt
    expect(gpsResult.altM).not.toBe(baroResult.altitudeM);
  });

  it('simulates correct batch.position assembly after fix', () => {
    // This mirrors the logic in msp-telemetry.ts startTelemetryInterval

    // Step 1: MSP_ALTITUDE response (barometer-based, relative altitude)
    const altPayloadBuilder = new PayloadBuilder();
    altPayloadBuilder.writeS32(1500);  // altitude: 1500 cm = 15m relative
    altPayloadBuilder.writeS16(50);    // vario: 50 cm/s = 0.5 m/s
    const altPayload = altPayloadBuilder.build();
    const altitude = deserializeAltitude(altPayload);
    const meters = altitudeToMeters(altitude);
    const altitudeM = meters.altitudeM; // 15m (relative to takeoff)

    // Step 2: MSP_RAW_GPS response (GPS-based, absolute MSL altitude)
    const gpsPayloadBuilder = new PayloadBuilder();
    gpsPayloadBuilder.writeU8(3);           // fixType
    gpsPayloadBuilder.writeU8(12);          // numSat
    gpsPayloadBuilder.writeS32(473977610);  // lat
    gpsPayloadBuilder.writeS32(85249540);   // lon
    gpsPayloadBuilder.writeS16(408);        // alt: 408m MSL
    gpsPayloadBuilder.writeU16(500);        // groundSpeed
    gpsPayloadBuilder.writeU16(1800);       // groundCourse
    gpsPayloadBuilder.writeU16(120);        // hdop
    const gpsPayload = gpsPayloadBuilder.build();
    const gps = deserializeRawGps(gpsPayload);
    const decimal = gpsToDecimalDegrees(gps);

    // Step 3: Build batch.position (FIXED version from the diff)
    const position = {
      lat: decimal.latDeg,
      lon: decimal.lonDeg,
      alt: decimal.altM,           // GPS altitude (MSL) - for absolute position
      relativeAlt: altitudeM,      // Barometer altitude (relative) - FIX: was decimal.altM
      vx: 0, vy: 0, vz: 0,
    };

    // Verify: relativeAlt uses barometer altitude (15m), NOT GPS altitude (408m)
    expect(position.relativeAlt).toBe(15);
    expect(position.alt).toBe(408);
    expect(position.relativeAlt).not.toBe(position.alt);
  });

  it('simulates the OLD buggy behavior for comparison', () => {
    // Before the fix, relativeAlt was set to decimal.altM (GPS altitude)
    const altPayloadBuilder = new PayloadBuilder();
    altPayloadBuilder.writeS32(1500);  // 15m relative
    altPayloadBuilder.writeS16(0);
    const altitude = deserializeAltitude(altPayloadBuilder.build());
    const meters = altitudeToMeters(altitude);
    const altitudeM = meters.altitudeM;

    const gpsPayloadBuilder = new PayloadBuilder();
    gpsPayloadBuilder.writeU8(3);
    gpsPayloadBuilder.writeU8(12);
    gpsPayloadBuilder.writeS32(473977610);
    gpsPayloadBuilder.writeS32(85249540);
    gpsPayloadBuilder.writeS16(408);  // 408m MSL
    gpsPayloadBuilder.writeU16(0);
    gpsPayloadBuilder.writeU16(0);
    gpsPayloadBuilder.writeU16(100);
    const gps = deserializeRawGps(gpsPayloadBuilder.build());
    const decimal = gpsToDecimalDegrees(gps);

    // OLD (buggy): relativeAlt = decimal.altM (GPS MSL altitude)
    const buggyRelativeAlt = decimal.altM;
    // NEW (fixed): relativeAlt = altitudeM (barometer relative altitude)
    const fixedRelativeAlt = altitudeM;

    // The bug: map panel showed 408m instead of 15m
    expect(buggyRelativeAlt).toBe(408);
    expect(fixedRelativeAlt).toBe(15);
    expect(buggyRelativeAlt).not.toBe(fixedRelativeAlt);
  });
});

// =============================================================================
// deserializeAltitude
// =============================================================================

describe('deserializeAltitude', () => {
  it('deserializes basic altitude payload (6 bytes)', () => {
    const builder = new PayloadBuilder();
    builder.writeS32(12345);  // altitude in cm
    builder.writeS16(100);    // vario in cm/s
    const result = deserializeAltitude(builder.build());

    expect(result.altitude).toBe(12345);
    expect(result.vario).toBe(100);
    expect(result.baroAltitude).toBe(12345); // defaults to altitude when no extra field
  });

  it('deserializes extended altitude payload with baro field (10 bytes)', () => {
    const builder = new PayloadBuilder();
    builder.writeS32(12345);  // estimated altitude in cm
    builder.writeS16(100);    // vario in cm/s
    builder.writeS32(12300);  // baro altitude in cm
    const result = deserializeAltitude(builder.build());

    expect(result.altitude).toBe(12345);
    expect(result.vario).toBe(100);
    expect(result.baroAltitude).toBe(12300);
  });
});

// =============================================================================
// deserializeRawGps
// =============================================================================

describe('deserializeRawGps', () => {
  it('deserializes GPS payload', () => {
    const builder = new PayloadBuilder();
    builder.writeU8(3);            // fixType
    builder.writeU8(10);           // numSat
    builder.writeS32(473977610);   // lat (1e-7 degrees)
    builder.writeS32(85249540);    // lon (1e-7 degrees)
    builder.writeS16(150);         // alt in meters
    builder.writeU16(1000);        // groundSpeed cm/s
    builder.writeU16(900);         // groundCourse 0.1 degrees
    builder.writeU16(200);         // hdop

    const result = deserializeRawGps(builder.build());

    expect(result.fixType).toBe(3);
    expect(result.numSat).toBe(10);
    expect(result.lat).toBe(473977610);
    expect(result.lon).toBe(85249540);
    expect(result.alt).toBe(150);
    expect(result.groundSpeed).toBe(1000);
    expect(result.groundCourse).toBe(900);
    expect(result.hdop).toBe(200);
  });
});
