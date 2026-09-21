// Pure windowing logic for the waypoint list. The list virtualizes over the
// rows that ACTUALLY render (collapsed children are absent from the DOM), so
// the renderable-index computation must live outside the component to be
// testable at 20k+ item scale.

import { isNavigationCommand, MAV_CMD } from '../../../shared/mission-types';

export interface WindowItem {
  seq: number;
  command: number;
  groupId?: string;
}

// Children (DO_*/CONDITION_*, plus NAV_DELAY which sits in the nav range but
// behaves like a child) attach to the preceding nav parent.
export function isChildCommand(command: number): boolean {
  return !isNavigationCommand(command) || command === MAV_CMD.NAV_DELAY;
}

/**
 * Indices of the rows that render, given the collapsed parents and collapsed
 * groups. Children of a collapsed parent are skipped; children before any
 * parent always render.
 *
 * A collapsed GROUP contributes exactly one row, the item its header hangs
 * off. Leaving the rest in the list and giving them zero height was worse than
 * the bug it replaced: the virtualizer locates its window by comparing scroll
 * offsets, and hundreds of rows sharing one offset made it stop early, so only
 * the first few group headers ever rendered.
 */
export function computeRenderableIndices(
  items: readonly WindowItem[],
  collapsedParents: ReadonlySet<number>,
  collapsedGroups?: ReadonlySet<string>,
): number[] {
  const out: number[] = [];
  let currentParent: number | null = null;
  const headerSeen = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) continue;
    if (item.groupId !== undefined && collapsedGroups?.has(item.groupId)) {
      if (headerSeen.has(item.groupId)) continue;
      headerSeen.add(item.groupId);
      out.push(i);
      continue;
    }
    if (!isChildCommand(item.command)) {
      currentParent = item.seq;
      out.push(i);
    } else if (currentParent === null || !collapsedParents.has(currentParent)) {
      out.push(i);
    }
  }
  return out;
}

// Position of a mission item (by seq) within the renderable window list, for
// virtualizer scrollToIndex. Returns -1 when the item is hidden or absent.
export function renderableIndexOfSeq(
  items: readonly WindowItem[],
  renderableIndices: readonly number[],
  seq: number,
): number {
  for (let vi = 0; vi < renderableIndices.length; vi++) {
    const idx = renderableIndices[vi];
    if (idx === undefined) continue;
    if (items[idx]?.seq === seq) return vi;
  }
  return -1;
}

export const ROW_H_PARENT = 52;
export const ROW_H_CHILD = 40;
export const ROW_H_HEADER = 48;

/**
 * Height the virtualizer should reserve for one row.
 *
 * A row inside a collapsed GROUP renders nothing but its header, so it must
 * contribute only the header. Charging it a full row spread the headers over
 * thousands of pixels of empty space and left one group visible on screen,
 * which is what a big collapsed mission looked like once it crossed the
 * virtualization threshold.
 */
export function estimateRowHeight(opts: {
  isChild: boolean;
  hasHeader: boolean;
  inCollapsedGroup: boolean;
}): number {
  const header = opts.hasHeader ? ROW_H_HEADER : 0;
  if (opts.inCollapsedGroup) return header;
  return (opts.isChild ? ROW_H_CHILD : ROW_H_PARENT) + header;
}
