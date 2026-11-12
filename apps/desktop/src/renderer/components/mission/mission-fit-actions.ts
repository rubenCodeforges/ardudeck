import { create } from 'zustand';
import { useMissionStore } from '../../stores/mission-store';
import { useSurveyStore } from '../../stores/survey-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore } from '../../stores/parameter-store';
import { buildFlightSplitEntries } from '../survey/survey-flight-split';
import { proposeParameterChanges } from '../../lib/param-proposal';
import type { SurveyGroup } from '../../../shared/mission-group-types';
import type { SurveyResult } from '../survey/survey-types';
import { t } from '../../../shared/i18n/index.js';

/** ArduPilot's BRD_SD_MISSION ceiling, in kB; each mission item takes 15 bytes. */
export const SD_MISSION_KB = 64;
export const SD_MISSION_ITEMS = Math.floor((SD_MISSION_KB * 1024) / 15);

export const useMissionFitStore = create<{
  open: boolean;
  itemCount: number;
  /** True when the flight controller refused the upload for lack of space. */
  rejected: boolean;
  show: (itemCount: number, rejected: boolean) => void;
  close: () => void;
}>((set) => ({
  open: false,
  itemCount: 0,
  rejected: false,
  show: (itemCount, rejected) => set({ open: true, itemCount, rejected }),
  close: () => set({ open: false }),
}));

export interface FitOutcome {
  ok: boolean;
  message: string;
}

function surveyGroups(): SurveyGroup[] {
  return useMissionStore.getState().groups.filter((g): g is SurveyGroup => g.kind === 'survey');
}

function itemsIn(groupId: string): number {
  return useMissionStore.getState().missionItems.filter((i) => i.groupId === groupId).length;
}

/** The survey group holding the most items: the one making the mission too large. */
export function largestSurveyGroup(): SurveyGroup | null {
  let best: SurveyGroup | null = null;
  for (const g of surveyGroups()) if (!best || itemsIn(g.id) > itemsIn(best.id)) best = g;
  return best;
}

export function terrainFollowGroups(): SurveyGroup[] {
  return surveyGroups().filter((g) => g.config?.terrainFollow === true);
}

/** Open a survey group in the panel and wait for its preview, including the terrain-follow refinement. */
async function openGroupResult(group: SurveyGroup, timeoutMs = 90_000): Promise<SurveyResult | null> {
  useSurveyStore.getState().loadFromGroup({ id: group.id, polygon: group.polygon, config: group.config });
  const start = Date.now();
  let first: SurveyResult | null = null;
  while (Date.now() - start < timeoutMs) {
    const st = useSurveyStore.getState();
    if (st.editingGroupId !== group.id) return null;
    if (st.result && !st.generating) {
      if (!st.config.terrainFollow) return st.result;
      // Terrain following replaces the first preview once elevations resolve.
      if (first && st.result !== first) return st.result;
      first ??= st.result;
      if (Date.now() - start > 20_000) return st.result;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return useSurveyStore.getState().result;
}

/** Replace the largest survey with one flight group per battery, each uploaded on its own. */
export async function splitLargestSurveyIntoFlights(): Promise<FitOutcome> {
  const group = largestSurveyGroup();
  if (!group) return { ok: false, message: t('mission:missionFit.noSurvey') };
  const result = await openGroupResult(group);
  const st = useSurveyStore.getState();
  if (!result) {
    st.clearSurvey();
    return { ok: false, message: t('mission:missionFit.splitFailed') };
  }
  const entries = buildFlightSplitEntries({
    result,
    polygon: st.polygon ?? group.polygon,
    config: st.config,
    existingGroups: useMissionStore.getState().groups,
    firmware: useConnectionStore.getState().connectionState.firmware,
  });
  st.clearSurvey();
  if (!entries) return { ok: false, message: t('mission:missionFit.oneFlight') };
  const ms = useMissionStore.getState();
  ms.addGroupsWithItems(entries);
  ms.deleteGroup(group.id);
  const largest = Math.max(...entries.map((e) => e.items.length));
  return { ok: true, message: t('mission:missionFit.splitDone', { count: entries.length, largest }) };
}

/** Let the flight controller follow the terrain: waypoints only at line ends, terrain-relative frame. */
export async function switchSurveysToFcTerrain(): Promise<FitOutcome> {
  const groups = terrainFollowGroups();
  if (groups.length === 0) return { ok: false, message: t('mission:missionFit.noTerrainFollow') };
  for (const g of groups) {
    const result = await openGroupResult(g);
    if (!result) continue;
    const st = useSurveyStore.getState();
    useSurveyStore.setState({ config: { ...st.config, terrainFollow: false, altitudeReference: 'terrain' } });
    await useSurveyStore.getState().generateSurvey({ sync: true });
    useSurveyStore.getState().clearSurvey();
  }
  const total = useMissionStore.getState().missionItems.length;
  const params = useParameterStore.getState().parameters;
  const terrainOff = params.get('TERRAIN_ENABLE')?.value === 0;
  if (terrainOff) {
    const outcome = await proposeParameterChanges([{ name: 'TERRAIN_ENABLE', value: 1, reason: t('mission:missionFit.terrainEnableReason') }]);
    if (!outcome.ok) return { ok: true, message: t('mission:missionFit.terrainDoneParamNot', { total }) };
  }
  return { ok: true, message: t('mission:missionFit.terrainDone', { total }) };
}

/** Reserve the SD card for mission storage. Goes through the parameter review; the board must reboot after. */
export async function enableSdMissionStorage(): Promise<FitOutcome> {
  const outcome = await proposeParameterChanges([
    { name: 'BRD_SD_MISSION', value: SD_MISSION_KB, reason: t('mission:missionFit.sdReason', { items: SD_MISSION_ITEMS.toLocaleString() }) },
  ]);
  if (!outcome.ok) return { ok: false, message: outcome.reason ?? outcome.rejected[0]?.reason ?? t('mission:missionFit.sdNotApplied') };
  return { ok: true, message: t('mission:missionFit.sdDone') };
}

export function sdMissionAvailable(): boolean {
  const cs = useConnectionStore.getState().connectionState;
  return cs.isConnected && cs.firmware === 'ardupilot' && useParameterStore.getState().parameters.has('BRD_SD_MISSION');
}
