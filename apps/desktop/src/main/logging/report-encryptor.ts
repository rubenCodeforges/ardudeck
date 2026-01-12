/**
 * Report Encryptor
 *
 * Implements hybrid encryption for .deckreport files:
 * - AES-256-GCM for payload encryption (fast, secure)
 * - RSA-OAEP for key encryption (asymmetric, only dev team can decrypt)
 *
 * File format:
 * - Header (128 bytes, plaintext): magic, version, timestamp, app version hash, reserved
 * - Encrypted AES key (256 bytes for RSA-2048)
 * - IV (12 bytes)
 * - Encrypted payload (variable length)
 * - Auth tag (16 bytes)
 */

import crypto from 'crypto';
import { writeFileSync } from 'fs';
import { PUBLIC_KEY, PUBLIC_KEY_VERSION, IS_PLACEHOLDER_KEY } from './public-key.js';
import type { ReportPayload } from './report-generator.js';

// Constants
const MAGIC = 'DECKREPORT'; // 10 bytes
const FORMAT_VERSION = 1;
const HEADER_SIZE = 128;
const RSA_KEY_SIZE = 256; // 2048-bit RSA = 256 bytes encrypted key
const IV_SIZE = 12;
const AUTH_TAG_SIZE = 16;

// File header structure
interface DeckreportHeader {
  magic: string; // 10 bytes
  version: number; // 2 bytes (uint16)
  timestamp: bigint; // 8 bytes (uint64, milliseconds)
  appVersionHash: Buffer; // 32 bytes (SHA-256)
  keyVersion: bigint; // 8 bytes (uint64, timestamp-based version)
  reserved: Buffer; // 68 bytes
}

/**
 * Create the file header
 */
function createHeader(appVersion: string): Buffer {
  const header = Buffer.alloc(HEADER_SIZE);
  let offset = 0;

  // Magic (10 bytes)
  header.write(MAGIC, offset, 'ascii');
  offset += 10;

  // Version (2 bytes, big-endian)
  header.writeUInt16BE(FORMAT_VERSION, offset);
  offset += 2;

  // Timestamp (8 bytes, big-endian)
  header.writeBigUInt64BE(BigInt(Date.now()), offset);
  offset += 8;

  // App version hash (32 bytes)
  const versionHash = crypto.createHash('sha256').update(appVersion).digest();
  versionHash.copy(header, offset);
  offset += 32;

  // Key version (8 bytes) - timestamp-based version for key matching
  header.writeBigUInt64BE(BigInt(PUBLIC_KEY_VERSION), offset);
  offset += 8;

  // Reserved (68 bytes) - already zero-filled

  return header;
}

/**
 * Parse a header from a buffer
 */
export function parseHeader(buffer: Buffer): DeckreportHeader | null {
  if (buffer.length < HEADER_SIZE) return null;

  let offset = 0;

  const magic = buffer.toString('ascii', offset, offset + 10);
  offset += 10;
  if (magic !== MAGIC) return null;

  const version = buffer.readUInt16BE(offset);
  offset += 2;

  const timestamp = buffer.readBigUInt64BE(offset);
  offset += 8;

  const appVersionHash = buffer.subarray(offset, offset + 32);
  offset += 32;

  const keyVersion = buffer.readBigUInt64BE(offset);
  offset += 8;

  const reserved = buffer.subarray(offset, offset + 68);

  return {
    magic,
    version,
    timestamp,
    appVersionHash,
    keyVersion,
    reserved,
  };
}

/**
 * Encrypt a report payload and create a .deckreport file
 */
export function encryptReport(payload: ReportPayload): Buffer {
  // Serialize payload to JSON
  const payloadJson = JSON.stringify(payload);
  const payloadBuffer = Buffer.from(payloadJson, 'utf-8');

  // Generate random AES-256 key
  const aesKey = crypto.randomBytes(32);

  // Generate random IV
  const iv = crypto.randomBytes(IV_SIZE);

  // Encrypt payload with AES-256-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  const encryptedPayload = Buffer.concat([cipher.update(payloadBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Encrypt AES key with RSA public key
  const encryptedKey = crypto.publicEncrypt(
    {
      key: PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    aesKey
  );

  // Create header
  const header = createHeader(payload.system_info.app_version);

  // Assemble final file
  // Header (128) + Encrypted Key (256) + IV (12) + Encrypted Payload + Auth Tag (16)
  const totalSize = HEADER_SIZE + RSA_KEY_SIZE + IV_SIZE + encryptedPayload.length + AUTH_TAG_SIZE;
  const result = Buffer.alloc(totalSize);
  let offset = 0;

  // Write header
  header.copy(result, offset);
  offset += HEADER_SIZE;

  // Write encrypted AES key
  encryptedKey.copy(result, offset);
  offset += RSA_KEY_SIZE;

  // Write IV
  iv.copy(result, offset);
  offset += IV_SIZE;

  // Write encrypted payload
  encryptedPayload.copy(result, offset);
  offset += encryptedPayload.length;

  // Write auth tag
  authTag.copy(result, offset);

  return result;
}

/**
 * Save encrypted report to file
 */
export function saveEncryptedReport(payload: ReportPayload, filePath: string): void {
  const encrypted = encryptReport(payload);
  writeFileSync(filePath, encrypted);
}

/**
 * Get info about the encryption configuration
 */
export function getEncryptionInfo(): {
  isPlaceholderKey: boolean;
  keyVersion: number;
  formatVersion: number;
} {
  return {
    isPlaceholderKey: IS_PLACEHOLDER_KEY,
    keyVersion: PUBLIC_KEY_VERSION,
    formatVersion: FORMAT_VERSION,
  };
}

/**
 * Decrypt a report (for testing only - requires private key)
 * This function is NOT used in production ArduDeck - only in DeckReport app
 */
export function decryptReport(encrypted: Buffer, privateKey: string): ReportPayload | null {
  try {
    // Parse header
    const header = parseHeader(encrypted);
    if (!header) {
      throw new Error('Invalid file format');
    }

    let offset = HEADER_SIZE;

    // Extract encrypted AES key
    const encryptedKey = encrypted.subarray(offset, offset + RSA_KEY_SIZE);
    offset += RSA_KEY_SIZE;

    // Extract IV
    const iv = encrypted.subarray(offset, offset + IV_SIZE);
    offset += IV_SIZE;

    // Extract encrypted payload and auth tag
    const encryptedPayload = encrypted.subarray(offset, encrypted.length - AUTH_TAG_SIZE);
    const authTag = encrypted.subarray(encrypted.length - AUTH_TAG_SIZE);

    // Decrypt AES key with RSA private key
    const aesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      encryptedKey
    );

    // Decrypt payload with AES-256-GCM
    const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
    decipher.setAuthTag(authTag);
    const decryptedPayload = Buffer.concat([decipher.update(encryptedPayload), decipher.final()]);

    // Parse JSON
    const payload: ReportPayload = JSON.parse(decryptedPayload.toString('utf-8'));
    return payload;
  } catch (err) {
    console.error('[ReportEncryptor] Decryption failed:', err);
    return null;
  }
}
