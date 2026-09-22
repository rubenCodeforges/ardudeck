import { describe, it, expect } from 'vitest';
import { surveyToMissionItems } from './mission-builder';
import { MAV_FRAME, MAV_CMD } from '../../../shared/mission-types';
import type { SurveyConfig, SurveyResult } from './survey-types';
import { DEFAULT_SURVEY_CONFIG } from './survey-types';

/** Minimal survey result with two waypoints for testing */
function makeSurveyResult(): SurveyResult {
  return {
    waypoints: [
      { lat: -35.362, lng: 149.165 },
      { lat: -35.363, lng: 149.166 },
    ],
    photoPositions: [],
    footprints: [],
    stats: {
      gsd: 2.5,
      flightDistance: 200,
      flightTime: 40,
      photoCount: 20,
      lineCount: 2,
      areaCovered: 5000,
      footprintWidth: 50,
      footprintHeight: 37,
      lineSpacing: 15,
      photoSpacing: 10,
    },
  };
}

/** Build a full SurveyConfig with a specific altitude reference */
function makeConfig(altitudeReference: SurveyConfig['altitudeReference']): SurveyConfig {
  return {
    ...DEFAULT_SURVEY_CONFIG,
    polygon: [
      { lat: -35.36, lng: 149.16 },
      { lat: -35.37, lng: 149.16 },
      { lat: -35.37, lng: 149.17 },
    ],
    altitudeReference,
  };
}

describe('surveyToMissionItems', () => {
  it('returns empty array for empty waypoints', () => {
    const result: SurveyResult = {
      ...makeSurveyResult(),
      waypoints: [],
    };
    const items = surveyToMissionItems(result, makeConfig('relative'));
    expect(items).toHaveLength(0);
  });

  describe('altitude reference → MAV_FRAME mapping', () => {
    it('uses GLOBAL_RELATIVE_ALT frame for "relative" altitude reference', () => {
      const items = surveyToMissionItems(makeSurveyResult(), makeConfig('relative'));
      const navItems = items.filter((i) => i.command === MAV_CMD.NAV_WAYPOINT);
      expect(navItems.length).toBeGreaterThan(0);
      for (const item of navItems) {
        expect(item.frame).toBe(MAV_FRAME.GLOBAL_RELATIVE_ALT);
      }
    });

    it('uses GLOBAL_TERRAIN_ALT frame for "terrain" altitude reference', () => {
      const items = surveyToMissionItems(makeSurveyResult(), makeConfig('terrain'));
      const navItems = items.filter((i) => i.command === MAV_CMD.NAV_WAYPOINT);
      expect(navItems.length).toBeGreaterThan(0);
      for (const item of navItems) {
        expect(item.frame).toBe(MAV_FRAME.GLOBAL_TERRAIN_ALT);
      }
    });

    it('uses GLOBAL (MSL) frame for "asl" altitude reference', () => {
      const items = surveyToMissionItems(makeSurveyResult(), makeConfig('asl'));
      const navItems = items.filter((i) => i.command === MAV_CMD.NAV_WAYPOINT);
      expect(navItems.length).toBeGreaterThan(0);
      for (const item of navItems) {
        expect(item.frame).toBe(MAV_FRAME.GLOBAL);
      }
    });
  });

  it('DO commands always use GLOBAL_RELATIVE_ALT regardless of altitude reference', () => {
    for (const ref of ['relative', 'asl', 'terrain'] as const) {
      const items = surveyToMissionItems(makeSurveyResult(), makeConfig(ref));
      const doItems = items.filter(
        (i) => i.command === MAV_CMD.DO_CHANGE_SPEED || i.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST,
      );
      expect(doItems.length).toBeGreaterThan(0);
      for (const item of doItems) {
        expect(item.frame).toBe(MAV_FRAME.GLOBAL_RELATIVE_ALT);
      }
    }
  });

  it('sets waypoint altitude from config.altitude', () => {
    const config = makeConfig('relative');
    config.altitude = 120;
    const items = surveyToMissionItems(makeSurveyResult(), config);
    const navItems = items.filter((i) => i.command === MAV_CMD.NAV_WAYPOINT);
    for (const item of navItems) {
      expect(item.altitude).toBe(120);
    }
  });

  it('generates correct structure: takeoff, wp1, speed, cam-on, waypoints, cam-off, rtl', () => {
    const items = surveyToMissionItems(makeSurveyResult(), makeConfig('relative'));
    // 1 takeoff + 2 waypoints + 1 speed + 1 cam-on + 1 cam-off + 1 rtl = 7
    expect(items).toHaveLength(7);
    // Speed and camera-trigger now follow the FIRST waypoint (issue #83):
    // ArduPilot ignores DO_* commands placed before the first NAV_WAYPOINT.
    expect(items[0]!.command).toBe(MAV_CMD.NAV_TAKEOFF);
    expect(items[1]!.command).toBe(MAV_CMD.NAV_WAYPOINT);
    expect(items[2]!.command).toBe(MAV_CMD.DO_CHANGE_SPEED);
    expect(items[3]!.command).toBe(MAV_CMD.DO_SET_CAM_TRIGG_DIST);
    expect(items[4]!.command).toBe(MAV_CMD.NAV_WAYPOINT);
    expect(items[5]!.command).toBe(MAV_CMD.DO_SET_CAM_TRIGG_DIST);
    // Last cam trigger should disable (distance = 0)
    expect(items[5]!.param1).toBe(0);
    expect(items[6]!.command).toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
  });

  it('assigns sequential seq numbers starting from 0', () => {
    const items = surveyToMissionItems(makeSurveyResult(), makeConfig('relative'));
    items.forEach((item, i) => {
      expect(item.seq).toBe(i);
    });
  });

  describe('cameraOffOutside', () => {
    // A 2-line (4-waypoint) grid result: start/end pairs.
    function twoLineResult(): SurveyResult {
      return {
        ...makeSurveyResult(),
        waypoints: [
          { lat: -35.360, lng: 149.160 }, { lat: -35.360, lng: 149.170 }, // line 0
          { lat: -35.361, lng: 149.170 }, { lat: -35.361, lng: 149.160 }, // line 1
        ],
      };
    }

    it('off (default): one continuous trigger + final disable', () => {
      const items = surveyToMissionItems(twoLineResult(), makeConfig('relative'));
      const on = items.filter((i) => i.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST && i.param1 > 0);
      const off = items.filter((i) => i.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST && i.param1 === 0);
      expect(on).toHaveLength(1);
      expect(off).toHaveLength(1);
    });

    it('on: arms at each line entry, disarms at each exit (camera off on turns)', () => {
      const items = surveyToMissionItems(twoLineResult(), { ...makeConfig('relative'), pattern: 'grid', cameraOffOutside: true });
      const on = items.filter((i) => i.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST && i.param1 > 0);
      const off = items.filter((i) => i.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST && i.param1 === 0);
      expect(on).toHaveLength(2);            // one arm per line entry
      expect(off.length).toBeGreaterThanOrEqual(2); // one disarm per exit (+ final disable)
      // A disarm (cam off) sits between the two lines' waypoints, so no photos
      // are taken during the turn-around.
      const seqOfWp2 = items.find((i) => i.command === MAV_CMD.NAV_WAYPOINT && i.latitude === -35.361 && i.longitude === 149.170)!.seq;
      const disarmBefore = items.some((i) => i.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST && i.param1 === 0 && i.seq < seqOfWp2);
      expect(disarmBefore).toBe(true);
    });

    it('on but corridor pattern: not bracketed (single trigger)', () => {
      const items = surveyToMissionItems(twoLineResult(), { ...makeConfig('relative'), pattern: 'corridor', cameraOffOutside: true });
      const on = items.filter((i) => i.command === MAV_CMD.DO_SET_CAM_TRIGG_DIST && i.param1 > 0);
      expect(on).toHaveLength(1);
    });
  });
});

describe('mission ends', () => {
  const result = makeSurveyResult();
  const last = (items: ReturnType<typeof surveyToMissionItems>) => items[items.length - 1]!;

  it('closes with RTL by default', () => {
    expect(last(surveyToMissionItems(result, makeConfig('relative'))).command)
      .toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
  });

  // Without this a second survey cannot be planned in the same mission: the
  // first one flies home in the middle of the flight.
  it('ends on the last line when the finish is None', () => {
    const items = surveyToMissionItems(result, { ...makeConfig('relative'), finish: 'none' });
    expect(last(items).command).toBe(MAV_CMD.DO_SET_CAM_TRIGG_DIST);
    expect(items.some((i) => i.command === MAV_CMD.NAV_RETURN_TO_LAUNCH)).toBe(false);
  });

  it('lands where the survey ended when the finish is Land', () => {
    const items = surveyToMissionItems(result, { ...makeConfig('relative'), finish: 'land' });
    const end = last(items);
    expect(end.command).toBe(MAV_CMD.NAV_LAND);
    expect(end.latitude).toBeCloseTo(-35.363, 5);
    expect(end.longitude).toBeCloseTo(149.166, 5);
  });

  it('omits the takeoff when the pilot launches by hand', () => {
    const items = surveyToMissionItems(result, { ...makeConfig('relative'), start: 'none' });
    expect(items.some((i) => i.command === MAV_CMD.NAV_TAKEOFF)).toBe(false);
    expect(items[0]!.command).toBe(MAV_CMD.NAV_WAYPOINT);
    expect(items.map((i) => i.seq)).toEqual(items.map((_, i) => i));
  });

  it('a chained survey carries neither end', () => {
    const items = surveyToMissionItems(result, { ...makeConfig('relative'), start: 'none', finish: 'none' });
    expect(items.some((i) => i.command === MAV_CMD.NAV_TAKEOFF)).toBe(false);
    expect(items.some((i) => i.command === MAV_CMD.NAV_RETURN_TO_LAUNCH)).toBe(false);
  });

  it('a VTOL takes off and lands vertically', () => {
    const vtol = { ...makeConfig('relative'), airframe: 'vtol' as const, finish: 'land' as const };
    const items = surveyToMissionItems(result, vtol);
    expect(items[0]!.command).toBe(MAV_CMD.NAV_VTOL_TAKEOFF);
    expect(last(items).command).toBe(MAV_CMD.NAV_VTOL_LAND);
  });

  it('a VTOL still returns with a plain RTL', () => {
    const items = surveyToMissionItems(result, { ...makeConfig('relative'), airframe: 'vtol' });
    expect(last(items).command).toBe(MAV_CMD.NAV_RETURN_TO_LAUNCH);
  });
});
