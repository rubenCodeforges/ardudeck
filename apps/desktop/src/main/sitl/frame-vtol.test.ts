import { describe, it, expect } from 'vitest';
import { isVtolFrame } from './frame-config';

/**
 * A VTOL's lift rotors are mixed by Q_FRAME_CLASS / Q_FRAME_TYPE, and SITL
 * keeps its EEPROM between runs. Misclassify a frame here and either the
 * mixer is left stale from the previous frame (it flips on takeoff) or a
 * plain plane gets quad parameters it has no motors for.
 */
describe('isVtolFrame', () => {
  it('recognises quadplanes and their variants', () => {
    expect(isVtolFrame('quadplane', 'plane')).toBe(true);
    expect(isVtolFrame('quadplane-tilthvec', 'plane')).toBe(true);
    expect(isVtolFrame('firefly', 'plane')).toBe(true);
  });

  it('recognises tailsitters', () => {
    expect(isVtolFrame('plane-tailsitter', 'plane')).toBe(true);
    expect(isVtolFrame('copter_tailsitter', 'plane')).toBe(true);
  });

  it('leaves a plain plane alone', () => {
    expect(isVtolFrame('plane', 'plane')).toBe(false);
    expect(isVtolFrame('plane-jsbsim', 'plane')).toBe(false);
  });

  it('is never true for other vehicle types', () => {
    expect(isVtolFrame('quad', 'copter')).toBe(false);
    expect(isVtolFrame('rover', 'rover')).toBe(false);
  });
});
