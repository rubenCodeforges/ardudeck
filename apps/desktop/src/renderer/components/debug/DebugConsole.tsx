import { useEffect, useRef } from 'react';
import { useConsoleStore } from '../../stores/console-store';

const LOG_COLORS = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-gray-400',
  packet: 'text-emerald-400',
};

const LOG_ICONS = {
  info: 'i',
  warn: '!',
  error: 'x',
  debug: '#',
  packet: '>',
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

export function DebugConsole() {
  const { logs, isExpanded, filter, toggleExpanded, clearLogs, setFilter } = useConsoleStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded]);

  // Listen for console logs from main process
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onConsoleLog((entry) => {
      useConsoleStore.getState().addLog(entry);
    });
    return () => { unsubscribe?.(); };
  }, []);

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(log => log.level === filter || (filter === 'error' && log.level === 'warn'));

  const lastLog = logs[logs.length - 1];

  return (
    <div className="border-t border-gray-800/50 bg-gray-900/80 backdrop-blur-sm flex flex-col">
      {/* Collapsed bar - always visible */}
      <button
        onClick={toggleExpanded}
        className="h-8 px-4 flex items-center gap-3 hover:bg-gray-800/50 transition-colors cursor-pointer w-full text-left"
      >
        {/* Expand/collapse icon */}
        <svg
          className={`w-3.5 h-3.5 text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>

        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Console</span>

        {/* Last log preview when collapsed */}
        {!isExpanded && lastLog && (
          <span className={`text-xs truncate flex-1 ${LOG_COLORS[lastLog.level]}`}>
            <span className="text-gray-600 mr-2">{formatTime(lastLog.timestamp)}</span>
            {lastLog.message}
          </span>
        )}

        {/* Log count badge */}
        <span className="text-xs text-gray-600">
          {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
        </span>
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="flex flex-col" style={{ height: '35vh' }}>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800/50 bg-gray-900/50">
            {/* Filter buttons */}
            <div className="flex gap-1">
              {(['all', 'info', 'error', 'packet'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    filter === f
                      ? 'bg-gray-700 text-white'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Clear button */}
            <button
              onClick={clearLogs}
              className="px-2 py-0.5 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 rounded transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Log entries */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5">
            {filteredLogs.length === 0 ? (
              <div className="text-gray-600 text-center py-4">No log entries</div>
            ) : (
              filteredLogs.map((log) => (
                <div key={log.id} className="flex gap-2 hover:bg-gray-800/30 px-1 py-0.5 rounded">
                  {/* Time */}
                  <span className="text-gray-600 shrink-0">{formatTime(log.timestamp)}</span>

                  {/* Level icon */}
                  <span className={`shrink-0 w-4 text-center ${LOG_COLORS[log.level]}`}>
                    {LOG_ICONS[log.level]}
                  </span>

                  {/* Message */}
                  <span className={LOG_COLORS[log.level]}>{log.message}</span>

                  {/* Details */}
                  {log.details && (
                    <span className="text-gray-600">{log.details}</span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
