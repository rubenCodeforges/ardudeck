/**
 * ZoneAlertBanner — surfaces perimeter alert-zone intrusions over the map.
 *
 * A small DOM overlay (not a Leaflet layer) anchored top-centre. Active
 * intrusions (a contact currently inside a zone) are shown in red; recently
 * cleared ones linger dimmed in the log. Detect-and-alert only.
 */
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import { useTrafficStore } from '../../../stores/traffic-store';

export function ZoneAlertBanner() {
  const { t } = useTranslation();
  const alerts = useTrafficStore((s) => s.alerts);
  const dismiss = useTrafficStore((s) => s.dismissAlerts);

  if (alerts.length === 0) return null;

  const active = alerts.filter((a) => a.active);
  const top = alerts.slice(0, 4);

  return (
    <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
      <div className="pointer-events-auto rounded-lg border border-red-500/40 bg-surface-solid/95 shadow-2xl backdrop-blur px-3 py-2 min-w-[260px] max-w-[360px]">
        <div className="flex items-center gap-2 mb-1.5">
          <AlertTriangle className={`w-4 h-4 ${active.length > 0 ? 'text-red-400 animate-pulse' : 'text-amber-400'}`} />
          <span className="text-xs font-semibold text-content">
            {active.length > 0 ? t('map:zoneAlert.active', { count: active.length }) : t('map:zoneAlert.clear')}
          </span>
          <button onClick={dismiss} className="ml-auto text-content-tertiary hover:text-content" title={t('map:zoneAlert.clearLog')}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="space-y-1">
          {top.map((a) => (
            <div key={a.id} className={`flex items-center gap-2 text-[11px] ${a.active ? 'text-content' : 'text-content-tertiary'}`}>
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.active ? 'bg-red-500' : 'bg-content-tertiary'}`} />
              <span className="font-medium truncate">{a.label}</span>
              <span className="text-content-secondary shrink-0">{t('map:zoneAlert.in')}</span>
              <span className="truncate">{a.zoneName}</span>
              <span className="ml-auto shrink-0 uppercase text-[9px] tracking-wide text-content-tertiary">{a.source}</span>
            </div>
          ))}
        </div>
        <p className="mt-1.5 text-[9px] text-content-tertiary leading-tight">
          {t('map:zoneAlert.disclaimer')}
        </p>
      </div>
    </div>
  );
}
