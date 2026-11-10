/**
 * Chromium steps a focused <input type="number"> on mouse wheel while the pane scrolls under it,
 * so a value can change without the pilot noticing. Blurring it first leaves only the scroll.
 */
export function blurNumberInputOnWheel(event: Pick<WheelEvent, 'target'>, doc: Pick<Document, 'activeElement'> = document): void {
  const el = doc.activeElement;
  if (el instanceof HTMLInputElement && el.type === 'number' && el === event.target) el.blur();
}

export function installNumberWheelGuard(target: Pick<Document, 'addEventListener'> = document): void {
  target.addEventListener('wheel', (e) => blurNumberInputOnWheel(e as WheelEvent), { capture: true, passive: true });
}
