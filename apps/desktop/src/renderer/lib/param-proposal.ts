import { useParameterStore } from '../stores/parameter-store';
import { useTelemetryStore } from '../stores/telemetry-store';

export interface ParamChangeProposal {
  name: string;
  value: number;
  reason?: string;
}

export interface ParamProposalOutcome {
  ok: boolean;
  applied?: number;
  failed?: number;
  failedParams?: string[];
  rebootRequired?: string[];
  rejected: Array<{ name: string; reason: string }>;
  reason?: string;
}

/** Identity and motor-topology parameters are never proposable. */
const DENY = new Set<string>(['MOT_PWM_TYPE', 'FRAME_CLASS', 'FRAME_TYPE', 'COMPASS_ORIENT', 'BRD_TYPE']);

export async function proposeParameterChanges(
  proposals: ParamChangeProposal[],
  timeoutMs = 5 * 60 * 1000,
  /** Pilot-initiated in-flight tuning (e.g. loiter radius). Agents and modules never pass this. */
  options: { allowArmed?: boolean } = {},
): Promise<ParamProposalOutcome> {
  if (!Array.isArray(proposals) || proposals.length === 0) throw new Error('proposals array is empty'); // i18n-exempt

  if (!options.allowArmed && useTelemetryStore.getState().flight?.armed) {
    return { ok: false, reason: 'vehicle is armed, disarm before applying parameter changes', rejected: [] }; // i18n-exempt
  }

  // Connect-time batch reads leave a partial set that would reject every proposal as unknown.
  const pStore = useParameterStore;
  const hasAll = () => pStore.getState().hasFullParameterSet();
  if (!hasAll()) {
    await pStore.getState().fetchParameters();
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && !hasAll()) await new Promise((r) => setTimeout(r, 100));
  }
  if (!hasAll()) {
    return { ok: false, reason: 'parameters are not loaded; could not verify the proposals', rejected: [] }; // i18n-exempt
  }

  const paramMap = pStore.getState().parameters;
  const diffs: Array<Record<string, unknown>> = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  for (const p of proposals) {
    if (DENY.has(p.name)) {
      rejected.push({ name: p.name, reason: 'denylisted (identity/motor-topology)' }); // i18n-exempt
      continue;
    }
    const existing = paramMap.get(p.name);
    if (!existing) {
      rejected.push({ name: p.name, reason: 'unknown parameter' }); // i18n-exempt
      continue;
    }
    if (existing.isReadOnly) {
      rejected.push({ name: p.name, reason: 'read-only' });
      continue;
    }
    const newValue = Number(p.value);
    if (Number.isNaN(newValue)) {
      rejected.push({ name: p.name, reason: 'value is not numeric' }); // i18n-exempt
      continue;
    }
    diffs.push({ paramId: p.name, currentValue: existing.value, fileValue: newValue, type: existing.type, selected: true, note: p.reason });
  }
  if (diffs.length === 0) return { ok: false, reason: 'no applicable proposals', rejected }; // i18n-exempt

  pStore.setState({
    fileParamDiffs: diffs,
    fileSkippedParams: [],
    fileSkippedCount: 0,
    fileTotalCount: diffs.length,
    fileVehicleType: null,
    showCompareModal: true,
    applyProgress: null,
    fileApplyResult: null,
    lastFileApplyOutcome: null,
  } as never);

  // fileApplyResult is null on a clean apply, so only lastFileApplyOutcome tells success from cancel.
  return new Promise<ParamProposalOutcome>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const s = pStore.getState();
      const outcome = s.lastFileApplyOutcome;
      if (outcome) {
        resolve({
          ok: outcome.failed === 0,
          applied: outcome.applied,
          failed: outcome.failed,
          failedParams: outcome.failedParams ?? [],
          rebootRequired: outcome.rebootRequired,
          rejected,
          ...(outcome.failed > 0
            ? { reason: `${outcome.failed} of ${outcome.applied + outcome.failed} parameters failed to write` } // i18n-exempt
            : {}),
        });
        return;
      }
      if (!s.showCompareModal && !s.isApplyingFileParams) {
        resolve({ ok: false, reason: 'user cancelled', rejected }); // i18n-exempt
        return;
      }
      if (Date.now() - started > timeoutMs) {
        pStore.setState({ showCompareModal: false, fileParamDiffs: [] } as never);
        reject(new Error('Timeout waiting for user to review proposed parameters')); // i18n-exempt
        return;
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}
