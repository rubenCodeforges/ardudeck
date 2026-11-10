/**
 * Global tooltip.
 *
 * Renders a single tooltip in a body-level portal for any element carrying a
 * `data-tip` (or native `title`) attribute. Mounted once at the app root.
 *
 * Why not pure CSS `::after`: a pseudo-element tooltip is laid out inside its
 * host's box, so it gets clipped by any `overflow:hidden`/`auto` ancestor
 * (toolbars, scroll panes) and can be covered by sibling stacking contexts.
 * That produced the "tooltip only shows in roomy blocks, looks broken in
 * toolbars" behaviour. A fixed-position portal escapes all of that.
 *
 * It also adopts native `title` attributes: on hover the title is copied to
 * `data-tip` and the `title` is stripped, so the inconsistent OS-native
 * tooltip (which shows late / flashes on blur) never fires and every tooltip in
 * the app routes through this one consistent renderer.
 *
 * Behaviour: shows after a short hover delay, hides immediately on mouse-out,
 * scroll, pointer-down, wheel, or window blur. Positions below the target,
 * flipping above when there isn't room.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TipState {
  text: string;
  x: number;
  y: number;
  placement: 'top' | 'bottom' | 'left' | 'right';
}

const SHOW_DELAY_MS = 350;

export function GlobalTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const timerRef = useRef<number | null>(null);
  const elRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    const hide = () => {
      clearTimer();
      elRef.current = null;
      setTip(null);
    };

    const show = (el: HTMLElement) => {
      const text = el.getAttribute('data-tip');
      if (!text) return;
      const rect = el.getBoundingClientRect();
      const MARGIN = 8;
      const GAP = 6;
      // Half of the tooltip's max width — used to detect when a centered
      // tooltip would spill past a horizontal viewport edge.
      const HALF_EST = 130;
      const center = rect.left + rect.width / 2;
      // Against the left edge (e.g. a vertical tool rail): a centered tooltip
      // would run off-screen and sit under the rail, so place it to the right.
      if (center - HALF_EST < MARGIN) {
        setTip({ text, x: rect.right + GAP, y: rect.top + rect.height / 2, placement: 'right' });
        return;
      }
      // Against the right edge: mirror to the left.
      if (center + HALF_EST > window.innerWidth - MARGIN) {
        setTip({ text, x: rect.left - GAP, y: rect.top + rect.height / 2, placement: 'left' });
        return;
      }
      // Prefer below; flip above when the lower part of the viewport is tight.
      const placeBelow = rect.bottom + 40 < window.innerHeight;
      setTip({
        text,
        x: center,
        y: placeBelow ? rect.bottom + GAP : rect.top - GAP,
        placement: placeBelow ? 'bottom' : 'top',
      });
    };

    const onOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      const el = target?.closest<HTMLElement>('[data-tip], [title]') ?? null;
      if (!el || el === elRef.current) return;
      // Adopt a native `title` so the OS tooltip never fires; from here on the
      // element is driven by data-tip. We refresh from title every hover (React
      // re-adds it on re-render) so dynamic titles stay current. Removing title
      // on mouse-over (before the native ~1s delay) reliably suppresses it.
      const title = el.getAttribute('title');
      if (title) {
        el.setAttribute('data-tip', title);
        el.removeAttribute('title');
      }
      if (!el.getAttribute('data-tip')) return;
      clearTimer();
      setTip(null);
      elRef.current = el;
      timerRef.current = window.setTimeout(() => {
        // The element may have been removed/changed during the delay.
        if (elRef.current === el && el.isConnected) show(el);
      }, SHOW_DELAY_MS);
    };

    const onOut = (e: MouseEvent) => {
      const related = e.relatedTarget as Node | null;
      if (elRef.current && (!related || !elRef.current.contains(related))) {
        hide();
      }
    };

    document.addEventListener('mouseover', onOver, true);
    document.addEventListener('mouseout', onOut, true);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('pointerdown', hide, true);
    window.addEventListener('wheel', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      clearTimer();
      document.removeEventListener('mouseover', onOver, true);
      document.removeEventListener('mouseout', onOut, true);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('pointerdown', hide, true);
      window.removeEventListener('wheel', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!tip) return null;

  return createPortal(
    <div
      role="tooltip"
      style={{
        position: 'fixed',
        left: tip.x,
        top: tip.y,
        transform:
          tip.placement === 'bottom' ? 'translate(-50%, 0)'
          : tip.placement === 'top' ? 'translate(-50%, -100%)'
          : tip.placement === 'right' ? 'translate(0, -50%)'
          : 'translate(-100%, -50%)',
        zIndex: 100000,
        pointerEvents: 'none',
      }}
      className="app-tooltip px-2 py-1 rounded-md text-[11px] leading-tight bg-surface-solid text-content border border-subtle shadow-lg max-w-[260px] whitespace-normal"
    >
      {tip.text}
    </div>,
    document.body,
  );
}
