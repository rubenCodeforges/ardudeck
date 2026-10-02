import { useState, useMemo } from 'react';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer } from '../../panels/panel-utils';
import { Trans, useTranslation } from 'react-i18next';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const size = sizes[i];
  if (size === undefined) return `${bytes} B`;
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${size}`;
}

type SortKey = 'cpu' | 'ram' | 'name' | 'pid';

export function ProcessesPanel() {
  const { t } = useTranslation();
  const processes = useCompanionStore((s) => s.processes);
  const [sortBy, setSortBy] = useState<SortKey>('cpu');
  const [sortDesc, setSortDesc] = useState(true);
  const [killTarget, setKillTarget] = useState<{ pid: number; name: string } | null>(null);
  const [killing, setKilling] = useState(false);
  const [filter, setFilter] = useState('');

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortBy(key);
      setSortDesc(true);
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortBy !== key) return '';
    return sortDesc ? ' v' : ' ^';
  };

  const filtered = useMemo(() => {
    let list = [...processes];

    if (filter) {
      const lower = filter.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(lower) || p.command.toLowerCase().includes(lower));
    }

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'cpu': cmp = a.cpu - b.cpu; break;
        case 'ram': cmp = a.ram - b.ram; break;
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'pid': cmp = a.pid - b.pid; break;
      }
      return sortDesc ? -cmp : cmp;
    });

    return list;
  }, [processes, sortBy, sortDesc, filter]);

  const handleKill = async () => {
    if (!killTarget) return;
    setKilling(true);
    try {
      await window.electronAPI.companionKillProcess(killTarget.pid);
    } catch {
      // Error handled silently — process list will update
    } finally {
      setKilling(false);
      setKillTarget(null);
    }
  };

  if (processes.length === 0) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-content-tertiary text-xs">
          <div className="text-content-secondary mb-1">{t('companion:processes.none')}</div>
          <div>{t('companion:waitingAgent')}</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-subtle shrink-0">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('companion:processes.filter')}
          className="flex-1 bg-surface border border-subtle rounded px-2 py-1 text-xs text-content focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />
        <span className="text-[10px] text-content-secondary">{t('companion:processes.count', { count: filtered.length })}</span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[60px_1fr_70px_80px_36px] gap-1 px-3 py-1 border-b border-subtle text-[10px] text-content-secondary uppercase tracking-wider shrink-0">
        <button className="text-left hover:text-content" onClick={() => handleSort('pid')}>PID{sortIndicator('pid')}</button>
        <button className="text-left hover:text-content" onClick={() => handleSort('name')}>{t('common:name')}{sortIndicator('name')}</button>
        {/* i18n-exempt */}
        <button className="text-right hover:text-content" onClick={() => handleSort('cpu')}>CPU%{sortIndicator('cpu')}</button>
        <button className="text-right hover:text-content" onClick={() => handleSort('ram')}>RAM{sortIndicator('ram')}</button>
        <span />
      </div>

      {/* Process list */}
      <div className="flex-1 overflow-auto">
        {filtered.map((proc) => (
          <div
            key={proc.pid}
            className="grid grid-cols-[60px_1fr_70px_80px_36px] gap-1 px-3 py-1 hover:bg-surface-overlay-subtle transition-colors items-center text-xs"
          >
            <span className="text-content-secondary font-mono">{proc.pid}</span>
            <div className="truncate">
              <span className="text-content">{proc.name}</span>
              {proc.user && <span className="text-content-tertiary ml-1 text-[10px]">{proc.user}</span>}
            </div>
            <span className={`text-right font-mono ${proc.cpu > 80 ? 'text-red-400' : proc.cpu > 50 ? 'text-amber-400' : 'text-content'}`}>
              {proc.cpu.toFixed(1)}
            </span>
            <span className="text-right font-mono text-content">{formatBytes(proc.ram)}</span>
            <div className="flex justify-center">
              {proc.isProtected ? (
                <svg className="w-3.5 h-3.5 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-label={t('companion:processes.protected')}>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <button
                  onClick={() => setKillTarget({ pid: proc.pid, name: proc.name })}
                  className="text-content-tertiary hover:text-red-400 transition-colors"
                  title={t('companion:processes.kill')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Kill confirmation dialog */}
      {killTarget && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-raised border border rounded-lg p-4 max-w-xs shadow-xl">
            <div className="text-sm text-content mb-1">{t('companion:processes.killConfirm')}</div>
            <div className="text-xs text-content-secondary mb-3">
              <Trans
                i18nKey="companion:processes.killBody"
                values={{ name: killTarget.name, pid: killTarget.pid }}
                components={{ name: <span className="text-content font-mono" /> }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setKillTarget(null)}
                className="px-3 py-1.5 bg-surface-raised hover:bg-surface-raised text-content text-xs rounded transition-colors"
                disabled={killing}
              >
                {t('common:cancel')}
              </button>
              <button
                onClick={handleKill}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition-colors"
                disabled={killing}
              >
                {killing ? t('companion:processes.killing') : t('companion:processes.killButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </PanelContainer>
  );
}
