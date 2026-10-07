import Store from 'electron-store';
import { listSerialPorts, SerialTransport, TcpTransport, type SerialPortInfo, type Transport } from '@ardudeck/comms';
import { BaySession } from './bay-session.js';
import { saveCalibrationRecord, listCalibrationRecords, verifyCalibrationRecords } from '../calibration/calibration-records.js';
import { flashWithArduPilotBootloader, type FlashSink } from '../firmware/ardupilot-flasher.js';
import { isFlashInProgress } from '../firmware/flash-guard.js';
import { KNOWN_BOARDS } from '../../shared/firmware-types.js';
import { configDeltas, evaluateQa, unhealthyBenchSensors } from '../../shared/production-qa.js';
import type { BayState } from '../../shared/production-bay-types.js';
import type { ProductionModel, ProductionCalibrationType, QaConfigDelta, QaReport, ProductionRun } from '../../shared/production-types.js';
import * as records from '../fleet-repo/production-records.js';
import { t } from '../../shared/i18n/index.js';

export interface BayManagerDeps {
  /** Push a bay snapshot to every renderer window. */
  emit: (states: BayState[]) => void;
  /** Ports the rest of the app holds open (main connection, fleet links). */
  portsInUse: () => string[];
  /** host:port network endpoints the rest of the app is connected to. */
  endpointsInUse: () => string[];
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
  /** Called when the vault changed, so open vault views refresh. */
  onVaultChanged: () => void;
}

export interface PrepareResult {
  ok: boolean;
  flashed: boolean;
  reset: boolean;
  written: number;
  /** Golden params the board still lacks after every reboot round. */
  missing: string[];
  failed: string[];
  error?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const stationStore = new Store<{ ignoredPorts: string[]; tcpBays: string[] }>({
  name: 'production-bays',
  defaults: { ignoredPorts: [], tcpBays: [] },
});

/** USB autopilots: ArduPilot's pid.codes VID, ChibiOS on ST's VID, and every board table entry flashed by the ArduPilot bootloader. */
export function isAutopilotPort(info: SerialPortInfo): boolean {
  const vid = info.vendorId?.toLowerCase();
  const pid = info.productId?.toLowerCase();
  if (!vid || !pid) return false;
  if (vid === '1209') return true;
  if (vid === '0483' && pid === '5740') return true;
  return KNOWN_BOARDS[`${vid}:${pid}`]?.flasher === 'ardupilot';
}

function samePort(a: string, b: string): boolean {
  const norm = (p: string) => p.replace('/dev/cu.', '/dev/tty.');
  return norm(a) === norm(b);
}

export class BayManager {
  private deps: BayManagerDeps;
  private sessions = new Map<string, BaySession>();
  private portInfo = new Map<string, SerialPortInfo>();
  private modelByBay = new Map<string, string>();
  private qaByBay = new Map<string, QaReport>();
  private qaKeys = new Map<string, string>();
  private busy = new Set<string>();
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  /** Flashing and rebooting re-enumerate USB: one at a time across bays. */
  private usbChain: Promise<unknown> = Promise.resolve();
  /** Golden writes the operator cleared for this app session, keyed by model and golden revision. */
  private writeConsent = new Set<string>();

  constructor(deps: BayManagerDeps) {
    this.deps = deps;
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  get running(): boolean {
    return this.scanTimer !== null;
  }

  start(): void {
    if (this.scanTimer) return;
    void this.scan();
    this.scanTimer = setInterval(() => void this.scan(), 2000);
    for (const endpoint of stationStore.get('tcpBays')) void this.addTcp(endpoint, false);
  }

  async stop(): Promise<void> {
    if (this.scanTimer) clearInterval(this.scanTimer);
    this.scanTimer = null;
    const all = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(all.map((s) => s.close()));
    this.emitNow();
  }

  list(): BayState[] {
    return [...this.sessions.values()].map((s) => this.decorate(s.getState()));
  }

  private decorate(state: BayState): BayState {
    return { ...state, modelId: this.modelByBay.get(state.id), qa: this.qaByBay.get(state.id) };
  }

  private scheduleEmit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.emitNow();
    }, 100);
  }

  private emitNow(): void {
    this.deps.emit(this.list());
  }

  private makeSession(id: string, port: string, open: () => Promise<Transport>): BaySession {
    const session = new BaySession(id, port, {
      openTransport: open,
      onState: (st) => {
        // A verdict stays valid until something it judged changes; sensor ticks alone do not void it.
        const key = [st.phase, st.boardUid, st.paramCount, st.firmwareVersion,
          st.records.map((r) => `${r.type}:${r.completedAt}:${r.persistence?.state ?? ''}`).join(',')].join('|');
        if (this.qaKeys.get(id) !== key) {
          this.qaKeys.set(id, key);
          this.qaByBay.delete(id);
        }
        this.scheduleEmit();
      },
      log: this.deps.log,
      records: {
        save: saveCalibrationRecord,
        list: listCalibrationRecords,
        verify: (uid, read) => verifyCalibrationRecords(uid, read),
      },
      text: (key, vars) => t(`main:productionBay.${key}`, vars ?? {}),
      usbGate: (work) => this.onUsb(id, work),
    });
    this.sessions.set(id, session);
    return session;
  }

  private async scan(): Promise<void> {
    let ports: SerialPortInfo[];
    try {
      ports = await listSerialPorts();
    } catch {
      return;
    }
    const ignored = stationStore.get('ignoredPorts');
    const inUse = this.deps.portsInUse();
    for (const info of ports) {
      if (!isAutopilotPort(info)) continue;
      if (ignored.some((p) => samePort(p, info.path)) || inUse.some((p) => samePort(p, info.path))) continue;
      const existing = [...this.sessions.values()].find((s) => samePort(s.port, info.path));
      if (existing) {
        this.portInfo.set(info.path, info);
        // A board that hung or browned out without leaving the bus: try it again every few seconds.
        const st = existing.getState();
        if ((st.phase === 'lost' || (st.phase === 'error' && st.firmware)) && !this.busy.has(existing.id)
          && !this.busy.has(`op:${existing.id}`) && Date.now() - st.updatedAt > 5000) {
          void existing.start().then(() => this.onBoardReady(existing));
        }
        continue;
      }
      // A bay mid-flash or mid-reboot reopens its own port; never claim it as a new board.
      if (this.usbBusyPort(info.path)) continue;
      this.portInfo.set(info.path, info);
      const session = this.makeSession(`usb:${info.path}`, info.path, async () => {
        return new SerialTransport(await this.currentPath(info), { baudRate: 115200 });
      });
      this.deps.log('info', `Production bay opened on ${info.path}`);
      void session.start().then(() => this.onBoardReady(session));
    }
    // Drop bays whose board was unplugged, unless the bay itself is rebooting or flashing it.
    for (const [id, session] of this.sessions) {
      if (!id.startsWith('usb:') || this.busy.has(id)) continue;
      const phase = session.getState().phase;
      if (phase === 'flashing' || phase === 'rebooting' || phase === 'resetting') continue;
      if (!ports.some((p) => samePort(p.path, session.port))) {
        this.sessions.delete(id);
        this.qaByBay.delete(id);
        void session.close();
        this.scheduleEmit();
      }
    }
  }

  /** Same physical board after a reboot, even if the OS gave it a different port name. */
  private async currentPath(info: SerialPortInfo): Promise<string> {
    const ports = await listSerialPorts().catch(() => [] as SerialPortInfo[]);
    if (ports.some((p) => samePort(p.path, info.path))) return info.path;
    const moved = ports.find((p) =>
      (info.locationId && p.locationId === info.locationId) || (info.serialNumber && p.serialNumber === info.serialNumber));
    return moved?.path ?? info.path;
  }

  private usbBusyPort(path: string): boolean {
    return [...this.sessions.values()].some((s) => samePort(s.port, path) && this.busy.has(s.id));
  }

  async addTcp(endpoint: string, persist = true): Promise<string> {
    const m = endpoint.trim().match(/^(?:tcp:)?([^:]+):(\d+)$/);
    if (!m) throw new Error(t('main:productionBay.badEndpoint'));
    const host = m[1]!;
    const port = Number(m[2]);
    const id = `tcp:${host}:${port}`;
    // ArduPilot SITL takes one client per port: a bay on the main connection's port would never hear the board.
    const local = (h: string) => (h === 'localhost' || h === '::1' ? '127.0.0.1' : h);
    if (this.deps.endpointsInUse().some((e) => {
      const [eh, ep] = [e.slice(0, e.lastIndexOf(':')), Number(e.slice(e.lastIndexOf(':') + 1))];
      return local(eh) === local(host) && ep === port;
    })) {
      throw new Error(t('main:productionBay.endpointInUse', { endpoint: `${host}:${port}`, alt: `${host}:${port + 2}` }));
    }
    if (this.sessions.has(id)) return id;
    if (persist) stationStore.set('tcpBays', [...new Set([...stationStore.get('tcpBays'), `${host}:${port}`])]);
    const session = this.makeSession(id, id, async () => {
      return new TcpTransport({ host, port });
    });
    void session.start().then(() => this.onBoardReady(session));
    this.scheduleEmit();
    return id;
  }

  async removeBay(id: string, ignore: boolean): Promise<void> {
    const session = this.sessions.get(id);
    if (!session) return;
    this.sessions.delete(id);
    this.qaByBay.delete(id);
    this.modelByBay.delete(id);
    await session.close();
    if (id.startsWith('tcp:')) {
      const endpoint = id.slice(4);
      stationStore.set('tcpBays', stationStore.get('tcpBays').filter((e) => e !== endpoint));
    } else if (ignore) {
      stationStore.set('ignoredPorts', [...new Set([...stationStore.get('ignoredPorts'), session.port])]);
    }
    this.emitNow();
  }

  /** The main connection wants this port. Scans skip ports it holds, so the bay returns once it lets go. */
  async releasePort(path: string): Promise<void> {
    const session = [...this.sessions.values()].find((s) => samePort(s.port, path));
    if (session) await this.removeBay(session.id, false);
  }

  unignoreAll(): void {
    stationStore.set('ignoredPorts', []);
  }

  private session(id: string): BaySession {
    const s = this.sessions.get(id);
    if (!s) throw new Error(t('main:productionBay.unknownBay'));
    return s;
  }

  /** Serialise USB re-enumeration (flash, reboot) across bays and behind any flash the Firmware screen runs. */
  private onUsb<T>(bayId: string, work: () => Promise<T>): Promise<T> {
    const run = async () => {
      while (isFlashInProgress()) await sleep(500);
      this.busy.add(bayId);
      try {
        return await work();
      } finally {
        this.busy.delete(bayId);
      }
    };
    const next = this.usbChain.then(run, run);
    this.usbChain = next.catch(() => undefined);
    return next;
  }

  private async guard<T>(bayId: string, work: () => Promise<T>): Promise<T> {
    if (this.busy.has(`op:${bayId}`)) throw new Error(t('main:productionBay.bayBusy'));
    this.busy.add(`op:${bayId}`);
    try {
      return await work();
    } finally {
      this.busy.delete(`op:${bayId}`);
    }
  }

  // ── Per-bay operations ────────────────────────────────────────

  setModel(bayId: string, modelId: string | null): void {
    this.session(bayId);
    if (modelId) this.modelByBay.set(bayId, modelId);
    else this.modelByBay.delete(bayId);
    this.qaByBay.delete(bayId);
    this.emitNow();
  }

  /** Assign every bay without a model, so a station building one product needs one click. */
  setModelForAll(modelId: string): void {
    for (const id of this.sessions.keys()) this.modelByBay.set(id, modelId);
    this.qaByBay.clear();
    this.emitNow();
  }

  reboot(bayId: string): Promise<boolean> {
    const s = this.session(bayId);
    return this.guard(bayId, () => s.reboot());
  }

  resetToDefaults(bayId: string): Promise<boolean> {
    const s = this.session(bayId);
    return this.guard(bayId, () => s.resetToDefaults());
  }

  startCalibration(bayId: string, type: ProductionCalibrationType) {
    return this.session(bayId).startCalibration(type);
  }

  confirmPosition(bayId: string, position: number) {
    return this.session(bayId).confirmPosition(position);
  }

  cancelCalibration(bayId: string): void {
    this.session(bayId).cancelCalibration();
  }

  private async loadModel(modelId: string) {
    const data = await records.readModel(modelId);
    if (!data) throw new Error(t('main:productionBay.modelNotFound', { model: modelId }));
    return data;
  }

  hasWriteConsent(model: ProductionModel, goldenOid?: string): boolean {
    return this.writeConsent.has(`${model.id}@${goldenOid ?? model.updatedAt}`);
  }

  grantWriteConsent(modelId: string, goldenOid: string | undefined, updatedAt: number): void {
    this.writeConsent.add(`${modelId}@${goldenOid ?? updatedAt}`);
  }

  async previewGolden(bayId: string, modelId: string): Promise<{ deltas: QaConfigDelta[]; goldenOid?: string; consented: boolean; modelName: string; updatedAt: number }> {
    const s = this.session(bayId);
    const { model, golden, goldenOid } = await this.loadModel(modelId);
    return {
      deltas: configDeltas(golden, s.getParams(), model.rules.ignoreParams),
      goldenOid,
      consented: this.hasWriteConsent(model, goldenOid),
      modelName: model.name,
      updatedAt: model.updatedAt,
    };
  }

  async flash(bayId: string, modelId: string): Promise<{ success: boolean; error?: string }> {
    const s = this.session(bayId);
    const { model } = await this.loadModel(modelId);
    const path = records.modelFirmwarePath(model);
    if (!path) return { success: false, error: t('main:productionBay.noFirmware') };
    return this.guard(bayId, () => this.flashLocked(s, path));
  }

  private flashLocked(s: BaySession, firmwarePath: string): Promise<{ success: boolean; error?: string }> {
    return s.flash(async (port) => {
      const own = this.portInfo.get(port);
      const sink: FlashSink = {
        progress: (p) => s.setFlashProgress(Math.round(p.progress), p.message),
        log: (level, message) => this.deps.log(level, `[bay ${port}] ${message}`),
        isOwnPort: (info) => {
          if (!own) return true;
          if (own.locationId && info.locationId) return own.locationId === info.locationId;
          if (own.serialNumber && info.serialNumber) return own.serialNumber === info.serialNumber;
          return true;
        },
      };
      const noHeartbeat = s.getState().firmware === undefined;
      const result = await flashWithArduPilotBootloader(
        firmwarePath,
        {
          name: s.getState().boardId ?? 'ArduPilot',
          boardId: s.getState().boardId ?? 'ChibiOS',
          mcuType: 'STM32',
          flasher: 'ardupilot',
          port,
          inBootloader: noHeartbeat,
          detectionMethod: 'mavlink',
        },
        sink,
        undefined,
        noHeartbeat ? { noRebootSequence: true } : undefined,
      );
      return { success: result.success, error: result.error };
    });
  }

  /** Flash if needed, wipe to defaults, then write the golden until the board matches it. */
  async prepare(bayId: string, modelId: string, consentGiven: boolean): Promise<PrepareResult> {
    const s = this.session(bayId);
    return this.guard(bayId, async () => {
      const { model, golden, goldenOid } = await this.loadModel(modelId);
      if (!consentGiven && !this.hasWriteConsent(model, goldenOid)) {
        return { ok: false, flashed: false, reset: false, written: 0, missing: [], failed: [], error: t('main:productionBay.needsConsent') };
      }
      const result: PrepareResult = { ok: false, flashed: false, reset: false, written: 0, missing: [], failed: [] };

      const fwPath = records.modelFirmwarePath(model);
      const st = s.getState();
      const wrongFirmware = !st.firmware
        || (model.firmwareVersion && st.firmwareVersion !== model.firmwareVersion)
        || (model.firmwareBoardId !== undefined && st.boardVersion !== undefined && (st.boardVersion >>> 16) !== model.firmwareBoardId);
      if (fwPath && wrongFirmware) {
        const fl = await this.flashLocked(s, fwPath);
        if (!fl.success) return { ...result, error: fl.error };
        result.flashed = true;
      } else if (!st.firmware) {
        return { ...result, error: t('main:productionBay.noFirmwareOnBoard') };
      }

      if (model.rules.resetParams) {
        const ok = await s.resetToDefaults();
        if (!ok) return { ...result, error: t('main:productionBay.resetFailed') };
        result.reset = true;
      }

      // Each write round ends in a reboot: some params only act after one, and enabling a
      // feature (BATT_MONITOR) only creates its params (BATT_*) after one.
      let lastMissing = Number.POSITIVE_INFINITY;
      for (let round = 0; round < 4; round++) {
        const deltas = configDeltas(golden, s.getParams(), model.rules.ignoreParams);
        const writable = deltas.filter((d) => d.actual !== null);
        const missing = deltas.filter((d) => d.actual === null);
        if (writable.length === 0 && (missing.length === 0 || missing.length >= lastMissing)) break;
        if (writable.length > 0) {
          const w = await s.writeParams(writable.map((d) => ({ id: d.id, value: d.expected })));
          result.written += w.written;
          result.failed = w.failed;
          if (w.failed.length > 0) break;
        }
        lastMissing = missing.length;
        if (!(await s.reboot())) return { ...result, error: t('main:productionBay.didNotReturn') };
      }
      const remaining = configDeltas(golden, s.getParams(), model.rules.ignoreParams);
      result.missing = remaining.filter((d) => d.actual === null).map((d) => d.id);
      result.ok = remaining.length === 0;
      if (!result.ok && !result.error) {
        result.error = t('main:productionBay.configStillDiffers', { count: remaining.length });
      }
      this.deps.log(result.ok ? 'info' : 'warn', `Bay ${s.port}: prepare ${result.ok ? 'done' : 'incomplete'} (flashed=${result.flashed}, reset=${result.reset}, written=${result.written}, missing=${result.missing.length})`);
      return result;
    });
  }

  private async onBoardReady(session: BaySession): Promise<void> {
    const modelId = this.modelByBay.get(session.id);
    if (!modelId || session.getState().phase !== 'ready') return;
    const data = await records.readModel(modelId).catch(() => null);
    if (!data?.model.rules.autoPrepare || !this.hasWriteConsent(data.model, data.goldenOid)) return;
    // A board that already passed QA (re-plugged for a look) is not wiped again.
    const uid = session.getState().boardUid;
    if (uid && (await records.readCertificate(uid))) return;
    await this.prepare(session.id, modelId, false).catch(() => undefined);
  }

  // ── Golden capture, QA, certificates ──────────────────────────

  async captureGolden(bayId: string, name: string): Promise<ProductionModel> {
    const s = this.session(bayId);
    const st = s.getState();
    if (st.phase !== 'ready' || st.paramCount === 0) throw new Error(t('main:productionBay.notReady'));
    const res = await records.saveModel(
      {
        name,
        vehicleType: st.vehicleType,
        firmware: st.firmware,
        firmwareVersion: st.firmwareVersion,
        boardId: st.boardId,
        sourceUnit: st.boardUid ?? undefined,
      },
      s.getParamList(),
    );
    this.deps.onVaultChanged();
    return res.model;
  }

  private async serialOwner(serial: string, boardUid: string): Promise<string | null> {
    const owner = await records.findUnitBySerial(serial);
    if (!owner || owner === boardUid) return null;
    const { listUnits } = await import('../fleet-repo/fleet-repo-manager.js');
    const unit = (await listUnits()).find((u) => u.uid === owner);
    return unit?.aliases?.includes(boardUid) ? null : owner;
  }

  async runQa(bayId: string, modelId: string, serial: string): Promise<QaReport> {
    const s = this.session(bayId);
    const st = s.getState();
    const { model, golden } = await this.loadModel(modelId);
    const records = st.boardUid ? listCalibrationRecords(st.boardUid) : [];
    const report = evaluateQa({
      model,
      golden,
      live: st.phase === 'ready' ? s.getParams() : new Map(),
      liveFirmware: st.firmware,
      liveFirmwareVersion: st.firmwareVersion,
      liveBoardId: st.boardId,
      liveVehicleType: st.vehicleType,
      calibrations: records,
      unhealthySensors: unhealthyBenchSensors(st.sensors),
      serial,
      serialTakenBy: serial.trim() && st.boardUid ? await this.serialOwner(serial.trim(), st.boardUid) : null,
    });
    if (!st.boardUid) {
      report.checks.push({ id: 'identity', status: 'fail', code: 'identityMissing' });
      report.passed = false;
    }
    this.qaByBay.set(bayId, report);
    this.scheduleEmit();
    return report;
  }

  /** Judge and record. A pass writes the birth certificate and the unit's full parameter snapshot. */
  async submit(bayId: string, modelId: string, serial: string, operator: string, notes: string | undefined, station: string): Promise<{ report: QaReport; run: ProductionRun }> {
    if (!operator.trim()) throw new Error(t('main:productionBay.operatorRequired'));
    const s = this.session(bayId);
    return this.guard(bayId, async () => {
      const report = await this.runQa(bayId, modelId, serial);
      const st = s.getState();
      const { model, goldenOid } = await this.loadModel(modelId);
      const cleanSerial = serial.trim();
      const cals = st.boardUid ? listCalibrationRecords(st.boardUid) : [];
      const unitUid = st.boardUid ?? `unidentified-${bayId.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const { run } = await records.recordRun(
        {
          run: {
            passed: report.passed,
            serial: cleanSerial,
            unitUid,
            modelId: model.id,
            operator: operator.trim(),
            failed: report.checks.filter((c) => c.status === 'fail').map((c) => c.id),
            ...(notes?.trim() ? { notes: notes.trim() } : {}),
          },
          ...(report.passed
            ? {
                certificate: {
                  serial: cleanSerial,
                  unitUid,
                  modelId: model.id,
                  modelName: model.name,
                  goldenOid,
                  firmware: st.firmware,
                  firmwareVersion: st.firmwareVersion,
                  boardId: st.boardId,
                  vehicleType: st.vehicleType,
                  operator: operator.trim(),
                  calibrations: cals.map((c) => ({ type: c.type, verdict: c.verdict, completedAt: c.completedAt, written: c.written })),
                  qa: report,
                  ...(notes?.trim() ? { notes: notes.trim() } : {}),
                },
                params: s.getParamList(),
              }
            : {}),
        },
        station,
      );
      this.deps.onVaultChanged();
      return { report, run };
    });
  }
}
