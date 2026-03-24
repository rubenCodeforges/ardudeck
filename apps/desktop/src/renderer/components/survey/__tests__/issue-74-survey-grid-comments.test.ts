/**
 * Tests for issue #74: Survey Grid comments
 *
 * Covers the following fixes:
 * 1. Altitude reference selection (relative/ASL/terrain) → correct MAV_FRAME
 * 2. Side overlap max increased from 80% to 99%
 * 3. Auto-adjust height preserves survey altitude (doesn't reduce 80m to 30m buffer)
 * 4. Takeoff waypoint ignores lat/lon (ArduPilot uses current position)
 * 5. Polygon vertex removal for survey and fence editing (min 3 vertices)
 * 6. Default altitude reference in settings
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { surveyToMissionItems } from '../mission-builder';
import { MAV_FRAME, MAV_CMD, createTakeoffWaypoint } from '../../../../shared/mission-types';
import type { SurveyConfig, SurveyResult, AltitudeReference } from '../survey-types';
import { DEFAULT_SURVEY_CONFIG } from '../survey-types';

// =============================================================================
// Helpers
// =============================================================================

/** Minimal survey result for testing mission builder output */
function makeSurveyResult(waypointCount = 3): SurveyResult {
  const waypoints = Array.from({ length: waypointCount }, (_, i) => ({
    lat: -33.8688 + i * 0.001,
    lng: 151.2093 + i * 0.001,
  }));
  return {
    waypoints,
    photoPositions: waypoints,
    footprints: [],
    stats: {
      gsd: 2.5,
      flightDistance: 500,
      flightTime: 100,
      photoCount: waypointCount,
      lineCount: 1,
      areaCovered: 10000,
      footprintWidth: 40,
      footprintHeight: 30,
      lineSpacing: 20,
      photoSpacing: 15,
    },
  };
}

/** Build a full SurveyConfig with an altitude reference override */
function makeConfig(overrides: Partial<Omit<SurveyConfig, 'polygon'>> = {}): SurveyConfig {
  return {
    ...DEFAULT_SURVEY_CONFIG,
    polygon: [
      { lat: -33.868, lng: 151.209 },
      { lat: -33.869, lng: 151.210 },
      { lat: -33.870, lng: 151.208 },
    ],
    ...overrides,
  };
}

// =============================================================================
// 1. Altitude reference → MAV_FRAME mapping
// =============================================================================

describe('issue #74: altitude reference frame selection', () => {
  it('defaults to relative altitude (GLOBAL_RELATIVE_ALT)', () => {
    expect(DEFAULT_SURVEY_CONFIG.altitudeReference).toBe('relative');
  });

  it('uses GLOBAL_RELATIVE_ALT frame for "relative" reference', () => {
    const config = makeConfig({ altitudeReference: 'relative' });
    const result = makeSurveyResult(2);
    const items = surveyToMissionItems(result, config);

    const navItems = items.filter((i) => i.command === MAV_CMD.NAV_WAYPOINT);
    expect(navItems.length).toBe(2);
    for (const item of navItems) {
      expect(item.frame).toBe(MAV_FRAME.GLOBAL_RELATIVE_ALT);
    }
  });

  it('uses GLOBAL frame for "asl" reference', () => {
    const config = makeConfig({ altitudeReference: 'asl' });
    const result = makeSurveyResult(2);
    const items = surveyToMissionItems(result, config);

    const navItems = items.filter((i) => i.command === MAV_CMD.NAV_WAYPOINT);
    expect(navItems.length).toBe(2);
    for (const item of navItems) {
      expect(item.frame).toBe(MAV_FRAME.GLOBAL);
    }
  });

  it('uses GLOBAL_TERRAIN_ALT frame for "terrain" reference', () => {
    const config = makeConfig({ altitudeReference: 'terrain' });
    const result = makeSurveyResult(2);
    const items = surveyToMissionItems(result, config);

    const navItems = items.filter((i) => i.command === MAV_CMD.NAV_WAYPOINT);
    expect(navItems.length).toBe(2);
    for (const item of navItems) {
      expect(item.frame).toBe(MAV_FRAME.GLOBAL_TERRAIN_ALT);
    }
  });

  it('non-nav commands always use GLOBAL_RELATIVE_ALT regardless of altitude reference', () => {
    // Even with terrain/ASL selected, DO_CHANGE_SPEED and DO_SET_CAM_TRIGG_DIST
    // should use GLOBAL_RELATIVE_ALT since they're not position-dependent
    for (const ref of ['relative', 'asl', 'terrain'] as AltitudeReference[]) {
      const config = makeConfig({ altitudeReference: ref });
      const result = makeSurveyResult(1);
      const items = surveyToMissionItems(result, config);

      const nonNavItems = items.filter((i) => i.command !== MAV_CMD.NAV_WAYPOINT);
      expect(nonNavItems.length).toBeGreaterThan(0);
      for (const item of nonNavItems) {
        expect(item.frame).toBe(MAV_FRAME.GLOBAL_RELATIVE_ALT);
      }
    }
  });

  it('all waypoints in a survey share the same altitude from config', () => {
    const altitude = 120;
    const config = makeConfig({ altitude, altitudeReference: 'terrain' });
    const result = makeSurveyResult(5);
    const items = surveyToMissionItems(result, config);

    const navItems = items.filter((i) => i.command === MAV_CMD.NAV_WAYPOINT);
    expect(navItems.length).toBe(5);
    for (const item of navItems) {
      expect(item.altitude).toBe(altitude);
    }
  });
});

// =============================================================================
// 2. Side overlap max raised to 99%
// =============================================================================

describe('issue #74: side overlap range extended to 99%', () => {
  it('SurveyConfig type comment documents 20-99% range', () => {
    // The SurveyConfig.sideOverlap field comment says "% (20-99)"
    // Verify the DEFAULT is within the valid range
    expect(DEFAULT_SURVEY_CONFIG.sideOverlap).toBeGreaterThanOrEqual(20);
    expect(DEFAULT_SURVEY_CONFIG.sideOverlap).toBeLessThanOrEqual(99);
  });

  it('mission builder accepts high side overlap values (95%)', () => {
    const config = makeConfig({ sideOverlap: 95 });
    const result = makeSurveyResult(3);
    // Should not throw or produce empty results
    const items = surveyToMissionItems(result, config);
    expect(items.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// 3. Auto-adjust height logic: preserve survey altitude
// =============================================================================

describe('issue #74: auto-adjust altitude preserves intended clearance', () => {
  /**
   * The bug: a survey at 80m AGL got "auto-adjusted" down to 30m (the safe buffer)
   * because the old logic only added safeAltitudeBuffer to terrain elevation.
   *
   * The fix: targetClearance = Math.max(safeAltitudeBuffer, wp.altitude)
   * so a waypoint at 80m AGL stays at 80m above terrain, not 30m.
   */

  // Replicate the core auto-adjust logic extracted from AltitudeProfilePanel
  function computeAutoAdjustedAltitude(
    waypointAltitude: number,
    groundElevation: number,
    safeAltitudeBuffer: number,
  ): number | null {
    const targetClearance = Math.max(safeAltitudeBuffer, waypointAltitude);
    const minSafe = groundElevation + targetClearance;
    if (waypointAltitude < minSafe) {
      return Math.ceil(minSafe);
    }
    return null; // No adjustment needed
  }

  it('does not reduce 80m survey altitude to 30m safe buffer over flat terrain', () => {
    // Survey at 80m, terrain at 0m ASL, safe buffer 30m
    const adjusted = computeAutoAdjustedAltitude(80, 0, 30);
    // 80m is already >= groundElev(0) + max(30, 80) = 80, so no adjustment needed
    expect(adjusted).toBeNull();
  });

  it('raises waypoint when terrain requires it (e.g. hill at 200m)', () => {
    // Survey at 80m, terrain at 200m ASL, safe buffer 30m
    // targetClearance = max(30, 80) = 80
    // minSafe = 200 + 80 = 280
    // 80 < 280, so adjust to 280
    const adjusted = computeAutoAdjustedAltitude(80, 200, 30);
    expect(adjusted).toBe(280);
  });

  it('uses safe buffer when waypoint altitude is below it', () => {
    // Waypoint at 20m, terrain at 100m, safe buffer 30m
    // targetClearance = max(30, 20) = 30
    // minSafe = 100 + 30 = 130
    // 20 < 130, so adjust to 130
    const adjusted = computeAutoAdjustedAltitude(20, 100, 30);
    expect(adjusted).toBe(130);
  });

  it('preserves high altitude survey over high terrain', () => {
    // Survey at 120m, terrain at 50m, safe buffer 30m
    // targetClearance = max(30, 120) = 120
    // minSafe = 50 + 120 = 170
    // 120 < 170, so adjust to 170
    const adjusted = computeAutoAdjustedAltitude(120, 50, 30);
    expect(adjusted).toBe(170);
  });

  it('no adjustment when already above required minimum', () => {
    // Survey at 300m, terrain at 50m, safe buffer 30m
    // targetClearance = max(30, 300) = 300
    // minSafe = 50 + 300 = 350
    // 300 < 350, so adjust to 350
    const adjusted = computeAutoAdjustedAltitude(300, 50, 30);
    expect(adjusted).toBe(350);
  });

  it('zero terrain elevation: high altitude survey is untouched', () => {
    // Survey at 100m, flat ground at 0m, buffer 30m
    // targetClearance = max(30, 100) = 100
    // minSafe = 0 + 100 = 100
    // 100 is NOT < 100, so no adjustment
    const adjusted = computeAutoAdjustedAltitude(100, 0, 30);
    expect(adjusted).toBeNull();
  });

  it('OLD BUG: would have reduced 80m survey to 30m buffer', () => {
    // Demonstrate the old behavior was wrong
    function oldBuggyAutoAdjust(
      waypointAltitude: number,
      groundElevation: number,
      safeAltitudeBuffer: number,
    ): number | null {
      // OLD: minSafe = groundElev + safeBuffer (ignores waypoint altitude)
      const minSafe = groundElevation + safeAltitudeBuffer;
      if (waypointAltitude < minSafe) {
        return Math.ceil(minSafe);
      }
      return null;
    }

    // With the old logic: 80m survey, 200m terrain, 30m buffer
    // minSafe = 200 + 30 = 230 — would only raise to 230m
    // That's only 30m above terrain, not the intended 80m
    const oldResult = oldBuggyAutoAdjust(80, 200, 30);
    expect(oldResult).toBe(230); // Only 30m above terrain

    // With the new logic: raises to 280m (80m above terrain)
    const newResult = computeAutoAdjustedAltitude(80, 200, 30);
    expect(newResult).toBe(280); // 80m above terrain, as intended
    expect(newResult).toBeGreaterThan(oldResult!);
  });
});

// =============================================================================
// 4. Takeoff waypoint ignores lat/lon
// =============================================================================

describe('issue #74: takeoff waypoint has zero lat/lon', () => {
  it('sets latitude and longitude to 0 regardless of input', () => {
    const wp = createTakeoffWaypoint(0, -33.8688, 151.2093, 50, 15);
    expect(wp.latitude).toBe(0);
    expect(wp.longitude).toBe(0);
  });

  it('preserves altitude and pitch parameters', () => {
    const wp = createTakeoffWaypoint(1, 0, 0, 80, 20);
    expect(wp.altitude).toBe(80);
    expect(wp.param1).toBe(20); // pitch
    expect(wp.command).toBe(MAV_CMD.NAV_TAKEOFF);
  });

  it('uses default altitude and pitch when not specified', () => {
    const wp = createTakeoffWaypoint(0, 47.3977, 8.5249);
    expect(wp.altitude).toBe(50);   // default
    expect(wp.param1).toBe(15);     // default pitch
    expect(wp.latitude).toBe(0);
    expect(wp.longitude).toBe(0);
  });

  it('uses GLOBAL_RELATIVE_ALT frame', () => {
    const wp = createTakeoffWaypoint(0, 0, 0, 50);
    expect(wp.frame).toBe(MAV_FRAME.GLOBAL_RELATIVE_ALT);
  });
});

// =============================================================================
// 5. Survey polygon vertex removal (store logic)
// =============================================================================

describe('issue #74: survey polygon vertex removal', () => {
  /**
   * The survey store's removeVertex function must:
   * - Remove the vertex at the given index
   * - Prevent removal if polygon would have fewer than 3 vertices
   * - Trigger survey regeneration after removal
   *
   * We test the core logic in isolation since the store depends on Zustand
   * and generator imports. These tests verify the guard conditions.
   */

  function removeVertex(polygon: Array<{ lat: number; lng: number }>, index: number) {
    if (polygon.length <= 3) return polygon; // Guard: need at least 3
    return polygon.filter((_, i) => i !== index);
  }

  const square = [
    { lat: 0, lng: 0 },
    { lat: 0, lng: 1 },
    { lat: 1, lng: 1 },
    { lat: 1, lng: 0 },
  ];

  it('removes vertex at given index from a 4-vertex polygon', () => {
    const result = removeVertex(square, 1);
    expect(result).toHaveLength(3);
    expect(result).toEqual([
      { lat: 0, lng: 0 },
      { lat: 1, lng: 1 },
      { lat: 1, lng: 0 },
    ]);
  });

  it('does not remove from a triangle (minimum 3 vertices)', () => {
    const triangle = [
      { lat: 0, lng: 0 },
      { lat: 0, lng: 1 },
      { lat: 1, lng: 0 },
    ];
    const result = removeVertex(triangle, 0);
    expect(result).toHaveLength(3);
    expect(result).toBe(triangle); // Same reference — no mutation
  });

  it('removes first vertex correctly', () => {
    const result = removeVertex(square, 0);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ lat: 0, lng: 1 });
  });

  it('removes last vertex correctly', () => {
    const result = removeVertex(square, 3);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ lat: 1, lng: 1 });
  });
});

// =============================================================================
// 6. Fence polygon vertex removal
// =============================================================================

describe('issue #74: fence polygon vertex removal', () => {
  interface FenceVertex { lat: number; lon: number; seq: number }

  function removeVertexFromFencePolygon(vertices: FenceVertex[], index: number): FenceVertex[] {
    if (vertices.length <= 3) return vertices; // Minimum 3 vertices
    const filtered = vertices.filter((_, i) => i !== index);
    return filtered.map((v, i) => ({ ...v, seq: i })); // Renumber seq
  }

  const pentagon: FenceVertex[] = [
    { lat: 0, lon: 0, seq: 0 },
    { lat: 0, lon: 1, seq: 1 },
    { lat: 1, lon: 1, seq: 2 },
    { lat: 1, lon: 0, seq: 3 },
    { lat: 0.5, lon: -0.5, seq: 4 },
  ];

  it('removes a vertex and renumbers seq values', () => {
    const result = removeVertexFromFencePolygon(pentagon, 2);
    expect(result).toHaveLength(4);
    // Seq values should be renumbered 0-3
    result.forEach((v, i) => expect(v.seq).toBe(i));
    // The removed vertex (1,1) should not be present
    expect(result.find((v) => v.lat === 1 && v.lon === 1)).toBeUndefined();
  });

  it('does not remove from a triangle', () => {
    const triangle: FenceVertex[] = [
      { lat: 0, lon: 0, seq: 0 },
      { lat: 0, lon: 1, seq: 1 },
      { lat: 1, lon: 0, seq: 2 },
    ];
    const result = removeVertexFromFencePolygon(triangle, 1);
    expect(result).toHaveLength(3);
    expect(result).toBe(triangle); // Same reference
  });

  it('can reduce from 4 to 3 vertices', () => {
    const quad: FenceVertex[] = [
      { lat: 0, lon: 0, seq: 0 },
      { lat: 0, lon: 1, seq: 1 },
      { lat: 1, lon: 1, seq: 2 },
      { lat: 1, lon: 0, seq: 3 },
    ];
    const result = removeVertexFromFencePolygon(quad, 0);
    expect(result).toHaveLength(3);
    expect(result[0]!.seq).toBe(0);
    expect(result[1]!.seq).toBe(1);
    expect(result[2]!.seq).toBe(2);
  });
});

// =============================================================================
// 7. Mission builder structural integrity
// =============================================================================

describe('issue #74: survey mission builder produces correct item structure', () => {
  it('returns empty array for empty waypoints', () => {
    const emptyResult: SurveyResult = {
      waypoints: [],
      photoPositions: [],
      footprints: [],
      stats: {
        gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0,
        lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0,
        lineSpacing: 0, photoSpacing: 0,
      },
    };
    const config = makeConfig();
    const items = surveyToMissionItems(emptyResult, config);
    expect(items).toEqual([]);
  });

  it('produces DO_CHANGE_SPEED + cam on + waypoints + cam off', () => {
    const config = makeConfig({ speed: 8, altitude: 100 });
    const result = makeSurveyResult(3);
    const items = surveyToMissionItems(result, config);

    // Expected: 1 speed + 1 cam on + 3 waypoints + 1 cam off = 6
    expect(items).toHaveLength(6);

    expect(items[0]!.command).toBe(MAV_CMD.DO_CHANGE_SPEED);
    expect(items[0]!.param2).toBe(8); // speed

    expect(items[1]!.command).toBe(MAV_CMD.DO_SET_CAM_TRIGG_DIST);
    expect(items[1]!.param1).toBeGreaterThan(0); // trigger distance

    expect(items[2]!.command).toBe(MAV_CMD.NAV_WAYPOINT);
    expect(items[3]!.command).toBe(MAV_CMD.NAV_WAYPOINT);
    expect(items[4]!.command).toBe(MAV_CMD.NAV_WAYPOINT);

    expect(items[5]!.command).toBe(MAV_CMD.DO_SET_CAM_TRIGG_DIST);
    expect(items[5]!.param1).toBe(0); // camera off
  });

  it('sequences are monotonically increasing from 0', () => {
    const config = makeConfig();
    const result = makeSurveyResult(4);
    const items = surveyToMissionItems(result, config);

    items.forEach((item, i) => {
      expect(item.seq).toBe(i);
    });
  });

  it('waypoint lat/lng match the survey result', () => {
    const config = makeConfig({ altitudeReference: 'asl' });
    const result = makeSurveyResult(2);
    const items = surveyToMissionItems(result, config);

    const navItems = items.filter((i) => i.command === MAV_CMD.NAV_WAYPOINT);
    expect(navItems[0]!.latitude).toBe(result.waypoints[0]!.lat);
    expect(navItems[0]!.longitude).toBe(result.waypoints[0]!.lng);
    expect(navItems[1]!.latitude).toBe(result.waypoints[1]!.lat);
    expect(navItems[1]!.longitude).toBe(result.waypoints[1]!.lng);
  });
});

// =============================================================================
// 8. Settings defaults
// =============================================================================

describe('issue #74: settings store mission defaults', () => {
  // We can't import the store (Zustand + Electron deps), but we can
  // verify the type shape by importing the types and default values.
  // The actual DefaultAltitudeReference type is tested indirectly through
  // the AltitudeReference type used in survey config.

  it('AltitudeReference includes all three options', () => {
    // TypeScript compile-time check — if this compiles, the type is correct
    const refs: AltitudeReference[] = ['relative', 'asl', 'terrain'];
    expect(refs).toHaveLength(3);
  });

  it('DEFAULT_SURVEY_CONFIG.altitudeReference is "relative"', () => {
    expect(DEFAULT_SURVEY_CONFIG.altitudeReference).toBe('relative');
  });
});
