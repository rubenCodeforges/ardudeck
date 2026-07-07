/**
 * Hover popover for parameter names: metadata description + optional ArduPilot docs link.
 * Portalled to document.body so virtualized/scrollable param grids do not clip it.
 *
 * Keyboard access for docs intentionally uses the row's dedicated ExternalLink control
 * (not per-name tab stops). This popover is pointer-oriented: hover to read, click the
 * docs control inside to open (mousedown preventDefault keeps the panel open).
 */

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink } from 'lucide-react';

/** Loose metadata shape — store may return partial definitions. */
type ParamTooltipMeta = {
  humanName?: string;
  description?: string;
  range?: { min: number; max: number };
  units?: string;
  increment?: number;
  rebootRequired?: boolean;
};

const VIEWPORT_MARGIN = 8;
const CLOSE_DELAY_MS = 180;

export function ParamNameTooltip({
  meta,
  description,
  docUrl,
  docsLinkLabel = 'ArduPilot docs',
  children,
}: {
  meta?: ParamTooltipMeta | null;
  /** Fallback description when meta is incomplete */
  description?: string;
  docUrl?: string | null;
  docsLinkLabel?: string;
  children: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const humanName = meta?.humanName;
  const desc = meta?.description || description;
  const hasMeta = Boolean(humanName || desc || meta?.range || meta?.units || meta?.rebootRequired);
  const hasContent = hasMeta || Boolean(docUrl);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setShow(false), CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const open = useCallback(() => {
    clearCloseTimer();
    setShow(true);
  }, [clearCloseTimer]);

  // Prevent setState-after-unmount from the close timer
  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  // Escape closes while pointer is over the panel or trigger
  useEffect(() => {
    if (!show) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearCloseTimer();
        setShow(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [show, clearCloseTimer]);

  useLayoutEffect(() => {
    if (!show || !triggerRef.current) return;

    const update = () => {
      const trigger = triggerRef.current;
      const overlay = overlayRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const ow = overlay?.offsetWidth ?? 280;
      const oh = overlay?.offsetHeight ?? 120;
      let top = rect.bottom + 4;
      let left = rect.left;
      if (top + oh > window.innerHeight - VIEWPORT_MARGIN) {
        top = Math.max(VIEWPORT_MARGIN, rect.top - oh - 4);
      }
      if (left + ow > window.innerWidth - VIEWPORT_MARGIN) {
        left = Math.max(VIEWPORT_MARGIN, window.innerWidth - VIEWPORT_MARGIN - ow);
      }
      if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;
      setPos({ top, left });
    };

    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [show, meta, docUrl, description]);

  if (!hasContent) {
    return <>{children}</>;
  }

  const overlay =
    show &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        ref={overlayRef}
        id={tooltipId}
        role="tooltip"
        className="fixed z-[9999] max-w-[300px] whitespace-normal bg-surface-solid border border-subtle px-2.5 py-2 text-xs leading-relaxed shadow-lg pointer-events-auto rounded"
        style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999, visibility: 'hidden' }}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
      >
        {humanName && (
          <div className="font-semibold text-content mb-0.5">{humanName}</div>
        )}
        {desc && (
          <div className="text-content-secondary">{desc}</div>
        )}
        {meta?.range && (
          <div className="text-content-tertiary mt-1">
            Range: {meta.range.min} &ndash; {meta.range.max}
            {meta.units ? ` ${meta.units}` : ''}
          </div>
        )}
        {meta?.units && !meta?.range && (
          <div className="text-content-tertiary mt-1">Units: {meta.units}</div>
        )}
        {meta?.increment != null && meta.increment > 0 && (
          <div className="text-content-tertiary mt-0.5">Step: {meta.increment}</div>
        )}
        {meta?.rebootRequired && (
          <div className="text-amber-400 mt-1">Reboot required after change</div>
        )}
        {docUrl && (
          <button
            type="button"
            tabIndex={-1}
            className="inline-flex items-center gap-1 mt-1.5 text-blue-400 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 rounded"
            // preventDefault keeps the hover bridge alive when clicking (no focus steal/close race)
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              window.electronAPI?.openExternal(docUrl);
            }}
          >
            {docsLinkLabel}
            <ExternalLink className="w-2.5 h-2.5" aria-hidden />
          </button>
        )}
      </div>,
      document.body,
    );

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex min-w-0 max-w-full"
        // Not a tab stop — keyboard users use the row's ExternalLink control for docs.
        aria-describedby={show ? tooltipId : undefined}
        onMouseEnter={open}
        onMouseLeave={scheduleClose}
      >
        {children}
      </span>
      {overlay}
    </>
  );
}
