import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, X } from 'lucide-react';
import type { VehicleProfile } from '../../../stores/settings-store.js';
import { useConnectionStore } from '../../../stores/connection-store.js';
import { useParameterStore } from '../../../stores/parameter-store.js';
import { computeDrift } from '../../../lib/vehicle-templates/drift.js';

interface DriftBadgeProps {
  profile: VehicleProfile;
}

/**
 * When the live vehicle's param cache diverges from what the profile's template
 * would produce, show a yellow "Drifted — N" pill. Click to open a detail modal.
 */
export function DriftBadge({ profile }: DriftBadgeProps) {
  const { t } = useTranslation('settings');
  const isConnected = useConnectionStore(s => s.connectionState.isConnected);
  const isSitl = useConnectionStore(s => s.connectionState.isSitl ?? false);
  const parameters = useParameterStore(s => s.parameters);
  const paramsLoaded = useParameterStore(s => s.downloadState === 'complete');
  const [open, setOpen] = useState(false);

  const report = useMemo(() => {
    if (!isConnected || !paramsLoaded || parameters.size === 0) return { notApplied: true, diverged: [] };
    const map = new Map<string, { value: number; type: number }>();
    for (const [k, v] of parameters) map.set(k, { value: v.value, type: v.type });
    return computeDrift({
      profile,
      currentParams: map,
      includeSim: isSitl,
    });
  }, [profile, parameters, paramsLoaded, isConnected, isSitl]);

  if (report.notApplied) return null;
  if (report.diverged.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors animate-pulse"
      >
        <AlertTriangle className="w-3 h-3" />
        {t('vehicleProfile.drift.badge', { count: report.diverged.length })}
      </button>

      {open && (
        <div className="fixed inset-0 bg-surface-overlay flex items-center justify-center z-[75] p-4" onClick={() => setOpen(false)}>
          <div
            className="bg-surface-solid rounded-xl border border-subtle w-full max-w-lg max-h-[70vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-subtle">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-content">{t('vehicleProfile.drift.heading')}</h3>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-surface-overlay-subtle text-content-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {report.diverged.map(d => (
                <div key={d.name} className="flex items-center justify-between p-2 rounded-lg border border-subtle bg-surface-inset text-xs">
                  <div>
                    <div className="font-mono text-content">{d.name}</div>
                    <div className="text-[10px] text-content-secondary mt-0.5">{d.reason}</div>
                  </div>
                  <div className="text-right font-mono text-[11px]">
                    <div className="text-red-300">{d.currentValue}</div>
                    <div className="text-emerald-300">→ {d.expectedValue}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-subtle text-[11px] text-content-secondary">
              {t('vehicleProfile.drift.footer')}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
