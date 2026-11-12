/**
 * Fleet radar - a compact overview of the whole fleet, shown as the Fleet radar map instrument.
 * Every vehicle is an identity-coloured blip (active = cyan ring, leader = amber ring);
 * the dashed rectangle is the main map's current viewport. Click a blip to command that
 * vehicle. Self-gates to 2+ vehicles.
 */

import { useFleetVehicles, selectActiveVehicle, type FleetVehicle } from '../../hooks/useFleet';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useFormationStore } from '../../stores/formation-store';
import { useVehicleColor } from '../../stores/vehicle-appearance-store';
import { useTelemMapBoundsStore } from '../../stores/telem-map-bounds-store';

const SIZE = 148;
const PAD = 14;

function MinimapBlip({ v, x, y, isActive, isLeader }: { v: FleetVehicle; x: number; y: number; isActive: boolean; isLeader: boolean }) {
  const color = useVehicleColor(v.key, v.sysid);
  return (
    <g
      className="cursor-pointer"
      onClick={(e) => { e.stopPropagation(); selectActiveVehicle(v.key, v.transportId); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); useFormationStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, vehicleKey: v.key }); }}
      data-tip={`${v.label} - ${v.mode}`}
    >
      <circle cx={x} cy={y} r={8} fill="transparent" />
      {isLeader && <circle cx={x} cy={y} r={6.5} fill="none" stroke="#f59e0b" strokeWidth={1.4} />}
      {isActive && <circle cx={x} cy={y} r={6.5} fill="none" stroke="#06b6d4" strokeWidth={1.6} />}
      <circle cx={x} cy={y} r={3.2} fill={color} stroke="var(--bg-surface, rgba(0,0,0,0.4))" strokeWidth={1} />
    </g>
  );
}

export function FleetRadar(): JSX.Element | null {
  const vehicles = useFleetVehicles();
  const activeKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const formations = useActiveVehicleStore((s) => s.formations);
  const mapBounds = useTelemMapBoundsStore((s) => s.bounds);

  if (vehicles.length < 2) return null;

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

  return (
    <div className="p-1.5 flex justify-center">
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
          return <MinimapBlip key={v.key} v={v} x={p.x} y={p.y} isActive={v.key === activeKey} isLeader={v.key in formations} />;
        })}
      </svg>
    </div>
  );
}
