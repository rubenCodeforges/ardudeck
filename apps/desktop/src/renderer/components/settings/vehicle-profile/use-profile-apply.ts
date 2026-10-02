import { useCallback } from 'react';
import { t } from '../../../../shared/i18n/index.js';
import type { VehicleProfile } from '../../../stores/settings-store.js';
import { useSettingsStore } from '../../../stores/settings-store.js';
import { useConnectionStore } from '../../../stores/connection-store.js';
import { useParameterStore } from '../../../stores/parameter-store.js';
import { useTelemetryStore } from '../../../stores/telemetry-store.js';
import { useProfileApplyStore } from '../../../stores/profile-apply-store.js';
import { prepareApply, finalizeApply, type ApplyGateResult } from '../../../lib/vehicle-templates/apply.js';
import { recordSitlApply } from '../../../lib/vehicle-templates/sitl-stickiness.js';
import { saveParmToFile } from '../../../lib/vehicle-templates/export-parm.js';
import { getTemplate, defaultTemplateForType } from '../../../lib/vehicle-templates/registry.js';

/**
 * Hook: exposes `start` + `confirmRealFc` + `cancelRealFc` actions that drive
 * the GLOBAL profile-apply store. Status, toast, and real-FC preflight are
 * rendered once at App root by <ProfileApplyOverlay> — so they survive the
 * Edit Vehicle modal closing and the navigation to Parameters view.
 */
export function useProfileApply(profile: VehicleProfile) {
  const connectionState = useConnectionStore(s => s.connectionState);
  const updateVehicle = useSettingsStore(s => s.updateVehicle);
  const applyStore = useProfileApplyStore;

  const start = useCallback(async (): Promise<void> => {
    const paramStore = useParameterStore.getState();
    const telemetry = useTelemetryStore.getState();
    const armed = !!telemetry.flight?.armed;

    const label = connectionState.transport ?? (connectionState.isSitl ? 'SITL' : t('common:vehicle'));

    const params = new Map<string, { value: number; type: number }>();
    for (const [id, meta] of paramStore.parameters) {
      params.set(id, { value: meta.value, type: meta.type });
    }

    const gate = prepareApply({
      profile,
      mode: 'auto',
      connectionState,
      connectionLabel: label,
      armed,
      currentParams: params,
      isRebootRequired: paramStore.isRebootRequired,
    });

    if (!gate.ok) {
      applyStore.getState().setToast({
        kind: 'error',
        message: gate.reason,
        createdAt: Date.now(),
      });
      return;
    }

    const destructive = gate.diff.changes
      .filter(c => /^FRAME_|^Q_/.test(c.name) || c.name === 'MOT_PWM_TYPE')
      .map(c => c.name);

    if (!gate.target.isSitl) {
      applyStore.getState().setPreflight({
        profile,
        fileDiffs: gate.fileDiffs,
        pendingSnapshot: gate.pendingSnapshot,
        destructiveParams: destructive,
        target: gate.target,
      });
      applyStore.getState().setStatus('reviewing', profile.id);
      return;
    }

    await runApply(gate);
  }, [profile, connectionState, applyStore]);

  const runApply = useCallback(async (gate: ApplyGateResult & { ok: true }) => {
    applyStore.getState().setStatus('reviewing', profile.id);

    const pStore = useParameterStore;
    pStore.setState({
      fileParamDiffs: gate.fileDiffs,
      fileSkippedParams: [],
      fileSkippedCount: 0,
      fileTotalCount: gate.fileDiffs.length,
      fileVehicleType: null,
      showCompareModal: true,
      applyProgress: null,
      fileApplyResult: null,
    });

    // Compare modal is rendered globally by <ParameterCompareModalRoot> so it
    // appears over whatever view the user is on — no navigation needed.

    let cleanAppliedCount: number | null = null;
    let sawApplying = false;
    await new Promise<void>((resolve) => {
      const unsub = pStore.subscribe((state, prev) => {
        if (prev.isApplyingFileParams && !state.isApplyingFileParams) {
          sawApplying = true;
          if (state.applyProgress) cleanAppliedCount = state.applyProgress.applied;
        }
        if (state.isApplyingFileParams && !prev.isApplyingFileParams) {
          applyStore.getState().setStatus('writing', profile.id);
        }
        const closed = prev.showCompareModal && !state.showCompareModal;
        if (closed) {
          const st = pStore.getState();
          if (!st.showCompareModal && !st.isApplyingFileParams) {
            unsub();
            resolve();
          }
        }
      });
      // Safety fallback — user may close instantly before subscribe settles.
      setTimeout(() => {
        const st = pStore.getState();
        if (!st.showCompareModal && !st.isApplyingFileParams) {
          unsub(); resolve();
        }
      }, 150);
    });

    const final = useParameterStore.getState().fileApplyResult;
    let appliedCount = 0;
    let failedCount = 0;
    let rebootRequired: string[] = [];
    if (final) {
      appliedCount = final.applied;
      failedCount = final.failed;
      rebootRequired = final.rebootRequired;
    } else if (cleanAppliedCount !== null) {
      appliedCount = cleanAppliedCount;
    } else if (sawApplying) {
      const cache = useParameterStore.getState().parameters;
      appliedCount = gate.fileDiffs.filter(d => {
        const cur = cache.get(d.paramId);
        return cur && Math.abs(cur.value - d.fileValue) < 1e-4;
      }).length;
    }

    if (appliedCount === 0) {
      applyStore.getState().clear();
      applyStore.getState().setToast({
        kind: 'info',
        message: t('settings:useProfileApply.cancelledNoChange'),
        createdAt: Date.now(),
      });
      return;
    }

    // Save to flash so values persist across reboot AND clear the "modified"
    // marker in the param list. Profile apply is always a deliberate write,
    // so users expect it to stick. We tolerate flash-write failures: values
    // are still in RAM on the FC, so we clear isModified either way.
    const appliedIds = gate.fileDiffs.map(d => d.paramId);
    let flashed = false;
    try {
      const electronAPI = (window as unknown as { electronAPI?: { writeParamsToFlash?: () => Promise<{ success: boolean }> } }).electronAPI;
      const flashResult = await electronAPI?.writeParamsToFlash?.();
      flashed = !!flashResult?.success;
    } catch {
      // SITL/unsupported firmware: fall through, we still clear isModified.
    }
    // Clear isModified for the params we just applied so the list doesn't
    // misleadingly suggest "more pending writes". Uses originalValue=value
    // which is the "saved" convention used elsewhere in parameter-store.
    useParameterStore.setState(state => {
      const params = new Map(state.parameters);
      for (const id of appliedIds) {
        const p = params.get(id);
        if (p) params.set(id, { ...p, originalValue: p.value, isModified: false });
      }
      return { parameters: params };
    });

    finalizeApply({ snapshot: gate.pendingSnapshot, updateVehicle });
    if (gate.target.isSitl) {
      const instanceKey = connectionState.transport ?? 'sitl';
      recordSitlApply({
        instanceKey,
        profileId: profile.id,
        snapshotId: gate.pendingSnapshot.id,
      });
    }

    const failMsg = failedCount > 0 ? t('settings:useProfileApply.failedSuffix', { count: failedCount }) : '';
    const flashNote =
      flashed ? t('settings:useProfileApply.savedToFlash')
      : gate.target.isSitl ? t('settings:useProfileApply.sitlNoFlash')
      : t('settings:useProfileApply.notSaved');
    applyStore.getState().setStatus('done', profile.id);
    applyStore.getState().setToast({
      kind: 'success',
      message: t('settings:useProfileApply.applied', { count: appliedCount, target: gate.target.isSitl ? 'SITL' : t('settings:useProfileApply.targetVehicle'), flashNote, failMsg }),
      snapshotId: gate.pendingSnapshot.id,
      profileId: profile.id,
      rebootRequired: rebootRequired.length,
      createdAt: Date.now(),
    });
    // Settle back to idle after the done toast posts.
    setTimeout(() => applyStore.getState().clear(), 100);
  }, [updateVehicle, connectionState, profile.id, applyStore]);

  const confirmRealFc = useCallback(async (opts: { backupFirst: boolean }) => {
    const preflight = applyStore.getState().preflight;
    if (!preflight) return;
    if (opts.backupFirst) {
      const template = getTemplate(preflight.profile.templateSlug) ?? defaultTemplateForType(preflight.profile.type);
      try {
        await saveParmToFile(preflight.profile, template, { includeSim: false });
      } catch (err) {
        console.error('[profile-apply] Backup failed:', err);
        applyStore.getState().clear();
        applyStore.getState().setToast({
          kind: 'error',
          message: t('settings:useProfileApply.backupFailed'),
          createdAt: Date.now(),
        });
        return;
      }
    }
    applyStore.getState().setPreflight(null);
    await runApply({
      ok: true,
      template: null as never,  // not needed beyond this point
      target: preflight.target,
      diff: null as never,
      fileDiffs: preflight.fileDiffs,
      pendingSnapshot: preflight.pendingSnapshot,
    });
  }, [applyStore, runApply]);

  const cancelRealFc = useCallback(() => {
    applyStore.getState().clear();
    applyStore.getState().setToast({
      kind: 'info',
      message: t('settings:useProfileApply.cancelled'),
      createdAt: Date.now(),
    });
  }, [applyStore]);

  return { start, confirmRealFc, cancelRealFc };
}
