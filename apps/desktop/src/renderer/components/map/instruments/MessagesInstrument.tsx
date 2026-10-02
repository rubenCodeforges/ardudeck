import { useTranslation } from 'react-i18next';
import { useMessagesStore } from '../../../stores/messages-store';
import { MessageRowBody, formatTime, severityBorder } from '../../messages/MessageRow';
import { InstrumentStrip } from './InstrumentStrip';
import { GAUGE_COLORS } from './RoundGauge';

const SHOWN = 3;

/** The vehicle's latest STATUSTEXT lines on the map, drawn like the Messages panel. */
export function MessagesInstrument(): JSX.Element {
  const { t } = useTranslation();
  const messages = useMessagesStore((s) => s.messages);
  const recent = messages.slice(0, SHOWN);

  return (
    <InstrumentStrip label={t('map:messagesInstrument.title')} tall>
      {recent.length === 0 ? (
        <span className="text-[11px] leading-none" style={{ color: GAUGE_COLORS.tickMinor }}>
          {t('map:messagesInstrument.none')}
        </span>
      ) : (
        <div className="w-full divide-y divide-subtle">
          {recent.map((m) => (
            <div key={`${m.severity}:${m.text}`} className={`flex items-start gap-1.5 border-l-2 py-1 pl-1.5 ${severityBorder(m.severity)}`}>
              <MessageRowBody msg={m} clampLines={2} />
              <span className="shrink-0 mt-0.5 text-[10px] font-mono text-content-tertiary">{formatTime(m.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </InstrumentStrip>
  );
}
