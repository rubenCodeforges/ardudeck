/**
 * Offline Ed25519 license key + bundle signature verification.
 * Embeds the Hangar public key so no file system dependency is needed.
 */

import { verify, createPublicKey, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { LicensePayload, ReceiptPayload } from '../../shared/module-types.js';
import { t } from '../../shared/i18n/index.js';

/**
 * Ed25519 public key in SPKI PEM format - the production Hangar signing key.
 * Rotating it invalidates every issued license.
 */
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA+JX7ieaqUzi1WMTzPrWb3vAeUJOj8cbmFaYuZT5rnZ0=
-----END PUBLIC KEY-----`;

let cachedPublicKey: ReturnType<typeof createPublicKey> | null = null;

function getPublicKey() {
  if (!cachedPublicKey) {
    cachedPublicKey = createPublicKey(PUBLIC_KEY_PEM);
  }
  return cachedPublicKey;
}

/**
 * Verify a license key's Ed25519 signature and decode the payload.
 * Format: ARDUDECK.{base64url(payload)}.{base64url(signature)}
 * (dot separator: base64url alphabet contains `-` and `_` so they cannot split the key)
 */
/**
 * Whether a string even looks like a key, without touching crypto. A free
 * cargo can be installed with no key on record, and that is not a broken key,
 * it is a different install path.
 */
export function isLicenseKeyShaped(key: string | null | undefined): boolean {
  if (!key) return false;
  const parts = key.split('.');
  return parts.length === 3 && parts[0] === 'ARDUDECK' && !!parts[1] && !!parts[2];
}

export function verifyLicenseKey(
  key: string,
): { valid: boolean; payload?: LicensePayload; error?: string } {
  const parts = key.split('.');
  if (parts.length !== 3 || parts[0] !== 'ARDUDECK') {
    return { valid: false, error: t('main:licenseValidator.invalidKeyFormat') };
  }

  const payloadB64 = parts[1]!;
  const sigB64 = parts[2]!;

  try {
    const publicKey = getPublicKey();
    const signature = Buffer.from(sigB64, 'base64url');
    const isValid = verify(null, Buffer.from(payloadB64, 'utf-8'), publicKey, signature);

    if (!isValid) {
      return { valid: false, error: t('main:licenseValidator.invalidSignature') };
    }

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as LicensePayload;

    // Check expiration if present
    if (payload.expiresAt) {
      const expiresAt = new Date(payload.expiresAt);
      if (expiresAt < new Date()) {
        return { valid: false, payload, error: t('main:licenseValidator.licenseExpired') };
      }
    }

    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: t('main:licenseValidator.verificationFailed', { error: String(err) }) };
  }
}

/**
 * Verify the Ed25519 signature of a downloaded module bundle (ZIP).
 * The signature signs the SHA256 hash of the file.
 */
export function verifyBundleSignature(
  bundlePath: string,
  signature: string,
): boolean {
  try {
    const publicKey = getPublicKey();
    const bundleData = readFileSync(bundlePath);
    const hash = createHash('sha256').update(bundleData).digest();
    const sigBuf = Buffer.from(signature, 'base64url');
    return verify(null, hash, publicKey, sigBuf);
  } catch {
    return false;
  }
}

const RECEIPT_PREFIX = 'ADRCPT';

export function verifyReceipt(
  receipt: string,
  deviceId: string,
  opts: { now?: Date; publicKeyPem?: string } = {},
): { valid: boolean; payload?: ReceiptPayload; error?: string } {
  const now = opts.now ?? new Date();
  const publicKey = opts.publicKeyPem ? createPublicKey(opts.publicKeyPem) : getPublicKey();
  const parts = receipt.split('.');
  if (parts.length !== 3 || parts[0] !== RECEIPT_PREFIX) {
    return { valid: false, error: 'Not a receipt' }; // i18n-exempt
  }
  const payloadB64 = parts[1]!;
  const sigB64 = parts[2]!;

  try {
    const ok = verify(
      null,
      Buffer.from(`receipt.v1.${payloadB64}`, 'utf-8'),
      publicKey,
      Buffer.from(sigB64, 'base64url'),
    );
    if (!ok) return { valid: false, error: 'Invalid signature' }; // i18n-exempt

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8'),
    ) as ReceiptPayload;

    if (payload.v !== 1) return { valid: false, payload, error: 'Unsupported receipt version' }; // i18n-exempt
    if (!Array.isArray(payload.slugs)) return { valid: false, payload, error: 'No slugs' }; // i18n-exempt
    if (payload.deviceId !== deviceId) {
      return { valid: false, payload, error: 'Receipt belongs to another device' }; // i18n-exempt
    }
    if (payload.expiresAt && new Date(payload.expiresAt) < now) {
      return { valid: false, payload, error: 'Receipt has expired' }; // i18n-exempt
    }
    return { valid: true, payload };
  } catch (err) {
    return { valid: false, error: `Verification failed: ${err}` };
  }
}
