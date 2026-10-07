import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import { useCameraStore } from '../../../stores/camera-store';
import { mapLayerName } from '../../../../shared/map-layers';
import { SVT_IMAGERY_LAYERS, validImagery } from './svt-satellite';

/** Which of the map's satellite layers textures the synthetic-vision terrain. */
export function SvtImageryPicker({ disabled = false }: { disabled?: boolean }) {
  const { t } = useTranslation();
  const imagery = useCameraStore((s) => validImagery(s.svtImagery));
  const setImagery = useCameraStore((s) => s.setSvtImagery);
  return (
    <div className={disabled ? 'pointer-events-none opacity-50' : ''}>
      <div className="px-1.5 pb-0.5 pt-1 text-[10px] uppercase tracking-wide text-content-tertiary">{t('camera:panel.imagerySource')}</div>
      {SVT_IMAGERY_LAYERS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => setImagery(key)}
          className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-[11px] transition-colors hover:bg-surface-raised ${imagery === key ? 'text-content' : 'text-content-secondary'}`}
        >
          <Check className={`h-3 w-3 shrink-0 ${imagery === key ? 'text-blue-400' : 'invisible'}`} />
          {mapLayerName(key)}
        </button>
      ))}
    </div>
  );
}
