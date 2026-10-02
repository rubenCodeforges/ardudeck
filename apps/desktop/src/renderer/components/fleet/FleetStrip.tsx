/**
 * Fleet strip - a collapsible tactical rail of vehicle rows on the left edge of the
 * telemetry view. Shows every connected vehicle (registry + live telemetry), lets the
 * operator pick the active vehicle (click a row), multi-select for group commands (a
 * checkbox that surfaces on hover), and right-click a row for formation orders. Dense and
 * low-chrome - a command console, not a web form - and follows the app's light/dark
 * theme. Renders nothing for a single vehicle.
 */

import { useTranslation } from 'react-i18next';
import { useState, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFleetVehicles, selectActiveVehicle, deselectActiveVehicle, type FleetVehicle } from '../../hooks/useFleet';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useVehicleColor, useVehicleAppearanceStore, VEHICLE_COLOR_PALETTE } from '../../stores/vehicle-appearance-store';
import { useTelemMissionViewStore } from '../../stores/telem-mission-view-store';
import { STATE_COLORS, getModeCategoryVar } from '../map/tactical-icon-pool';
import { AirframeIcon, airframeLabel } from '../map/airframe-icon';
import { FleetContextMenu } from './FleetContextMenu';
import { useFormationStore } from '../../stores/formation-store';
import { useFleetUiStore, isFleetExpanded } from '../../stores/fleet-ui-store';
import { useFormationControl } from '../../hooks/useFormationControl';
import { FleetChevron, FleetCountHeader } from './FleetDisclosure';
import { startVehicleDrag, readVehicleDrag, allowVehicleDrop, FREE_ZONE } from './fleet-dnd';
import { HeartbeatDot } from './HeartbeatDot';
import { TAC_GLASS } from './tactical';

function BatteryPip({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-content-tertiary text-[9px] font-mono">--</span>;
  // Darker shades stay legible on a light card AND visible on a dark one.
  const color = pct < 20 ? '#dc2626' : pct < 40 ? '#d97706' : '#16a34a';
  return (
    <div className="flex items-center gap-1">
      <div className="w-6 h-1 rounded-full overflow-hidden bg-surface-inset">
        <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      </div>
      <span className="font-mono text-[10px] font-semibold" style={{ color }}>{Math.round(pct)}</span>
    </div>
  );
}

/** Indented container for a formation's wingmen. The rail carries the LEADER's
    identity colour so each wingman block is visually tied to its leader - the
    old hairline border-subtle rail was invisible against the nav background. */
function WingmenRail({ leaderKey, leaderSysid, children }: { leaderKey: string; leaderSysid: number; children: ReactNode }) {
  const leaderColor = useVehicleColor(leaderKey, leaderSysid);
  return (
    <div className="ml-4 pl-2 border-l-2 flex flex-col gap-1" style={{ borderColor: leaderColor }}>
      {children}
    </div>
  );
}

function FleetCard({ v, role, count = 0 }: { v: FleetVehicle; role?: 'leader' | 'wingman'; count?: number }) {
  const { t } = useTranslation();
  const toggleSelected = useActiveVehicleStore((s) => s.toggleSelected);
  const openContextMenu = useFormationStore((s) => s.openContextMenu);
  const setColor = useVehicleAppearanceStore((s) => s.setColor);
  const identityColor = useVehicleColor(v.key, v.sysid);
  const stateColor = STATE_COLORS[v.state];
  const [swatchOpen, setSwatchOpen] = useState(false);
  const [swatchPos, setSwatchPos] = useState<{ top: number; left: number } | null>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      draggable
      onDragStart={(e) => { e.stopPropagation(); startVehicleDrag(e, v.key); }}
      onClick={() => (v.isActive ? deselectActiveVehicle() : selectActiveVehicle(v.key, v.transportId))}
      onContextMenu={(e) => { e.preventDefault(); openContextMenu({ x: e.clientX, y: e.clientY, vehicleKey: v.key }); }}
      className={`group relative flex items-center gap-2 cursor-grab active:cursor-grabbing rounded border pl-2 pr-1.5 py-1 transition-colors ${
        v.isActive ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-subtle bg-surface hover:bg-surface-raised'
      }`}
      data-tip={v.isActive ? t('fleet:fleetStrip.deselectTip', { label: v.label }) : t(v.armed ? 'fleet:fleetStrip.vehicleTipArmed' : 'fleet:fleetStrip.vehicleTip', { label: v.label, mode: v.mode })}
    >
      {/* Identity colour bar - matches this vehicle's map marker + its waypoints */}
      <span className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full" style={{ background: identityColor }} />

      {/* Airframe pictogram tinted with identity colour; ring shows STATE (gold = leader).
          Click opens the identity-colour palette. */}
      <button
        ref={swatchRef}
        onClick={(e) => {
          e.stopPropagation();
          const r = swatchRef.current?.getBoundingClientRect();
          if (r) setSwatchPos({ top: r.bottom + 4, left: r.left });
          setSwatchOpen((o) => !o);
        }}
        className={`relative shrink-0 grid place-items-center rounded ${role === 'wingman' ? 'w-5 h-5' : 'w-6 h-6'}`}
        style={{
          color: identityColor,
          background: 'var(--bg-inset)',
          boxShadow: `0 0 0 1.5px ${role === 'leader' ? '#f59e0b' : stateColor.fill}`,
        }}
        data-tip={t('fleet:fleetStrip.identityTip', { airframe: airframeLabel(v.mavType), state: v.state })}
      >
        <AirframeIcon mavType={v.mavType} size={role === 'wingman' ? 13 : 16} />
      </button>
      {swatchOpen && swatchPos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[998]" onClick={(e) => { e.stopPropagation(); setSwatchOpen(false); }} />
            <div
              className={`fixed z-[999] p-2 rounded-md grid grid-cols-5 gap-1.5 ${TAC_GLASS}`}
              style={{ top: swatchPos.top, left: swatchPos.left }}
              onClick={(e) => e.stopPropagation()}
            >
              {VEHICLE_COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => { setColor(v.key, c); setSwatchOpen(false); }}
                  className={`w-5 h-5 rounded transition-transform hover:scale-110 ${c === identityColor ? 'ring-2 ring-blue-500' : ''}`}
                  style={{ backgroundColor: c }}
                  aria-label={t('fleet:fleetStrip.setColour', { color: c })}
                />
              ))}
            </div>
          </>,
          document.body,
        )}

      {/* Identity. Wingmen collapse to a single row so the leader's two-row card
          visibly outranks them - the flat "everything same size" list made the
          formation structure invisible at a glance. */}
      {role === 'wingman' ? (
        <div className="min-w-0 flex-1 flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-semibold text-content truncate">{v.label}</span>
          <BatteryPip pct={v.batteryPct} />
          <span className="ml-auto font-mono text-[10px] font-semibold truncate" style={{ color: getModeCategoryVar(v.mode) }}>{v.mode}</span>
          <HeartbeatDot lastUpdate={v.lastUpdate} className="scale-75 origin-right" />
        </div>
      ) : (
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold text-content truncate">{v.label}</span>
          {role === 'leader' && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-1 rounded-sm bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30">{t('fleet:fleetStrip.lead')}</span>
          )}
          {role === 'leader' && count > 0 && (
            <span className="text-[9px] font-mono text-content-tertiary">+{count}</span>
          )}
          <span className="ml-auto font-mono text-[10px] font-semibold truncate" style={{ color: getModeCategoryVar(v.mode) }}>{v.mode}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <BatteryPip pct={v.batteryPct} />
          <span className="text-[9px] uppercase tracking-wide text-content-tertiary">{airframeLabel(v.mavType)}</span>
          <HeartbeatDot lastUpdate={v.lastUpdate} className="ml-auto scale-75 origin-right" />
        </div>
      </div>
      )}

      {/* Multi-select - surfaces on hover (or when selected); hidden for wingmen. */}
      {!role && (
        <input
          type="checkbox"
          checked={v.isSelected}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelected(v.key)}
          className={`shrink-0 accent-cyan-500 w-3 h-3 transition-opacity ${v.isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          data-tip={t('fleet:fleetStrip.selectTip')}
        />
      )}

      {/* Orders affordance - a chevron that fades in on hover so the operator knows there's
          a menu here (also reachable by right-clicking anywhere on the row). */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          openContextMenu({ x: r.right + 4, y: r.top, vehicleKey: v.key });
        }}
        data-tip={t('fleet:fleetStrip.orders')}
        className="shrink-0 grid place-items-center w-4 h-5 rounded text-content-tertiary hover:text-content hover:bg-surface-raised opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
    </div>
  );
}

export function FleetStrip() {
  const { t } = useTranslation();
  const vehicles = useFleetVehicles();
  const formations = useActiveVehicleStore((s) => s.formations);
  const { addToFleet, removeFromFleet } = useFormationControl();
  const uiOverrides = useFleetUiStore((s) => s.overrides);
  const toggleFleet = useFleetUiStore((s) => s.toggle);
  const [collapsed, setCollapsed] = useState(false);
  const [dropZone, setDropZone] = useState<string | null>(null);

  const dropOn = (zone: string) => ({
    onDragOver: (e: React.DragEvent) => { allowVehicleDrop(e); setDropZone(zone); },
    onDragLeave: () => setDropZone((z) => (z === zone ? null : z)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropZone(null);
      const key = readVehicleDrag(e);
      if (!key) return;
      if (zone === FREE_ZONE) void removeFromFleet(key);
      else if (key !== zone) void addToFleet(zone, key);
    },
  });

  // Single-vehicle (or none): render nothing, keep the classic layout.
  if (vehicles.length < 2) return null;

  if (collapsed) {
    return (
      <div className="shrink-0 w-8 border-r border-subtle bg-surface-nav flex flex-col items-center py-2 gap-2">
        <button onClick={() => setCollapsed(false)} className="text-content-secondary hover:text-content text-xs" data-tip={t('fleet:fleetStrip.expandFleet')}>{'»'}</button>
        {vehicles.map((v) => (
          <span
            key={v.key}
            onClick={() => selectActiveVehicle(v.key, v.transportId)}
            onContextMenu={(e) => { e.preventDefault(); useFormationStore.getState().openContextMenu({ x: e.clientX, y: e.clientY, vehicleKey: v.key }); }}
            className={`w-3 h-3 rounded-full cursor-pointer ${v.isActive ? 'ring-2 ring-cyan-400' : ''}`}
            style={{ background: STATE_COLORS[v.state].fill }}
            data-tip={`${v.label} - ${v.mode}`}
          />
        ))}
        <FleetContextMenu />
      </div>
    );
  }

  const sorted = [...vehicles].sort((a, b) => a.sysid - b.sysid);
  // One nested block per formation (leader card + its wingmen indented under it);
  // vehicles in no formation stay free, selectable cards below the groups.
  const inFormation = new Set(Object.values(formations).flat());
  const groups = Object.entries(formations)
    .map(([leaderKey, memberKeys]) => ({
      leader: sorted.find((v) => v.key === leaderKey),
      wingmen: sorted.filter((v) => v.key !== leaderKey && memberKeys.includes(v.key)),
    }))
    .filter((g): g is { leader: FleetVehicle; wingmen: FleetVehicle[] } => !!g.leader)
    .sort((a, b) => a.leader.sysid - b.leader.sysid);
  const others = sorted.filter((v) => !inFormation.has(v.key));
  const leaderKeys = groups.map((g) => g.leader.key);

  return (
    <div className="shrink-0 w-52 border-r border-subtle bg-surface-nav flex flex-col text-content">
      <div className="flex items-center justify-between px-2.5 py-2 border-b border-subtle">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-content-secondary">
          {t('fleet:fleetStrip.fleet')} <span className="text-content-tertiary">·</span> <span className="font-mono text-content">{vehicles.length}</span>
        </span>
        <button onClick={() => setCollapsed(true)} className="text-content-secondary hover:text-content text-xs" data-tip={t('fleet:fleetStrip.collapseFleet')}>{'«'}</button>
      </div>

      <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1">
        <FleetCountHeader leaderKeys={leaderKeys} className="px-1 pb-1" />
        {groups.map((g) => {
          const expanded = isFleetExpanded(uiOverrides, g.leader.key, leaderKeys.length);
          return (
            <div
              key={g.leader.key}
              {...dropOn(g.leader.key)}
              className={`flex flex-col gap-1 rounded p-0.5 -m-0.5 transition-colors ${
                dropZone === g.leader.key ? 'bg-cyan-500/10 ring-1 ring-cyan-500/40' : ''
              }`}
            >
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => toggleFleet(g.leader.key, expanded)}
                  className="shrink-0 w-4 h-6 grid place-items-center text-content-tertiary hover:text-content"
                  data-tip={expanded ? t('fleet:fleetStrip.collapseFleet') : t('fleet:fleetStrip.expandFleet')}
                >
                  <FleetChevron open={expanded} />
                </button>
                <div className="flex-1 min-w-0"><FleetCard v={g.leader} role="leader" count={g.wingmen.length} /></div>
              </div>
              {expanded && (
                <WingmenRail leaderKey={g.leader.key} leaderSysid={g.leader.sysid}>
                  {g.wingmen.map((v) => (
                    <FleetCard key={v.key} v={v} role="wingman" />
                  ))}
                  {g.wingmen.length === 0 && (
                    <span className="text-[9px] uppercase tracking-wide text-content-tertiary italic py-0.5">{t('fleet:fleetStrip.dragHere')}</span>
                  )}
                </WingmenRail>
              )}
            </div>
          );
        })}

        {/* Unassigned / free vehicles - also the drop zone to peel one out of its fleet. */}
        <div
          {...dropOn(FREE_ZONE)}
          className={`flex flex-col gap-1 rounded p-0.5 -m-0.5 transition-colors ${
            dropZone === FREE_ZONE ? 'bg-surface-raised ring-1 ring-subtle' : ''
          }`}
        >
          {groups.length > 0 && others.length > 0 && (
            <span className="text-[9px] uppercase tracking-[0.14em] text-content-tertiary px-1 pt-1">{t('fleet:fleetStrip.unassigned')}</span>
          )}
          {others.map((v) => <FleetCard key={v.key} v={v} />)}
          {groups.length > 0 && others.length === 0 && dropZone === FREE_ZONE && (
            <span className="text-[9px] uppercase tracking-wide text-content-tertiary italic py-1 px-1">{t('fleet:fleetStrip.dropToRemove')}</span>
          )}
        </div>
      </div>

      <FleetContextMenu />
    </div>
  );
}
