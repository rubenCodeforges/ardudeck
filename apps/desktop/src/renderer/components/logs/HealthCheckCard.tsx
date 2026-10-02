import type { HealthCheckResult, CheckStatus } from '@ardudeck/dataflash-parser';
import { useTranslation } from 'react-i18next';

const STATUS_STYLES: Record<CheckStatus, { bg: string; border: string; icon: string; text: string }> = {
  pass: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: 'text-emerald-400', text: 'text-emerald-400' },
  warn: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', icon: 'text-amber-400', text: 'text-amber-400' },
  fail: { bg: 'bg-red-500/10', border: 'border-red-500/30', icon: 'text-red-400', text: 'text-red-400' },
  skip: { bg: 'bg-gray-500/10', border: 'border-subtle', icon: 'text-content-secondary', text: 'text-content-secondary' },
  info: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', icon: 'text-blue-400', text: 'text-blue-400' },
};

const STATUS_LABEL_KEYS: Record<CheckStatus, string> = {
  pass: 'logs:health.statusPass', warn: 'logs:health.statusWarn', fail: 'logs:health.statusFail', skip: 'logs:health.statusSkip', info: 'logs:health.statusInfo',
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

export function HealthCheckCard({ result, onViewData, onAskAi, aiLabel }: { result: HealthCheckResult; onViewData?: () => void; onAskAi?: () => void; aiLabel?: string }) {
  const { t } = useTranslation();
  const style = STATUS_STYLES[result.status]!;

  return (
    <div className={`${style.bg} rounded-xl border ${style.border} p-4`}>
      <div className="flex items-center gap-3 mb-2">
        <StatusIcon status={result.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-content">{result.name}</h3>
            <span className={`text-xs font-medium ${style.text}`}>{STATUS_LABEL_KEYS[result.status] ? t(STATUS_LABEL_KEYS[result.status]) : result.status}</span>
          </div>
        </div>
      </div>
      <p className="text-sm text-content mb-1">{result.summary}</p>
      {result.status !== 'skip' && (
        <p className="text-xs text-content-secondary">{result.details}</p>
      )}
      {result.recommendation && (
        <p className="text-xs text-content-secondary mt-2 pl-3 border-l-2 border-strong">{result.recommendation}</p>
      )}
      {(onViewData || onAskAi) && result.status !== 'skip' && (
        <div className="flex gap-2 mt-3">
          {onViewData && result.explorerPreset && (
            <button
              onClick={onViewData}
              className="text-xs px-3 py-1.5 bg-surface hover:bg-surface-raised text-content hover:text-content rounded-md transition-colors"
            >
              {t('logs:health.viewData')}
            </button>
          )}
          {onAskAi && (
            <button
              onClick={onAskAi}
              className="text-xs px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 border border-purple-500/20 rounded-md transition-colors"
            >
              {aiLabel ?? t('logs:health.analyzeAi')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
