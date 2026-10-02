/**
 * FleetLogRetrieval — pull dataflash logs off connected fleet vehicles via the
 * orchestrator. The desktop never blocks: it asks the orchestrator to run the
 * (slow, link-dependent) fetch job and streams progress + the finished .bin back,
 * which is parsed and folded into the fleet history. Detect-and-record only.
 */
import { useEffect, useState, useCallback } from 'react';
import { Download, RadioTower, Loader2, Check, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useTranslation } from 'react-i18next';

interface LogEntry { id: number; sizeBytes: number; timeUtc: number }
interface JobState { state: string; received: number; total: number; message?: string }

interface VehicleLogs {
  listing: boolean;
  entries: LogEntry[] | null;
  jobs: Record<number, JobState>; // by logId
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export function FleetLogRetrieval({ onIngested }: { onIngested: () => void }) {
  const { t } = useTranslation();
  const knownVehicles = useActiveVehicleStore((s) => s.knownVehicles);
  const vehicles = Object.values(knownVehicles);

  const [open, setOpen] = useState(false);
  // Per virtual sysid. Job/list events carry virtualSysid so they route directly.
  const [state, setState] = useState<Record<number, VehicleLogs>>({});

  const patchVehicle = useCallback((sysid: number, patch: Partial<VehicleLogs>) => {
    setState((s) => ({ ...s, [sysid]: { listing: false, entries: null, jobs: {}, ...s[sysid], ...patch } }));
  }, []);

  useEffect(() => {
    const off = window.electronAPI?.onFleetLogJobEvent?.((msg) => {
      const type = String(msg.type ?? '');
      if (type === 'log.list') {
        const sysid = Number(msg.virtualSysid);
        patchVehicle(sysid, { listing: false, entries: (msg.entries as LogEntry[]) ?? [] });
      } else if (type === 'log.job') {
        const sysid = Number(msg.virtualSysid);
        const logId = Number(msg.logId);
        setState((s) => {
          const v = s[sysid] ?? { listing: false, entries: null, jobs: {} };
          return {
            ...s,
            [sysid]: {
              ...v,
              jobs: { ...v.jobs, [logId]: {
                state: String(msg.state ?? ''),
                received: Number(msg.received ?? 0),
                total: Number(msg.total ?? 0),
                message: msg.message ? String(msg.message) : undefined,
              } },
            },
          };
        });
      } else if (type === 'log.job.ready') {
        const sysid = Number(msg.virtualSysid);
        const logId = Number(msg.logId);
        setState((s) => {
          const v = s[sysid];
          if (!v) return s;
          return { ...s, [sysid]: { ...v, jobs: { ...v.jobs, [logId]: { state: 'transferring', received: Number(msg.size ?? 0), total: Number(msg.size ?? 0) } } } };
        });
      } else if (type === 'log.ingested') {
        onIngested();
      }
    });
    return off;
  }, [patchVehicle, onIngested]);

  const requestList = async (sysid: number) => {
    patchVehicle(sysid, { listing: true, entries: null });
    const res = await window.electronAPI?.fleetLogListRequest?.(sysid);
    if (!res?.ok) patchVehicle(sysid, { listing: false });
  };

  const fetchLog = async (sysid: number, logId: number) => {
    patchVehicle(sysid, {}); // ensure entry exists
    setState((s) => {
      const v = s[sysid] ?? { listing: false, entries: null, jobs: {} };
      return { ...s, [sysid]: { ...v, jobs: { ...v.jobs, [logId]: { state: 'fetching', received: 0, total: 0 } } } };
    });
    await window.electronAPI?.fleetLogFetch?.(sysid, logId);
  };

  if (vehicles.length === 0) return null;

  return (
    <div className="rounded-lg border border-subtle bg-surface mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
      >
        {open ? <ChevronDown className="w-4 h-4 text-content-secondary" /> : <ChevronRight className="w-4 h-4 text-content-secondary" />}
        <RadioTower className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-content">{t('logs:fleetPull.title')}</span>
        <span className="text-[11px] text-content-tertiary">{t('logs:fleetPull.connected', { n: vehicles.length })}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-[11px] text-content-secondary">
            {t('logs:fleetPull.hint')}
          </p>
          {vehicles.map((v) => {
            const vs = state[v.sysid];
            return (
              <div key={v.key} className="rounded-md border border-subtle/60 p-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-content font-medium flex-1 truncate">{t('logs:fleetPull.sys', { id: v.sysid })}</span>
                  <button
                    onClick={() => void requestList(v.sysid)}
                    disabled={vs?.listing}
                    className="px-2 py-1 text-[11px] bg-surface-input hover:bg-surface-raised border border-subtle rounded-md text-content transition-colors disabled:opacity-50"
                  >
                    {vs?.listing ? <Loader2 className="w-3 h-3 animate-spin inline" /> : t('logs:fleetPull.listLogs')}
                  </button>
                </div>
                {vs?.entries && vs.entries.length === 0 && (
                  <p className="text-[11px] text-content-tertiary mt-1.5">{t('logs:fleetPull.noLogs')}</p>
                )}
                {vs?.entries && vs.entries.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {vs.entries.map((e) => {
                      const job = vs.jobs[e.id];
                      const pct = job && job.total > 0 ? Math.round((job.received / job.total) * 100) : 0;
                      const busy = job && (job.state === 'fetching' || job.state === 'transferring');
                      const done = job && job.state === 'transferring' && pct >= 100;
                      const failed = job && job.state === 'failed';
                      return (
                        <div key={e.id} className="flex items-center gap-2 text-[11px]">
                          <span className="font-mono text-content-tertiary w-10">#{e.id}</span>
                          <span className="text-content-secondary w-16 tabular-nums">{fmtSize(e.sizeBytes)}</span>
                          {busy ? (
                            <div className="flex-1 flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-surface-input rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-content-tertiary tabular-nums w-9 text-right">{pct}%</span>
                            </div>
                          ) : done ? (
                            <span className="flex-1 flex items-center gap-1 text-emerald-400"><Check className="w-3 h-3" /> {t('logs:fleetPull.fetched')}</span>
                          ) : failed ? (
                            <span className="flex-1 min-w-0 flex items-center gap-1 text-red-400" title={job?.message}>
                              <AlertTriangle className="w-3 h-3 shrink-0" />
                              <span className="shrink-0">{t('logs:fleetPull.failed')}</span>
                              {job?.message && <span className="truncate">: {job.message}</span>}
                            </span>
                          ) : (
                            <button
                              onClick={() => void fetchLog(v.sysid, e.id)}
                              className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                            >
                              <Download className="w-3 h-3" /> {t('logs:fleetPull.fetch')}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
