const LEGEND_ITEMS = [
  { label: 'CTR', color: 'rgba(0, 100, 255, 0.45)' },
  { label: 'Restricted', color: 'rgba(255, 0, 0, 0.45)' },
  { label: 'Danger', color: 'rgba(255, 150, 0, 0.45)' },
  { label: 'TMA', color: 'rgba(160, 32, 240, 0.40)' },
];

export function AirspaceLegend() {
  return (
    <div className="absolute bottom-3 left-3 z-[1000] bg-gray-900/80 rounded-lg px-3 py-2 text-xs text-gray-200 space-y-1">
      {LEGEND_ITEMS.map(({ label, color }) => (
        <div key={label} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
          {label}
        </div>
      ))}
    </div>
  );
}
