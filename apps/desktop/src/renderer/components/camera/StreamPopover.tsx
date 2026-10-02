import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { CanvasStreamSnapshot } from './useCanvasStream';
import type { PublishStats } from './whip-publish';
import { streamReadUrls } from '../../../shared/camera-types';
import { Trans, useTranslation } from 'react-i18next';

export function StreamPopover({ stream, path, installing, onStart, onStop, onInstall, onClose, className, hud }: {
  stream: CanvasStreamSnapshot;
  path: string;
  installing: boolean;
  onStart: () => void;
  onStop: () => void;
  onInstall: () => void;
  onClose: () => void;
  className: string;
  /** Offered where the view has overlays worth sending; absent means canvas only. */
  hud?: { value: boolean; onChange: (v: boolean) => void };
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const live = stream.state === 'live';
  const busy = stream.state === 'starting' || installing;
  const urls = streamReadUrls(path);
  const rtsp = urls[0]!.url;
  const snippet = `cv2.VideoCapture("${rtsp}")`;

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied((c) => (c === text ? null : c)), 1500);
    });
  };

  const statusLine = live
    ? t('camera:streamPopover.liveStatus', { codec: stream.codec ?? t('camera:streamPopover.video'), count: stream.readers })
    : installing
      ? t('camera:streamPopover.installingEngine')
      : stream.state === 'starting'
        ? t('camera:streamPopover.starting')
        : t('common:off');

  const what = !hud
    ? t('camera:streamPopover.what3d')
    : hud.value
      ? t('camera:streamPopover.whatHud')
      : t('camera:streamPopover.whatTerrain');

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className={`absolute right-0 z-40 w-80 max-w-[calc(100vw-1.5rem)] rounded-lg border border-default bg-surface-solid p-2 shadow-xl ${className}`}>
        <div className="flex items-center justify-between gap-2 px-1 pb-1.5">
          <div className="text-[10px] uppercase tracking-wide text-content-tertiary">{t('camera:streamPopover.title')}</div>
          <div className={`truncate text-[11px] ${live ? 'text-emerald-400' : 'text-content-secondary'}`}>{statusLine}</div>
        </div>

        {hud && (
          <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[11px] text-content hover:bg-surface-raised">
            <input
              type="checkbox"
              checked={hud.value}
              onChange={(e) => hud.onChange(e.target.checked)}
              className="accent-blue-500"
            />
            {t('camera:streamPopover.includeHud')}
          </label>
        )}
        <div className="px-1 pb-1.5 text-[10px] leading-snug text-content-tertiary">
          {what} {t('camera:streamPopover.limits')}
        </div>

        {stream.needsInstall && !live ? (
          <button
            onClick={onInstall}
            disabled={busy}
            className="w-full rounded-md bg-blue-600 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-blue-500 disabled:opacity-50"
          >
            {installing ? t('camera:streamPopover.installing') : t('camera:streamPopover.installEngine')}
          </button>
        ) : (
          <button
            onClick={live ? onStop : onStart}
            disabled={busy}
            className={`w-full rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 ${
              live ? 'border border-subtle bg-surface-raised text-content hover:bg-surface-base' : 'bg-blue-600 text-white hover:bg-blue-500'
            }`}
          >
            {live ? t('camera:streamPopover.stop') : busy ? t('camera:streamPopover.starting') : t('camera:streamPopover.start')}
          </button>
        )}

        {live && stream.stats && <StatsLine stats={stream.stats} />}

        {stream.error && (
          <div className="mt-1.5 break-words rounded-md border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300">
            {stream.error}
          </div>
        )}

        <div className="mt-2 border-t border-subtle pt-1.5">
          <div className="px-1 pb-1 text-[10px] uppercase tracking-wide text-content-tertiary">{t('camera:streamPopover.readIt')}</div>
          <div className="flex flex-col gap-1">
            {urls.map((u) => (
              <CopyRow key={u.id} label={u.label} text={u.url} hint={u.hint} copied={copied === u.url} onCopy={() => copy(u.url)} />
            ))}
            <CopyRow label="OpenCV" // i18n-exempt
              text={snippet} copied={copied === snippet} onCopy={() => copy(snippet)} />
          </div>
          <div className="break-words px-1 pt-1.5 text-[10px] leading-snug text-content-tertiary">
            <Trans
              i18nKey="camera:streamPopover.opencvHint"
              values={{ env: 'OPENCV_FFMPEG_CAPTURE_OPTIONS=rtsp_transport;tcp' }}
              components={{ code: <code className="break-all font-mono" /> }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function CopyRow({ label, text, hint, copied, onCopy }: {
  label: string;
  text: string;
  hint?: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-1.5 rounded-md border border-subtle bg-surface-base px-2 py-1">
      <span className="mt-px w-12 shrink-0 text-[10px] font-medium text-content-secondary">{label}</span>
      <div className="min-w-0 flex-1">
        <code className="block break-all font-mono text-[11px] leading-snug text-content">{text}</code>
        {hint && <div className="text-[10px] leading-snug text-content-tertiary">{hint}</div>}
      </div>
      <button
        onClick={onCopy}
        data-tip={t('camera:streamPopover.copy')}
        className="shrink-0 rounded p-0.5 text-content-tertiary transition-colors hover:text-content"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </button>
    </div>
  );
}

function StatsLine({ stats }: { stats: PublishStats }) {
  const { t } = useTranslation();
  const cpuBound = stats.limitedBy === 'cpu';
  const software = stats.hardware === false;
  const parts = [
    stats.width && stats.height ? `${stats.width}x${stats.height}` : null,
    stats.fps !== null ? `${Math.round(stats.fps)} fps` : null,
    stats.encoder ? `${stats.encoder}${software ? ' (CPU)' : stats.hardware ? ` (${t('camera:streamPopover.hardware')})` : ''}` : null,
  ].filter(Boolean);
  return (
    <div className={`mt-1.5 break-words px-1 font-mono text-[10px] ${cpuBound ? 'text-amber-300' : 'text-content-tertiary'}`}>
      {parts.join(' \u00b7 ')}
      {cpuBound && <div className="font-sans">{t('camera:streamPopover.cpuLimited')}</div>}
    </div>
  );
}
