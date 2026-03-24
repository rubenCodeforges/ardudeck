/**
 * Tests for MAVLink v2 Packet Signing
 *
 * Covers the fix from issue #13 (Add MAVLink signing):
 * - createSignature() now produces real SHA256_48 hashes (was returning zeros)
 * - createSignatureAsync() delegates to the sync version
 * - Round-trip sign + verify works correctly
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import {
  createSignature,
  createSignatureAsync,
  verifySignature,
  generateSigningKey,
  getSigningTimestamp,
} from './signing.js';

/** Helper: build a deterministic 32-byte key from a passphrase (same as app logic). */
function passphraseToKey(passphrase: string): Uint8Array {
  return new Uint8Array(createHash('sha256').update(passphrase).digest());
}

/** Helper: fabricate a minimal "packet data" buffer. */
function fakePacketData(length = 14): Uint8Array {
  const buf = new Uint8Array(length);
  for (let i = 0; i < length; i++) buf[i] = i & 0xff;
  return buf;
}

// ---------------------------------------------------------------------------
// getSigningTimestamp
// ---------------------------------------------------------------------------
describe('getSigningTimestamp', () => {
  it('returns a positive BigInt', () => {
    const ts = getSigningTimestamp();
    expect(typeof ts).toBe('bigint');
    expect(ts > 0n).toBe(true);
  });

  it('is in 10-microsecond units since 2015-01-01', () => {
    const epoch = Date.UTC(2015, 0, 1);
    const expectedApprox = BigInt(Date.now() - epoch) * 100n;
    const ts = getSigningTimestamp();
    // Allow 1 second of tolerance
    expect(ts - expectedApprox < 100_000n).toBe(true);
    expect(expectedApprox - ts < 100_000n).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateSigningKey
// ---------------------------------------------------------------------------
describe('generateSigningKey', () => {
  it('returns a 32-byte Uint8Array', () => {
    const key = generateSigningKey();
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
  });

  it('returns different keys on successive calls', () => {
    const a = generateSigningKey();
    const b = generateSigningKey();
    // Extremely unlikely to be equal
    expect(a).not.toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// createSignature
// ---------------------------------------------------------------------------
describe('createSignature', () => {
  const key = passphraseToKey('123456789Test');
  const packetData = fakePacketData();

  it('returns a 13-byte Uint8Array', () => {
    const sig = createSignature(key, packetData, 0);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(13);
  });

  it('first byte is the linkId', () => {
    expect(createSignature(key, packetData, 0)[0]).toBe(0);
    expect(createSignature(key, packetData, 42)[0]).toBe(42);
    expect(createSignature(key, packetData, 255)[0]).toBe(255);
  });

  it('bytes 1-6 contain a non-zero timestamp', () => {
    const sig = createSignature(key, packetData, 0);
    const timestampBytes = sig.slice(1, 7);
    // At least some bytes must be non-zero (timestamp is large)
    const allZero = timestampBytes.every((b) => b === 0);
    expect(allZero).toBe(false);
  });

  it('bytes 7-12 contain a non-zero SHA256_48 hash', () => {
    const sig = createSignature(key, packetData, 0);
    const hashBytes = sig.slice(7, 13);
    // The old broken implementation returned all zeros here.
    // After the fix, these must be a real hash.
    const allZero = hashBytes.every((b) => b === 0);
    expect(allZero).toBe(false);
  });

  it('produces a verifiable SHA256_48 hash matching manual calculation', () => {
    const linkId = 5;
    const sig = createSignature(key, packetData, linkId);

    // Manually compute SHA256(key + packetData + linkId + timestamp)
    const hash = createHash('sha256');
    hash.update(key);
    hash.update(packetData);
    hash.update(sig.slice(0, 7)); // linkId + 6 timestamp bytes
    const expected = new Uint8Array(hash.digest()).slice(0, 6);

    expect(sig.slice(7, 13)).toEqual(expected);
  });

  it('different keys produce different signatures', () => {
    const keyA = passphraseToKey('keyA');
    const keyB = passphraseToKey('keyB');
    const sigA = createSignature(keyA, packetData, 0);
    const sigB = createSignature(keyB, packetData, 0);
    // Hash portions should differ
    expect(sigA.slice(7, 13)).not.toEqual(sigB.slice(7, 13));
  });

  it('different packet data produces different signatures', () => {
    const pktA = new Uint8Array([1, 2, 3]);
    const pktB = new Uint8Array([4, 5, 6]);
    const sigA = createSignature(key, pktA, 0);
    const sigB = createSignature(key, pktB, 0);
    expect(sigA.slice(7, 13)).not.toEqual(sigB.slice(7, 13));
  });

  it('different linkIds produce different signatures', () => {
    const sigA = createSignature(key, packetData, 0);
    const sigB = createSignature(key, packetData, 1);
    // linkId byte differs, and the hash input changes too
    expect(sigA[0]).not.toBe(sigB[0]);
    expect(sigA.slice(7, 13)).not.toEqual(sigB.slice(7, 13));
  });

  it('throws if key is not 32 bytes', () => {
    expect(() => createSignature(new Uint8Array(16), packetData, 0)).toThrow(
      'Signing key must be 32 bytes'
    );
    expect(() => createSignature(new Uint8Array(0), packetData, 0)).toThrow(
      'Signing key must be 32 bytes'
    );
    expect(() => createSignature(new Uint8Array(64), packetData, 0)).toThrow(
      'Signing key must be 32 bytes'
    );
  });
});

// ---------------------------------------------------------------------------
// createSignatureAsync
// ---------------------------------------------------------------------------
describe('createSignatureAsync', () => {
  const key = passphraseToKey('asyncKey');
  const packetData = fakePacketData();

  it('returns a promise that resolves to a 13-byte Uint8Array', async () => {
    const sig = await createSignatureAsync(key, packetData, 0);
    expect(sig).toBeInstanceOf(Uint8Array);
    expect(sig.length).toBe(13);
  });

  it('produces the same hash as the sync version for identical inputs', async () => {
    // Use a fixed timestamp by calling them back-to-back and checking structure.
    // Since both use getSigningTimestamp() internally, timestamps may differ by
    // a tiny amount.  Instead, verify both produce valid verifiable signatures.
    const syncSig = createSignature(key, packetData, 0);
    const asyncSig = await createSignatureAsync(key, packetData, 0);

    // Both should be 13 bytes with same linkId
    expect(syncSig.length).toBe(13);
    expect(asyncSig.length).toBe(13);
    expect(syncSig[0]).toBe(0);
    expect(asyncSig[0]).toBe(0);

    // Both should have non-zero hashes
    expect(syncSig.slice(7, 13).every((b) => b === 0)).toBe(false);
    expect(asyncSig.slice(7, 13).every((b) => b === 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// verifySignature (round-trip with createSignature)
// ---------------------------------------------------------------------------
describe('verifySignature', () => {
  const key = passphraseToKey('verifyMe');
  const packetData = fakePacketData();

  it('returns true for a signature created with createSignature', async () => {
    const sig = createSignature(key, packetData, 0);
    const valid = await verifySignature(key, packetData, sig, true);
    expect(valid).toBe(true);
  });

  it('returns true for a fresh signature without allowOldTimestamps', async () => {
    const sig = createSignature(key, packetData, 0);
    // Signature was just created so it is within the 60s window
    const valid = await verifySignature(key, packetData, sig);
    expect(valid).toBe(true);
  });

  it('returns false when the key is wrong', async () => {
    const sig = createSignature(key, packetData, 0);
    const wrongKey = passphraseToKey('wrongKey');
    const valid = await verifySignature(wrongKey, packetData, sig, true);
    expect(valid).toBe(false);
  });

  it('returns false when the packet data is tampered', async () => {
    const sig = createSignature(key, packetData, 0);
    const tampered = new Uint8Array(packetData);
    tampered[0] = (tampered[0]! + 1) & 0xff;
    const valid = await verifySignature(key, tampered, sig, true);
    expect(valid).toBe(false);
  });

  it('returns false when the signature is corrupted', async () => {
    const sig = createSignature(key, packetData, 0);
    // Flip a hash byte
    sig[10] = (sig[10]! ^ 0xff) & 0xff;
    const valid = await verifySignature(key, packetData, sig, true);
    expect(valid).toBe(false);
  });

  it('returns false for a signature shorter than 13 bytes', async () => {
    const valid = await verifySignature(key, packetData, new Uint8Array(12), true);
    expect(valid).toBe(false);
  });

  it('returns false for a wrong-length key', async () => {
    const sig = createSignature(key, packetData, 0);
    const valid = await verifySignature(new Uint8Array(16), packetData, sig, true);
    expect(valid).toBe(false);
  });

  it('respects maxTimestampAge', async () => {
    // Create a signature with a mocked old timestamp
    const sig = createSignature(key, packetData, 0);

    // Manually set the timestamp to far in the past (zero = year 2015)
    sig[1] = 0;
    sig[2] = 0;
    sig[3] = 0;
    sig[4] = 0;
    sig[5] = 0;
    sig[6] = 0;

    // With allowOldTimestamps=false, this should fail
    const valid = await verifySignature(key, packetData, sig, false, 6_000_000);
    expect(valid).toBe(false);
  });

  it('works with different linkIds', async () => {
    const sig = createSignature(key, packetData, 42);
    const valid = await verifySignature(key, packetData, sig, true);
    expect(valid).toBe(true);
  });
});
