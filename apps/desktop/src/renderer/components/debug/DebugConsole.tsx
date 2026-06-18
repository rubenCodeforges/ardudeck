import { useState, useEffect, useRef } from 'react';
import { useConsoleStore } from '../../stores/console-store';
import { useMessagesStore } from '../../stores/messages-store';
import { useConnectionStore } from '../../stores/connection-store';
import { matchPreArmError } from '../../../shared/prearm-checks';
import { PreArmParamFix } from '../prearm/PreArmParamFix';

const LOG_COLORS = {
  info: 'text-blue-400',
  warn: 'text-yellow-400',
  error: 'text-red-400',
  debug: 'text-content-secondary',
  packet: 'text-emerald-400',
};

const LOG_ICONS = {
  info: 'i',
  warn: '!',
  error: 'x',
  debug: '#',
  packet: '>',
};

/** Severity → Tailwind color class */
function severityColor(severity: number): string {
  switch (severity) {
    case 0: case 1: case 2: case 3:
      return 'text-red-400';
    case 4:
      return 'text-yellow-400';
    case 5:
      return 'text-blue-400';
    case 6:
      return 'text-content';
    case 7:
      return 'text-content-secondary';
    default:
      return 'text-content-secondary';
  }
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }) + '.' + String(date.getMilliseconds()).padStart(3, '0');
}

function formatTimeShort(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

type Tab = 'console' | 'messages';

export function DebugConsole() {
  const { logs, isExpanded, filter, toggleExpanded, clearLogs, setFilter } = useConsoleStore();
  const messages = useMessagesStore((s) => s.messages);
  const clearMessages = useMessagesStore((s) => s.clear);
  const protocol = useConnectionStore((s) => s.connectionState.protocol);
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('console');
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  const isMavlink = protocol === 'mavlink';

  const toggleExpand = (key: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current && isExpanded && activeTab === 'console') {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded, activeTab]);

  // Auto-scroll messages to top when new messages arrive (they're prepended)
  useEffect(() => {
    if (messagesScrollRef.current && isExpanded && activeTab === 'messages') {
      messagesScrollRef.current.scrollTop = 0;
    }
  }, [messages.length, isExpanded, activeTab]);

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
    <div className="border-t border-subtle bg-surface-overlay backdrop-blur-sm flex flex-col">
      {/* Collapsed bar - always visible */}
      <button
        onClick={toggleExpanded}
        className="h-8 px-4 flex items-center gap-3 hover:bg-surface transition-colors cursor-pointer w-full text-left"
      >
        {/* Expand/collapse icon */}
        <svg
          className={`w-3.5 h-3.5 text-content-secondary transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>

        <span className="text-xs font-medium text-content-secondary uppercase tracking-wide">Console</span>

        {/* Last log preview when collapsed */}
        {!isExpanded && lastLog && (
          <span className={`text-xs truncate flex-1 ${LOG_COLORS[lastLog.level]}`}>
            <span className="text-content-tertiary mr-2">{formatTime(lastLog.timestamp)}</span>
            {lastLog.message}
          </span>
        )}

        {/* Log count badge */}
        <span className="text-xs text-content-tertiary">
          {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
        </span>

        {/* Messages count badge - show when connected via MAVLink and have messages */}
        {isMavlink && messages.length > 0 && (
          <span className="text-xs text-yellow-500/70">
            {messages.length} msg{messages.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="flex flex-col" style={{ height: '35vh' }}>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-subtle bg-surface-overlay-subtle">
            {/* Tab buttons */}
            <div className="flex gap-1 mr-2">
              <button
                onClick={() => setActiveTab('console')}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${
                  activeTab === 'console'
                    ? 'bg-surface-raised text-content'
                    : 'text-content-secondary hover:text-content hover:bg-surface'
                }`}
              >
                Console
              </button>
              {isMavlink && (
                <button
                  onClick={() => setActiveTab('messages')}
                  className={`px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
                    activeTab === 'messages'
                      ? 'bg-surface-raised text-content'
                      : 'text-content-secondary hover:text-content hover:bg-surface'
                  }`}
                >
                  Messages
                  {messages.length > 0 && (
                    <span className="text-[9px] bg-yellow-500/20 text-yellow-400 px-1 rounded-full">
                      {messages.length}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* Separator */}
            {activeTab === 'console' && (
              <div className="w-px h-4 bg-surface-raised" />
            )}

            {/* Console filter buttons - only show on console tab */}
            {activeTab === 'console' && (
              <div className="flex gap-1">
                {(['all', 'info', 'error', 'packet'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-2 py-0.5 text-xs rounded transition-colors ${
                      filter === f
                        ? 'bg-surface-raised text-content'
                        : 'text-content-secondary hover:text-content hover:bg-surface'
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1" />

            {/* Clear button */}
            <button
              onClick={activeTab === 'console' ? clearLogs : clearMessages}
              className="px-2 py-0.5 text-xs text-content-secondary hover:text-content hover:bg-surface-raised rounded transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Console tab content */}
          {activeTab === 'console' && (
            <div ref={scrollRef} className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5">
              {filteredLogs.length === 0 ? (
                <div className="text-content-tertiary text-center py-4">No log entries</div>
              ) : (
                filteredLogs.map((log) => (
                  <div key={log.id} className="flex gap-2 hover:bg-surface px-1 py-0.5 rounded">
                    {/* Time */}
                    <span className="text-content-tertiary shrink-0">{formatTime(log.timestamp)}</span>

                    {/* Level icon */}
                    <span className={`shrink-0 w-4 text-center ${LOG_COLORS[log.level]}`}>
                      {LOG_ICONS[log.level]}
                    </span>

                    {/* Message */}
                    <span className={LOG_COLORS[log.level]}>{log.message}</span>

                    {/* Details */}
                    {log.details && (
                      <span className="text-content-tertiary">{log.details}</span>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Messages tab content */}
          {activeTab === 'messages' && (
            <div ref={messagesScrollRef} className="flex-1 overflow-y-auto font-mono text-xs">
              {messages.length === 0 ? (
                <div className="text-content-tertiary text-center py-4">No messages from autopilot</div>
              ) : (
                <div className="divide-y divide-subtle">
                  {messages.map((msg, i) => {
                    const msgKey = `${msg.text}-${msg.severity}-${i}`;
                    const prearmMatch = matchPreArmError(msg.text, firmware);
                    const isExpanded = expandedMessages.has(msgKey);

                    return (
                      <div key={msgKey}>
                        <div
                          className={`flex items-start gap-2 px-3 py-1.5 hover:bg-surface transition-colors ${prearmMatch ? 'cursor-pointer' : ''}`}
                          onClick={prearmMatch ? () => toggleExpand(msgKey) : undefined}
                        >
                          {/* Severity badge */}
                          <span className={`shrink-0 text-[9px] font-bold px-1 py-0.5 rounded mt-0.5 ${
                            msg.severity <= 3 ? 'bg-red-500/20 text-red-400'
                              : msg.severity === 4 ? 'bg-yellow-500/20 text-yellow-400'
                              : msg.severity === 5 ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-content-secondary/20 text-content-secondary'
                          }`}>
                            {msg.severityLabel.slice(0, 4)}
                          </span>

                          {/* Message text */}
                          <span className={`flex-1 leading-relaxed ${severityColor(msg.severity)}`}>
                            {msg.text}
                          </span>

                          {/* Count badge */}
                          {msg.count > 1 && (
                            <span className="shrink-0 text-[9px] bg-surface-raised text-content-secondary px-1.5 py-0.5 rounded-full mt-0.5">
                              x{msg.count}
                            </span>
                          )}

                          {/* Expand indicator for pre-arm messages */}
                          {prearmMatch && (
                            <span className="shrink-0 text-[10px] text-blue-400 mt-0.5">
                              {isExpanded ? '▾' : 'Fix ›'}
                            </span>
                          )}

                          {/* Timestamp */}
                          <span className="shrink-0 text-[10px] text-content-tertiary mt-0.5">
                            {formatTimeShort(msg.timestamp)}
                          </span>
                        </div>

                        {/* Expandable fix section */}
                        {prearmMatch && isExpanded && (
                          <PreArmParamFix
                            paramIds={prearmMatch.pattern.fix.params}
                            hint={prearmMatch.pattern.fix.hint}
                            action={prearmMatch.pattern.fix.action}
                            navigateTo={prearmMatch.pattern.fix.navigateTo}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
