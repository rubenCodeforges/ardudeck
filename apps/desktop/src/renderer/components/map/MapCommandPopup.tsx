import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Navigation, Crosshair, RotateCw, Tornado, Eye, Film, MoveHorizontal,
  ArrowUpFromLine, ArrowDownToLine,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MapCommand } from './map-command-types';
import { useScriptHealth } from '../script-installer/useScriptHealth';
import { useSettingsStore } from '../../stores/settings-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { mavTypeToTacticalClass, type TacticalVehicleClass } from './tactical-icon-pool';
import { ScriptInstallModal } from '../script-installer/ScriptInstallModal';
import { fenceWarningForPoint } from '../../utils/fence-check';
import {
  altitudeValueFromMeters,
  distanceValueFromMeters,
  formatDistanceFromMeters,
  speedValueFromMetersPerSecond,
  toMetersPerSecondFromSpeedUnit,
  toMetersPerSecondFromVerticalSpeedUnit,
  toMetersFromAltitudeUnit,
  toMetersFromDistanceUnit,
  UNIT_LABELS,
  UNIT_PRECISION,
  verticalSpeedValueFromMetersPerSecond,
} from '../../../shared/user-units.js';

interface MapCommandPopupProps {
  lat: number;
  lon: number;
  distanceMeters: number;
  currentAltAgl: number;
  currentMode: string;
  onConfirm: (command: MapCommand, options?: { preferScript?: boolean }) => void;
  onCancel: () => void;
  /** Point the camera/gimbal at the clicked ground location (sets ROI). */
  onSetRoi?: (lat: number, lon: number) => void;
  /** Release the current ROI lock. */
  onClearRoi?: () => void;
  /** True when an ROI is currently active (enables the Clear button). */
  hasRoi?: boolean;
}

/**
 * RTS-style command card (replaces the old tabbed dialog). Designed for
 * in-flight use:
 *  - Fixed spatial layout: tiles never move, reorder or disappear. A missing
 *    script only DIMS a tile, so muscle memory always lands.
 *  - Frequency hierarchy: Fly / Look / Orbit are the big top row; cinematic
 *    tools are smaller; Return + Land live in a separated bottom zone.
 *  - Two clicks max: click a tile, click it again (or Enter) to send with the
 *    shown values. Parameter state persists, so repeat commands are instant.
 *    Land is guarded: only its explicit confirm button fires it.
 *  - Params unfold in a dock BELOW the grid so nothing above shifts.
 *  - Hotkeys 1-9 by visible position.
 */
type CommandId =
  | 'fly' | 'look' | 'orbit' | 'spiral' | 'watchtower'
  | 'reveal' | 'strafe' | 'climbRtl' | 'land';

type Zone = 'primary' | 'secondary' | 'escape';
type Accent = 'cyan' | 'amber' | 'violet' | 'rose';

interface ActionMeta {
  id: CommandId;
  zone: Zone;
  label: string;
  accent: Accent;
  icon: LucideIcon;
  /** Confirm button label. */
  go: string;
  hint: string;
  /** Flight mode this command puts the FC into (pill shown when it differs). */
  modeTo?: 'GUIDED' | 'LAND';
  /** 'required' = Lua-script only; 'fallback' = script preferred, native works. */
  script?: 'required' | 'fallback';
  /** Gated behind the advanced-commands unlock (Fly + Look are always on). */
  advanced?: boolean;
  /** Vehicle classes this command is meaningful for. */
  supportedClasses: ReadonlyArray<TacticalVehicleClass>;
  /** Requires the explicit confirm button (no re-click / Enter send). */
  guarded?: boolean;
}

const AIR: ReadonlyArray<TacticalVehicleClass> = ['copter', 'vtol', 'plane'];
const HOVER: ReadonlyArray<TacticalVehicleClass> = ['copter', 'vtol'];
const ALL: ReadonlyArray<TacticalVehicleClass> = ['copter', 'vtol', 'plane', 'rover', 'boat', 'sub', 'antenna'];

const ACTIONS: ActionMeta[] = [
  { id: 'fly', zone: 'primary', label: 'Fly here', accent: 'cyan', icon: Navigation, go: 'Fly',
    hint: 'Guided move to this point at the set altitude.', modeTo: 'GUIDED', supportedClasses: ALL },
  { id: 'look', zone: 'primary', label: 'Look here', accent: 'amber', icon: Crosshair, go: 'Look here',
    hint: 'Gimbal locks on and tracks this point as the vehicle moves. Flight path unchanged.', supportedClasses: ALL },
  { id: 'orbit', zone: 'primary', label: 'Orbit', accent: 'violet', icon: RotateCw, go: 'Orbit',
    hint: 'Circle this point at fixed altitude.', modeTo: 'GUIDED', script: 'fallback', advanced: true, supportedClasses: AIR },
  { id: 'spiral', zone: 'secondary', label: 'Spiral', accent: 'violet', icon: Tornado, go: 'Spiral',
    hint: 'Orbit while climbing or descending to a target altitude.', modeTo: 'GUIDED', script: 'required', advanced: true, supportedClasses: AIR },
  { id: 'watchtower', zone: 'secondary', label: 'Watch', accent: 'violet', icon: Eye, go: 'Watch',
    hint: 'Hover at this point and rotate slowly for a panoramic view.', modeTo: 'GUIDED', script: 'required', advanced: true, supportedClasses: HOVER },
  { id: 'reveal', zone: 'secondary', label: 'Reveal', accent: 'violet', icon: Film, go: 'Reveal',
    hint: 'Pull back and climb with the camera locked on this target.', modeTo: 'GUIDED', script: 'required', advanced: true, supportedClasses: HOVER },
  { id: 'strafe', zone: 'secondary', label: 'Strafe', accent: 'violet', icon: MoveHorizontal, go: 'Strafe',
    hint: 'Dolly past the target at a perpendicular offset, camera locked on.', modeTo: 'GUIDED', script: 'required', advanced: true, supportedClasses: HOVER },
  { id: 'climbRtl', zone: 'escape', label: 'Climb + RTL', accent: 'rose', icon: ArrowUpFromLine, go: 'Climb and return',
    hint: 'Climb in place to a safe altitude, then return home.', modeTo: 'GUIDED', script: 'required', advanced: true, supportedClasses: HOVER },
  { id: 'land', zone: 'escape', label: 'Land here', accent: 'rose', icon: ArrowDownToLine, go: 'Confirm Land',
    hint: 'Fly to this point, then descend and land.', modeTo: 'LAND', advanced: true, guarded: true, supportedClasses: ALL },
];

/** Per-accent classes. Solid button colors read fine on both themes; the
 *  tile/pill tints ride color-mix-free tailwind opacity variants. */
const ACCENT: Record<Accent, { tile: string; icon: string; btn: string; pill: string }> = {
  cyan:   { tile: 'border-cyan-500/70 bg-cyan-500/10',   icon: 'text-cyan-500',   btn: 'bg-cyan-600 hover:bg-cyan-500',     pill: 'border-cyan-500/50 text-cyan-500' },
  amber:  { tile: 'border-amber-500/70 bg-amber-500/10', icon: 'text-amber-500',  btn: 'bg-amber-600 hover:bg-amber-500',   pill: 'border-amber-500/50 text-amber-500' },
  violet: { tile: 'border-violet-500/70 bg-violet-500/10', icon: 'text-violet-500', btn: 'bg-violet-600 hover:bg-violet-500', pill: 'border-violet-500/50 text-violet-500' },
  rose:   { tile: 'border-rose-500/70 bg-rose-500/10',   icon: 'text-rose-500',   btn: 'bg-rose-600 hover:bg-rose-500',     pill: 'border-rose-500/50 text-rose-500' },
};

export const MapCommandPopup: React.FC<MapCommandPopupProps> = ({
  lat,
  lon,
  distanceMeters,
  currentAltAgl,
  currentMode,
  onConfirm,
  onCancel,
  onSetRoi,
  onClearRoi,
  hasRoi,
}) => {
  const [selected, setSelected] = useState<CommandId>('fly');

  // Parameter state persists while the popup is open, and defaults are sane,
  // so Enter always fires with what the row summary shows.
  const [altitude, setAltitude] = useState(Math.max(Math.round(currentAltAgl), 10));
  const [radius, setRadius] = useState(50);
  const [direction, setDirection] = useState<'cw' | 'ccw'>('cw');
  const [revolutions, setRevolutions] = useState(0); // 0 = endless
  const [spiralTargetAlt, setSpiralTargetAlt] = useState(Math.max(Math.round(currentAltAgl) + 30, 40));
  const [climbRate, setClimbRate] = useState(1.5);
  const [yawRate, setYawRate] = useState(30);
  const [climbRtlAlt, setClimbRtlAlt] = useState(Math.max(Math.round(currentAltAgl) + 30, 50));
  const [revealPullback, setRevealPullback] = useState(40);
  const [revealClimb, setRevealClimb] = useState(15);
  const [revealSpeed, setRevealSpeed] = useState(3);
  const [strafeOffset, setStrafeOffset] = useState(20);
  const [strafeLength, setStrafeLength] = useState(40);
  const [strafeSpeed, setStrafeSpeed] = useState(3);

  const [installModalOpen, setInstallModalOpen] = useState(false);

  const scriptHealth = useScriptHealth();
  const scriptHealthy = scriptHealth.status === 'present';
  const advancedCommandsUnlocked = useSettingsStore(s => s.advancedCommandsUnlocked);
  const distanceUnit = useSettingsStore(s => s.unitPreferences.distance);
  const altitudeUnit = useSettingsStore(s => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore(s => s.unitPreferences.speed);
  const verticalSpeedUnit = useSettingsStore(s => s.unitPreferences.verticalSpeed);

  // Vehicle-class gating: prefer the ACTIVE fleet vehicle's type; default to
  // copter when unknown so power users on flaky links don't lose access.
  const activeMavType = useActiveVehicleStore(s => (s.activeVehicleKey ? s.knownVehicles[s.activeVehicleKey]?.mavType : undefined));
  const connMavType = useConnectionStore(s => s.connectionState.mavType);
  const mavType = activeMavType ?? connMavType;
  const vehicleClass = useMemo<TacticalVehicleClass>(
    () => mavType === undefined ? 'copter' : mavTypeToTacticalClass(mavType),
    [mavType],
  );

  // Visible tiles: class support and the advanced unlock filter what EXISTS
  // for this vehicle/user (a permanent property, so removal is fine). Script
  // availability is transient, so it only dims (see disabled below).
  const visible = useMemo(
    () => ACTIONS.filter(a =>
      a.supportedClasses.includes(vehicleClass) && (!a.advanced || advancedCommandsUnlocked)),
    [vehicleClass, advancedCommandsUnlocked],
  );
  const hotkeyOf = useMemo(() => {
    const m = new Map<CommandId, string>();
    visible.forEach((a, i) => { if (i < 9) m.set(a.id, String(i + 1)); });
    return m;
  }, [visible]);

  const isDisabled = useCallback(
    (a: ActionMeta) => a.script === 'required' && !scriptHealthy,
    [scriptHealthy],
  );

  // Snap selection back if the selected tile vanished (vehicle class change).
  useEffect(() => {
    if (!visible.some(a => a.id === selected)) setSelected('fly');
  }, [visible, selected]);

  const meta = ACTIONS.find(a => a.id === selected) ?? ACTIONS[0]!;
  const blocked = isDisabled(meta);
  const modeUpper = currentMode.toUpperCase();
  const modePill = meta.modeTo && meta.modeTo !== modeUpper ? `to ${meta.modeTo}` : null;

  // The FC rejects a destination outside the geofence with a bare FAILED and no
  // reason. We know the fence GCS-side, so warn before the operator sends.
  // Applies to actions that fly to the clicked point (not Look/Climb+RTL).
  const usesClickedPoint = meta.id !== 'look' && meta.id !== 'climbRtl';
  const fenceWarning = useMemo(
    () => (usesClickedPoint ? fenceWarningForPoint(lat, lon) : null),
    [usesClickedPoint, lat, lon],
  );

  // ── unit display helpers ──────────────────────────────────────────────────
  const distanceStep = distanceUnit === 'm' || distanceUnit === 'ft' ? 5 : 0.01;
  const distanceLabel = UNIT_LABELS.distance[distanceUnit];
  const displayDistance = useCallback((m: number) => Number(distanceValueFromMeters(m, distanceUnit).toFixed(2)), [distanceUnit]);
  const nativeDistance = useCallback((v: number) => toMetersFromDistanceUnit(v, distanceUnit), [distanceUnit]);

  const altitudePrecision = altitudeUnit === 'km' ? 3 : altitudeUnit === 'm' ? 0 : 1;
  const altitudeStep = altitudeUnit === 'km' ? 0.01 : 1;
  const altitudeLabel = UNIT_LABELS.altitude[altitudeUnit];
  const displayAltitude = useCallback(
    (m: number) => Number(altitudeValueFromMeters(m, altitudeUnit).toFixed(altitudePrecision)),
    [altitudePrecision, altitudeUnit],
  );
  const nativeAltitude = useCallback((v: number) => toMetersFromAltitudeUnit(v, altitudeUnit), [altitudeUnit]);

  const speedPrecision = UNIT_PRECISION.speed[speedUnit];
  const speedStep = 1 / (10 ** speedPrecision);
  const speedLabel = UNIT_LABELS.speed[speedUnit];
  const displaySpeed = useCallback(
    (mps: number) => Number(speedValueFromMetersPerSecond(mps, speedUnit).toFixed(speedPrecision)),
    [speedPrecision, speedUnit],
  );
  const nativeSpeed = useCallback((v: number) => toMetersPerSecondFromSpeedUnit(v, speedUnit), [speedUnit]);

  const verticalSpeedPrecision = UNIT_PRECISION.verticalSpeed[verticalSpeedUnit];
  const verticalSpeedStep = 1 / (10 ** verticalSpeedPrecision);
  const verticalSpeedLabel = UNIT_LABELS.verticalSpeed[verticalSpeedUnit];
  const displayVerticalSpeed = useCallback(
    (mps: number) => Number(verticalSpeedValueFromMetersPerSecond(mps, verticalSpeedUnit).toFixed(verticalSpeedPrecision)),
    [verticalSpeedPrecision, verticalSpeedUnit],
  );
  const nativeVerticalSpeed = useCallback((v: number) => toMetersPerSecondFromVerticalSpeedUnit(v, verticalSpeedUnit), [verticalSpeedUnit]);

  // ── send ──────────────────────────────────────────────────────────────────
  const send = useCallback((id: CommandId) => {
    const a = ACTIONS.find(x => x.id === id);
    if (!a || (a.script === 'required' && !scriptHealthy)) return;
    const signedRadius = direction === 'cw' ? radius : -radius;
    const signedYawRate = direction === 'cw' ? Math.abs(yawRate) : -Math.abs(yawRate);
    switch (id) {
      case 'fly':
        onConfirm({ type: 'goto', lat, lon, alt: altitude });
        break;
      case 'look':
        onSetRoi?.(lat, lon);
        break;
      case 'orbit':
        onConfirm(
          { type: 'orbit', lat, lon, alt: altitude, radius: signedRadius, revolutions },
          { preferScript: scriptHealthy },
        );
        break;
      case 'spiral':
        onConfirm(
          { type: 'spiral', lat, lon, radius: signedRadius, startAlt: currentAltAgl, targetAlt: spiralTargetAlt, climbRate },
          { preferScript: true },
        );
        break;
      case 'watchtower':
        onConfirm({ type: 'watchtower', lat, lon, alt: altitude, yawRate: signedYawRate }, { preferScript: true });
        break;
      case 'reveal':
        onConfirm(
          { type: 'reveal', lat, lon, alt: altitude, pullbackDist: revealPullback, climbAmount: revealClimb, speed: revealSpeed },
          { preferScript: true },
        );
        break;
      case 'strafe':
        onConfirm(
          { type: 'strafe', lat, lon, alt: altitude, offsetDist: strafeOffset, length: strafeLength, speed: strafeSpeed },
          { preferScript: true },
        );
        break;
      case 'climbRtl':
        onConfirm({ type: 'climbRtl', targetAlt: climbRtlAlt }, { preferScript: true });
        break;
      case 'land':
        // Script LAND_AT flies to the point first; native NAV_LAND descends in place.
        onConfirm({ type: 'land', lat, lon }, { preferScript: scriptHealthy });
        break;
    }
  }, [
    lat, lon, altitude, radius, direction, revolutions, spiralTargetAlt, climbRate,
    yawRate, climbRtlAlt, revealPullback, revealClimb, revealSpeed,
    strafeOffset, strafeLength, strafeSpeed, currentAltAgl, scriptHealthy,
    onConfirm, onSetRoi,
  ]);

  const handleTileClick = useCallback((a: ActionMeta) => {
    if (isDisabled(a)) { setSelected(a.id); return; } // dock shows the install CTA
    if (selected === a.id && !a.guarded) { send(a.id); return; } // second click sends
    setSelected(a.id);
  }, [selected, send, isDisabled]);

  // Keyboard: digit hotkeys select by visible position, Enter sends (except
  // guarded Land), Esc closes. Digits are ignored while typing in an input.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onCancel(); return; }
      if (e.key === 'Enter') {
        if (!meta.guarded && !blocked) send(selected);
        return;
      }
      if (e.target instanceof HTMLElement && e.target.tagName === 'INPUT') return;
      const hit = visible.find(a => hotkeyOf.get(a.id) === e.key);
      if (hit) setSelected(hit.id);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [visible, hotkeyOf, selected, meta.guarded, blocked, send, onCancel]);

  // ── render ────────────────────────────────────────────────────────────────
  const zones: Zone[] = ['primary', 'secondary', 'escape'];

  return (
    <div className="w-full text-xs" onClick={(e) => e.stopPropagation()}>
      {/* Header: coordinates + distance */}
      <div className="flex items-baseline justify-between gap-2 border-b border-subtle px-1 pb-2 mb-2">
        <span className="font-mono text-[11px] text-content truncate">{lat.toFixed(6)}, {lon.toFixed(6)}</span>
        <span className="text-[10px] text-content-tertiary shrink-0">
          <span className="font-mono text-content-secondary">{formatDistanceFromMeters(distanceMeters, distanceUnit)}</span> away
        </span>
      </div>

      {/* Command card */}
      {zones.map(zone => {
        const tiles = visible.filter(a => a.zone === zone);
        if (tiles.length === 0) return null;
        return (
          <div
            key={zone}
            className={`grid gap-1.5 ${zone === 'escape' ? 'mt-2 border-t border-subtle pt-2' : 'mb-1.5'}`}
            style={{ gridTemplateColumns: `repeat(${Math.max(tiles.length, zone === 'secondary' ? 4 : 2)}, minmax(0, 1fr))` }}
          >
            {tiles.map(a => {
              const Icon = a.icon;
              const sel = selected === a.id;
              const dis = isDisabled(a);
              const acc = ACCENT[a.accent];
              const big = zone === 'primary';
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => handleTileClick(a)}
                  className={`relative flex flex-col items-center justify-center gap-1 rounded-[10px] border transition-colors ${
                    big ? 'min-h-[56px] py-2' : 'min-h-[46px] py-1.5'
                  } ${dis ? 'opacity-40' : ''} ${
                    sel && !dis ? acc.tile : 'border-subtle bg-surface-raised hover:border-strong'
                  }`}
                >
                  {a.id === 'look' && hasRoi && (
                    <span className="absolute left-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500 shadow-[0_0_5px] shadow-amber-500" />
                  )}
                  <span className={`absolute right-1.5 top-1 font-mono text-[8.5px] ${sel && !dis ? acc.icon : 'text-content-tertiary'}`}>
                    {hotkeyOf.get(a.id)}
                  </span>
                  <Icon className={`${big ? 'w-[18px] h-[18px]' : 'w-4 h-4'} ${sel && !dis ? acc.icon : 'text-content-secondary'}`} />
                  <span className={`${big ? 'text-[10.5px]' : 'text-[9.5px]'} leading-tight font-medium text-content text-center`}>
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}

      {/* Params dock: below the grid so unfolding never shifts a tile */}
      <div className="mt-2 rounded-lg border border-subtle bg-surface-raised px-2.5 pb-2.5 pt-2">
        {blocked ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10.5px] leading-snug text-content-secondary">
              {scriptHealth.status === 'stale'
                ? 'ArduDeck Lua script installed but not responding.'
                : 'Needs the ArduDeck Lua script on the flight controller.'}
            </span>
            {scriptHealth.status === 'missing' && (
              <button
                type="button"
                onClick={() => setInstallModalOpen(true)}
                className="shrink-0 rounded-md bg-violet-600 px-2.5 py-1 text-[10.5px] font-medium text-white hover:bg-violet-500"
              >
                Install
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="mb-2 text-[10.5px] leading-snug text-content-secondary">
              {meta.hint}
              {meta.id === 'look' && hasRoi && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={onClearRoi}
                    className="font-semibold text-amber-500 underline underline-offset-2 hover:text-amber-400"
                  >
                    Clear current ROI
                  </button>
                </>
              )}
            </div>

            {/* Parameter rows: strict label rail + equal-width controls */}
            <div className="grid grid-cols-[62px_1fr] items-center gap-x-2.5 gap-y-1.5">
              {(meta.id === 'fly' || meta.id === 'orbit' || meta.id === 'watchtower' || meta.id === 'reveal' || meta.id === 'strafe') && (
                <ParamRow label="Altitude">
                  <Stepper value={displayAltitude(altitude)} onChange={(v) => setAltitude(nativeAltitude(v))}
                    min={displayAltitude(2)} max={displayAltitude(5000)} step={altitudeStep} unit={altitudeLabel} autoFocus={meta.id === 'fly'} />
                </ParamRow>
              )}
              {(meta.id === 'orbit' || meta.id === 'spiral') && (
                <ParamRow label="Radius">
                  <Stepper value={displayDistance(radius)} onChange={(v) => setRadius(nativeDistance(v))}
                    min={displayDistance(5)} max={displayDistance(1000)} step={distanceStep} unit={distanceLabel} />
                </ParamRow>
              )}
              {(meta.id === 'orbit' || meta.id === 'spiral' || meta.id === 'watchtower') && (
                <ParamRow label="Direction">
                  <DirSeg value={direction} onChange={setDirection} />
                </ParamRow>
              )}
              {meta.id === 'orbit' && (
                <ParamRow label="Orbits">
                  <Stepper value={revolutions} onChange={setRevolutions} min={0} max={50} step={1}
                    unit={revolutions === 0 ? 'endless' : revolutions === 1 ? 'circle' : 'circles'} showInfinityAtZero />
                </ParamRow>
              )}
              {meta.id === 'spiral' && (
                <>
                  <ParamRow label="To alt">
                    <Stepper value={displayAltitude(spiralTargetAlt)} onChange={(v) => setSpiralTargetAlt(nativeAltitude(v))}
                      min={displayAltitude(2)} max={displayAltitude(5000)} step={altitudeStep} unit={altitudeLabel} />
                  </ParamRow>
                  <ParamRow label="Climb">
                    <Stepper value={displayVerticalSpeed(climbRate)} onChange={(v) => setClimbRate(nativeVerticalSpeed(v))}
                      min={displayVerticalSpeed(0.1)} max={displayVerticalSpeed(10)} step={verticalSpeedStep} unit={verticalSpeedLabel} />
                  </ParamRow>
                </>
              )}
              {meta.id === 'watchtower' && (
                <ParamRow label="Yaw rate">
                  <Stepper value={yawRate} onChange={setYawRate} min={5} max={180} step={5} unit={`°/s, ${(360 / Math.max(yawRate, 1)).toFixed(1)}s/rev`} />
                </ParamRow>
              )}
              {meta.id === 'reveal' && (
                <>
                  <ParamRow label="Pullback">
                    <Stepper value={displayDistance(revealPullback)} onChange={(v) => setRevealPullback(nativeDistance(v))}
                      min={displayDistance(5)} max={displayDistance(500)} step={distanceStep} unit={distanceLabel} />
                  </ParamRow>
                  <ParamRow label="Climb">
                    <Stepper value={displayAltitude(revealClimb)} onChange={(v) => setRevealClimb(nativeAltitude(v))}
                      min={displayAltitude(-100)} max={displayAltitude(200)} step={altitudeStep} unit={altitudeLabel} />
                  </ParamRow>
                  <ParamRow label="Speed">
                    <Stepper value={displaySpeed(revealSpeed)} onChange={(v) => setRevealSpeed(nativeSpeed(v))}
                      min={displaySpeed(0.5)} max={displaySpeed(15)} step={speedStep} unit={speedLabel} />
                  </ParamRow>
                </>
              )}
              {meta.id === 'strafe' && (
                <>
                  <ParamRow label="Offset">
                    <Stepper value={displayDistance(strafeOffset)} onChange={(v) => setStrafeOffset(nativeDistance(v))}
                      min={displayDistance(2)} max={displayDistance(300)} step={distanceStep} unit={distanceLabel} />
                  </ParamRow>
                  <ParamRow label="Length">
                    <Stepper value={displayDistance(strafeLength)} onChange={(v) => setStrafeLength(nativeDistance(v))}
                      min={displayDistance(5)} max={displayDistance(500)} step={distanceStep} unit={distanceLabel} />
                  </ParamRow>
                  <ParamRow label="Speed">
                    <Stepper value={displaySpeed(strafeSpeed)} onChange={(v) => setStrafeSpeed(nativeSpeed(v))}
                      min={displaySpeed(0.5)} max={displaySpeed(15)} step={speedStep} unit={speedLabel} />
                  </ParamRow>
                </>
              )}
              {meta.id === 'climbRtl' && (
                <ParamRow label="Climb to">
                  <Stepper value={displayAltitude(climbRtlAlt)} onChange={(v) => setClimbRtlAlt(nativeAltitude(v))}
                    min={displayAltitude(5)} max={displayAltitude(500)} step={altitudeStep} unit={`${altitudeLabel} AGL`} />
                </ParamRow>
              )}
            </div>

            {/* Send row: consequence pills instead of warning boxes */}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => send(meta.id)}
                className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors ${ACCENT[meta.accent].btn}`}
              >
                {meta.go}
              </button>
              {modePill && (
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wide whitespace-nowrap ${ACCENT[meta.accent].pill}`}>
                  {modePill}
                </span>
              )}
            </div>

            {fenceWarning && (
              <div className="mt-1.5 rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] leading-snug text-rose-500">
                Vehicle will refuse this point: {fenceWarning}
              </div>
            )}

            {meta.id === 'orbit' && !scriptHealthy && (
              <div className="mt-1.5 text-[9.5px] text-content-tertiary">
                {scriptHealth.status === 'stale'
                  ? 'Script silent: native DO_ORBIT fallback, orbit count ignored.'
                  : 'Script not installed: native DO_ORBIT, orbit count ignored.'}
              </div>
            )}
          </>
        )}
      </div>

      {/* Keyboard hint footer */}
      <div className="mt-1.5 flex items-center justify-center gap-3 text-[9px] text-content-tertiary">
        <span><Kbd>1</Kbd>-<Kbd>9</Kbd> select</span>
        <span><Kbd>Enter</Kbd> or click again to send</span>
        <span><Kbd>Esc</Kbd> close</span>
      </div>

      <ScriptInstallModal open={installModalOpen} onClose={() => setInstallModalOpen(false)} />
    </div>
  );
};

// ── Small UI helpers (tied to popup styling) ────────────────────────────────

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border border-subtle px-1 font-mono text-content-secondary">{children}</kbd>;
}

function ParamRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="text-[10.5px] text-content-secondary">{label}</span>
      {children}
    </>
  );
}

/** Minus / editable value+unit / plus. Full-width so every row's control has
 *  identical geometry; the unit lives inside the field, nothing dangles. */
function Stepper({ value, onChange, min, max, step, unit, autoFocus, showInfinityAtZero }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  autoFocus?: boolean;
  showInfinityAtZero?: boolean;
}) {
  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, Number(n.toFixed(3)))), [min, max]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    setEditing(false);
    const n = Number(draft);
    if (Number.isFinite(n)) onChange(clamp(n));
  };

  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-lg border border-subtle bg-surface-input">
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onChange(clamp(value - step))}
        className="w-8 flex-none text-sm leading-none text-content-secondary hover:bg-surface-raised hover:text-content"
      >
        &minus;
      </button>
      <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1 self-center">
        {showInfinityAtZero && value === 0 && !editing ? (
          <button
            type="button"
            onClick={() => { setEditing(true); setDraft('0'); }}
            className="font-mono text-xs text-content"
          >
            &infin;
          </button>
        ) : (
          <input
            type="number"
            value={editing ? draft : String(value)}
            onFocus={(e) => { setEditing(true); setDraft(String(value)); e.currentTarget.select(); }}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(n)) onChange(clamp(n));
            }}
            onBlur={commitDraft}
            autoFocus={autoFocus}
            className="w-12 min-w-0 bg-transparent text-center font-mono text-xs text-content focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        )}
        {unit && <span className="truncate text-[9.5px] text-content-tertiary">{unit}</span>}
      </div>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onChange(clamp(value + step))}
        className="w-8 flex-none text-sm leading-none text-content-secondary hover:bg-surface-raised hover:text-content"
      >
        +
      </button>
    </div>
  );
}

function DirSeg({ value, onChange }: { value: 'cw' | 'ccw'; onChange: (d: 'cw' | 'ccw') => void }) {
  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-lg border border-subtle">
      {(['cw', 'ccw'] as const).map((d, i) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={`flex-1 text-[10.5px] transition-colors ${i === 1 ? 'border-l border-subtle' : ''} ${
            value === d ? 'bg-surface-raised font-semibold text-content' : 'bg-surface-input text-content-secondary hover:text-content'
          }`}
        >
          {d.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
