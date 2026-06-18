/**
 * Survey group regeneration.
 *
 * Takes a survey group's stored inputs (polygon + config + generatorId),
 * runs the registered generator, and asks mission-store to replace the
 * group's existing WPs with the new ones. The group's
 * lastGeneratedSignature is refreshed so subsequent edits flip the group
 * to "stale" again on the next mutation.
 *
 * Spec: docs/superpowers/specs/2026-05-28-mission-groups-design.md
 */

import { useMissionStore } from '../../stores/mission-store';
import { useConnectionStore } from '../../stores/connection-store';
import { getSurveyGenerator } from './generator-registry';
import { surveyToMissionItems } from './mission-builder';
import { isSurveyGroup, type SurveyGroup } from '../../../shared/mission-group-types';
import { computeSurveyGroupSignature } from './survey-group-signature';
import type { SurveyConfig } from './survey-types';

export interface RegenerateResult {
  ok: boolean;
  reason?: string;
}

export function regenerateSurveyGroup(groupId: string): RegenerateResult {
  const store = useMissionStore.getState();
  const group = store.groups.find((g) => g.id === groupId);
  if (!group) return { ok: false, reason: 'Group not found' };
  if (!isSurveyGroup(group)) return { ok: false, reason: 'Not a survey group' };

  const reg = getSurveyGenerator(group.generatorId);
  if (!reg) {
    return {
      ok: false,
      reason: `Generator "${group.generatorId}" not installed`,
    };
  }

  // The generator expects a SurveyConfig with the polygon as part of the
  // shape; the survey group stores polygon separately. Reassemble.
  const config = {
    ...(group.config as Record<string, unknown>),
    polygon: group.polygon,
  } as unknown as SurveyConfig;

  const result = reg.generate(config);
  if (result instanceof Promise) {
    return {
      ok: false,
      reason: 'Async generator regeneration lands in a later PR',
    };
  }
  if (!result) {
    return { ok: false, reason: 'Generator returned no result' };
  }

  const firmware = useConnectionStore.getState().connectionState.firmware;
  const items = surveyToMissionItems(result, config, firmware);
  if (items.length === 0) {
    return { ok: false, reason: 'Generator produced no waypoints' };
  }

  const signature = computeSurveyGroupSignature(group as SurveyGroup);
  store.replaceSurveyGroupItems(groupId, items, signature);
  return { ok: true };
}
