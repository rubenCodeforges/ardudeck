import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MiniMap, MiniVision, usePhaseLoop } from './demo-kit';

type Rect = { x: number; y: number; w: number; h: number } | null;
type PanelKey = 'map' | 'vision' | 'waypoints' | 'profile';

const LAYOUTS: { name: string; rects: Record<PanelKey, Rect> }[] = [
  { name: 'Pilot', rects: { map: { x: 0, y: 0, w: 55, h: 100 }, vision: { x: 55, y: 0, w: 45, h: 100 }, waypoints: null, profile: null } },
  { name: 'FPV', rects: { map: { x: 0, y: 0, w: 49.5, h: 100 }, vision: { x: 50.5, y: 0, w: 49.5, h: 100 }, waypoints: null, profile: null } },
  { name: 'Mission', rects: { map: { x: 0, y: 0, w: 71.5, h: 68 }, vision: null, waypoints: { x: 72.5, y: 0, w: 27.5, h: 68 }, profile: { x: 0, y: 69, w: 100, h: 31 } } },
];

// Per layout: the Workspace dialog picks it, then the panels move into place and hold.
const PHASES = LAYOUTS.flatMap(() => [900, 1800]);

function Waypoints() {
  return (
    <div className="absolute inset-0 space-y-1 bg-surface-solid p-1.5">
      {[1, 2, 3, 4].map((n) => (
        <div key={n} className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-blue-500" />
          <span className="h-1 flex-1 rounded bg-content-tertiary/40" />
        </div>
      ))}
    </div>
  );
}

function Profile() {
  return (
    <div className="absolute inset-0 bg-surface-solid">
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 30" preserveAspectRatio="none">
        <path d="M0,26 L15,20 L30,24 L45,12 L60,18 L75,8 L100,16 L100,30 L0,30 Z" fill="#34d39955" />
        <polyline points="0,14 20,10 40,12 60,6 80,9 100,7" fill="none" stroke="#3b82f6" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

const CONTENT: Record<PanelKey, () => ReactNode> = { map: MiniMap, vision: MiniVision, waypoints: Waypoints, profile: Profile };

/** A mini app cycling Pilot, FPV and Mission through the Workspace dialog. */
export function LayoutsDemo() {
  const { t } = useTranslation();
  const phase = usePhaseLoop(PHASES);
  const index = Math.floor(phase / 2);
  const picking = phase % 2 === 0;
  // While picking, the panels still show the previous layout.
  const shown = LAYOUTS[picking ? (index + LAYOUTS.length - 1) % LAYOUTS.length : index]!;

  return (
    <div className="relative overflow-hidden rounded-xl border border-subtle bg-surface-base" style={{ width: 320, height: 170 }}>
      <div className="flex h-5 items-center justify-end border-b border-subtle bg-surface px-1.5">
        <span className={`rounded border px-1.5 text-[8px] leading-[14px] transition-colors ${picking ? 'border-blue-500 bg-blue-500/15 text-blue-300' : 'border-subtle text-content-secondary'}`}>
          {t('guides:layoutsDemo.workspace', { name: shown.name })}
        </span>
      </div>
      <div className="relative" style={{ height: 150 }}>
        {(Object.keys(CONTENT) as PanelKey[]).map((key) => {
          const r = shown.rects[key];
          const Content = CONTENT[key];
          return (
            <div
              key={key}
              className="absolute overflow-hidden rounded-sm border border-subtle transition-all duration-500 ease-in-out"
              style={r
                ? { left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%`, opacity: 1 }
                : { left: '100%', top: 0, width: 0, height: '100%', opacity: 0 }}
            >
              <Content />
            </div>
          );
        })}
        {picking && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <div className="flex gap-1 rounded-md border border-default bg-surface-solid p-1.5 shadow-xl">
              {LAYOUTS.map((l, i) => (
                <span
                  key={l.name}
                  className={`rounded border px-2 py-1 text-[9px] ${i === index ? 'border-blue-500 bg-blue-500/15 text-blue-300' : 'border-subtle text-content-secondary'}`}
                >
                  {l.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
