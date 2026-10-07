const DEFAULT_SETTLE_MS = 120;

/**
 * Calls `onSettled` once a resize stops, instead of on every frame of a layout
 * animation. Use it where reacting to a size is expensive, such as reallocating
 * a WebGL drawing buffer or relaying out a map.
 *
 * @returns a function that stops observing
 */
export function observeSettledResize(target: Element, onSettled: () => void, settleMs = DEFAULT_SETTLE_MS): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const observer = new ResizeObserver(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onSettled();
    }, settleMs);
  });
  observer.observe(target);
  return () => {
    if (timer) clearTimeout(timer);
    observer.disconnect();
  };
}
