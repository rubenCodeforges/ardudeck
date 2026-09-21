/**
 * ObjectsPanel — the editor's object list (Adobe/Figma-style layers panel).
 * Select, rename (double-click), reorder, show/hide, delete; and convert a
 * parametric rectangle/circle to a free polygon for vertex editing.
 */

import { useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useObjectsStore } from './objects-store';
import { colorForIndex } from './objects-geo';
import { isVertexEditable, objectWorldRing, type EditorObjectType } from './area-object';
import { GROUP_COLOR_PALETTE } from '../../shared/mission-group-types';
import { parseFenceItems, buildFenceItems, type PolygonFence, type CircleFence } from '../../shared/fence-types';

const TYPE_LABEL: Record<EditorObjectType, string> = {
  polygon: 'Area', corridor: 'Corridor', rectangle: 'Rectangle', circle: 'Circle',
};

const svg = {
  className: 'w-3.5 h-3.5', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
  strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

export function ObjectsPanel(): JSX.Element {
  const objects = useObjectsStore((s) => s.objects);
  const selectedId = useObjectsStore((s) => s.selectedId);
  const {
    selectObject, renameObject, deleteObject, toggleVisible, reorderObject, convertSelectedToPolygon, setObjectColor, setObjectFenceType, setObjectRole, removeBranch, loadWorldRings, focusObject,
  } = useObjectsStore.getState();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [colorId, setColorId] = useState<string | null>(null);
  const [colorPos, setColorPos] = useState<{ top: number; left: number } | null>(null);
  const [fenceStatus, setFenceStatus] = useState<string | null>(null);

  const commitRename = (): void => {
    if (editingId && draft.trim()) renameObject(editingId, draft.trim());
    setEditingId(null);
  };

  const flashFence = useCallback((msg: string) => {
    setFenceStatus(msg);
    setTimeout(() => setFenceStatus((s) => (s === msg ? null : s)), 3000);
  }, []);

  // Pull fences from the FC and load them as editable inclusion/exclusion objects.
  const downloadFences = useCallback(() => {
    const off = window.electronAPI?.onFenceComplete?.((items) => {
      off?.();
      const { polygons, circles } = parseFenceItems(items);
      const rings = [
        ...polygons.map((p) => ({ ring: p.vertices.map((v) => ({ lat: v.lat, lng: v.lon })), type: 'polygon' as const, fenceType: p.type })),
        // Render circle fences as polygon rings (editable); they re-upload as polygons.
        ...circles.map((c) => {
          const ring: Array<{ lat: number; lng: number }> = [];
          const mPerDegLat = 111320;
          const mPerDegLon = 111320 * Math.cos((c.center.lat * Math.PI) / 180);
          for (let i = 0; i < 48; i++) {
            const a = (2 * Math.PI * i) / 48;
            ring.push({ lat: c.center.lat + (c.radius * Math.sin(a)) / mPerDegLat, lng: c.center.lon + (c.radius * Math.cos(a)) / mPerDegLon });
          }
          return { ring, type: 'polygon' as const, fenceType: c.type };
        }),
      ];
      if (rings.length === 0) { flashFence('No fences on FC'); return; }
      loadWorldRings(rings);
      flashFence(`Loaded ${rings.length} fence${rings.length === 1 ? '' : 's'} from FC`);
    });
    void window.electronAPI?.downloadFence?.();
  }, [loadWorldRings, flashFence]);

  // Push every fence-tagged object to the FC as inclusion/exclusion fences.
  const uploadFences = useCallback(async () => {
    const fenceObjs = useObjectsStore.getState().objects.filter((o) => o.fenceType);
    if (fenceObjs.length === 0) { flashFence('Tag objects as fences first'); return; }
    const polygons: PolygonFence[] = [];
    const circles: CircleFence[] = [];
    for (const o of fenceObjs) {
      if (o.type === 'circle') {
        const radius = Math.hypot(o.base[0]?.x ?? 0, o.base[0]?.y ?? 0);
        circles.push({ id: o.id, type: o.fenceType!, center: { lat: o.center.lat, lon: o.center.lng }, radius: Math.max(1, radius), seq: 0 });
      } else {
        const ring = objectWorldRing(o);
        if (ring.length < 3) continue;
        polygons.push({ id: o.id, type: o.fenceType!, vertices: ring.map((p, idx) => ({ seq: idx, lat: p.lat, lon: p.lng })) });
      }
    }
    const items = buildFenceItems(polygons, circles, null);
    const res = await window.electronAPI?.uploadFence?.(items);
    flashFence(res?.success ? `Uploaded ${fenceObjs.length} fence${fenceObjs.length === 1 ? '' : 's'}` : (res?.error ?? 'Upload failed'));
  }, [flashFence]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-4 py-3 border-b border-subtle flex items-center justify-between">
        <p className="text-xs font-semibold text-content">Objects</p>
        <span className="text-xs text-content-tertiary tabular-nums">{objects.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {objects.length === 0 ? (
          <p className="text-xs text-content-tertiary px-4 py-2">No objects yet. Pick a tool and draw.</p>
        ) : (
          objects.map((o, i) => {
            const active = o.id === selectedId;
            const branchCount = o.type === 'corridor' ? (o.branches?.length ?? 0) : 0;
            return (
              <div key={o.id}>
              <div
                onClick={() => selectObject(o.id)}
                className={
                  'group flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors ' +
                  (active ? 'bg-blue-600/15' : 'hover:bg-surface-raised')
                }
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleVisible(o.id); }}
                  data-tip={o.visible ? 'Hide' : 'Show'}
                  className="text-content-tertiary hover:text-content"
                >
                  {o.visible ? (
                    <svg {...svg}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                  ) : (
                    <svg {...svg}><path d="M3 3l18 18M10.6 5.1A10.8 10.8 0 0112 5c6.5 0 10 7 10 7a17 17 0 01-3.2 4M6.6 6.6A17 17 0 002 12s3.5 7 10 7a10.8 10.8 0 004.1-.8" /></svg>
                  )}
                </button>

                <button
                  type="button"
                  data-tip="Change color"
                  aria-label="Object color"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (colorId === o.id) { setColorId(null); return; }
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setColorPos({ top: r.bottom + 4, left: r.left });
                    setColorId(o.id);
                  }}
                  className="w-3 h-3 rounded-sm flex-shrink-0 border border-white/25"
                  style={{ background: o.color ?? colorForIndex(i) }}
                />

                {editingId === o.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 h-6 px-1.5 rounded bg-surface-input border border-subtle text-xs text-content"
                  />
                ) : (
                  <div
                    className="flex-1 min-w-0"
                    onDoubleClick={(e) => { e.stopPropagation(); setEditingId(o.id); setDraft(o.name); }}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="text-xs text-content truncate">{o.name}</div>
                      {o.fenceType && (
                        <span
                          className="text-[9px] font-bold px-1 rounded leading-tight"
                          style={{ background: o.fenceType === 'inclusion' ? '#22c55e' : '#ef4444', color: '#0a0a0a' }}
                        >
                          {o.fenceType === 'inclusion' ? 'INC' : 'EXC'}
                        </span>
                      )}
                      {o.role === 'workspace' && (
                        <span
                          className="text-[9px] font-bold px-1 rounded leading-tight"
                          style={{ background: '#38bdf8', color: '#0a0a0a' }}
                          data-tip="Workspace - allowed flight area attached to every sent survey"
                        >
                          WS
                        </span>
                      )}
                      {o.role === 'guide' && (
                        <span
                          className="text-[9px] font-bold px-1 rounded leading-tight"
                          style={{ background: '#c084fc', color: '#0a0a0a' }}
                          data-tip="Guide - sent to the mission map as a reference outline, no waypoints generated"
                        >
                          GD
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-content-tertiary">
                      {TYPE_LABEL[o.type]}
                      {branchCount > 0 && ` · ${branchCount} branch${branchCount > 1 ? 'es' : ''}`}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" data-tip="Zoom the map to this object"
                    onClick={(e) => { e.stopPropagation(); focusObject(o.id); }}
                    className="text-content-tertiary hover:text-content">
                    <svg {...svg}><circle cx="12" cy="12" r="7" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
                  </button>
                  <button type="button" data-tip="Move up" disabled={i === 0}
                    onClick={(e) => { e.stopPropagation(); reorderObject(o.id, -1); }}
                    className="text-content-tertiary hover:text-content disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg {...svg}><path d="M18 15l-6-6-6 6" /></svg>
                  </button>
                  <button type="button" data-tip="Move down" disabled={i === objects.length - 1}
                    onClick={(e) => { e.stopPropagation(); reorderObject(o.id, 1); }}
                    className="text-content-tertiary hover:text-content disabled:opacity-30 disabled:cursor-not-allowed">
                    <svg {...svg}><path d="M6 9l6 6 6-6" /></svg>
                  </button>
                  <button type="button" data-tip="Delete"
                    onClick={(e) => { e.stopPropagation(); deleteObject(o.id); }}
                    className="text-content-tertiary hover:text-rose-400">
                    <svg {...svg}><path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M7 7l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" /></svg>
                  </button>
                </div>
              </div>

              {/* Branch children of a corridor — indented, with per-branch delete. */}
              {branchCount > 0 && o.branches!.map((_, bi) => (
                <div
                  key={`${o.id}-b${bi}`}
                  onClick={() => selectObject(o.id)}
                  className={
                    'group flex items-center gap-2 pl-9 pr-3 py-1 cursor-pointer transition-colors ' +
                    (active ? 'bg-blue-600/10' : 'hover:bg-surface-raised')
                  }
                >
                  <span className="text-content-tertiary"><svg {...svg} className="w-3 h-3"><path d="M7 4v7a4 4 0 004 4h6M17 11l4 4-4 4" /></svg></span>
                  <div className="flex-1 min-w-0 text-[11px] text-content-secondary truncate">Branch {bi + 1}</div>
                  <button type="button" data-tip="Delete branch"
                    onClick={(e) => { e.stopPropagation(); removeBranch(o.id, bi); }}
                    className="opacity-0 group-hover:opacity-100 text-content-tertiary hover:text-rose-400 transition-opacity">
                    <svg {...svg} className="w-3 h-3"><path d="M5 7h14M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M7 7l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" /></svg>
                  </button>
                </div>
              ))}
              </div>
            );
          })
        )}
      </div>

      {(() => {
        const sel = objects.find((o) => o.id === selectedId);
        const canFence = sel && sel.type !== 'corridor';
        return (
          <div className="flex-shrink-0 border-t border-subtle">
            {canFence && (
              <div className="px-3 py-2 space-y-1.5">
                <div className="text-[10px] font-medium text-content-tertiary uppercase tracking-wide">Geofence</div>
                <div className="flex gap-1">
                  {([
                    ['Area', null], ['Inclusion', 'inclusion'], ['Exclusion', 'exclusion'],
                  ] as Array<[string, 'inclusion' | 'exclusion' | null]>).map(([label, ft]) => {
                    const active = (sel!.fenceType ?? null) === ft;
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setObjectFenceType(sel!.id, ft)}
                        className={'flex-1 h-7 rounded-md text-[11px] font-medium transition-colors ' +
                          (active
                            ? ft === 'inclusion' ? 'bg-emerald-600 text-white'
                              : ft === 'exclusion' ? 'bg-red-600 text-white'
                                : 'bg-blue-600 text-white'
                            : 'bg-surface-raised text-content-secondary hover:text-content')}
                        data-tip={ft === 'inclusion' ? 'Keep-in zone' : ft === 'exclusion' ? 'Keep-out zone' : 'Not a fence'}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {canFence && (
              <div className="px-3 pb-2 space-y-1.5">
                <div className="text-[10px] font-medium text-content-tertiary uppercase tracking-wide">Role</div>
                <button
                  type="button"
                  onClick={() => setObjectRole(sel!.id, sel!.role === 'workspace' ? null : 'workspace')}
                  className={'w-full h-7 rounded-md text-[11px] font-medium transition-colors ' +
                    (sel!.role === 'workspace'
                      ? 'bg-sky-600 text-white'
                      : 'bg-surface-raised text-content-secondary hover:text-content')}
                  data-tip="Allowed flight area attached to every sent survey; only one object can be the workspace"
                >
                  {sel!.role === 'workspace' ? 'Workspace (click to clear)' : 'Mark as workspace'}
                </button>
                <button
                  type="button"
                  onClick={() => setObjectRole(sel!.id, sel!.role === 'guide' ? null : 'guide')}
                  className={'w-full h-7 rounded-md text-[11px] font-medium transition-colors ' +
                    (sel!.role === 'guide'
                      ? 'bg-purple-600 text-white'
                      : 'bg-surface-raised text-content-secondary hover:text-content')}
                  data-tip="Sent to the mission map as a reference outline; no waypoints are generated from it"
                >
                  {sel!.role === 'guide' ? 'Guide (click to clear)' : 'Mark as guide'}
                </button>
              </div>
            )}

            {sel && !isVertexEditable(sel) && (
              <div className="px-3 pb-2">
                <button
                  type="button"
                  onClick={() => convertSelectedToPolygon()}
                  className="w-full h-7 rounded-md text-xs font-medium bg-surface-raised text-content hover:brightness-125 transition-colors"
                  data-tip="Convert this shape to a free polygon so you can edit its points"
                >
                  Convert to polygon
                </button>
              </div>
            )}

            <div className="px-3 py-2 border-t border-subtle space-y-1.5">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={downloadFences}
                  className="flex-1 h-7 rounded-md text-[11px] font-medium bg-surface-raised text-content-secondary hover:text-content transition-colors"
                  data-tip="Download geofences from the flight controller as editable objects"
                >
                  ↓ Fences from FC
                </button>
                <button
                  type="button"
                  onClick={() => void uploadFences()}
                  className="flex-1 h-7 rounded-md text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                  data-tip="Upload all inclusion/exclusion objects to the flight controller"
                >
                  ↑ Fences to FC
                </button>
              </div>
              {fenceStatus && <div className="text-[11px] text-content-secondary text-center">{fenceStatus}</div>}
            </div>
          </div>
        );
      })()}

      {colorId && colorPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setColorId(null)} />
            <div
              className="fixed z-[9999] p-1.5 bg-surface-solid border border-subtle rounded-lg shadow-2xl grid grid-cols-4 gap-1"
              style={{ top: colorPos.top, left: colorPos.left }}
            >
              {GROUP_COLOR_PALETTE.map((c) => {
                const current = objects.find((o) => o.id === colorId);
                const active = (current?.color ?? colorForIndex(objects.findIndex((o) => o.id === colorId))) === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => { setObjectColor(colorId, c); setColorId(null); }}
                    className={'w-5 h-5 rounded transition-transform hover:scale-110 ' + (active ? 'ring-2 ring-white' : '')}
                    style={{ background: c }}
                    aria-label={`Set color ${c}`}
                  />
                );
              })}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
