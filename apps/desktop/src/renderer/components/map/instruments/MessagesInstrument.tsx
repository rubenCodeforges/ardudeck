import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { useMessagesStore } from '../../../stores/messages-store';
import { GAUGE_COLORS } from './RoundGauge';
import { gaugeTint } from './ReadoutPrimitives';
import { useInDock } from './dock-context';

export type MessagesVariant = 'list' | 'latest';

const SHOWN = 4;
/** Older than this, a message is history: drawn dimmer so the live ones stand out. */
const FRESH_S = 60;

function severityColour(severity: number): string {
  if (severity <= 3) return GAUGE_COLORS.red;
  if (severity === 4) return GAUGE_COLORS.amber;
  if (severity === 5) return GAUGE_COLORS.text;
  return GAUGE_COLORS.textDim;
}

function age(t: (k: string, o?: Record<string, unknown>) => string, s: number): string {
  if (s < 5) return t('map:messagesInstrument.now');
  if (s < 60) return t('map:messagesInstrument.seconds', { n: Math.floor(s) });
  if (s < 3600) return t('map:messagesInstrument.minutes', { n: Math.floor(s / 60) });
  return t('map:messagesInstrument.hours', { n: Math.floor(s / 3600) });
}

/** The vehicle's latest STATUSTEXT lines on the map: newest first and largest, readable at a glance. */
export function MessagesInstrument({ variant = 'list' }: { variant?: MessagesVariant } = {}): JSX.Element {
  const { t } = useTranslation();
  const inDock = useInDock();
  const messages = useMessagesStore((s) => s.messages);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const recent = messages.slice(0, variant === 'latest' ? 1 : SHOWN);

  return (
    <div
      className={`select-none px-3 pt-2 pb-2.5 ${inDock ? '' : 'rounded-lg shadow-xl'}`}
      style={{ ...(inDock ? {} : { background: GAUGE_COLORS.face, border: `1.5px solid ${GAUGE_COLORS.bezelEdge}` }), width: variant === 'latest' ? 360 : 320 }}
    >
      {variant === 'list' && (
        <div className="mb-1.5 text-[9px] font-semibold tracking-[0.14em] leading-none" style={{ color: GAUGE_COLORS.textDim }}>
          {t('map:messagesInstrument.title')}
        </div>
      )}
      {recent.length === 0 ? (
        <div className="text-[12px] leading-snug" style={{ color: GAUGE_COLORS.tickMinor }}>{t('map:messagesInstrument.none')}</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {recent.map((m, i) => {
            const colour = severityColour(m.severity);
            const ageS = (now - m.timestamp) / 1000;
            const stale = ageS > FRESH_S;
            return (
              <div
                key={`${m.severity}:${m.text}`}
                className="flex gap-2 rounded-md py-1 pl-2 pr-1.5"
                style={{ borderLeft: `3px solid ${colour}`, background: i === 0 && !stale ? gaugeTint(colour, 10) : 'transparent', opacity: stale ? 0.6 : 1 }}
              >
                <span
                  className={`min-w-0 flex-1 [overflow-wrap:anywhere] ${i === 0 ? 'text-[13px] font-semibold' : 'text-[12px]'} leading-snug ${variant === 'latest' ? 'line-clamp-2' : 'line-clamp-3'}`}
                  style={{ color: m.severity <= 4 ? colour : GAUGE_COLORS.text }}
                  title={m.text}
                >
                  {m.text}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5 pt-0.5">
                  <span className="font-mono text-[9.5px] leading-none tabular-nums" style={{ color: GAUGE_COLORS.textDim }}>{age(t, ageS)}</span>
                  {m.count > 1 && (
                    <span className="rounded-full px-1.5 py-[2px] font-mono text-[9px] leading-none tabular-nums" style={{ color: GAUGE_COLORS.text, background: GAUGE_COLORS.bezel }}>
                      ×{m.count}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
