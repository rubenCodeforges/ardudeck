import type { Group, ManualGroup } from '../../../shared/mission-group-types';
import { createManualGroup, GROUP_COLOR_PALETTE } from '../../../shared/mission-group-types';
import type { MissionItem } from '../../../shared/mission-types';
import { splitIntoSorties } from './survey-sortie-split';
import { splitCorridorIntoSections, sectionCountForEndurance, sectionCountForLength } from './corridor-sections';
import { surveyToMissionItems } from './mission-builder';
import type { LatLng, SurveyConfig, SurveyResult } from './survey-types';
import { t } from '../../../shared/i18n/index.js';

export type FlightSplitMode = 'sections' | 'lines';

/**
 * One battery-sized flight group per sortie. Each is a complete flight (takeoff, its slice, RTL)
 * and uploads on its own. Null when the survey fits in one flight.
 */
export function buildFlightSplitEntries(args: {
  result: SurveyResult;
  polygon: LatLng[];
  config: Omit<SurveyConfig, 'polygon'>;
  existingGroups: Group[];
  firmware: Parameters<typeof surveyToMissionItems>[2];
  mode?: FlightSplitMode;
}): Array<{ group: ManualGroup; items: MissionItem[] }> | null {
  const { result, polygon, config, existingGroups, firmware } = args;
  const mode = args.mode ?? 'sections';
  // A corridor's path is line-major, so slicing it by time hands each flight a few full-length passes;
  // one aircraft wants this stretch finished before moving down the route.
  const isCorridor = config.pattern === 'corridor';
  const override = config.corridorSectionLengthM ?? 0;
  const sorties = isCorridor && mode === 'sections'
    ? splitCorridorIntoSections(
        result.waypoints,
        polygon,
        override > 0
          ? sectionCountForLength(polygon, override)
          : sectionCountForEndurance(result.waypoints, config.speed, config.enduranceMinutes ?? 20),
      )
    : splitIntoSorties(result.waypoints, config.speed, config.enduranceMinutes ?? 20);
  if (sorties.length <= 1) return null;
  const fullConfig = { ...config, polygon };
  const baseName = `${t('survey:surveyConfigPanel.surveyNamePrefix')} ${existingGroups.filter((g) => g.kind === 'survey').length + 1}`;
  return sorties.map((slice, i) => {
    // each flight keeps only its own whole lines, renumbered from its first waypoint
    const offset = slice.length > 0 ? result.waypoints.indexOf(slice[0]!) : -1;
    const legStarts = offset < 0 ? undefined : (result.legStarts ?? [])
      .filter((s) => s >= offset && s + 1 < offset + slice.length)
      .map((s) => s - offset);
    const items = surveyToMissionItems({ ...result, waypoints: slice, legStarts }, fullConfig, firmware);
    const group = createManualGroup({
      name: `${baseName} · ${isCorridor && mode === 'sections' ? t('survey:surveyConfigPanel.sectionWord') : t('survey:surveyConfigPanel.flightWord')} ${i + 1}/${sorties.length}`,
      color: GROUP_COLOR_PALETTE[i % GROUP_COLOR_PALETTE.length]!,
    });
    return { group: { ...group, separateFlight: true }, items };
  });
}
