import type { FenceProposal, MissionProposal, ProposalResult } from '@ardudeck/module-sdk';
import { useMissionStore } from '../stores/mission-store';
import { useFenceStore } from '../stores/fence-store';
import { createImportedGroup, nextGroupColor } from '../../shared/mission-group-types';
import { createDefaultWaypoint, MAV_CMD, MAV_FRAME } from '../../shared/mission-types';
import { replaceInclusion, appendExclusions } from './module-fence-write';
import { t } from '../../shared/i18n/index.js';

export type ProposedCommand = 'waypoint' | 'takeoff' | 'land' | 'loiter_time';

const COMMAND_IDS: Record<ProposedCommand, number> = {
  waypoint: MAV_CMD.NAV_WAYPOINT,
  takeoff: MAV_CMD.NAV_TAKEOFF,
  land: MAV_CMD.NAV_LAND,
  loiter_time: MAV_CMD.NAV_LOITER_TIME,
};

export interface MissionApplyExtras {
  /** Per item, same order as proposal.items. Missing entries are plain waypoints. */
  commands?: Array<{ command?: ProposedCommand; holdSeconds?: number } | undefined>;
  /** Append a return-to-launch item after the last one. */
  returnToLaunch?: boolean;
}

/** Write an accepted mission proposal into the planner as its own group. Nothing is uploaded. */
export function applyMissionProposal(sourceLabel: string, proposal: MissionProposal, extras: MissionApplyExtras = {}): ProposalResult {
  const current = useMissionStore.getState();
  const replace = proposal.mode === 'replace';
  const base = replace ? [] : current.missionItems;
  const group = createImportedGroup({ importedFrom: 'file', sourceLabel, name: proposal.name, color: nextGroupColor(current.groups), order: replace ? 0 : current.groups.length });
  const items = proposal.items.map((it, i) => {
    const wp = createDefaultWaypoint(base.length + i, it.lat, it.lng, it.altitude, group.id);
    if (it.frame === 'asl') wp.frame = MAV_FRAME.GLOBAL;
    const cmd = extras.commands?.[i];
    if (cmd?.command) wp.command = COMMAND_IDS[cmd.command];
    if (cmd?.holdSeconds !== undefined && (cmd.command === 'waypoint' || cmd.command === 'loiter_time' || !cmd.command)) wp.param1 = Math.max(0, cmd.holdSeconds);
    return wp;
  });
  if (extras.returnToLaunch && items.length > 0) {
    const last = items[items.length - 1]!;
    const rtl = createDefaultWaypoint(base.length + items.length, last.latitude, last.longitude, 0, group.id);
    rtl.command = MAV_CMD.NAV_RETURN_TO_LAUNCH;
    rtl.latitude = 0;
    rtl.longitude = 0;
    items.push(rtl);
  }
  if (replace) current.setMissionItemsFromFile(items, [group]);
  else useMissionStore.setState({ missionItems: [...base, ...items], groups: [...current.groups, group], isDirty: true, selectedSeq: items[items.length - 1]?.seq ?? null });
  return { accepted: true, pointsAccepted: items.length };
}

/** Write an accepted fence proposal: replace the inclusion, add exclusions, upload. */
export async function applyFenceProposal(proposal: FenceProposal): Promise<ProposalResult> {
  const fence = useFenceStore.getState();
  const inclusion = proposal.inclusion && proposal.inclusion.length >= 3 ? proposal.inclusion : null;
  if (inclusion) replaceInclusion(fence, fence, inclusion);
  const exclusionsWritten = proposal.exclusions ? appendExclusions(fence, proposal.exclusions) : undefined;
  const ok = await useFenceStore.getState().uploadFence();
  const result: ProposalResult = { accepted: true };
  if (inclusion) result.pointsAccepted = inclusion.length;
  if (exclusionsWritten !== undefined) result.exclusionsAccepted = exclusionsWritten;
  if (!ok) result.error = useFenceStore.getState().error ?? t('modules:moduleHost.fenceNotConfirmed');
  return result;
}
