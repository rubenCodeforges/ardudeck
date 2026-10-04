// libcanard bit packing: little-endian bytes, MSB first, partial last byte left-aligned.

export class BitWriter {
  private bytes: number[] = [];
  private bitLen = 0;

  writeUnsigned(value: bigint | number, bits: number): void {
    let v = BigInt(value) & ((1n << BigInt(bits)) - 1n);
    const nBytes = Math.ceil(bits / 8);
    const le: number[] = [];
    for (let i = 0; i < nBytes; i++) {
      le.push(Number(v & 0xffn));
      v >>= 8n;
    }
    const rem = bits % 8;
    if (rem !== 0) le[nBytes - 1] = (le[nBytes - 1]! << (8 - rem)) & 0xff;
    for (let i = 0; i < bits; i++) {
      const bit = (le[i >> 3]! >> (7 - (i & 7))) & 1;
      this.pushBit(bit);
    }
  }

  writeSigned(value: bigint | number, bits: number): void {
    this.writeUnsigned(BigInt(value) & ((1n << BigInt(bits)) - 1n), bits);
  }

  writeFloat32(value: number): void {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, true);
    this.writeUnsigned(view.getUint32(0, true), 32);
  }

  writeBytes(bytes: Uint8Array | number[]): void {
    for (const b of bytes) this.writeUnsigned(b, 8);
  }

  private pushBit(bit: number): void {
    const byte = this.bitLen >> 3;
    if (byte >= this.bytes.length) this.bytes.push(0);
    if (bit) this.bytes[byte]! |= 0x80 >> (this.bitLen & 7);
    this.bitLen++;
  }

  finish(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

export class BitReader {
  private pos = 0;

  constructor(private data: Uint8Array) {}

  get remainingBits(): number {
    return this.data.length * 8 - this.pos;
  }

  readUnsigned(bits: number): bigint {
    const nBytes = Math.ceil(bits / 8);
    const le = new Array<number>(nBytes).fill(0);
    for (let i = 0; i < bits; i++) {
      const p = this.pos + i;
      const bit = p < this.data.length * 8 ? (this.data[p >> 3]! >> (7 - (p & 7))) & 1 : 0;
      if (bit) le[i >> 3]! |= 0x80 >> (i & 7);
    }
    this.pos += bits;
    const rem = bits % 8;
    if (rem !== 0) le[nBytes - 1] = le[nBytes - 1]! >> (8 - rem);
    let v = 0n;
    for (let i = nBytes - 1; i >= 0; i--) v = (v << 8n) | BigInt(le[i]!);
    return v;
  }

  readNumber(bits: number): number {
    return Number(this.readUnsigned(bits));
  }

  readSigned(bits: number): bigint {
    const v = this.readUnsigned(bits);
    const sign = 1n << BigInt(bits - 1);
    return v & sign ? v - (1n << BigInt(bits)) : v;
  }

  readFloat32(): number {
    const view = new DataView(new ArrayBuffer(4));
    view.setUint32(0, this.readNumber(32), true);
    return view.getFloat32(0, true);
  }

  readBytes(count: number): Uint8Array {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i++) out[i] = this.readNumber(8);
    return out;
  }

  /** Tail array optimisation: the last uint8 array takes every remaining whole byte. */
  readTailBytes(): Uint8Array {
    return this.readBytes(Math.floor(this.remainingBits / 8));
  }
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

// ---- uavcan.protocol.NodeStatus ----

export interface NodeStatus {
  uptimeSec: number;
  health: number;
  mode: number;
  subMode: number;
  vendorStatus: number;
}

function readNodeStatus(r: BitReader): NodeStatus {
  return {
    uptimeSec: r.readNumber(32),
    health: r.readNumber(2),
    mode: r.readNumber(3),
    subMode: r.readNumber(3),
    vendorStatus: r.readNumber(16),
  };
}

export function decodeNodeStatus(payload: Uint8Array): NodeStatus {
  return readNodeStatus(new BitReader(payload));
}

// ---- uavcan.protocol.GetNodeInfo (response) ----

export interface NodeInfo {
  status: NodeStatus;
  softwareVersion: { major: number; minor: number; vcsCommit?: number; imageCrc?: bigint };
  hardwareVersion: { major: number; minor: number; uniqueId: Uint8Array };
  name: string;
}

export function decodeGetNodeInfoResponse(payload: Uint8Array): NodeInfo {
  const r = new BitReader(payload);
  const status = readNodeStatus(r);
  const swMajor = r.readNumber(8);
  const swMinor = r.readNumber(8);
  const flags = r.readNumber(8);
  const vcsCommit = r.readNumber(32);
  const imageCrc = r.readUnsigned(64);
  const hwMajor = r.readNumber(8);
  const hwMinor = r.readNumber(8);
  const uniqueId = r.readBytes(16);
  const coaLen = r.readNumber(8);
  r.readBytes(coaLen);
  const name = fromUtf8.decode(r.readTailBytes());
  return {
    status,
    softwareVersion: {
      major: swMajor,
      minor: swMinor,
      ...(flags & 1 ? { vcsCommit } : {}),
      ...(flags & 2 ? { imageCrc } : {}),
    },
    hardwareVersion: { major: hwMajor, minor: hwMinor, uniqueId },
    name,
  };
}

// ---- uavcan.protocol.param.Value / NumericValue ----

export type ParamValue =
  | { type: 'empty' }
  | { type: 'integer'; value: bigint }
  | { type: 'real'; value: number }
  | { type: 'boolean'; value: boolean }
  | { type: 'string'; value: string };

export type NumericValue = { type: 'empty' } | { type: 'integer'; value: bigint } | { type: 'real'; value: number };

function writeValue(w: BitWriter, v: ParamValue): void {
  switch (v.type) {
    case 'empty': w.writeUnsigned(0, 3); break;
    case 'integer': w.writeUnsigned(1, 3); w.writeSigned(v.value, 64); break;
    case 'real': w.writeUnsigned(2, 3); w.writeFloat32(v.value); break;
    case 'boolean': w.writeUnsigned(3, 3); w.writeUnsigned(v.value ? 1 : 0, 8); break;
    case 'string': {
      const bytes = utf8.encode(v.value).subarray(0, 128);
      w.writeUnsigned(4, 3);
      w.writeUnsigned(bytes.length, 8);
      w.writeBytes(bytes);
      break;
    }
  }
}

function readValue(r: BitReader): ParamValue {
  switch (r.readNumber(3)) {
    case 1: return { type: 'integer', value: r.readSigned(64) };
    case 2: return { type: 'real', value: r.readFloat32() };
    case 3: return { type: 'boolean', value: r.readNumber(8) !== 0 };
    case 4: return { type: 'string', value: fromUtf8.decode(r.readBytes(r.readNumber(8))) };
    default: return { type: 'empty' };
  }
}

function readNumeric(r: BitReader): NumericValue {
  switch (r.readNumber(2)) {
    case 1: return { type: 'integer', value: r.readSigned(64) };
    case 2: return { type: 'real', value: r.readFloat32() };
    default: return { type: 'empty' };
  }
}

// ---- uavcan.protocol.param.GetSet ----

export function encodeGetSetRequest(req: { index?: number; name?: string; value?: ParamValue }): Uint8Array {
  const w = new BitWriter();
  w.writeUnsigned(req.index ?? 0, 13);
  writeValue(w, req.value ?? { type: 'empty' });
  w.writeBytes(utf8.encode(req.name ?? '').subarray(0, 92));
  return w.finish();
}

export interface GetSetResponse {
  value: ParamValue;
  defaultValue: ParamValue;
  maxValue: NumericValue;
  minValue: NumericValue;
  name: string;
}

export function decodeGetSetResponse(payload: Uint8Array): GetSetResponse {
  const r = new BitReader(payload);
  r.readUnsigned(5);
  const value = readValue(r);
  r.readUnsigned(5);
  const defaultValue = readValue(r);
  r.readUnsigned(6);
  const maxValue = readNumeric(r);
  r.readUnsigned(6);
  const minValue = readNumeric(r);
  const name = fromUtf8.decode(r.readTailBytes());
  return { value, defaultValue, maxValue, minValue, name };
}

// ---- uavcan.protocol.param.ExecuteOpcode ----

export const OPCODE_SAVE = 0;

export function encodeExecuteOpcodeRequest(opcode: number, argument = 0n): Uint8Array {
  const w = new BitWriter();
  w.writeUnsigned(opcode, 8);
  w.writeSigned(argument, 48);
  return w.finish();
}

export function decodeExecuteOpcodeResponse(payload: Uint8Array): { argument: bigint; ok: boolean } {
  const r = new BitReader(payload);
  return { argument: r.readSigned(48), ok: r.readNumber(1) === 1 };
}

// ---- uavcan.protocol.RestartNode ----

export const RESTART_MAGIC = 0xacce551b1en;

export function encodeRestartRequest(): Uint8Array {
  const w = new BitWriter();
  w.writeUnsigned(RESTART_MAGIC, 40);
  return w.finish();
}

export function decodeRestartResponse(payload: Uint8Array): { ok: boolean } {
  return { ok: new BitReader(payload).readNumber(1) === 1 };
}
