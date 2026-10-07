import { describe, it, expect, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadModuleMain } from '../module-loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, 'fixtures/test-module');

describe('loadModuleMain', () => {
  const noVehicle = {
    vehicle: {
      getGuidedState: () => ({ connected: false, sysid: null, armed: false, guided: false, vehicleClass: 'other' as const, ardupilot: false }),
      command: async () => ({ ok: false }),
      setpoint: async () => ({ ok: false }),
    },
    mavlink: { subscribe: () => () => {} },
    camera: { listStreams: async () => [] },
  };

  it('loads main entry and calls activate with host api', async () => {
    const logSpy = vi.fn();
    const host = {
      moduleSlug: 'test.fixture.minimal',
      dataDir: '/tmp/x',
      readData: async () => undefined,
      writeData: async () => {},
      secureRead: async () => undefined,
      secureWrite: async () => {},
      log: logSpy,
      emit: () => {},
      onRendererMessage: () => () => {},
      ...noVehicle,
    };
    const result = await loadModuleMain(FIXTURE, 'main.js', host);
    expect(logSpy).toHaveBeenCalledWith('info', 'activated', 'test.fixture.minimal');
    expect(result).toEqual({ activated: true });
  });

  it('throws if main file does not exist', async () => {
    const host = {
      moduleSlug: 'x',
      dataDir: '/tmp/x',
      readData: async () => undefined,
      writeData: async () => {},
      secureRead: async () => undefined,
      secureWrite: async () => {},
      log: () => {},
      emit: () => {},
      onRendererMessage: () => () => {},
      ...noVehicle,
    };
    await expect(loadModuleMain(FIXTURE, 'nope.js', host)).rejects.toThrow();
  });
});
