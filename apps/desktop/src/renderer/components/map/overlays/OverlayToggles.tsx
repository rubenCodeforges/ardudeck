import { useOverlayStore } from '../../../stores/overlay-store';
import type { OverlayId } from '../../../../shared/overlay-types';

export const OVERLAYS: Array<{ id: OverlayId; label: string; icon: JSX.Element }> = [
  {
    id: 'radar',
    label: 'Weather',
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
  {
    id: 'dipul',
    label: 'DIPUL',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    ),
  },
  {
    id: 'wind',
    label: 'Wind',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h11a2.5 2.5 0 10-2.5-2.5M3 16h15a2.5 2.5 0 11-2.5 2.5M3 12h17a2.5 2.5 0 10-2.5-2.5" />
      </svg>
    ),
  },
  {
    id: 'traffic',
    label: 'Traffic',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V9m0 0l8 5V7.5a.75.75 0 00-1.1-.66L12 9zm0 0L5.1 6.84A.75.75 0 004 7.5V14l8-5zM9.5 19h5" />
      </svg>
    ),
  },
  {
    id: 'gliders',
    label: 'Gliders',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9 1.5L21 11M12 12.5V17m0 0l-2.5 2m2.5-2l2.5 2" />
      </svg>
    ),
  },
  {
    id: 'remoteid',
    label: 'Remote ID',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z" />
      </svg>
    ),
  },
  {
    id: 'camera',
    label: 'Camera FOV',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M18 9h.008v.008H18V9zm-3.75-4.5h13.5A2.25 2.25 0 0121 6.75v10.5A2.25 2.25 0 0118.75 19.5H5.25A2.25 2.25 0 013 17.25V6.75A2.25 2.25 0 015.25 4.5z" />
      </svg>
    ),
  },
  {
    id: 'waypointdots',
    label: 'Waypoints',
    icon: (
      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="6" cy="17" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="12" cy="9" r="1.6" fill="currentColor" stroke="none" />
        <circle cx="18" cy="15" r="1.6" fill="currentColor" stroke="none" />
        <path strokeLinecap="round" d="M7.2 15.6l3.6-4.9m2.5.7l3.5 2.6" />
      </svg>
    ),
  },
];

export function OverlayToggles() {
  const activeOverlays = useOverlayStore((s) => s.activeOverlays);
  const toggleOverlay = useOverlayStore((s) => s.toggleOverlay);
  const dipulAvailable = useOverlayStore((s) => s.dipulAvailable);

  return (
    <>
      {OVERLAYS.map(({ id, label, icon }) => {
        if (id === 'dipul' && !dipulAvailable) return null;
        const isActive = activeOverlays.has(id);
        return (
          <button
            key={id}
            onClick={() => toggleOverlay(id)}
            className={`px-2 py-1 text-xs rounded shadow-sm transition-colors flex items-center gap-1.5 ${
              isActive
                ? 'bg-blue-600 text-white'
                : 'bg-surface-solid text-content hover:bg-surface-raised border border-subtle'
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
