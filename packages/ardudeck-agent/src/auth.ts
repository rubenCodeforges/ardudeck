// auth.ts
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function loadOrCreateToken(tokenPath: string): string {
  const dir = path.dirname(tokenPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (fs.existsSync(tokenPath)) {
    const existing = fs.readFileSync(tokenPath, 'utf-8').trim();
    if (existing.length === 64) return existing;
  }

  const token = generateToken();
  fs.writeFileSync(tokenPath, token, { mode: 0o600 });
  return token;
}

export function validateToken(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
