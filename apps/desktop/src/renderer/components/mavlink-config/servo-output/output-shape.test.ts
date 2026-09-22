import { describe, it, expect } from 'vitest';
import { classifyOutput, travelFromEndpoints, isTravelEditable } from './output-shape';

describe('classifyOutput', () => {
  it('knows the control surfaces by name', () => {
    for (const name of ['GroundSteering', 'Aileron', 'Elevator', 'Rudder', 'ElevonLeft', 'VTailRight', 'Mount1Yaw', 'Mount2Pitch', 'TiltMotorLeft', 'SailMastRotation']) {
      expect(classifyOutput({ functionName: name })).toEqual({ shape: 'angular', confident: true });
    }
  });

  it('knows the non-proportional outputs by name', () => {
    for (const name of ['NeoPixel1', 'ProfiLED2', 'Alarm', 'GPIO', 'Winch Clutch', 'Mount1Retract', 'CameraTrigger', 'Parachute', 'LandingGear']) {
      expect(classifyOutput({ functionName: name })).toEqual({ shape: 'discrete', confident: true });
    }
  });

  it('name wins over endpoints', () => {
    // A centred NeoPixel is still not a proportional output.
    const r = classifyOutput({ functionName: 'NeoPixel1', min: 1100, trim: 1500, max: 1900 });
    expect(r.shape).toBe('discrete');
  });

  it("infers a rover's reversible throttle as bidirectional from centred trim", () => {
    const r = classifyOutput({ functionName: 'Throttle', min: 1100, trim: 1500, max: 1900 });
    expect(r).toEqual({ shape: 'bipolar', confident: false });
  });

  it("infers a plane's throttle as unidirectional from trim at the floor", () => {
    const r = classifyOutput({ functionName: 'Throttle', min: 1100, trim: 1100, max: 1900 });
    expect(r).toEqual({ shape: 'unidirectional', confident: false });
  });

  it('falls back to the always-safe bar for an unknown function with no endpoints', () => {
    expect(classifyOutput({ functionName: 'SomeFutureThing' })).toEqual({
      shape: 'unidirectional',
      confident: false,
    });
  });

  it('classifies a function it has never heard of from its endpoints', () => {
    expect(classifyOutput({ functionName: 'Script7', min: 1000, trim: 1500, max: 2000 }).shape).toBe('bipolar');
    expect(classifyOutput({ functionName: 'Script7', min: 1000, trim: 1000, max: 2000 }).shape).toBe('unidirectional');
  });

  it('survives missing and degenerate endpoints', () => {
    expect(classifyOutput({}).shape).toBe('unidirectional');
    expect(classifyOutput({ min: 1500, trim: 1500, max: 1500 }).shape).toBe('unidirectional');
    expect(classifyOutput({ min: NaN, trim: 1500, max: 1900 }).shape).toBe('unidirectional');
  });
});

describe('travelFromEndpoints', () => {
  it('uses the shorter side of an uneven pair', () => {
    expect(travelFromEndpoints(1300, 1500, 1900)).toBe(200);
    expect(travelFromEndpoints(1100, 1500, 1600)).toBe(100);
  });

  it('never returns negative travel', () => {
    expect(travelFromEndpoints(1600, 1500, 1900)).toBe(0);
  });
});

describe('motor outputs', () => {
  it('classifies mixer-driven motors as their own shape', () => {
    for (const name of ['Motor1', 'Motor4', 'Motor12']) {
      expect(classifyOutput({ functionName: name })).toEqual({ shape: 'motor', confident: true });
    }
  });

  it('does not mistake a centred motor for a steerable output', () => {
    expect(classifyOutput({ functionName: 'Motor1', min: 1100, trim: 1500, max: 1900 }).shape).toBe('motor');
  });

  it('only offers travel editing on bidirectional outputs', () => {
    expect(isTravelEditable('angular')).toBe(true);
    expect(isTravelEditable('bipolar')).toBe(true);
    expect(isTravelEditable('motor')).toBe(false);
    expect(isTravelEditable('discrete')).toBe(false);
    expect(isTravelEditable('unidirectional')).toBe(false);
  });
});
