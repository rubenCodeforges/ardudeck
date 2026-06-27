import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  RotateCw, Tornado, Eye, Film, MoveHorizontal, ArrowUpFromLine,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { MapCommand } from './map-command-types';
import { useScriptHealth } from '../script-installer/useScriptHealth';
import { useSettingsStore } from '../../stores/settings-store';
import { useConnectionStore } from '../../stores/connection-store';
import { mavTypeToTacticalClass, type TacticalVehicleClass } from './tactical-icon-pool';
import { ScriptInstallModal } from '../script-installer/ScriptInstallModal';
import {
  altitudeValueFromMeters,
  distanceValueFromMeters,
  formatAltitudeFromMeters,
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
}

/**
 * Top-level tabs:
 *   - move:    native DO_REPOSITION (always available)
 *   - lua:     ArduDeck-Lua-script-backed commands (Orbit, Spiral, ...).
 *              Only shown when the experimental flag is on. Hidden / shows
 *              install offer when the script isn't present on the FC.
 *   - land:    native NAV_LAND (gated by experimental flag for now since it
 *              changes mode, but kept simple).
 */
type TabId = 'move' | 'lua' | 'land';

interface TabMeta {
  id: TabId;
  label: string;
  activeClass: string;
}

const TABS: TabMeta[] = [
  { id: 'move', label: 'Move',         activeClass: 'bg-cyan-600 text-white' },
  { id: 'lua',  label: 'ArduDeck Lua', activeClass: 'bg-violet-600 text-white' },
  { id: 'land', label: 'Land',         activeClass: 'bg-rose-600 text-white' },
];

/** Lua-tab sub-commands. Adding one: extend SUB_CMD in map-command-types and
 *  the dispatch table in ardudeck_commands.lua, then add an entry here. */
type LuaCommandId = 'orbit' | 'spiral' | 'watchtower' | 'climbRtl' | 'reveal' | 'strafe';
type LuaCategory = 'hold' | 'cinematic' | 'return';
interface LuaCommandMeta {
  id: LuaCommandId;
  label: string;
  hint: string;
  confirmLabel: string;
  /** True if the command needs a clicked map location (most do; CLIMB_RTL doesn't). */
  needsLatLon: boolean;
  category: LuaCategory;
  icon: LucideIcon;
  /** Vehicle classes this command is meaningful for. Hover-based commands
   *  (watchtower/reveal/strafe/climbRtl) need hover-capable platforms. */
  supportedClasses: ReadonlyArray<TacticalVehicleClass>;
}
const LUA_COMMANDS: LuaCommandMeta[] = [
  { id: 'orbit',      label: 'Orbit',      hint: 'Loiter around this point at fixed altitude',                   confirmLabel: 'Confirm Orbit',      needsLatLon: true,  category: 'hold',      icon: RotateCw,         supportedClasses: ['copter', 'vtol', 'plane'] },
  { id: 'spiral',     label: 'Spiral',     hint: 'Orbit while climbing/descending to a target altitude',          confirmLabel: 'Confirm Spiral',     needsLatLon: true,  category: 'hold',      icon: Tornado,          supportedClasses: ['copter', 'vtol', 'plane'] },
  { id: 'watchtower', label: 'Watchtower', hint: 'Hover at this point and slowly rotate yaw for a panoramic',     confirmLabel: 'Confirm Watchtower', needsLatLon: true,  category: 'hold',      icon: Eye,              supportedClasses: ['copter', 'vtol'] },
  { id: 'reveal',     label: 'Reveal',     hint: 'Pull back + climb, camera locked on this target (cinematic)',   confirmLabel: 'Confirm Reveal',     needsLatLon: true,  category: 'cinematic', icon: Film,             supportedClasses: ['copter', 'vtol'] },
  { id: 'strafe',     label: 'Strafe',     hint: 'Dolly past this target at perpendicular offset, looking at it', confirmLabel: 'Confirm Strafe',     needsLatLon: true,  category: 'cinematic', icon: MoveHorizontal,   supportedClasses: ['copter', 'vtol'] },
  { id: 'climbRtl',   label: 'Climb+RTL',  hint: 'Climb in place to a safe altitude, then return home',           confirmLabel: 'Climb & RTL',        needsLatLon: false, category: 'return',    icon: ArrowUpFromLine,  supportedClasses: ['copter', 'vtol'] },
];

const CATEGORY_LABELS: Record<LuaCategory, string> = {
  hold:      'Hold',
  cinematic: 'Cinematic',
  return:    'Return',
};
const CATEGORY_ORDER: LuaCategory[] = ['hold', 'cinematic', 'return'];

/** Vehicle classes for which the entire Lua tab is meaningless (no air craft). */
const LUA_TAB_HIDDEN_CLASSES: ReadonlySet<TacticalVehicleClass> = new Set([
  'rover', 'boat', 'sub', 'antenna',
]);

export const MapCommandPopup: React.FC<MapCommandPopupProps> = ({
  lat,
  lon,
  distanceMeters,
  currentAltAgl,
  currentMode,
  onConfirm,
  onCancel,
}) => {
  // Top-level tab + Lua sub-command
  const [tabId, setTabId] = useState<TabId>('move');
  const [luaCmd, setLuaCmd] = useState<LuaCommandId>('orbit');

  // Move / orbit shared
  const [altitude, setAltitude] = useState(Math.max(Math.round(currentAltAgl), 10));
  // Orbit + spiral shared
  const [radius, setRadius] = useState(50);
  const [direction, setDirection] = useState<'cw' | 'ccw'>('cw');
  // Orbit-only
  const [revolutions, setRevolutions] = useState(0); // 0 = infinite
  // Spiral-only
  const [spiralTargetAlt, setSpiralTargetAlt] = useState(Math.max(Math.round(currentAltAgl) + 30, 40));
  const [climbRate, setClimbRate] = useState(1.5);
  // Watchtower-only
  const [yawRate, setYawRate] = useState(30);
  // Climb+RTL-only
  const [climbRtlAlt, setClimbRtlAlt] = useState(Math.max(Math.round(currentAltAgl) + 30, 50));
  // Reveal-only
  const [revealPullback, setRevealPullback] = useState(40);
  const [revealClimb, setRevealClimb]       = useState(15);
  const [revealSpeed, setRevealSpeed]       = useState(3);
  // Strafe-only
  const [strafeOffset, setStrafeOffset] = useState(20);
  const [strafeLength, setStrafeLength] = useState(40);
  const [strafeSpeed, setStrafeSpeed]   = useState(3);

  const [installModalOpen, setInstallModalOpen] = useState(false);

  const scriptHealth = useScriptHealth();
  const advancedCommandsUnlocked = useSettingsStore(s => s.advancedCommandsUnlocked);
  const distanceUnit = useSettingsStore(s => s.unitPreferences.distance);
  const altitudeUnit = useSettingsStore(s => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore(s => s.unitPreferences.speed);
  const verticalSpeedUnit = useSettingsStore(s => s.unitPreferences.verticalSpeed);
  const scriptHealthy = scriptHealth.status === 'present';

  // Vehicle-class gating. When mavType is unknown (early connect / no link),
  // default to copter behavior so power users on flaky links don't lose access.
  const mavType = useConnectionStore(s => s.connectionState.mavType);
  const vehicleClass = useMemo<TacticalVehicleClass>(
    () => mavType === undefined ? 'copter' : mavTypeToTacticalClass(mavType),
    [mavType],
  );
  const luaTabHidden = LUA_TAB_HIDDEN_CLASSES.has(vehicleClass);

  // Commands the current vehicle can actually perform.
  const supportedLuaCommands = useMemo(
    () => LUA_COMMANDS.filter(c => c.supportedClasses.includes(vehicleClass)),
    [vehicleClass],
  );

  // Group supported commands by category, preserving CATEGORY_ORDER.
  const commandsByCategory = useMemo(() => {
    const groups: Array<{ category: LuaCategory; commands: LuaCommandMeta[] }> = [];
    for (const cat of CATEGORY_ORDER) {
      const commands = supportedLuaCommands.filter(c => c.category === cat);
      if (commands.length > 0) groups.push({ category: cat, commands });
    }
    return groups;
  }, [supportedLuaCommands]);

  // Available top-level tabs - hide Lua + Land unless flag on; also hide Lua
  // entirely on ground/water vehicles where every command is nonsensical.
  const visibleTabs = useMemo(
    () => {
      if (!advancedCommandsUnlocked) return TABS.filter(t => t.id === 'move');
      return luaTabHidden ? TABS.filter(t => t.id !== 'lua') : TABS;
    },
    [advancedCommandsUnlocked, luaTabHidden],
  );

  // Snap back if a now-hidden tab was active
  useEffect(() => {
    if (!visibleTabs.some(t => t.id === tabId)) setTabId('move');
  }, [visibleTabs, tabId]);

  // Snap back if the active Lua command is no longer supported on this vehicle
  // (e.g. user reconnects to a plane while watchtower was selected).
  useEffect(() => {
    if (tabId !== 'lua') return;
    if (supportedLuaCommands.length === 0) return;
    if (!supportedLuaCommands.some(c => c.id === luaCmd)) {
      setLuaCmd(supportedLuaCommands[0]!.id);
    }
  }, [tabId, luaCmd, supportedLuaCommands]);

  const luaCmdMeta = useMemo(
    () => LUA_COMMANDS.find(c => c.id === luaCmd) ?? LUA_COMMANDS[0]!,
    [luaCmd],
  );

  const needsModeSwitch = currentMode.toUpperCase() !== 'GUIDED' && tabId !== 'land';
  const willSwitchToLand = tabId === 'land' && currentMode.toUpperCase() !== 'LAND';

  // Orbit has a native fallback; everything else under Lua tab is script-only.
  const willUseScript = tabId === 'lua' && scriptHealthy;
  const scriptOnlyCmd = tabId === 'lua' && luaCmd !== 'orbit';
  const scriptBlocked = scriptOnlyCmd && !scriptHealthy;

  const handleConfirm = useCallback(() => {
    if (tabId === 'move') {
      onConfirm({ type: 'goto', lat, lon, alt: altitude });
      return;
    }
    if (tabId === 'land') {
      // Native NAV_LAND ignores lat/lon (descends in place); prefer the
      // script's LAND_AT which flies to the point first, then switches to LAND.
      onConfirm({ type: 'land', lat, lon }, { preferScript: scriptHealthy });
      return;
    }
    // Lua tab
    if (scriptBlocked) return;
    const signedRadius = direction === 'cw' ? radius : -radius;
    const signedYawRate = direction === 'cw' ? Math.abs(yawRate) : -Math.abs(yawRate);
    switch (luaCmd) {
      case 'orbit':
        onConfirm(
          { type: 'orbit', lat, lon, alt: altitude, radius: signedRadius, revolutions },
          { preferScript: willUseScript },
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
      case 'climbRtl':
        onConfirm({ type: 'climbRtl', targetAlt: climbRtlAlt }, { preferScript: true });
        break;
      case 'reveal':
        onConfirm(
          { type: 'reveal', lat, lon, alt: altitude,
            pullbackDist: revealPullback, climbAmount: revealClimb, speed: revealSpeed },
          { preferScript: true },
        );
        break;
      case 'strafe':
        onConfirm(
          { type: 'strafe', lat, lon, alt: altitude,
            offsetDist: strafeOffset, length: strafeLength, speed: strafeSpeed },
          { preferScript: true },
        );
        break;
    }
  }, [
    tabId, luaCmd, lat, lon, altitude, radius, direction, revolutions,
    spiralTargetAlt, climbRate, yawRate, climbRtlAlt,
    revealPullback, revealClimb, revealSpeed,
    strafeOffset, strafeLength, strafeSpeed,
    currentAltAgl, willUseScript, scriptBlocked, onConfirm,
  ]);

  // Escape to cancel, Enter to confirm
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
      if (e.key === 'Enter') handleConfirm();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onCancel, handleConfirm]);

  const distanceStep = distanceUnit === 'm' || distanceUnit === 'ft' ? 5 : 0.01;
  const displayDistance = useCallback(
    (meters: number) => distanceValueFromMeters(meters, distanceUnit),
    [distanceUnit],
  );
  const nativeDistance = useCallback(
    (value: number) => toMetersFromDistanceUnit(value, distanceUnit),
    [distanceUnit],
  );
  const displayDistanceBound = useCallback(
    (meters: number) => distanceValueFromMeters(meters, distanceUnit),
    [distanceUnit],
  );
  const distanceLabel = UNIT_LABELS.distance[distanceUnit];
  const altitudePrecision = altitudeUnit === 'km' ? 3 : altitudeUnit === 'm' ? 0 : 1;
  const altitudeStep = altitudeUnit === 'km' ? 0.01 : 1;
  const altitudeLabel = UNIT_LABELS.altitude[altitudeUnit];
  const displayAltitude = useCallback(
    (meters: number) => Number(altitudeValueFromMeters(meters, altitudeUnit).toFixed(altitudePrecision)),
    [altitudePrecision, altitudeUnit],
  );
  const nativeAltitude = useCallback(
    (value: number) => toMetersFromAltitudeUnit(value, altitudeUnit),
    [altitudeUnit],
  );
  const setAltitudeFromDisplay = useCallback((value: number) => {
    if (value === displayAltitude(altitude)) return;
    setAltitude(nativeAltitude(value));
  }, [altitude, displayAltitude, nativeAltitude]);
  const setSpiralTargetAltFromDisplay = useCallback((value: number) => {
    if (value === displayAltitude(spiralTargetAlt)) return;
    setSpiralTargetAlt(nativeAltitude(value));
  }, [displayAltitude, nativeAltitude, spiralTargetAlt]);
  const setRevealClimbFromDisplay = useCallback((value: number) => {
    if (value === displayAltitude(revealClimb)) return;
    setRevealClimb(nativeAltitude(value));
  }, [displayAltitude, nativeAltitude, revealClimb]);
  const setClimbRtlAltFromDisplay = useCallback((value: number) => {
    if (value === displayAltitude(climbRtlAlt)) return;
    setClimbRtlAlt(nativeAltitude(value));
  }, [climbRtlAlt, displayAltitude, nativeAltitude]);
  const speedPrecision = UNIT_PRECISION.speed[speedUnit];
  const speedStep = 1 / (10 ** speedPrecision);
  const speedLabel = UNIT_LABELS.speed[speedUnit];
  const displaySpeed = useCallback(
    (mps: number) => Number(speedValueFromMetersPerSecond(mps, speedUnit).toFixed(speedPrecision)),
    [speedPrecision, speedUnit],
  );
  const nativeSpeed = useCallback(
    (value: number) => toMetersPerSecondFromSpeedUnit(value, speedUnit),
    [speedUnit],
  );
  const setRevealSpeedFromDisplay = useCallback((value: number) => {
    if (value === displaySpeed(revealSpeed)) return;
    setRevealSpeed(nativeSpeed(value));
  }, [displaySpeed, nativeSpeed, revealSpeed]);
  const setStrafeSpeedFromDisplay = useCallback((value: number) => {
    if (value === displaySpeed(strafeSpeed)) return;
    setStrafeSpeed(nativeSpeed(value));
  }, [displaySpeed, nativeSpeed, strafeSpeed]);
  const verticalSpeedPrecision = UNIT_PRECISION.verticalSpeed[verticalSpeedUnit];
  const verticalSpeedStep = 1 / (10 ** verticalSpeedPrecision);
  const verticalSpeedLabel = UNIT_LABELS.verticalSpeed[verticalSpeedUnit];
  const displayVerticalSpeed = useCallback(
    (mps: number) => Number(verticalSpeedValueFromMetersPerSecond(mps, verticalSpeedUnit).toFixed(verticalSpeedPrecision)),
    [verticalSpeedPrecision, verticalSpeedUnit],
  );
  const nativeVerticalSpeed = useCallback(
    (value: number) => toMetersPerSecondFromVerticalSpeedUnit(value, verticalSpeedUnit),
    [verticalSpeedUnit],
  );
  const setClimbRateFromDisplay = useCallback((value: number) => {
    if (value === displayVerticalSpeed(climbRate)) return;
    setClimbRate(nativeVerticalSpeed(value));
  }, [climbRate, displayVerticalSpeed, nativeVerticalSpeed]);

  // Confirm button styling per tab
  const confirmClass =
    tabId === 'move'  ? 'bg-cyan-600 hover:bg-cyan-500'   :
    tabId === 'land'  ? 'bg-rose-600 hover:bg-rose-500'   :
                        'bg-violet-600 hover:bg-violet-500';
  const confirmLabel =
    tabId === 'move' ? 'Confirm Move' :
    tabId === 'land' ? 'Confirm Land' :
                       luaCmdMeta.confirmLabel;
  const tabHint =
    tabId === 'move' ? 'Fly to this location at the chosen altitude' :
    tabId === 'land' ? 'Descend and land at this location' :
                       luaCmdMeta.hint;

  return (
    <div className="min-w-[260px] text-xs" onClick={(e) => e.stopPropagation()}>
      {/* Top-level tabs */}
      {visibleTabs.length > 1 && (
        <div className="flex rounded overflow-hidden border border-gray-700 mb-2">
          {visibleTabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTabId(t.id)}
              className={`flex-1 px-2 py-1 text-[11px] font-medium transition-colors ${
                tabId === t.id ? t.activeClass : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Lua sub-command picker — grouped by category so the list scales as
          new commands are added without truncating labels. */}
      {tabId === 'lua' && commandsByCategory.length > 0 && (
        <div className="mb-2 space-y-1.5">
          {commandsByCategory.map(({ category, commands }) => (
            <div key={category} className="flex items-center gap-2">
              <span className="text-[9px] font-semibold tracking-wider uppercase text-violet-300/70 w-14 shrink-0">
                {CATEGORY_LABELS[category]}
              </span>
              <div className="flex flex-wrap gap-1 flex-1">
                {commands.map(c => {
                  const Icon = c.icon;
                  const active = luaCmd === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setLuaCmd(c.id)}
                      title={c.hint}
                      className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded border transition-colors ${
                        active
                          ? 'bg-violet-700/70 text-white border-violet-500'
                          : 'bg-gray-800/70 text-gray-400 border-gray-700 hover:text-white hover:border-violet-700/60'
                      }`}
                    >
                      <Icon className="w-3 h-3" />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hint */}
      <div className="text-[10px] text-gray-400 mb-2 leading-tight">{tabHint}</div>

      {/* Coordinates + distance — inline to save vertical space */}
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="font-mono text-[11px] text-gray-300 truncate">
          {lat.toFixed(6)}, {lon.toFixed(6)}
        </span>
        <span className="text-[10px] text-gray-500 shrink-0">
          <span className="font-mono text-gray-300">{formatDistanceFromMeters(distanceMeters, distanceUnit)}</span> away
        </span>
      </div>

      {/* === MOVE / ORBIT / WATCHTOWER / REVEAL / STRAFE shared: altitude === */}
      {(
        tabId === 'move' ||
        (tabId === 'lua' && (
          luaCmd === 'orbit' || luaCmd === 'watchtower' ||
          luaCmd === 'reveal' || luaCmd === 'strafe'
        ))
      ) && (
        <Field label="Alt">
          <NumberInput value={displayAltitude(altitude)} onChange={setAltitudeFromDisplay} min={displayAltitude(2)} max={displayAltitude(5000)} step={altitudeStep} accent="cyan" autoFocus />
          <Suffix>{altitudeLabel}</Suffix>
        </Field>
      )}

      {/* === ORBIT === */}
      {tabId === 'lua' && luaCmd === 'orbit' && (
        <>
          <Field label="Radius">
            <NumberInput value={displayDistance(radius)} onChange={(n) => setRadius(nativeDistance(n))} min={displayDistanceBound(5)} max={displayDistanceBound(1000)} step={distanceStep} accent="violet" />
            <Suffix>{distanceLabel}</Suffix>
          </Field>
          <DirectionToggle direction={direction} onChange={setDirection} />
          <Field label="Orbits">
            <NumberInput value={revolutions} onChange={setRevolutions} min={0} max={50} step={1} accent="violet" />
            <Suffix>{revolutions === 0 ? '∞ (manual stop)' : revolutions === 1 ? 'circle' : 'circles'}</Suffix>
          </Field>
        </>
      )}

      {/* === SPIRAL === */}
      {tabId === 'lua' && luaCmd === 'spiral' && (
        <>
          <Field label="Radius">
            <NumberInput value={displayDistance(radius)} onChange={(n) => setRadius(nativeDistance(n))} min={displayDistanceBound(5)} max={displayDistanceBound(1000)} step={distanceStep} accent="violet" />
            <Suffix>{distanceLabel}</Suffix>
          </Field>
          <DirectionToggle direction={direction} onChange={setDirection} />
          <Field label="To alt">
            <NumberInput value={displayAltitude(spiralTargetAlt)} onChange={setSpiralTargetAltFromDisplay} min={displayAltitude(2)} max={displayAltitude(5000)} step={altitudeStep} accent="violet" />
            <Suffix>{altitudeLabel} {spiralTargetAlt > currentAltAgl ? `↑ from ${formatAltitudeFromMeters(currentAltAgl, altitudeUnit)}` : `↓ from ${formatAltitudeFromMeters(currentAltAgl, altitudeUnit)}`}</Suffix>
          </Field>
          <Field label="Climb">
            <NumberInput value={displayVerticalSpeed(climbRate)} onChange={setClimbRateFromDisplay} min={displayVerticalSpeed(0.1)} max={displayVerticalSpeed(10)} step={verticalSpeedStep} accent="violet" />
            <Suffix>{verticalSpeedLabel}</Suffix>
          </Field>
        </>
      )}

      {/* === WATCHTOWER === yaw rate + direction === */}
      {tabId === 'lua' && luaCmd === 'watchtower' && (
        <>
          <DirectionToggle direction={direction} onChange={setDirection} />
          <Field label="Yaw rate">
            <NumberInput value={yawRate} onChange={setYawRate} min={5} max={180} step={5} accent="violet" />
            <Suffix>°/s ({(360 / yawRate).toFixed(1)}s/rev)</Suffix>
          </Field>
        </>
      )}

      {/* === REVEAL === pullback distance + climb amount + speed === */}
      {tabId === 'lua' && luaCmd === 'reveal' && (
        <>
          <Field label="Pullback">
            <NumberInput value={displayDistance(revealPullback)} onChange={(n) => setRevealPullback(nativeDistance(n))} min={displayDistanceBound(5)} max={displayDistanceBound(500)} step={distanceStep} accent="violet" />
            <Suffix>{distanceLabel} back from current pos</Suffix>
          </Field>
          <Field label="Climb">
            <NumberInput value={displayAltitude(revealClimb)} onChange={setRevealClimbFromDisplay} min={displayAltitude(-100)} max={displayAltitude(200)} step={altitudeStep} accent="violet" />
            <Suffix>{altitudeLabel} {revealClimb >= 0 ? '↑' : '↓'} during pullback</Suffix>
          </Field>
          <Field label="Speed">
            <NumberInput value={displaySpeed(revealSpeed)} onChange={setRevealSpeedFromDisplay} min={displaySpeed(0.5)} max={displaySpeed(15)} step={speedStep} accent="violet" />
            <Suffix>{speedLabel} ({(revealPullback / Math.max(revealSpeed, 0.1)).toFixed(1)}s total)</Suffix>
          </Field>
          <div className="mb-2 px-2 py-1 rounded text-[10px] text-violet-200 bg-violet-900/30 border border-violet-700/40">
            Vehicle pulls back from its current position. Camera (yaw) stays locked on this target throughout.
          </div>
        </>
      )}

      {/* === STRAFE === offset + length + speed === */}
      {tabId === 'lua' && luaCmd === 'strafe' && (
        <>
          <Field label="Offset">
            <NumberInput value={displayDistance(strafeOffset)} onChange={(n) => setStrafeOffset(nativeDistance(n))} min={displayDistanceBound(2)} max={displayDistanceBound(300)} step={distanceStep} accent="violet" />
            <Suffix>{distanceLabel} clearance from target</Suffix>
          </Field>
          <Field label="Length">
            <NumberInput value={displayDistance(strafeLength)} onChange={(n) => setStrafeLength(nativeDistance(n))} min={displayDistanceBound(5)} max={displayDistanceBound(500)} step={distanceStep} accent="violet" />
            <Suffix>{distanceLabel} total dolly distance</Suffix>
          </Field>
          <Field label="Speed">
            <NumberInput value={displaySpeed(strafeSpeed)} onChange={setStrafeSpeedFromDisplay} min={displaySpeed(0.5)} max={displaySpeed(15)} step={speedStep} accent="violet" />
            <Suffix>{speedLabel} ({(strafeLength / Math.max(strafeSpeed, 0.1)).toFixed(1)}s total)</Suffix>
          </Field>
          <div className="mb-2 px-2 py-1 rounded text-[10px] text-violet-200 bg-violet-900/30 border border-violet-700/40">
            Vehicle dollies past the target on the side it's already on. Camera locked on target.
          </div>
        </>
      )}

      {/* === CLIMB+RTL === target altitude only === */}
      {tabId === 'lua' && luaCmd === 'climbRtl' && (
        <>
          <Field label="Climb to">
            <NumberInput value={displayAltitude(climbRtlAlt)} onChange={setClimbRtlAltFromDisplay} min={displayAltitude(5)} max={displayAltitude(500)} step={altitudeStep} accent="violet" />
            <Suffix>{altitudeLabel} AGL ({climbRtlAlt > currentAltAgl ? `↑ +${formatAltitudeFromMeters(climbRtlAlt - currentAltAgl, altitudeUnit)}` : 'already higher'})</Suffix>
          </Field>
          <div className="mb-2 px-2 py-1 rounded text-[10px] text-violet-200 bg-violet-900/30 border border-violet-700/40">
            Vehicle climbs in place, then FC switches to RTL mode for return.
          </div>
        </>
      )}

      {/* === LUA tab status === Path indicator + install offer */}
      {tabId === 'lua' && (
        <>
          <div className="mb-2 px-2 py-1 rounded text-[10px] flex items-center justify-between gap-2 bg-gray-800/60 border border-gray-700/60">
            <span className="text-gray-400">Execution:</span>
            {willUseScript ? (
              <span className="text-emerald-300 font-medium">via ArduDeck script (link-resilient)</span>
            ) : luaCmd === 'orbit' && scriptHealth.status === 'stale' ? (
              <span className="text-amber-400 font-medium">native fallback (script silent)</span>
            ) : luaCmd === 'orbit' ? (
              <span className="text-gray-300 font-medium">native (DO_ORBIT)</span>
            ) : scriptBlocked ? (
              <span className="text-rose-400 font-medium">unavailable - script required</span>
            ) : (
              <span className="text-emerald-300 font-medium">via ArduDeck script</span>
            )}
          </div>
          {scriptHealth.status === 'missing' && (
            <div className="mb-2 px-2 py-1 rounded bg-purple-900/40 border border-purple-600/40 text-[10px] text-purple-200 flex items-center justify-between gap-2">
              <span className="leading-tight truncate">
                <span className="font-semibold text-purple-300">Script not installed</span>
                <span className="text-purple-300/70"> — link-resilient mode</span>
              </span>
              <button
                onClick={() => setInstallModalOpen(true)}
                className="text-[10px] font-medium underline text-purple-200 hover:text-white shrink-0"
              >
                Install →
              </button>
            </div>
          )}
        </>
      )}

      {/* Mode switch warnings */}
      {needsModeSwitch && (
        <div className="px-2 py-1 mb-2 bg-yellow-900/40 border border-yellow-600/50 rounded text-yellow-400 text-[10px]">
          Will switch to GUIDED mode
        </div>
      )}
      {willSwitchToLand && (
        <div className="px-2 py-1 mb-2 bg-rose-900/40 border border-rose-600/50 rounded text-rose-400 text-[10px]">
          Will switch to LAND mode and descend
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleConfirm}
          disabled={scriptBlocked}
          className={`flex-1 px-3 py-1.5 text-white rounded text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${confirmClass}`}
        >
          {confirmLabel}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded text-xs transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* Keyboard hint footer */}
      <div className="mt-1.5 text-[9px] text-gray-500 text-center tracking-wide">
        <kbd className="font-mono text-gray-400">Enter</kbd> to confirm
        <span className="mx-1.5">·</span>
        <kbd className="font-mono text-gray-400">Esc</kbd> to cancel
      </div>

      <ScriptInstallModal open={installModalOpen} onClose={() => setInstallModalOpen(false)} />
    </div>
  );
};

// ── Small UI helpers (kept inline; tied to popup styling) ────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <label className="text-gray-400 w-16">{label}:</label>
      {children}
    </div>
  );
}

function Suffix({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] text-gray-500">{children}</span>;
}

function NumberInput({
  value, onChange, min, max, step, accent, autoFocus,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number; max: number; step: number;
  accent: 'cyan' | 'violet';
  autoFocus?: boolean;
}) {
  const focusBorder = accent === 'cyan' ? 'focus:border-cyan-400' : 'focus:border-violet-400';
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [focused, value]);

  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, n)), [max, min]);
  const resetDraft = useCallback(() => setDraft(String(value)), [value]);
  const commit = useCallback((n: number) => {
    const clamped = clamp(n);
    onChange(clamped);
    setDraft(String(clamped));
  }, [clamp, onChange]);

  return (
    <input
      type="number"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const nextDraft = e.target.value;
        setDraft(nextDraft);
        if (nextDraft.trim() === '') return;
        const parsed = Number(nextDraft);
        if (!Number.isFinite(parsed) || parsed < min || parsed > max) return;
        onChange(parsed);
      }}
      onBlur={() => {
        setFocused(false);
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        const parsed = Number(draft);
        if (draft.trim() === '' || !Number.isFinite(parsed)) {
          resetDraft();
          return;
        }
        commit(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          skipBlurCommitRef.current = true;
          resetDraft();
          e.currentTarget.blur();
        }
      }}
      min={min}
      max={max}
      step={step}
      autoFocus={autoFocus}
      className={`w-24 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white font-mono text-xs focus:outline-none ${focusBorder}`}
    />
  );
}

function DirectionToggle({ direction, onChange }: {
  direction: 'cw' | 'ccw';
  onChange: (d: 'cw' | 'ccw') => void;
}) {
  return (
    <Field label="Direction">
      <div className="flex rounded overflow-hidden border border-gray-600">
        <button
          onClick={() => onChange('cw')}
          className={`px-2 py-1 text-[11px] font-medium transition-colors ${
            direction === 'cw' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
          title="Clockwise (viewed from above)"
        >
          ↻ CW
        </button>
        <button
          onClick={() => onChange('ccw')}
          className={`px-2 py-1 text-[11px] font-medium transition-colors border-l border-gray-600 ${
            direction === 'ccw' ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
          }`}
          title="Counter-clockwise (viewed from above)"
        >
          ↺ CCW
        </button>
      </div>
    </Field>
  );
}
