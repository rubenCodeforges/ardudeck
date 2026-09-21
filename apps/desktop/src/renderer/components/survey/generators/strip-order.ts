/**
 * The order to fly parallel strips, given what the aircraft can turn.
 *
 * A 180° turn displaces an aircraft laterally by exactly one turn diameter.
 * Survey lines are usually closer together than that, so flying them in
 * order 1, 2, 3 asks for a reversal the aircraft cannot make: it swings wide,
 * rolls out off the line, and the start of every strip is missed.
 *
 * The fix is not to bolt an overshoot waypoint onto each end. It is to fly
 * the strips in an order where consecutive strips are already a turn diameter
 * apart: 1, 4, 7 ... then 2, 5, 8 ... then 3, 6, 9. Each turn then fits with
 * room to roll out, the camera runs the whole length of every line, and the
 * plan carries no extra waypoints at all.
 */

export interface StripPlan {
  /** Strip indices in the order they should be flown. */
  order: number[];
  /** Gap, in strips, between consecutively flown lines. */
  stride: number;
  /**
   * False when even the widest stride leaves consecutive strips closer than a
   * turn diameter, so some turn still will not fit. Too few strips to skip
   * between, essentially.
   */
  turnsFit: boolean;
  /** Lateral room the tightest turn actually gets, metres. */
  tightestTurnM: number;
}

/**
 * Order `count` strips so consecutive ones are at least a turn diameter apart.
 *
 * `lineSpacingM` is the gap between neighbouring strips, `turnRadiusM` the
 * aircraft's level-turn radius. A copter (or any radius at or below zero)
 * turns on the spot and just flies them in order.
 */
export function stripFlightOrder(count: number, lineSpacingM: number, turnRadiusM: number): StripPlan {
  const inOrder = Array.from({ length: Math.max(0, count) }, (_, i) => i);
  if (count <= 2 || turnRadiusM <= 0 || lineSpacingM <= 0) {
    return {
      order: inOrder,
      stride: 1,
      turnsFit: count <= 1 || lineSpacingM >= 2 * turnRadiusM || turnRadiusM <= 0,
      tightestTurnM: count <= 1 ? Infinity : lineSpacingM,
    };
  }

  const needed = 2 * turnRadiusM;
  // Widest stride that still leaves every strip flown.
  const stride = Math.min(Math.max(1, Math.ceil(needed / lineSpacingM)), count - 1);

  const order: number[] = [];
  for (let offset = 0; offset < stride; offset++) {
    for (let i = offset; i < count; i += stride) order.push(i);
  }

  // The turn that gets the least room, ignoring the jump back to a new offset
  // group: that one is a transit, not a reversal onto the neighbouring line.
  let tightest = Infinity;
  for (let i = 1; i < order.length; i++) {
    const gap = Math.abs(order[i]! - order[i - 1]!) * lineSpacingM;
    if (gap > 0) tightest = Math.min(tightest, gap);
  }

  return {
    order,
    stride,
    turnsFit: tightest >= needed,
    tightestTurnM: tightest,
  };
}
