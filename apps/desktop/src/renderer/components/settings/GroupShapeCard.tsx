import { GROUP_SHAPE_MODES, GROUP_SHAPE_LABELS, GROUP_SHAPE_DESCRIPTIONS, useGroupShapeStore } from '../../stores/group-shape-store';

export function GroupShapeCard() {
  const mode = useGroupShapeStore((s) => s.mode);
  const setMode = useGroupShapeStore((s) => s.setMode);

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5 mt-4">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503-8.697l4.997-2.56v10.014l-4.997 2.56M9 6.75L4.003 4.19v10.014L9 16.764m0-10.014L14.503 4.19M9 6.75v10.014m5.503-12.574L9 6.75" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-medium text-content">Grouped gauge shape</h3>
          <p className="text-xs text-content-secondary">How a docked group's backdrop treats round gauges</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2">
        {GROUP_SHAPE_MODES.map((m) => (
          <label key={m} className="flex items-start gap-2.5 cursor-pointer group">
            <input
              type="radio"
              name="group-shape-mode"
              checked={mode === m}
              onChange={() => setMode(m)}
              className="mt-0.5 w-3.5 h-3.5 border-border bg-surface-raised text-blue-500 focus:ring-blue-500/30 focus:ring-offset-0 cursor-pointer"
            />
            <div className="min-w-0">
              <div className="text-xs font-medium text-content group-hover:text-content transition-colors">{GROUP_SHAPE_LABELS[m]}</div>
              <div className="text-[11px] text-content-tertiary">{GROUP_SHAPE_DESCRIPTIONS[m]}</div>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}
