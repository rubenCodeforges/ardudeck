import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useMissionStore, useFcSeqOffset } from '../../stores/mission-store';
import { Stepper } from './Stepper';

/** Where the picker opens: below a readout, or at a clicked map point. */
export interface PickerAnchor { x: number; y: number }

/**
 * Retarget the mission: choose a waypoint and the FC continues from it (AUTO diverts at once).
 * Same shell, stepper, segment and send row as the map command popup. Built for 100+ waypoint
 * surveys: a stepper and group ranges, never a button per waypoint.
 */
export function WaypointPicker({ count, current, initial, anchor, onClose }: {
  count: number;
  /** 0-based waypoint the vehicle is on, if known. */
  current: number | null;
  /** 0-based waypoint to start from (a clicked pin); defaults to current. */
  initial?: number;
  anchor: PickerAnchor;
  onClose: () => void;
}): JSX.Element {
  const { t } = useTranslation();
  const fcSeqOffset = useFcSeqOffset();
  const storeItems = useMissionStore((s) => s.missionItems);
  const storeGroups = useMissionStore((s) => s.groups);
  const [wp, setWp] = useState(Math.min(count, Math.max(1, (initial ?? current ?? 0) + 1)));
  const [note, setNote] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: anchor.x, top: anchor.y, ready: false });

  // Group ranges only when the plan on screen is the plan on the vehicle (same length).
  const groups = useMemo(() => {
    if (storeItems.length !== count) return [];
    const out: { id: string; name: string; first: number; last: number }[] = [];
    storeItems.forEach((it, i) => {
      if (!it.groupId) return;
      const g = out.find((x) => x.id === it.groupId);
      if (g) g.last = i + 1;
      else out.push({ id: it.groupId, name: storeGroups.find((x) => x.id === it.groupId)?.name ?? '', first: i + 1, last: i + 1 });
    });
    return out;
  }, [storeItems, storeGroups, count]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(12, Math.min(window.innerWidth - r.width - 12, anchor.x)),
      top: Math.max(12, Math.min(window.innerHeight - r.height - 12, anchor.y)),
      ready: true,
    });
  }, [anchor.x, anchor.y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Ring the chosen waypoint on the map while the picker is open.
  useEffect(() => { useMissionStore.getState().setSelectedSeq(wp - 1); }, [wp]);
  useEffect(() => () => useMissionStore.getState().setSelectedSeq(null), []);

  const fly = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await window.electronAPI.setCurrentWaypoint(wp - 1 + fcSeqOffset);
      if (res?.success) { setNote({ text: t('map:instrument.flyingToWp', { n: wp }), ok: true }); setTimeout(onClose, 900); }
      else setNote({ text: res?.error ?? t('map:instrument.jumpFailed'), ok: false });
    } catch {
      setNote({ text: t('map:instrument.jumpFailed'), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const quick: { label: string; to: number }[] = [
    { label: t('map:instrument.wpFirst'), to: 1 },
    ...(current !== null ? [{ label: t('map:instrument.wpCurrent'), to: current + 1 }] : []),
    { label: t('map:instrument.wpLast'), to: count },
  ];

  return createPortal(
    <>
      <div className="fixed inset-0 z-[1999]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-label={t('map:instrument.pickWp')}
        className="tactical-command-popup fixed z-[2000] pointer-events-auto rounded-xl shadow-2xl border border-strong bg-surface-overlay backdrop-blur-md p-2 w-[300px] overflow-y-auto overscroll-contain"
        style={{ left: pos.left, top: pos.top, maxHeight: 'calc(100vh - 24px)', visibility: pos.ready ? 'visible' : 'hidden' }}
        onKeyDown={(e) => { if (e.key === 'Enter') void fly(); }}
      >
        <div className="w-full text-xs">
          <div className="flex items-baseline justify-between gap-2 border-b border-subtle px-1 pb-2 mb-2">
            <span className="text-[11px] font-medium text-content">{t('map:instrument.pickWp')}</span>
            <span className="text-[10px] text-content-tertiary shrink-0">{t('map:instrument.wpRange', { count })}</span>
          </div>

          <div className="rounded-lg border border-subtle bg-surface-raised px-2.5 pb-2.5 pt-2">
            <Stepper value={wp} onChange={(v) => setWp(Math.round(v))} min={1} max={count} step={1} autoFocus />
            <div className="mt-2 flex h-7 items-stretch overflow-hidden rounded-lg border border-subtle">
              {quick.map((q, i) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setWp(q.to)}
                  className={`flex-1 text-[10.5px] transition-colors ${i > 0 ? 'border-l border-subtle' : ''} ${
                    wp === q.to ? 'bg-surface-raised font-semibold text-content' : 'bg-surface-input text-content-secondary hover:text-content'
                  }`}
                >
                  {q.label}
                </button>
              ))}
            </div>

            {groups.length > 0 && (
              <div className="mt-2 grid gap-1.5 max-h-[150px] overflow-y-auto">
                {groups.map((g) => {
                  const sel = wp >= g.first && wp <= g.last;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setWp(g.first)}
                      className={`flex items-center gap-2 rounded-[10px] border px-2 py-1.5 text-left transition-colors ${
                        sel ? 'border-cyan-500/70 bg-cyan-500/10' : 'border-subtle bg-surface-raised hover:border-strong'
                      }`}
                    >
                      <span className="flex-1 min-w-0 truncate text-[10.5px] font-medium text-content">{g.name || t('map:instrument.wpGroup')}</span>
                      <span className="font-mono text-[9.5px] text-content-tertiary">{g.first}-{g.last}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {note && (
              <div className={`mt-1.5 rounded-md border px-2 py-1 text-[10px] leading-snug ${note.ok ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500' : 'border-rose-500/40 bg-rose-500/10 text-rose-500'}`}>
                {note.text}
              </div>
            )}

            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void fly()}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors ${busy ? 'cursor-not-allowed bg-surface-input !text-content-tertiary' : 'bg-cyan-600 hover:bg-cyan-500'}`}
              >
                {t('map:instrument.flyToWp', { n: wp })}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
