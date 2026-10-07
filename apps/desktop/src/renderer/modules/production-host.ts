// host.production over IPC: the host owns judging, records and the consent dialog, so a module cannot forge a pass.
import { t } from '../../shared/i18n/index.js';
import type { BayState } from '../../shared/production-bay-types';
import type { ProductionModel, QaConfigDelta } from '../../shared/production-types';
import { useConnectionStore } from '../stores/connection-store';
import { useParameterStore } from '../stores/parameter-store';
import { useFleetRepoStore, isWeakBoardUid } from '../stores/fleet-repo-store';

// ── Bays ────────────────────────────────────────────────────────

let bays: BayState[] = [];
const bayListeners = new Set<(b: BayState[]) => void>();
let bayFeed: (() => void) | null = null;

function ensureBayFeed(): void {
  if (bayFeed) return;
  bayFeed = window.electronAPI.onProductionBays((next) => {
    bays = next;
    for (const l of bayListeners) l(bays);
  });
}

export function getBays(): BayState[] {
  return bays;
}

export function subscribeBays(listener: (b: BayState[]) => void): () => void {
  ensureBayFeed();
  bayListeners.add(listener);
  return () => bayListeners.delete(listener);
}

export async function startBays(): Promise<BayState[]> {
  ensureBayFeed();
  bays = await window.electronAPI.productionBaysStart();
  for (const l of bayListeners) l(bays);
  return bays;
}

// ── Consent for golden writes (host-owned dialog) ───────────────

export interface PendingGoldenWrite {
  modelName: string;
  /** Differences on the board right now. */
  deltas: QaConfigDelta[];
  /** Prepare wipes the board first, so far more than `deltas` gets written. */
  resetsFirst: boolean;
  /** Arming: the answer covers every bay until the app restarts. */
  arming: boolean;
  resolve: (answer: { accepted: boolean; rememberForSession: boolean }) => void;
}

let pendingWrite: PendingGoldenWrite | null = null;
const writeListeners = new Set<() => void>();

export function getPendingGoldenWrite(): PendingGoldenWrite | null {
  return pendingWrite;
}

export function subscribePendingGoldenWrite(cb: () => void): () => void {
  writeListeners.add(cb);
  return () => writeListeners.delete(cb);
}

function askConsent(req: Omit<PendingGoldenWrite, 'resolve'>): Promise<{ accepted: boolean; rememberForSession: boolean }> {
  if (pendingWrite) return Promise.resolve({ accepted: false, rememberForSession: false });
  return new Promise((resolve) => {
    pendingWrite = {
      ...req,
      resolve: (answer) => {
        pendingWrite = null;
        writeListeners.forEach((l) => l());
        resolve(answer);
      },
    };
    writeListeners.forEach((l) => l());
  });
}

async function modelById(modelId: string): Promise<ProductionModel> {
  const model = (await window.electronAPI.productionListModels()).find((m) => m.id === modelId);
  if (!model) throw new Error(t('modules:production.modelNotFound', { model: modelId }));
  return model;
}

/** Ask the operator; on yes (and remember / arming) clear the model's golden for this app session. */
async function obtainConsent(bayId: string, modelId: string, arming: boolean): Promise<boolean> {
  const preview = await window.electronAPI.productionBayPreview(bayId, modelId);
  if (preview.consented) return true;
  const model = await modelById(modelId);
  const answer = await askConsent({
    modelName: preview.modelName,
    deltas: preview.deltas,
    resetsFirst: model.rules.resetParams,
    arming,
  });
  if (!answer.accepted) return false;
  if (arming || answer.rememberForSession) {
    await window.electronAPI.productionGrantConsent(modelId, preview.goldenOid, preview.updatedAt);
  }
  return true;
}

export function armModel(modelId: string, bayId: string): Promise<boolean> {
  return obtainConsent(bayId, modelId, true);
}

export async function prepare(bayId: string, modelId: string) {
  if (!(await obtainConsent(bayId, modelId, false))) {
    return { ok: false, flashed: false, reset: false, written: 0, missing: [], failed: [], error: t('modules:production.declined') };
  }
  return window.electronAPI.productionBayPrepare(bayId, modelId, true);
}

export async function previewGolden(bayId: string, modelId: string) {
  const p = await window.electronAPI.productionBayPreview(bayId, modelId);
  return { deltas: p.deltas, armed: p.consented };
}

/** Golden from the vehicle on the app's main connection. */
export async function captureFromConnected(name: string): Promise<ProductionModel> {
  const c = useConnectionStore.getState().connectionState;
  const p = useParameterStore.getState();
  if (!c.isConnected) throw new Error(t('modules:production.notConnected'));
  if (p.isLoading || p.parameters.size === 0) throw new Error(t('modules:production.paramsNotLoaded'));
  if (!name.trim()) throw new Error(t('modules:production.nameRequired'));
  const model = await window.electronAPI.productionSaveModel(
    {
      name,
      vehicleType: c.vehicleType,
      firmware: c.firmware,
      firmwareVersion: c.firmwareVersion,
      boardId: c.boardId,
      sourceUnit: c.boardUid && !isWeakBoardUid(c.boardUid) ? c.boardUid : undefined,
    },
    [...p.parameters.values()].map((x) => ({ id: x.id, value: x.value })),
  );
  void useFleetRepoStore.getState().refresh();
  return model;
}

export function onRecordsChanged(listener: () => void): () => void {
  return window.electronAPI.onProductionVaultChanged(() => {
    void useFleetRepoStore.getState().refresh();
    listener();
  });
}
