import { describe, expect, it } from 'vitest';
import { paramModelFor, simModelFor } from './ardupilot-sitl-process';
import { resolveCopterFrame } from '@ardudeck/sitl';
import type { ArduPilotSitlConfig } from '../../shared/ipc-channels';

/**
 * Which airframe this vehicle actually is.
 *
 * The bug: the frame reported to a borrower came from `simModelFor`, which answers
 * `JSON:127.0.0.1` whenever ArduDeck's own engine is driving. That resolves to the quad
 * fallback, so a 60 kg custom OCTA was reported as a QUAD while its frame file said eight
 * motors. The borrower then built four motor mounts for an eight-motor aircraft and it spun up
 * uncontrollably on the first take-off.
 */

const OCTA: ArduPilotSitlConfig = {
  vehicleType: 'copter',
  useArduDeckSim: true,
  customFramePath: '/frames/heavy_industrial_octa_14s.json',
  customFrameMotors: 8,
} as unknown as ArduPilotSitlConfig;

describe('the model the parameters are written for', () => {
  it('is the custom frame layout, not the JSON physics address', () => {
    // The trap in one line: this is what used to be asked.
    expect(simModelFor(OCTA)).toBe('JSON:127.0.0.1');
    expect(paramModelFor(OCTA)).toBe('octa');
  });

  it('resolves an eight-motor custom frame to FRAME_CLASS 3, never 1', () => {
    const { frameClass, frameType } = resolveCopterFrame(paramModelFor(OCTA));
    expect(frameClass).toBe(3);
    expect(frameType).toBe(0);

    // What the broken path produced, kept as the thing that must not come back.
    expect(resolveCopterFrame(simModelFor(OCTA)).frameClass).toBe(1);
  });

  it('follows the motor count for six and four as well', () => {
    const hexa = { ...OCTA, customFrameMotors: 6 };
    const quad = { ...OCTA, customFrameMotors: 4 };
    expect(resolveCopterFrame(paramModelFor(hexa)).frameClass).toBe(2);
    expect(resolveCopterFrame(paramModelFor(quad)).frameClass).toBe(1);
  });

  it('ignores the model dropdown while a custom frame is active', () => {
    // Someone activates an octa custom frame, then nudges the dropdown to "quad". The physics
    // are still the octa, so the mixer has to be too.
    const nudged = { ...OCTA, model: 'quad' } as ArduPilotSitlConfig;
    expect(paramModelFor(nudged)).toBe('octa');
  });

  it('falls back to the dropdown when there is no custom frame', () => {
    const stock = {
      vehicleType: 'copter',
      useArduDeckSim: true,
      model: 'hexa',
    } as unknown as ArduPilotSitlConfig;
    expect(paramModelFor(stock)).toBe('hexa');
  });
});
