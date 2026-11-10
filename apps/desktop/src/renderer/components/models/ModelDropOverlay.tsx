import { useTranslation } from 'react-i18next';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Box } from 'lucide-react';
import { useUserModelsStore } from '../../stores/user-models-store';
import { carriesFiles, filterModelFiles } from './user-models-helpers';

type LatLng = { lat: number; lng: number };

/** Drags without files (waypoints, vehicles) must pass straight through. */
export function useModelFileDrop(el: HTMLElement | null, toLatLng: (e: DragEvent) => LatLng | null): boolean {
  const [active, setActive] = useState(false);
  const toLatLngRef = useRef(toLatLng);
  toLatLngRef.current = toLatLng;

  useEffect(() => {
    if (!el) return;
    let depth = 0;
    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer?.types)) return;
      depth++;
      setActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer?.types)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer?.types)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!carriesFiles(e.dataTransfer?.types)) return;
      e.preventDefault();
      e.stopPropagation();
      depth = 0;
      setActive(false);
      const files = filterModelFiles(e.dataTransfer?.files);
      const at = toLatLngRef.current(e);
      if (files.length === 0 || !at) return;
      void useUserModelsStore.getState().importDroppedFiles(files, at);
    };
    el.addEventListener('dragenter', onEnter);
    el.addEventListener('dragover', onOver);
    el.addEventListener('dragleave', onLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragenter', onEnter);
      el.removeEventListener('dragover', onOver);
      el.removeEventListener('dragleave', onLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, [el]);

  return active;
}

export function ModelDropOverlay({ container, active }: { container: HTMLElement | null; active: boolean }): JSX.Element | null {
  const { t } = useTranslation();
  if (!active || !container) return null;
  return createPortal(
    <div className="absolute inset-0 z-[1500] pointer-events-none flex items-center justify-center bg-teal-500/10 border-2 border-dashed border-teal-400/70 rounded">
      <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-gray-900/85 border border-teal-500/50 text-sm text-gray-100 shadow-lg">
        <Box className="w-4 h-4 text-teal-400" />
        {t('models:drop.overlay')}
      </div>
    </div>,
    container,
  );
}
