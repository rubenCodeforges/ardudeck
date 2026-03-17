import { useEffect, useRef, useState, useMemo } from 'react';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer } from '../../panels/panel-utils';
import type { LogLevel } from '@ardudeck/companion-types';

const LOG_LEVEL_COLORS: Record<LogLevel, { text: string; bg: string; border: string }> = {
  debug: { text: 'text-gray-500', bg: 'bg-gray-600/20', border: 'border-l-gray-600' },
  info: { text: 'text-blue-400', bg: 'bg-blue-500/20', border: 'border-l-blue-500' },
  warn: { text: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-l-yellow-500' },
  error: { text: 'text-red-400', bg: 'bg-red-500/20', border: 'border-l-red-500' },
};

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LogsPanel() {
  const logs = useCompanionStore((s) => s.logs);
  const [activeFilters, setActiveFilters] = useState<Set<LogLevel>>(new Set(LOG_LEVELS));
  const [autoScroll, setAutoScroll] = useState(true);
  const [searchText, setSearchText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  const toggleFilter = (level: LogLevel) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        next.delete(level);
      } else {
        next.add(level);
      }
      return next;
    });
  };

  const filteredLogs = useMemo(() => {
    let result = logs.filter((log) => activeFilters.has(log.level));
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter((log) => log.message.toLowerCase().includes(lower) || log.source.toLowerCase().includes(lower));
    }
    return result;
  }, [logs, activeFilters, searchText]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filteredLogs.length, autoScroll]);

  // Detect manual scroll to disable auto-scroll
  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
    setAutoScroll(isAtBottom);
  };

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700/40 shrink-0">
        {/* Level filter buttons */}
        <div className="flex items-center gap-1">
          {LOG_LEVELS.map((level) => {
            const colors = LOG_LEVEL_COLORS[level];
            const isActive = activeFilters.has(level);
            return (
              <button
                key={level}
                onClick={() => toggleFilter(level)}
                className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition-colors ${
                  isActive
                    ? `${colors.bg} ${colors.text}`
                    : 'bg-gray-800/50 text-gray-600'
                }`}
              >
                {level.toUpperCase()}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <input
          type="text"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search logs..."
          className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded px-2 py-0.5 text-[11px] text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />

        <span className="text-[10px] text-gray-600">{filteredLogs.length}/{logs.length}</span>
      </div>

      {/* Log list */}
      <div
        ref={listRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        {filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            {logs.length === 0 ? 'Waiting for logs...' : 'No logs match filter'}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {filteredLogs.map((log, i) => {
              const colors = LOG_LEVEL_COLORS[log.level];
              return (
                <div
                  key={`${log.timestamp}-${i}`}
                  className={`flex items-start gap-2 px-3 py-1 border-l-2 ${colors.border} hover:bg-gray-800/30 transition-colors`}
                >
                  <span className={`shrink-0 text-[9px] font-mono font-bold px-1 py-0.5 rounded ${colors.bg} ${colors.text} mt-0.5`}>
                    {log.level.slice(0, 4).toUpperCase()}
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono shrink-0 mt-0.5">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  {log.source && (
                    <span className="text-[10px] text-gray-600 shrink-0 mt-0.5">
                      [{log.source}]
                    </span>
                  )}
                  <span className={`text-xs font-mono leading-relaxed ${colors.text} break-all`}>
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && filteredLogs.length > 0 && (
        <button
          onClick={() => {
            setAutoScroll(true);
            if (listRef.current) {
              listRef.current.scrollTop = listRef.current.scrollHeight;
            }
          }}
          className="absolute bottom-2 right-4 px-2 py-1 bg-blue-600/80 hover:bg-blue-500/80 text-white text-[10px] rounded shadow-lg transition-colors"
        >
          Scroll to bottom
        </button>
      )}
    </PanelContainer>
  );
}
