/**
 * Fleet minimap - a draggable, semi-transparent radar overview that floats above the
 * telemetry view, so the whole fleet stays in sight no matter which panel (Map, Vision,
 * Battery...) is in front. Every vehicle is an identity-coloured blip (active = cyan ring,
 * leader = amber ring); the dashed rectangle is the main map's current viewport. Click a
 * blip to command that vehicle. Drag the header to move it; on drop it snaps to the
 * nearest screen edge and the position is remembered.
 *
 * Mounted once at the app root (App.tsx); self-gates to the telemetry view + 2+ vehicles.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFleetVehicles, selectActiveVehicle, type FleetVehicle } from '../../hooks/useFleet';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useVehicleColor } from '../../stores/vehicle-appearance-store';
import { useTelemMapBoundsStore } from '../../stores/telem-map-bounds-store';
import { useMinimapStore } from '../../stores/minimap-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useDraggableSnap } from '../../hooks/useDraggableSnap';

const SIZE = 148;
const PAD = 14;
const MARGIN = 12;

function MinimapBlip({ v, x, y, isActive, isLeader }: { v: FleetVehicle; x: number; y: number; isActive: boolean; isLeader: boolean }) {
  const color = useVehicleColor(v.key, v.sysid);
  return (
    <g
      className="cursor-pointer"
      onClick={(e) => { e.stopPropagation(); selectActiveVehicle(v.key, v.transportId); }}
      data-tip={`${v.label} - ${v.mode}`}
    >
      <circle cx={x} cy={y} r={8} fill="transparent" />
      {isLeader && <circle cx={x} cy={y} r={6.5} fill="none" stroke="#f59e0b" strokeWidth={1.4} />}
      {isActive && <circle cx={x} cy={y} r={6.5} fill="none" stroke="#06b6d4" strokeWidth={1.6} />}
      <circle cx={x} cy={y} r={3.2} fill={color} stroke="var(--bg-surface, rgba(0,0,0,0.4))" strokeWidth={1} />
    </g>
  );
}

export function FleetMinimap(): JSX.Element | null {
  const vehicles = useFleetVehicles();
  const activeKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const leaderKey = useActiveVehicleStore((s) => s.formationLeaderKey);
  const mapBounds = useTelemMapBoundsStore((s) => s.bounds);
  const currentView = useNavigationStore((s) => s.currentView);
  const x = useMinimapStore((s) => s.x);
  const y = useMinimapStore((s) => s.y);

  const panelRef = useRef<HTMLDivElement>(null);
  const setPos = useMinimapStore((s) => s.setPos);
  const persist = useMinimapStore((s) => s.persist);
  const { onHandlePointerDown } = useDraggableSnap(panelRef, { setPos, persist });

  // Default to lower-right on first show.
  useEffect(() => {
    if (x === null || y === null) {
      const w = panelRef.current?.offsetWidth ?? 160;
      const h = panelRef.current?.offsetHeight ?? 184;
      setPos(window.innerWidth - w - MARGIN, window.innerHeight - h - 80);
      persist();
    }
  }, [x, y, setPos, persist]);

  if (currentView !== 'telemetry' || vehicles.length < 2) return null;

  const positioned = vehicles.filter((v) => v.position);

  // Extent = every vehicle + the current viewport, so the rectangle always shows.
  const lats: number[] = [];
  const lons: number[] = [];
  positioned.forEach((v) => { lats.push(v.position![0]); lons.push(v.position![1]); });
  if (mapBounds) { lats.push(mapBounds.north, mapBounds.south); lons.push(mapBounds.east, mapBounds.west); }

  const latMid = lats.length ? (Math.min(...lats) + Math.max(...lats)) / 2 : 0;
  const lonMid = lons.length ? (Math.min(...lons) + Math.max(...lons)) / 2 : 0;
  const cosLat = Math.max(0.01, Math.cos((latMid * Math.PI) / 180));
  const spanLat = lats.length ? Math.max(...lats) - Math.min(...lats) : 1e-4;
  const spanLon = lons.length ? (Math.max(...lons) - Math.min(...lons)) * cosLat : 1e-4;
  const span = Math.max(Math.max(spanLat, spanLon, 1e-4) * 1.25, 5e-5);
  const inner = SIZE - 2 * PAD;

  const project = (lat: number, lon: number) => ({
    x: SIZE / 2 + (((lon - lonMid) * cosLat) / span) * inner,
    y: SIZE / 2 - ((lat - latMid) / span) * inner,
  });

  const nw = mapBounds ? project(mapBounds.north, mapBounds.west) : null;
  const se = mapBounds ? project(mapBounds.south, mapBounds.east) : null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[1400] p-1.5 rounded-lg select-none border border-subtle shadow-xl bg-surface-overlay-light backdrop-blur-md"
      style={{ left: x ?? -9999, top: y ?? -9999 }}
    >
      <div
        className="flex items-center justify-between px-1 pb-1 cursor-move"
        onPointerDown={onHandlePointerDown}
        data-tip="Drag to move - magnets to panel & window edges"
      >
        <div className="flex items-center gap-1.5">
          <svg width="9" height="11" viewBox="0 0 9 11" className="text-content-tertiary" aria-hidden="true">
            {[2, 5.5, 9].map((cy) => [2, 7].map((cx) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1" fill="currentColor" />))}
          </svg>
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-content-secondary">Fleet</span>
        </div>
        <span className="text-[9px] font-mono text-content-tertiary">{vehicles.length}</span>
      </div>

      <svg width={SIZE} height={SIZE} className="rounded">
        {[0.5, 0.32, 0.16].map((f) => (
          <circle key={f} cx={SIZE / 2} cy={SIZE / 2} r={inner * f} fill="none" stroke="rgba(120,170,200,0.18)" strokeWidth={1} />
        ))}
        <line x1={PAD} y1={SIZE / 2} x2={SIZE - PAD} y2={SIZE / 2} stroke="rgba(120,170,200,0.12)" strokeWidth={1} />
        <line x1={SIZE / 2} y1={PAD} x2={SIZE / 2} y2={SIZE - PAD} stroke="rgba(120,170,200,0.12)" strokeWidth={1} />

        {nw && se && (
          <rect
            x={Math.min(nw.x, se.x)} y={Math.min(nw.y, se.y)}
            width={Math.abs(se.x - nw.x)} height={Math.abs(se.y - nw.y)}
            fill="rgba(6,182,212,0.08)" stroke="rgba(6,182,212,0.6)" strokeWidth={1} strokeDasharray="3 2"
          />
        )}

        {positioned.map((v) => {
          const p = project(v.position![0], v.position![1]);
          return <MinimapBlip key={v.key} v={v} x={p.x} y={p.y} isActive={v.key === activeKey} isLeader={v.key === leaderKey} />;
        })}
      </svg>
    </div>,
    document.body,
  );
}
