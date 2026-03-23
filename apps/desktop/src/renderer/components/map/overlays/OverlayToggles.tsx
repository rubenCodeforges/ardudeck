import { useOverlayStore } from '../../../stores/overlay-store';
import type { OverlayId } from '../../../../shared/overlay-types';

const OVERLAYS: Array<{ id: OverlayId; label: string; icon: JSX.Element }> = [
  {
    id: 'radar',
    label: 'Radar',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.651a3.75 3.75 0 010-5.303m5.304 0a3.75 3.75 0 010 5.303m-7.425 2.122a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
      </svg>
    ),
  },
  {
    id: 'airspace',
    label: 'Zones',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503-8.697l4.997-2.56v10.014l-4.997 2.56M9 6.75L4.003 4.19v10.014L9 16.764m0-10.014L14.503 4.19M9 6.75v10.014m5.503-12.574L9 6.75" />
      </svg>
    ),
  },
  {
    id: 'openaip',
    label: 'Aviation',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
      </svg>
    ),
  },
];

export function OverlayToggles() {
  const activeOverlays = useOverlayStore((s) => s.activeOverlays);
  const toggleOverlay = useOverlayStore((s) => s.toggleOverlay);

  return (
    <>
      {OVERLAYS.map(({ id, label, icon }) => {
        const isActive = activeOverlays.has(id);
        return (
          <button
            key={id}
            onClick={() => toggleOverlay(id)}
            className={`px-2 py-1 text-xs rounded transition-colors flex items-center gap-1.5 ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800/90 text-gray-300 hover:bg-gray-700/90'
            }`}
          >
            {icon}
            {label}
          </button>
        );
      })}
    </>
  );
}
