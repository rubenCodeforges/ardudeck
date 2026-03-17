// auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { generateToken, loadOrCreateToken, validateToken } from './auth';

const TEST_TOKEN_PATH = path.join(__dirname, '.test-token');

afterEach(() => {
  if (fs.existsSync(TEST_TOKEN_PATH)) fs.unlinkSync(TEST_TOKEN_PATH);
});

describe('auth', () => {
  it('generates a 64-char hex token', () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]+$/);
  });

  it('creates and persists token on first run', () => {
    const token = loadOrCreateToken(TEST_TOKEN_PATH);
    expect(token).toHaveLength(64);
    expect(fs.existsSync(TEST_TOKEN_PATH)).toBe(true);
  });

  it('returns same token on subsequent runs', () => {
    const token1 = loadOrCreateToken(TEST_TOKEN_PATH);
    const token2 = loadOrCreateToken(TEST_TOKEN_PATH);
    expect(token1).toBe(token2);
  });

  it('validates correct token', () => {
    const token = loadOrCreateToken(TEST_TOKEN_PATH);
    expect(validateToken(token, token)).toBe(true);
  });

  it('rejects incorrect token', () => {
    const token = loadOrCreateToken(TEST_TOKEN_PATH);
    expect(validateToken('wrong', token)).toBe(false);
  });

  it('rejects empty token', () => {
    const token = loadOrCreateToken(TEST_TOKEN_PATH);
    expect(validateToken('', token)).toBe(false);
  });
});
