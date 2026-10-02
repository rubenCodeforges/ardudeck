/**
 * AreaEditorLayers — floating base-layer + overlay control for the editor map.
 * Mirrors the main app's layer switcher: pick a base imagery layer and toggle
 * data overlays (Aviation = OpenAIP, Zones = DIPUL). Reads/writes
 * area-editor-layers-store; the map reacts via that store's subscriptions.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAreaEditorLayersStore,
  AREA_EDITOR_BASE_LAYERS,
  AREA_EDITOR_OVERLAYS,
  type AreaEditorOverlayId,
} from './area-editor-layers-store';
import { LayerIcon } from '../components/map/LayerIcon';
import { mapLayerName } from '../../shared/map-layers';

// Overlay glyphs mirror the main map's overlay set (see components/map/overlays/
// OverlayToggles) so the two layer menus read identically: Aviation = OpenAIP,
// Zones = airspace, Wind = the wind streamlines icon.
const OVERLAY_ICONS: Record<AreaEditorOverlayId, JSX.Element> = {
  aviation: (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
    </svg>
  ),
  zones: (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503-8.697l4.997-2.56v10.014l-4.997 2.56M9 6.75L4.003 4.19v10.014L9 16.764m0-10.014L14.503 4.19M9 6.75v10.014m5.503-12.574L9 6.75" />
    </svg>
  ),
  wind: (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8h11a2.5 2.5 0 10-2.5-2.5M3 16h15a2.5 2.5 0 11-2.5 2.5M3 12h17a2.5 2.5 0 10-2.5-2.5" />
    </svg>
  ),
  traffic: (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V9m0 0l8 5V7.5a.75.75 0 00-1.1-.66L12 9zm0 0L5.1 6.84A.75.75 0 004 7.5V14l8-5z" />
    </svg>
  ),
  gliders: (
    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 11l9 1.5L21 11M12 12.5V17m0 0l-2.5 2m2.5-2l2.5 2" />
    </svg>
  ),
};

export function AreaEditorLayers(): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const baseLayer = useAreaEditorLayersStore((s) => s.baseLayer);
  const overlays = useAreaEditorLayersStore((s) => s.overlays);
  const setBaseLayer = useAreaEditorLayersStore((s) => s.setBaseLayer);
  const toggleOverlay = useAreaEditorLayersStore((s) => s.toggleOverlay);

  const activeCount = Object.values(overlays).filter(Boolean).length;

  return (
    <div className="absolute top-3 right-3 z-[1000] select-none">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-tip={t('area-editor:areaEditorLayers.tip')}
        className="h-8 px-2.5 inline-flex items-center gap-2 rounded-md bg-surface-solid border border-subtle text-content-secondary hover:text-content shadow-lg transition-colors"
      >
        <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l9 5-9 5-9-5 9-5z" />
          <path d="M3 12l9 5 9-5M3 17l9 5 9-5" />
        </svg>
        <span className="text-xs font-medium">{activeCount > 0 ? t('area-editor:areaEditorLayers.layersCount', { count: activeCount }) : t('area-editor:areaEditorLayers.layers')}</span>
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-[1000]" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-1.5 w-52 z-[1001] rounded-lg bg-surface-solid border border-subtle shadow-xl overflow-hidden">
            <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary border-b border-subtle">
              {t('area-editor:areaEditorLayers.baseMap')}
            </div>
            <div className="p-1">
              {AREA_EDITOR_BASE_LAYERS.map(({ key }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBaseLayer(key)}
                  className={
                    'w-full flex items-center gap-2 text-left px-2.5 py-1.5 rounded text-xs transition-colors ' +
                    (baseLayer === key
                      ? 'bg-blue-600 text-white'
                      : 'text-content-secondary hover:bg-surface-raised hover:text-content')
                  }
                >
                  <LayerIcon layerKey={key} />
                  {mapLayerName(key)}
                </button>
              ))}
            </div>

            <div className="px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary border-y border-subtle">
              {t('area-editor:areaEditorLayers.overlays')}
            </div>
            <div className="p-1">
              {AREA_EDITOR_OVERLAYS.map(({ id, labelKey, hintKey }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggleOverlay(id)}
                  data-tip={t(hintKey)}
                  className={
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs transition-colors ' +
                    (overlays[id]
                      ? 'bg-blue-600 text-white'
                      : 'text-content-secondary hover:bg-surface-raised hover:text-content')
                  }
                >
                  {OVERLAY_ICONS[id]}
                  {t(labelKey)}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
