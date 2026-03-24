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

  it('generates correct structure: speed, cam-on, waypoints, cam-off', () => {
    const items = surveyToMissionItems(makeSurveyResult(), makeConfig('relative'));
    // 1 speed + 1 cam-on + 2 waypoints + 1 cam-off = 5
    expect(items).toHaveLength(5);
    expect(items[0]!.command).toBe(MAV_CMD.DO_CHANGE_SPEED);
    expect(items[1]!.command).toBe(MAV_CMD.DO_SET_CAM_TRIGG_DIST);
    expect(items[2]!.command).toBe(MAV_CMD.NAV_WAYPOINT);
    expect(items[3]!.command).toBe(MAV_CMD.NAV_WAYPOINT);
    expect(items[4]!.command).toBe(MAV_CMD.DO_SET_CAM_TRIGG_DIST);
    // Last cam trigger should disable (distance = 0)
    expect(items[4]!.param1).toBe(0);
  });

  it('assigns sequential seq numbers starting from 0', () => {
    const items = surveyToMissionItems(makeSurveyResult(), makeConfig('relative'));
    items.forEach((item, i) => {
      expect(item.seq).toBe(i);
    });
  });
});
