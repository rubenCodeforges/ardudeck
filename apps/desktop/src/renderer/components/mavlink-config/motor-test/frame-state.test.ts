import { describe, expect, it } from 'vitest';
import { boardValue, frameState, getFrameClassType, heliBuildWithMultirotorFrame } from './motor-layout-utils';

type P = { value: number; originalValue?: number; isModified?: boolean };
const getter = (m: Record<string, P>) => (k: string) => m[k];

describe('motor test frame vs the board (#163)', () => {
  it('a staged frame edit is not what the board runs', () => {
    const params = { FRAME_CLASS: { value: 1, originalValue: 0, isModified: true }, FRAME_TYPE: { value: 1, originalValue: 1, isModified: false } };
    expect(frameState(getter(params))).toBe('unwritten');
    expect(getFrameClassType((k) => boardValue(getter(params)(k)))).toEqual({ frameClass: 0, frameType: 1 });
  });

  it('an Undefined class on the board blocks the test', () => {
    expect(frameState(getter({ FRAME_CLASS: { value: 0 }, FRAME_TYPE: { value: 1 } }))).toBe('undefined');
  });

  it('a written quad X is fine', () => {
    expect(frameState(getter({ FRAME_CLASS: { value: 1 }, FRAME_TYPE: { value: 1 } }))).toBe('ok');
  });

  it('QuadPlane uses the Q_ frame', () => {
    expect(frameState(getter({ Q_FRAME_CLASS: { value: 1, originalValue: 0, isModified: true }, Q_FRAME_TYPE: { value: 1 } }))).toBe('unwritten');
    expect(frameState(getter({}))).toBe('ok');
  });
});

describe('heli build with a multirotor frame', () => {
  const g = (m: Record<string, number>) => (k: string) => (k in m ? { value: m[k]! } : undefined);
  it('flags Quad on the heli build', () => {
    expect(heliBuildWithMultirotorFrame(g({ H_RSC_MODE: 1, FRAME_CLASS: 1 }))).toBe(true);
  });
  it('leaves heli frames, the multirotor build and an unset class alone', () => {
    expect(heliBuildWithMultirotorFrame(g({ H_RSC_MODE: 1, FRAME_CLASS: 6 }))).toBe(false);
    expect(heliBuildWithMultirotorFrame(g({ H_RSC_MODE: 1, FRAME_CLASS: 0 }))).toBe(false);
    expect(heliBuildWithMultirotorFrame(g({ FRAME_CLASS: 1 }))).toBe(false);
  });
});
