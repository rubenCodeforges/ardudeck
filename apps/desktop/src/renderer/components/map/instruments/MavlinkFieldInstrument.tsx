import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import { X } from 'lucide-react';
import { acquireInspectorFields, getInspectorSnapshot, useInspectorStore, type MessageStats } from '../../../stores/inspector-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { GAUGE_COLORS } from './RoundGauge';
import { useInDock } from './dock-context';

/** One field the pilot pinned to the map, by MAVLink message and field name. */
export interface FieldPick {
  message: string;
  field: string;
}

export const MAX_FIELD_PICKS = 6;
const STORAGE_KEY = 'ardudeck.instrument.mavlinkFields';
/** Samples kept per field for the sparkline: 60 at the inspector's 4 Hz tick is 15 s. */
const SPARK_SAMPLES = 60;

function loadPicks(): FieldPick[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((p): p is FieldPick => !!p && typeof p.message === 'string' && typeof p.field === 'string')
      .slice(0, MAX_FIELD_PICKS);
  } catch {
    return [];
  }
}

function savePicks(picks: FieldPick[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
  } catch {
    // storage blocked: the picks live for this session only
  }
}

interface FieldPicksState {
  picks: FieldPick[];
  add: (pick: FieldPick) => void;
  remove: (index: number) => void;
}

export const useFieldPicksStore = create<FieldPicksState>((set, get) => ({
  picks: loadPicks(),
  add: (pick) => {
    const cur = get().picks;
    if (cur.length >= MAX_FIELD_PICKS || cur.some((p) => p.message === pick.message && p.field === pick.field)) return;
    const picks = [...cur, pick];
    savePicks(picks);
    set({ picks });
  },
  remove: (index) => {
    const picks = get().picks.filter((_, i) => i !== index);
    savePicks(picks);
    set({ picks });
  },
}));

/** A field as a number, or null when it is missing or not numeric (strings, arrays). */
export function numericField(fields: Record<string, unknown> | null, name: string): number | null {
  const v = fields?.[name];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'bigint') return Number(v);
  return null;
}

/** The message stream for a name: the connected vehicle's autopilot first, then any sender. */
export function streamFor(flat: readonly MessageStats[], message: string, sysid: number | undefined): MessageStats | undefined {
  const named = flat.filter((s) => s.name === message);
  return named.find((s) => s.sysid === sysid && s.compid === 1)
    ?? named.find((s) => s.sysid === sysid)
    ?? named[0];
}

function formatValue(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  return v.toFixed(a >= 100 ? 1 : a >= 1 ? 2 : 3);
}

function Sparkline({ samples }: { samples: number[] }): JSX.Element | null {
  if (samples.length < 2) return null;
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const span = max - min || 1;
  const w = 64;
  const h = 18;
  const pts = samples.map((v, i) => `${((i / (samples.length - 1)) * w).toFixed(1)},${(h - ((v - min) / span) * h).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} className="shrink-0" aria-hidden>
      <polyline points={pts} fill="none" stroke={GAUGE_COLORS.green} strokeWidth={1.25} />
    </svg>
  );
}

/** Any MAVLink field the pilot picks, live on the map, each with a 15 s sparkline. */
export function MavlinkFieldInstrument(): JSX.Element {
  const { t } = useTranslation();
  const inDock = useInDock();
  const picks = useFieldPicksStore((s) => s.picks);
  const sysid = useConnectionStore((s) => s.connectionState.systemId);
  const tick = useInspectorStore((s) => s.tick);
  const history = useRef(new Map<string, number[]>());

  // The inspector only decodes fields while someone reads them.
  useEffect(() => (picks.length > 0 ? acquireInspectorFields() : undefined), [picks.length]);

  const flat = getInspectorSnapshot().flat;
  const rows = picks.map((p) => {
    const key = `${p.message}.${p.field}`;
    const value = numericField(streamFor(flat, p.message, sysid)?.fields ?? null, p.field);
    return { key, pick: p, value, samples: history.current.get(key) ?? [] };
  });

  // One sample per inspector tick, outside render so a double render cannot count twice.
  useEffect(() => {
    for (const r of rows) {
      if (r.value === null) continue;
      const buf = history.current.get(r.key) ?? [];
      buf.push(r.value);
      if (buf.length > SPARK_SAMPLES) buf.shift();
      history.current.set(r.key, buf);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sample once per tick
  }, [tick]);

  return (
    <div
      className={`select-none px-3 pt-2 pb-2.5 ${inDock ? '' : 'rounded-lg shadow-xl'}`}
      style={{ ...(inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }), width: 240 }}
    >
      <div className="mb-1.5 text-[9px] font-semibold tracking-[0.14em] leading-none" style={{ color: GAUGE_COLORS.textDim }}>
        {t('map:mavlinkFieldInstrument.title')}
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] leading-snug" style={{ color: GAUGE_COLORS.tickMinor }}>{t('map:mavlinkFieldInstrument.empty')}</div>
      ) : (
        <div className="flex flex-col gap-1">
          {rows.map((r) => (
            <div key={r.key} className="flex items-center gap-2 min-w-0">
              <div className="min-w-0 flex-1">
                <div className="text-[9px] leading-none truncate" style={{ color: GAUGE_COLORS.textDim }}>{r.pick.message}</div>
                <div className="text-[11px] leading-tight truncate" style={{ color: GAUGE_COLORS.text }}>{r.pick.field}</div>
              </div>
              <Sparkline samples={r.samples} />
              <div className="w-16 text-right text-[15px] font-bold tabular-nums" style={{ color: r.value === null ? GAUGE_COLORS.tickMinor : GAUGE_COLORS.text }}>
                {r.value === null ? t('map:mavlinkFieldInstrument.noData') : formatValue(r.value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The field picker, from the messages the vehicle is sending right now. */
export function MavlinkFieldSettings(): JSX.Element {
  const { t } = useTranslation();
  const picks = useFieldPicksStore((s) => s.picks);
  const add = useFieldPicksStore((s) => s.add);
  const remove = useFieldPicksStore((s) => s.remove);
  const sysid = useConnectionStore((s) => s.connectionState.systemId);
  const tick = useInspectorStore((s) => s.tick);
  const [message, setMessage] = useState('');
  const [field, setField] = useState('');

  useEffect(() => acquireInspectorFields(), []);

  const flat = getInspectorSnapshot().flat;
  const messages = useMemo(
    () => [...new Set(flat.filter((s) => s.fields).map((s) => s.name))].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the snapshot changes with the tick
    [tick],
  );
  const fields = useMemo(() => {
    const f = streamFor(flat, message, sysid)?.fields ?? null;
    return f ? Object.keys(f).filter((k) => numericField(f, k) !== null).sort() : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the snapshot changes with the tick
  }, [message, sysid, tick]);
  const full = picks.length >= MAX_FIELD_PICKS;

  const select = 'w-full h-8 px-2 bg-surface-input border border-subtle rounded-md text-sm text-content focus:outline-none focus:border-blue-500';
  return (
    <div className="p-4 space-y-3">
      <div className="space-y-1">
        {picks.length === 0 && <div className="text-xs text-content-tertiary">{t('map:mavlinkFieldInstrument.empty')}</div>}
        {picks.map((p, i) => (
          <div key={`${p.message}.${p.field}`} className="flex items-center gap-2 text-sm">
            <span className="font-mono text-content-secondary">{p.message}</span>
            <span className="font-mono text-content">{p.field}</span>
            <button
              type="button"
              onClick={() => remove(i)}
              className="ml-auto w-6 h-6 rounded flex items-center justify-center text-content-tertiary hover:text-content hover:bg-surface-raised"
              data-tip={t('common:remove')}
              aria-label={t('common:remove')}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select className={select} value={message} onChange={(e) => { setMessage(e.target.value); setField(''); }} disabled={full}>
          <option value="">{t('map:mavlinkFieldInstrument.pickMessage')}</option>
          {messages.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={select} value={field} onChange={(e) => setField(e.target.value)} disabled={full || !message}>
          <option value="">{t('map:mavlinkFieldInstrument.pickField')}</option>
          {fields.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-content-tertiary">
          {messages.length === 0 ? t('map:mavlinkFieldInstrument.noMessages') : t('map:mavlinkFieldInstrument.limit', { max: MAX_FIELD_PICKS })}
        </span>
        <button
          type="button"
          disabled={full || !message || !field}
          onClick={() => { add({ message, field }); setField(''); }}
          className="ml-auto h-8 px-3 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 disabled:opacity-40"
        >
          {t('map:mavlinkFieldInstrument.add')}
        </button>
      </div>
    </div>
  );
}
