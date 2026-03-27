import { useEffect, useState, useCallback } from 'react';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer } from '../../panels/panel-utils';
import type { FileEntry } from '@ardudeck/companion-types';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const size = sizes[i];
  if (size === undefined) return `${bytes} B`;
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${size}`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('en-GB', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function FileIcon({ isDirectory }: { isDirectory: boolean }) {
  if (isDirectory) {
    return (
      <svg className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
        <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  );
}

export function FileBrowserPanel() {
  const connectionState = useCompanionStore((s) => s.connectionState);
  const isConnected = connectionState.state === 'connected';

  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDirectory = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.companionListFiles(path);
      setEntries(result);
      setCurrentPath(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list directory');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load initial directory
  useEffect(() => {
    if (isConnected) {
      loadDirectory('/');
    }
  }, [isConnected, loadDirectory]);

  const navigateTo = (path: string) => {
    loadDirectory(path);
  };

  const navigateUp = () => {
    const parentPath = currentPath.split('/').slice(0, -1).join('/') || '/';
    loadDirectory(parentPath);
  };

  const handleDownload = async (entry: FileEntry) => {
    try {
      const data = await window.electronAPI.companionReadFile(entry.path);
      // Handle both string and binary (ArrayBuffer/Uint8Array) responses
      let blob: Blob;
      if (data instanceof ArrayBuffer) {
        blob = new Blob([data]);
      } else if (data instanceof Uint8Array) {
        blob = new Blob([data.buffer as ArrayBuffer]);
      } else if (typeof data === 'string') {
        blob = new Blob([data]);
      } else {
        // Buffer from Electron IPC comes as { type: 'Buffer', data: number[] }
        const bufferData = data as { type?: string; data?: number[] };
        if (bufferData.type === 'Buffer' && Array.isArray(bufferData.data)) {
          blob = new Blob([new Uint8Array(bufferData.data)]);
        } else {
          blob = new Blob([JSON.stringify(data)]);
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = entry.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Download failed silently
    }
  };

  // Build breadcrumb segments
  const pathSegments = currentPath.split('/').filter(Boolean);
  const breadcrumbs = [
    { label: '/', path: '/' },
    ...pathSegments.map((segment, i) => ({
      label: segment,
      path: '/' + pathSegments.slice(0, i + 1).join('/'),
    })),
  ];

  if (!isConnected) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-gray-600 text-xs">
          <div className="text-gray-500 mb-1">File browser unavailable</div>
          <div>Connect to companion agent to browse files.</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Breadcrumb navigation */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-700/40 shrink-0 overflow-x-auto">
        <button
          onClick={navigateUp}
          className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 p-0.5"
          disabled={currentPath === '/'}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-0.5 text-xs overflow-x-auto">
          {breadcrumbs.map((crumb, i) => (
            <div key={crumb.path} className="flex items-center gap-0.5 shrink-0">
              {i > 0 && <span className="text-gray-600">/</span>}
              <button
                onClick={() => navigateTo(crumb.path)}
                className={`px-1 py-0.5 rounded hover:bg-gray-700/50 transition-colors ${
                  i === breadcrumbs.length - 1 ? 'text-gray-200' : 'text-gray-500'
                }`}
              >
                {crumb.label}
              </button>
            </div>
          ))}
        </div>

        <div className="flex-1" />

        <button
          onClick={() => loadDirectory(currentPath)}
          className="text-gray-500 hover:text-gray-300 transition-colors shrink-0 p-0.5"
          title="Refresh"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="px-3 py-2 bg-red-500/10 border-b border-red-500/30 text-xs text-red-400">
          {error}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            Loading...
          </div>
        ) : entries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            Empty directory
          </div>
        ) : (
          <div>
            {/* Sort: directories first, then files alphabetically */}
            {[...entries]
              .sort((a, b) => {
                if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
                return a.name.localeCompare(b.name);
              })
              .map((entry) => (
                <div
                  key={entry.path}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-800/30 transition-colors cursor-pointer group"
                  onClick={() => entry.isDirectory && navigateTo(entry.path)}
                >
                  <FileIcon isDirectory={entry.isDirectory} />
                  <span className={`flex-1 text-xs truncate ${entry.isDirectory ? 'text-gray-200' : 'text-gray-400'}`}>
                    {entry.name}
                  </span>
                  {!entry.isDirectory && (
                    <>
                      <span className="text-[10px] text-gray-600">{formatBytes(entry.size)}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(entry);
                        }}
                        className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-blue-400 transition-all"
                        title="Download"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      </button>
                    </>
                  )}
                  <span className="text-[10px] text-gray-600">{formatDate(entry.modified)}</span>
                </div>
              ))}
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
