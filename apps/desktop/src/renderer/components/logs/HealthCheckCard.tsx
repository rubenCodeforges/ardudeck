import type { HealthCheckResult, CheckStatus } from '@ardudeck/dataflash-parser';

const STATUS_STYLES: Record<CheckStatus, { bg: string; border: string; icon: string; text: string }> = {
  pass: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-400', text: 'text-emerald-400' },
  warn: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: 'text-amber-400', text: 'text-amber-400' },
  fail: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', text: 'text-red-400' },
  skip: { bg: 'bg-gray-500/10', border: 'border-gray-600/30', icon: 'text-gray-500', text: 'text-gray-500' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400', text: 'text-blue-400' },
};

const STATUS_LABELS: Record<CheckStatus, string> = {
  pass: 'Pass', warn: 'Warning', fail: 'Fail', skip: 'N/A', info: 'Info',
};

function StatusIcon({ status }: { status: CheckStatus }) {
  const style = STATUS_STYLES[status]!;
  if (status === 'pass') {
    return (
      <svg className={`w-5 h-5 ${style.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === 'fail') {
    return (
      <svg className={`w-5 h-5 ${style.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  if (status === 'warn') {
    return (
      <svg className={`w-5 h-5 ${style.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    );
  }
  if (status === 'info') {
    return (
      <svg className={`w-5 h-5 ${style.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  return (
    <svg className={`w-5 h-5 ${style.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
    </svg>
  );
}

export function HealthCheckCard({ result, onViewData }: { result: HealthCheckResult; onViewData?: () => void }) {
  const style = STATUS_STYLES[result.status]!;

  return (
    <div className={`${style.bg} rounded-xl border ${style.border} p-4`}>
      <div className="flex items-center gap-3 mb-2">
        <StatusIcon status={result.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-white">{result.name}</h3>
            <span className={`text-xs font-medium ${style.text}`}>{STATUS_LABELS[result.status] ?? result.status}</span>
          </div>
        </div>
      </div>
      <p className="text-sm text-gray-300 mb-1">{result.summary}</p>
      {result.status !== 'skip' && (
        <p className="text-xs text-gray-500">{result.details}</p>
      )}
      {result.recommendation && (
        <p className="text-xs text-gray-400 mt-2 pl-3 border-l-2 border-gray-600">{result.recommendation}</p>
      )}
      {onViewData && result.explorerPreset && result.status !== 'skip' && (
        <button
          onClick={onViewData}
          className="mt-3 text-xs px-3 py-1.5 bg-gray-800/60 hover:bg-gray-700/60 text-gray-300 hover:text-white rounded-md transition-colors"
        >
          View Data
        </button>
      )}
    </div>
  );
}
