/**
 * Tests for MAVLink stream parser robustness.
 *
 * Covers the ELRS ghost-vehicle bug: a stray 0xFE (v1 STX) byte landing just
 * before a real v2 packet used to be parsed as a fake v1 HEARTBEAT (sysid 253
 * = the real packet's 0xFD start byte), and validation failures used to
 * consume the impostor frame's whole claimed length, swallowing the real
 * packets inside it. With messages registered, CRC validation kills the fakes
 * and failed candidates resync one byte at a time so embedded real packets
 * survive.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MAVLinkParser } from './mavlink-parser.js';
import { serializeV2, resetSequence } from './mavlink-serializer.js';
import { crcCalculateWithExtra } from './crc.js';
import type { MessageInfo, MAVLinkPacket } from './types.js';

const HEARTBEAT_INFO: MessageInfo = {
  msgid: 0,
  name: 'HEARTBEAT',
  crcExtra: 50,
  minLength: 9,
  maxLength: 9,
  serialize: () => new Uint8Array(),
  deserialize: () => ({}),
};

const ATTITUDE_INFO: MessageInfo = {
  msgid: 30,
  name: 'ATTITUDE',
  crcExtra: 39,
  minLength: 28,
  maxLength: 28,
  serialize: () => new Uint8Array(),
  deserialize: () => ({}),
};

// custom_mode(4)=0, type=10 (rover), autopilot=3 (ArduPilot), base_mode=81,
// system_status=4, mavlink_version=3
const HEARTBEAT_PAYLOAD = new Uint8Array([0, 0, 0, 0, 10, 3, 81, 4, 3]);

function makeHeartbeat(sysid = 1, compid = 1): Uint8Array {
  return serializeV2(0, HEARTBEAT_PAYLOAD, 50, { sysid, compid });
}

function drain(parser: MAVLinkParser): MAVLinkPacket[] {
  const out: MAVLinkPacket[] = [];
  let pkt;
  while ((pkt = parser.parseNext()) !== null) out.push(pkt);
  return out;
}

describe('MAVLinkParser stream robustness', () => {
  let parser: MAVLinkParser;

  beforeEach(() => {
    resetSequence();
    parser = new MAVLinkParser();
    parser.registerMessages([HEARTBEAT_INFO, ATTITUDE_INFO]);
  });

  it('parses a clean v2 heartbeat', () => {
    parser.feed(makeHeartbeat());
    const packets = drain(parser);
    expect(packets).toHaveLength(1);
    expect(packets[0]!.msgid).toBe(0);
    expect(packets[0]!.sysid).toBe(1);
  });

  it('does not fabricate a ghost heartbeat from a stray v1 STX before a real packet', () => {
    // The ELRS scenario: [0xFE, 0x09, seq] immediately followed by a real v2
    // packet. Read as a v1 frame this decodes msgid 0 with sysid 0xFD (253),
    // which used to become a phantom vehicle. CRC must reject it and the real
    // heartbeat must still come through.
    const real = makeHeartbeat(1, 1);
    const stream = new Uint8Array(3 + real.length);
    stream.set([0xfe, 0x09, 0x00], 0);
    stream.set(real, 3);

    parser.feed(stream);
    const packets = drain(parser);
    expect(packets).toHaveLength(1);
    expect(packets[0]!.sysid).toBe(1);
    expect(packets.some((p) => p.sysid === 253)).toBe(false);
  });

  it('resyncs one byte at a time so a real packet inside a bogus frame survives', () => {
    // A false 0xFD start claiming a 30-byte HEARTBEAT payload (bad length),
    // with the real heartbeat sitting inside the claimed span. The old parser
    // consumed the full claimed length and destroyed the real packet.
    const real = makeHeartbeat(1, 1);
    const stream = new Uint8Array(10 + real.length + 11);
    stream.set([0xfd, 30, 0, 0, 0, 99, 99, 0, 0, 0], 0);
    stream.set(real, 10);
    // trailing junk (no STX bytes) fills out the impostor's claimed length
    stream.fill(0x11, 10 + real.length);

    parser.feed(stream);
    const packets = drain(parser);
    expect(packets).toHaveLength(1);
    expect(packets[0]!.msgid).toBe(0);
    expect(packets[0]!.sysid).toBe(1);
  });

  it('drops a registered packet with corrupted CRC and recovers on the next one', () => {
    const bad = makeHeartbeat(1, 1);
    bad[12] ^= 0xff; // flip a payload byte, CRC no longer matches
    parser.feed(bad);
    parser.feed(makeHeartbeat(1, 1));
    const packets = drain(parser);
    expect(packets).toHaveLength(1);
    expect(parser.getStats().badCRC).toBeGreaterThanOrEqual(1);
  });

  it('accepts a v2 payload with trailing zeros trimmed', () => {
    // ATTITUDE (28 bytes nominal) with the last 4 zero bytes trimmed to 24,
    // as MAVLink v2 senders do on the wire.
    const payload = new Uint8Array(24).fill(0x22);
    const frame = new Uint8Array(12 + 24);
    frame.set([0xfd, 24, 0, 0, 7, 1, 1, 30, 0, 0], 0);
    frame.set(payload, 10);
    const crc = crcCalculateWithExtra(frame, 10 + 24, 39);
    frame[34] = crc & 0xff;
    frame[35] = (crc >> 8) & 0xff;

    parser.feed(frame);
    const packets = drain(parser);
    expect(packets).toHaveLength(1);
    expect(packets[0]!.msgid).toBe(30);
    expect(packets[0]!.payloadLength).toBe(24);
  });

  it('still queues unknown message ids without CRC validation', () => {
    const frame = serializeV2(60000, new Uint8Array([1, 2, 3]), 0, { sysid: 1, compid: 1 });
    parser.feed(frame);
    const packets = drain(parser);
    expect(packets).toHaveLength(1);
    expect(packets[0]!.msgid).toBe(60000);
    expect(parser.getStats().unknownMessage).toBe(1);
  });

  it('marks a registered packet whose CRC checked out as validated', () => {
    parser.feed(makeHeartbeat());
    expect(drain(parser)[0]!.crcValidated).toBe(true);
  });

  it('marks an unknown message id as not validated, since its CRC cannot be checked', () => {
    parser.feed(serializeV2(60000, new Uint8Array([1, 2, 3]), 0, { sysid: 1, compid: 1 }));
    expect(drain(parser)[0]!.crcValidated).toBe(false);
  });

  it('does not vouch for a "signed" flag on a frame it could not validate', () => {
    // Non-MAVLink bytes that happen to frame as v2 with the signed bit set: the flag is
    // whatever the byte was, and must not be read as the vehicle requiring signing.
    const unsigned = serializeV2(60000, new Uint8Array([1, 2, 3]), 0, { sysid: 227, compid: 110 });
    const frame = new Uint8Array(unsigned.length + 13);
    frame.set(unsigned);
    frame[2] = frame[2]! | 0x01;
    parser.feed(frame);
    const [packet] = drain(parser);
    expect(packet!.isSigned).toBe(true);
    expect(packet!.crcValidated).toBe(false);
  });
});

describe('MAVLinkParser v2 payload truncation', () => {
  it('zero-pads a truncated payload so every field decodes (INAV PARAM_VALUE)', async () => {
    const { getMessageInfo } = await import('../generated/message-registry.js');
    const { deserializeParamValue } = await import('../generated/messages/param-value.js');
    const info = getMessageInfo(22)!;
    const parser = new MAVLinkParser();
    parser.registerMessages([info]);

    // value 1.5, count 10, index 3, id "AB"; the zero tail of the id and param_type is trimmed on the wire
    const wire = new Uint8Array(10);
    const v = new DataView(wire.buffer);
    v.setFloat32(0, 1.5, true);
    v.setUint16(4, 10, true);
    v.setUint16(6, 3, true);
    wire[8] = 0x41;
    wire[9] = 0x42;
    parser.feed(serializeV2(22, wire, info.crcExtra, { sysid: 1, compid: 1 }));

    const pkt = parser.parseNext()!;
    expect(pkt.payloadLength).toBe(10);
    expect(pkt.payload.length).toBe(info.maxLength);
    const param = deserializeParamValue(pkt.payload);
    expect(param.paramValue).toBe(1.5);
    expect(param.paramIndex).toBe(3);
    expect(param.paramId).toBe('AB');
    expect(param.paramType).toBe(0);
  });
});
