/**
 * Tests for MAVLink Packet Serialization with Signing
 *
 * Covers the fix from issue #13 (Add MAVLink signing):
 * - serializeV2() now produces packets with valid SHA256 signatures
 * - serializeV2Async() delegates to serializeV2 (identical output)
 * - Signed packets have the MAVLINK_IFLAG_SIGNED flag and 13-byte signature
 * - Unsigned packets are unaffected
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  serializeV2,
  serializeV2Async,
  serializeV1,
  resetSequence,
  getNextSequence,
} from './mavlink-serializer.js';
import { verifySignature, createSignature } from './signing.js';
import {
  MAVLINK_STX_V2,
  MAVLINK_IFLAG_SIGNED,
  MAVLINK_SIGNATURE_BLOCK_LEN,
} from './constants.js';

/** Helper: build a deterministic 32-byte key from a passphrase. */
function passphraseToKey(passphrase: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(passphrase).digest());
}

const TEST_MSG_ID = 0x100; // example 24-bit message ID
const TEST_CRC_EXTRA = 42;
const TEST_KEY = passphraseToKey('123456789Test');

beforeEach(() => {
  resetSequence(0);
});

// ---------------------------------------------------------------------------
// Unsigned packets (baseline - should be unchanged by fix)
// ---------------------------------------------------------------------------
describe('serializeV2 (unsigned)', () => {
  it('starts with 0xFD (MAVLink v2 STX)', () => {
    const pkt = serializeV2(TEST_MSG_ID, new Uint8Array([1, 2, 3]), TEST_CRC_EXTRA);
    expect(pkt[0]).toBe(MAVLINK_STX_V2);
  });

  it('has incompat_flags = 0 when not signing', () => {
    const pkt = serializeV2(TEST_MSG_ID, new Uint8Array([1, 2, 3]), TEST_CRC_EXTRA);
    expect(pkt[2]).toBe(0);
  });

  it('has correct length: 10 header + payload + 2 CRC', () => {
    const payload = new Uint8Array([10, 20, 30]);
    const pkt = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA);
    expect(pkt.length).toBe(10 + 3 + 2);
  });

  it('trims trailing zeros from payload', () => {
    const payload = new Uint8Array([10, 20, 0, 0, 0]);
    const pkt = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA);
    // Payload length byte should be 2 (10, 20) after trimming trailing zeros
    expect(pkt[1]).toBe(2);
    expect(pkt.length).toBe(10 + 2 + 2);
  });

  it('encodes 24-bit message ID little-endian', () => {
    const pkt = serializeV2(0x030201, new Uint8Array([1]), TEST_CRC_EXTRA, {
      sequence: 0,
    });
    expect(pkt[7]).toBe(0x01);
    expect(pkt[8]).toBe(0x02);
    expect(pkt[9]).toBe(0x03);
  });

  it('respects sysid and compid options', () => {
    const pkt = serializeV2(0, new Uint8Array([1]), TEST_CRC_EXTRA, {
      sysid: 1,
      compid: 2,
    });
    expect(pkt[5]).toBe(1);
    expect(pkt[6]).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Signed packets (core of the fix)
// ---------------------------------------------------------------------------
describe('serializeV2 (signed)', () => {
  const payload = new Uint8Array([0xaa, 0xbb, 0xcc]);

  it('sets MAVLINK_IFLAG_SIGNED in incompat_flags', () => {
    const pkt = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: true,
      signingKey: TEST_KEY,
    });
    expect(pkt[2]).toBe(MAVLINK_IFLAG_SIGNED);
  });

  it('is 13 bytes longer than unsigned packet', () => {
    resetSequence(0);
    const unsigned = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA);
    resetSequence(0);
    const signed = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: true,
      signingKey: TEST_KEY,
      sequence: 0,
    });
    expect(signed.length).toBe(unsigned.length + MAVLINK_SIGNATURE_BLOCK_LEN);
  });

  it('trailing 13 bytes are the signature block', () => {
    const pkt = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: true,
      signingKey: TEST_KEY,
      linkId: 7,
    });
    const sigBlock = pkt.slice(pkt.length - 13);
    // First byte is linkId
    expect(sigBlock[0]).toBe(7);
    // Hash portion (bytes 7-12) must not be all zeros
    const hashBytes = sigBlock.slice(7, 13);
    expect(hashBytes.every((b) => b === 0)).toBe(false);
  });

  it('signature is verifiable with verifySignature', async () => {
    const pkt = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: true,
      signingKey: TEST_KEY,
      linkId: 0,
      sequence: 0,
    });
    const sigBlock = pkt.slice(pkt.length - 13);
    const packetDataForSig = pkt.slice(0, pkt.length - 13); // header+payload+CRC
    const valid = await verifySignature(TEST_KEY, packetDataForSig, sigBlock, true);
    expect(valid).toBe(true);
  });

  it('signature verification fails with wrong key', async () => {
    const pkt = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: true,
      signingKey: TEST_KEY,
    });
    const sigBlock = pkt.slice(pkt.length - 13);
    const packetDataForSig = pkt.slice(0, pkt.length - 13);
    const wrongKey = passphraseToKey('wrong');
    const valid = await verifySignature(wrongKey, packetDataForSig, sigBlock, true);
    expect(valid).toBe(false);
  });

  it('does not sign when sign=true but signingKey is undefined', () => {
    const pkt = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: true,
      // signingKey intentionally omitted
    });
    // No signature appended, incompat_flags should be 0
    expect(pkt[2]).toBe(0);
    expect(pkt.length).toBe(10 + 3 + 2); // same as unsigned
  });

  it('does not sign when sign=false even if key provided', () => {
    const pkt = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: false,
      signingKey: TEST_KEY,
    });
    expect(pkt[2]).toBe(0);
    expect(pkt.length).toBe(10 + 3 + 2);
  });

  it('handles different linkIds correctly', async () => {
    const pktA = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: true,
      signingKey: TEST_KEY,
      linkId: 0,
      sequence: 0,
    });
    resetSequence(0);
    const pktB = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: true,
      signingKey: TEST_KEY,
      linkId: 1,
      sequence: 0,
    });

    // Both should verify with their respective packet data
    const sigA = pktA.slice(pktA.length - 13);
    const sigB = pktB.slice(pktB.length - 13);
    expect(sigA[0]).toBe(0);
    expect(sigB[0]).toBe(1);

    const validA = await verifySignature(
      TEST_KEY,
      pktA.slice(0, pktA.length - 13),
      sigA,
      true
    );
    const validB = await verifySignature(
      TEST_KEY,
      pktB.slice(0, pktB.length - 13),
      sigB,
      true
    );
    expect(validA).toBe(true);
    expect(validB).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// serializeV2Async (delegates to serializeV2 after fix)
// ---------------------------------------------------------------------------
describe('serializeV2Async', () => {
  const payload = new Uint8Array([0xdd, 0xee]);

  it('returns a promise that resolves to a Uint8Array', async () => {
    const pkt = await serializeV2Async(TEST_MSG_ID, payload, TEST_CRC_EXTRA);
    expect(pkt).toBeInstanceOf(Uint8Array);
  });

  it('produces an unsigned packet identical to serializeV2', async () => {
    resetSequence(0);
    const sync = serializeV2(TEST_MSG_ID, payload, TEST_CRC_EXTRA, { sequence: 5 });
    resetSequence(0);
    const async_ = await serializeV2Async(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sequence: 5,
    });
    expect(async_).toEqual(sync);
  });

  it('produces a signed packet with valid signature', async () => {
    const pkt = await serializeV2Async(TEST_MSG_ID, payload, TEST_CRC_EXTRA, {
      sign: true,
      signingKey: TEST_KEY,
      sequence: 0,
    });
    expect(pkt[2]).toBe(MAVLINK_IFLAG_SIGNED);

    const sigBlock = pkt.slice(pkt.length - 13);
    const packetData = pkt.slice(0, pkt.length - 13);
    const valid = await verifySignature(TEST_KEY, packetData, sigBlock, true);
    expect(valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sequence counter
// ---------------------------------------------------------------------------
describe('sequence counter', () => {
  it('auto-increments across calls', () => {
    resetSequence(0);
    const pktA = serializeV2(0, new Uint8Array([1]), 0);
    const pktB = serializeV2(0, new Uint8Array([1]), 0);
    expect(pktA[4]).toBe(0);
    expect(pktB[4]).toBe(1);
  });

  it('wraps at 255', () => {
    resetSequence(255);
    const pkt255 = serializeV2(0, new Uint8Array([1]), 0);
    const pkt0 = serializeV2(0, new Uint8Array([1]), 0);
    expect(pkt255[4]).toBe(255);
    expect(pkt0[4]).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SETUP_SIGNING scenario (mirrors the ipc-handlers fix)
// ---------------------------------------------------------------------------
describe('SETUP_SIGNING packet scenario', () => {
  // Constants matching ipc-handlers.ts
  const SETUP_SIGNING_ID = 256;
  const SETUP_SIGNING_CRC_EXTRA = 71;

  it('can serialize an unsigned SETUP_SIGNING (send-to-FC path)', () => {
    const payload = new Uint8Array(42); // SETUP_SIGNING has 42-byte payload
    // target_system, target_component, secretKey[32], initialTimestamp
    payload[0] = 1; // target_system
    payload[1] = 1; // target_component

    const pkt = serializeV2(SETUP_SIGNING_ID, payload, SETUP_SIGNING_CRC_EXTRA, {
      sysid: 255,
      compid: 190,
    });

    expect(pkt[0]).toBe(MAVLINK_STX_V2);
    expect(pkt[2]).toBe(0); // not signed
    expect(pkt[5]).toBe(255); // sysid
    expect(pkt[6]).toBe(190); // compid
  });

  it('can serialize a signed SETUP_SIGNING (remove-key path, the fix)', async () => {
    // This is the critical path: when removing a key from a signing-enabled FC,
    // the remove-key packet MUST be signed so the FC accepts it.
    const payload = new Uint8Array(42);
    payload[0] = 1; // target_system
    payload[1] = 1; // target_component
    // secretKey and timestamp stay zero (clearing the key on FC)

    const pkt = serializeV2(SETUP_SIGNING_ID, payload, SETUP_SIGNING_CRC_EXTRA, {
      sysid: 255,
      compid: 190,
      sign: true,
      signingKey: TEST_KEY,
      linkId: 0,
    });

    // Must have SIGNED flag
    expect(pkt[2]).toBe(MAVLINK_IFLAG_SIGNED);

    // Must have a valid signature that the FC can verify
    const sigBlock = pkt.slice(pkt.length - 13);
    const packetData = pkt.slice(0, pkt.length - 13);

    // Hash portion must not be zero (was zero before the fix)
    expect(sigBlock.slice(7, 13).every((b) => b === 0)).toBe(false);

    // Signature must verify with the same key
    const valid = await verifySignature(TEST_KEY, packetData, sigBlock, true);
    expect(valid).toBe(true);
  });

  it('unsigned remove-key would not verify with FC key', async () => {
    // Demonstrates why the fix was needed: an unsigned packet cannot be verified
    const payload = new Uint8Array(42);
    const pkt = serializeV2(SETUP_SIGNING_ID, payload, SETUP_SIGNING_CRC_EXTRA, {
      sysid: 255,
      compid: 190,
      // NOT signed - this is the old broken behavior
    });

    // No signature block at all
    expect(pkt[2]).toBe(0);
    // Packet is too short for any signature
    expect(pkt.length).toBeLessThan(10 + 1 + 2 + 13);
  });
});
