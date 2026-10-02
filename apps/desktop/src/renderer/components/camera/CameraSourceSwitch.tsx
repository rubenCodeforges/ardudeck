import { useMemo } from 'react';
import { useCameraStore } from '../../stores/camera-store';
import { useTranslation } from 'react-i18next';

/** One-click switch between a vehicle's feeds (FPV, gimbal, ...). Hidden with fewer than two. */
export function CameraSourceSwitch({ vehicleKey }: { vehicleKey: string }) {
  const { t } = useTranslation();
  const allSources = useCameraStore((s) => s.sources);
  const selectedId = useCameraStore((s) => s.selectedByVehicle[vehicleKey]);
  const setSelectedSource = useCameraStore((s) => s.setSelectedSource);
  const sources = useMemo(
    () => Object.values(allSources).filter((s) => s.vehicleKey === vehicleKey),
    [allSources, vehicleKey],
  );

  if (sources.length < 2) return null;

  return (
    <div className="ml-1 flex max-w-[40%] overflow-hidden rounded-md border border-subtle">
      {sources.map((s) => (
        <button
          key={s.id}
          onClick={() => setSelectedSource(vehicleKey, s.id)}
          data-tip={t('camera:sourceSwitch.show', { label: s.label })}
          className={`min-w-0 truncate px-2 py-0.5 text-[11px] transition-colors ${
            s.id === selectedId ? 'bg-surface-raised text-content' : 'text-content-secondary hover:bg-surface-raised'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
