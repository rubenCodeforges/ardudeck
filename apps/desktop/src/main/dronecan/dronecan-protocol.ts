export interface DroneCanType {
  dtid: number;
  signature: bigint;
}

export const NODE_STATUS: DroneCanType = { dtid: 341, signature: 0x0f0868d0c1a7c6f1n };
export const GET_NODE_INFO: DroneCanType = { dtid: 1, signature: 0xee468a8121c46a9en };
export const PARAM_GET_SET: DroneCanType = { dtid: 11, signature: 0xa7b622f939d1a4d5n };
export const PARAM_EXECUTE_OPCODE: DroneCanType = { dtid: 10, signature: 0x3b131ac5eb69d2cdn };
export const RESTART_NODE: DroneCanType = { dtid: 5, signature: 0x569e05394a3017f0n };

/** Node ids 126 and 127 are reserved for maintenance tools by the spec. */
export const GCS_NODE_ID = 127;
export const SERVICE_PRIORITY = 30;

export interface FrameHeader {
  priority: number;
  sourceNode: number;
  service: boolean;
  /** Message type id (16 bit) or service type id (8 bit). */
  dtid: number;
  request: boolean;
  destNode: number;
}

export function encodeFrameId(h: FrameHeader): number {
  const prio = (h.priority & 0x1f) << 24;
  const src = h.sourceNode & 0x7f;
  if (!h.service) return (prio | ((h.dtid & 0xffff) << 8) | src) >>> 0;
  return (prio | ((h.dtid & 0xff) << 16) | ((h.request ? 1 : 0) << 15) | ((h.destNode & 0x7f) << 8) | 0x80 | src) >>> 0;
}

export function decodeFrameId(id: number): FrameHeader {
  const service = (id & 0x80) !== 0;
  const base = { priority: (id >>> 24) & 0x1f, sourceNode: id & 0x7f, service };
  if (!service) return { ...base, dtid: (id >>> 8) & 0xffff, request: false, destNode: 0 };
  return { ...base, dtid: (id >>> 16) & 0xff, request: ((id >>> 15) & 1) === 1, destNode: (id >>> 8) & 0x7f };
}

/** CRC-16-CCITT-FALSE, seeded with the data type signature (little endian) as the spec requires. */
export function transferCrc(signature: bigint, payload: Uint8Array): number {
  let crc = 0xffff;
  const add = (byte: number) => {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  };
  for (let i = 0; i < 8; i++) add(Number((signature >> BigInt(i * 8)) & 0xffn));
  for (const b of payload) add(b);
  return crc;
}

export interface CanFrame {
  /** 29-bit id, no flag bits. */
  id: number;
  data: Uint8Array;
}

export function splitTransfer(header: FrameHeader, signature: bigint, transferId: number, payload: Uint8Array): CanFrame[] {
  const id = encodeFrameId(header);
  const tid = transferId & 0x1f;
  if (payload.length <= 7) {
    const data = new Uint8Array(payload.length + 1);
    data.set(payload);
    data[payload.length] = 0xc0 | tid;
    return [{ id, data }];
  }
  const crc = transferCrc(signature, payload);
  const body = new Uint8Array(payload.length + 2);
  body[0] = crc & 0xff;
  body[1] = crc >> 8;
  body.set(payload, 2);
  const frames: CanFrame[] = [];
  let toggle = 0;
  for (let off = 0; off < body.length; off += 7) {
    const chunk = body.subarray(off, Math.min(off + 7, body.length));
    const data = new Uint8Array(chunk.length + 1);
    data.set(chunk);
    const sot = off === 0 ? 0x80 : 0;
    const eot = off + 7 >= body.length ? 0x40 : 0;
    data[chunk.length] = sot | eot | (toggle << 5) | tid;
    frames.push({ id, data });
    toggle ^= 1;
  }
  return frames;
}

export interface Transfer {
  header: FrameHeader;
  transferId: number;
  payload: Uint8Array;
}

interface PartialTransfer {
  transferId: number;
  toggle: number;
  bytes: number[];
  startedAt: number;
}

export class TransferReassembler {
  private partial = new Map<string, PartialTransfer>();

  constructor(private signatureFor: (header: FrameHeader) => bigint | undefined, private timeoutMs = 2000) {}

  push(frame: CanFrame, now = Date.now()): Transfer | null {
    if (frame.data.length < 1) return null;
    const header = decodeFrameId(frame.id);
    const tail = frame.data[frame.data.length - 1]!;
    const sot = (tail & 0x80) !== 0;
    const eot = (tail & 0x40) !== 0;
    const toggle = (tail >> 5) & 1;
    const transferId = tail & 0x1f;
    const body = frame.data.subarray(0, frame.data.length - 1);
    const key = `${frame.id}`;

    if (sot && eot) {
      this.partial.delete(key);
      return { header, transferId, payload: body.slice() };
    }

    if (sot) {
      if (toggle !== 0) return null;
      this.partial.set(key, { transferId, toggle: 1, bytes: Array.from(body), startedAt: now });
      return null;
    }

    const p = this.partial.get(key);
    if (!p || p.transferId !== transferId || p.toggle !== toggle || now - p.startedAt > this.timeoutMs) {
      if (p && now - p.startedAt > this.timeoutMs) this.partial.delete(key);
      return null;
    }
    p.bytes.push(...body);
    p.toggle ^= 1;
    if (!eot) return null;

    this.partial.delete(key);
    if (p.bytes.length < 2) return null;
    const signature = this.signatureFor(header);
    const payload = Uint8Array.from(p.bytes.slice(2));
    if (signature === undefined) return null;
    const crc = p.bytes[0]! | (p.bytes[1]! << 8);
    if (transferCrc(signature, payload) !== crc) return null;
    return { header, transferId, payload };
  }
}
