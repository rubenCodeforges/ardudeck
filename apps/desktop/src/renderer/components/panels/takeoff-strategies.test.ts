import { describe, it, expect, vi } from 'vitest';
import { executeTakeoff, type TakeoffContext } from './takeoff-strategies';
import {
  VEHICLE_CAPABILITIES,
  encodePx4CustomMode,
  type FlightState,
  type GpsData,
  type PositionData,
} from '../../../shared/telemetry-types';

// Focused test for the firmware-based strategy selection: a PX4 vehicle must
// take the standard-MAVLink PX4 path (arm + AUTO_TAKEOFF mode), never the
// ArduPilot copter strategy (which sends NAV_TAKEOFF via mavlinkTakeoff and
// switches through ArduPilot mode numbers).

function makeCtx(firmware: 'px4' | undefined) {
  // Mutable telemetry the mock IPC drives. GPS is ready up front so the
  // strategies move straight to arm/mode. Mode tracks the last commanded value
  // so switchMode's waitForState resolves on the first attempt.
  const flight: FlightState = { mode: 'X', modeNum: -1, armed: false, isFlying: false };
  const gps: GpsData = { fixType: 3, satellites: 12, hdop: 0.8, vdop: 1, lat: 0, lon: 0, alt: 0 };
  const position: PositionData = { lat: 0, lon: 0, alt: 0, relativeAlt: 0, vx: 0, vy: 0, vz: 0 };

  const api = {
    mavlinkSetMode: vi.fn(async (modeNum: number) => { flight.modeNum = modeNum; return true; }),
    mavlinkArmDisarm: vi.fn(async (arm: boolean) => { flight.armed = arm; return true; }),
    mavlinkTakeoff: vi.fn(async () => true),
    mavlinkVtolTakeoff: vi.fn(async () => true),
    setParameter: vi.fn(async () => undefined),
    sitlRcStart: vi.fn(async () => ({ success: true })),
    sitlRcSend: vi.fn(async () => undefined),
  };

  const ctx: TakeoffContext = {
    altitudeM: 12,
    forceArm: false,
    vehicleClass: 'copter',
    firmware,
    capabilities: VEHICLE_CAPABILITIES.copter,
    isSitl: false,
    getFlight: () => flight,
    getGps: () => gps,
    getPosition: () => position,
    getParam: () => undefined,
    api,
    setStatus: vi.fn(),
    // Synchronous immediate check: every state the mocks need is set before the
    // poll runs, so a single evaluation is enough.
    waitForState: async (check) => check(),
  };

  return { ctx, api, flight };
}

describe('executeTakeoff firmware gating', () => {
  it('PX4 takes the standard PX4 path, not the ArduPilot strategy', async () => {
    const { ctx, api } = makeCtx('px4');

    const result = await executeTakeoff(ctx);

    expect(result).toEqual({ ok: true });
    // Standard PX4 path: arm via generic 400, set MIS_TAKEOFF_ALT, AUTO_TAKEOFF.
    expect(api.mavlinkArmDisarm).toHaveBeenCalledWith(true, false);
    expect(api.setParameter).toHaveBeenCalledWith('MIS_TAKEOFF_ALT', 12, 9);
    expect(api.mavlinkSetMode).toHaveBeenCalledWith(encodePx4CustomMode(4, 2));
    // Must NOT touch the ArduPilot copter strategy.
    expect(api.mavlinkTakeoff).not.toHaveBeenCalled();
    expect(api.mavlinkVtolTakeoff).not.toHaveBeenCalled();
  });

  it('non-PX4 copter keeps the ArduPilot NAV_TAKEOFF strategy', async () => {
    const { ctx, api } = makeCtx(undefined);

    const result = await executeTakeoff(ctx);

    expect(result).toEqual({ ok: true });
    // ArduPilot copter: NAV_TAKEOFF via mavlinkTakeoff, no PX4 takeoff-alt param.
    expect(api.mavlinkTakeoff).toHaveBeenCalledWith(12);
    expect(api.setParameter).not.toHaveBeenCalled();
  });
});
