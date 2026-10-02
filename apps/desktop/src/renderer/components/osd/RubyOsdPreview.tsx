/**
 * RubyFPV OSD preview - a layout-faithful, HD (16:9) preview of the RubyFPV OSD
 * being authored. Elements are drawn where RubyFPV would auto-arrange them, with
 * a substitute font (ArduDeck does not ship RubyFPV's fonts - license-clean), so
 * it shows WHAT is on and roughly WHERE, not pixel-exact goggle output. The live
 * RubyFPV video feed is the exact-pixel confirmation.
 */

import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRubyOsdStore, getFontSize, getTransparency } from '../../stores/ruby-osd-store';
import { buildRubyPreview, type PreviewZone, type RubyPreviewChip } from '../../utils/osd/ruby-osd-preview';
import { OsdVideoBackdrop } from './OsdVideoBackdrop';

/** Measure a container's content box. */
function useMeasure() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (cr) setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

const OSD_COLOR = '#e9fff1';

const ZONE_CLASS: Record<PreviewZone, string> = {
  TL: 'top-3 left-3 items-start',
  TC: 'top-3 left-1/2 -translate-x-1/2 items-center',
  TR: 'top-3 right-3 items-end',
  ML: 'top-1/2 -translate-y-1/2 left-3 items-start',
  MR: 'top-1/2 -translate-y-1/2 right-3 items-end',
  BL: 'bottom-3 left-3 items-start',
  BC: 'bottom-3 left-1/2 -translate-x-1/2 items-center',
  BR: 'bottom-3 right-3 items-end',
};

const ZONES: PreviewZone[] = ['TL', 'TC', 'TR', 'ML', 'MR', 'BL', 'BC', 'BR'];

export function RubyOsdPreview() {
  const { t } = useTranslation();
  const params = useRubyOsdStore((s) => s.params);
  const editingScreen = useRubyOsdStore((s) => s.editingScreen);
  const pv = buildRubyPreview(params, editingScreen);

  const prefs = params.screens[editingScreen]!.preferences;
  const fontSize = getFontSize(prefs); // 0..6
  const transparency = getTransparency(prefs); // 0 max transparent .. 4 opaque
  const fontPx = 11 * (1 + (fontSize - 3) * 0.08);
  const opacity = 0.45 + Math.min(4, transparency) * 0.1375; // 0 -> .45, 4 -> 1

  const byZone = (z: PreviewZone): RubyPreviewChip[] => pv.chips.filter((c) => c.zone === z);
  const empty = pv.chips.length === 0 && !pv.horizon && !pv.heading && !pv.crosshair
    && !pv.gridThirds && !pv.gridSquares && !pv.gridDiagonal && !pv.speedAlt && !pv.altGraph;

  // Fit the largest 16:9 stage into the available viewport.
  const { ref, size } = useMeasure();
  const stageW = size.w > 0 && size.h > 0 ? Math.min(size.w, (size.h * 16) / 9) : 0;
  const stageH = (stageW * 9) / 16;

  return (
    <div ref={ref} className="h-full w-full flex items-center justify-center">
      <div
        className="relative rounded-md ring-1 ring-black/40 shadow-2xl overflow-hidden"
        style={{ width: stageW || '100%', height: stageH || undefined, aspectRatio: stageW ? undefined : '16 / 9' }}
      >
      <OsdVideoBackdrop backgroundColor="rgba(0,0,0,0)" className="absolute inset-0" />
      {/* Vector overlays (grids, crosshair, horizon, instruments) */}
      <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 160 90" preserveAspectRatio="none"
        style={{ opacity, filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.9))' }}>
        <g stroke={OSD_COLOR} strokeWidth={0.4} fill="none">
          {pv.gridThirds && (
            <g strokeOpacity={0.35}>
              <line x1={160 / 3} y1={0} x2={160 / 3} y2={90} />
              <line x1={(160 / 3) * 2} y1={0} x2={(160 / 3) * 2} y2={90} />
              <line x1={0} y1={30} x2={160} y2={30} />
              <line x1={0} y1={60} x2={160} y2={60} />
            </g>
          )}
          {pv.gridSquares && (
            <g strokeOpacity={0.18}>
              {[20, 40, 60, 80, 100, 120, 140].map((x) => <line key={`v${x}`} x1={x} y1={0} x2={x} y2={90} />)}
              {[15, 30, 45, 60, 75].map((y) => <line key={`h${y}`} x1={0} y1={y} x2={160} y2={y} />)}
            </g>
          )}
          {pv.gridDiagonal && (
            <g strokeOpacity={0.25}>
              <line x1={0} y1={0} x2={160} y2={90} />
              <line x1={160} y1={0} x2={0} y2={90} />
            </g>
          )}
          {pv.horizon && (
            <g strokeWidth={0.6}>
              <line x1={45} y1={45} x2={72} y2={45} />
              <line x1={88} y1={45} x2={115} y2={45} />
            </g>
          )}
          {pv.crosshair && (
            <g strokeWidth={0.6}>
              <line x1={76} y1={45} x2={84} y2={45} />
              <line x1={80} y1={41} x2={80} y2={49} />
            </g>
          )}
          {pv.heading && (
            <g strokeWidth={0.5}>
              <line x1={62} y1={9} x2={98} y2={9} />
              {[68, 74, 80, 86, 92].map((x) => <line key={x} x1={x} y1={9} x2={x} y2={11} />)}
              <path d="M80 12 l-1.6 2 h3.2 z" fill={OSD_COLOR} stroke="none" />
            </g>
          )}
          {pv.speedAlt && (
            <g strokeWidth={0.5}>
              {[36, 42, 48, 54].map((y) => <line key={`sl${y}`} x1={30} y1={y} x2={34} y2={y} />)}
              {[36, 42, 48, 54].map((y) => <line key={`sr${y}`} x1={126} y1={y} x2={130} y2={y} />)}
            </g>
          )}
          {pv.altGraph && (
            <polyline strokeWidth={0.5} strokeOpacity={0.7} points="128,70 132,66 136,68 140,62 144,64 148,58" />
          )}
        </g>
      </svg>

      {/* Text chips by zone */}
      {ZONES.map((z) => {
        const chips = byZone(z);
        if (chips.length === 0) return null;
        return (
          <div key={z} className={`absolute flex flex-col gap-0.5 ${ZONE_CLASS[z]}`} style={{ opacity }}>
            {chips.map((c) => (
              <span
                key={c.id}
                className="font-mono leading-tight whitespace-nowrap"
                style={{ color: OSD_COLOR, fontSize: `${fontPx}px`, textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
              >
                {c.text}
              </span>
            ))}
          </div>
        );
      })}

      {empty && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[11px] text-content-tertiary">{t('osd:rubyOsdPreview.noElements', { n: editingScreen + 1 })}</span>
        </div>
      )}

        {/* Fidelity note */}
        <div className="absolute -top-px right-1 -translate-y-full text-[10px] text-content-tertiary font-mono pb-1">
          {t('osd:rubyOsdPreview.layoutPreview')}
        </div>
      </div>
    </div>
  );
}
