import type { VehicleProfile } from '../../stores/settings-store.js';
import type { VehicleTemplate, ProfileSnapshot } from './types.js';
import type { FileParamDiff } from '../../stores/parameter-store.js';
import { computeProfileDiff } from './compute-diff.js';
import { getTemplate, defaultTemplateForType, templateName } from './registry.js';
import { buildSnapshot, storeSnapshot } from './snapshot.js';
import { t } from '../../../shared/i18n/index.js';

export type ApplyTargetMode = 'auto' | 'sitl' | 'fc';

export interface ApplyGateError {
  ok: false;
  code: 'not-connected' | 'armed' | 'no-params' | 'nothing-to-apply' | 'no-template';
  reason: string;
}

export interface ApplyGateOK {
  ok: true;
  template: VehicleTemplate;
  target: { isSitl: boolean; sysid: number; label: string };
  diff: ReturnType<typeof computeProfileDiff>;
  /** Ready-to-use FileParamDiff shape for the compare modal. */
  fileDiffs: FileParamDiff[];
  /** Snapshot we'll persist if the user applies (not yet stored). */
  pendingSnapshot: ProfileSnapshot;
}

export type ApplyGateResult = ApplyGateOK | ApplyGateError;

/**
 * Validate every precondition and build everything the caller needs to open
 * the compare modal. Does NOT write to any store — callers drive the modal.
 */
export function prepareApply(args: {
  profile: VehicleProfile;
  mode: ApplyTargetMode;
  connectionState: { isConnected: boolean; isSitl?: boolean; systemId?: number; transport?: string };
  connectionLabel: string;
  armed: boolean;
  currentParams: Map<string, { value: number; type: number }>;
  isRebootRequired: (paramId: string) => boolean;
}): ApplyGateResult {
  const { profile, connectionState, armed } = args;

  if (!connectionState.isConnected) {
    return { ok: false, code: 'not-connected', reason: t('lib:vehicleTemplates.apply.notConnected') };
  }
  if (armed) {
    return { ok: false, code: 'armed', reason: t('lib:vehicleTemplates.apply.armed') };
  }
  if (args.currentParams.size === 0) {
    return { ok: false, code: 'no-params', reason: t('lib:vehicleTemplates.apply.noParams') };
  }

  const isSitl = !!connectionState.isSitl;
  if (args.mode === 'sitl' && !isSitl) {
    return { ok: false, code: 'not-connected', reason: t('lib:vehicleTemplates.apply.expectedSitl') };
  }
  if (args.mode === 'fc' && isSitl) {
    return { ok: false, code: 'not-connected', reason: t('lib:vehicleTemplates.apply.expectedFc') };
  }

  const template = getTemplate(profile.templateSlug) ?? defaultTemplateForType(profile.type);
  if (!template) {
    return { ok: false, code: 'no-template', reason: t('lib:vehicleTemplates.apply.noTemplate') };
  }

  // Cast: compute-diff wants ParameterWithMeta-compatible values but we only
  // use { value, type } — that's fine.
  const diff = computeProfileDiff(profile, template, {
    currentParams: args.currentParams as never,
    includeSim: isSitl,
    isRebootRequired: args.isRebootRequired,
  });

  if (diff.changes.length === 0) {
    return { ok: false, code: 'nothing-to-apply', reason: t('lib:vehicleTemplates.apply.nothingToApply') };
  }

  const fileDiffs: FileParamDiff[] = diff.changes.map(c => ({
    paramId: c.name,
    currentValue: c.currentValue,
    fileValue: c.targetValue,
    type: c.type,
    selected: true,
    note: c.reason,
  }));

  const target = {
    isSitl,
    sysid: connectionState.systemId ?? 1,
    label: args.connectionLabel,
  };

  const before: Record<string, number> = {};
  const applied: Record<string, number> = {};
  for (const c of diff.changes) {
    before[c.name] = c.currentValue;
    applied[c.name] = c.targetValue;
  }
  const pendingSnapshot = buildSnapshot({
    profileId: profile.id,
    templateSlug: template.slug,
    target,
    before,
    applied,
    reason: t('lib:vehicleTemplates.apply.snapshotReason', { name: templateName(template) }),
  });

  return { ok: true, template, target, diff, fileDiffs, pendingSnapshot };
}

/**
 * Called after the compare modal reports a successful apply. Persists the
 * snapshot and updates the profile's "lastApplied*" bookkeeping.
 */
export function finalizeApply(args: {
  snapshot: ProfileSnapshot;
  updateVehicle: (id: string, updates: Partial<VehicleProfile>) => void;
}) {
  storeSnapshot(args.snapshot);
  args.updateVehicle(args.snapshot.profileId, {
    lastAppliedAt: args.snapshot.createdAt,
    lastAppliedTo: args.snapshot.target,
    lastSnapshotId: args.snapshot.id,
  });
}

/**
 * Produce FileParamDiff[] that will undo a previous apply (restore `before`
 * values). Used by the Undo action and snapshot restore list.
 */
export function buildUndoDiffs(
  snapshot: ProfileSnapshot,
  currentParams: Map<string, { value: number; type: number }>,
): FileParamDiff[] {
  const diffs: FileParamDiff[] = [];
  for (const [name, before] of Object.entries(snapshot.before)) {
    const current = currentParams.get(name);
    if (!current) continue;                              // param no longer in cache
    if (Math.abs(current.value - before) < 1e-4) continue;  // already restored
    diffs.push({
      paramId: name,
      currentValue: current.value,
      fileValue: before,
      type: current.type,
      selected: true,
      note: t('lib:vehicleTemplates.apply.restoreNote', { date: snapshot.createdAt.split('T')[0] }),
    });
  }
  return diffs;
}
