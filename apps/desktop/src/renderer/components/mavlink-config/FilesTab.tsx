/**
 * FilesTab — MAVLink-FTP file browser for the connected flight controller.
 *
 * Browse, download, upload, delete, and rename files on the FC's virtual
 * filesystem. All ops route through the IPC handlers in main/ipc-handlers.ts
 * which share the transient FtpClient pattern (build → swap into the global
 * slot so FILE_TRANSFER_PROTOCOL responses route correctly → restore).
 *
 * SITL note: ArduPilot SITL exposes the FTP-virtual /APM/ tree, NOT the
 * host-side <cwd>/scripts/ folder where SITL actually loads scripts from.
 * The browser shows the FTP view (matching real-hardware behaviour) and
 * surfaces a banner explaining the divergence when running on SITL.
 */
import React, { useCallback, useEffect, useState } from 'react';

/** Prefer the i18n key; falls back to the literal. */
function ftText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}
import { useTranslation } from 'react-i18next';
import {
  FolderOpen,
  Folder,
  File,
  ChevronRight,
  HardDrive,
  Eraser,
  Home,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  Pencil,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { useConnectionStore } from '../../stores/connection-store';
import { scanCardUsage, type CardUsage } from './card-usage';

interface DirEntry {
  kind: 'dir' | 'file';
  name: string;
  size?: number;
}

type RowBusy = { state: 'downloading' | 'done' | 'error' | 'deleting' | 'renaming'; detail?: string };

/** In-flight row chips: the label keeps its literal alongside the i18n key. */
const ROW_BUSY_LABELS: { state: string; label: string; labelKey: string }[] = [
  { state: 'downloading', label: 'Downloading…', labelKey: 'filesTab.row.downloading' },
  { state: 'deleting', label: 'Deleting…', labelKey: 'filesTab.row.deleting' },
  { state: 'renaming', label: 'Renaming…', labelKey: 'filesTab.row.renaming' },
];

const DEFAULT_PATH = '/';

export const FilesTab: React.FC = () => {
  const { t } = useTranslation('mavlink');
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const protocol = useConnectionStore((s) => s.connectionState.protocol);
  const isSitl = useConnectionStore((s) => s.connectionState.isSitl);

  const [path, setPath] = useState<string>(DEFAULT_PATH);
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-row inline status keyed by the FC-side full path.
  const [rowState, setRowState] = useState<Record<string, RowBusy>>({});

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Modal state for delete confirmation and rename input.
  const [confirmDelete, setConfirmDelete] = useState<DirEntry | null>(null);
  const [renameTarget, setRenameTarget] = useState<DirEntry | null>(null);
  const [storageInfo, setStorageInfo] =
    useState<{ totalBytes: number; usedBytes: number; availableBytes: number } | null>(null);
  const [cardUsage, setCardUsage] = useState<CardUsage | null>(null);
  const [scanning, setScanning] = useState(false);
  const [eraseLogsOpen, setEraseLogsOpen] = useState(false);
  const [erasingLogs, setErasingLogs] = useState(false);
  const [eraseLogsDone, setEraseLogsDone] = useState(false);
  const [formatOpen, setFormatOpen] = useState(false);
  const [formatting, setFormatting] = useState(false);
  const [formatDone, setFormatDone] = useState(false);

  const refresh = useCallback(async (target: string) => {
    setLoading(true);
    setError(null);
    setEntries(null);
    const result = await window.electronAPI.mavlinkFtpList(target);
    setLoading(false);
    if (!result.success || !result.entries) {
      setError(result.error ?? t('filesTab.error.unknown'));
      return;
    }
    const sorted = [...result.entries].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    setEntries(sorted);
  }, [t]);

  useEffect(() => {
    if (isConnected && protocol === 'mavlink') {
      void refresh(path);
    }
  }, [isConnected, protocol, path, refresh]);

  const refreshStorageInfo = useCallback(() => {
    window.electronAPI.logStorageInfo().then(setStorageInfo).catch(() => setStorageInfo(null));
  }, []);

  // ArduPilot never answers STORAGE_INFORMATION for its own SD card, so walk
  // the filesystem instead. This is the figure that explains a card which
  // "is not full" yet silently stops logging.
  const scanCard = useCallback(async () => {
    setScanning(true);
    try {
      const usage = await scanCardUsage(async (p) => {
        const r = await window.electronAPI.mavlinkFtpList(p);
        return r.success ? { entries: r.entries ?? [] } : { error: r.error };
      });
      setCardUsage(usage);
    } catch {
      setCardUsage(null);
    } finally {
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (isConnected && protocol === 'mavlink') refreshStorageInfo();
    else { setStorageInfo(null); setCardUsage(null); }
  }, [isConnected, protocol, refreshStorageInfo]);

  const handleEraseLogs = useCallback(async () => {
    setEraseLogsOpen(false);
    setErasingLogs(true);
    setEraseLogsDone(false);
    try {
      const sent = await window.electronAPI.logEraseAll();
      if (!sent) return;
      // LOG_ERASE has no ack; give the FC a moment before re-reading state.
      await new Promise((r) => setTimeout(r, 1500));
      refreshStorageInfo();
      void refresh(path);
      setEraseLogsDone(true);
    } finally {
      setErasingLogs(false);
    }
  }, [path, refresh, refreshStorageInfo]);

  const handleFormat = useCallback(async () => {
    setFormatOpen(false);
    setFormatting(true);
    setFormatDone(false);
    try {
      const sent = await window.electronAPI.logFormatSd();
      if (!sent) return;
      // Format runs on the FC for several seconds; wait before re-reading.
      await new Promise((r) => setTimeout(r, 6000));
      refreshStorageInfo();
      void refresh(DEFAULT_PATH);
      setPath(DEFAULT_PATH);
      setFormatDone(true);
    } finally {
      setFormatting(false);
    }
  }, [refresh, refreshStorageInfo]);

  const fcPathFor = useCallback((entry: DirEntry) =>
    path.endsWith('/') ? `${path}${entry.name}` : `${path}/${entry.name}`,
  [path]);

  const handleEntryClick = useCallback((entry: DirEntry) => {
    if (entry.kind !== 'dir') return;
    // Always navigate into directories with a trailing slash. ArduPilot's
    // SITL POSIX backend prefix-matches its virtual mounts ("/APM/", "/@SYS/"…)
    // and NAKs the bare "/APM" form; ChibiOS accepts either, so the slash
    // form is the safe common denominator.
    setPath(`${fcPathFor(entry)}/`);
  }, [fcPathFor]);

  const handleDownload = useCallback(async (entry: DirEntry) => {
    if (entry.kind !== 'file') return;
    const fcPath = fcPathFor(entry);
    setRowState(d => ({ ...d, [fcPath]: { state: 'downloading' } }));
    const result = await window.electronAPI.mavlinkFtpDownload(fcPath);
    setRowState(d => ({
      ...d,
      [fcPath]: result.success
        ? { state: 'done', detail: result.savedTo }
        : { state: 'error', detail: result.error },
    }));
  }, [fcPathFor]);

  const handleUpload = useCallback(async () => {
    setUploading(true);
    setUploadError(null);
    const result = await window.electronAPI.mavlinkFtpUpload(path);
    setUploading(false);
    if (result.cancelled) return;
    if (!result.success) {
      setUploadError(result.error ?? t('filesTab.upload.failed'));
      return;
    }
    void refresh(path);
  }, [path, refresh, t]);

  const handleConfirmDelete = useCallback(async () => {
    const entry = confirmDelete;
    if (!entry) return;
    const fcPath = fcPathFor(entry);
    setConfirmDelete(null);
    setRowState(d => ({ ...d, [fcPath]: { state: 'deleting' } }));
    const result = await window.electronAPI.mavlinkFtpDelete(fcPath, entry.kind);
    if (!result.success) {
      setRowState(d => ({ ...d, [fcPath]: { state: 'error', detail: result.error } }));
      return;
    }
    setRowState(d => {
      const next = { ...d };
      delete next[fcPath];
      return next;
    });
    void refresh(path);
  }, [confirmDelete, fcPathFor, path, refresh]);

  const handleRenameSubmit = useCallback(async (newName: string) => {
    const entry = renameTarget;
    if (!entry) return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === entry.name) {
      setRenameTarget(null);
      return;
    }
    if (trimmed.includes('/')) {
      setRowState(d => ({ ...d, [fcPathFor(entry)]: { state: 'error', detail: t('filesTab.rename.invalid-name') } }));
      setRenameTarget(null);
      return;
    }
    const oldPath = fcPathFor(entry);
    const newPath = path.endsWith('/') ? `${path}${trimmed}` : `${path}/${trimmed}`;
    setRenameTarget(null);
    setRowState(d => ({ ...d, [oldPath]: { state: 'renaming' } }));
    const result = await window.electronAPI.mavlinkFtpRename(oldPath, newPath);
    if (!result.success) {
      setRowState(d => ({ ...d, [oldPath]: { state: 'error', detail: result.error } }));
      return;
    }
    setRowState(d => {
      const next = { ...d };
      delete next[oldPath];
      return next;
    });
    void refresh(path);
  }, [renameTarget, fcPathFor, path, refresh, t]);

  if (!isConnected) {
    return (
      <ChromedShell>
        <EmptyState
          title={t('filesTab.empty.not-connected-title')}
          message={t('filesTab.empty.not-connected-message')}
        />
      </ChromedShell>
    );
  }

  if (protocol !== 'mavlink') {
    return (
      <ChromedShell>
        <EmptyState
          title={t('filesTab.empty.mavlink-only-title')}
          message={t('filesTab.empty.mavlink-only-message')}
        />
      </ChromedShell>
    );
  }

  return (
    <ChromedShell>
      {isSitl && (
        <div className="mb-3 px-3 py-2 rounded text-xs bg-blue-500/10 border border-blue-500/30 text-blue-400">
          <div className="font-semibold mb-0.5">{t('filesTab.sitl.title')}</div>
          {t('filesTab.sitl.body-before')}{' '}
          <code className="font-mono text-[11px]">/APM/</code>{' '}
          {t('filesTab.sitl.body-after')}
        </div>
      )}

      <SdStorageCard
        storageInfo={storageInfo}
        cardUsage={cardUsage}
        scanning={scanning}
        onScan={scanCard}
        erasing={erasingLogs}
        eraseDone={eraseLogsDone}
        onEraseLogs={() => setEraseLogsOpen(true)}
        formatting={formatting}
        formatDone={formatDone}
        onFormat={() => setFormatOpen(true)}
      />

      <PathBar
        path={path}
        loading={loading}
        uploading={uploading}
        onNavigate={setPath}
        onRefresh={() => refresh(path)}
        onUpload={handleUpload}
      />

      {uploadError && (
        <div className="mt-2 flex items-start gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold mb-0.5">{t('filesTab.upload.failed')}</div>
            <div>{uploadError}</div>
          </div>
          <button onClick={() => setUploadError(null)} className="ml-auto text-content-secondary hover:text-content">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 px-3 py-2 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div>
            <div className="font-semibold mb-0.5">{t('filesTab.error.list-title', { path })}</div>
            <div>{error}</div>
          </div>
        </div>
      )}

      {!error && entries !== null && entries.length === 0 && !loading && (
        <div className="mt-6 text-center text-sm text-content-secondary">{t('filesTab.table.empty-dir')}</div>
      )}

      {entries !== null && entries.length > 0 && (
        <div className="mt-3 rounded-lg border border-default bg-surface overflow-hidden">
          <div className="grid grid-cols-[1fr_100px_180px] text-[10px] font-semibold tracking-wider text-content-secondary uppercase border-b border-default px-3 py-2">
            <div>{t('filesTab.table.name')}</div>
            <div className="text-right">{t('filesTab.table.size')}</div>
            <div className="text-right">{t('filesTab.table.actions')}</div>
          </div>
          <div className="max-h-[60vh] overflow-y-auto">
            {entries.map(entry => {
              const fcPath = fcPathFor(entry);
              const busy = rowState[fcPath];
              return (
                <div
                  key={entry.name}
                  className="grid grid-cols-[1fr_100px_180px] items-center px-3 py-2 text-xs border-b border-subtle last:border-b-0 hover:bg-surface-raised/40"
                >
                  <button
                    onClick={() => handleEntryClick(entry)}
                    disabled={entry.kind !== 'dir'}
                    className={`flex items-center gap-2 text-left truncate ${
                      entry.kind === 'dir' ? 'text-content hover:text-blue-400 cursor-pointer' : 'text-content-secondary cursor-default'
                    }`}
                  >
                    {entry.kind === 'dir'
                      ? <Folder className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      : <File   className="w-4 h-4 text-content-tertiary flex-shrink-0" />}
                    <span className="font-mono truncate">{entry.name}</span>
                  </button>
                  <div className="text-right font-mono text-content-secondary">
                    {entry.kind === 'file' ? formatSize(entry.size ?? 0) : '-'}
                  </div>
                  <RowActions
                    entry={entry}
                    busy={busy}
                    onDownload={() => handleDownload(entry)}
                    onRename={() => setRenameTarget(entry)}
                    onDelete={() => setConfirmDelete(entry)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          entry={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={handleConfirmDelete}
        />
      )}

      {renameTarget && (
        <RenameModal
          entry={renameTarget}
          onCancel={() => setRenameTarget(null)}
          onSubmit={handleRenameSubmit}
        />
      )}

      {eraseLogsOpen && (
        <ConfirmEraseLogsModal
          onCancel={() => setEraseLogsOpen(false)}
          onConfirm={handleEraseLogs}
        />
      )}

      {formatOpen && (
        <ConfirmFormatModal
          onCancel={() => setFormatOpen(false)}
          onConfirm={handleFormat}
        />
      )}
    </ChromedShell>
  );
};

function ChromedShell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation('mavlink');
  return (
    <div className="h-full flex flex-col p-4 gap-3 overflow-y-auto">
      <div className="flex items-center gap-3 flex-shrink-0">
        <FolderOpen className="w-6 h-6 text-content-secondary" />
        <div>
          <h2 className="text-lg font-semibold text-content">{t('filesTab.header.title')}</h2>
          <p className="text-xs text-content-secondary">{t('filesTab.header.desc')}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="max-w-md text-center">
        <div className="text-content font-medium mb-1">{title}</div>
        <div className="text-sm text-content-secondary">{message}</div>
      </div>
    </div>
  );
}

interface PathBarProps {
  path: string;
  loading: boolean;
  uploading: boolean;
  onNavigate: (path: string) => void;
  onRefresh: () => void;
  onUpload: () => void;
}

function PathBar({ path, loading, uploading, onNavigate, onRefresh, onUpload }: PathBarProps) {
  const { t } = useTranslation('mavlink');
  const parts = path.split('/').filter(Boolean);
  return (
    <div className="flex items-center gap-1 flex-wrap text-xs" data-tour="ftp-path-bar">
      <button
        onClick={() => onNavigate('/')}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-raised text-content-secondary hover:text-content"
        title={t('filesTab.path.go-root')}
      >
        <Home className="w-3.5 h-3.5" />
      </button>
      {parts.map((part, i) => {
        const targetPath = '/' + parts.slice(0, i + 1).join('/') + '/';
        const isLast = i === parts.length - 1;
        return (
          <React.Fragment key={`${i}-${part}`}>
            <ChevronRight className="w-3 h-3 text-content-tertiary" />
            <button
              onClick={() => onNavigate(targetPath)}
              className={`px-2 py-1 rounded font-mono ${
                isLast
                  ? 'text-content font-medium cursor-default'
                  : 'text-content-secondary hover:bg-surface-raised hover:text-content'
              }`}
              disabled={isLast}
            >
              {part}
            </button>
          </React.Fragment>
        );
      })}
      <div className="flex-1" />
      <button
        data-tour="ftp-upload-button"
        onClick={onUpload}
        disabled={uploading}
        className="flex items-center gap-1 px-2 py-1 rounded text-content hover:bg-surface-raised disabled:opacity-50"
        title={t('filesTab.path.upload-tip')}
      >
        {uploading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <Upload className="w-3.5 h-3.5" />}
        <span>{uploading ? t('filesTab.path.uploading') : t('filesTab.path.upload')}</span>
      </button>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-surface-raised text-content-secondary hover:text-content disabled:opacity-50"
        title={t('filesTab.path.refresh-tip')}
      >
        {loading
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : <RefreshCw className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function RowActions({
  entry,
  busy,
  onDownload,
  onRename,
  onDelete,
}: {
  entry: DirEntry;
  busy: RowBusy | undefined;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation('mavlink');
  const inFlight = ROW_BUSY_LABELS.find(row => row.state === busy?.state);
  if (inFlight) {
    return <BusyChip icon={<Loader2 className="w-3 h-3 animate-spin" />} label={ftText(t, inFlight.labelKey, inFlight.label)} />;
  }
  if (busy?.state === 'error') {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-rose-400 text-[11px] truncate" title={busy.detail ?? t('filesTab.row.failed')}>{t('filesTab.row.failed')}</span>
        <IconAction title={t('filesTab.action.rename')} onClick={onRename}><Pencil className="w-3 h-3" /></IconAction>
        <IconAction title={t('filesTab.action.delete')} onClick={onDelete} variant="danger"><Trash2 className="w-3 h-3" /></IconAction>
        {entry.kind === 'file' && (
          <IconAction title={t('filesTab.action.download')} onClick={onDownload}><Download className="w-3 h-3" /></IconAction>
        )}
      </div>
    );
  }
  if (busy?.state === 'done' && entry.kind === 'file') {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-emerald-400 text-[11px] truncate" title={t('filesTab.row.saved-to', { path: busy.detail ?? '' })}>{t('filesTab.row.saved')}</span>
        <IconAction title={t('filesTab.action.rename')} onClick={onRename}><Pencil className="w-3 h-3" /></IconAction>
        <IconAction title={t('filesTab.action.delete')} onClick={onDelete} variant="danger"><Trash2 className="w-3 h-3" /></IconAction>
        <IconAction title={t('filesTab.action.redownload')} onClick={onDownload}><Download className="w-3 h-3" /></IconAction>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2" data-tour="ftp-row-actions">
      <IconAction title={t('filesTab.action.rename')} onClick={onRename}><Pencil className="w-3 h-3" /></IconAction>
      <IconAction title={t('filesTab.action.delete')} onClick={onDelete} variant="danger"><Trash2 className="w-3 h-3" /></IconAction>
      {entry.kind === 'file' && (
        <IconAction title={t('filesTab.action.download')} onClick={onDownload}><Download className="w-3 h-3" /></IconAction>
      )}
    </div>
  );
}

function BusyChip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center justify-end gap-1 text-content-secondary text-[11px]">
      {icon}
      {label}
    </span>
  );
}

function IconAction({
  title,
  onClick,
  variant,
  children,
}: {
  title: string;
  onClick: () => void;
  variant?: 'danger';
  children: React.ReactNode;
}) {
  const danger = variant === 'danger';
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`p-1 rounded ${
        danger
          ? 'text-rose-400 hover:bg-rose-500/10 hover:text-rose-300'
          : 'text-content-secondary hover:bg-surface-raised hover:text-content'
      }`}
    >
      {children}
    </button>
  );
}

function SdStorageCard({
  storageInfo,
  cardUsage,
  scanning,
  onScan,
  erasing,
  eraseDone,
  onEraseLogs,
  formatting,
  formatDone,
  onFormat,
}: {
  storageInfo: { totalBytes: number; usedBytes: number; availableBytes: number } | null;
  cardUsage: CardUsage | null;
  scanning: boolean;
  onScan: () => void;
  erasing: boolean;
  eraseDone: boolean;
  onEraseLogs: () => void;
  formatting: boolean;
  formatDone: boolean;
  onFormat: () => void;
}) {
  const { t } = useTranslation('mavlink');
  const hasInfo = storageInfo !== null && storageInfo.totalBytes > 0;
  const pct = hasInfo ? Math.min(100, (storageInfo.usedBytes / storageInfo.totalBytes) * 100) : 0;
  const barColor = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-blue-500';
  const low = hasInfo && pct >= 90;
  // Proportions of what we can see, since the card's true capacity is unknown.
  const seen = (cardUsage?.logBytes ?? 0) + (cardUsage?.otherBytes ?? 0);
  const barSplit = {
    logPct: seen > 0 ? ((cardUsage?.logBytes ?? 0) / seen) * 100 : 0,
    otherPct: seen > 0 ? ((cardUsage?.otherBytes ?? 0) / seen) * 100 : 0,
  };

  return (
    <div className="flex-shrink-0 px-4 py-3 rounded-lg bg-surface border border-subtle">
      <div className="flex items-center gap-4">
        <HardDrive className="w-4 h-4 text-content-secondary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          {hasInfo ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-content-secondary">
                  {t('filesTab.storage.sd-card')}<span className="text-content font-medium">{formatSize(storageInfo.usedBytes)}</span>
                  {t('filesTab.storage.of-total-used', { total: formatSize(storageInfo.totalBytes) })}
                </span>
                <span className={`text-xs font-medium ${low ? 'text-red-400' : 'text-content-secondary'}`}>
                  {t('filesTab.storage.free', { size: formatSize(storageInfo.availableBytes) })}
                </span>
              </div>
              <div className="w-full bg-surface-inset rounded-full h-1.5">
                <div className={`${barColor} h-1.5 rounded-full transition-all`} style={{ width: `${pct}%` }} />
              </div>
              {low && (
                <p className="text-[11px] text-red-400 mt-1.5">
                  {t('filesTab.storage.low-warning')}
                </p>
              )}
            </>
          ) : cardUsage ? (
            <>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-content-secondary">
                  {t('filesTab.storage.flight-logs')}<span className="text-content font-medium">{formatSize(cardUsage.logBytes)}</span>
                  {cardUsage.logCount === 1
                    ? t('filesTab.storage.in-file-one', { count: cardUsage.logCount })
                    : t('filesTab.storage.in-file-other', { count: cardUsage.logCount })}
                </span>
                <span className="text-xs text-content-secondary">
                  {t('filesTab.storage.other-data')}<span className="text-content font-medium">{formatSize(cardUsage.otherBytes)}</span>
                </span>
              </div>
              <div className="flex w-full bg-surface-inset rounded-full h-1.5 overflow-hidden">
                <div className="bg-blue-500 h-1.5" style={{ width: `${barSplit.logPct}%` }} />
                <div className="bg-amber-500 h-1.5" style={{ width: `${barSplit.otherPct}%` }} />
              </div>
              <p className="text-[11px] text-content-tertiary mt-1.5">
                {t('filesTab.storage.seen-on-card', { size: formatSize(cardUsage.logBytes + cardUsage.otherBytes) })}
                {cardUsage.otherBytes > 0 && <>{' '}{t('filesTab.storage.amber-note')}</>}
              </p>
              {cardUsage.unreadable.length > 0 && (
                <p className="text-[11px] text-amber-400 mt-1">
                  {cardUsage.unreadable.length === 1
                    ? t('filesTab.storage.unreadable-one', { count: cardUsage.unreadable.length })
                    : t('filesTab.storage.unreadable-other', { count: cardUsage.unreadable.length })}
                </p>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs text-content-tertiary">
                {t('filesTab.storage.no-capacity')}
              </span>
              <button
                onClick={onScan}
                disabled={scanning}
                className="px-2 py-1 rounded text-xs text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 disabled:opacity-50 transition-colors"
                data-tip={t('filesTab.storage.scan-tip')}
              >
                {scanning ? t('filesTab.storage.scanning') : t('filesTab.storage.scan')}
              </button>
            </div>
          )}
        </div>
        <button
          onClick={onEraseLogs}
          disabled={erasing || formatting}
          data-tip={t('filesTab.storage.erase-tip')}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 disabled:opacity-50 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {erasing ? t('filesTab.storage.erasing') : eraseDone ? t('filesTab.storage.erase-done') : t('filesTab.storage.erase-logs')}
        </button>
        <button
          onClick={onFormat}
          disabled={formatting || erasing}
          data-tip={t('filesTab.storage.format-tip')}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 disabled:opacity-50 transition-colors"
        >
          <Eraser className="w-3.5 h-3.5" />
          {formatting ? t('filesTab.storage.formatting') : formatDone ? t('filesTab.storage.format-done') : t('filesTab.storage.format-card')}
        </button>
      </div>
    </div>
  );
}

function ConfirmFormatModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('mavlink');
  return (
    <ModalShell onCancel={onCancel}>
      <div className="text-content font-medium mb-1">{t('filesTab.format-confirm.title')}</div>
      <div className="text-xs text-content-secondary mb-4">
        {t('filesTab.format-confirm.body-before')}{' '}
        <span className="text-content font-medium">{t('filesTab.format-confirm.everything')}</span>{' '}
        {t('filesTab.format-confirm.body-after')}
        <span className="block mt-1 text-content-secondary">
          {t('filesTab.format-confirm.params-safe')}
        </span>
        <span className="block mt-1 text-amber-400">
          {t('filesTab.format-confirm.armed-warning')}
        </span>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs text-content hover:bg-surface-raised"
        >
          {t('filesTab.action.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 rounded text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
        >
          {t('filesTab.storage.format-card')}
        </button>
      </div>
    </ModalShell>
  );
}

function ConfirmEraseLogsModal({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('mavlink');
  return (
    <ModalShell onCancel={onCancel}>
      <div className="text-content font-medium mb-1">{t('filesTab.erase-confirm.title')}</div>
      <div className="text-xs text-content-secondary mb-4">
        {t('filesTab.erase-confirm.body')}
        <span className="block mt-1 text-amber-400">
          {t('filesTab.erase-confirm.download-warning')}
        </span>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs text-content hover:bg-surface-raised"
        >
          {t('filesTab.action.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 rounded text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
        >
          {t('filesTab.erase-confirm.confirm')}
        </button>
      </div>
    </ModalShell>
  );
}

function ConfirmDeleteModal({
  entry,
  onCancel,
  onConfirm,
}: {
  entry: DirEntry;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation('mavlink');
  return (
    <ModalShell onCancel={onCancel}>
      <div className="text-content font-medium mb-1">
        {entry.kind === 'dir'
          ? t('filesTab.delete-confirm.title-dir')
          : t('filesTab.delete-confirm.title-file')}
      </div>
      <div className="text-xs text-content-secondary mb-4 break-all">
        <span className="font-mono">{entry.name}</span>{' '}
        {t('filesTab.delete-confirm.body-after')}
        {entry.kind === 'dir' && (
          <span className="block mt-1 text-amber-400">{t('filesTab.delete-confirm.dir-warning')}</span>
        )}
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs text-content hover:bg-surface-raised"
        >
          {t('filesTab.action.cancel')}
        </button>
        <button
          onClick={onConfirm}
          className="px-3 py-1.5 rounded text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30"
        >
          {t('filesTab.action.delete')}
        </button>
      </div>
    </ModalShell>
  );
}

function RenameModal({
  entry,
  onCancel,
  onSubmit,
}: {
  entry: DirEntry;
  onCancel: () => void;
  onSubmit: (newName: string) => void;
}) {
  const { t } = useTranslation('mavlink');
  const [name, setName] = useState(entry.name);
  return (
    <ModalShell onCancel={onCancel}>
      <div className="text-content font-medium mb-1">
        {entry.kind === 'dir' ? t('filesTab.rename.title-dir') : t('filesTab.rename.title-file')}
      </div>
      <div className="text-xs text-content-secondary mb-3 break-all">
        {t('filesTab.rename.current-name')} <span className="font-mono">{entry.name}</span>
      </div>
      <input
        type="text"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') onSubmit(name);
          if (e.key === 'Escape') onCancel();
        }}
        autoFocus
        className="w-full px-2 py-1.5 mb-4 rounded bg-surface-raised border border-default text-content text-xs font-mono focus:outline-none focus:border-blue-500/60"
        placeholder={t('filesTab.rename.placeholder')}
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 rounded text-xs text-content hover:bg-surface-raised"
        >
          {t('filesTab.action.cancel')}
        </button>
        <button
          onClick={() => onSubmit(name)}
          disabled={!name.trim() || name.trim() === entry.name}
          className="px-3 py-1.5 rounded text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t('filesTab.action.rename')}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-surface-solid border border-default rounded-lg p-5 max-w-md w-full mx-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
