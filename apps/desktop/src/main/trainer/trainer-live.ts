// Any local process can write this file, so only a loopback endpoint is ever accepted.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { TrainerLive } from '../../shared/trainer-types.js';

export const TRAINER_LIVE_FILE = 'trainer-live.json';

/** Five missed refreshes. */
export const TRAINER_LIVE_STALE_MS = 10_000;

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1']);

export function trainerLivePath(homeDir: string): string {
  return join(homeDir, '.ardudeck', TRAINER_LIVE_FILE);
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: it exists, it is just not ours to signal.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function parseTrainerLive(
  raw: unknown,
  now: number,
  isAlive: (pid: number) => boolean,
): TrainerLive | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1) return null;

  const pid = r.pid;
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return null;

  const updatedAt = typeof r.updatedAt === 'string' ? Date.parse(r.updatedAt) : NaN;
  if (!Number.isFinite(updatedAt) || now - updatedAt > TRAINER_LIVE_STALE_MS) return null;

  const sitl = r.sitl as Record<string, unknown> | undefined;
  if (!sitl || sitl.state === 'stopped') return null;
  const mavlink = sitl.mavlink as Record<string, unknown> | undefined;
  if (!mavlink || mavlink.transport !== 'tcp') return null;
  const host = mavlink.host;
  const port = mavlink.port;
  if (typeof host !== 'string' || !LOOPBACK.has(host)) return null;
  if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) return null;

  if (!isAlive(pid)) return null;

  const handover = r.handover as Record<string, unknown> | undefined;
  return {
    pid,
    trainerVersion: typeof r.trainerVersion === 'string' ? r.trainerVersion : null,
    vehicle: typeof sitl.vehicle === 'string' ? sitl.vehicle : null,
    region: typeof r.region === 'string' ? r.region : null,
    host: host === 'localhost' ? '127.0.0.1' : host,
    port,
    handoverSupported: handover?.supported === true,
  };
}

export async function readTrainerLive(homeDir: string): Promise<TrainerLive | null> {
  let text: string;
  try {
    text = await readFile(trainerLivePath(homeDir), 'utf8');
  } catch {
    return null;
  }
  try {
    return parseTrainerLive(JSON.parse(text), Date.now(), isPidAlive);
  } catch {
    return null;
  }
}
