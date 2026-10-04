import { describe, it, expect, beforeAll } from 'vitest';
import { MAVLinkParser } from '../core/mavlink-parser.js';
import { MESSAGE_REGISTRY, getAllMessageInfos } from '../generated/message-registry.js';
import {
  ARDUDECK_MESSAGES,
  deserializeArdudeckManifest,
  registerArduDeckDialect,
} from './ardudeck.js';

/**
 * Frames captured off the wire from a vehicle running the ArduDeck Vehicle SDK, which is
 * the C implementation of the same profile/ardudeck.xml this dialect is generated from.
 *
 * That is the point of hardcoding bytes rather than round-tripping through our own
 * serializer: a round trip only proves this file agrees with itself. These prove the
 * two independent implementations agree, which is the thing that actually breaks.
 */
const MANIFEST = new Uint8Array([
  0xfd, 0x3b, 0x00, 0x00, 0x62, 0x01, 0x01, 0xf8, 0xa7, 0x00, 0x27, 0x02, 0x00, 0x00, 0x01,
  0x00, 0x10, 0x00, 0x05, 0x00, 0x05, 0x04, 0x02, 0x03, 0x61, 0x63, 0x6d, 0x65, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x74,
  0x65, 0x73, 0x74, 0x20, 0x72, 0x6f, 0x76, 0x65, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x31, 0x2e, 0x30, 0x2e, 0x30, 0x8d, 0x7c,
]);

const MODE = new Uint8Array([
  0xfd, 0x09, 0x00, 0x00, 0x68, 0x01, 0x01, 0xf9, 0xa7, 0x00, 0x00, 0x00, 0x00, 0x04, 0x00,
  0x49, 0x64, 0x6c, 0x65, 0x44, 0xb6,
]);

const CAL_DECLARE = new Uint8Array([
  0xfd, 0x60, 0x00, 0x00, 0x6c, 0x01, 0x01, 0xfd, 0xa7, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00,
  0x02, 0x63, 0x6f, 0x6d, 0x70, 0x61, 0x73, 0x73, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x43, 0x6f, 0x6d, 0x70, 0x61, 0x73, 0x73, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x54, 0x75, 0x72, 0x6e,
  0x20, 0x74, 0x68, 0x65, 0x20, 0x76, 0x65, 0x68, 0x69, 0x63, 0x6c, 0x65, 0x20, 0x74, 0x68,
  0x72, 0x6f, 0x75, 0x67, 0x68, 0x20, 0x74, 0x77, 0x6f, 0x20, 0x66, 0x75, 0x6c, 0x6c, 0x20,
  0x63, 0x69, 0x72, 0x63, 0x6c, 0x65, 0x73, 0x20, 0x62, 0x79, 0x20, 0x68, 0x61, 0x6e, 0x64,
  0x2e, 0x1a, 0xaa,
]);

function parseOne(frame: Uint8Array) {
  const parser = new MAVLinkParser();
  parser.registerMessages(getAllMessageInfos());
  parser.feed(frame);
  const packet = parser.parseNext();
  expect(packet).not.toBeNull();
  expect(parser.getStats().badCRC).toBe(0);
  return packet!;
}

describe('ArduDeck dialect', () => {
  beforeAll(() => {
    registerArduDeckDialect();
  });

  it('registers every message in the profile', () => {
    expect(ARDUDECK_MESSAGES.length).toBe(12);
    for (const info of ARDUDECK_MESSAGES) {
      expect(MESSAGE_REGISTRY.get(info.msgid)?.name).toBe(info.name);
    }
  });

  it('never shadows a standard message', () => {
    // A dialect that replaced a common id would break every vehicle not using it.
    for (const info of ARDUDECK_MESSAGES) {
      expect(info.msgid).toBeGreaterThanOrEqual(43000);
    }
    expect(MESSAGE_REGISTRY.get(0)?.name).toBe('HEARTBEAT');
    expect(MESSAGE_REGISTRY.get(24)?.name).toBe('GPS_RAW_INT');
  });

  it('accepts the checksum on a real frame from the C implementation', () => {
    // A wrong CRC extra produces frames that are silently dropped, which is the exact
    // failure this generated-from-one-source design exists to prevent.
    const packet = parseOne(MANIFEST);
    expect(packet.msgid).toBe(43000);
  });

  it('decodes the manifest the C side actually sent', () => {
    const packet = parseOne(MANIFEST);
    const m = deserializeArdudeckManifest(packet.payload);

    expect(m.vendor).toBe('acme');
    expect(m.model).toBe('test rover');
    expect(m.firmware).toBe('1.0.0');
    expect(m.profileVersion).toBe(1);
    expect(m.missionCapacity).toBe(16);
    expect(m.paramCount).toBe(5);
    expect(m.frame).toBe(5); // AD_FRAME_ROVER
    expect(m.modeCount).toBe(4);
    expect(m.missionCmdCount).toBe(2);
    expect(m.calCount).toBe(3);
    // PARAMS | MISSION | COMMANDS | CALIBRATION | MISSION_READ
    expect(m.features).toBe(0x227);
  });

  it('decodes a named flight mode', () => {
    const packet = parseOne(MODE);
    const info = MESSAGE_REGISTRY.get(43001)!;
    const m = info.deserialize(packet.payload) as { modeId: number; name: string; count: number };
    expect(m.modeId).toBe(0);
    expect(m.name).toBe('Idle');
    expect(m.count).toBe(4);
  });

  it('decodes a calibration declaration', () => {
    const packet = parseOne(CAL_DECLARE);
    const info = MESSAGE_REGISTRY.get(43005)!;
    const c = info.deserialize(packet.payload) as {
      calId: string; name: string; kind: number; trackCount: number; warning: string;
    };
    expect(c.calId).toBe('compass');
    expect(c.name).toBe('Compass');
    expect(c.kind).toBe(1); // AD_CAL_COVERAGE
    expect(c.trackCount).toBe(2);
    expect(c.warning).toBe('Turn the vehicle through two full circles by hand.');
  });

  it('zero-pads a truncated payload rather than throwing', () => {
    // Every one of these frames is shorter than the declared length, because v2 trims
    // trailing zeros. A decoder that reads at fixed offsets has to pad first.
    const packet = parseOne(MANIFEST);
    expect(packet.payloadLength).toBeLessThan(94);
    expect(packet.payload.length).toBe(94);
    expect(() => deserializeArdudeckManifest(packet.payload)).not.toThrow();
  });

  it('is idempotent', () => {
    const before = MESSAGE_REGISTRY.size;
    registerArduDeckDialect();
    expect(MESSAGE_REGISTRY.size).toBe(before);
  });
});
