/**
 * MAVLink v2 Packet Signing
 * SHA256-based authentication for MAVLink packets
 * Reference: MavlinkParse.cs lines 329-383
 *
 * Note: Full signing implementation requires async crypto.
 * Use serializeV2Async for signed packets.
 */

import { MAVLINK_SIGNATURE_TIMESTAMP_EPOCH } from './constants.js';

/**
 * Get MAVLink signing timestamp (milliseconds since 2015-01-01)
 */
export function getSigningTimestamp(): bigint {
  return BigInt(Date.now() - MAVLINK_SIGNATURE_TIMESTAMP_EPOCH);
}

/**
 * Create signature block (placeholder for sync context)
 * For full signing, use createSignatureAsync
 *
 * @param secretKey - 32-byte secret key
 * @param packetData - Packet bytes (header + payload + CRC)
 * @param linkId - Link identifier (0-255)
 * @returns 13-byte signature block (timestamp only, no hash)
 */
export function createSignature(
  secretKey: Uint8Array,
  packetData: Uint8Array,
  linkId: number
): Uint8Array {
  // For sync context, return a placeholder signature with just timestamp
  // Full implementation requires async crypto
  const timestamp = getSigningTimestamp();
  const signatureBlock = new Uint8Array(13);

  // Link ID (1 byte)
  signatureBlock[0] = linkId & 0xff;

  // Timestamp (6 bytes, little-endian)
  signatureBlock[1] = Number(timestamp & 0xffn);
  signatureBlock[2] = Number((timestamp >> 8n) & 0xffn);
  signatureBlock[3] = Number((timestamp >> 16n) & 0xffn);
  signatureBlock[4] = Number((timestamp >> 24n) & 0xffn);
  signatureBlock[5] = Number((timestamp >> 32n) & 0xffn);
  signatureBlock[6] = Number((timestamp >> 40n) & 0xffn);

  // Signature placeholder (6 bytes) - will be zeros
  // Use createSignatureAsync for actual signing
  return signatureBlock;
}

/**
 * Create signature for a MAVLink packet (async version with real crypto)
 * Returns 13-byte signature block: linkId (1) + timestamp (6) + signature (6)
 *
 * @param secretKey - 32-byte secret key
 * @param packetData - Packet bytes (header + payload + CRC)
 * @param linkId - Link identifier (0-255)
 * @returns 13-byte signature block
 */
export async function createSignatureAsync(
  secretKey: Uint8Array,
  packetData: Uint8Array,
  linkId: number
): Promise<Uint8Array> {
  if (secretKey.length !== 32) {
    throw new Error('Signing key must be 32 bytes');
  }

  const timestamp = getSigningTimestamp();
  const signatureBlock = new Uint8Array(13);

  // Link ID (1 byte)
  signatureBlock[0] = linkId & 0xff;

  // Timestamp (6 bytes, little-endian)
  signatureBlock[1] = Number(timestamp & 0xffn);
  signatureBlock[2] = Number((timestamp >> 8n) & 0xffn);
  signatureBlock[3] = Number((timestamp >> 16n) & 0xffn);
  signatureBlock[4] = Number((timestamp >> 24n) & 0xffn);
  signatureBlock[5] = Number((timestamp >> 32n) & 0xffn);
  signatureBlock[6] = Number((timestamp >> 40n) & 0xffn);

  // Calculate SHA256(secret_key + header + payload + CRC + link_id + timestamp)
  const hashInput = new Uint8Array(
    secretKey.length + packetData.length + 7 // +7 for link_id + timestamp
  );
  hashInput.set(secretKey, 0);
  hashInput.set(packetData, secretKey.length);
  hashInput.set(signatureBlock.slice(0, 7), secretKey.length + packetData.length);

  // Use Web Crypto API for SHA256
  const hashBuffer = await crypto.subtle.digest('SHA-256', hashInput);
  const hashArray = new Uint8Array(hashBuffer);

  // Take first 6 bytes of hash as signature
  signatureBlock.set(hashArray.slice(0, 6), 7);

  return signatureBlock;
}

/**
 * Verify a signed packet
 *
 * @param secretKey - 32-byte secret key
 * @param packetData - Packet bytes (header + payload + CRC)
 * @param signature - 13-byte signature block from packet
 * @param allowOldTimestamps - Allow signatures with timestamps in the past
 * @param maxTimestampAge - Maximum age of timestamp in milliseconds (default: 60000)
 * @returns true if signature is valid
 */
export async function verifySignature(
  secretKey: Uint8Array,
  packetData: Uint8Array,
  signature: Uint8Array,
  allowOldTimestamps = false,
  maxTimestampAge = 60000
): Promise<boolean> {
  if (signature.length !== 13) {
    return false;
  }

  if (secretKey.length !== 32) {
    return false;
  }

  // Extract timestamp from signature
  const timestamp =
    BigInt(signature[1] ?? 0) |
    (BigInt(signature[2] ?? 0) << 8n) |
    (BigInt(signature[3] ?? 0) << 16n) |
    (BigInt(signature[4] ?? 0) << 24n) |
    (BigInt(signature[5] ?? 0) << 32n) |
    (BigInt(signature[6] ?? 0) << 40n);

  // Check timestamp freshness
  if (!allowOldTimestamps) {
    const currentTimestamp = getSigningTimestamp();
    const age = currentTimestamp - timestamp;
    if (age > BigInt(maxTimestampAge) || age < 0n) {
      return false;
    }
  }

  // Recalculate with matching timestamp
  const linkId = signature[0] ?? 0;
  const hashInput = new Uint8Array(
    secretKey.length + packetData.length + 7
  );
  hashInput.set(secretKey, 0);
  hashInput.set(packetData, secretKey.length);
  hashInput.set(signature.slice(0, 7), secretKey.length + packetData.length);

  const hashBuffer = await crypto.subtle.digest('SHA-256', hashInput);
  const hashArray = new Uint8Array(hashBuffer);

  // Compare signatures (constant-time comparison)
  let valid = true;
  for (let i = 0; i < 6; i++) {
    if (hashArray[i] !== signature[7 + i]) {
      valid = false;
    }
  }

  return valid;
}

/**
 * Generate a random 32-byte signing key
 */
export function generateSigningKey(): Uint8Array {
  const key = new Uint8Array(32);
  crypto.getRandomValues(key);
  return key;
}
