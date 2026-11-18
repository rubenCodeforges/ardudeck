import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchMapCommand, isSameSpot } from './map-command-types';
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

// PX4 DO_REPOSITION ignores the COMMAND_INT frame and reads z as AMSL. A
// home-relative altitude passed through unconverted once flew the vehicle
// into the ground (50m rel at a 47m-MSL field = 3m AGL commanded). Pin the
// conversion: PX4 gets home-AMSL + rel and frame 5; ArduPilot keeps rel + 6.
describe('dispatchMapCommand goto altitude frames (firmware-aware)', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    const { useTelemetryStore } = await import('../../stores/telemetry-store');
    // Vehicle at 147m MSL, 100m above home => home sits at 47m AMSL.
    useTelemetryStore.setState({
      position: { lat: 42, lon: 19, alt: 147, relativeAlt: 100, vx: 0, vy: 0, vz: 0 },
    });
  });

  it('PX4: converts relative altitude to AMSL and sends frame 5', async () => {
    const api = installApi();
    await dispatchMapCommand(
      { type: 'goto', lat: 42.44, lon: 19.26, alt: 50, frame: 'relative' },
      { firmware: 'px4' },
    );
    expect(api.mavlinkGoto).toHaveBeenCalledWith(42.44, 19.26, 97, 5);
  });

  it('PX4: passes AMSL altitude through unchanged', async () => {
    const api = installApi();
    await dispatchMapCommand(
      { type: 'goto', lat: 42.44, lon: 19.26, alt: 120, frame: 'asl' },
      { firmware: 'px4' },
    );
    expect(api.mavlinkGoto).toHaveBeenCalledWith(42.44, 19.26, 120, 5);
  });

  it('ArduPilot: keeps relative altitude with frame 6', async () => {
    const api = installApi();
    await dispatchMapCommand(
      { type: 'goto', lat: 42.44, lon: 19.26, alt: 50, frame: 'relative' },
      { firmware: 'ardupilot' },
    );
    expect(api.mavlinkGoto).toHaveBeenCalledWith(42.44, 19.26, 50, 6);
  });
});

describe('isSameSpot (#166)', () => {
  it('matches the autopilot echo of a sent target within a few metres', () => {
    expect(isSameSpot({ lat: 42.1, lon: 19.1 }, { lat: 42.10002, lon: 19.10002 })).toBe(true);
  });

  it('does not match a target elsewhere', () => {
    expect(isSameSpot({ lat: 42.1, lon: 19.1 }, { lat: 42.1003, lon: 19.1 })).toBe(false);
  });
});
