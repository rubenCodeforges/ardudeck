/**
 * Boundary guides on the mission map: imported polygons rendered as dashed
 * reference outlines. Clicking one opens a small popup to start a survey
 * from it (loads the survey draft; nothing is committed) or hide it. The
 * survey itself then uses whichever engine the panel has selected.
 */
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useRef } from 'react';
import { CircleMarker, Marker, Polygon, Polyline, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useGuideStore, type MapGuide } from '../../stores/guide-store';
import { useMissionStore } from '../../stores/mission-store';

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// A small dark chip just above its anchor, so a name never covers the middle of a shape or the flight lines.
function chipIcon(name: string, color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div style="transform:translate(-50%,calc(-100% - 6px));display:inline-flex;align-items:center;gap:5px;white-space:nowrap;padding:2px 7px 2px 6px;border-radius:6px;background:rgba(15,23,42,.82);color:#f8fafc;font:600 11px/16px system-ui,sans-serif;box-shadow:0 1px 3px rgba(0,0,0,.35);pointer-events:none"><span style="width:7px;height:7px;border-radius:9999px;background:${color}"></span>${escapeHtml(name)}</div>`,
  });
}

function labelAnchor(g: MapGuide): [number, number] | null {
  if (g.polygon.length === 0) return null;
  if (g.kind === 'line') {
    const m = g.polygon[Math.floor(g.polygon.length / 2)]!;
    return [m.lat, m.lng];
  }
  const top = g.polygon.reduce((best, p) => (p.lat > best.lat ? p : best), g.polygon[0]!);
  return [top.lat, top.lng];
}

function GuideLabel({ guide }: { guide: MapGuide }) {
  const anchor = labelAnchor(guide);
  const icon = useMemo(() => chipIcon(guide.name, guide.color), [guide.name, guide.color]);
  if (!anchor) return null;
  return <Marker position={anchor} icon={icon} interactive={false} keyboard={false} />;
}

/** Plain areas and notes are reference outlines; the rest are filled so they read as what they are. */
function polygonStyle(g: MapGuide): L.PathOptions {
  const outlineOnly = !g.role || g.role === 'area' || g.role === 'note';
  return {
    color: g.color,
    weight: outlineOnly ? 1.5 : 2.5,
    dashArray: outlineOnly ? '5, 6' : undefined,
    opacity: 0.95,
    fillColor: g.color,
    fillOpacity: outlineOnly ? 0.03 : g.role === 'nofly' ? 0.22 : 0.14,
  };
}
import { useCoordinateFormat } from '../../utils/coordinate-format';

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
  const { format: formatPos } = useCoordinateFormat();
  const guides = useGuideStore((s) => s.guides);
  const showLabels = useGuideStore((s) => s.showLabels);
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
          // Many points (soil samples, a grid of checkpoints) read better as small dots with a hover label.
          if (g.role === 'poi' || g.role === 'takeoff' || g.polygon.length > 30) {
            const label = g.pointLabels?.[i] ?? t('mission:guidesOverlay.pointN', { n: i + 1 });
            return (
              <CircleMarker
                key={`${g.id}-${i}`}
                center={[p.lat, p.lng]}
                radius={g.role === 'takeoff' ? 6 : 3.5}
                pathOptions={{ color: '#0f172a', weight: 1, opacity: 0.9, fillColor: g.color, fillOpacity: 1 }}
              >
                <Tooltip direction="top">{`${g.name}: ${label}`}</Tooltip>
                <Popup>
                  <div className="space-y-1 min-w-[10rem]">
                    <div className="text-xs font-medium">{g.name} · {label}</div>
                    <div className="text-[10px] font-mono text-gray-500">{formatPos(p.lat, p.lng)}</div>
                    <button
                      onClick={() => useMissionStore.getState().setHomePosition(p.lat, p.lng)}
                      className="w-full px-2 py-1 rounded text-xs bg-gray-200 hover:bg-gray-300 text-gray-700 transition-colors"
                    >
                      {t('mission:guidesOverlay.setHomeHere')}
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          }
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
                  {formatPos(p.lat, p.lng)}
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
          pathOptions={{ color: g.color, weight: 3, dashArray: g.role && g.role !== 'area' ? undefined : '10, 6', opacity: 0.9 }}
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
            pathOptions={polygonStyle(g)}
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
      {showLabels && [...visible, ...lines].map((g) => <GuideLabel key={`label-${g.id}`} guide={g} />)}
    </>
  );
}
