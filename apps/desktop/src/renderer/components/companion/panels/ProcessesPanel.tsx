import { useState, useMemo } from 'react';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer } from '../../panels/panel-utils';

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
        <div className="text-center text-gray-600 text-xs">
          <div className="text-gray-500 mb-1">No process data</div>
          <div>Waiting for agent connection...</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Filter bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-700/40 shrink-0">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter processes..."
          className="flex-1 bg-gray-800/50 border border-gray-700/50 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />
        <span className="text-[10px] text-gray-500">{filtered.length} processes</span>
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[60px_1fr_70px_80px_36px] gap-1 px-3 py-1 border-b border-gray-700/40 text-[10px] text-gray-500 uppercase tracking-wider shrink-0">
        <button className="text-left hover:text-gray-300" onClick={() => handleSort('pid')}>PID{sortIndicator('pid')}</button>
        <button className="text-left hover:text-gray-300" onClick={() => handleSort('name')}>Name{sortIndicator('name')}</button>
        <button className="text-right hover:text-gray-300" onClick={() => handleSort('cpu')}>CPU%{sortIndicator('cpu')}</button>
        <button className="text-right hover:text-gray-300" onClick={() => handleSort('ram')}>RAM{sortIndicator('ram')}</button>
        <span />
      </div>

      {/* Process list */}
      <div className="flex-1 overflow-auto">
        {filtered.map((proc) => (
          <div
            key={proc.pid}
            className="grid grid-cols-[60px_1fr_70px_80px_36px] gap-1 px-3 py-1 hover:bg-gray-800/30 transition-colors items-center text-xs"
          >
            <span className="text-gray-500 font-mono">{proc.pid}</span>
            <div className="truncate">
              <span className="text-gray-200">{proc.name}</span>
              {proc.user && <span className="text-gray-600 ml-1 text-[10px]">{proc.user}</span>}
            </div>
            <span className={`text-right font-mono ${proc.cpu > 80 ? 'text-red-400' : proc.cpu > 50 ? 'text-amber-400' : 'text-gray-300'}`}>
              {proc.cpu.toFixed(1)}
            </span>
            <span className="text-right font-mono text-gray-300">{formatBytes(proc.ram)}</span>
            <div className="flex justify-center">
              {proc.isProtected ? (
                <svg className="w-3.5 h-3.5 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" title="Protected process">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              ) : (
                <button
                  onClick={() => setKillTarget({ pid: proc.pid, name: proc.name })}
                  className="text-gray-600 hover:text-red-400 transition-colors"
                  title="Kill process"
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
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 max-w-xs shadow-xl">
            <div className="text-sm text-gray-200 mb-1">Kill process?</div>
            <div className="text-xs text-gray-400 mb-3">
              Send SIGTERM to <span className="text-gray-200 font-mono">{killTarget.name}</span> (PID {killTarget.pid})
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setKillTarget(null)}
                className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
                disabled={killing}
              >
                Cancel
              </button>
              <button
                onClick={handleKill}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-xs rounded transition-colors"
                disabled={killing}
              >
                {killing ? 'Killing...' : 'Kill'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PanelContainer>
  );
}
