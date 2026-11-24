import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

/** A thin draggable divider for resizing the side rails. */
export function ResizeHandle({ onDrag, title }: { onDrag: (dx: number) => void; title?: string }) {
  const { t } = useTranslation();
  const last = useRef(0);
  const down = (e: ReactPointerEvent) => {
    e.preventDefault();
    last.current = e.clientX;
    const move = (ev: PointerEvent) => {
      const dx = ev.clientX - last.current;
      last.current = ev.clientX;
      onDrag(dx);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <div
      onPointerDown={down}
      className="w-1.5 shrink-0 touch-none cursor-col-resize bg-transparent hover:bg-blue-500/40 active:bg-blue-500/60 transition-colors"
      title={title ?? t('osd:osdView.dragToResize')}
    />
  );
}
