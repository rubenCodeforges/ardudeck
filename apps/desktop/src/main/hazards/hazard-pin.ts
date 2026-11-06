import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { MIN_PIN_LENGTH, type HazardPin } from '../../shared/hazard-types';

const KEY_LEN = 32;
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function hashPin(pin: string): HazardPin {
  const salt = randomBytes(16);
  return { salt: salt.toString('base64'), hash: scryptSync(pin, salt, KEY_LEN, SCRYPT).toString('base64') };
}

export function verifyPin(pin: string, stored: HazardPin): boolean {
  const expected = Buffer.from(stored.hash, 'base64');
  const actual = scryptSync(pin, Buffer.from(stored.salt, 'base64'), KEY_LEN, SCRYPT);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const isAcceptablePin = (pin: unknown): pin is string => typeof pin === 'string' && pin.length >= MIN_PIN_LENGTH;
