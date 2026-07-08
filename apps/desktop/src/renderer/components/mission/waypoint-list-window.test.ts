import { describe, it, expect } from 'vitest';
import { MAV_CMD } from '../../../shared/mission-types';
import {
  computeRenderableIndices,
  isChildCommand,
  renderableIndexOfSeq,
} from './waypoint-list-window';

const WP = MAV_CMD.NAV_WAYPOINT;
const SPEED = MAV_CMD.DO_CHANGE_SPEED;
const YAW = MAV_CMD.CONDITION_YAW;
const DELAY = MAV_CMD.NAV_DELAY;

function items(...commands: number[]) {
  return commands.map((command, seq) => ({ seq, command }));
}

describe('isChildCommand', () => {
  it('treats nav commands as parents', () => {
    expect(isChildCommand(WP)).toBe(false);
    expect(isChildCommand(MAV_CMD.NAV_TAKEOFF)).toBe(false);
  });

  it('treats DO_/CONDITION_ commands as children', () => {
    expect(isChildCommand(SPEED)).toBe(true);
    expect(isChildCommand(YAW)).toBe(true);
  });

  it('treats NAV_DELAY as a child despite being in the nav range', () => {
    expect(isChildCommand(DELAY)).toBe(true);
  });
});

describe('computeRenderableIndices', () => {
  it('renders everything when nothing is collapsed', () => {
    const list = items(WP, SPEED, WP, YAW, WP);
    expect(computeRenderableIndices(list, new Set())).toEqual([0, 1, 2, 3, 4]);
  });

  it('hides only the children of a collapsed parent', () => {
    // seq0=WP(parent) seq1,2=children seq3=WP(parent) seq4=child
    const list = items(WP, SPEED, YAW, WP, SPEED);
    expect(computeRenderableIndices(list, new Set([0]))).toEqual([0, 3, 4]);
    expect(computeRenderableIndices(list, new Set([3]))).toEqual([0, 1, 2, 3]);
    expect(computeRenderableIndices(list, new Set([0, 3]))).toEqual([0, 3]);
  });

  it('always renders children that appear before any parent', () => {
    const list = items(SPEED, YAW, WP, SPEED);
    expect(computeRenderableIndices(list, new Set([2]))).toEqual([0, 1, 2]);
  });

  it('ignores collapsed seqs that are not parents in the list', () => {
    const list = items(WP, SPEED);
    expect(computeRenderableIndices(list, new Set([99]))).toEqual([0, 1]);
  });

  it('handles an empty mission', () => {
    expect(computeRenderableIndices([], new Set([0]))).toEqual([]);
  });

  it('windows a large collapsed survey down to its parents', () => {
    // 1 parent followed by 999 children, repeated 20 times
    const cmds: number[] = [];
    for (let g = 0; g < 20; g++) {
      cmds.push(WP);
      for (let c = 0; c < 999; c++) cmds.push(SPEED);
    }
    const list = items(...cmds);
    const collapsed = new Set(list.filter((i) => i.command === WP).map((i) => i.seq));
    expect(computeRenderableIndices(list, collapsed)).toHaveLength(20);
  });
});

describe('renderableIndexOfSeq', () => {
  const list = items(WP, SPEED, YAW, WP, SPEED);

  it('maps a seq to its position in the renderable window list', () => {
    const renderable = computeRenderableIndices(list, new Set([0]));
    expect(renderableIndexOfSeq(list, renderable, 0)).toBe(0);
    expect(renderableIndexOfSeq(list, renderable, 3)).toBe(1);
    expect(renderableIndexOfSeq(list, renderable, 4)).toBe(2);
  });

  it('returns -1 for a child hidden by collapse', () => {
    const renderable = computeRenderableIndices(list, new Set([0]));
    expect(renderableIndexOfSeq(list, renderable, 1)).toBe(-1);
  });

  it('returns -1 for a seq not in the mission', () => {
    const renderable = computeRenderableIndices(list, new Set());
    expect(renderableIndexOfSeq(list, renderable, 42)).toBe(-1);
  });
});
