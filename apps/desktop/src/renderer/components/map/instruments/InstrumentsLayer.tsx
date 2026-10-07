/**
 * Mounts the visible map instruments inside the telemetry map container.
 * Each instrument gets its own wrapper component so useDraggableOverlay is
 * called unconditionally per widget (never in a loop or behind a condition);
 * registry order keeps the list stable across toggles.
 *
 * Scaling uses CSS zoom on an INNER wrapper, not transform scale and not the
 * dragged element itself: zoom affects layout size, so the outer element's
 * offsetWidth/left/top stay in the map container's coordinate space and the
 * drag clamp math keeps working. A corner grip (hover-revealed) drag-resizes
 * the instrument; the committed scale persists in map-instruments-store.
 *
 * Hovering also reveals a gear button opening the per-instrument config
 * popover: individual opacity override and, where the registry provides a
 * NumericComponent, an analog/numeric display switch.
 */
import { useTranslation } from 'react-i18next';
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useDraggableOverlay } from '../useDraggableOverlay';
import {
  useMapInstrumentsStore,
  resolveInstrumentVisible,
  INSTRUMENT_SCALE_MIN,
  INSTRUMENT_SCALE_MAX,
  INSTRUMENT_SCALE_STEP,
  INSTRUMENT_OPACITY_MIN,
  type InstrumentDisplayMode,
} from '../../../stores/map-instruments-store';
import { MAP_INSTRUMENTS, instrumentLabel, type MapInstrumentDef } from './registry';
import { DockedGroup } from './DockedGroup';
import { variantGlyph } from './variant-glyphs';
import { useDockPreviewStore, measureDockCandidate, commitDock, type MeasuredCandidate } from './dock-tracking';

// Pixels of diagonal grip travel that span one whole scale unit.
const RESIZE_PX_PER_SCALE_UNIT = 100;
const CONFIG_WIDTH = 216;

// Same quantisation as the store: resize moves in detents so instruments can
// be set to IDENTICAL scales (the live drag snaps too, not just the commit).
function clampScale(v: number): number {
  const stepped = Math.round(v / INSTRUMENT_SCALE_STEP) * INSTRUMENT_SCALE_STEP;
  const rounded = Math.round(stepped * 100) / 100;
  return Math.max(INSTRUMENT_SCALE_MIN, Math.min(INSTRUMENT_SCALE_MAX, rounded));
}

function InstrumentConfigPopover({
  instrument,
  anchorRect,
  onClose,
}: {
  instrument: MapInstrumentDef;
  anchorRect: DOMRect;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const globalOpacity = useMapInstrumentsStore((s) => s.opacity);
  const ownOpacity = useMapInstrumentsStore((s) => s.instrumentOpacity[instrument.id]);
  const setInstrumentOpacity = useMapInstrumentsStore((s) => s.setInstrumentOpacity);
  const mode = useMapInstrumentsStore((s) => s.displayMode[instrument.id] ?? 'analog');
  const setDisplayMode = useMapInstrumentsStore((s) => s.setDisplayMode);
  const toggle = useMapInstrumentsStore((s) => s.toggle);

  const effective = ownOpacity ?? globalOpacity;
  const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - CONFIG_WIDTH - 8));
  // Below the instrument unless that would clip at the bottom; then above.
  const belowTop = anchorRect.bottom + 6;
  const top = belowTop + 150 > window.innerHeight ? Math.max(8, anchorRect.top - 156) : belowTop;

  // Analog (the default Component) plus the numeric card and any extra
  // variants the registry offers. Only a single option means no picker.
  const displayOptions: Array<{ id: string; label: string }> = [
    { id: 'analog', label: t('map:instrumentDisplay.analog') },
    ...(instrument.NumericComponent ? [{ id: 'numeric', label: t('map:instrumentDisplay.numeric') }] : []),
    ...(instrument.variants ?? []).map((v) => ({ id: v.id, label: t(v.labelKey) })),
  ];

  return createPortal(
    <>
      {/* click-away; modal tier so it clears the dockview panels below the map */}
      <div className="fixed inset-0 z-[9998]" onClick={onClose} />
      <div
        className="fixed z-[9999] rounded-lg bg-surface-solid border border-subtle shadow-xl"
        style={{ top, left, width: CONFIG_WIDTH }}
      >
        <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary border-b border-subtle">
          {instrumentLabel(instrument, t)}
        </div>
        <div className="p-2 space-y-2.5">
          {displayOptions.length > 1 && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1.5">{t('map:instrumentsLayer.display')}</div>
              <div className="grid grid-cols-3 gap-1.5">
                {displayOptions.map((opt) => {
                  const active = mode === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setDisplayMode(instrument.id, opt.id as InstrumentDisplayMode)}
                      data-tip={t('map:instrumentsLayer.displayTip', { label: opt.label })}
                      className={
                        'flex flex-col items-center justify-center gap-1 py-1.5 rounded-md border transition-colors ' +
                        (active
                          ? 'border-blue-500/60 bg-blue-500/10 text-blue-400'
                          : 'border-subtle text-content-secondary hover:border-default hover:text-content hover:bg-surface-raised')
                      }
                    >
                      <span className="w-5 h-5 flex items-center justify-center">{variantGlyph(opt.id)}</span>
                      <span className="text-[10px] leading-none">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div>
            <div className="text-[10px] uppercase tracking-wide text-content-tertiary mb-1">{t('map:instrumentsLayer.opacity')}</div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={Math.round(INSTRUMENT_OPACITY_MIN * 100)}
                max={100}
                value={Math.round(effective * 100)}
                onChange={(e) => setInstrumentOpacity(instrument.id, Number(e.target.value) / 100)}
                className="flex-1 accent-blue-600"
              />
              <span className="text-xs tabular-nums text-content-tertiary w-8 text-right">{Math.round(effective * 100)}%</span>
            </div>
            {ownOpacity !== undefined && (
              <button
                type="button"
                onClick={() => setInstrumentOpacity(instrument.id, null)}
                className="mt-1 text-[11px] text-blue-500 hover:text-blue-400 transition-colors"
              >
                {t('map:instrumentsLayer.useGlobalOpacity')}
              </button>
            )}
          </div>
          {/* Hide takes the instrument off the map; add it back from the
              Instruments catalog. Mirrors the mobile config sheet's eye-off. */}
          <button
            type="button"
            onClick={() => { toggle(instrument.id); onClose(); }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md border border-subtle text-xs text-red-500 hover:bg-red-500/10 hover:border-red-500/40 transition-colors"
          >
            <EyeOffIcon />
            {t('map:instrumentsLayer.hideInstrument')}
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
}

// Eye with a slash: "hide", not "delete". A hidden instrument is re-added from
// the Instruments catalog, nothing is lost.
function EyeOffIcon(): JSX.Element {
  return (
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function DockPreview(): JSX.Element | null {
  const preview = useDockPreviewStore((s) => s.preview);
  if (!preview) return null;
  const { rect, side, cluster } = preview;
  if (cluster) {
    const round = Math.abs(rect.w - rect.h) < 4;
    return (
      <div
        className={`absolute z-[1001] pointer-events-none border-2 border-dashed border-blue-400/70 ${round ? 'rounded-full' : 'rounded-xl'}`}
        style={{ left: rect.x - 4, top: rect.y - 4, width: rect.w + 8, height: rect.h + 8 }}
      />
    );
  }
  const bar: CSSProperties =
    side === 'left' ? { left: -2, top: 0, bottom: 0, width: 3 }
    : side === 'right' ? { right: -2, top: 0, bottom: 0, width: 3 }
    : side === 'top' ? { top: -2, left: 0, right: 0, height: 3 }
    : { bottom: -2, left: 0, right: 0, height: 3 };
  return (
    <div
      className="absolute z-[1001] pointer-events-none rounded-lg border-2 border-blue-400/70"
      style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
    >
      <div className="absolute rounded-full bg-blue-400" style={bar} />
    </div>
  );
}

function InstrumentSlot({ instrument }: { instrument: MapInstrumentDef }): JSX.Element {
  const { t } = useTranslation();
  const drag = useDraggableOverlay('instrument:' + instrument.id);
  const storedScale = useMapInstrumentsStore((s) => s.scale[instrument.id] ?? 1);
  const setScale = useMapInstrumentsStore((s) => s.setScale);
  const toggle = useMapInstrumentsStore((s) => s.toggle);
  const globalOpacity = useMapInstrumentsStore((s) => s.opacity);
  const ownOpacity = useMapInstrumentsStore((s) => s.instrumentOpacity[instrument.id]);
  const mode = useMapInstrumentsStore((s) => s.displayMode[instrument.id] ?? 'analog');
  const [liveScale, setLiveScale] = useState<number | null>(null);
  const [hovered, setHovered] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const resize = useRef<{ startX: number; startY: number; startScale: number } | null>(null);
  const scale = liveScale ?? storedScale;
  const opacity = ownOpacity ?? globalOpacity;
  const selectedVariant = instrument.variants?.find((v) => v.id === mode);
  const Component = selectedVariant
    ? selectedVariant.Component
    : mode === 'numeric' && instrument.NumericComponent
      ? instrument.NumericComponent
      : instrument.Component;

  // Stable composite ref: an inline arrow here would be a NEW function every
  // render, so React would re-invoke it (null, el) each render, and the drag
  // ref's position apply would re-render in an infinite loop.
  const dragRef = drag.ref;
  const setRefs = useCallback((el: HTMLDivElement | null) => {
    wrapperRef.current = el;
    dragRef(el);
  }, [dragRef]);

  // Keep the popover anchored if the instrument moves while it is open.
  useLayoutEffect(() => {
    if (!configOpen) { setAnchorRect(null); return; }
    const r = wrapperRef.current?.getBoundingClientRect();
    if (r) setAnchorRect(r);
  }, [configOpen]);

  // Runs beside the overlay drag: watches for a dock target while moving and
  // merges on release. The hook still writes this instrument's solo anchor on
  // drop; harmless, it is ignored while the instrument lives in a group.
  const onPointerDownWithDock = (e: ReactPointerEvent) => {
    drag.onPointerDown(e);
    const el = wrapperRef.current;
    if (!el || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select, textarea, a, [role="slider"]')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let active = false;
    let raf = 0;
    let last: MeasuredCandidate | null = null;
    const onMove = (ev: globalThis.PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      active = true;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const node = wrapperRef.current;
        last = node ? measureDockCandidate(node, instrument.id) : null;
        useDockPreviewStore.getState().setPreview(
          last ? { rect: last.targetRect, side: last.candidate.side, cluster: !!last.candidate.cluster } : null,
        );
      });
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
      useDockPreviewStore.getState().setPreview(null);
      if (!active || !last) return;
      const container = wrapperRef.current?.offsetParent as HTMLElement | null;
      if (!container) return;
      const c = container.getBoundingClientRect();
      commitDock(instrument.id, last, { x: ev.clientX - c.left, y: ev.clientY - c.top }, container);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onGripPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    // The grip owns this gesture; without this the wrapper's move-drag starts.
    e.stopPropagation();
    e.preventDefault();
    resize.current = { startX: e.clientX, startY: e.clientY, startScale: scale };

    const onMove = (ev: globalThis.PointerEvent) => {
      const r = resize.current;
      if (!r) return;
      const d = (ev.clientX - r.startX + ev.clientY - r.startY) / 2;
      setLiveScale(clampScale(r.startScale + d / RESIZE_PX_PER_SCALE_UNIT));
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      const r = resize.current;
      resize.current = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (r) {
        const d = (ev.clientX - r.startX + ev.clientY - r.startY) / 2;
        setScale(instrument.id, clampScale(r.startScale + d / RESIZE_PX_PER_SCALE_UNIT));
      }
      setLiveScale(null);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Round bezel geometry (gear/grip on the bezel) only for the analog round
  // gauge; the numeric card and every compact variant are rectangular.
  const roundInstrument = !selectedVariant && (!instrument.NumericComponent || mode === 'analog');

  return (
    <div
      ref={setRefs}
      data-instrument-id={instrument.id}
      // Idle instruments dim to the opacity setting (own override first, then
      // global); hovering restores full opacity. While the config popover is
      // open the raw opacity ALWAYS shows so its slider previews live,
      // regardless of hover state.
      style={{ ...drag.style, opacity: configOpen ? opacity : hovered || liveScale !== null ? 1 : opacity }}
      onPointerDown={onPointerDownWithDock}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className={instrument.defaultClassName + ' group touch-none transition-opacity duration-150'}
    >
      {/* zoom is non-standard in TS's CSSProperties but supported by Chromium */}
      <div style={{ zoom: scale } as CSSProperties}>
        <Component />
      </div>
      {/* Config gear: a floating chip just OUTSIDE the instrument (a round
          gauge's square wrapper corner is already off the bezel; rectangular
          widgets hang it past their corner) so it never covers the face. */}
      <button
        type="button"
        onClick={() => setConfigOpen(true)}
        data-tip={t('map:instrumentsLayer.settingsTip')}
        className={
          `absolute ${roundInstrument ? 'top-0 right-0' : '-top-1.5 -right-1.5'} p-1 rounded-full ` +
          'bg-surface shadow-lg text-content-secondary hover:text-content hover:bg-surface-raised ' +
          'transition-opacity ' +
          (configOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
        }
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      {/* Quick-hide chip, mirror of the gear at the opposite corner: one click
          takes this instrument off the map (re-add from the Instruments
          catalog). Hover-revealed like the gear and the resize grip. */}
      <button
        type="button"
        onClick={() => toggle(instrument.id)}
        data-tip={t('map:instrumentsLayer.hideInstrument')}
        className={
          `absolute ${roundInstrument ? 'top-0 left-0' : '-top-1.5 -left-1.5'} p-1 rounded-full ` +
          'bg-surface shadow-lg text-content-secondary hover:text-red-500 hover:bg-surface-raised ' +
          'transition-opacity ' +
          (configOpen ? 'opacity-0' : 'opacity-0 group-hover:opacity-100')
        }
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      </button>
      {/* Inset 11px so the grip sits ON a round gauge's bezel at 45 degrees
          instead of floating in the square wrapper's empty corner. */}
      <div
        onPointerDown={onGripPointerDown}
        className={
          `absolute ${roundInstrument ? 'bottom-[11px] right-[11px]' : 'bottom-0.5 right-0.5'} w-2.5 h-2.5 rounded-br border-b-2 border-r-2 ` +
          'touch-none cursor-nwse-resize transition-opacity ' +
          (liveScale !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')
        }
        style={{ borderColor: 'var(--gauge-text-dim)' }}
      />
      {/* Scale readout while resizing: detents mean two instruments showing
          the same percentage ARE the same size. */}
      {liveScale !== null && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums bg-surface text-content shadow-lg pointer-events-none">
          {Math.round(scale * 100)}%
        </div>
      )}
      {configOpen && anchorRect && (
        <InstrumentConfigPopover instrument={instrument} anchorRect={anchorRect} onClose={() => setConfigOpen(false)} />
      )}
    </div>
  );
}

/**
 * One instrument on its own, visibility-gated, for hosts that don't mount the
 * whole layer (the 3D view mounts just the attitude ball this way).
 */
export function SingleMapInstrument({ id }: { id: string }): JSX.Element | null {
  const visible = useMapInstrumentsStore((s) => resolveInstrumentVisible(s.visible, id));
  const layoutRev = useMapInstrumentsStore((s) => s.layoutRev);
  const instrument = MAP_INSTRUMENTS.find((i) => i.id === id);
  if (!instrument || !visible) return null;
  return <InstrumentSlot key={id + ':' + layoutRev} instrument={instrument} />;
}

export function InstrumentsLayer(): JSX.Element {
  const visible = useMapInstrumentsStore((s) => s.visible);
  const groups = useMapInstrumentsStore((s) => s.groups);
  // layoutRev in the key remounts every slot when a saved layout is applied,
  // so useDraggableOverlay re-reads the freshly written position payloads.
  const layoutRev = useMapInstrumentsStore((s) => s.layoutRev);
  const grouped = new Set(Object.values(groups).flatMap((g) => g.members));
  return (
    <>
      {MAP_INSTRUMENTS.map((instrument) =>
        resolveInstrumentVisible(visible, instrument.id) && !grouped.has(instrument.id)
          ? <InstrumentSlot key={instrument.id + ':' + layoutRev} instrument={instrument} />
          : null,
      )}
      {Object.entries(groups).map(([gid, group]) => (
        <DockedGroup key={gid + ':' + layoutRev} gid={gid} group={group} />
      ))}
      <DockPreview />
    </>
  );
}
