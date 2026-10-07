/**
 * Re-derives the SITL frame string -> FRAME_CLASS/FRAME_TYPE mapping from first
 * principles and checks it against the hand-written table.
 *
 * Inputs are ArduPilot's own data on both sides:
 *  - motor angles + spin from libraries/SITL/SIM_Frame.cpp (transcribed below),
 *  - the mixer's roll/pitch factors from shared/ap-motor-layouts.json, which is a
 *    dump of the AP_Motors library test.
 *
 * If ArduPilot ever renumbers a layout, this fails loudly instead of letting the
 * simulated airframe drift out of agreement with the mixer, which is unflyable
 * and looks exactly like a tuning problem.
 */
import { describe, it, expect } from 'vitest';
import layouts from './ap-motor-layouts.json';
import { resolveCopterFrame, sitlFrameForMotorCount, FRAME_CLASS, FRAME_TYPE } from '@ardudeck/sitl';

/** SIM_Frame.cpp motor tables: [angle_deg, spin] in MOT_1..MOT_N order. */
const SIM_FRAME_MOTORS: Record<string, Array<[number, 'CW' | 'CCW']>> = {
  quad: [[90, 'CCW'], [-90, 'CCW'], [0, 'CW'], [180, 'CW']],
  x: [[45, 'CCW'], [-135, 'CCW'], [-45, 'CW'], [135, 'CW']],
  hexa: [[0, 'CW'], [180, 'CCW'], [-120, 'CW'], [60, 'CCW'], [-60, 'CCW'], [120, 'CW']],
  hexax: [[90, 'CW'], [-90, 'CCW'], [-30, 'CW'], [150, 'CCW'], [30, 'CCW'], [-150, 'CW']],
  octa: [
    [0, 'CW'], [180, 'CW'], [45, 'CCW'], [135, 'CCW'],
    [-45, 'CCW'], [-135, 'CCW'], [-90, 'CW'], [90, 'CW'],
  ],
};

interface Layout {
  Class: number;
  ClassName: string;
  Type: number;
  TypeName: string;
  motors: Array<{ Number: number; Rotation: string; Roll: number; Pitch: number }>;
}

/**
 * AP_MotorsMatrix::add_motor stores roll = cos(angle + 90) = -sin(angle) and
 * pitch = cos(angle), then normalise_rpy_factors() scales EACH axis independently
 * so its largest magnitude is 0.5.
 */
function mixerFactors(table: Array<[number, 'CW' | 'CCW']>) {
  const raw = table.map(([a]) => ({
    roll: -Math.sin((a * Math.PI) / 180),
    pitch: Math.cos((a * Math.PI) / 180),
  }));
  const peakRoll = Math.max(...raw.map((f) => Math.abs(f.roll)));
  const peakPitch = Math.max(...raw.map((f) => Math.abs(f.pitch)));
  return raw.map((f, i) => ({
    roll: peakRoll > 0 ? (f.roll / peakRoll) * 0.5 : 0,
    pitch: peakPitch > 0 ? (f.pitch / peakPitch) * 0.5 : 0,
    rot: table[i]![1],
  }));
}

function findLayouts(table: Array<[number, 'CW' | 'CCW']>): Layout[] {
  const want = mixerFactors(table);
  const near = (a: number, b: number) => Math.abs(a - b) < 0.02;
  return (layouts as { layouts: Layout[] }).layouts.filter(
    (L) =>
      L.motors.length === want.length &&
      L.motors.every(
        (m, i) =>
          near(m.Roll, want[i]!.roll) &&
          near(m.Pitch, want[i]!.pitch) &&
          m.Rotation === want[i]!.rot,
      ),
  );
}

describe('SITL physics frame is paired with a matching mixer', () => {
  it.each(Object.keys(SIM_FRAME_MOTORS))('%s resolves to the class/type its motor table implies', (model) => {
    const matches = findLayouts(SIM_FRAME_MOTORS[model]!);
    expect(matches.length, `no AP_Motors layout matches SITL frame "${model}"`).toBeGreaterThan(0);

    const resolved = resolveCopterFrame(model);
    // At least one matching layout must agree with our table. (Quad X also
    // matches Quad V, which shares the angles and differs only in yaw factor
    // magnitude, so we accept any exact roll/pitch/spin match.)
    expect(
      matches.some((m) => m.Class === resolved.frameClass && m.Type === resolved.frameType),
      `SITL "${model}" physics is ${matches.map((m) => `${m.ClassName}/${m.TypeName}`).join(' or ')}, ` +
        `but our table says class ${resolved.frameClass} type ${resolved.frameType}`,
    ).toBe(true);
  });

  it('pairs the default copter model the same way ArduPilot copter.parm does', () => {
    // Upstream Tools/autotest/default_params/copter.parm: FRAME_CLASS 1, FRAME_TYPE 0.
    const q = resolveCopterFrame('quad');
    expect(q.frameClass).toBe(FRAME_CLASS.QUAD);
    expect(q.frameType).toBe(FRAME_TYPE.PLUS);
  });

  it('treats quad, copter and + as the same Plus airframe', () => {
    for (const alias of ['quad', 'copter', '+']) {
      expect(resolveCopterFrame(alias)).toEqual({
        frameClass: FRAME_CLASS.QUAD,
        frameType: FRAME_TYPE.PLUS,
      });
    }
  });

  it('never claims a frame type it has not verified', () => {
    // Non-matrix / unverified frames must leave FRAME_TYPE alone rather than guess.
    for (const model of ['heli', 'tri', 'coax', 'singlecopter', 'y6', 'octaquad']) {
      expect(resolveCopterFrame(model).frameType).toBeUndefined();
    }
  });

  it('falls back to quad plus for an unknown model', () => {
    expect(resolveCopterFrame('no-such-frame')).toEqual({
      frameClass: FRAME_CLASS.QUAD,
      frameType: FRAME_TYPE.PLUS,
    });
    expect(resolveCopterFrame(undefined).frameType).toBe(FRAME_TYPE.PLUS);
  });

  it('custom-frame motor counts pick a frame whose verified type is Plus', () => {
    // The custom-frame launch path picks its physics frame by motor count, so
    // each one must resolve to a Plus layout for FRAME_TYPE 0 to be correct.
    for (const [motors, expected] of [[4, 'quad'], [6, 'hexa'], [8, 'octa']] as const) {
      expect(sitlFrameForMotorCount(motors)).toBe(expected);
      expect(resolveCopterFrame(expected).frameType).toBe(FRAME_TYPE.PLUS);
    }
  });

  it('an octa mixed as X against octa Plus physics is a real mismatch', () => {
    // Guards the actual regression: this pairing crashed a 573-waypoint survey.
    const octa = findLayouts(SIM_FRAME_MOTORS.octa!);
    expect(octa.every((m) => m.Type !== FRAME_TYPE.X)).toBe(true);
    expect(resolveCopterFrame('octa').frameType).not.toBe(FRAME_TYPE.X);
  });
});
