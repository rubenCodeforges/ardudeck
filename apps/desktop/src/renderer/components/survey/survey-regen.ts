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
import { t } from '../../../shared/i18n/index.js';

export interface RegenerateResult {
  ok: boolean;
  reason?: string;
}

export async function regenerateSurveyGroup(groupId: string): Promise<RegenerateResult> {
  const store = useMissionStore.getState();
  const group = store.groups.find((g) => g.id === groupId);
  if (!group) return { ok: false, reason: t('survey:surveyRegen.groupNotFound') };
  if (!isSurveyGroup(group)) return { ok: false, reason: t('survey:surveyRegen.notSurveyGroup') };

  const reg = getSurveyGenerator(group.generatorId);
  if (!reg) {
    return {
      ok: false,
      reason: t('survey:surveyRegen.generatorNotInstalled', { generatorId: group.generatorId }),
    };
  }

  // The generator expects a SurveyConfig with the polygon as part of the
  // shape; the survey group stores polygon separately. Reassemble.
  const config = {
    ...(group.config as Record<string, unknown>),
    polygon: group.polygon,
  } as unknown as SurveyConfig;

  let result;
  try {
    result = await reg.generate(config);
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
  if (!result) {
    return { ok: false, reason: t('survey:surveyRegen.noResult') };
  }

  const firmware = useConnectionStore.getState().connectionState.firmware;
  const items = surveyToMissionItems(result, config, firmware);
  if (items.length === 0) {
    return { ok: false, reason: t('survey:surveyRegen.noWaypoints') };
  }

  // Re-read the group: an async generator may have taken a while, and the
  // group could have been edited or deleted meanwhile.
  const freshStore = useMissionStore.getState();
  const freshGroup = freshStore.groups.find((g) => g.id === groupId);
  if (!freshGroup || !isSurveyGroup(freshGroup)) {
    return { ok: false, reason: t('survey:surveyRegen.groupChanged') };
  }
  const signature = computeSurveyGroupSignature(freshGroup as SurveyGroup);
  freshStore.replaceSurveyGroupItems(groupId, items, signature, result.generatorResult);
  return { ok: true };
}
