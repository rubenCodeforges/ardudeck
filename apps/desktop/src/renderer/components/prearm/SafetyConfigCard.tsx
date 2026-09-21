/**
 * Safety configuration: the settings that stay quiet until they matter.
 *
 * Deliberately invisible when the aircraft is set up sensibly. It only appears
 * when there is something that would change the outcome of a bad flight, and it
 * leads with what happens to the AIRCRAFT rather than which parameter is wrong.
 * The parameter name only shows on the fix control, where it is useful.
 */

import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, AlertTriangle, Info, ChevronRight } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useNavigationStore } from '../../stores/navigation-store';
import {
  checkSafetyConfig,
  type SafetyFinding,
  type SafetySeverity,
} from '../../../shared/safety-config-checks';
import type { CalibrationRecordIpc, CalibrationVerdict } from '../../../shared/calibration-quality';

const SEVERITY: Record<SafetySeverity, {
  icon: typeof ShieldAlert;
  ring: string;
  chip: string;
  label: string;
}> = {
  critical: {
    icon: ShieldAlert,
    ring: 'border-red-500/40 bg-red-500/[0.07]',
    chip: 'text-red-300 bg-red-500/15 border-red-500/30',
    label: 'Do not fly',
  },
  warning: {
    icon: AlertTriangle,
    ring: 'border-amber-500/40 bg-amber-500/[0.07]',
    chip: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
    label: 'Check this',
  },
  advisory: {
    icon: Info,
    ring: 'border-subtle bg-surface-raised',
    chip: 'text-content-secondary bg-surface border-subtle',
    label: 'Worth knowing',
  },
};

function FindingRow({ finding }: { finding: SafetyFinding }) {
  const setView = useNavigationStore((s) => s.setView);
  const setParameter = useParameterStore((s) => s.setParameterImmediate);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [failed, setFailed] = useState(false);

  const style = SEVERITY[finding.severity];
  const Icon = style.icon;

  const apply = async () => {
    if (!finding.recommend) return;
    setApplying(true);
    setFailed(false);
    const ok = await setParameter(finding.recommend.param, finding.recommend.value);
    setApplying(false);
    if (ok) setApplied(true);
    else setFailed(true);
  };

  return (
    <div className={`rounded-lg border p-3 ${style.ring}`}>
      <div className="flex items-start gap-2.5">
        <Icon className="w-4 h-4 mt-0.5 shrink-0 text-content-secondary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-content">{finding.title}</span>
            <span className={`px-1.5 py-0.5 rounded-full border text-[10px] font-medium ${style.chip}`}>
              {style.label}
            </span>
          </div>
          <p className="text-xs text-content-secondary mt-1 leading-relaxed">{finding.consequence}</p>

          <div className="flex items-center gap-2 mt-2">
            {finding.recommend && !applied && (
              <button
                onClick={apply}
                disabled={applying}
                className="px-2.5 py-1 rounded-md bg-surface-raised border border-subtle text-xs text-content hover:bg-surface-overlay transition-colors disabled:opacity-50"
                data-tip={`Sets ${finding.recommend.param} to ${finding.recommend.value}`}
              >
                {applying ? 'Applying…' : finding.recommend.label}
              </button>
            )}
            {applied && <span className="text-xs text-green-400">Applied</span>}
            {failed && <span className="text-xs text-red-400">Could not write, open the parameter instead</span>}

            {finding.params.length > 0 && (
              <button
                onClick={() => setView('parameters', finding.params[0])}
                className="inline-flex items-center gap-0.5 text-xs text-content-secondary hover:text-content transition-colors"
              >
                {finding.params[0]}
                <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SafetyConfigCard() {
  const parameters = useParameterStore((s) => s.parameters);
  // Safety findings computed from a partial set would read as "no issues"
  // simply because the parameters they check had not arrived.
  const paramsLoaded = useParameterStore((s) => s.downloadState === 'complete');
  const boardUid = useConnectionStore((s) => s.connectionState.boardUid);
  const isConnected = useConnectionStore((s) => s.connectionState.isConnected);
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const [records, setRecords] = useState<CalibrationRecordIpc[]>([]);

  useEffect(() => {
    if (!boardUid || !isConnected) {
      setRecords([]);
      return;
    }
    let cancelled = false;
    void window.electronAPI?.calibrationRecordList?.(boardUid).then((list) => {
      if (!cancelled) setRecords(list ?? []);
    });
    return () => { cancelled = true; };
  }, [boardUid, isConnected]);

  const findings = useMemo(() => {
    if (!isConnected || !paramsLoaded || parameters.size === 0) return [];

    const values = new Map<string, number>();
    for (const [id, param] of parameters) values.set(id, param.value);

    const compass = records.find((r) => r.type === 'compass');
    const lost = records.find((r) => r.persistence && r.persistence.state !== 'verified');

    return checkSafetyConfig({
      params: values,
      firmware: firmware === 'px4' ? 'px4' : 'ardupilot',
      compassVerdict: compass?.verdict as CalibrationVerdict | undefined,
      calibrationLost: Boolean(lost),
      calibrationLostType: lost?.type,
    });
  }, [parameters, paramsLoaded, records, isConnected, firmware]);

  // Nothing to say: show nothing at all.
  if (findings.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-medium text-content-secondary uppercase tracking-wide">
          Safety configuration
        </h4>
        <span className="text-[11px] text-content-tertiary">
          {findings.length} item{findings.length === 1 ? '' : 's'}
        </span>
      </div>
      {findings.map((finding) => (
        <FindingRow key={finding.id} finding={finding} />
      ))}
    </div>
  );
}
