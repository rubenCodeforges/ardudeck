/**
 * Keeping the previewed aircraft on screen.
 *
 * A preview you cannot see is no preview: on a 50 km corridor the gizmo leaves
 * the viewport within a second of pressing play and the rest of the run
 * happens off screen.
 *
 * Panning on every frame would fight the pilot the moment they drag the map to
 * look at something, so the map is only nudged when the aircraft nears the
 * edge, and following stops as soon as the pilot moves the map themselves.
 */

export interface Viewport {
  /** Pixel bounds of the map container. */
  width: number;
  height: number;
}

export interface FollowDecision {
  /** Recentre the map on the aircraft. */
  recenter: boolean;
}

/**
 * Fraction of the viewport, measured from the centre, the aircraft may reach
 * before the map is recentred. 0.35 keeps it inside the middle 70%, which is
 * far enough from the edge to see where it is heading.
 */
export const FOLLOW_MARGIN = 0.35;

/**
 * Whether to recentre, given where the aircraft has landed in the viewport.
 * `point` is in container pixels, origin top-left.
 */
export function shouldRecenter(point: { x: number; y: number }, view: Viewport): FollowDecision {
  if (view.width <= 0 || view.height <= 0) return { recenter: false };
  const dx = Math.abs(point.x - view.width / 2) / view.width;
  const dy = Math.abs(point.y - view.height / 2) / view.height;
  // Off-screen entirely counts too: a negative coordinate still exceeds the margin.
  return { recenter: dx > FOLLOW_MARGIN || dy > FOLLOW_MARGIN };
}

/**
 * Follow state across a playback run. The pilot dragging the map switches
 * following off; pressing play again turns it back on, which is the only way
 * back so an accidental nudge does not silently lose the aircraft forever.
 */
export class FollowState {
  private following = true;

  /** The pilot moved the map; stop chasing until they restart playback. */
  userMoved(): void {
    this.following = false;
  }

  /** Playback (re)started: resume following. */
  restart(): void {
    this.following = true;
  }

  get active(): boolean {
    return this.following;
  }
}
