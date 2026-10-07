// The camera's own settings, edited over its Ethernet lead in a dialog you move off the part of the feed you watch.

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Aperture, Cable, Check, ChevronRight, Film, FlipHorizontal2, FlipVertical2,
  HardDrive, Loader2, RadioTower, RefreshCw, Search, SunMedium, X,
} from 'lucide-react';
import { useCameraStore } from '../../../stores/camera-store';
import { useDraggableOverlay } from '../../map/useDraggableOverlay';
import type { CameraSourceConfig } from '../../../../shared/camera-types';
import type { CameraSettingValue, CameraSettingsSnapshot } from '../../../../shared/camera-settings-types';
import {
  BITRATES_KBPS, CHANNEL_BANDS, TX_POWER_LEVELS, VIDEO_MODES, WIFILINK_DEFAULT_HOST, WIFILINK_DEFAULT_PASSWORD,
  WIFILINK_DEFAULT_USER, channelMhz, dbmToMw, wifilinkField,
} from '../../../../shared/wifilink-settings';
import { FieldRow, Section, Segmented, StepSlider, Switch, Tag } from './settings-controls';
import { Trans, useTranslation } from 'react-i18next';

const LABEL_KEYS: Record<string, string> = {
  'video.mode': 'camera:settings.label.resolution',
  'video.codec': 'camera:settings.label.codec',
  'video.bitrate': 'camera:settings.label.bitrate',
  'image.luminance': 'camera:settings.label.brightness',
  'image.contrast': 'camera:settings.label.contrast',
  'image.saturation': 'camera:settings.label.saturation',
  'image.hue': 'camera:settings.label.hue',
  'image.mirror': 'camera:settings.label.mirror',
  'image.flip': 'camera:settings.label.flip',
  'image.rotate': 'camera:settings.label.rotation',
  'radio.channel': 'camera:settings.label.channel',
  'radio.txpower': 'camera:settings.label.power',
  'radio.mcs': 'camera:settings.label.mcs',
  'radio.stbc': 'camera:settings.label.stbc',
  'radio.ldpc': 'camera:settings.label.ldpc',
  'telemetry.protocol': 'camera:settings.label.telemetry',
  'records.enabled': 'camera:settings.label.sdRecording',
};

const mbps = (kbps: number) => {
  const v = kbps / 1024;
  return Number.isInteger(v) ? `${v}` : v.toFixed(1);
};

const modeLabel = (mode: CameraSettingValue | undefined) => {
  const m = VIDEO_MODES.find((v) => v.value === mode);
  return m ? `${m.size === '1920x1080' ? '1080p' : '720p'} · ${m.fps} fps` : String(mode ?? '');
};

const powerLabel = (level: CameraSettingValue | undefined) => {
  const p = TX_POWER_LEVELS.find((l) => l.value === level);
  return p ? `${p.dbm} dBm · ${dbmToMw(p.dbm)} mW` : String(level ?? '');
};

type Phase = 'connect' | 'ready' | 'applying';
type Outcome = { tone: 'ok' | 'warn' | 'error'; text: string };

export function CameraSettingsDialog({ source, onClose }: { source: CameraSourceConfig; onClose: () => void }) {
  const { t } = useTranslation();
  const updateSource = useCameraStore((s) => s.updateSource);
  const requestReconnect = useCameraStore((s) => s.requestReconnect);

  const [phase, setPhase] = useState<Phase>('connect');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<CameraSettingsSnapshot | null>(null);
  const [draft, setDraft] = useState<Record<string, CameraSettingValue>>({});
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [switchReceiver, setSwitchReceiver] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const drag = useDraggableOverlay('camera-settings-dialog', undefined, { announce: false });

  useEffect(() => () => { void window.electronAPI.cameraSettingsDisconnect(); }, []);
  useEffect(() => {
    if (!confirmClose) return;
    const t = setTimeout(() => setConfirmClose(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClose]);

  const dirtyIds = Object.keys(draft);
  const dirty = dirtyIds.length > 0;

  const value = (id: string) => (id in draft ? draft[id] : snapshot?.values[id]);
  const set = (id: string, v: CameraSettingValue) => {
    setOutcome(null);
    setDraft((d) => {
      const next = { ...d };
      if (snapshot?.values[id] === v) delete next[id];
      else next[id] = v;
      return next;
    });
  };
  const revert = (id: string) => setDraft(({ [id]: _, ...rest }) => rest);
  const field = (id: string) => ({
    modified: id in draft,
    onRevert: () => revert(id),
    locked: snapshot?.unavailable[id] ?? (snapshot?.device.readOnly ? t('camera:settings.readOnly') : undefined),
  });

  const onConnected = (snap: CameraSettingsSnapshot) => {
    setSnapshot(snap);
    setDraft({});
    setConnectError(null);
    setPhase('ready');
    if (source.settingsHost !== snap.device.host) updateSource(source.id, { settingsHost: snap.device.host });
  };

  const reread = async () => {
    const r = await window.electronAPI.cameraSettingsRefresh()
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : t('camera:settings.lostCamera') }));
    if (r.ok) { setSnapshot(r.snapshot); setOutcome(null); }
    else { setConnectError(r.error); setSnapshot(null); setPhase('connect'); }
  };

  const apply = async () => {
    setPhase('applying');
    setOutcome(null);
    const changes = { ...draft };
    const r = await window.electronAPI.cameraSettingsApply(changes)
      .catch((e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : t('camera:settings.lostCamera'), mismatched: [] as string[], snapshot: undefined }));
    if (r.snapshot) setSnapshot(r.snapshot);
    setPhase('ready');
    if (!r.ok && r.mismatched.length === 0) {
      setOutcome({ tone: 'error', text: r.error ?? t('camera:settings.notTaken') });
      return;
    }
    const stuck = Object.keys(changes).filter((id) => !r.mismatched.includes(id));
    setDraft(Object.fromEntries(r.mismatched.map((id) => [id, changes[id]!])));

    // Keep this computer's side of the link in step with what the camera now does.
    if (stuck.includes('video.codec')) {
      updateSource(source.id, { wfbCodec: changes['video.codec'] as 'h265' | 'h264' });
      requestReconnect(source.id);
    }
    if (stuck.includes('radio.channel') && switchReceiver && source.wfbMode !== 'network') {
      await window.electronAPI.wfbngSetOptions({ channel: changes['radio.channel'] as number });
    }

    if (r.mismatched.length > 0) {
      setOutcome({ tone: 'warn', text: t('camera:settings.didNotStick', { names: r.mismatched.map((id) => (LABEL_KEYS[id] ? t(LABEL_KEYS[id]) : id)).join(', ') }) });
      return;
    }
    const restartsLink = stuck.some((id) => wifilinkField(id)?.effect === 'link-restart');
    setOutcome({
      tone: 'ok',
      text: stuck.includes('radio.txpower')
        ? t('camera:settings.savedPower')
        : restartsLink ? t('camera:settings.savedLinkRestart') : t('camera:settings.savedOnCamera'),
    });
  };

  const requestClose = () => {
    if (dirty && !confirmClose) { setConfirmClose(true); return; }
    onClose();
  };

  return (
    <div
      ref={drag.ref}
      style={drag.style}
      className="absolute right-3 top-3 z-40 flex max-h-[calc(100%-1.5rem)] w-[22rem] max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-xl border border-default bg-surface-solid shadow-2xl"
    >
      <Header
        onDragStart={drag.onPointerDown}
        snapshot={phase === 'connect' ? null : snapshot}
        onReread={reread}
        busy={phase === 'applying'}
        confirmClose={confirmClose}
        dirtyCount={dirtyIds.length}
        onClose={requestClose}
      />

      {phase === 'connect' ? (
        <CameraFinder lastHost={source.settingsHost} initialError={connectError} onConnected={onConnected} />
      ) : snapshot && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DeviceNotes snapshot={snapshot} />
            <VideoSection value={value} set={set} field={field} />
            <ImageSection value={value} set={set} field={field} />
            <RadioSection
              value={value} set={set} field={field}
              channelChanged={'radio.channel' in draft}
              canSwitchReceiver={source.wfbMode !== 'network'}
              switchReceiver={switchReceiver} setSwitchReceiver={setSwitchReceiver}
            />
            <Section icon={<HardDrive className="h-3 w-3" />} title={t('camera:settings.recording')}>
              <FieldRow label={t('camera:settings.label.sdRecording')} {...field('records.enabled')} hint={t('camera:settings.sdRecordingHint')}>
                <Switch label={t('camera:settings.label.sdRecording')} checked={value('records.enabled') === true} onChange={(v) => set('records.enabled', v)} />
              </FieldRow>
            </Section>
          </div>
          <Footer
            dirtyIds={dirtyIds}
            applying={phase === 'applying'}
            outcome={outcome}
            onDiscard={() => { setDraft({}); setOutcome(null); }}
            onApply={apply}
          />
        </>
      )}
    </div>
  );
}

function Header({ onDragStart, snapshot, onReread, busy, confirmClose, dirtyCount, onClose }: {
  onDragStart: (e: React.PointerEvent) => void;
  snapshot: CameraSettingsSnapshot | null;
  onReread: () => void;
  busy: boolean;
  confirmClose: boolean;
  dirtyCount: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const d = snapshot?.device;
  return (
    <div
      onPointerDown={onDragStart}
      className="flex shrink-0 touch-none cursor-grab select-none items-center gap-2.5 border-b border-subtle px-3 py-2.5 active:cursor-grabbing"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15">
        <Aperture className="h-4 w-4 text-sky-400" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-content">{t('camera:settings.wifilinkCamera')}</div>
        <div className="flex items-center gap-1.5 truncate text-[10px] text-content-secondary">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${d ? 'bg-emerald-400' : 'bg-content-tertiary'}`} />
          {d ? <>{d.host}{d.firmware && <> · {t('camera:settings.firmware', { version: d.firmware })}</>}</> : t('camera:settings.notConnected')}
        </div>
      </div>
      {d && (
        <button
          onClick={onReread}
          disabled={busy}
          className="flex h-6 w-6 items-center justify-center rounded text-content-secondary hover:bg-surface-raised disabled:opacity-40"
          data-tip={t('camera:settings.rereadTip')}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
      {confirmClose ? (
        <button onClick={onClose} className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-medium text-red-400 hover:bg-red-500/25">
          {t('camera:settings.discardChanges', { count: dirtyCount })}
        </button>
      ) : (
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-content-secondary hover:bg-surface-raised" data-tip={t('common:close')}>
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

type FindStep =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'connecting'; host: string }
  | { kind: 'pick'; hosts: string[] }
  | { kind: 'login'; host: string }
  | { kind: 'none'; unaddressed: string[] }
  | { kind: 'error'; text: string };

const IPV4_STEPS_KEY = /Macintosh/.test(navigator.userAgent)
  ? 'camera:settings.ipv4StepsMac'
  : /Windows/.test(navigator.userAgent)
    ? 'camera:settings.ipv4StepsWindows'
    : 'camera:settings.ipv4StepsLinux';

function CameraFinder({ lastHost, initialError, onConnected }: {
  lastHost: string | undefined;
  initialError: string | null;
  onConnected: (snapshot: CameraSettingsSnapshot) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState<FindStep>(initialError ? { kind: 'error', text: initialError } : { kind: 'idle' });
  const [username, setUsername] = useState(WIFILINK_DEFAULT_USER);
  const [password, setPassword] = useState(WIFILINK_DEFAULT_PASSWORD);
  const [manual, setManual] = useState(false);
  const [manualHost, setManualHost] = useState(lastHost ?? WIFILINK_DEFAULT_HOST);
  const busy = step.kind === 'searching' || step.kind === 'connecting';

  const connectTo = async (host: string) => {
    setStep({ kind: 'connecting', host });
    const r = await window.electronAPI.cameraSettingsConnect({ host: host.trim(), username, password })
      .catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : t('camera:settings.couldNotReach') }));
    if (r.ok) onConnected(r.snapshot);
    else if (/rejected the login/.test(r.error)) setStep({ kind: 'login', host });
    else setStep({ kind: 'error', text: r.error });
  };

  const find = async () => {
    setStep({ kind: 'searching' });
    const r = await window.electronAPI.cameraSettingsDiscover({ username, password }, lastHost)
      .catch(() => ({ cameras: [], unaddressedAdapters: [] }));
    const [only] = r.cameras;
    if (r.cameras.length === 1 && only) {
      if (only.needsLogin) setStep({ kind: 'login', host: only.host });
      else await connectTo(only.host);
    } else if (r.cameras.length > 1) {
      setStep({ kind: 'pick', hosts: r.cameras.map((c) => c.host) });
    } else {
      setStep({ kind: 'none', unaddressed: r.unaddressedAdapters });
    }
  };

  const input = 'w-full rounded border border-default bg-surface-input px-2 py-1 text-xs text-content';

  return (
    <div className="space-y-3 overflow-y-auto p-3">
      <div className="flex gap-2.5 rounded-lg border border-subtle bg-surface p-2.5">
        <Cable className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" />
        <p className="text-[11px] leading-snug text-content-secondary">
          {t('camera:settings.plugIn')}
        </p>
      </div>

      <button
        onClick={() => void find()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
        {step.kind === 'searching'
          ? t('camera:settings.looking')
          : step.kind === 'connecting' ? t('camera:settings.connectingTo', { host: step.host }) : t('camera:settings.findCamera')}
      </button>

      {step.kind === 'pick' && (
        <div className="space-y-1">
          <p className="text-[10px] text-content-tertiary">{t('camera:settings.pickOne')}</p>
          {step.hosts.map((h) => (
            <button
              key={h}
              onClick={() => void connectTo(h)}
              className="flex w-full items-center justify-between rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-left text-[11px] text-content hover:bg-surface-raised"
            >
              {/* i18n-exempt */}
              RunCam WiFiLink
              <span className="font-mono text-content-secondary">{h}</span>
            </button>
          ))}
        </div>
      )}

      {step.kind === 'login' && (
        <form onSubmit={(e) => { e.preventDefault(); void connectTo(step.host); }} className="space-y-1.5 rounded-lg border border-subtle bg-surface p-2.5">
          <p className="text-[11px] leading-snug text-content-secondary">
            <Trans i18nKey="camera:settings.loginRejected" values={{ host: step.host }} components={{ host: <span className="font-mono text-content" /> }} />
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            <input value={username} onChange={(e) => setUsername(e.target.value)} spellCheck={false} className={input} aria-label={t('camera:settings.user')} />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoFocus className={input} aria-label={t('common:password')} />
          </div>
          <button type="submit" className="w-full rounded bg-surface-raised px-2 py-1 text-[11px] text-content hover:bg-surface-overlay">{t('common:connect')}</button>
        </form>
      )}

      {step.kind === 'none' && (step.unaddressed.length > 0 ? (
        <div className="space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] leading-snug text-amber-400">
          <p>
            {t('camera:settings.noAddress', { adapters: step.unaddressed.join(', ') })}
          </p>
          <p className="text-amber-300">
            {t('camera:settings.fixedAddress')}
          </p>
          <p className="text-[10px] text-amber-400/80">{t(IPV4_STEPS_KEY)}</p>
        </div>
      ) : (
        <p className="rounded-lg bg-surface px-2.5 py-2 text-[11px] leading-snug text-content-secondary">
          {t('camera:settings.noneAnswered')}
        </p>
      ))}

      {step.kind === 'error' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-[11px] leading-snug text-red-400">{step.text}</div>
      )}

      <div>
        <button
          onClick={() => setManual(!manual)}
          className="flex items-center gap-1 text-[10px] text-content-tertiary hover:text-content-secondary"
        >
          <ChevronRight className={`h-3 w-3 transition-transform ${manual ? 'rotate-90' : ''}`} />
          {t('camera:settings.enterAddress')}
        </button>
        {manual && (
          <form onSubmit={(e) => { e.preventDefault(); void connectTo(manualHost); }} className="mt-1.5 flex gap-1.5 pl-4">
            <input value={manualHost} onChange={(e) => setManualHost(e.target.value)} spellCheck={false} className={`${input} font-mono`} />
            <button
              type="submit"
              disabled={busy || !manualHost.trim()}
              className="shrink-0 rounded bg-surface-raised px-2.5 py-1 text-[11px] text-content hover:bg-surface-overlay disabled:opacity-50"
            >{t('common:connect')}</button>
          </form>
        )}
      </div>
    </div>
  );
}

function DeviceNotes({ snapshot }: { snapshot: CameraSettingsSnapshot }) {
  const { t } = useTranslation();
  const { device } = snapshot;
  if (device.readOnly) {
    return (
      <div className="m-3 mb-0 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] leading-snug text-amber-400">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {t('camera:settings.oldFirmware')}
      </div>
    );
  }
  if (!device.sdCard) return null;
  return (
    <p className="mx-3 mt-3 rounded-lg bg-surface px-2.5 py-2 text-[10px] leading-snug text-content-tertiary">
      {t('camera:settings.sdSettingsFile')}
    </p>
  );
}

interface SectionProps {
  value: (id: string) => CameraSettingValue | undefined;
  set: (id: string, v: CameraSettingValue) => void;
  field: (id: string) => { modified: boolean; onRevert: () => void; locked: string | undefined };
}

function VideoSection({ value, set, field }: SectionProps) {
  const { t } = useTranslation();
  const codec = value('video.codec');
  return (
    <Section icon={<Film className="h-3 w-3" />} title={t('camera:settings.video')}>
      <FieldRow label={t('camera:settings.label.resolution')} value={modeLabel(value('video.mode'))} {...field('video.mode')}>
        <VideoModeGrid value={value('video.mode')} onChange={(v) => set('video.mode', v)} />
      </FieldRow>

      <FieldRow
        label={t('camera:settings.label.codec')}
        {...field('video.codec')}
        hint={codec === 'h264'
          ? t('camera:settings.codecH264Hint')
          : t('camera:settings.codecH265Hint')}
      >
        <Segmented
          options={[{ value: 'h265', label: 'H.265' }, { value: 'h264', label: 'H.264' }]}
          value={codec as string | undefined}
          onChange={(v) => set('video.codec', v)}
        />
      </FieldRow>

      <FieldRow
        label={t('camera:settings.label.bitrate')}
        tag={<Tag tone="live">{t('common:live')}</Tag>}
        value={typeof value('video.bitrate') === 'number' ? `${mbps(value('video.bitrate') as number)} Mbps` : undefined}
        {...field('video.bitrate')}
        hint={t('camera:settings.bitrateHint')}
      >
        <StepSlider
          steps={BITRATES_KBPS}
          value={value('video.bitrate') as number | undefined}
          onChange={(v) => set('video.bitrate', v)}
          ends={[`${mbps(BITRATES_KBPS[0])}`, `${mbps(BITRATES_KBPS[BITRATES_KBPS.length - 1]!)} Mbps`]}
        />
      </FieldRow>
    </Section>
  );
}

/** Resolution and frame rate as one grid, so an impossible pair can't be picked. */
function VideoModeGrid({ value, onChange }: { value: CameraSettingValue | undefined; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const rows = [
    { size: '1280x720', label: '720p', dims: '1280×720' },
    { size: '1920x1080', label: '1080p', dims: '1920×1080' },
  ];
  return (
    <div className="space-y-1">
      {rows.map((r) => (
        <div key={r.size} className="grid grid-cols-[4.5rem_repeat(3,1fr)] items-center gap-1 text-[11px]">
          <span className="leading-tight">
            <span className="text-content">{r.label}</span>
            <span className="block text-[9px] tabular-nums text-content-tertiary">{r.dims}</span>
          </span>
          {[60, 90, 120].map((f) => {
            const mode = VIDEO_MODES.find((m) => m.size === r.size && m.fps === f);
            if (!mode) {
              return (
                <span
                  key={f}
                  className="self-stretch rounded-md border border-dashed border-subtle"
                  data-tip={t('camera:settings.sensorLimitTip')}
                />
              );
            }
            const on = value === mode.value;
            return (
              <button
                key={f}
                onClick={() => onChange(mode.value)}
                className={`rounded-md border py-1 tabular-nums transition-colors ${
                  on ? 'border-blue-500/60 bg-blue-500/10 text-content' : 'border-subtle text-content-secondary hover:bg-surface-raised'
                }`}
              >{f}<span className="ml-0.5 text-[9px] text-content-tertiary">fps</span></button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ImageSection({ value, set, field }: SectionProps) {
  const { t } = useTranslation();
  const sliders: [string, string][] = [
    ['image.luminance', t('camera:settings.label.brightness')],
    ['image.contrast', t('camera:settings.label.contrast')],
    ['image.saturation', t('camera:settings.label.saturation')],
    ['image.hue', t('camera:settings.label.hue')],
  ];
  const offDefault = sliders.some(([id]) => value(id) !== 50);
  const rotate = value('image.rotate');
  return (
    <Section
      icon={<SunMedium className="h-3 w-3" />}
      title={t('camera:settings.picture')}
      note={t('camera:settings.pictureNote')}
      action={offDefault && (
        <button
          onClick={() => sliders.forEach(([id]) => set(id, 50))}
          className="normal-case tracking-normal text-[10px] text-content-tertiary hover:text-content"
          data-tip={t('camera:settings.neutralTip')}
        >{t('camera:settings.neutral')}</button>
      )}
    >
      {sliders.map(([id, label]) => (
        <FieldRow key={id} label={label} value={value(id) as number | undefined} {...field(id)}>
          <StepSlider steps={wifilinkField(id)!.values as readonly number[]} value={value(id) as number | undefined} onChange={(v) => set(id, v)} />
        </FieldRow>
      ))}

      <FieldRow
        label={t('camera:settings.orientation')}
        modified={['image.mirror', 'image.flip', 'image.rotate'].some((id) => field(id).modified)}
        onRevert={() => ['image.mirror', 'image.flip', 'image.rotate'].forEach((id) => field(id).onRevert())}
        locked={field('image.rotate').locked}
        hint={rotate === 90 || rotate === 270 ? t('camera:settings.quarterTurn') : t('camera:settings.orientationHint')}
      >
        <div className="flex items-center gap-1.5">
          <OrientationChip on={value('image.mirror') === true} onClick={() => set('image.mirror', value('image.mirror') !== true)} tip={t('camera:settings.mirrorTip')}>
            <FlipHorizontal2 className="h-3.5 w-3.5" />
          </OrientationChip>
          <OrientationChip on={value('image.flip') === true} onClick={() => set('image.flip', value('image.flip') !== true)} tip={t('camera:settings.flipTip')}>
            <FlipVertical2 className="h-3.5 w-3.5" />
          </OrientationChip>
          <div className="flex-1">
            <Segmented
              options={[0, 90, 180, 270].map((d) => ({ value: d, label: `${d}°` }))}
              value={rotate as number | undefined}
              onChange={(v) => set('image.rotate', v)}
            />
          </div>
        </div>
      </FieldRow>
    </Section>
  );
}

function OrientationChip({ on, onClick, tip, children }: { on: boolean; onClick: () => void; tip: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      data-tip={tip}
      aria-pressed={on}
      className={`flex h-[26px] w-8 items-center justify-center rounded-md border transition-colors ${
        on ? 'border-blue-500/60 bg-blue-500/10 text-content' : 'border-subtle text-content-secondary hover:bg-surface-raised'
      }`}
    >{children}</button>
  );
}

function RadioSection({ value, set, field, channelChanged, canSwitchReceiver, switchReceiver, setSwitchReceiver }: SectionProps & {
  channelChanged: boolean;
  canSwitchReceiver: boolean;
  switchReceiver: boolean;
  setSwitchReceiver: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const [advanced, setAdvanced] = useState(false);
  const channel = value('radio.channel') as number | undefined;
  const power = TX_POWER_LEVELS.find((l) => l.value === value('radio.txpower'));
  return (
    <Section
      icon={<RadioTower className="h-3 w-3" />}
      title={t('camera:settings.videoLink')}
      note={t('camera:settings.videoLinkNote')}
    >
      <FieldRow
        label={t('camera:settings.label.channel')}
        value={channel !== undefined ? `${channelMhz(channel)} MHz` : undefined}
        {...field('radio.channel')}
      >
        <select
          value={channel ?? ''}
          onChange={(e) => set('radio.channel', Number(e.target.value))}
          className="w-full rounded border border-default bg-surface-input px-2 py-1 text-xs tabular-nums text-content"
        >
          {CHANNEL_BANDS.map((b) => (
            <optgroup
              key={b.label}
              // i18n-exempt: band name and units
              label={`${b.label} · ${channelMhz(b.channels[0]!)}-${channelMhz(b.channels[b.channels.length - 1]!)} MHz`}>
              {b.channels.map((c) => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          ))}
        </select>
        {channelChanged && (
          <div className="mt-1.5 space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-[10px] leading-snug text-amber-400">
            <p>{t('camera:settings.groundMustMove', { channel })}</p>
            {canSwitchReceiver && (
              <label className="flex cursor-pointer items-center gap-1.5 text-amber-300">
                <input type="checkbox" checked={switchReceiver} onChange={(e) => setSwitchReceiver(e.target.checked)} className="accent-amber-500" />
                {t('camera:settings.switchReceiver', { channel })}
              </label>
            )}
          </div>
        )}
      </FieldRow>

      <FieldRow
        label={t('camera:settings.label.power')}
        value={power ? powerLabel(power.value) : undefined}
        tag={power && power.dbm >= 27 ? <Tag tone="caution">{t('camera:settings.hot')}</Tag> : undefined}
        {...field('radio.txpower')}
        hint={
          <span className="text-amber-400/90">
            {t('camera:settings.powerHint')}
          </span>
        }
      >
        <StepSlider
          steps={TX_POWER_LEVELS.map((l) => l.value)}
          value={value('radio.txpower') as number | undefined}
          onChange={(v) => set('radio.txpower', v)}
          color="#f59e0b"
          ends={[`${dbmToMw(TX_POWER_LEVELS[0].dbm)} mW`, `${dbmToMw(TX_POWER_LEVELS[TX_POWER_LEVELS.length - 1]!.dbm)} mW`]}
        />
      </FieldRow>

      <FieldRow
        label={t('camera:settings.label.mcs')}
        {...field('radio.mcs')}
        hint={t('camera:settings.mcsHint')}
      >
        <Segmented
          options={(wifilinkField('radio.mcs')!.values as readonly number[]).map((m) => ({ value: m, label: m }))}
          value={value('radio.mcs') as number | undefined}
          onChange={(v) => set('radio.mcs', v)}
        />
      </FieldRow>

      <button
        onClick={() => setAdvanced(!advanced)}
        className="flex items-center gap-1 text-[10px] text-content-tertiary hover:text-content-secondary"
      >
        <ChevronRight className={`h-3 w-3 transition-transform ${advanced ? 'rotate-90' : ''}`} />
        {t('common:advanced')}
      </button>
      {advanced && (
        <div className="space-y-3.5 border-l border-subtle pl-3">
          {(['radio.stbc', 'radio.ldpc'] as const).map((id) => (
            <FieldRow
              key={id}
              label={t(LABEL_KEYS[id]!)}
              {...field(id)}
              hint={id === 'radio.stbc'
                ? t('camera:settings.stbcHint')
                : t('camera:settings.ldpcHint')}
            >
              <Switch label={t(LABEL_KEYS[id]!)} checked={value(id) === 1} onChange={(v) => set(id, v ? 1 : 0)} />
            </FieldRow>
          ))}
          <FieldRow
            label={t('camera:settings.label.telemetry')}
            {...field('telemetry.protocol')}
            hint={value('telemetry.protocol') === 'mavlink'
              ? t('camera:settings.telemetryMavlinkHint')
              : t('camera:settings.telemetryMspHint')}
          >
            <Segmented
              // i18n-exempt: protocol names
              options={[{ value: 'msposd', label: 'MSP OSD' }, { value: 'mavlink', label: 'MAVLink' }]}
              value={value('telemetry.protocol') as string | undefined}
              onChange={(v) => set('telemetry.protocol', v)}
            />
          </FieldRow>
        </div>
      )}
    </Section>
  );
}

const EFFECT_COPY = {
  live: { dot: 'bg-emerald-400', textKey: 'camera:settings.effectLive' },
  'video-reload': { dot: 'bg-sky-400', textKey: 'camera:settings.effectVideoReload' },
  'link-restart': { dot: 'bg-amber-400', textKey: 'camera:settings.effectLinkRestart' },
} as const;

function Footer({ dirtyIds, applying, outcome, onDiscard, onApply }: {
  dirtyIds: string[];
  applying: boolean;
  outcome: Outcome | null;
  onDiscard: () => void;
  onApply: () => void;
}) {
  const { t } = useTranslation();
  const groups = useMemo(() => {
    const by = new Map<keyof typeof EFFECT_COPY, string[]>();
    for (const id of dirtyIds) {
      const effect = wifilinkField(id)?.effect;
      if (effect) by.set(effect, [...(by.get(effect) ?? []), LABEL_KEYS[id] ? t(LABEL_KEYS[id]) : id]);
    }
    return (['live', 'video-reload', 'link-restart'] as const).filter((e) => by.has(e)).map((e) => ({ effect: e, names: by.get(e)! }));
  }, [dirtyIds, t]);

  const outcomeCls = {
    ok: 'bg-emerald-500/10 text-emerald-400',
    warn: 'bg-amber-500/10 text-amber-400',
    error: 'bg-red-500/10 text-red-400',
  } as const;

  return (
    <div className="shrink-0 space-y-2 border-t border-subtle p-3">
      {outcome && (
        <div className={`flex gap-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-snug ${outcomeCls[outcome.tone]}`}>
          {outcome.tone === 'ok' ? <Check className="mt-px h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />}
          {outcome.text}
        </div>
      )}

      {dirtyIds.length > 0 ? (
        <>
          <ul className="space-y-1">
            {groups.map((g) => (
              <li key={g.effect} className="flex items-start gap-1.5 text-[10px] leading-snug">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${EFFECT_COPY[g.effect].dot}`} />
                <span>
                  <span className="text-content">{g.names.join(', ')}</span>
                  <span className="text-content-tertiary"> {t(EFFECT_COPY[g.effect].textKey)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button
              onClick={onDiscard}
              disabled={applying}
              className="rounded px-2 py-1 text-[11px] text-content-secondary hover:bg-surface-raised hover:text-content disabled:opacity-40"
            >{t('camera:settings.discard')}</button>
            <button
              onClick={onApply}
              disabled={applying}
              className="ml-auto flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-60"
            >
              {applying && <Loader2 className="h-3 w-3 animate-spin" />}
              {applying ? t('camera:settings.writing') : t('camera:settings.applyChanges', { count: dirtyIds.length })}
            </button>
          </div>
        </>
      ) : !outcome && (
        <p className="flex items-center gap-1.5 text-[10px] text-content-tertiary">
          <Check className="h-3 w-3" />
          {t('camera:settings.showingCurrent')}
        </p>
      )}
    </div>
  );
}
