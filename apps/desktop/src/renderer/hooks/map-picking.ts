export const PICKING_CLASS = 'map-picking';

const depth = new WeakMap<HTMLElement, number>();

/**
 * Two tools can be armed at once, so the class is refcounted: the first to
 * finish must not strip it while another is still drawing.
 */
export function acquirePicking(el: HTMLElement): () => void {
  depth.set(el, (depth.get(el) ?? 0) + 1);
  el.classList.add(PICKING_CLASS);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const left = (depth.get(el) ?? 1) - 1;
    depth.set(el, left);
    if (left <= 0) el.classList.remove(PICKING_CLASS);
  };
}

/** True while some tool on this map owns clicks (placing a waypoint, home, a fence or survey point). */
export function isPicking(el: HTMLElement): boolean {
  return (depth.get(el) ?? 0) > 0;
}
