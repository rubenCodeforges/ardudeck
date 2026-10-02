import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { useMessagesStore } from '../../stores/messages-store';
import { useConnectionStore } from '../../stores/connection-store';
import { matchPreArmError } from '../../../shared/prearm-checks';
import { PreArmParamFix } from '../prearm/PreArmParamFix';
import { PanelContainer } from './panel-utils';
import { MessageRowBody, formatTime, severityBorder } from '../messages/MessageRow';

export function MessagesPanel() {
  const { t } = useTranslation();
  const messages = useMessagesStore((s) => s.messages);
  const clear = useMessagesStore((s) => s.clear);
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const listRef = useRef<HTMLDivElement>(null);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());

  const toggleExpand = (key: string) => {
    setExpandedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Auto-scroll to top when new messages arrive (they're prepended)
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [messages.length]);

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-subtle shrink-0">
        <span className="text-xs text-content-secondary font-medium">
          {messages.length > 0 ? t('panels:messagesPanel.count', { count: messages.length }) : t('panels:messagesPanel.none')}
        </span>
        {messages.length > 0 && (
          <button
            onClick={clear}
            className="text-[10px] text-content-secondary hover:text-content transition-colors px-1.5 py-0.5 rounded hover:bg-surface-raised"
          >
            {t('common:clear')}
          </button>
        )}
      </div>

      {/* Message list */}
      <div ref={listRef} className="flex-1 overflow-auto">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-content-tertiary text-xs">
            {t('panels:messagesPanel.waiting')}
          </div>
        ) : (
          <div className="divide-y divide-subtle">
            {messages.map((msg, i) => {
              const msgKey = `${msg.text}-${msg.severity}-${i}`;
              const prearmMatch = matchPreArmError(msg.text, firmware);
              const isExpanded = expandedMessages.has(msgKey);

              return (
                <div key={msgKey}>
                  <div
                    className={`flex items-start gap-2 px-3 py-1.5 border-l-2 ${severityBorder(msg.severity)} hover:bg-surface transition-colors ${prearmMatch ? 'cursor-pointer' : ''}`}
                    onClick={prearmMatch ? () => toggleExpand(msgKey) : undefined}
                  >
                    <MessageRowBody msg={msg} />
                    {/* Expand indicator for pre-arm messages */}
                    {prearmMatch && (
                      <span className="shrink-0 text-[10px] text-blue-400 mt-0.5">
                        {isExpanded ? '▾' : t('panels:messagesPanel.fix')}
                      </span>
                    )}

                    {/* Timestamp */}
                    <span className="shrink-0 text-[10px] font-mono text-content-tertiary mt-0.5">
                      {formatTime(msg.timestamp)}
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
    </PanelContainer>
  );
}
