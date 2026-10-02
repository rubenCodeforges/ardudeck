/**
 * Boundary guides on the mission map: imported polygons rendered as dashed
 * reference outlines. Clicking one opens a small popup to start a survey
 * from it (loads the survey draft; nothing is committed) or hide it. The
 * survey itself then uses whichever engine the panel has selected.
 */
import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { Marker, Polygon, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useGuideStore } from '../../stores/guide-store';

// Numbered survey-point marker in the guide's colour, white halo for
// legibility on any basemap.
function pointIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'guide-point-marker',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:50%;background:${color};border:2px solid #ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.5);color:#fff;font-size:9px;font-weight:700;font-family:ui-monospace,monospace;">${label}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

// Pans/zooms to a guide when the store's focus trigger bumps (same
// trigger-counter pattern as the mission FitToBounds handler).
function GuideFocusHandler() {
  const map = useMap();
  const focusSeq = useGuideStore((s) => s.focusSeq);
  const focusBounds = useGuideStore((s) => s.focusBounds);
  const lastSeqRef = useRef(0);

  useEffect(() => {
    if (focusSeq === lastSeqRef.current || !focusBounds) return;
    lastSeqRef.current = focusSeq;
    map.fitBounds(focusBounds, { padding: [60, 60], maxZoom: 17 });
  }, [focusSeq, focusBounds, map]);

  return null;
}

export function GuidesOverlay() {
  const { t } = useTranslation();
  const guides = useGuideStore((s) => s.guides);
  const toggleGuide = useGuideStore((s) => s.toggleGuide);
  const startSurveyFromGuide = useGuideStore((s) => s.startSurveyFromGuide);

  const visible = guides.filter(
    (g) => g.visible && g.kind !== 'points' && g.kind !== 'line' && g.polygon.length >= 3,
  );
  const pointSets = guides.filter((g) => g.visible && g.kind === 'points' && g.polygon.length > 0);
  const lines = guides.filter((g) => g.visible && g.kind === 'line' && g.polygon.length >= 2);

  return (
    <>
      <GuideFocusHandler />
      {pointSets.map((g) =>
        g.polygon.map((p, i) => {
          // Long labels don't fit the 20px badge - number there, label in popup.
          const lbl = g.pointLabels?.[i];
          const badge = lbl && lbl.length <= 3 ? lbl : String(i + 1);
          return (
          <Marker
            key={`${g.id}-${i}`}
            position={[p.lat, p.lng]}
            icon={pointIcon(g.color, badge)}
          >
            <Popup>
              <div className="space-y-1 min-w-[10rem]">
                <div className="text-xs font-medium">
                  {g.name} · {g.pointLabels?.[i] ?? t('mission:guidesOverlay.pointN', { n: i + 1 })}
                </div>
                <div className="text-[10px] font-mono text-gray-500">
                  {p.lat.toFixed(7)}, {p.lng.toFixed(7)}
                </div>
                <button
                  onClick={() => toggleGuide(g.id)}
                  className="w-full px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
                >
                  {t('mission:guidesOverlay.hidePointSet')}
                </button>
              </div>
            </Popup>
          </Marker>
          );
        }),
      )}
      {lines.map((g) => (
        <Polyline
          key={g.id}
          positions={g.polygon.map((p) => [p.lat, p.lng] as [number, number])}
          pathOptions={{ color: g.color, weight: 3, dashArray: '10, 6', opacity: 0.85 }}
        >
          <Popup>
            <div className="space-y-1.5 min-w-[10rem]">
              <div className="text-xs font-medium">{g.name}</div>
              <div className="text-[10px] text-gray-500">
                {t('mission:guidesOverlay.referenceLine', { count: g.polygon.length })}
              </div>
              <button
                onClick={() => startSurveyFromGuide(g.id)}
                className="w-full px-2 py-1 rounded text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors"
              >
                {t('mission:guidesOverlay.corridorSurvey')}
              </button>
              <button
                onClick={() => toggleGuide(g.id)}
                className="w-full px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
              >
                {t('mission:guidesOverlay.hideLine')}
              </button>
            </div>
          </Popup>
        </Polyline>
      ))}
      {visible.map((g) => {
        const positions = [
          g.polygon.map((p) => [p.lat, p.lng] as [number, number]),
          ...g.holes
            .filter((h) => h.length >= 3)
            .map((h) => h.map((p) => [p.lat, p.lng] as [number, number])),
        ];
        return (
          <Polygon
            key={g.id}
            positions={positions}
            pathOptions={{
              color: g.color,
              weight: 2,
              dashArray: '6, 8',
              opacity: 0.8,
              fillColor: g.color,
              fillOpacity: 0.04,
            }}
          >
            <Popup>
              <div className="space-y-1.5 min-w-[10rem]">
                <div className="text-xs font-medium">{g.name}</div>
                <button
                  onClick={() => startSurveyFromGuide(g.id)}
                  className="w-full px-2 py-1 rounded text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white transition-colors"
                >
                  {t('mission:guidesOverlay.planSurveyHere')}
                </button>
                <button
                  onClick={() => toggleGuide(g.id)}
                  className="w-full px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
                >
                  {t('mission:guidesOverlay.hideGuide')}
                </button>
              </div>
            </Popup>
          </Polygon>
        );
      })}
    </>
  );
}
