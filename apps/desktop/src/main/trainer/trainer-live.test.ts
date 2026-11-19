import { describe, expect, it } from 'vitest';
import { parseTrainerLive, TRAINER_LIVE_STALE_MS } from './trainer-live';

const NOW = Date.parse('2026-11-18T09:12:05Z');
const alive = (): boolean => true;

function file(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    pid: 4242,
    trainerVersion: '1.2.3',
    updatedAt: '2026-11-18T09:12:03Z',
    fcOwner: 'trainer',
    sitl: { state: 'running', vehicle: 'copter', mavlink: { transport: 'tcp', host: '127.0.0.1', port: 5760 } },
    physicsPort: 9002,
    region: 'sutomore',
    handover: { supported: false },
    ...over,
  };
}

describe('parseTrainerLive', () => {
  it('reads a fresh announcement', () => {
    expect(parseTrainerLive(file(), NOW, alive)).toEqual({
      pid: 4242,
      trainerVersion: '1.2.3',
      vehicle: 'copter',
      region: 'sutomore',
      host: '127.0.0.1',
      port: 5760,
      handoverSupported: false,
    });
  });

  it('ignores a file a crashed Trainer left behind', () => {
    expect(parseTrainerLive(file(), NOW, () => false)).toBeNull();
    const stale = new Date(NOW - TRAINER_LIVE_STALE_MS - 1).toISOString();
    expect(parseTrainerLive(file({ updatedAt: stale }), NOW, alive)).toBeNull();
  });

  it('refuses an endpoint off this machine', () => {
    const sitl = { state: 'running', mavlink: { transport: 'tcp', host: '10.0.0.5', port: 5760 } };
    expect(parseTrainerLive(file({ sitl }), NOW, alive)).toBeNull();
  });

  it('refuses unknown versions, transports and bad ports', () => {
    expect(parseTrainerLive(file({ version: 2 }), NOW, alive)).toBeNull();
    const udp = { state: 'running', mavlink: { transport: 'udp', host: '127.0.0.1', port: 14550 } };
    expect(parseTrainerLive(file({ sitl: udp }), NOW, alive)).toBeNull();
    const badPort = { state: 'running', mavlink: { transport: 'tcp', host: '127.0.0.1', port: 70000 } };
    expect(parseTrainerLive(file({ sitl: badPort }), NOW, alive)).toBeNull();
    expect(parseTrainerLive(null, NOW, alive)).toBeNull();
  });

  it('treats a stopped SITL as no Trainer to connect to', () => {
    const stopped = { state: 'stopped', mavlink: { transport: 'tcp', host: '127.0.0.1', port: 5760 } };
    expect(parseTrainerLive(file({ sitl: stopped }), NOW, alive)).toBeNull();
  });
});
