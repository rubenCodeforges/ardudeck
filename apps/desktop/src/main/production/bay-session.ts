// One independent MAVLink session per production bay (USB port): N boards on a station never share state.
import type { Transport } from '@ardudeck/comms';
import {
  MAVLinkParser,
  getAllMessageInfos,
  serializeV2,
  serializeHeartbeat, HEARTBEAT_ID, HEARTBEAT_CRC_EXTRA,
  serializeCommandLong, COMMAND_LONG_ID, COMMAND_LONG_CRC_EXTRA,
  serializeCommandAck, COMMAND_ACK_ID, COMMAND_ACK_CRC_EXTRA,
  serializeParamRequestList, PARAM_REQUEST_LIST_ID, PARAM_REQUEST_LIST_CRC_EXTRA,
  serializeParamRequestRead, PARAM_REQUEST_READ_ID, PARAM_REQUEST_READ_CRC_EXTRA,
  serializeParamSet, PARAM_SET_ID, PARAM_SET_CRC_EXTRA,
  deserializeHeartbeat,
  deserializeParamValue, PARAM_VALUE_ID,
  deserializeSysStatus, SYS_STATUS_ID,
  deserializeStatustext, STATUSTEXT_ID,
  deserializeCommandAck,
  deserializeCommandLong,
  deserializeMagCalProgress, MAG_CAL_PROGRESS_ID,
  deserializeMagCalReport, MAG_CAL_REPORT_ID,
  AUTOPILOT_VERSION_ID,
  type MAVLinkPacket,
} from '@ardudeck/mavlink-ts';
import { decodeAutopilotVersion } from '../../shared/autopilot-version.js';
import { getBoardInfoFromVersion } from '../../shared/board-ids.js';
import { mavTypeToVehicleType } from '../../shared/parameter-metadata.js';
import {
  MAVLINK_CALIBRATION_PARAMS,
  PX4_CALIBRATION_PARAMS,
  CALIBRATION_DIFF_EPSILON,
  PX4_CALIBRATION_DIFF_EPSILON,
  type CalibrationProgressEvent,
  type CalibrationCompleteEvent,
} from '../../shared/calibration-types.js';
import { buildCalibrationRecord, type CalibrationRecordIpc } from '../../shared/calibration-quality.js';
import { createMavlinkCalibration, type MavlinkCalibration } from '../calibration/mavlink-calibration.js';
import { decodePx4ParamValue, encodePx4ParamSetValue } from '../px4-param-bytewise.js';
import type { BayCalibrationState, BayPhase, BayState } from '../../shared/production-bay-types.js';
import type { ProductionCalibrationType } from '../../shared/production-types.js';

const GCS_SYSID = 255;
const GCS_COMPID = 190;
const MAV_CMD_PREFLIGHT_STORAGE = 245;
const MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN = 246;
const MAV_CMD_SET_MESSAGE_INTERVAL = 511;
const MAV_CMD_REQUEST_MESSAGE = 512;
const MAV_AUTOPILOT_ARDUPILOTMEGA = 3;
const MAV_AUTOPILOT_PX4 = 12;
const MAV_TYPE_GCS = 6;
const MAV_RESULT_ACCEPTED = 0;

export interface BaySessionDeps {
  /** A fresh, unopened transport for this bay (called again after every reboot); the session opens it. */
  openTransport: () => Promise<Transport>;
  onState: (state: BayState) => void;
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
  records: {
    save: (boardUid: string, record: CalibrationRecordIpc) => void;
    list: (boardUid: string) => CalibrationRecordIpc[];
    verify: (boardUid: string, read: (names: string[]) => Promise<Record<string, number>>) => Promise<CalibrationRecordIpc[]>;
  };
  /** Translated status text for the operator. */
  text: (key: string, vars?: Record<string, unknown>) => string;
  /** Serialises USB re-enumeration (reboot, flash) across bays. Held only until the board's heartbeat is back. */
  usbGate?: <T>(work: () => Promise<T>) => Promise<T>;
}

interface ParamEntry {
  value: number;
  type: number;
  index: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function padPayload(p: Uint8Array, len = 255): Uint8Array {
  if (p.length >= len) return p;
  const out = new Uint8Array(len);
  out.set(p);
  return out;
}

export function sameParamValue(a: number, b: number): boolean {
  if (Math.fround(a) === Math.fround(b)) return true;
  return Math.abs(a - b) <= Math.max(1e-6, 1e-5 * Math.max(Math.abs(a), Math.abs(b)));
}

export class BaySession {
  readonly id: string;
  readonly port: string;
  private deps: BaySessionDeps;
  private transport: Transport | null = null;
  private parser = new MAVLinkParser();
  private seq = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeatAt = 0;
  private firstHeartbeatAt = 0;
  private lastAccelCalAt = 0;
  private targetSystem = 1;
  private targetComponent = 1;
  private closed = false;
  /** The link is expected to drop (reboot, flash): do not report it as lost. */
  private expectingDrop = false;
  private params = new Map<string, ParamEntry>();
  private paramTotal = 0;
  private paramWaiters = new Map<string, Array<(v: number) => void>>();
  private ackWaiters = new Map<number, Array<(result: number) => void>>();
  private identityWaiter: (() => void) | null = null;
  private cal: MavlinkCalibration;
  private calSnapshot: Record<string, number> | null = null;
  private state: BayState;

  constructor(id: string, port: string, deps: BaySessionDeps) {
    this.id = id;
    this.port = port;
    this.deps = deps;
    this.parser.registerMessages(getAllMessageInfos());
    this.state = {
      id,
      port,
      phase: 'connecting',
      boardUid: null,
      sitl: port.startsWith('tcp:'),
      paramCount: 0,
      paramTotal: 0,
      sensors: null,
      calibration: null,
      records: [],
      updatedAt: Date.now(),
    };
    this.cal = createMavlinkCalibration();
    this.cal.initMavlinkCalibration({
      sendCommandLong: (command, p) => this.sendCommandLong(command, [p.param1, p.param2, p.param3, p.param4, p.param5, p.param6, p.param7]),
      sendCommandAck: (command, result) => this.send(COMMAND_ACK_ID, serializeCommandAck({
        command, result, progress: 0, resultParam2: 0, targetSystem: this.targetSystem, targetComponent: this.targetComponent,
      }), COMMAND_ACK_CRC_EXTRA),
      sendLog: (level, message) => this.deps.log(level, `[bay ${this.port}] ${message}`),
      sendProgress: (event) => this.onCalProgress(event),
      sendComplete: (event) => void this.onCalComplete(event),
    });
  }

  getState(): BayState {
    return this.state;
  }

  getParams(): Map<string, number> {
    const out = new Map<string, number>();
    for (const [id, p] of this.params) out.set(id, p.value);
    return out;
  }

  getParamList(): Array<{ id: string; value: number }> {
    return [...this.params].map(([id, p]) => ({ id, value: p.value }));
  }

  private update(patch: Partial<BayState>): void {
    this.state = { ...this.state, ...patch, updatedAt: Date.now() };
    this.deps.onState(this.state);
  }

  private setPhase(phase: BayPhase, extra: Partial<BayState> = {}): void {
    this.update({ phase, progress: undefined, phaseDetail: undefined, ...extra });
  }

  // ── Link ──────────────────────────────────────────────────────

  async start(): Promise<void> {
    this.closed = false;
    // A retry after an error must not open the port twice.
    await this.dropTransport();
    await this.connect();
  }

  private async connect(): Promise<void> {
    this.setPhase('connecting');
    try {
      await this.openLink();
    } catch (err) {
      this.setPhase('error', { error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (!(await this.waitHeartbeat(10_000))) {
      this.setPhase('error', { error: this.deps.text('bay.noHeartbeat') });
      return;
    }
    await this.identify();
  }

  private async openLink(): Promise<void> {
    const transport = await this.deps.openTransport();
    this.transport = transport;
    this.parser.reset();
    transport.on('data', (data: Uint8Array) => {
      this.parser.feed(data);
      let pkt: MAVLinkPacket | null;
      while ((pkt = this.parser.parseNext()) !== null) this.handle(pkt);
    });
    transport.on('close', () => {
      if (this.transport === transport) this.onLinkDown();
    });
    transport.on('error', (err: Error) => this.deps.log('warn', `[bay ${this.port}] ${err.message}`));
    if (!transport.isOpen) await transport.open();

    this.heartbeatTimer = setInterval(() => {
      void this.send(HEARTBEAT_ID, serializeHeartbeat({
        type: MAV_TYPE_GCS, autopilot: 8, baseMode: 0, customMode: 0, systemStatus: 4, mavlinkVersion: 3,
      }), HEARTBEAT_CRC_EXTRA);
    }, 1000);
    this.lastHeartbeatAt = 0;
    this.firstHeartbeatAt = 0;
    this.watchdogTimer = setInterval(() => {
      if (this.lastHeartbeatAt && Date.now() - this.lastHeartbeatAt > 5000 && !this.expectingDrop) {
        this.update({ error: this.deps.text('bay.noHeartbeat') });
      }
    }, 1000);
  }

  private async waitHeartbeat(timeoutMs: number): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (!this.lastHeartbeatAt && Date.now() < end) {
      if (this.closed || !this.transport) return false;
      await sleep(100);
    }
    return this.lastHeartbeatAt > 0;
  }

  private gate<T>(work: () => Promise<T>): Promise<T> {
    return this.deps.usbGate ? this.deps.usbGate(work) : work();
  }

  private stopTimers(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.heartbeatTimer = null;
    this.watchdogTimer = null;
  }

  private onLinkDown(): void {
    this.stopTimers();
    this.transport = null;
    if (this.closed || this.expectingDrop) return;
    this.cal.cancelMavlinkCalibration();
    this.setPhase('lost', { calibration: null });
  }

  async close(): Promise<void> {
    this.closed = true;
    this.cal.cleanupMavlinkCalibration();
    await this.dropTransport();
  }

  private async dropTransport(): Promise<void> {
    this.stopTimers();
    const t = this.transport;
    this.transport = null;
    if (t?.isOpen) await t.close().catch(() => undefined);
  }

  private async send(msgid: number, payload: Uint8Array, crcExtra: number): Promise<boolean> {
    const t = this.transport;
    if (!t?.isOpen) return false;
    const packet = serializeV2(msgid, payload, crcExtra, { sysid: GCS_SYSID, compid: GCS_COMPID, sequence: this.seq });
    this.seq = (this.seq + 1) & 0xff;
    try {
      await t.write(packet);
      return true;
    } catch {
      return false;
    }
  }

  private sendCommandLong(command: number, p: number[]): Promise<boolean> {
    return this.send(COMMAND_LONG_ID, serializeCommandLong({
      targetSystem: this.targetSystem,
      targetComponent: this.targetComponent,
      command,
      confirmation: 0,
      param1: p[0] ?? 0, param2: p[1] ?? 0, param3: p[2] ?? 0, param4: p[3] ?? 0,
      param5: p[4] ?? 0, param6: p[5] ?? 0, param7: p[6] ?? 0,
    }), COMMAND_LONG_CRC_EXTRA);
  }

  private waitAck(command: number, timeoutMs: number): Promise<number | null> {
    return new Promise((resolve) => {
      const list = this.ackWaiters.get(command) ?? [];
      const timer = setTimeout(() => {
        const l = this.ackWaiters.get(command);
        if (l) this.ackWaiters.set(command, l.filter((f) => f !== done));
        resolve(null);
      }, timeoutMs);
      const done = (result: number) => {
        clearTimeout(timer);
        resolve(result);
      };
      list.push(done);
      this.ackWaiters.set(command, list);
    });
  }

  async command(command: number, p: number[], timeoutMs = 3000): Promise<number | null> {
    const ack = this.waitAck(command, timeoutMs);
    if (!(await this.sendCommandLong(command, p))) return null;
    return ack;
  }

  // ── Incoming ──────────────────────────────────────────────────

  private handle(pkt: MAVLinkPacket): void {
    if (pkt.compid === GCS_COMPID && pkt.sysid === GCS_SYSID) return;
    const payload = padPayload(pkt.payload);
    switch (pkt.msgid) {
      case HEARTBEAT_ID: {
        const hb = deserializeHeartbeat(payload);
        if (hb.type === MAV_TYPE_GCS || hb.autopilot === 8) return;
        this.lastHeartbeatAt = Date.now();
        if (!this.firstHeartbeatAt) this.firstHeartbeatAt = this.lastHeartbeatAt;
        this.targetSystem = pkt.sysid;
        this.targetComponent = pkt.compid;
        const firmware = hb.autopilot === MAV_AUTOPILOT_PX4 ? 'px4' : hb.autopilot === MAV_AUTOPILOT_ARDUPILOTMEGA ? 'ardupilot' : undefined;
        const vehicleType = mavTypeToVehicleType(hb.type) ?? undefined;
        if (firmware !== this.state.firmware || vehicleType !== this.state.vehicleType || this.state.error) {
          this.update({ firmware, vehicleType, error: undefined });
        }
        break;
      }
      case AUTOPILOT_VERSION_ID: {
        const id = decodeAutopilotVersion(pkt.payload);
        const board = id.boardVersion ? getBoardInfoFromVersion(id.boardVersion) : null;
        const sitl = this.state.sitl;
        this.update({
          boardUid: sitl ? `sitl-${this.port.replace(/[^a-zA-Z0-9]/g, '_')}` : id.boardUid,
          boardId: board?.name ?? this.state.boardId,
          boardVersion: id.boardVersion,
          firmwareVersion: id.firmwareVersion ?? undefined,
        });
        this.identityWaiter?.();
        break;
      }
      case PARAM_VALUE_ID: {
        const pv = deserializeParamValue(payload);
        const value = this.state.firmware === 'px4' ? decodePx4ParamValue(payload, pv.paramType) : pv.paramValue;
        this.params.set(pv.paramId, { value, type: pv.paramType, index: pv.paramIndex });
        if (pv.paramCount && pv.paramCount !== 0xffff) this.paramTotal = pv.paramCount;
        const waiters = this.paramWaiters.get(pv.paramId);
        if (waiters) {
          this.paramWaiters.delete(pv.paramId);
          for (const w of waiters) w(value);
        }
        break;
      }
      case SYS_STATUS_ID: {
        const s = deserializeSysStatus(payload);
        this.update({
          sensors: {
            present: s.onboardControlSensorsPresent,
            enabled: s.onboardControlSensorsEnabled,
            health: s.onboardControlSensorsHealth,
          },
        });
        break;
      }
      case STATUSTEXT_ID: {
        const st = deserializeStatustext(payload);
        this.cal.handleCalibrationStatusText(st.text, st.severity);
        if (st.severity <= 3) this.update({ lastStatusText: st.text });
        break;
      }
      case COMMAND_ACK_ID: {
        const ack = deserializeCommandAck(payload);
        this.cal.handleCalibrationCommandAck(ack.command, ack.result);
        const waiters = this.ackWaiters.get(ack.command);
        if (waiters?.length) {
          this.ackWaiters.delete(ack.command);
          for (const w of waiters) w(ack.result);
        }
        break;
      }
      case COMMAND_LONG_ID: {
        const cmd = deserializeCommandLong(payload);
        this.cal.handleIncomingCommandLong(cmd.command, cmd.param1);
        break;
      }
      case MAG_CAL_PROGRESS_ID: {
        const p = deserializeMagCalProgress(payload);
        this.cal.handleMagCalProgress(p.compassId, p.calStatus, p.completionPct);
        break;
      }
      case MAG_CAL_REPORT_ID: {
        const r = deserializeMagCalReport(payload);
        this.cal.handleMagCalReport(r.compassId, r.calMask, r.calStatus, r.fitness);
        break;
      }
      default:
        break;
    }
  }

  // ── Identity + parameters ─────────────────────────────────────

  private async identify(): Promise<void> {
    this.setPhase('identifying');
    const gotIdentity = new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 6000);
      this.identityWaiter = () => {
        clearTimeout(timer);
        this.identityWaiter = null;
        resolve(true);
      };
    });
    for (let i = 0; i < 3; i++) {
      await this.sendCommandLong(MAV_CMD_REQUEST_MESSAGE, [AUTOPILOT_VERSION_ID]);
      const done = await Promise.race([gotIdentity, sleep(2000).then(() => false)]);
      if (done) break;
    }
    await gotIdentity;
    // Sensor health at 2 Hz for the bench check.
    await this.sendCommandLong(MAV_CMD_SET_MESSAGE_INTERVAL, [SYS_STATUS_ID, 500_000]);
    await this.loadParams();
    if (this.state.boardUid) {
      const records = await this.deps.records.verify(this.state.boardUid, (names) => this.readParams(names));
      this.update({ records });
    }
    this.setPhase('ready');
  }

  async loadParams(): Promise<void> {
    this.setPhase('loading-params', { progress: 0 });
    this.params.clear();
    this.paramTotal = 0;
    await this.send(PARAM_REQUEST_LIST_ID, serializeParamRequestList({ targetSystem: this.targetSystem, targetComponent: this.targetComponent }), PARAM_REQUEST_LIST_CRC_EXTRA);

    // Stream until quiet, then fetch the gaps by index.
    let lastCount = -1;
    let quietSince = Date.now();
    const started = Date.now();
    while (Date.now() - started < 120_000) {
      if (!this.transport) return;
      await sleep(200);
      const n = this.params.size;
      if (this.paramTotal > 0) this.update({ progress: Math.min(99, Math.round((n / this.paramTotal) * 100)), paramCount: n, paramTotal: this.paramTotal });
      if (n !== lastCount) {
        lastCount = n;
        quietSince = Date.now();
      }
      if (this.paramTotal > 0 && n >= this.paramTotal) break;
      if (Date.now() - quietSince > 1500) {
        if (this.paramTotal === 0) {
          await this.send(PARAM_REQUEST_LIST_ID, serializeParamRequestList({ targetSystem: this.targetSystem, targetComponent: this.targetComponent }), PARAM_REQUEST_LIST_CRC_EXTRA);
          quietSince = Date.now();
          continue;
        }
        const have = new Set([...this.params.values()].map((p) => p.index));
        const missing: number[] = [];
        for (let i = 0; i < this.paramTotal; i++) if (!have.has(i)) missing.push(i);
        for (const index of missing.slice(0, 50)) {
          await this.send(PARAM_REQUEST_READ_ID, serializeParamRequestRead({
            targetSystem: this.targetSystem, targetComponent: this.targetComponent, paramId: '', paramIndex: index,
          }), PARAM_REQUEST_READ_CRC_EXTRA);
        }
        quietSince = Date.now();
      }
    }
    this.update({ paramCount: this.params.size, paramTotal: this.paramTotal, progress: undefined });
  }

  private waitParam(name: string, timeoutMs: number): Promise<number | null> {
    return new Promise((resolve) => {
      const list = this.paramWaiters.get(name) ?? [];
      const timer = setTimeout(() => {
        const l = this.paramWaiters.get(name);
        if (l) this.paramWaiters.set(name, l.filter((f) => f !== done));
        resolve(null);
      }, timeoutMs);
      const done = (v: number) => {
        clearTimeout(timer);
        resolve(v);
      };
      list.push(done);
      this.paramWaiters.set(name, list);
    });
  }

  /** Fresh values from the board, never the cache. Missing names are absent. */
  async readParams(names: string[]): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    const one = async (name: string) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const wait = this.waitParam(name, 1500);
        await this.send(PARAM_REQUEST_READ_ID, serializeParamRequestRead({
          targetSystem: this.targetSystem, targetComponent: this.targetComponent, paramId: name, paramIndex: -1,
        }), PARAM_REQUEST_READ_CRC_EXTRA);
        const v = await wait;
        if (v !== null) {
          out[name] = v;
          return;
        }
      }
    };
    for (let i = 0; i < names.length; i += 10) await Promise.all(names.slice(i, i + 10).map(one));
    return out;
  }

  private async setParam(name: string, value: number, type: number): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = this.waitParam(name, 1200);
      const payload = serializeParamSet({
        targetSystem: this.targetSystem, targetComponent: this.targetComponent, paramId: name, paramValue: value, paramType: type,
      });
      if (this.state.firmware === 'px4') encodePx4ParamSetValue(payload, value, type);
      await this.send(PARAM_SET_ID, payload, PARAM_SET_CRC_EXTRA);
      const echoed = await wait;
      if (echoed !== null && sameParamValue(echoed, value)) return true;
    }
    return false;
  }

  /** Write and confirm each value. Returns names the board did not confirm. */
  async writeParams(changes: Array<{ id: string; value: number }>): Promise<{ written: number; failed: string[]; missing: string[] }> {
    const failed: string[] = [];
    const missing: string[] = [];
    let written = 0;
    this.setPhase('writing', { progress: 0 });
    const writable = changes.filter((c) => {
      if (this.params.has(c.id)) return true;
      missing.push(c.id);
      return false;
    });
    for (let i = 0; i < writable.length; i += 8) {
      const batch = writable.slice(i, i + 8);
      const results = await Promise.all(batch.map((c) => this.setParam(c.id, c.value, this.params.get(c.id)!.type)));
      results.forEach((ok, j) => (ok ? written++ : failed.push(batch[j]!.id)));
      this.update({ progress: Math.round(((i + batch.length) / Math.max(1, writable.length)) * 100) });
    }
    this.setPhase('ready');
    return { written, failed, missing };
  }

  // ── Reboot / reset / flash ────────────────────────────────────

  /** Reboot and come back: re-identify, re-read params, settle calibration persistence. */
  async reboot(reason: BayPhase = 'rebooting'): Promise<boolean> {
    this.expectingDrop = true;
    this.setPhase(reason);
    const back = await this.gate(async () => {
      const ack = await this.command(MAV_CMD_PREFLIGHT_REBOOT_SHUTDOWN, [1], 3000);
      if (ack !== null && ack !== MAV_RESULT_ACCEPTED) return 'refused' as const;
      // Let the board actually go down before reopening its port.
      await sleep(1500);
      await this.dropTransport();
      return (await this.relink(45_000)) ? 'back' as const : 'lost' as const;
    });
    this.expectingDrop = false;
    if (back === 'refused') {
      this.setPhase('ready', { error: this.deps.text('bay.rebootRefused') });
      return false;
    }
    if (back === 'lost') {
      this.setPhase('lost', { error: this.deps.text('bay.didNotReturn') });
      return false;
    }
    await this.identify();
    return true;
  }

  /** Reopen the port until the board's heartbeat is back (USB re-enumeration only, no param traffic). */
  private async relink(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline && !this.closed) {
      await sleep(1000);
      try {
        await this.openLink();
        if (await this.waitHeartbeat(5000)) return true;
      } catch {
        // port not back yet
      }
      await this.dropTransport();
    }
    return false;
  }

  /** Wipe all parameters to firmware defaults, so leftovers from earlier tests cannot ship. */
  async resetToDefaults(): Promise<boolean> {
    if (this.state.firmware === 'px4') {
      const ack = await this.command(MAV_CMD_PREFLIGHT_STORAGE, [2], 3000);
      if (ack !== MAV_RESULT_ACCEPTED) return false;
    } else {
      const entry = this.params.get('FORMAT_VERSION');
      if (!entry) return false;
      const payload = serializeParamSet({
        targetSystem: this.targetSystem, targetComponent: this.targetComponent, paramId: 'FORMAT_VERSION', paramValue: 0, paramType: entry.type,
      });
      await this.send(PARAM_SET_ID, payload, PARAM_SET_CRC_EXTRA);
      await sleep(500);
    }
    return this.reboot('resetting');
  }

  /** Hand the port to the flasher, then reattach. `run` owns the port while it runs. */
  async flash(run: (port: string) => Promise<{ success: boolean; error?: string }>): Promise<{ success: boolean; error?: string }> {
    this.expectingDrop = true;
    this.cal.cancelMavlinkCalibration();
    this.setPhase('flashing', { progress: 0, calibration: null, error: undefined });
    const outcome = await this.gate(async () => {
      await this.dropTransport();
      const result = await run(this.port);
      // Even after a failed flash the old firmware may still run: come back so the operator can retry.
      const back = await this.relink(result.success ? 60_000 : 20_000);
      return { result, back };
    });
    this.expectingDrop = false;
    if (!outcome.back) {
      this.setPhase(outcome.result.success ? 'lost' : 'error', { error: outcome.result.error ?? this.deps.text('bay.didNotReturn') });
      return outcome.result.success ? { success: false, error: this.deps.text('bay.didNotReturn') } : outcome.result;
    }
    await this.identify();
    if (!outcome.result.success) this.update({ error: outcome.result.error });
    return outcome.result;
  }

  setFlashProgress(progress: number, detail?: string): void {
    this.update({ progress, phaseDetail: detail });
  }

  // ── Calibration ───────────────────────────────────────────────

  async startCalibration(type: ProductionCalibrationType): Promise<{ success: boolean; error?: string }> {
    const firmware = this.state.firmware === 'px4' ? 'px4' : 'ardupilot';
    const tracked = (firmware === 'px4' ? PX4_CALIBRATION_PARAMS : MAVLINK_CALIBRATION_PARAMS)[type] ?? [];
    this.calSnapshot = tracked.length ? await this.readParams([...tracked]) : {};
    // ArduPilot rejects accel/trim cal for 5 s after boot or after the previous accel cal.
    const since = Date.now() - Math.max(this.firstHeartbeatAt, this.lastAccelCalAt);
    if (type.startsWith('accel') && since < 6000) await sleep(6000 - since);
    this.update({
      phase: 'calibrating',
      calibration: { type, progress: 0, statusText: '', awaitingPosition: false },
      lastCalResult: undefined,
    });
    const res = await this.cal.startMavlinkCalibration(type, firmware);
    if (!res.success) this.update({ phase: 'ready', calibration: null, lastCalResult: { type, success: false, error: res.error } });
    return res;
  }

  confirmPosition(position: number): Promise<{ success: boolean; error?: string }> {
    return this.cal.confirmMavlinkPosition(position);
  }

  cancelCalibration(): void {
    const type = this.state.calibration?.type;
    this.cal.cancelMavlinkCalibration();
    this.update({ phase: 'ready', calibration: null, ...(type ? { lastCalResult: { type, success: false, error: this.deps.text('bay.calCancelled') } } : {}) });
  }

  private onCalProgress(event: CalibrationProgressEvent): void {
    const prev = this.state.calibration;
    const next: BayCalibrationState = {
      // A bay only ever starts production calibration types.
      type: event.type as ProductionCalibrationType,
      progress: event.progress,
      statusText: event.statusText,
      currentPosition: event.currentPosition,
      positionStatus: event.positionStatus,
      compassProgress: event.compassProgress,
      awaitingPosition: event.type === 'accel-6point' && event.currentPosition !== undefined,
    };
    if (JSON.stringify(prev) !== JSON.stringify(next)) this.update({ calibration: next });
  }

  private async onCalComplete(event: CalibrationCompleteEvent): Promise<void> {
    const type = event.type as ProductionCalibrationType;
    if (type.startsWith('accel')) this.lastAccelCalAt = Date.now();
    if (!event.success) {
      this.update({ phase: 'ready', calibration: null, lastCalResult: { type, success: false, error: event.error } });
      return;
    }
    const firmware = this.state.firmware === 'px4' ? 'px4' : 'ardupilot';
    const tracked = (firmware === 'px4' ? PX4_CALIBRATION_PARAMS : MAVLINK_CALIBRATION_PARAMS)[type] ?? [];
    const epsilon = (firmware === 'px4' ? PX4_CALIBRATION_DIFF_EPSILON : CALIBRATION_DIFF_EPSILON)[type] ?? 1e-4;
    let after = tracked.length ? await this.readParams([...tracked]) : {};
    const moved = (vals: Record<string, number>) =>
      Object.keys(vals).some((k) => this.calSnapshot?.[k] !== undefined && Math.abs(vals[k]! - this.calSnapshot[k]!) > epsilon);
    if (event.unconfirmed && tracked.length && !moved(after)) {
      await sleep(2000);
      after = await this.readParams([...tracked]);
    }
    // Unchanged values prove a failure only when the FC never confirmed (a level board keeps AHRS_TRIM at 0).
    if (event.unconfirmed && tracked.length && !moved(after)) {
      this.update({ phase: 'ready', calibration: null, lastCalResult: { type, success: false, error: this.deps.text('bay.calSilentFailure') } });
      return;
    }
    for (const [k, v] of Object.entries(after)) {
      const e = this.params.get(k);
      if (e) this.params.set(k, { ...e, value: v });
    }
    if (this.state.boardUid && tracked.length) {
      const fits = (event.data?.compassResults ?? []).map((r) => r.fitness).filter((f): f is number => typeof f === 'number');
      this.deps.records.save(this.state.boardUid, buildCalibrationRecord(type, after, fits));
    }
    this.update({
      phase: 'ready',
      calibration: null,
      lastCalResult: { type, success: true, rebootRequired: event.rebootRequired },
      records: this.state.boardUid ? this.deps.records.list(this.state.boardUid) : [],
    });
  }

  refreshRecords(): void {
    if (this.state.boardUid) this.update({ records: this.deps.records.list(this.state.boardUid) });
  }
}
