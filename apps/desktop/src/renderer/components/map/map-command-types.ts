import { encodePx4CustomMode } from '../../../shared/telemetry-types';
import type { FirmwareSource } from '../../../shared/firmware-types';

/**
 * Map command types - extensible union for all commands issuable from the map.
 * Adding a new command: add to the union, add popup option, add IPC dispatch.
 *
 * `revolutions` (orbit only): 0 = infinite, N = stop after N full circles
 * `climbRate` / `targetAlt` (spiral only): script climbs at climbRate (m/s)
 *   while orbiting until targetAlt reached, then holds the orbit indefinitely.
 */
export type MapCommand =
  | { type: 'goto'; lat: number; lon: number; alt: number }
  | { type: 'orbit'; lat: number; lon: number; alt: number; radius: number; revolutions: number }
  | { type: 'spiral'; lat: number; lon: number; radius: number; startAlt: number; targetAlt: number; climbRate: number }
  | { type: 'watchtower'; lat: number; lon: number; alt: number; yawRate: number }
  | { type: 'climbRtl'; targetAlt: number }
  | { type: 'reveal'; lat: number; lon: number; alt: number; pullbackDist: number; climbAmount: number; speed: number }
  | { type: 'strafe'; lat: number; lon: number; alt: number; offsetDist: number; length: number; speed: number }
  | { type: 'land'; lat: number; lon: number };

export type MapCommandType = MapCommand['type'];

/** MAV_CMD_USER_1 - dispatcher for ArduDeck Lua sub-commands (param4 selects). */
const USER_CMD_AD = 31010;
/** Sub-command IDs - keep in sync with ardudeck_commands.lua SUB_CMD_*. */
const SUB_CMD = {
  ORBIT:      0,
  SPIRAL:     1,
  // 2 reserved (was POI)
  WATCHTOWER: 3,
  CLIMB_RTL:  4,
  REVEAL:     5,
  STRAFE:     6,
  LAND_AT:    7,
  STOP:       255,
} as const;

/** Sub-command IDs that take over the vehicle every tick (so they need a
 *  STOP before any subsequent native command, otherwise the script's tick
 *  keeps overriding the new target). Native-only commands (goto / land) do
 *  not need to be tracked here. */
const SCRIPT_HOLDS_VEHICLE: ReadonlySet<number> = new Set<number>([
  SUB_CMD.ORBIT, SUB_CMD.SPIRAL, SUB_CMD.WATCHTOWER, SUB_CMD.CLIMB_RTL,
  SUB_CMD.REVEAL, SUB_CMD.STRAFE,
]);

/** Send STOP to the script's MAV_CMD_USER_1 dispatcher. Idempotent — if no
 *  command is active the script simply ignores it. We swallow the result
 *  since this is a best-effort cleanup before issuing a native command. */
async function sendScriptStop(): Promise<void> {
  if (!window.electronAPI.mavlinkUserCommand) return;
  await window.electronAPI.mavlinkUserCommand(USER_CMD_AD, 0, 0, 0, 0, 0, 0, SUB_CMD.STOP);
}

/**
 * Path the dispatcher took. Useful for the popup to show "via script" or
 * "native" badges so the user knows which execution channel was used.
 */
export type DispatchPath = 'native' | 'script';

export interface DispatchOptions {
  /**
   * When true and the command has a script-backed alternative, prefer the
   * script-based path. Caller (popup) sets this based on script health.
   */
  preferScript?: boolean;
  /**
   * Firmware of the connected vehicle. PX4 does not honor ArduPilot's
   * COMMAND_LONG NAV_LAND and has no ArduDeck Lua script, so the `land`
   * command routes through a mode change to AUTO.LAND instead. ArduPilot
   * (undefined / 'ardupilot') keeps its native/script land path.
   */
  firmware?: FirmwareSource;
  /**
   * When true, send a STOP to the script's MAV_CMD_USER_1 dispatcher BEFORE
   * issuing the actual command. Used when transitioning from a script-managed
   * command (orbit / spiral / POI / watchtower / climb-RTL) to a native one
   * (Move / Land) — the script's per-tick set_target_location would otherwise
   * keep overriding the new native target. Caller (popup) sets this based on
   * the previously-active target type.
   */
  stopScriptFirst?: boolean;
}

export interface DispatchResult {
  success: boolean;
  path: DispatchPath;
}

/**
 * Dispatch a map command to the vehicle via IPC.
 *
 * For commands that can be served either by an ArduPilot built-in or by an
 * ArduDeck Lua script (currently just `orbit`), the caller decides which path
 * to take via `preferScript`. We don't probe FC capabilities here - the popup
 * already knows whether the script is healthy via useScriptHealth.
 */
export async function dispatchMapCommand(
  command: MapCommand,
  options: DispatchOptions = {},
): Promise<DispatchResult> {
  // Release the vehicle from any prior script-managed command before we
  // attempt to push a new (typically native) target. Sub-command STARTs
  // (orbit/spiral/poi/etc.) implicitly supersede each other on the script
  // side; only native commands need this preamble.
  if (options.stopScriptFirst) {
    await sendScriptStop();
  }
  // Mark SCRIPT_HOLDS_VEHICLE as referenced so the bundler doesn't tree-shake
  // the constant (it's exported semantically via the popup but not through TS
  // imports yet — this keeps the contract documented in one place).
  void SCRIPT_HOLDS_VEHICLE;
  switch (command.type) {
    case 'goto': {
      const ok = await window.electronAPI.mavlinkGoto(command.lat, command.lon, command.alt);
      return { success: ok, path: 'native' };
    }
    case 'orbit': {
      if (options.preferScript && window.electronAPI.mavlinkUserCommand) {
        // Script path: p1=radius(signed CW/CCW), p2=speed, p3=revolutions, p4=sub_id
        const ok = await window.electronAPI.mavlinkUserCommand(
          USER_CMD_AD,
          command.lat, command.lon, command.alt,
          command.radius, 0, command.revolutions, SUB_CMD.ORBIT,
        );
        return { success: ok, path: 'script' };
      }
      // Native fallback ignores revolutions (DO_ORBIT has no count param).
      const ok = await window.electronAPI.mavlinkOrbit(
        command.lat, command.lon, command.alt, command.radius,
      );
      return { success: ok, path: 'native' };
    }
    case 'spiral': {
      if (!window.electronAPI.mavlinkUserCommand) {
        return { success: false, path: 'script' };
      }
      const ok = await window.electronAPI.mavlinkUserCommand(
        USER_CMD_AD,
        command.lat, command.lon, command.targetAlt,
        command.radius, 0, command.climbRate, SUB_CMD.SPIRAL,
      );
      return { success: ok, path: 'script' };
    }
    case 'watchtower': {
      // Watchtower: hover at point, slow yaw rotation. p1 = yaw rate deg/s.
      if (!window.electronAPI.mavlinkUserCommand) {
        return { success: false, path: 'script' };
      }
      const ok = await window.electronAPI.mavlinkUserCommand(
        USER_CMD_AD,
        command.lat, command.lon, command.alt,
        command.yawRate, 0, 0, SUB_CMD.WATCHTOWER,
      );
      return { success: ok, path: 'script' };
    }
    case 'climbRtl': {
      // Climb-then-RTL: vehicle uses its own current lat/lon; we just send
      // target altitude. Sending 0,0 for lat/lon works because the script
      // reads ahrs:get_location() rather than trusting the message coords.
      if (!window.electronAPI.mavlinkUserCommand) {
        return { success: false, path: 'script' };
      }
      const ok = await window.electronAPI.mavlinkUserCommand(
        USER_CMD_AD,
        0, 0, command.targetAlt,
        0, 0, 0, SUB_CMD.CLIMB_RTL,
      );
      return { success: ok, path: 'script' };
    }
    case 'reveal': {
      // Reveal: p1=pullback (m), p2=climb (m, signed), p3=speed (m/s).
      // x/y/z are the click target; the script snapshots the vehicle's pose
      // at start to compute the away-from-target bearing.
      if (!window.electronAPI.mavlinkUserCommand) {
        return { success: false, path: 'script' };
      }
      const ok = await window.electronAPI.mavlinkUserCommand(
        USER_CMD_AD,
        command.lat, command.lon, command.alt,
        command.pullbackDist, command.climbAmount, command.speed, SUB_CMD.REVEAL,
      );
      return { success: ok, path: 'script' };
    }
    case 'strafe': {
      // Strafe: p1=offset (m), p2=length (m), p3=speed (m/s).
      // x/y = target; z = dolly altitude.
      if (!window.electronAPI.mavlinkUserCommand) {
        return { success: false, path: 'script' };
      }
      const ok = await window.electronAPI.mavlinkUserCommand(
        USER_CMD_AD,
        command.lat, command.lon, command.alt,
        command.offsetDist, command.length, command.speed, SUB_CMD.STRAFE,
      );
      return { success: ok, path: 'script' };
    }
    case 'land': {
      // PX4 ignores COMMAND_LONG NAV_LAND and has no ArduDeck Lua script, so
      // land via a mode change to AUTO.LAND (main=4, sub=6). Lands in place.
      if (options.firmware === 'px4') {
        const ok = await window.electronAPI.mavlinkSetMode(encodePx4CustomMode(4, 6));
        return { success: ok, path: 'native' };
      }
      // ArduCopter's native MAV_CMD_NAV_LAND ignores the lat/lon and just
      // descends in place. Prefer the script's LAND_AT (fly-to-then-LAND)
      // when available; fall back to native NAV_LAND only if the script
      // isn't installed.
      if (options.preferScript && window.electronAPI.mavlinkUserCommand) {
        const ok = await window.electronAPI.mavlinkUserCommand(
          USER_CMD_AD,
          command.lat, command.lon, 0,  // z=0 → script uses current alt as approach alt
          0, 0, 0, SUB_CMD.LAND_AT,
        );
        return { success: ok, path: 'script' };
      }
      const ok = await window.electronAPI.mavlinkLand(command.lat, command.lon);
      return { success: ok, path: 'native' };
    }
  }
}

/**
 * Active command target on the map (for visualization).
 * Carries enough info to render the right overlay per command type.
 */
export type ActiveCommandTarget =
  | { type: 'goto'; lat: number; lon: number; alt: number }
  | { type: 'orbit'; lat: number; lon: number; alt: number; radius: number }
  | { type: 'spiral'; lat: number; lon: number; radius: number; startAlt: number; targetAlt: number }
  | { type: 'watchtower'; lat: number; lon: number; alt: number; yawRate: number }
  | { type: 'climbRtl'; targetAlt: number }
  | { type: 'reveal'; lat: number; lon: number; alt: number; pullbackDist: number }
  | { type: 'strafe'; lat: number; lon: number; alt: number; offsetDist: number; length: number }
  | { type: 'land'; lat: number; lon: number };
