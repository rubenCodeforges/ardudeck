import { useEffect, useState } from 'react';
import { useLogStore, type LogListEntry } from '../../stores/log-store';
import { useConnectionStore } from '../../stores/connection-store';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(utcSeconds: number): string {
  if (utcSeconds === 0) return 'Unknown';
  return new Date(utcSeconds * 1000).toLocaleString();
}

async function parseAndAnalyze(data: number[], path: string) {
  const store = useLogStore.getState();
  store.setIsParsingLog(true);
  store.setParseProgress(0);

  try {
    const result = await window.electronAPI.logParse(data) as { log: unknown; healthResults: unknown[] };
    store.setCurrentLog(result.log as ReturnType<typeof useLogStore.getState>['currentLog'], path);
    store.setHealthResults(result.healthResults as ReturnType<typeof useLogStore.getState>['healthResults']);
    store.setActiveTab('report');
  } catch (error) {
    console.error('[Logs] Parse failed:', error);
  } finally {
    store.setIsParsingLog(false);
  }
}

export function LogListPanel() {
  const availableLogs = useLogStore((s) => s.availableLogs);
  const isListLoading = useLogStore((s) => s.isListLoading);
  const downloadingLogId = useLogStore((s) => s.downloadingLogId);
  const downloadProgress = useLogStore((s) => s.downloadProgress);
  const isParsingLog = useLogStore((s) => s.isParsingLog);
  const parseProgress = useLogStore((s) => s.parseProgress);
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const protocol = useConnectionStore((s) => s.connectionState.protocol);
  const isMavlink = protocol === 'mavlink';
  const [listRequested, setListRequested] = useState(false);

  useEffect(() => {
    const cleanupProgress = window.electronAPI.onLogDownloadProgress((progress) => {
      useLogStore.getState().setDownloadProgress(
        progress.total > 0 ? (progress.received / progress.total) * 100 : 0,
      );
    });

    const cleanupComplete = window.electronAPI.onLogDownloadComplete(() => {
      useLogStore.getState().setDownloadingLogId(null);
      useLogStore.getState().setDownloadProgress(0);
    });

    const cleanupError = window.electronAPI.onLogDownloadError(() => {
      useLogStore.getState().setDownloadingLogId(null);
      useLogStore.getState().setDownloadProgress(0);
    });

    const cleanupParseProgress = window.electronAPI.onLogParseProgress((progress) => {
      useLogStore.getState().setParseProgress(
        progress.totalBytes > 0 ? (progress.bytesConsumed / progress.totalBytes) * 100 : 0,
      );
    });

    return () => {
      cleanupProgress();
      cleanupComplete();
      cleanupError();
      cleanupParseProgress();
    };
  }, []);

  const handleRefresh = async () => {
    useLogStore.getState().setIsListLoading(true);
    setListRequested(true);
    try {
      const logs = await window.electronAPI.logListRequest() as LogListEntry[];
      useLogStore.getState().setAvailableLogs(logs);
    } finally {
      useLogStore.getState().setIsListLoading(false);
    }
  };

  const handleDownload = async (log: LogListEntry) => {
    useLogStore.getState().setDownloadingLogId(log.id);
    useLogStore.getState().setDownloadProgress(0);

    const savedPath = await window.electronAPI.logDownload(log.id, log.size);
    if (!savedPath) {
      useLogStore.getState().setDownloadingLogId(null);
      return;
    }
    useLogStore.getState().setDownloadingLogId(null);
  };

  const handleOpenFile = async () => {
    const result = await window.electronAPI.logOpenFile();
    if (result) {
      await parseAndAnalyze(result.data, result.path);
    }
  };

  const handleCancel = () => {
    window.electronAPI.logDownloadCancel();
    useLogStore.getState().setDownloadingLogId(null);
    useLogStore.getState().setDownloadProgress(0);
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4">
      {/* Actions */}
      <div className="flex items-center gap-3">
        {isConnected && isMavlink && (
          <button
            onClick={handleRefresh}
            disabled={isListLoading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {isListLoading ? 'Loading...' : 'List Logs from FC'}
          </button>
        )}
        <button
          onClick={handleOpenFile}
          disabled={isParsingLog}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-200 text-sm font-medium rounded-lg transition-colors"
        >
          Open .bin File
        </button>
      </div>

      {/* Parse progress */}
      {isParsingLog && (
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">Parsing log...</span>
            <span className="text-sm text-gray-400">{parseProgress.toFixed(0)}%</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${parseProgress}%` }} />
          </div>
        </div>
      )}

      {/* Not connected hint */}
      {!isConnected && availableLogs.length === 0 && !isParsingLog && (
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-6 text-center">
          <p className="text-gray-400 text-sm">
            Connect to a flight controller to download logs, or open a .bin file from disk.
          </p>
        </div>
      )}

      {/* No logs found after request */}
      {listRequested && !isListLoading && availableLogs.length === 0 && (
        <div className="bg-gray-800/30 rounded-xl border border-amber-500/30 p-6 text-center">
          <p className="text-amber-400 text-sm font-medium mb-1">No logs found</p>
          <p className="text-gray-500 text-xs">
            The flight controller did not return any logs. This can happen if no flights have been recorded or the FC timed out.
          </p>
        </div>
      )}

      {/* Log list */}
      {availableLogs.length > 0 && (
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700/50">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">#</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Date</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Size</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {availableLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td className="px-4 py-3 text-gray-300">{log.id}</td>
                  <td className="px-4 py-3 text-gray-300">{formatDate(log.timeUtc)}</td>
                  <td className="px-4 py-3 text-gray-400 text-right">{formatBytes(log.size)}</td>
                  <td className="px-4 py-3 text-right">
                    {downloadingLogId === log.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-24 bg-gray-700 rounded-full h-1.5">
                          <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${downloadProgress}%` }} />
                        </div>
                        <button onClick={handleCancel} className="text-xs text-red-400 hover:text-red-300">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleDownload(log)}
                        disabled={downloadingLogId !== null}
                        className="text-xs px-3 py-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 disabled:opacity-50 rounded-md transition-colors"
                      >
                        Download
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
