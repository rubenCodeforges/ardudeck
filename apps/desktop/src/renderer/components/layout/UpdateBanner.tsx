import { useUpdateStore } from '../../stores/update-store';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdateBanner() {
  const {
    status,
    canAutoUpdate,
    latestVersion,
    releaseName,
    downloadProgress,
    bytesDownloaded,
    totalBytes,
    dismissed,
    dismiss,
    downloadUpdate,
    installUpdate,
    openReleaseUrl,
  } = useUpdateStore();

  // Only show for actionable states, and respect dismiss
  if (status !== 'available' && status !== 'downloading' && status !== 'downloaded') return null;
  if (dismissed && status !== 'downloading') return null;

  const versionLabel = latestVersion ? `v${latestVersion}` : 'new version';
  const nameLabel = releaseName && releaseName !== `v${latestVersion}` ? ` — ${releaseName}` : '';

  // Available state (blue) — shows for both signed and unsigned apps
  if (status === 'available') {
    return (
      <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/30 border-b border-blue-500/30 px-6 py-2.5 flex items-center gap-3 shrink-0">
        <svg className="w-4 h-4 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span className="text-sm text-gray-300 flex-1">
          <span className="font-medium text-blue-300">ArduDeck {versionLabel}</span> is available{nameLabel}
        </span>
        {canAutoUpdate ? (
          <button
            onClick={() => downloadUpdate()}
            className="px-3 py-1 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors"
          >
            Download
          </button>
        ) : (
          <button
            onClick={openReleaseUrl}
            className="px-3 py-1 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
          >
            View Release
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}
        <button
          onClick={dismiss}
          className="p-1 text-gray-400 hover:text-white transition-colors"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  // Downloading state (blue with progress) — only for signed apps
  if (status === 'downloading') {
    const progress = Math.round(downloadProgress);
    const bytesLabel = totalBytes > 0
      ? `${formatBytes(bytesDownloaded)} / ${formatBytes(totalBytes)}`
      : formatBytes(bytesDownloaded);

    return (
      <div className="bg-gradient-to-r from-blue-900/40 to-indigo-900/30 border-b border-blue-500/30 px-6 py-2.5 shrink-0">
        <div className="flex items-center gap-3">
          <svg className="w-4 h-4 text-blue-400 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm text-gray-300 flex-1">
            Downloading <span className="font-medium text-blue-300">ArduDeck {versionLabel}</span>
            <span className="text-gray-500 ml-2 text-xs">{bytesLabel}</span>
          </span>
          <span className="text-xs text-gray-400 tabular-nums">{progress}%</span>
        </div>
        <div className="mt-1.5 h-1 bg-gray-700/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    );
  }

  // Downloaded state (green) — only for signed apps
  return (
    <div className="bg-gradient-to-r from-emerald-900/40 to-green-900/30 border-b border-emerald-500/30 px-6 py-2.5 flex items-center gap-3 shrink-0">
      <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
      <span className="text-sm text-gray-300 flex-1">
        <span className="font-medium text-emerald-300">ArduDeck {versionLabel}</span> is ready to install
      </span>
      <button
        onClick={() => installUpdate()}
        className="px-3 py-1 bg-emerald-600/80 hover:bg-emerald-500/80 text-white text-xs font-medium rounded-lg transition-colors"
      >
        Restart to Update
      </button>
      <button
        onClick={dismiss}
        className="p-1 text-gray-400 hover:text-white transition-colors"
        title="Dismiss"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
