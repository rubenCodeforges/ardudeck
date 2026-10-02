import { useTranslation } from 'react-i18next';

const LEGEND_ITEMS = [
  { id: 'ctr', label: 'CTR', color: 'rgba(0, 100, 255, 0.45)' },
  { id: 'restricted', labelKey: 'map:airspaceLegend.restricted', color: 'rgba(255, 0, 0, 0.45)' },
  { id: 'danger', labelKey: 'map:airspaceLegend.danger', color: 'rgba(255, 150, 0, 0.45)' },
  { id: 'tma', label: 'TMA', color: 'rgba(160, 32, 240, 0.40)' },
];

export function AirspaceLegend() {
  const { t } = useTranslation();
  return (
    // bottom-14, not bottom-3: the mission map's action bar lives at bottom-3 left-3 and
    // would otherwise be drawn on top of this box.
    <div className="absolute bottom-14 left-3 z-[1000] bg-surface-overlay rounded-lg px-3 py-2 text-xs text-content space-y-1">
      {LEGEND_ITEMS.map(({ id, label, labelKey, color }) => (
        <div key={id} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
          {labelKey ? t(labelKey) : label}
        </div>
      ))}
    </div>
  );
}
