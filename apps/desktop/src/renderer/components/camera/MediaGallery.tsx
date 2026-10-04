// Recordings and snapshots taken from the Vision panel: browse, play, reveal, drag out to send, delete.

import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  X, Film, Image as ImageIcon, FolderOpen, ExternalLink, Trash2, Play, ChevronLeft, ChevronRight,
  Clapperboard, GripVertical, Loader2,
} from 'lucide-react';
import type { CameraMediaItem } from '../../../shared/camera-types';

type Filter = 'all' | 'video' | 'photo';

export const mediaUrl = (item: CameraMediaItem) => `ardudeck-media://file/${encodeURIComponent(item.name)}`;

export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

const SEGMENT = 'flex bg-surface-input rounded-lg border border-subtle overflow-hidden';
const segmentBtn = (active: boolean) =>
  `px-3 py-1.5 text-xs font-medium transition-colors ${active ? 'bg-blue-500/20 text-blue-400' : 'text-content-secondary hover:text-content'}`;
const ACTION_BTN =
  'flex items-center gap-1.5 rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-xs text-content-secondary transition-colors hover:bg-surface-raised hover:text-content';

/** Hands the file to the OS, so it drops into a mail, a chat or a folder as the real file. */
function dragOut(e: DragEvent, item: CameraMediaItem) {
  e.preventDefault();
  window.electronAPI.cameraMediaDrag(item.filePath);
}

function Thumb({ item, onDuration }: { item: CameraMediaItem; onDuration: (s: number) => void }) {
  if (item.kind === 'photo') {
    return <img src={mediaUrl(item)} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />;
  }
  return (
    <video
      src={`${mediaUrl(item)}#t=0.5`}
      preload="metadata"
      muted
      className="h-full w-full object-cover"
      onLoadedMetadata={(e) => onDuration(e.currentTarget.duration)}
    />
  );
}

function MediaCard({ item, duration, onDuration, onOpen, when }: {
  item: CameraMediaItem; duration?: number; onDuration: (s: number) => void; onOpen: () => void; when: string;
}) {
  const { t } = useTranslation();
  const isVideo = item.kind === 'video';
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => dragOut(e, item)}
      onClick={onOpen}
      data-tip={t('camera:gallery.cardTip')}
      className="group flex flex-col overflow-hidden rounded-xl border border-subtle bg-surface text-left transition-colors hover:border-blue-500/40"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-black">
        <Thumb item={item} onDuration={onDuration} />
        {isVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white opacity-80 transition-opacity group-hover:opacity-100">
              <Play className="ml-0.5 h-4 w-4 fill-current" />
            </div>
          </div>
        )}
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
          {isVideo ? t('camera:gallery.video') : t('camera:gallery.photo')}
        </span>
        {isVideo && duration !== undefined && formatDuration(duration) && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-white">
            {formatDuration(duration)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-content">{when}</div>
          <div className="text-[11px] tabular-nums text-content-tertiary">{formatSize(item.size)}</div>
        </div>
        <GripVertical className="h-3.5 w-3.5 shrink-0 text-content-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
    </button>
  );
}

function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-subtle bg-surface px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface-raised">{icon}</div>
      <h4 className="text-sm font-medium text-content">{title}</h4>
      <div className="max-w-md text-xs leading-relaxed text-content-secondary">{children}</div>
    </div>
  );
}

function Viewer({ item, when, hasPrev, hasNext, onPrev, onNext, onTrash }: {
  item: CameraMediaItem; when: string; hasPrev: boolean; hasNext: boolean;
  onPrev: () => void; onNext: () => void; onTrash: () => void;
}) {
  const { t } = useTranslation();
  const [confirmTrash, setConfirmTrash] = useState(false);
  useEffect(() => setConfirmTrash(false), [item.name]);
  const nav = 'absolute top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white transition-colors hover:bg-black/75 disabled:opacity-0';
  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-xl border border-subtle bg-black">
        {item.kind === 'video'
          ? <video key={item.name} src={mediaUrl(item)} controls autoPlay className="h-full w-full" />
          : <img key={item.name} src={mediaUrl(item)} alt="" className="h-full w-full object-contain" draggable={false} />}
        <button onClick={onPrev} disabled={!hasPrev} className={`${nav} left-3`} data-tip={t('camera:gallery.newer')}>
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={onNext} disabled={!hasNext} className={`${nav} right-3`} data-tip={t('camera:gallery.older')}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div
          draggable
          onDragStart={(e) => dragOut(e, item)}
          className="mr-auto flex min-w-0 cursor-grab items-center gap-2 rounded-lg border border-dashed border-subtle px-3 py-1.5 active:cursor-grabbing"
          data-tip={t('camera:gallery.dragTip')}
        >
          <GripVertical className="h-3.5 w-3.5 shrink-0 text-content-tertiary" />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-content">{when} · {formatSize(item.size)}</div>
            <div className="text-[11px] text-content-tertiary">{t('camera:gallery.dragHint')}</div>
          </div>
        </div>
        <button className={ACTION_BTN} onClick={() => void window.electronAPI.cameraRevealMedia(item.filePath)}>
          <FolderOpen className="h-3.5 w-3.5" />{t('camera:gallery.showInFolder')}
        </button>
        <button className={ACTION_BTN} onClick={() => void window.electronAPI.cameraMediaOpen(item.filePath)}>
          <ExternalLink className="h-3.5 w-3.5" />
          {item.kind === 'video' ? t('camera:gallery.openInPlayer') : t('camera:gallery.openInViewer')}
        </button>
        {confirmTrash ? (
          <button
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors"
            style={{ background: 'var(--status-danger-bg)', color: 'var(--status-danger-fg)', borderColor: 'var(--status-danger-fg)' }}
            onClick={onTrash}
          >
            <Trash2 className="h-3.5 w-3.5" />{t('camera:gallery.confirmTrash')}
          </button>
        ) : (
          <button className={`${ACTION_BTN} hover:text-red-400`} onClick={() => setConfirmTrash(true)}>
            <Trash2 className="h-3.5 w-3.5" />{t('camera:gallery.trash')}
          </button>
        )}
      </div>
    </div>
  );
}

export function MediaGallery({ onClose, onChanged }: { onClose: () => void; onChanged?: (count: number) => void }) {
  const { t, i18n } = useTranslation();
  const [items, setItems] = useState<CameraMediaItem[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [openName, setOpenName] = useState<string | null>(null);
  const [durations, setDurations] = useState<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const list = await window.electronAPI.cameraMediaList();
    setItems(list);
    onChanged?.(list.length);
  }, [onChanged]);

  useEffect(() => { void refresh(); }, [refresh]);

  const shown = useMemo(() => (items ?? []).filter((i) => filter === 'all' || i.kind === filter), [items, filter]);
  const openIdx = openName ? shown.findIndex((i) => i.name === openName) : -1;
  const open = openIdx >= 0 ? shown[openIdx] : undefined;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (open) setOpenName(null); else onClose(); }
      if (!open) return;
      if (e.key === 'ArrowLeft' && openIdx > 0) setOpenName(shown[openIdx - 1]!.name);
      if (e.key === 'ArrowRight' && openIdx < shown.length - 1) setOpenName(shown[openIdx + 1]!.name);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, openIdx, shown, onClose]);

  const when = (item: CameraMediaItem) =>
    new Date(item.modifiedAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  const trash = async (item: CameraMediaItem) => {
    const next = shown[openIdx + 1] ?? shown[openIdx - 1];
    if (await window.electronAPI.cameraMediaTrash(item.filePath)) {
      setOpenName(next?.name ?? null);
      await refresh();
    }
  };

  const videos = items?.filter((i) => i.kind === 'video').length ?? 0;
  const photos = (items?.length ?? 0) - videos;
  const total = (items ?? []).reduce((s, i) => s + i.size, 0);

  let body: ReactNode;
  if (!items) {
    body = <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-content-tertiary" /></div>;
  } else if (open) {
    body = (
      <Viewer
        item={open}
        when={when(open)}
        hasPrev={openIdx > 0}
        hasNext={openIdx < shown.length - 1}
        onPrev={() => setOpenName(shown[openIdx - 1]!.name)}
        onNext={() => setOpenName(shown[openIdx + 1]!.name)}
        onTrash={() => void trash(open)}
      />
    );
  } else if (shown.length === 0) {
    body = (
      <EmptyState icon={<Clapperboard className="h-6 w-6 text-content-tertiary" />} title={t('camera:gallery.emptyTitle')}>
        {t('camera:gallery.emptyBody')}
      </EmptyState>
    );
  } else {
    body = (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {shown.map((item) => (
          <MediaCard
            key={item.name}
            item={item}
            when={when(item)}
            duration={durations[item.name]}
            onDuration={(s) => setDurations((d) => (d[item.name] === s ? d : { ...d, [item.name]: s }))}
            onOpen={() => setOpenName(item.name)}
          />
        ))}
      </div>
    );
  }

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-black/50" onClick={onClose} />
      <div className="pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center p-6">
        <div className="pointer-events-auto flex max-h-[92vh] w-full max-w-[1080px] flex-col overflow-hidden rounded-xl border border-subtle bg-surface-solid shadow-2xl">
          <div className="flex items-center gap-3 border-b border-subtle px-5 py-3.5">
            {open ? (
              <button onClick={() => setOpenName(null)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-raised text-content-secondary hover:text-content" data-tip={t('camera:gallery.backTip')}>
                <ChevronLeft className="h-[18px] w-[18px]" />
              </button>
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20">
                <Film className="h-[18px] w-[18px] text-blue-400" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-content">{t('camera:gallery.title')}</h3>
              <p className="truncate text-[11px] text-content-secondary">
                {items ? t('camera:gallery.summary', { videos, photos, size: formatSize(total) }) : t('camera:gallery.loading')}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {!open && (
                <div className={SEGMENT}>
                  {(['all', 'video', 'photo'] as const).map((f) => (
                    <button key={f} onClick={() => setFilter(f)} className={segmentBtn(filter === f)}>
                      {t(`camera:gallery.filter.${f}`)}
                    </button>
                  ))}
                </div>
              )}
              <button className={ACTION_BTN} onClick={() => void window.electronAPI.cameraMediaOpenFolder(filter === 'photo' ? 'photo' : 'video')}>
                <FolderOpen className="h-3.5 w-3.5" />
                {filter === 'photo' ? t('camera:gallery.openPhotosFolder') : t('camera:gallery.openVideosFolder')}
              </button>
              <button onClick={onClose} data-tip={t('camera:gallery.closeTip')} className="rounded p-1.5 text-content-secondary hover:bg-surface-raised hover:text-content">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-surface-base p-5">{body}</div>
        </div>
      </div>
    </>,
    document.body,
  );
}
