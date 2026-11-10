import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHazardsStore } from '../stores/hazards-store';
import { useSelectedHazard } from './attachHazardsLayer';
import { useObjectsStore } from './objects-store';
import { objectWorldRing, type EditorObject } from './area-object';
import { MIN_PIN_LENGTH, type ZoneShape } from '../../shared/hazard-types';

const LOCK = (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
);
const INPUT = 'w-full h-7 px-2 rounded-md bg-surface-input border border-subtle text-xs text-content focus:outline-none focus:border-blue-500';
const BTN = 'h-7 px-2.5 rounded-md border border-subtle text-[11px] text-content-secondary hover:text-content hover:bg-surface-raised disabled:opacity-40';

function shapeOf(obj: EditorObject): ZoneShape {
  const ring = objectWorldRing(obj);
  if (obj.type === 'circle') {
    const r = Math.hypot((ring[0]!.lat - obj.center.lat) * 111_320, (ring[0]!.lng - obj.center.lng) * 111_320 * Math.cos((obj.center.lat * Math.PI) / 180));
    return { kind: 'circle', center: { lat: obj.center.lat, lon: obj.center.lng }, radiusM: r };
  }
  return { kind: 'polygon', points: ring.map((p) => ({ lat: p.lat, lon: p.lng })) };
}

type PinError = 'locked' | 'no-pin' | 'bad-pin' | 'weak-pin' | 'invalid' | 'throttled' | 'unreadable';

function useErrorText(): (error?: string) => string {
  const { t } = useTranslation();
  return (error) => {
    if (error === 'bad-pin') return t('area-editor:hazards.wrongPin');
    if (error === 'throttled') return t('area-editor:hazards.throttled');
    if (error === 'weak-pin') return t('area-editor:hazards.weakPin', { min: MIN_PIN_LENGTH });
    if (error === 'locked' || error === 'no-pin') return t('area-editor:hazards.needUnlock');
    if (error === 'invalid' || error === 'unreadable') return t('area-editor:hazards.importInvalid');
    return t('area-editor:hazards.failed');
  };
}

/** Admin PIN: set it once, unlock to edit, lock again. Pilots without the PIN see hazards read-only. */
function PinBar(): JSX.Element {
  const { t } = useTranslation();
  const status = useHazardsStore((s) => s.status);
  const errorText = useErrorText();
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const run = async (call: (pin: string) => Promise<{ success: boolean; error?: PinError }>) => {
    const r = await call(pin);
    setError(r.success ? null : errorText(r.error));
    if (r.success) setPin('');
    await useHazardsStore.getState().refresh();
  };

  if (status.unlocked) {
    return (
      <div className="px-3 pt-1 flex items-center gap-2">
        <span className="text-[10px] text-emerald-500 flex-1">{t('area-editor:hazards.unlockedNote')}</span>
        <button type="button" className={BTN} onClick={() => void window.electronAPI.hazardsRelock()}>{t('area-editor:hazards.relock')}</button>
      </div>
    );
  }
  return (
    <div className="px-3 pt-1 space-y-1">
      <p className="text-[10px] text-content-secondary">{status.hasPin ? t('area-editor:hazards.lockedNote') : t('area-editor:hazards.noPinNote')}</p>
      <div className="flex gap-1.5">
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void run(status.hasPin ? window.electronAPI.hazardsUnlock : window.electronAPI.hazardsSetPin); }}
          placeholder={status.hasPin ? t('area-editor:hazards.pinPlaceholder') : t('area-editor:hazards.newPinPlaceholder', { min: MIN_PIN_LENGTH })}
          aria-label={t('area-editor:hazards.pinPlaceholder')}
          className={INPUT}
        />
        <button type="button" className={BTN} disabled={pin.length === 0} onClick={() => void run(status.hasPin ? window.electronAPI.hazardsUnlock : window.electronAPI.hazardsSetPin)}>
          {status.hasPin ? t('area-editor:hazards.unlock') : t('area-editor:hazards.setPin')}
        </button>
      </div>
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <p className="text-[10px] text-content-tertiary">{t('area-editor:hazards.cloudSoon')}</p>
    </div>
  );
}

/** Turns the selected area into a hazard. Needs the admin PIN to have been entered. */
export function HazardForm({ obj }: { obj: EditorObject }): JSX.Element {
  const { t } = useTranslation();
  const unlocked = useHazardsStore((s) => s.status.unlocked);
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(obj.name);
  const [reason, setReason] = useState('');
  const [buffer, setBuffer] = useState('15');
  const [asFence, setAsFence] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const add = async () => {
    const bufferM = Number(buffer);
    if (!Number.isFinite(bufferM) || bufferM < 0) { setError(t('area-editor:hazards.badBuffer')); return; }
    setBusy(true);
    setError(null);
    try {
      const r = await window.electronAPI.hazardsAdd({
        id: crypto.randomUUID(),
        name: name.trim() || obj.name,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
        shape: shapeOf(obj),
        bufferM,
        uploadAsFence: asFence,
        createdAt: Date.now(),
      });
      if (!r.success) { setError(errorText(r.error)); return; }
      useObjectsStore.getState().deleteObject(obj.id);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full h-7 flex items-center justify-center gap-1.5 rounded-md border border-red-500/50 text-[11px] font-medium text-red-400 hover:bg-red-500/10"
          data-tip={t('area-editor:hazards.convertTip')}
        >
          {LOCK}{t('area-editor:hazards.convert')}
        </button>
      </div>
    );
  }
  return (
    <div className="px-3 pb-2 space-y-1.5">
      <div className="text-[10px] font-medium text-content-tertiary uppercase tracking-wide flex items-center gap-1">{LOCK}{t('area-editor:hazards.formTitle')}</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('area-editor:hazards.name')} className={INPUT} aria-label={t('area-editor:hazards.name')} />
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('area-editor:hazards.reason')} className={INPUT} aria-label={t('area-editor:hazards.reason')} />
      <label className="flex items-center gap-2 text-[11px] text-content-secondary">
        {t('area-editor:hazards.buffer')}
        <input value={buffer} onChange={(e) => setBuffer(e.target.value)} inputMode="decimal" className="w-14 h-6 px-1.5 rounded bg-surface-input border border-subtle text-xs text-content" />
      </label>
      <label className="flex items-center gap-2 text-[11px] text-content-secondary">
        <input type="checkbox" checked={asFence} onChange={(e) => setAsFence(e.target.checked)} />
        {t('area-editor:hazards.uploadAsFence')}
      </label>
      {!unlocked && <p className="text-[10px] text-amber-500">{t('area-editor:hazards.needUnlock')}</p>}
      {error && <p className="text-[10px] text-red-400">{error}</p>}
      <div className="flex gap-1.5">
        <button type="button" disabled={busy || !unlocked} onClick={() => void add()} className="flex-1 h-7 rounded-md bg-red-600 hover:bg-red-500 text-white text-[11px] font-medium disabled:opacity-40">
          {t('area-editor:hazards.add')}
        </button>
        <button type="button" className={BTN} onClick={() => setOpen(false)}>{t('common:cancel')}</button>
      </div>
    </div>
  );
}

/** All hazards, always visible: admin PIN, export and import, the list and the card of the one selected. */
export function HazardsSection(): JSX.Element {
  const { t } = useTranslation();
  const hazards = useHazardsStore((s) => s.hazards);
  const unlocked = useHazardsStore((s) => s.status.unlocked);
  const selectedId = useSelectedHazard((s) => s.id);
  const select = useSelectedHazard((s) => s.select);
  const errorText = useErrorText();
  const [note, setNote] = useState<string | null>(null);
  const selected = hazards.find((h) => h.id === selectedId) ?? null;

  const remove = async () => {
    if (!selected) return;
    const r = await window.electronAPI.hazardsRemove(selected.id);
    if (r.success) select(null);
    else setNote(errorText(r.error));
  };
  const exportFile = async () => {
    const r = await window.electronAPI.hazardsExport();
    if (!r.success && r.error !== 'Cancelled') setNote(errorText(r.error));
  };
  const importFile = async () => {
    const r = await window.electronAPI.hazardsImport();
    if (r.success) setNote(t('area-editor:hazards.imported'));
    else if (r.error !== 'Cancelled') setNote(errorText(r.error));
  };

  return (
    <div className="border-t border-subtle pb-1">
      <div className="px-3 pt-2 text-[10px] font-medium text-content-tertiary uppercase tracking-wide flex items-center gap-1">
        {LOCK}{hazards.length > 0 ? t('area-editor:hazards.title', { count: hazards.length }) : t('area-editor:hazards.titleEmpty')}
      </div>
      <p className="px-3 pt-1 text-[10px] text-content-secondary">{t('area-editor:hazards.howTo')}</p>
      <PinBar />
      <div className="px-3 pt-1.5 flex gap-1.5">
        <button type="button" className={BTN} data-tip={t('area-editor:hazards.exportTip')} onClick={() => void exportFile()}>{t('area-editor:hazards.export')}</button>
        <button type="button" className={BTN} data-tip={t('area-editor:hazards.importTip')} onClick={() => void importFile()}>{t('area-editor:hazards.import')}</button>
      </div>
      {note && <p className="px-3 pt-1 text-[10px] text-content-secondary">{note}</p>}
      <div className="py-1">
        {hazards.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => select(h.id === selectedId ? null : h.id)}
            className={`w-full flex items-center gap-2 px-3 py-1 text-left text-xs ${h.id === selectedId ? 'bg-red-500/10' : 'hover:bg-surface-raised'}`}
          >
            <span className="text-red-400">{LOCK}</span>
            <span className="flex-1 min-w-0 truncate text-content">{h.name}</span>
          </button>
        ))}
      </div>
      {selected && (
        <div className="mx-3 mb-2 p-2.5 rounded-lg border border-red-500/40 bg-red-500/5 space-y-1.5">
          <span className="block text-xs font-semibold text-content truncate">{selected.name}</span>
          <p className="text-[10px] text-content-secondary">{t('area-editor:hazards.addedOn', { date: new Date(selected.createdAt).toLocaleDateString() })}</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
            <span className="text-content-tertiary">{t('area-editor:hazards.buffer')}</span><span className="text-content">{selected.bufferM} m</span>
            {selected.reason && <><span className="text-content-tertiary">{t('area-editor:hazards.reason')}</span><span className="text-content">{selected.reason}</span></>}
            <span className="text-content-tertiary">{t('area-editor:hazards.uploadAsFence')}</span><span className="text-content">{selected.uploadAsFence ? t('area-editor:hazards.yes') : t('area-editor:hazards.no')}</span>
          </div>
          <button type="button" disabled={!unlocked} onClick={() => void remove()} className="w-full h-7 rounded-md border border-subtle text-[11px] text-content-secondary hover:text-content hover:bg-surface-raised disabled:opacity-40">
            {t('area-editor:hazards.delete')}
          </button>
          {!unlocked && <p className="text-[10px] text-content-tertiary">{t('area-editor:hazards.deleteNeedsPin')}</p>}
        </div>
      )}
    </div>
  );
}
