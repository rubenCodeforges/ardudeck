import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Shown over the synthetic fallback so the pilot knows why the view changed, and for how long. */
export function VideoLinkBanner({ lostAt, compact = false }: { lostAt: number | null; compact?: boolean }) {
  const { t } = useTranslation();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (lostAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [lostAt]);

  const secs = lostAt === null ? 0 : Math.max(0, Math.floor((now - lostAt) / 1000));
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
      <div
        className={`rounded border border-amber-500/60 bg-black/70 font-semibold tracking-wide text-amber-300 ${
          compact ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs'
        }`}
      >
        {lostAt === null ? t('camera:banner.noVideo') : t('camera:banner.linkLost', { clock })}
      </div>
    </div>
  );
}
