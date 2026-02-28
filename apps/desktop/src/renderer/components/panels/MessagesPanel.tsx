import { useEffect, useRef } from 'react';
import { useMessagesStore } from '../../stores/messages-store';
import { PanelContainer } from './panel-utils';

/** Severity → Tailwind color class */
function severityColor(severity: number): string {
  switch (severity) {
    case 0: // EMERGENCY
    case 1: // ALERT
    case 2: // CRITICAL
      return 'text-red-400';
    case 3: // ERROR
      return 'text-red-400';
    case 4: // WARNING
      return 'text-yellow-400';
    case 5: // NOTICE
      return 'text-blue-400';
    case 6: // INFO
      return 'text-gray-300';
    case 7: // DEBUG
      return 'text-gray-500';
    default:
      return 'text-gray-400';
  }
}

/** Severity → left border color */
function severityBorder(severity: number): string {
  switch (severity) {
    case 0:
    case 1:
    case 2:
    case 3:
      return 'border-l-red-500';
    case 4:
      return 'border-l-yellow-500';
    case 5:
      return 'border-l-blue-500';
    case 6:
      return 'border-l-gray-500';
    case 7:
      return 'border-l-gray-600';
    default:
      return 'border-l-gray-600';
  }
}

/** Severity badge bg color */
function severityBadgeBg(severity: number): string {
  switch (severity) {
    case 0:
    case 1:
    case 2:
    case 3:
      return 'bg-red-500/20 text-red-400';
    case 4:
      return 'bg-yellow-500/20 text-yellow-400';
    case 5:
      return 'bg-blue-500/20 text-blue-400';
    case 6:
      return 'bg-gray-500/20 text-gray-400';
    case 7:
      return 'bg-gray-600/20 text-gray-500';
    default:
      return 'bg-gray-600/20 text-gray-500';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-GB', { hour12: false });
}

export function MessagesPanel() {
  const messages = useMessagesStore((s) => s.messages);
  const clear = useMessagesStore((s) => s.clear);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new messages arrive (they're prepended)
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [messages.length]);

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/40 shrink-0">
        <span className="text-xs text-gray-400 font-medium">
          {messages.length > 0 ? `${messages.length} message${messages.length !== 1 ? 's' : ''}` : 'No messages'}
        </span>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5 rounded hover:bg-gray-700/30"
          >
            Clear
          </button>
        )}
      </div>

      {/* Message list */}
      <div ref={listRef} className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            Waiting for messages...
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {messages.map((msg, i) => (
              <div
                key={`${msg.text}-${msg.severity}-${i}`}
                className={`flex items-start gap-2 px-3 py-1.5 border-l-2 ${severityBorder(msg.severity)} hover:bg-gray-800/30 transition-colors`}
              >
                {/* Severity badge */}
                <span className={`shrink-0 text-[9px] font-mono font-bold px-1 py-0.5 rounded ${severityBadgeBg(msg.severity)} mt-0.5`}>
                  {msg.severityLabel.slice(0, 4)}
                </span>

                {/* Message text */}
                <span className={`flex-1 text-xs font-mono leading-relaxed ${severityColor(msg.severity)}`}>
                  {msg.text}
                </span>

                {/* Count badge (for repeated messages) */}
                {msg.count > 1 && (
                  <span className="shrink-0 text-[9px] font-mono bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded-full mt-0.5">
                    x{msg.count}
                  </span>
                )}

                {/* Timestamp */}
                <span className="shrink-0 text-[10px] font-mono text-gray-600 mt-0.5">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
