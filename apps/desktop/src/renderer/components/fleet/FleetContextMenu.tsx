/**
 * Right-click menu for fleet vehicles - opened from a rail row (FleetStrip) or a map
 * marker (FleetMarkers), both writing the target into the formation store. Dark tactical
 * glass. Builds fleets explicitly: "Command this vehicle", "Create leader" (empty fleet),
 * an "Add to fleet" flyout of existing fleets, a row of one-click shape glyphs (form up
 * on THIS vehicle), and Disband / Leave fleet.
 */

import { useTranslation } from 'react-i18next';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { createPortal } from 'react-dom';
import { useFormationStore } from '../../stores/formation-store';
import { formationOf } from '../../stores/active-vehicle-store';
import { useFormationControl } from '../../hooks/useFormationControl';
import { selectActiveVehicle, type FleetVehicle } from '../../hooks/useFleet';
import { SHAPE_OPTIONS, FormationGlyph } from './FormationGlyphs';
import { TAC_GLASS, tacButton } from './tactical';

const MENU_WIDTH = 200;

function NumChip({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-1 text-[9px] uppercase tracking-wide text-content-tertiary" data-tip={t('fleet:fleetContextMenu.chipTip', { label })}>
      {label}
      <DraftNumberInput
        min={min} max={max} value={value}
        onCommit={onChange}
        className="w-9 px-1 py-0.5 text-[10px] text-center rounded bg-surface-input border border-subtle text-content"
      />
    </label>
  );
}

export function FleetContextMenu(): JSX.Element | null {
  const { t } = useTranslation();
  const menu = useFormationStore((s) => s.contextMenu);
  const close = useFormationStore((s) => s.closeContextMenu);
  const { canFollow, busy, leader, formations, configFor, setConfig, vehicles, formUp, reshapeFleet, createFleet, addToFleet, removeFromFleet, disbandFleet } = useFormationControl();

  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  // Open immediately, close on a short delay so crossing the gap into the flyout (or a
  // brief excursion off it) doesn't dismiss it mid-reach.
  const subTimer = useRef<number | null>(null);
  const openSub = () => { if (subTimer.current) window.clearTimeout(subTimer.current); subTimer.current = null; setSubOpen(true); };
  const closeSub = () => { subTimer.current = window.setTimeout(() => setSubOpen(false), 220); };

  useLayoutEffect(() => {
    if (!menu) { setPos(null); setSubOpen(false); if (subTimer.current) window.clearTimeout(subTimer.current); return; }
    const h = ref.current?.offsetHeight ?? 220;
    const left = Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8);
    const top = Math.min(menu.y, window.innerHeight - h - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu, close]);

  if (!menu) return null;
  const v = vehicles.find((x) => x.key === menu.vehicleKey);
  if (!v) return null;

  const group = formationOf(formations, v.key);
  const isLeader = group?.leaderKey === v.key;
  const isMember = group !== null;
  const isActive = leader?.key === v.key && !isMember;
  const run = (fn: () => void) => () => { fn(); close(); };
  const item = 'w-full px-2 py-1 text-left text-xs rounded text-content-secondary hover:bg-surface-raised hover:text-content transition-colors disabled:opacity-40';

  // Fleets this vehicle could join: every existing fleet except its own current one.
  const joinable = Object.keys(formations)
    .filter((lk) => lk !== v.key && lk !== group?.leaderKey)
    .map((lk) => vehicles.find((x) => x.key === lk))
    .filter((x): x is FleetVehicle => !!x)
    .sort((a, b) => a.sysid - b.sysid);
  const hasWingmen = isLeader && (group?.memberKeys.length ?? 0) >= 2;
  // Geometry of THIS fleet (falls back to the new-fleet defaults for a free vehicle),
  // so the lit glyph and the gap/alt chips describe the fleet in front of you and
  // editing them cannot touch another fleet.
  const cfg = configFor(isLeader ? v.key : null);
  const editConfig = (patch: Parameters<typeof setConfig>[1]) => setConfig(isLeader ? v.key : null, patch);
  const freeCount = vehicles.filter((x) => x.key !== v.key && formationOf(formations, x.key) === null).length;
  const subOnLeft = (pos?.left ?? menu.x) + MENU_WIDTH + 180 > window.innerWidth;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[2000]" onClick={() => close()} onContextMenu={(e) => { e.preventDefault(); close(); }} />
      <div
        ref={ref}
        className={`fixed z-[2001] py-1.5 px-1.5 rounded-lg select-none flex flex-col gap-1 ${TAC_GLASS}`}
        style={{ left: pos?.left ?? menu.x, top: pos?.top ?? menu.y, width: MENU_WIDTH, visibility: pos ? 'visible' : 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-1.5 pb-1 text-[11px] font-mono font-semibold text-content border-b border-subtle">{v.label}</div>

        <button type="button" disabled={isActive} onClick={run(() => selectActiveVehicle(v.key, v.transportId))} className={item}>
          {t('fleet:fleetContextMenu.commandVehicle')}
        </button>

        {canFollow && (
          <>
            <button type="button" disabled={busy || isLeader} onClick={run(() => { void createFleet(v.key); })} className={item}>
              {isLeader ? t('fleet:fleetContextMenu.leadsFleet') : t('fleet:fleetContextMenu.createLeader')}
            </button>

            {joinable.length > 0 && (
              <div
                className="relative"
                onMouseEnter={openSub}
                onMouseLeave={closeSub}
              >
                <button type="button" disabled={busy} onClick={() => (subOpen ? setSubOpen(false) : openSub())} className={`${item} flex items-center justify-between`}>
                  <span>{t('fleet:fleetContextMenu.addToFleet')}</span>
                  <span className="text-content-tertiary">{subOnLeft ? '◂' : '▸'}</span>
                </button>
                {subOpen && (
                  // Flush against the item (left-full/right-full, no margin) with the gap
                  // bridged by padding on this hoverable wrapper, so the pointer never
                  // crosses dead space that would trigger onMouseLeave.
                  <div className={`absolute top-0 z-[2002] ${subOnLeft ? 'right-full pr-1.5' : 'left-full pl-1.5'}`}>
                    <div className={`w-44 py-1.5 px-1.5 rounded-lg flex flex-col gap-1 ${TAC_GLASS}`}>
                      {joinable.map((f) => (
                        <button key={f.key} type="button" disabled={busy} onClick={run(() => { void addToFleet(f.key, v.key); })} className={item}>
                          {t('fleet:fleetContextMenu.join', { label: f.label })}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Formation shape: only a leader WITH wingmen can be reshaped. Guarding the
                glyphs to this case means a stray click in a free/wingman menu can never
                command the fleet into motion; the lit current shape is a no-op. */}
            {hasWingmen && (
              <>
                <div className="flex items-center justify-between gap-2 px-1.5 pt-1">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-content-tertiary">{t('fleet:fleetContextMenu.formationShape')}</span>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <NumChip label={t('fleet:fleetContextMenu.gap')} value={cfg.spacing} min={2} max={500} onChange={(spacing) => editConfig({ spacing })} />
                    <NumChip label={t('fleet:fleetContextMenu.alt')} value={cfg.altStep} min={0} max={100} onChange={(altStep) => editConfig({ altStep })} />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1 px-0.5">
                  {SHAPE_OPTIONS.map((o) => {
                    const lit = cfg.shape === o.value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        disabled={busy || lit}
                        onClick={run(() => { void reshapeFleet(v.key, o.value); })}
                        data-tip={lit ? t('fleet:fleetContextMenu.currentShape', { label: t(o.labelKey) }) : t('fleet:fleetContextMenu.reformShape', { label: t(o.labelKey) })}
                        className={`grid place-items-center aspect-square rounded border transition-colors disabled:opacity-60 ${tacButton(lit)}`}
                      >
                        <FormationGlyph shape={o.value} size={20} />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Leader-only fleet: an explicit, labelled way to pull in the free drones -
                no ambiguous icon that fires a maneuver on a stray click. */}
            {isLeader && !hasWingmen && freeCount > 0 && (
              <button type="button" disabled={busy} onClick={run(() => { void formUp(undefined, v.key); })} className={item}>
                {t('fleet:fleetContextMenu.formUp', { count: freeCount })}
              </button>
            )}

            {isMember && (
              <button
                type="button"
                disabled={busy}
                onClick={run(() => { void (isLeader ? disbandFleet(v.key) : removeFromFleet(v.key)); })}
                data-tip={isLeader ? t('fleet:fleetContextMenu.disbandTip') : t('fleet:fleetContextMenu.leaveTip', { label: v.label })}
                className="w-full mt-0.5 px-2 py-1 text-left text-xs rounded text-amber-500 hover:bg-amber-500/15 transition-colors disabled:opacity-40"
              >
                {isLeader ? t('fleet:fleetContextMenu.disband') : t('fleet:fleetContextMenu.leave')}
              </button>
            )}
          </>
        )}
      </div>
    </>,
    document.body,
  );
}
