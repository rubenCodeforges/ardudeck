/**
 * FleetForensicsPanel — the cross-vehicle roll-up of the per-flight log analysis.
 *
 * Built from compact flight summaries persisted every time a log is opened (no
 * re-parsing). Shows, per vehicle: maintenance flags derived from health trends,
 * a health-status timeline, and simple trend bars for vibration and battery sag.
 * The single-flight analyzer is untouched; this is the fleet view on top of it.
 */
import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldCheck, Trash2, Plane, RefreshCw } from 'lucide-react';
import type { VehicleFlightHistory, FlightSummary, FlightHealthStatus } from '../../../shared/fleet-log-types';
import { deriveMaintenanceFlags } from '../../../shared/fleet-log-maintenance';
import { FleetLogRetrieval } from './FleetLogRetrieval';
import { useTranslation } from 'react-i18next';

const STATUS_DOT: Record<FlightHealthStatus, string> = {
  pass: 'bg-emerald-500',
  warn: 'bg-amber-500',
  fail: 'bg-red-500',
  skip: 'bg-content-tertiary/40',
  info: 'bg-blue-500',
};

function worstStatus(f: FlightSummary): FlightHealthStatus {
  if (f.health.some((h) => h.status === 'fail')) return 'fail';
  if (f.health.some((h) => h.status === 'warn')) return 'warn';
  if (f.health.some((h) => h.status === 'pass')) return 'pass';
  return 'info';
}

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { year: '2-digit', month: 'short', day: 'numeric' });
}

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** A tiny inline bar chart for a numeric metric across flights (oldest left). */
function TrendBars({ values, unit, color }: { values: number[]; unit: string; color: string }) {
  const { t } = useTranslation();
  const max = Math.max(1, ...values);
  if (values.length === 0) return <span className="text-[10px] text-content-tertiary">{t('logs:fleet.noData')}</span>;
  return (
    <div className="flex items-end gap-0.5 h-8" title={t('logs:fleet.perFlight', { unit })}>
      {values.map((v, i) => (
        <div
          key={i}
          className={`w-1.5 rounded-sm ${color}`}
          style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
          title={`${v} ${unit}`}
        />
      ))}
    </div>
  );
}

export function FleetForensicsPanel() {
  const { t } = useTranslation();
  const [history, setHistory] = useState<VehicleFlightHistory[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Clearing wipes accumulated trend history, so the trash button is armed on
  // first click and only clears on a second click within the timeout.
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    const h = (await window.electronAPI?.fleetLogHistoryGet?.()) ?? [];
    setHistory(h);
    setSelectedKey((prev) => prev ?? h[0]?.vehicleKey ?? null);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const selected = useMemo(
    () => history.find((v) => v.vehicleKey === selectedKey) ?? null,
    [history, selectedKey],
  );
  const flags = useMemo(() => (selected ? deriveMaintenanceFlags(selected) : []), [selected]);

  const clearAll = async (): Promise<void> => {
    await window.electronAPI?.fleetLogHistoryClear?.();
    setSelectedKey(null);
    void refresh();
  };

  if (loading) {
    return <div className="p-6 text-sm text-content-secondary">{t('logs:fleet.loading')}</div>;
  }

  if (history.length === 0) {
    return (
      <div className="h-full overflow-y-auto p-4">
        <FleetLogRetrieval onIngested={refresh} />
        <div className="p-8 text-center max-w-md mx-auto">
          <Plane className="w-8 h-8 text-content-tertiary mx-auto mb-3" />
          <h3 className="text-sm font-medium text-content mb-1">{t('logs:fleet.empty')}</h3>
          <p className="text-xs text-content-secondary">
            {t('logs:fleet.emptyHint')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pt-4">
        <FleetLogRetrieval onIngested={refresh} />
      </div>
      <div className="flex flex-1 min-h-0">
      {/* Vehicle list */}
      <div className="w-64 border-r border-subtle overflow-y-auto shrink-0">
        <div className="flex items-center justify-between px-3 py-2 border-b border-subtle">
          <span className="text-xs font-medium text-content-secondary">{t('logs:fleet.vehicles', { n: history.length })}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => void refresh()} className="text-content-tertiary hover:text-content p-1" title={t('common:refresh')}>
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => {
                if (confirmClear) {
                  setConfirmClear(false);
                  void clearAll();
                } else {
                  setConfirmClear(true);
                }
              }}
              className={confirmClear
                ? 'flex items-center gap-1 px-1.5 py-1 rounded bg-red-500/15 text-red-400 text-[11px] font-medium'
                : 'text-content-tertiary hover:text-red-400 p-1'}
              title={confirmClear ? t('logs:fleet.clearConfirmTip') : t('logs:fleet.clearTip')}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {confirmClear && <span>{t('logs:fleet.clearAll')}</span>}
            </button>
          </div>
        </div>
        {history.map((v) => {
          const f = deriveMaintenanceFlags(v);
          const sev = f.some((x) => x.severity === 'fail') ? 'fail' : f.some((x) => x.severity === 'warn') ? 'warn' : null;
          return (
            <button
              key={v.vehicleKey}
              onClick={() => setSelectedKey(v.vehicleKey)}
              className={`w-full text-left px-3 py-2.5 border-b border-subtle/50 transition-colors ${
                selectedKey === v.vehicleKey ? 'bg-blue-500/10' : 'hover:bg-surface'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-content font-medium truncate flex-1">{v.vehicleLabel}</span>
                {sev && <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${sev === 'fail' ? 'text-red-400' : 'text-amber-400'}`} />}
              </div>
              <div className="text-[11px] text-content-tertiary mt-0.5">
                {t('logs:fleet.flightsLast', { count: v.flights.length, date: fmtDate(v.flights[0]!.startedAt) })}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selected && (
          <>
            <div>
              <h2 className="text-base font-semibold text-content">{selected.vehicleLabel}</h2>
              <p className="text-xs text-content-secondary">
                {t('logs:fleet.flightsSummary', { count: selected.flights.length, board: selected.flights[0]!.boardType, firmware: selected.flights[0]!.firmwareVersion || t('logs:fleet.unknownFirmware') })}
              </p>
            </div>

            {/* Maintenance flags */}
            {flags.length > 0 ? (
              <div className="space-y-2">
                {flags.map((f, i) => (
                  <div
                    key={i}
                    className={`rounded-lg border px-3 py-2 ${
                      f.severity === 'fail' ? 'border-red-500/30 bg-red-500/5' : 'border-amber-500/30 bg-amber-500/5'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`w-4 h-4 ${f.severity === 'fail' ? 'text-red-400' : 'text-amber-400'}`} />
                      <span className="text-sm font-medium text-content">{f.title}</span>
                    </div>
                    <p className="text-xs text-content-secondary mt-1 ml-6">{f.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-sm text-content">{t('logs:fleet.noConcerns')}</span>
              </div>
            )}

            {/* Trends */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-subtle bg-surface p-3">
                <div className="text-xs text-content-secondary mb-2">{t('logs:fleet.peakVibe')}</div>
                <TrendBars
                  values={[...selected.flights].reverse().map((f) => f.maxVibe)}
                  unit="m/s²"
                  color="bg-amber-500/70"
                />
              </div>
              <div className="rounded-lg border border-subtle bg-surface p-3">
                <div className="text-xs text-content-secondary mb-2">{t('logs:fleet.minPackV')}</div>
                <TrendBars
                  values={[...selected.flights].reverse().filter((f) => f.minBatteryV > 0).map((f) => f.minBatteryV)}
                  unit="V"
                  color="bg-sky-500/70"
                />
              </div>
            </div>

            {/* Flight table */}
            <div className="rounded-lg border border-subtle overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-surface text-content-tertiary uppercase tracking-wide text-[10px]">
                    <th className="text-left px-3 py-2">{t('logs:fleet.colDate')}</th>
                    <th className="text-left px-3 py-2">{t('common:file')}</th>
                    <th className="text-right px-3 py-2">{t('common:duration')}</th>
                    <th className="text-right px-3 py-2">{t('logs:fleet.colMaxAlt')}</th>
                    <th className="text-right px-3 py-2">{t('logs:fleet.colDist')}</th>
                    <th className="text-right px-3 py-2">mAh</th>
                    <th className="text-center px-3 py-2">{t('common:health')}</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.flights.map((f) => (
                    <tr key={f.flightId} className="border-t border-subtle/50">
                      <td className="px-3 py-2 text-content-secondary">{fmtDate(f.startedAt)}</td>
                      <td className="px-3 py-2 text-content truncate max-w-[160px]" title={f.path}>{f.fileName}</td>
                      <td className="px-3 py-2 text-right text-content-secondary tabular-nums">{fmtDuration(f.durationSec)}</td>
                      <td className="px-3 py-2 text-right text-content-secondary tabular-nums">{Math.round(f.maxAltM)}m</td>
                      <td className="px-3 py-2 text-right text-content-secondary tabular-nums">{(f.distanceM / 1000).toFixed(1)}km</td>
                      <td className="px-3 py-2 text-right text-content-secondary tabular-nums">{f.batteryMah || '-'}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1" title={f.health.map((h) => `${h.name}: ${h.status}`).join('\n')}>
                          <span className={`w-2 h-2 rounded-full ${STATUS_DOT[worstStatus(f)]}`} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-content-tertiary">
              {t('logs:fleet.disclaimer')}
            </p>
          </>
        )}
      </div>
      </div>
    </div>
  );
}
