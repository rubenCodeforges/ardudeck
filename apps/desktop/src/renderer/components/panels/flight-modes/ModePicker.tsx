/**
 * Mode picker - a grouped, searchable popover of every flight mode for the
 * vehicle class, in the panel's own chip vocabulary (no foreign controls).
 * Modes that can't be selected right now are greyed with the reason; committing
 * modes (RTL / Land / Auto...) ask for one confirm before they're sent.
 */

import { useTranslation, Trans } from 'react-i18next';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { ArduPilotVehicleClass } from '../../../../shared/telemetry-types';
import {
  FLIGHT_MODES,
  PX4_FLIGHT_MODES,
  modesFromProfile,
  modeGroupLabel,
  GROUP_ORDER,
  modeBlockedReason,
  type FlightModeMeta,
  type ModeGateContext,
} from '../../../../shared/flight-mode-meta';
import { GROUP_ICON, modeIcon } from './mode-icons';
import { useActiveVehicleStore } from '../../../stores/active-vehicle-store';
import { useVehicleProfileStore } from '../../../stores/vehicle-profile-store';

export interface ModePickerProps {
  /** The annunciator element the popover anchors under. */
  anchorRef: RefObject<HTMLElement | null>;
  vehicleClass: ArduPilotVehicleClass;
  /**
   * Mode vocabulary. 'px4' uses its own list whose modeNums are encoded
   * custom_mode values; everything else keeps the ArduPilot
   * per-vehicle-class tables.
   */
  firmware?: string;
  currentModeNum?: number;
  requestedModeNum: number | null;
  pendingCommit: number | null;
  ctx: ModeGateContext;
  recents: number[];
  onPick: (modeNum: number) => void;
  onConfirmCommit: () => void;
  onCancelCommit: () => void;
  onClose: () => void;
}

const PANEL_W = 288;

type StatusVar = 'success' | 'warn' | 'danger' | 'info';
function tagFor(meta: FlightModeMeta): { labelKey: string; status: StatusVar } | null {
  if (meta.commit) return { labelKey: 'panels:modePicker.tagCommit', status: 'danger' };
  if (meta.gps) return { labelKey: 'panels:modePicker.tagGps', status: 'warn' };
  if (meta.fly) return { labelKey: 'panels:modePicker.tagFly', status: 'info' };
  return null;
}
function statusChipStyle(status: StatusVar): CSSProperties {
  return { borderColor: `var(--status-${status})`, color: `var(--status-${status}-fg)`, background: `var(--status-${status}-bg)` };
}

function ModePickerImpl({
  anchorRef,
  vehicleClass,
  firmware,
  currentModeNum,
  requestedModeNum,
  pendingCommit,
  ctx,
  recents,
  onPick,
  onConfirmCommit,
  onCancelCommit,
  onClose,
}: ModePickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxH: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Anchor to the annunciator with fixed positioning (portaled to body, so
  // panel overflow can't clip it). Flips ABOVE the anchor when there's no room
  // below (the Flight Control panel is often docked at the bottom), and caps its
  // height to the available space so it always fits. Recomputes on scroll,
  // resize, and content-height changes (filtering / the commit-confirm bar).
  useLayoutEffect(() => {
    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Zero rect = hidden anchor; placing against it strands the popup at the origin.
      if (r.width === 0 && r.height === 0) return;
      const width = Math.max(r.width, PANEL_W);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      const desired = wrapRef.current?.offsetHeight || 360;
      const spaceBelow = window.innerHeight - r.bottom - 12;
      const spaceAbove = r.top - 12;
      const openUp = spaceBelow < Math.min(desired, 260) && spaceAbove > spaceBelow;
      const maxH = Math.max(160, Math.min(desired, openUp ? spaceAbove : spaceBelow, 440));
      const rawTop = openUp ? r.top - maxH - 6 : r.bottom + 6;
      const top = Math.min(Math.max(8, rawTop), Math.max(8, window.innerHeight - maxH - 8));
      setPos((prev) =>
        prev && Math.abs(prev.top - top) < 1 && Math.abs(prev.left - left) < 1
          && Math.abs(prev.width - width) < 1 && Math.abs(prev.maxH - maxH) < 1
          ? prev : { left, top, width, maxH });
    };
    place();
    // rAF-throttle so a burst of events can never thrash layout on the main
    // thread (a capture-phase scroll listener here froze the 3D sim world when
    // the mode list was scrolled - every scroll tick forced a sync reflow).
    let raf = 0;
    const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; place(); }); };
    const ro = new ResizeObserver(schedule);
    if (wrapRef.current) ro.observe(wrapRef.current);
    // capture:false ON PURPOSE - scroll events from the list's own scroll
    // container must NOT reach us; only the window moving the anchor matters.
    window.addEventListener('scroll', schedule, false);
    window.addEventListener('resize', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', schedule, false);
      window.removeEventListener('resize', schedule);
    };
  }, [anchorRef]);

  // Close on outside pointerdown / Escape.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (wrapRef.current && !wrapRef.current.contains(t) && !anchorRef.current?.contains(t)) onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, anchorRef]);

  const q = query.toLowerCase().trim();
  // A vehicle running the ArduDeck Vehicle SDK names its own modes. Falling through to
  // the ArduPilot table would offer it modes it does not have, and send numbers that
  // mean something else on that firmware.
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const declaredModes = useVehicleProfileStore(
    (s) => (activeVehicleKey ? s.byVehicle[activeVehicleKey]?.modes : undefined),
  );
  const activeModes = useMemo(() => {
    if (declaredModes && declaredModes.length > 0) return modesFromProfile(declaredModes);
    return firmware === 'px4' ? PX4_FLIGHT_MODES : FLIGHT_MODES[vehicleClass];
  }, [declaredModes, firmware, vehicleClass]);
  const groups = useMemo(() => {
    return GROUP_ORDER
      .map((g) => ({ group: g, items: activeModes.filter((mm) => mm.group === g && mm.name.toLowerCase().includes(q)) }))
      .filter((s) => s.items.length > 0);
  }, [activeModes, q]);

  const recentMetas = useMemo(
    () => recents.map((n) => activeModes.find((mm) => mm.modeNum === n)).filter((mm): mm is FlightModeMeta => !!mm),
    [recents, activeModes],
  );

  const pendingMeta = pendingCommit != null ? activeModes.find((mm) => mm.modeNum === pendingCommit) : undefined;

  function Chip({ meta }: { meta: FlightModeMeta }) {
    const reason = modeBlockedReason(meta, ctx);
    const isCurrent = meta.modeNum === currentModeNum;
    const isRequested = meta.modeNum === requestedModeNum || meta.modeNum === pendingCommit;
    const tag = tagFor(meta);
    const stateStyle: CSSProperties | undefined = reason
      ? undefined
      : isCurrent ? statusChipStyle('info')
      : isRequested ? statusChipStyle('warn')
      : undefined;
    const Icon = modeIcon(meta);
    return (
      <button
        onClick={() => { if (!reason) onPick(meta.modeNum); }}
        disabled={!!reason}
        {...(reason ? { 'data-tip': reason } : {})}
        style={stateStyle}
        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium border transition-colors
          ${reason ? 'opacity-40 cursor-not-allowed border-subtle bg-surface'
            : (isCurrent || isRequested) ? ''
            : 'border-subtle bg-surface text-content hover:border-content-secondary hover:bg-surface-raised'}`}
      >
        {/* no color class: inherits the chip's text color (incl. status states) */}
        <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span className="truncate">{meta.name}</span>
        {tag && (
          <span
            className="ml-auto shrink-0 text-[8px] font-mono uppercase tracking-wide px-1 py-px rounded-full"
            style={{ color: `var(--status-${tag.status}-fg)`, background: `var(--status-${tag.status}-bg)` }}
          >
            {t(tag.labelKey)}
          </span>
        )}
      </button>
    );
  }

  return createPortal(
    <div
      ref={wrapRef}
      style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxH } : { left: -9999, top: -9999 }}
      className="fixed z-[3000] flex flex-col rounded-xl border border-default bg-surface-solid shadow-2xl overflow-hidden"
    >
      {/* search */}
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-subtle shrink-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-content-tertiary shrink-0">
          <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.5" y2="16.5" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('panels:modePicker.filterPlaceholder')}
          className="flex-1 bg-transparent text-content text-sm outline-none placeholder:text-content-tertiary"
        />
        <span className="text-[9px] font-mono text-content-tertiary border border-subtle rounded px-1 py-px">esc</span>
      </div>

      {/* commit confirm */}
      {pendingMeta && (
        <div className="m-2 shrink-0 flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-2">
          <span className="flex-1 text-[12px] text-content">
            <Trans i18nKey="panels:modePicker.engageConfirm" values={{ name: pendingMeta.name }} components={{ b: <span className="text-red-300 font-semibold" /> }} />
          </span>
          <button onClick={onCancelCommit} className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-subtle text-content-secondary hover:text-content">{t('common:cancel')}</button>
          <button onClick={onConfirmCommit} className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-red-600 hover:bg-red-500 text-white border border-red-600">{t('common:confirm')}</button>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
        {/* recents */}
        {!q && recentMetas.length > 0 && (
          <div className="px-1.5 pt-1 pb-2">
            <div className="text-[9px] font-mono uppercase tracking-[0.14em] text-content-tertiary mb-1.5">{t('panels:modePicker.recent')}</div>
            <div className="flex flex-wrap gap-1.5">
              {recentMetas.map((meta) => {
                const reason = modeBlockedReason(meta, ctx);
                const Icon = modeIcon(meta);
                return (
                  <button
                    key={meta.modeNum}
                    onClick={() => { if (!reason) onPick(meta.modeNum); }}
                    disabled={!!reason}
                    {...(reason ? { 'data-tip': reason } : {})}
                    className={`inline-flex items-center gap-1 text-[11px] font-mono rounded-full px-2.5 py-1 border transition-colors
                      ${reason ? 'opacity-40 cursor-not-allowed border-subtle text-content-tertiary'
                        : 'border-default text-content-secondary hover:text-content hover:border-content-secondary'}`}
                  >
                    <Icon className="w-3 h-3 shrink-0 opacity-70" />
                    {meta.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* grouped */}
        {groups.map((section) => (
          <div key={section.group} className="mb-1">
            <div className="flex items-center gap-1.5 px-1.5 pt-2 pb-1.5">
              {(() => { const GIcon = GROUP_ICON[section.group]; return <GIcon className="w-3 h-3 text-content-tertiary" />; })()}
              <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-content-tertiary">{modeGroupLabel(section.group)}</span>
              <span className="flex-1 h-px bg-subtle" />
            </div>
            <div className="grid grid-cols-2 gap-1.5 px-0.5">
              {section.items.map((meta) => <Chip key={meta.modeNum} meta={meta} />)}
            </div>
          </div>
        ))}

        {groups.length === 0 && (
          <div className="px-3 py-6 text-center text-content-tertiary text-xs">{t('panels:modePicker.noMatch', { query })}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export const ModePicker = memo(ModePickerImpl);
