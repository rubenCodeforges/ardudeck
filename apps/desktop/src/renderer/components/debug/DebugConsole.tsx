import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const { logs, isExpanded, filter, toggleExpanded, clearLogs, setFilter } = useConsoleStore();
  const dock = useConsoleStore((s) => s.dock);
  const size = useConsoleStore((s) => s.size);
  const setDock = useConsoleStore((s) => s.setDock);
  const setSize = useConsoleStore((s) => s.setSize);
  const side = dock !== 'bottom';
  const messages = useMessagesStore((s) => s.messages);
  const clearMessages = useMessagesStore((s) => s.clear);
  const protocol = useConnectionStore((s) => s.connectionState.protocol);
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<Tab>('console');
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  // Stick to the bottom only while the user is already there; the moment they
  // scroll up to read, hold position. A pinned=false state surfaces a
  // "jump to latest" affordance.
  const [pinned, setPinned] = useState(true);

  const isMavlink = protocol === 'mavlink';

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startPos = side ? e.clientX : e.clientY;
    const startSize = size;
    const move = (ev: PointerEvent) => {
      const delta = side ? ev.clientX - startPos : ev.clientY - startPos;
      // Dragging away from the docked edge grows the panel.
      setSize(startSize + (dock === 'left' ? delta : -delta));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const dockButton = (target: 'left' | 'bottom' | 'right', title: string, path: JSX.Element) => (
    <button
      onClick={() => setDock(target)}
      data-tip={title}
      className={`p-1 rounded transition-colors ${
        dock === target ? 'text-blue-400 bg-blue-500/15' : 'text-content-tertiary hover:text-content hover:bg-surface-raised'
      }`}
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4}>
        <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
        {path}
      </svg>
    </button>
  );

  const toggleExpand = (key: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Auto-scroll to bottom when new logs arrive - but only while pinned, so a
  // user reading scrollback is never yanked back down.
  useEffect(() => {
    if (scrollRef.current && isExpanded && activeTab === 'console' && pinned) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isExpanded, activeTab, pinned]);

  // Re-pin when the user scrolls back to (near) the bottom; unpin when they
  // scroll away.
  const onConsoleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setPinned(atBottom);
  };

  const jumpToLatest = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setPinned(true);
  };

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
    <div
      className={
        'bg-surface-overlay backdrop-blur-sm flex flex-col relative ' +
        (side
          ? `${dock === 'left' ? 'border-r' : 'border-l'} border-subtle h-full shrink-0`
          : 'border-t border-subtle')
      }
      style={side ? { width: isExpanded ? size : 40 } : undefined}
    >
      {/* Resize handle on the edge that faces the content. */}
      {isExpanded && (
        <div
          onPointerDown={startResize}
          className={
            'absolute z-10 touch-none ' +
            (side
              ? `top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-blue-500/40 ${dock === 'left' ? 'right-0' : 'left-0'}`
              : 'left-0 right-0 top-0 h-1.5 cursor-row-resize hover:bg-blue-500/40')
          }
        />
      )}
      {/* Collapsed bar - always visible */}
      <div
        className={
          'flex shrink-0 ' +
          (side && !isExpanded ? 'h-full w-10 flex-col items-center pt-2 gap-2' : 'h-8 items-center pr-1.5')
        }
      >
      <button
        onClick={toggleExpanded}
        className={
          'flex items-center gap-3 hover:bg-surface transition-colors cursor-pointer text-left min-w-0 ' +
          (side && !isExpanded ? 'flex-col justify-start gap-2 flex-1 w-full' : 'h-8 px-3 flex-1')
        }
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

        <span
          className="text-xs font-medium text-content-secondary uppercase tracking-wide"
          style={side && !isExpanded ? { writingMode: 'vertical-rl' } : undefined}
        >{t('debug:debugConsole.console')}</span>

        {/* Last log preview when collapsed */}
        {!isExpanded && !side && lastLog && (
          <span className={`text-xs truncate flex-1 ${LOG_COLORS[lastLog.level]}`}>
            <span className="text-content-tertiary mr-2">{formatTime(lastLog.timestamp)}</span>
            {lastLog.message}
          </span>
        )}

        {/* Log count badge */}
        <span className={`text-xs text-content-tertiary ${side && !isExpanded ? 'hidden' : ''}`}>
          {t('debug:debugConsole.entries', { count: logs.length })}
        </span>

        {/* Messages count badge - show when connected via MAVLink and have messages */}
        {isMavlink && messages.length > 0 && !(side && !isExpanded) && (
          <span className="text-xs text-yellow-500/70">
            {t('debug:debugConsole.msgs', { count: messages.length })}
          </span>
        )}
      </button>

        {/* Dock side: on the header so it is reachable collapsed too. */}
        <div className={`flex items-center gap-0.5 ${side && !isExpanded ? 'flex-col pb-2' : ''}`}>
          {dockButton('left', t('debug:debugConsole.dockLeft'), <rect x="1.5" y="2.5" width="5" height="11" rx="1.5" fill="currentColor" opacity="0.5" />)}
          {dockButton('bottom', t('debug:debugConsole.dockBottom'), <rect x="1.5" y="9" width="13" height="4.5" rx="1.5" fill="currentColor" opacity="0.5" />)}
          {dockButton('right', t('debug:debugConsole.dockRight'), <rect x="9.5" y="2.5" width="5" height="11" rx="1.5" fill="currentColor" opacity="0.5" />)}
        </div>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="relative flex flex-col min-h-0" style={side ? { flex: 1 } : { height: size }}>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 border-b border-subtle bg-surface-overlay-subtle">
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
                {t('debug:debugConsole.console')}
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
                  {t('common:messages')}
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
                    {t(`debug:debugConsole.filter.${f}`)}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 min-w-0" />

            {/* Clear button */}
            <button
              onClick={activeTab === 'console' ? clearLogs : clearMessages}
              className="px-2 py-0.5 text-xs text-content-secondary hover:text-content hover:bg-surface-raised rounded transition-colors"
            >
              {t('common:clear')}
            </button>

          </div>

          {/* Console tab content */}
          {activeTab === 'console' && (
            <div ref={scrollRef} onScroll={onConsoleScroll} className="relative flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5">
              {filteredLogs.length === 0 ? (
                <div className="text-content-tertiary text-center py-4">{t('debug:debugConsole.noLogEntries')}</div>
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
          {activeTab === 'console' && !pinned && (
            <button
              onClick={jumpToLatest}
              className="absolute bottom-3 right-4 z-10 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white shadow-lg hover:bg-blue-500"
            >
              {t('debug:debugConsole.jumpToLatest')}
            </button>
          )}

          {/* Messages tab content */}
          {activeTab === 'messages' && (
            <div ref={messagesScrollRef} className="flex-1 overflow-y-auto font-mono text-xs">
              {messages.length === 0 ? (
                <div className="text-content-tertiary text-center py-4">{t('debug:debugConsole.noMessages')}</div>
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
                              {isExpanded ? '▾' : t('debug:debugConsole.fix')}
                            </span>
                          )}

                          {/* Timestamp */}
                          <span className="shrink-0 text-[10px] text-content-tertiary mt-0.5">
                            {formatTimeShort(msg.timestamp)}
                          </span>
                        </div>

                        {/* Expandable fix section */}
                        {prearmMatch && isExpanded && (
                          <PreArmParamFix fix={prearmMatch.pattern.fix} />
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
