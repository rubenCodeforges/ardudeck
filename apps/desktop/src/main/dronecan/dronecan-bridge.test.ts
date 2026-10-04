import { describe, it, expect, afterEach } from 'vitest';
import vectors from './__fixtures__/dronecan-vectors.json';
import { DroneCanBridge, type DroneCanBridgeDeps } from './dronecan-bridge';
import {
  GCS_NODE_ID, GET_NODE_INFO, NODE_STATUS, PARAM_EXECUTE_OPCODE, PARAM_GET_SET, TransferReassembler,
  splitTransfer, type DroneCanType,
} from './dronecan-protocol';
import { BitReader } from './dsdl';
import type { DroneCanState } from '../../shared/dronecan-types';

const v = (vectors as { vectors: Record<string, { payload: number[] }> }).vectors;
const EFF = 0x80000000;
const NODE = 42;
const TYPES = [GET_NODE_INFO, PARAM_GET_SET, PARAM_EXECUTE_OPCODE];

/** A fake DroneCAN node on bus 0 that answers with canned reference payloads. */
function simulatedNode(opts: { params: number[][]; silent?: boolean }) {
  let bridge: DroneCanBridge;
  const states: DroneCanState[] = [];
  const sent = { forward: [] as number[], filters: [] as number[][] };
  const rx = new TransferReassembler((h) => TYPES.find((t) => t.dtid === h.dtid)?.signature);
  const respond = (type: DroneCanType, transferId: number, payload: number[]) => {
    const frames = splitTransfer(
      { priority: 30, sourceNode: NODE, service: true, dtid: type.dtid, request: false, destNode: GCS_NODE_ID },
      type.signature, transferId, Uint8Array.from(payload),
    );
    queueMicrotask(() => frames.forEach((f) => bridge.handleFrame(0, (f.id | EFF) >>> 0, f.data)));
  };
  const deps: DroneCanBridgeDeps = {
    async sendForwardCommand(bus) { sent.forward.push(bus); },
    async sendFilter(_bus, ids) { sent.filters.push(ids); },
    async sendFrame(bus, id, data) {
      expect(bus).toBe(0);
      expect((id & EFF) >>> 0).toBe(EFF);
      if (opts.silent) return;
      const t = rx.push({ id: id & 0x1fffffff, data });
      if (!t || t.header.destNode !== NODE) return;
      if (t.header.dtid === GET_NODE_INFO.dtid) respond(GET_NODE_INFO, t.transferId, v.getNodeInfoResp!.payload);
      if (t.header.dtid === PARAM_EXECUTE_OPCODE.dtid) respond(PARAM_EXECUTE_OPCODE, t.transferId, v.executeOpcodeResp!.payload);
      if (t.header.dtid === PARAM_GET_SET.dtid) {
        const index = new BitReader(t.payload).readNumber(13);
        const isSet = t.payload.length > 2;
        respond(PARAM_GET_SET, t.transferId, isSet ? v.getSetRespReal!.payload : opts.params[index] ?? v.getSetRespEmpty!.payload);
      }
    },
    onState: (s) => states.push(s),
  };
  bridge = new DroneCanBridge(deps);
  const announce = (uptime: number) => {
    const payload = Uint8Array.from(v.nodeStatus!.payload);
    new DataView(payload.buffer).setUint32(0, uptime, true);
    const [f] = splitTransfer({ priority: 16, sourceNode: NODE, service: false, dtid: NODE_STATUS.dtid, request: false, destNode: 0 }, NODE_STATUS.signature, 0, payload);
    bridge.handleFrame(0, (f!.id | EFF) >>> 0, f!.data);
  };
  return { bridge, states, sent, announce };
}

let active: DroneCanBridge | null = null;
afterEach(() => active?.reset());

describe('DroneCanBridge', () => {
  it('starts forwarding on the 1-based bus and filters to the types it decodes', async () => {
    const sim = simulatedNode({ params: [] });
    active = sim.bridge;
    await sim.bridge.start(1);
    expect(sim.sent.forward).toEqual([1]);
    expect(sim.sent.filters[0]).toEqual([341, 1, 11, 10, 5]);
    sim.bridge.handleForwardAck(0);
    expect(sim.bridge.getState().status).toBe('active');
  });

  it('marks forwarding unsupported on MAV_RESULT_UNSUPPORTED', async () => {
    const sim = simulatedNode({ params: [] });
    active = sim.bridge;
    await sim.bridge.start(1);
    sim.bridge.handleForwardAck(3);
    expect(sim.bridge.getState().status).toBe('unsupported');
  });

  it('discovers a node from NodeStatus and fetches its info', async () => {
    const sim = simulatedNode({ params: [] });
    active = sim.bridge;
    await sim.bridge.start(1);
    sim.announce(100);
    await new Promise((r) => setTimeout(r, 20));
    const node = sim.bridge.getState().nodes[0]!;
    expect(node).toMatchObject({ nodeId: NODE, health: 1, online: true, name: 'com.uav-dev.ledmodule', softwareVersion: '1.4 (1a2b3c4d)', hardwareVersion: '2.0' });
  });

  it('ignores frames from another bus and standard-id frames', async () => {
    const sim = simulatedNode({ params: [] });
    active = sim.bridge;
    await sim.bridge.start(2);
    sim.announce(100);
    expect(sim.bridge.getState().nodes).toHaveLength(0);
  });

  it('enumerates parameters until the empty name', async () => {
    const sim = simulatedNode({ params: [v.getSetRespInt!.payload, v.getSetRespBool!.payload, v.getSetRespString!.payload] });
    active = sim.bridge;
    await sim.bridge.start(1);
    const params = await sim.bridge.listParams(NODE);
    expect(params.map((p) => p.name)).toEqual(['LED_MODE', 'ARMED_FLASH', 'DEV_NAME']);
    expect(params[0]).toEqual({ index: 0, name: 'LED_MODE', value: { type: 'integer', value: 2 }, defaultValue: { type: 'integer', value: 0 }, min: 0, max: 3 });
  });

  it('sets a parameter and saves', async () => {
    const sim = simulatedNode({ params: [] });
    active = sim.bridge;
    await sim.bridge.start(1);
    const p = await sim.bridge.setParam(NODE, 'LED_BRIGHT', { type: 'real', value: 0.75 });
    expect(p.value).toEqual({ type: 'real', value: 0.75 });
    expect(await sim.bridge.saveParams(NODE)).toBe(true);
  });

  it('times out after retries when the node is silent', async () => {
    const sim = simulatedNode({ params: [], silent: true });
    active = sim.bridge;
    await sim.bridge.start(1);
    await expect(sim.bridge.saveParams(NODE)).rejects.toThrow('timeout');
  }, 10000);
});
