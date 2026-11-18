import { useTranslation } from 'react-i18next';
import type { AltReferenceFrame } from '../../../shared/mission-types.js';

/** Altitude reference picker: Home / Terrain / Sea; tooltips carry the detail. */
export function AltFrameSeg({ value, onChange }: { value: AltReferenceFrame; onChange: (f: AltReferenceFrame) => void }) {
  const { t } = useTranslation();
  const opts: { id: AltReferenceFrame; label: string; tip: string }[] = [
    { id: 'relative', label: t('map:mapCommand.frameHome'), tip: t('map:mapCommand.frameHomeTip') },
    { id: 'terrain', label: t('map:mapCommand.frameTerrain'), tip: t('map:mapCommand.frameTerrainTip') },
    { id: 'asl', label: t('map:mapCommand.frameSea'), tip: t('map:mapCommand.frameSeaTip') },
  ];
  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-lg border border-subtle">
      {opts.map((o, i) => (
        <button
          key={o.id}
          type="button"
          data-tip={o.tip}
          onClick={() => onChange(o.id)}
          className={`flex-1 text-[10.5px] transition-colors ${i > 0 ? 'border-l border-subtle' : ''} ${
            value === o.id ? 'bg-surface-raised font-semibold text-content' : 'bg-surface-input text-content-secondary hover:text-content'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
