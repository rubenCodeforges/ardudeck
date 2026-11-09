import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../../stores/settings-store';

type Level = 'all' | 'important' | 'off';

const SPEAKER = 'M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.7-.51-1.94-1.36a9.02 9.02 0 010-4.86c.24-.85 1.06-1.36 1.94-1.36h2.24z';
const WAVES: Record<Level, string> = {
  all: 'M19.11 5.11a9 9 0 010 13.78M16.46 7.76a5.25 5.25 0 010 8.48',
  important: 'M16.46 7.76a5.25 5.25 0 010 8.48',
  off: 'M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25',
};

function LevelIcon({ level, className }: { level: Level; className: string }): JSX.Element {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={`${WAVES[level]} ${SPEAKER}`} />
    </svg>
  );
}

/** Top-bar voice level, like car navigation: all callouts, only important ones, or silent. */
export function VoiceLevelMenu(): JSX.Element {
  const { t } = useTranslation();
  const level = useSettingsStore((s) => s.voiceAlertLevel);
  const setLevel = useSettingsStore((s) => s.setVoiceAlertLevel);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const options: Level[] = ['all', 'important', 'off'];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-tip={t(`layout:voiceLevel.${level}Tip`)}
        aria-label={t('layout:voiceLevel.title')}
        className={`flex items-center transition-colors ${level === 'off' ? 'text-content-tertiary hover:text-content-secondary' : 'text-content-secondary hover:text-content'}`}
      >
        <LevelIcon level={level} className="w-5 h-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-[60] w-64 bg-surface-solid border border-subtle rounded-lg shadow-xl py-1">
          {options.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { setLevel(o); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-surface-raised transition-colors flex items-start gap-2.5"
            >
              <LevelIcon level={o} className={`w-4 h-4 mt-0.5 shrink-0 ${o === level ? 'text-teal-400' : 'text-content-tertiary'}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-content">{t(`layout:voiceLevel.${o}`)}</span>
                <span className="block text-[10px] text-content-tertiary leading-snug">{t(`layout:voiceLevel.${o}Desc`)}</span>
              </span>
              {o === level && (
                <svg className="w-3.5 h-3.5 text-teal-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
