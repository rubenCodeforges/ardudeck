import { describe, it, expect } from 'vitest';
import vectors from './__fixtures__/dronecan-vectors.json';
import {
  GET_NODE_INFO, NODE_STATUS, PARAM_EXECUTE_OPCODE, PARAM_GET_SET, RESTART_NODE,
  TransferReassembler, decodeFrameId, splitTransfer, type DroneCanType,
} from './dronecan-protocol';
import {
  decodeExecuteOpcodeResponse, decodeGetNodeInfoResponse, decodeGetSetResponse, decodeNodeStatus,
  decodeRestartResponse, encodeExecuteOpcodeRequest, encodeGetSetRequest, encodeRestartRequest, OPCODE_SAVE,
} from './dsdl';

type Vector = { frames: { id: number; data: number[] }[]; payload: number[]; src: number; dst: number | null; tid: number; prio: number };
const v = (vectors as { vectors: Record<string, Vector> }).vectors;
const types = (vectors as { types: Record<string, { dtid: number; signature: string }> }).types;

const TYPES: Array<[string, DroneCanType]> = [
  ['uavcan.protocol.NodeStatus', NODE_STATUS],
  ['uavcan.protocol.GetNodeInfo', GET_NODE_INFO],
  ['uavcan.protocol.param.GetSet', PARAM_GET_SET],
  ['uavcan.protocol.param.ExecuteOpcode', PARAM_EXECUTE_OPCODE],
  ['uavcan.protocol.RestartNode', RESTART_NODE],
];

function typeFor(name: string): DroneCanType {
  if (name.startsWith('nodeStatus')) return NODE_STATUS;
  if (name.startsWith('getNodeInfo')) return GET_NODE_INFO;
  if (name.startsWith('getSet')) return PARAM_GET_SET;
  if (name.startsWith('executeOpcode')) return PARAM_EXECUTE_OPCODE;
  return RESTART_NODE;
}

function encodeTransfer(name: string, payload: Uint8Array) {
  const vec = v[name]!;
  const type = typeFor(name);
  const service = name !== 'nodeStatus';
  return splitTransfer(
    { priority: vec.prio, sourceNode: vec.src, service, dtid: type.dtid, request: name.includes('Req'), destNode: vec.dst ?? 0 },
    type.signature, vec.tid, payload,
  ).map((f) => ({ id: f.id, data: Array.from(f.data) }));
}

describe('DroneCAN type constants', () => {
  it.each(TYPES)('%s matches pydronecan', (name, type) => {
    expect(type.dtid).toBe(types[name]!.dtid);
    expect(type.signature).toBe(BigInt(types[name]!.signature));
  });
});

describe('DroneCAN transport', () => {
  it.each(Object.keys(v))('splits %s into the reference frames', (name) => {
    expect(encodeTransfer(name, Uint8Array.from(v[name]!.payload))).toEqual(v[name]!.frames);
  });

  it.each(Object.keys(v))('reassembles %s', (name) => {
    const r = new TransferReassembler((h) => (h.service ? TYPES.find(([, t]) => t.dtid === h.dtid)?.[1].signature : NODE_STATUS.signature));
    let out = null;
    for (const f of v[name]!.frames) out = r.push({ id: f.id, data: Uint8Array.from(f.data) }) ?? out;
    expect(out).not.toBeNull();
    expect(Array.from(out!.payload)).toEqual(v[name]!.payload);
    expect(out!.transferId).toBe(v[name]!.tid);
    expect(out!.header.sourceNode).toBe(v[name]!.src);
  });

  it('rejects a multi-frame transfer with a corrupted byte', () => {
    const r = new TransferReassembler(() => GET_NODE_INFO.signature);
    const frames = v.getNodeInfoResp!.frames.map((f) => ({ id: f.id, data: Uint8Array.from(f.data) }));
    frames[3]!.data[0]! ^= 0xff;
    let out = null;
    for (const f of frames) out = r.push(f) ?? out;
    expect(out).toBeNull();
  });

  it('decodes service frame ids', () => {
    const h = decodeFrameId(v.getSetReqIndex!.frames[0]!.id);
    expect(h).toMatchObject({ service: true, request: true, dtid: 11, sourceNode: 127, destNode: 42, priority: 30 });
  });
});

describe('DSDL codecs', () => {
  it('decodes NodeStatus', () => {
    expect(decodeNodeStatus(Uint8Array.from(v.nodeStatus!.payload))).toEqual({
      uptimeSec: 12345, health: 1, mode: 0, subMode: 2, vendorStatus: 0xbeef,
    });
  });

  it('decodes GetNodeInfo response', () => {
    const info = decodeGetNodeInfoResponse(Uint8Array.from(v.getNodeInfoResp!.payload));
    expect(info.name).toBe('com.uav-dev.ledmodule');
    expect(info.softwareVersion).toEqual({ major: 1, minor: 4, vcsCommit: 0x1a2b3c4d });
    expect(info.hardwareVersion.major).toBe(2);
    expect(Array.from(info.hardwareVersion.uniqueId)).toEqual([...Array(16).keys()]);
    expect(info.status.uptimeSec).toBe(12345);
  });

  it('encodes GetSet requests byte for byte', () => {
    expect(Array.from(encodeGetSetRequest({ index: 5 }))).toEqual(v.getSetReqIndex!.payload);
    expect(Array.from(encodeGetSetRequest({ name: 'LED_MODE', value: { type: 'integer', value: 2n } }))).toEqual(v.getSetReqSetInt!.payload);
    expect(Array.from(encodeGetSetRequest({ name: 'LED_BRIGHT', value: { type: 'real', value: 0.75 } }))).toEqual(v.getSetReqSetReal!.payload);
    expect(Array.from(encodeGetSetRequest({ name: 'DEV_NAME', value: { type: 'string', value: 'nav' } }))).toEqual(v.getSetReqSetString!.payload);
  });

  it('decodes GetSet responses', () => {
    expect(decodeGetSetResponse(Uint8Array.from(v.getSetRespInt!.payload))).toEqual({
      name: 'LED_MODE',
      value: { type: 'integer', value: 2n },
      defaultValue: { type: 'integer', value: 0n },
      maxValue: { type: 'integer', value: 3n },
      minValue: { type: 'integer', value: 0n },
    });
    expect(decodeGetSetResponse(Uint8Array.from(v.getSetRespReal!.payload))).toEqual({
      name: 'LED_BRIGHT',
      value: { type: 'real', value: 0.75 },
      defaultValue: { type: 'real', value: 1 },
      maxValue: { type: 'real', value: 1 },
      minValue: { type: 'real', value: 0 },
    });
    expect(decodeGetSetResponse(Uint8Array.from(v.getSetRespBool!.payload)).value).toEqual({ type: 'boolean', value: true });
    expect(decodeGetSetResponse(Uint8Array.from(v.getSetRespString!.payload)).value).toEqual({ type: 'string', value: 'nav light' });
    const empty = decodeGetSetResponse(Uint8Array.from(v.getSetRespEmpty!.payload));
    expect(empty.name).toBe('');
    expect(empty.value).toEqual({ type: 'empty' });
  });

  it('encodes ExecuteOpcode and RestartNode requests', () => {
    expect(Array.from(encodeExecuteOpcodeRequest(OPCODE_SAVE))).toEqual(v.executeOpcodeReq!.payload);
    expect(Array.from(encodeRestartRequest())).toEqual(v.restartReq!.payload);
    expect(decodeExecuteOpcodeResponse(Uint8Array.from(v.executeOpcodeResp!.payload)).ok).toBe(true);
    expect(decodeRestartResponse(Uint8Array.from(v.restartResp!.payload)).ok).toBe(true);
  });
});
