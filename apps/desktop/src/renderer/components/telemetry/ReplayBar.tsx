import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { create } from 'zustand';
import type { ReplayStatusIpc } from '../../../shared/ipc-channels';
import { useConnectionStore } from '../../stores/connection-store';
import { useNavigationStore } from '../../stores/navigation-store';

const SPEEDS = [0.5, 1, 2, 4, 8, 16];

const useReplayStatusStore = create<{ status: ReplayStatusIpc | null; set: (s: ReplayStatusIpc | null) => void }>((set) => ({
  status: null,
  set: (status) => set({ status }),
}));

/** True while the main link is a .tlog replay. */
export function useIsReplay(): boolean {
  return useConnectionStore((s) => s.connectionState.connectionType === 'replay' && s.connectionState.isConnected);
}

export type ReplayKind = 'tlog' | 'bin';

/** Pick a log of the given kind and open it as the main link. Refuses while a live link is up so a replay never drops a vehicle. */
export async function startReplay(kind: ReplayKind): Promise<boolean> {
  const conn = useConnectionStore.getState();
  if (conn.connectionState.isConnected && conn.connectionState.connectionType !== 'replay') return false;
  const path = await window.electronAPI.tlogReplayPick?.(kind);
  if (!path) return false;
  useReplayStatusStore.getState().set(null);
  const ok = await conn.connect({ type: 'replay', replayPath: path, protocol: 'mavlink' });
  if (ok) useNavigationStore.getState().setView('telemetry');
  return ok;
}

const useReplayChooserStore = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

export function openReplayChooser(): void {
  useReplayChooserStore.getState().setOpen(true);
}

const CHOICES: { kind: ReplayKind; titleKey: string; descKey: string; accent: string; icon: string }[] = [
  { kind: 'tlog', titleKey: 'telemetry:replay.chooseTlog', descKey: 'telemetry:replay.chooseTlogDesc', accent: 'text-sky-400 bg-sky-500/10', icon: 'M8.5 16.5a5 5 0 017 0M5 13a10 10 0 0114 0M12 20h.01' },
  { kind: 'bin', titleKey: 'telemetry:replay.chooseBin', descKey: 'telemetry:replay.chooseBinDesc', accent: 'text-emerald-400 bg-emerald-500/10', icon: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z' },
];

/** Which log to replay: what the radio received, or the flight controller's own recording. */
export function ReplayChooser(): JSX.Element | null {
  const { t } = useTranslation();
  const open = useReplayChooserStore((s) => s.open);
  const setOpen = useReplayChooserStore((s) => s.setOpen);
  const liveLink = useConnectionStore((s) => s.connectionState.isConnected && s.connectionState.connectionType !== 'replay');
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);
  if (!open) return null;
  const pick = (kind: ReplayKind) => { setOpen(false); void startReplay(kind); };
  return createPortal(
    <div className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[460px] bg-surface-solid rounded-2xl border border-subtle shadow-2xl p-5">
        <div className="text-sm font-semibold text-content">{t('telemetry:replay.chooseTitle')}</div>
        <div className="mt-1 text-[12px] text-content-tertiary">{liveLink ? t('telemetry:replay.chooseBusy') : t('telemetry:replay.chooseIntro')}</div>
        <div className="mt-4 flex flex-col gap-2">
          {CHOICES.map((c) => (
            <button
              key={c.kind}
              type="button"
              disabled={liveLink}
              onClick={() => pick(c.kind)}
              className="flex items-start gap-3 rounded-xl border border-subtle bg-surface px-4 py-3 text-left hover:border-default hover:bg-surface-raised transition-colors disabled:opacity-50"
            >
              <div className={`w-9 h-9 shrink-0 rounded-lg grid place-items-center ${c.accent}`}>
                <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><path d={c.icon} /></svg>
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-content">{t(c.titleKey)}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-content-secondary">{t(c.descKey)}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => setOpen(false)} className="h-8 px-3 rounded-lg text-xs text-content-secondary hover:text-content hover:bg-surface-raised">
            {t('common:cancel')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function ReplayBar(): JSX.Element | null {
  const { t } = useTranslation();
  const isReplay = useIsReplay();
  const status = useReplayStatusStore((s) => s.status);
  const setStatus = useReplayStatusStore((s) => s.set);
  const disconnect = useConnectionStore((s) => s.disconnect);
  const [scrub, setScrub] = useState<number | null>(null);

  useEffect(() => {
    const off = window.electronAPI.onTlogReplayStatus?.((s) => setStatus(s));
    return () => { off?.(); };
  }, [setStatus]);

  if (!isReplay) return null;

  const control = async (c: Parameters<typeof window.electronAPI.tlogReplayControl>[0]) => {
    const s = await window.electronAPI.tlogReplayControl?.(c);
    if (s) setStatus(s);
  };
  const commitScrub = () => {
    if (scrub === null) return;
    void control({ action: 'seek', ms: scrub });
    setScrub(null);
  };
  const duration = status?.durationMs ?? 0;
  const position = scrub ?? status?.positionMs ?? 0;
  const playing = status?.playing ?? false;

  return (
    <div className="shrink-0 flex items-center gap-3 px-3 h-10 border-b border-subtle bg-surface-solid">
      <span
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-amber-500 border border-amber-500/40 bg-amber-500/10"
        data-tip={t('telemetry:replay.badgeTip')}
      >
        {t('telemetry:replay.badge')}
      </span>
      <span className="shrink-0 max-w-[220px] truncate font-mono text-[11px] text-content-secondary" data-tip={status?.file}>{status?.file ?? ''}</span>

      <button
        type="button"
        onClick={() => void control({ action: playing ? 'pause' : 'play' })}
        data-tip={playing ? t('telemetry:replay.pause') : status?.ended ? t('telemetry:replay.restart') : t('telemetry:replay.play')}
        className="shrink-0 w-7 h-7 grid place-items-center rounded-full bg-blue-600 text-white hover:bg-blue-500 transition-colors"
      >
        {playing ? (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
        )}
      </button>

      <span className="shrink-0 font-mono tabular-nums text-[11px] text-content">{clock(position)}</span>
      <input
        type="range"
        min={0}
        max={Math.max(1, duration)}
        step={100}
        value={Math.min(position, duration)}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commitScrub}
        onKeyUp={commitScrub}
        className="flex-1 min-w-[120px] accent-blue-500"
        aria-label={t('telemetry:replay.seek')}
      />
      <span className="shrink-0 font-mono tabular-nums text-[11px] text-content-tertiary">{clock(duration)}</span>

      <div className="shrink-0 flex items-center gap-0.5 rounded-lg border border-subtle p-0.5" data-tip={t('telemetry:replay.speedTip')}>
        {SPEEDS.map((sp) => (
          <button
            key={sp}
            type="button"
            onClick={() => void control({ action: 'speed', speed: sp })}
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
              status?.speed === sp ? 'bg-blue-500/15 text-blue-500' : 'text-content-secondary hover:bg-surface-raised hover:text-content'
            }`}
          >
            {t('telemetry:replay.speed', { speed: sp })}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void disconnect()}
        className="shrink-0 h-7 px-2.5 rounded-lg border border-subtle text-[11px] text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
      >
        {t('telemetry:replay.stop')}
      </button>
    </div>
  );
}
