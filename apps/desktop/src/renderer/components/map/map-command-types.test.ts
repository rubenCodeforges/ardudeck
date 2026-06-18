import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchMapCommand } from './map-command-types';
import { encodePx4CustomMode } from '../../../shared/telemetry-types';

// Focused test for the firmware-aware `land` map command. PX4 ignores the
// ArduPilot COMMAND_LONG NAV_LAND and has no ArduDeck Lua script, so a PX4
// land must route through a mode change to AUTO.LAND (main=4, sub=6) via the
// generic mavlinkSetMode IPC. ArduPilot keeps its native mavlinkLand path.

function installApi() {
  const api = {
    mavlinkSetMode: vi.fn(async () => true),
    mavlinkLand: vi.fn(async () => true),
    mavlinkUserCommand: vi.fn(async () => true),
    mavlinkGoto: vi.fn(async () => true),
    mavlinkOrbit: vi.fn(async () => true),
  };
  (globalThis as unknown as { window: { electronAPI: typeof api } }).window = {
    electronAPI: api,
  };
  return api;
}

describe('dispatchMapCommand land (firmware-aware)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('PX4: lands via AUTO.LAND mode change, never native NAV_LAND', async () => {
    const api = installApi();
    const result = await dispatchMapCommand(
      { type: 'land', lat: 1, lon: 2 },
      { firmware: 'px4' },
    );
    expect(api.mavlinkSetMode).toHaveBeenCalledWith(encodePx4CustomMode(4, 6));
    expect(api.mavlinkLand).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, path: 'native' });
  });

  it('ArduPilot: lands via native NAV_LAND, never a mode change', async () => {
    const api = installApi();
    const result = await dispatchMapCommand(
      { type: 'land', lat: 1, lon: 2 },
      { firmware: 'ardupilot' },
    );
    expect(api.mavlinkLand).toHaveBeenCalledWith(1, 2);
    expect(api.mavlinkSetMode).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true, path: 'native' });
  });

  it('undefined firmware (offline): keeps the ArduPilot native land path', async () => {
    const api = installApi();
    await dispatchMapCommand({ type: 'land', lat: 3, lon: 4 }, {});
    expect(api.mavlinkLand).toHaveBeenCalledWith(3, 4);
    expect(api.mavlinkSetMode).not.toHaveBeenCalled();
  });
});
