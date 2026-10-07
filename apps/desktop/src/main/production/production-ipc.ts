import { ipcMain, dialog, type BrowserWindow } from 'electron';
import Store from 'electron-store';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { ProductionCalibrationType, ProductionRules } from '../../shared/production-types.js';
import { BayManager } from './bay-manager.js';
import * as records from '../fleet-repo/production-records.js';
import { t } from '../../shared/i18n/index.js';

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function wrap<T>(work: () => Promise<T> | T): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await work() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export interface ProductionIpcDeps {
  send: (channel: string, data: unknown) => void;
  portsInUse: () => string[];
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
}

let manager: BayManager | null = null;

export function registerProductionIpc(mainWindow: BrowserWindow, deps: ProductionIpcDeps): void {
  const stationStore = new Store<{ station?: string }>({ name: 'production-station' });
  const stationName = () => stationStore.get('station') || records.defaultStationName();

  manager = new BayManager({
    emit: (states) => deps.send(IPC_CHANNELS.PRODUCTION_BAYS_STATE, states),
    portsInUse: deps.portsInUse,
    log: deps.log,
    onVaultChanged: () => deps.send(IPC_CHANNELS.PRODUCTION_VAULT_CHANGED, null),
  });
  const m = manager;

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_LIST_MODELS, () => wrap(() => records.listModels()));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_UPDATE_RULES, (_, id: string, rules: ProductionRules) => wrap(() => records.updateModelRules(id, rules)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_LIST_RUNS, (_, limit?: number) => wrap(() => records.listRuns(limit)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_GET_STATION, () => wrap(stationName));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_SET_STATION, (_, name: string) => wrap(() => {
    const clean = name.trim();
    if (clean) stationStore.set('station', clean);
    else stationStore.delete('station');
    return stationName();
  }));

  // Golden from the vehicle on the main connection (the board an engineer set up in the full app).
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_SAVE_MODEL, (_, input: records.SaveModelInput, params: Array<{ id: string; value: number }>) =>
    wrap(async () => (await records.saveModel(input, params)).model));

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_CAPTURE_FILE, (_, name: string) => wrap(async () => {
    if (!name.trim()) throw new Error(t('main:productionBay.nameRequired'));
    const pick = await dialog.showOpenDialog(mainWindow, {
      title: t('main:productionBay.pickParamFile'),
      filters: [{ name: t('main:productionBay.paramFiles'), extensions: ['param', 'parm', 'params', 'txt'] }],
      properties: ['openFile'],
    });
    if (pick.canceled || !pick.filePaths[0]) return null;
    const { readFile } = await import('fs/promises');
    const model = await records.saveModelFromParamText(name, await readFile(pick.filePaths[0], 'utf-8'));
    deps.send(IPC_CHANNELS.PRODUCTION_VAULT_CHANGED, null);
    return model;
  }));

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_CAPTURE_VAULT, (_, name: string, unitUid: string) => wrap(async () => {
    if (!name.trim()) throw new Error(t('main:productionBay.nameRequired'));
    const model = await records.saveModelFromVaultUnit(name, unitUid);
    deps.send(IPC_CHANNELS.PRODUCTION_VAULT_CHANGED, null);
    return model;
  }));

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_ATTACH_FIRMWARE, (_, modelId: string) => wrap(async () => {
    const pick = await dialog.showOpenDialog(mainWindow, {
      title: t('main:productionBay.pickFirmware'),
      filters: [{ name: t('main:fileFilters.firmwareFiles'), extensions: ['apj', 'px4'] }],
      properties: ['openFile'],
    });
    if (pick.canceled || !pick.filePaths[0]) return null;
    return records.attachFirmware(modelId, pick.filePaths[0]);
  }));

  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAYS_START, () => wrap(() => { m.start(); return m.list(); }));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAYS_STOP, () => wrap(() => m.stop()));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAYS_LIST, () => wrap(() => ({ running: m.running, bays: m.list() })));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_ADD_TCP, (_, endpoint: string) => wrap(() => m.addTcp(endpoint)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_REMOVE, (_, bayId: string, ignore: boolean) => wrap(() => m.removeBay(bayId, ignore)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_UNIGNORE_PORTS, () => wrap(() => m.unignoreAll()));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_SET_MODEL, (_, bayId: string, modelId: string | null) => wrap(() => m.setModel(bayId, modelId)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_SET_MODEL_ALL, (_, modelId: string) => wrap(() => m.setModelForAll(modelId)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_PREVIEW, (_, bayId: string, modelId: string) => wrap(() => m.previewGolden(bayId, modelId)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_GRANT_CONSENT, (_, modelId: string, goldenOid: string | undefined, updatedAt: number) =>
    wrap(() => m.grantWriteConsent(modelId, goldenOid, updatedAt)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_PREPARE, (_, bayId: string, modelId: string, consentGiven: boolean) => wrap(() => m.prepare(bayId, modelId, consentGiven)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_FLASH, (_, bayId: string, modelId: string) => wrap(() => m.flash(bayId, modelId)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_RESET, (_, bayId: string) => wrap(() => m.resetToDefaults(bayId)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_REBOOT, (_, bayId: string) => wrap(() => m.reboot(bayId)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_CAL_START, (_, bayId: string, type: ProductionCalibrationType) => wrap(() => m.startCalibration(bayId, type)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_CAL_CONFIRM, (_, bayId: string, position: number) => wrap(() => m.confirmPosition(bayId, position)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_CAL_CANCEL, (_, bayId: string) => wrap(() => m.cancelCalibration(bayId)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_QA, (_, bayId: string, modelId: string, serial: string) => wrap(() => m.runQa(bayId, modelId, serial)));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_SUBMIT, (_, bayId: string, modelId: string, serial: string, operator: string, notes?: string) =>
    wrap(() => m.submit(bayId, modelId, serial, operator, notes, stationName())));
  ipcMain.handle(IPC_CHANNELS.PRODUCTION_BAY_CAPTURE, (_, bayId: string, name: string) => wrap(() => m.captureGolden(bayId, name)));
}

export async function releaseProductionPort(port: string): Promise<void> {
  await manager?.releasePort(port);
}

/** Close every bay's port on app quit. */
export async function shutdownProduction(): Promise<void> {
  await manager?.stop();
}
