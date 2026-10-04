import type { DroneCanNode, DroneCanParam, DroneCanParamValue, DroneCanState, DroneCanForwardStatus } from '../../shared/dronecan-types.js';
import {
  GCS_NODE_ID, GET_NODE_INFO, NODE_STATUS, PARAM_EXECUTE_OPCODE, PARAM_GET_SET, RESTART_NODE, SERVICE_PRIORITY,
  TransferReassembler, splitTransfer, type DroneCanType, type FrameHeader, type Transfer,
} from './dronecan-protocol.js';
import {
  decodeExecuteOpcodeResponse, decodeGetNodeInfoResponse, decodeGetSetResponse, decodeNodeStatus, decodeRestartResponse,
  encodeExecuteOpcodeRequest, encodeGetSetRequest, encodeRestartRequest, OPCODE_SAVE, type NumericValue, type ParamValue,
} from './dsdl.js';

export const MAV_CMD_CAN_FORWARD = 32000;
const CAN_EFF_FLAG = 0x80000000;
// ArduPilot stops forwarding 5 s after the last MAV_CMD_CAN_FORWARD.
const KEEPALIVE_MS = 2000;
const ACK_TIMEOUT_MS = 3000;
const NODE_OFFLINE_MS = 3000;
const REQUEST_TIMEOUT_MS = 1000;
const REQUEST_RETRIES = 2;
const MAX_PARAMS = 1024;
const SERVICE_TYPES = [GET_NODE_INFO, PARAM_GET_SET, PARAM_EXECUTE_OPCODE, RESTART_NODE];

export interface DroneCanBridgeDeps {
  sendForwardCommand(bus: number): Promise<void>;
  /** bus is 0-based here: CAN_FRAME uses the interface index, unlike MAV_CMD_CAN_FORWARD. */
  sendFrame(bus: number, id: number, data: Uint8Array): Promise<void>;
  sendFilter(bus: number, dtids: number[]): Promise<void>;
  onState(state: DroneCanState): void;
  now?(): number;
}

interface PendingRequest {
  nodeId: number;
  dtid: number;
  transferId: number;
  resolve(payload: Uint8Array): void;
}

export class DroneCanBridge {
  private status: DroneCanForwardStatus = 'idle';
  private bus: number | null = null;
  private nodes = new Map<number, DroneCanNode>();
  private framesReceived = 0;
  private keepalive: ReturnType<typeof setInterval> | null = null;
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private emitTimer: ReturnType<typeof setTimeout> | null = null;
  private pending: PendingRequest | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private transferIds = new Map<string, number>();
  private infoRequested = new Set<number>();
  private reassembler = new TransferReassembler((h) => this.signatureFor(h));

  constructor(private deps: DroneCanBridgeDeps) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  async start(bus: number): Promise<void> {
    if (this.bus !== bus) this.reset();
    this.bus = bus;
    this.status = 'starting';
    this.emit();
    await this.deps.sendFilter(bus, [NODE_STATUS.dtid, ...SERVICE_TYPES.map((t) => t.dtid)]);
    await this.deps.sendForwardCommand(bus);
    if (this.keepalive) clearInterval(this.keepalive);
    this.keepalive = setInterval(() => {
      if (this.bus !== null) void this.deps.sendForwardCommand(this.bus);
      this.refreshOnline();
    }, KEEPALIVE_MS);
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = setTimeout(() => {
      if (this.status === 'starting') {
        this.status = this.framesReceived > 0 ? 'active' : 'noResponse';
        this.emit();
      }
    }, ACK_TIMEOUT_MS);
  }

  async stop(): Promise<void> {
    const bus = this.bus;
    this.clearTimers();
    this.status = 'idle';
    this.emit();
    if (bus !== null) {
      await this.deps.sendForwardCommand(0);
      await this.deps.sendFilter(bus, []);
    }
  }

  /** Drop all state, e.g. on disconnect. */
  reset(): void {
    this.clearTimers();
    this.status = 'idle';
    this.bus = null;
    this.nodes.clear();
    this.infoRequested.clear();
    this.framesReceived = 0;
    this.pending = null;
    this.emit();
  }

  private clearTimers(): void {
    if (this.keepalive) clearInterval(this.keepalive);
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.keepalive = null;
    this.ackTimer = null;
  }

  handleForwardAck(result: number): void {
    if (this.status !== 'starting') return;
    if (result === 0) this.status = 'active';
    else if (result === 3) this.status = 'unsupported';
    else this.status = 'failed';
    this.emit();
  }

  getState(): DroneCanState {
    return {
      status: this.status,
      bus: this.bus,
      framesReceived: this.framesReceived,
      nodes: [...this.nodes.values()].sort((a, b) => a.nodeId - b.nodeId),
    };
  }

  handleFrame(bus: number, rawId: number, data: Uint8Array): void {
    if (this.bus === null || bus !== this.bus - 1 || (rawId & CAN_EFF_FLAG) === 0) return;
    this.framesReceived++;
    if (this.status === 'starting' || this.status === 'noResponse') this.status = 'active';
    const transfer = this.reassembler.push({ id: rawId & 0x1fffffff, data }, this.now());
    if (transfer) this.handleTransfer(transfer);
  }

  private signatureFor(h: FrameHeader): bigint | undefined {
    if (!h.service) return h.dtid === NODE_STATUS.dtid ? NODE_STATUS.signature : undefined;
    return SERVICE_TYPES.find((t) => t.dtid === h.dtid)?.signature;
  }

  private handleTransfer(t: Transfer): void {
    const h = t.header;
    if (!h.service) {
      if (h.dtid === NODE_STATUS.dtid && t.payload.length >= 7) this.onNodeStatus(h.sourceNode, t.payload);
      return;
    }
    if (h.request || h.destNode !== GCS_NODE_ID) return;
    const p = this.pending;
    if (p && p.nodeId === h.sourceNode && p.dtid === h.dtid && p.transferId === t.transferId) {
      this.pending = null;
      p.resolve(t.payload);
    }
  }

  private onNodeStatus(nodeId: number, payload: Uint8Array): void {
    const s = decodeNodeStatus(payload);
    const prev = this.nodes.get(nodeId);
    const restarted = prev !== undefined && s.uptimeSec < prev.uptimeSec;
    this.nodes.set(nodeId, {
      ...(restarted ? {} : prev),
      nodeId,
      health: s.health,
      mode: s.mode,
      subMode: s.subMode,
      vendorStatus: s.vendorStatus,
      uptimeSec: s.uptimeSec,
      lastSeenMs: this.now(),
      online: true,
    });
    if (restarted) this.infoRequested.delete(nodeId);
    if (!this.infoRequested.has(nodeId)) {
      this.infoRequested.add(nodeId);
      void this.requestNodeInfo(nodeId).catch(() => this.infoRequested.delete(nodeId));
    }
    this.emit();
  }

  private refreshOnline(): void {
    const now = this.now();
    let changed = false;
    for (const node of this.nodes.values()) {
      const online = now - node.lastSeenMs < NODE_OFFLINE_MS;
      if (online !== node.online) {
        node.online = online;
        changed = true;
      }
    }
    if (changed) this.emit();
  }

  private emit(): void {
    if (this.emitTimer) return;
    this.emitTimer = setTimeout(() => {
      this.emitTimer = null;
      this.deps.onState(this.getState());
    }, 100);
  }

  private nextTransferId(nodeId: number, dtid: number): number {
    const key = `${nodeId}:${dtid}`;
    const id = ((this.transferIds.get(key) ?? -1) + 1) & 0x1f;
    this.transferIds.set(key, id);
    return id;
  }

  /** One service request in flight at a time: ArduPilot buffers only ~20 forwarded frames. */
  private request(nodeId: number, type: DroneCanType, payload: Uint8Array): Promise<Uint8Array> {
    const run = async (): Promise<Uint8Array> => {
      if (this.bus === null) throw new Error('not-active');
      for (let attempt = 0; attempt <= REQUEST_RETRIES; attempt++) {
        const transferId = this.nextTransferId(nodeId, type.dtid);
        const response = new Promise<Uint8Array | null>((resolve) => {
          const timer = setTimeout(() => {
            if (this.pending?.transferId === transferId && this.pending.nodeId === nodeId) this.pending = null;
            resolve(null);
          }, REQUEST_TIMEOUT_MS);
          this.pending = { nodeId, dtid: type.dtid, transferId, resolve: (p) => { clearTimeout(timer); resolve(p); } };
        });
        const frames = splitTransfer(
          { priority: SERVICE_PRIORITY, sourceNode: GCS_NODE_ID, service: true, dtid: type.dtid, request: true, destNode: nodeId },
          type.signature, transferId, payload,
        );
        for (const f of frames) await this.deps.sendFrame(this.bus - 1, (f.id | CAN_EFF_FLAG) >>> 0, f.data);
        const result = await response;
        if (result) return result;
      }
      throw new Error('timeout');
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async requestNodeInfo(nodeId: number): Promise<void> {
    const info = decodeGetNodeInfoResponse(await this.request(nodeId, GET_NODE_INFO, new Uint8Array(0)));
    const node = this.nodes.get(nodeId);
    if (!node) return;
    const sw = info.softwareVersion;
    node.name = info.name;
    node.softwareVersion = `${sw.major}.${sw.minor}${sw.vcsCommit !== undefined ? ` (${sw.vcsCommit.toString(16).padStart(8, '0')})` : ''}`;
    node.hardwareVersion = `${info.hardwareVersion.major}.${info.hardwareVersion.minor}`;
    node.uniqueId = Array.from(info.hardwareVersion.uniqueId, (b) => b.toString(16).padStart(2, '0')).join('');
    this.emit();
  }

  async listParams(nodeId: number, onProgress?: (count: number) => void): Promise<DroneCanParam[]> {
    const params: DroneCanParam[] = [];
    for (let index = 0; index < MAX_PARAMS; index++) {
      const r = decodeGetSetResponse(await this.request(nodeId, PARAM_GET_SET, encodeGetSetRequest({ index })));
      if (!r.name) break;
      params.push(toParam(index, r));
      onProgress?.(params.length);
    }
    return params;
  }

  /** Read one parameter by name; an empty value in GetSet means read. */
  async getParam(nodeId: number, name: string): Promise<DroneCanParam | null> {
    const r = decodeGetSetResponse(await this.request(nodeId, PARAM_GET_SET, encodeGetSetRequest({ name })));
    return r.name ? toParam(0, r) : null;
  }

  async setParam(nodeId: number, name: string, value: DroneCanParamValue, index = 0): Promise<DroneCanParam> {
    const r = decodeGetSetResponse(await this.request(nodeId, PARAM_GET_SET, encodeGetSetRequest({ name, value: toWire(value) })));
    if (!r.name) throw new Error('rejected');
    return toParam(index, r);
  }

  async saveParams(nodeId: number): Promise<boolean> {
    return decodeExecuteOpcodeResponse(await this.request(nodeId, PARAM_EXECUTE_OPCODE, encodeExecuteOpcodeRequest(OPCODE_SAVE))).ok;
  }

  async restartNode(nodeId: number): Promise<boolean> {
    return decodeRestartResponse(await this.request(nodeId, RESTART_NODE, encodeRestartRequest())).ok;
  }
}

function fromWire(v: ParamValue): DroneCanParamValue {
  return v.type === 'integer' ? { type: 'integer', value: Number(v.value) } : v;
}

function toWire(v: DroneCanParamValue): ParamValue {
  if (v.type === 'integer') return { type: 'integer', value: BigInt(Math.trunc(v.value)) };
  if (v.type === 'real') return { type: 'real', value: v.value };
  return v;
}

function numeric(v: NumericValue): number | undefined {
  return v.type === 'empty' ? undefined : Number(v.value);
}

function toParam(index: number, r: ReturnType<typeof decodeGetSetResponse>): DroneCanParam {
  return {
    index,
    name: r.name,
    value: fromWire(r.value),
    defaultValue: fromWire(r.defaultValue),
    min: numeric(r.minValue),
    max: numeric(r.maxValue),
  };
}
