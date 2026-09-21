import { describe, it, expect } from 'vitest';
import { MAV_CMD } from '../../../shared/mission-types';
import {
  computeRenderableIndices,
  isChildCommand,
  renderableIndexOfSeq, estimateRowHeight } from './waypoint-list-window';

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

describe('estimateRowHeight', () => {
  it('charges a parent row and a child row differently', () => {
    expect(estimateRowHeight({ isChild: false, hasHeader: false, inCollapsedGroup: false })).toBe(52);
    expect(estimateRowHeight({ isChild: true, hasHeader: false, inCollapsedGroup: false })).toBe(40);
  });

  it('adds the group header on top of the row', () => {
    expect(estimateRowHeight({ isChild: false, hasHeader: true, inCollapsedGroup: false })).toBe(100);
  });

  // A collapsed group renders its header and nothing else. Reserving a full
  // row for each suppressed item pushed the next header thousands of pixels
  // down, so a collapsed mission showed one group and a wall of blank space.
  it('reserves nothing for rows a collapsed group suppresses', () => {
    expect(estimateRowHeight({ isChild: false, hasHeader: false, inCollapsedGroup: true })).toBe(0);
    expect(estimateRowHeight({ isChild: true, hasHeader: false, inCollapsedGroup: true })).toBe(0);
  });

  it('still reserves the header of a collapsed group', () => {
    expect(estimateRowHeight({ isChild: false, hasHeader: true, inCollapsedGroup: true })).toBe(48);
  });

  it('keeps six collapsed groups within one screen', () => {
    // 6 groups of 84 items each, all collapsed: only the headers render.
    let total = 0;
    for (let g = 0; g < 6; g++) {
      for (let i = 0; i < 84; i++) {
        total += estimateRowHeight({ isChild: i % 3 === 2, hasHeader: i === 0, inCollapsedGroup: true });
      }
    }
    expect(total).toBe(6 * 48);
  });
});

describe('collapsed groups in the window', () => {
  const item = (seq: number, command: number, groupId?: string) =>
    (groupId === undefined ? { seq, command } : { seq, command, groupId });

  // 3 groups of 4 items. Collapsed ones must contribute exactly one row, or
  // the virtualizer has hundreds of rows to walk past to reach the next header.
  const items = [
    item(0, 16, 'a'), item(1, 178, 'a'), item(2, 16, 'a'), item(3, 16, 'a'),
    item(4, 16, 'b'), item(5, 178, 'b'), item(6, 16, 'b'), item(7, 16, 'b'),
    item(8, 16, 'c'), item(9, 178, 'c'), item(10, 16, 'c'), item(11, 16, 'c'),
  ];

  it('keeps one row per collapsed group', () => {
    const idx = computeRenderableIndices(items, new Set(), new Set(['a', 'b', 'c']));
    expect(idx).toEqual([0, 4, 8]);
  });

  it('every group header is reachable, not just the first', () => {
    const many = Array.from({ length: 6 }, (_, g) =>
      Array.from({ length: 84 }, (_, i) => item(g * 84 + i, 16, `g${g}`)),
    ).flat();
    const idx = computeRenderableIndices(many, new Set(), new Set(many.map((i) => i.groupId!)));
    expect(idx).toHaveLength(6);
  });

  it('expands the groups that are not collapsed', () => {
    const idx = computeRenderableIndices(items, new Set(), new Set(['a', 'c']));
    expect(idx).toEqual([0, 4, 5, 6, 7, 8]);
  });

  it('behaves exactly as before with no collapsed groups', () => {
    expect(computeRenderableIndices(items, new Set(), new Set()))
      .toEqual(computeRenderableIndices(items, new Set()));
  });

  it('still hides children of a collapsed parent', () => {
    const idx = computeRenderableIndices(items, new Set([4]), new Set());
    expect(idx).not.toContain(5);
    expect(idx).toContain(4);
  });

  it('leaves ungrouped items alone', () => {
    const mixed = [item(0, 16), item(1, 16, 'a'), item(2, 16, 'a'), item(3, 16)];
    expect(computeRenderableIndices(mixed, new Set(), new Set(['a']))).toEqual([0, 1, 3]);
  });
});
