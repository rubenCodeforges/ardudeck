/**
 * MapLayersControl: single "Layers" dropdown that consolidates base-map
 * selection, data overlays, and (optionally) the terrain/height toggle into one
 * button, freeing the map corner. Used on both the Mission Planning and
 * Telemetry maps so their layer controls stay consistent (mirrors the Area
 * Editor's AreaEditorLayers pattern).
 *
 * Base-map state is owned by each screen (passed in); overlay state is global
 * (overlay-store), so the dropdown reads/writes it directly.
 *
 * The dropdown is rendered in a body portal with fixed positioning and a
 * viewport-aware max-height, so it always floats above neighbouring dock panels
 * and scrolls instead of spilling underneath them when the list is long.
 */

import { useTranslation } from 'react-i18next';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { mapLayerName, type LayerKey } from '../../../../shared/map-layers';
import { LayerIcon } from '../LayerIcon';
import { useOverlayStore } from '../../../stores/overlay-store';
import { OVERLAYS } from './OverlayToggles';
import { useModuleMapLayerToggles } from '../../panels/ModuleMapLayers';

interface MapLayersControlProps {
  baseLayers: LayerKey[];
  activeLayer: LayerKey;
  onSelectLayer: (key: LayerKey) => void;
  /** Optional terrain/height heatmap toggle (screens that support it). */
  showTerrain?: boolean;
  onToggleTerrain?: () => void;
  /** Extra rows at the bottom of the dropdown (e.g. offline download). */
  extra?: ReactNode;
}

const MENU_WIDTH = 208;

export function MapLayersControl({
  baseLayers, activeLayer, onSelectLayer, showTerrain, onToggleTerrain, extra,
}: MapLayersControlProps): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const activeOverlays = useOverlayStore((s) => s.activeOverlays);
  const toggleOverlay = useOverlayStore((s) => s.toggleOverlay);
  const dipulAvailable = useOverlayStore((s) => s.dipulAvailable);

  const overlayCount = activeOverlays.size + (showTerrain ? 1 : 0);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({
      top: r.bottom + 6,
      left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
      maxHeight: Math.max(140, window.innerHeight - r.bottom - 16),
    });
  }, [open]);

  const row = (active: boolean) =>
    'w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded text-xs transition-colors ' +
    (active ? 'bg-blue-600 text-white' : 'text-content-secondary hover:bg-surface-raised hover:text-content');

  return (
    <div className="relative select-none">
      {/* w-full so this stretches to the flex column's width like the plain
          sibling buttons; icon-left/label-after (no justify-center) so the
          whole column shares one left-aligned icon-then-text layout. */}
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-tip={t('map:mapLayers.tip')}
        className="w-full px-2 py-1 inline-flex items-center gap-1.5 rounded text-xs bg-surface text-content hover:bg-surface-raised shadow-lg transition-colors"
      >
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l9 5-9 5-9-5 9-5z" />
          <path d="M3 12l9 5 9-5M3 17l9 5 9-5" />
        </svg>
        <span className="font-medium">{overlayCount > 0 ? t('map:mapLayers.buttonCount', { count: overlayCount }) : t('map:mapLayers.button')}</span>
      </button>

      {open && pos &&
        createPortal(
          <>
            {/* click-away */}
            <div className="fixed inset-0 z-[2000]" onClick={() => setOpen(false)} />
            <div
              className="fixed z-[2001] rounded-lg bg-surface-solid border border-subtle shadow-xl overflow-hidden flex flex-col"
              style={{ top: pos.top, left: pos.left, width: MENU_WIDTH, maxHeight: pos.maxHeight }}
            >
              <div className="overflow-y-auto">
                <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary border-b border-subtle">{t('map:mapLayers.baseMap')}</div>
                {/* space-y keeps adjacent selected rows from merging into one slab */}
                <div className="p-1 space-y-0.5">
                  {baseLayers.map((key) => (
                    <button key={key} type="button" onClick={() => onSelectLayer(key)} className={row(activeLayer === key)}>
                      <LayerIcon layerKey={key} />
                      {mapLayerName(key)}
                    </button>
                  ))}
                </div>

                <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary border-y border-subtle">{t('map:mapLayers.overlays')}</div>
                <div className="p-1 space-y-0.5">
                  {OVERLAYS.map(({ id, labelKey, icon }) => {
                    if (id === 'dipul' && !dipulAvailable) return null;
                    return (
                      <button key={id} type="button" onClick={() => toggleOverlay(id)} className={row(activeOverlays.has(id))}>
                        {icon}
                        {t(labelKey)}
                      </button>
                    );
                  })}
                  {onToggleTerrain && (
                    <button type="button" onClick={onToggleTerrain} className={row(!!showTerrain)}>
                      <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-4 3 3 4-6 7 7" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h18" />
                      </svg>
                      {t('map:mapLayers.height')}
                    </button>
                  )}
                </div>

                <ModuleLayerToggles row={row} />

                {extra && <div className="p-1 border-t border-subtle">{extra}</div>}
              </div>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

/**
 * Layers contributed by installed cargos. Hidden entirely when none are
 * registered, so the control does not grow an empty section for most pilots.
 */
function ModuleLayerToggles({ row }: { row: (on: boolean) => string }): JSX.Element | null {
  const { t } = useTranslation();
  const { layers, isVisible, toggle } = useModuleMapLayerToggles();
  if (layers.length === 0) return null;
  return (
    <>
      <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary border-y border-subtle">
        {t('map:mapLayers.modules')}
      </div>
      <div className="p-1 space-y-0.5">
        {layers.map((l) => (
          <button key={l.key} type="button" onClick={() => toggle(l.key)} className={row(isVisible(l.key))}>
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            {l.reg.name}
          </button>
        ))}
      </div>
    </>
  );
}
