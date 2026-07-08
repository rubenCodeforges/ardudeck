// Pure windowing logic for the waypoint list. The list virtualizes over the
// rows that ACTUALLY render (collapsed children are absent from the DOM), so
// the renderable-index computation must live outside the component to be
// testable at 20k+ item scale.

import { isNavigationCommand, MAV_CMD } from '../../../shared/mission-types';

export interface WindowItem {
  seq: number;
  command: number;
}

// Children (DO_*/CONDITION_*, plus NAV_DELAY which sits in the nav range but
// behaves like a child) attach to the preceding nav parent.
export function isChildCommand(command: number): boolean {
  return !isNavigationCommand(command) || command === MAV_CMD.NAV_DELAY;
}

// Indices of the rows that render given the collapsed parent set. Children of
// a collapsed parent are skipped; children before any parent always render.
export function computeRenderableIndices(
  items: readonly WindowItem[],
  collapsedParents: ReadonlySet<number>,
): number[] {
  const out: number[] = [];
  let currentParent: number | null = null;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === undefined) continue;
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
