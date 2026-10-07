import { describe, it, expect } from 'vitest';
import { flightStack, rcFunctionsFor, INAV_MAVLINK_RC } from './flight-stack';

const mav = { isConnected: true, protocol: 'mavlink' };

describe('flightStack', () => {
  it('trusts ArduPilot and PX4 heartbeats', () => {
    expect(flightStack({ ...mav, firmware: 'ardupilot' }, 'inav')).toBe('ardupilot');
    expect(flightStack({ ...mav, firmware: 'px4' }, 'ardupilot')).toBe('px4');
  });

  it('takes INAV from an empty parameter reply, even when it poses as ArduPilot', () => {
    expect(flightStack({ ...mav, firmware: 'custom', paramsUnsupported: true }, 'ardupilot')).toBe('inav');
  });

  it('lets the planner toggle name a generic autopilot', () => {
    expect(flightStack({ ...mav, firmware: 'custom' }, 'inav')).toBe('inav');
    expect(flightStack({ ...mav, firmware: 'custom' }, 'ardupilot')).toBe('generic');
  });

  it('reads INAV over MSP from the variant', () => {
    expect(flightStack({ isConnected: true, protocol: 'msp', fcVariant: 'INAV' }, 'ardupilot')).toBe('inav');
  });
});

describe('rcFunctionsFor', () => {
  it('puts yaw on 3 and throttle on 4 for INAV (its RC_CHANNELS are ROLL, PITCH, YAW, THROTTLE)', () => {
    expect(rcFunctionsFor(new Map(), 'inav')).toEqual(INAV_MAVLINK_RC);
    expect(INAV_MAVLINK_RC).toMatchObject({ yaw: 3, throttle: 4 });
  });

  it('follows RCMAP on ArduPilot, defaulting to AETR', () => {
    expect(rcFunctionsFor(new Map(), 'ardupilot')).toEqual({ roll: 1, pitch: 2, throttle: 3, yaw: 4 });
    const params = new Map([['RCMAP_THROTTLE', { value: 2 }], ['RCMAP_PITCH', { value: 3 }]]);
    expect(rcFunctionsFor(params, 'ardupilot')).toEqual({ roll: 1, pitch: 3, throttle: 2, yaw: 4 });
  });
});
