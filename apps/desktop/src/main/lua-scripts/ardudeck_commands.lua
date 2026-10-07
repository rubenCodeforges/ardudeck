-- ArduDeck Commands - heartbeat + MAV_CMD_USER_1 sub-command dispatcher.
--
-- Verified against ArduPilot's own examples:
--   examples/MAVLink_Commands.lua  - the canonical receive pattern
--   examples/command_int.lua       - the canonical send pattern
--
-- Manifest (must stay in sync with src/main/script-installer/bundle.ts):
--   version: 1.2.0
--   heartbeat: NAMED_VALUE_FLOAT('AD_HB', SCRIPT_VERSION) every 1 s
--   command:   MAV_CMD_USER_1 (31010) via COMMAND_INT (msgid 75)
--
-- USER_1 sub-command dispatch — uses param4 to discriminate so we can fit
-- many commands in a single MAV_CMD slot. Adding a new command means:
--   1. Define a new SUB_CMD_* constant here AND in shared/script-installer-types
--   2. Implement start_<cmd>(c) and (optionally) step_<cmd>(now_ms)
--   3. Wire it into the dispatch table below
--
-- Critical things learned the hard way:
--   * mavlink:init(buffer_depth, num_rx_msgids) — args are (depth, n) NOT (n, depth)
--   * mavlink:block_command(cmd_id) is MANDATORY, otherwise ArduPilot's native
--     command handler intercepts unknown commands (USER_1) with a synchronous
--     ACK UNSUPPORTED and never forwards the message to scripts.
--   * mavlink:receive_chan() returns the full mavlink_message_t C struct dumped
--     as a string; payload starts at byte 13 (1-indexed).
--
-- Common params for all sub-commands:
--   x  = center latitude  * 1e7
--   y  = center longitude * 1e7
--   z  = altitude (m, relative to home)  -- target altitude for SPIRAL
--   p4 = sub-command id (0=ORBIT, 1=SPIRAL, 3=WATCHTOWER, 4=CLIMB_RTL,
--                        5=REVEAL, 6=STRAFE, 255=STOP)
--
-- Sub-command-specific params:
--   ORBIT:  p1 = radius (m, signed: +CW, -CCW)
--           p2 = speed  (m/s, 0 -> 5 default)
--           p3 = revolutions (0 = infinite, N = stop after N full circles
--                 then hover at last position on the orbit)
--   SPIRAL: p1 = radius (m, signed: +CW, -CCW)
--           p2 = speed  (m/s, 0 -> 5 default)
--           p3 = climb_rate (m/s, abs value; sign of (target_alt - current_alt)
--                 chooses up vs down). Script climbs at this rate while
--                 orbiting until z (target alt) is reached, then continues
--                 orbiting at the target altitude indefinitely.
--   REVEAL: p1 = pullback_distance (m)
--           p2 = climb_amount      (m, signed Δalt over the move)
--           p3 = speed             (m/s, default 3)
--           Vehicle pulls back from current position along the away-from-
--           target bearing while climbing, yaw locked to target throughout.
--   STRAFE: p1 = offset_distance (m, perpendicular clearance)
--           p2 = strafe_length   (m, total dolly length centered on closest pt)
--           p3 = speed           (m/s, default 3)
--           Vehicle dollies past the click target on the side it is already
--           on, yaw locked throughout.
--
-- Diagnostic NAMED_VALUE_FLOATs published every second:
--   AD_HB  - heartbeat / script version
--   AD_RX  - count of COMMAND_INT messages received
--   AD_USR - count of MAV_CMD_USER_1 commands matched & dispatched
--   AD_TGT - count of vehicle:set_target_location calls that returned true
--   AD_ERR - count of errors (parse / set_target failures)
--   AD_ANG - current orbit angle in degrees (0 if no active command)
--   AD_SUB - current active sub-command id (-1 = idle)

local SCRIPT_VERSION = 1.2
local UPDATE_INTERVAL_MS = 100   -- 10 Hz

local MSG_COMMAND_INT = 75
local MAV_CMD_USER_1  = 31010

-- Sub-command IDs (keep in sync with shared/script-installer-types.ts SUB_CMD)
-- Sub-id 2 was POI ("hold + yaw to face point") - removed: useless without
-- live RC-stick passthrough and we did not want the complexity for a feature
-- that did not earn its keep. Slot 2 is intentionally left vacant for clarity.
local SUB_CMD_ORBIT       = 0
local SUB_CMD_SPIRAL      = 1
local SUB_CMD_WATCHTOWER  = 3  -- hover at clicked point, slow 360 yaw rotation
local SUB_CMD_CLIMB_RTL   = 4  -- climb in place to safe alt, then RTL
local SUB_CMD_REVEAL      = 5  -- pull back + climb, yaw locked to clicked target
local SUB_CMD_STRAFE      = 6  -- dolly past clicked target at perp offset
local SUB_CMD_LAND_AT     = 7  -- fly to clicked point at current alt, then LAND
local SUB_CMD_STOP        = 255 -- deactivate any active command (frees the
                                 -- vehicle so the GCS can issue native ones)

local APM_BUILD_ARDUCOPTER = 2  -- AP_Vehicle_Type.h
local APM_BUILD_ARDUPLANE  = 3

-- Flight mode numbers (ArduCopter)
local COPTER_MODE_GUIDED = 4   -- ensure_guided() switches to this before any cmd
local COPTER_MODE_RTL    = 6
local COPTER_MODE_LAND   = 9

local hb_counter = 0
local HB_DIVIDER = 10

local stats = { rx = 0, user_cmd = 0, set_target_ok = 0, errors = 0 }

-- Active command state. Shared between commands so we hold one at a time
-- (issuing a new command supersedes the previous one cleanly).
local cmd_state = {
  active        = false,
  sub_id        = -1,
  center        = nil,    -- Location_ud (orbit/spiral center, watchtower hover, climb_rtl point)
  target_alt_m  = 0,      -- desired final altitude (relative)
  current_alt_m = 0,      -- altitude we're currently commanding (walked for SPIRAL)
  radius_m      = 0,      -- signed: + CW, - CCW
  angle_rad     = 0,      -- accumulated angle in radians (monotonic, signed)
  last_step_ms  = 0,
  speed_mps     = 5,
  climb_mps     = 0,      -- 0 for ORBIT; signed for SPIRAL
  max_angle_rad = 0,      -- 0 = infinite; ORBIT stops when |angle_rad| reaches this
  -- WATCHTOWER-specific: target yaw rate in deg/sec (signed +CW, -CCW)
  yaw_rate_dps  = 0,
  current_yaw_deg = 0,
  -- REVEAL/STRAFE-specific:
  --   start_loc      Location_ud, vehicle pose at command start
  --   start_alt_m    altitude (m, relative) at command start
  --   walk_total_m   total distance to walk along bearing_deg
  --   walked_m       distance walked so far
  --   bearing_deg    direction to walk (REVEAL: away from target,
  --                                     STRAFE: along the dolly axis)
  start_loc     = nil,
  start_alt_m   = 0,
  walk_total_m  = 0,
  walked_m      = 0,
  bearing_deg   = 0,
  -- Set true once the vehicle has reached the orbit ring. Until then we are
  -- in "approach phase": fly horizontally to the closest ring point at the
  -- starting altitude, no angular motion, no climb. Prevents spiral from
  -- finishing its altitude walk during the approach instead of during the
  -- actual orbit.
  approach_done = false,
}

gcs:send_text(6, string.format('ArduDeck commands v%.1f loaded', SCRIPT_VERSION))

local mavlink_ready = false
do
  local ok, err = pcall(function()
    mavlink:init(10, 4)
    mavlink:register_rx_msgid(MSG_COMMAND_INT)
    mavlink:block_command(MAV_CMD_USER_1)
  end)
  mavlink_ready = ok
  if not ok then
    gcs:send_text(4, 'ArduDeck: mavlink init FAILED: ' .. tostring(err))
  else
    gcs:send_text(6, 'ArduDeck: mavlink rx ready (COMMAND_INT, USER_1 blocked)')
  end
end

-- COMMAND_INT (msgid 75) PAYLOAD layout, size-sorted per MAVLink rules:
--   payload@0  param1..4 (4x float)   16 B
--   payload@16 x, y      (2x int32)    8 B   degrees * 1e7
--   payload@24 z         (float)        4 B   meters
--   payload@28 command   (uint16)       2 B
--   payload@30 target_system, target_component, frame, current, autocontinue
local PAYLOAD_OFFSET = 13   -- 1-indexed byte where payload starts in msg
local function parse_command_int(buf)
  if buf == nil or #buf < 42 then return nil end
  local ok, p1, p2, p3, p4, x, y, z, cmd, tsys, tcomp =
    pcall(string.unpack, '<ffffiifHBB', buf, PAYLOAD_OFFSET)
  if not ok then
    stats.errors = stats.errors + 1
    return nil
  end
  return {
    param1 = p1, param2 = p2, param3 = p3, param4 = p4,
    x = x, y = y, z = z, command = cmd,
    target_system = tsys, target_component = tcomp,
  }
end

-- Read the vehicle's current AGL (relative) altitude in meters. Used as the
-- starting altitude for SPIRAL so the climb begins from where the vehicle is.
local function current_relative_alt_m()
  local loc = ahrs:get_location()
  if loc == nil then return 0 end
  -- Convert to relative (above home) cm, then to meters.
  local home = ahrs:get_home()
  if home == nil then return loc:alt() / 100 end
  return (loc:alt() - home:alt()) / 100
end

local function build_center(c, alt_m)
  local center = Location()
  center:lat(c.x)
  center:lng(c.y)
  center:alt(math.floor(alt_m * 100))
  center:relative_alt(true)
  return center
end

local function start_orbit(c)
  local revolutions = math.max(0, math.floor((c.param3 or 0) + 0.5))
  cmd_state.sub_id        = SUB_CMD_ORBIT
  cmd_state.target_alt_m  = c.z
  cmd_state.current_alt_m = c.z
  cmd_state.center        = build_center(c, c.z)
  cmd_state.radius_m      = c.param1
  cmd_state.speed_mps     = (c.param2 ~= nil and c.param2 > 0.1) and c.param2 or 5
  cmd_state.climb_mps     = 0
  cmd_state.angle_rad     = 0
  cmd_state.last_step_ms  = millis():tofloat()
  cmd_state.max_angle_rad = revolutions * 2 * math.pi
  cmd_state.approach_done = false
  cmd_state.active        = true
  local rev_label = revolutions == 0 and '∞' or tostring(revolutions)
  gcs:send_text(6, string.format(
    'ArduDeck ORBIT: r=%.1f alt=%.1f v=%.1f revs=%s',
    math.abs(cmd_state.radius_m), cmd_state.target_alt_m, cmd_state.speed_mps, rev_label))
end

local function start_spiral(c)
  cmd_state.sub_id        = SUB_CMD_SPIRAL
  cmd_state.target_alt_m  = c.z
  cmd_state.current_alt_m = current_relative_alt_m()
  cmd_state.center        = build_center(c, cmd_state.current_alt_m)
  cmd_state.radius_m      = c.param1
  cmd_state.speed_mps     = (c.param2 ~= nil and c.param2 > 0.1) and c.param2 or 5
  cmd_state.climb_mps     = math.abs(c.param3 or 1)
  cmd_state.angle_rad     = 0
  cmd_state.last_step_ms  = millis():tofloat()
  cmd_state.max_angle_rad = 0   -- SPIRAL completes on altitude, not revolutions
  cmd_state.approach_done = false
  cmd_state.active        = true
  gcs:send_text(6, string.format(
    'ArduDeck SPIRAL: r=%.1f alt %.1f→%.1f climb=%.1f v=%.1f',
    math.abs(cmd_state.radius_m), cmd_state.current_alt_m, cmd_state.target_alt_m,
    cmd_state.climb_mps, cmd_state.speed_mps))
end

-- Ensure the vehicle is in GUIDED mode. Lua position commands
-- (set_target_location / set_target_pos_NED) silently no-op outside GUIDED,
-- which was the root cause of "the new commands do nothing" — the GCS popup
-- showed a "will switch to GUIDED" warning but never actually issued the
-- mode change. We do it here so every Lua sub-command works regardless of
-- the FC's prior mode.
local function ensure_guided()
  local mode = vehicle:get_mode()
  if mode == COPTER_MODE_GUIDED then return true end
  local ok, result = pcall(vehicle.set_mode, vehicle, COPTER_MODE_GUIDED)
  if not ok or not result then
    stats.errors = stats.errors + 1
    gcs:send_text(4, string.format(
      'ArduDeck: set_mode(GUIDED) failed (was mode=%s armed=%s)',
      tostring(mode), tostring(arming:is_armed())))
    return false
  end
  gcs:send_text(6, string.format('ArduDeck: switched to GUIDED (was %s)', tostring(mode)))
  return true
end

-- Wrap vehicle:set_target_location with stats + error reporting so each step
-- function gets uniform behaviour.
local function safe_set_target_location(target)
  local ok, result = pcall(vehicle.set_target_location, vehicle, target)
  if not ok then
    stats.errors = stats.errors + 1
    gcs:send_text(4, 'ArduDeck: set_target_location threw: ' .. tostring(result))
    cmd_state.active = false
    return false
  end
  if result then
    stats.set_target_ok = stats.set_target_ok + 1
    return true
  end
  stats.errors = stats.errors + 1
  if stats.set_target_ok == 0 then
    gcs:send_text(4, string.format(
      'ArduDeck: set_target_location returned false (mode=%s armed=%s)',
      tostring(vehicle:get_mode()), tostring(arming:is_armed())))
  end
  return false
end

-- Push a position+yaw target via vehicle:set_target_pos_NED. This is the
-- canonical ArduPilot Lua API for "go to NED point with specific heading".
-- We convert the supplied Location to NED relative to home using the
-- documented Location:get_distance_NE helper.
--
-- Returns true if the target was accepted, false otherwise.
local function safe_set_pos_ned_with_yaw(target_loc, yaw_deg)
  local home = ahrs:get_home()
  if home == nil or target_loc == nil then return false end
  local ne = home:get_distance_NE(target_loc)
  if ne == nil then return false end
  local target_alt_cm = target_loc:alt() or 0
  local home_alt_cm   = home:alt() or 0
  -- target_loc may be relative_alt; if so its :alt() is already AGL in cm.
  -- Otherwise it is absolute and we need height-above-home.
  local agl_m
  if target_loc:relative_alt() then
    agl_m = target_alt_cm / 100
  else
    agl_m = (target_alt_cm - home_alt_cm) / 100
  end
  -- NED: D is positive-down, so flying altitude = negative D.
  local pos = Vector3f()
  pos:x(ne:x())
  pos:y(ne:y())
  pos:z(-agl_m)
  local normalized_yaw = (yaw_deg % 360 + 360) % 360
  -- (target_NED, use_yaw, yaw_deg, use_yaw_rate, yaw_rate_degs, yaw_relative, terrain_alt)
  local ok, result = pcall(vehicle.set_target_pos_NED, vehicle, pos,
    true, normalized_yaw, false, 0, false, false)
  if not ok then
    stats.errors = stats.errors + 1
    gcs:send_text(4, 'ArduDeck: set_target_pos_NED threw: ' .. tostring(result))
    return false
  end
  if result then
    stats.set_target_ok = stats.set_target_ok + 1
    return true
  end
  stats.errors = stats.errors + 1
  if stats.set_target_ok == 0 then
    gcs:send_text(4, string.format(
      'ArduDeck: set_target_pos_NED returned false (mode=%s armed=%s)',
      tostring(vehicle:get_mode()), tostring(arming:is_armed())))
  end
  return false
end

-- Threshold for declaring the vehicle "on" the orbit ring (metres). Picked
-- to be loose enough that wind / approach overshoot don't keep us bouncing
-- between approach and orbiting modes, but tight enough that orbit handover
-- looks visually clean.
local APPROACH_TOLERANCE_M = 5

-- Step function: ORBIT + SPIRAL share the orbital geometry path.
--
-- Two phases:
--   1. Approach — fly horizontally to the closest point on the ring at the
--      starting altitude. Angle is NOT incremented; SPIRAL altitude is NOT
--      walked. Without this, the vehicle climbs/descends en route to the ring
--      and the spiral "completes" before any actual orbiting happens.
--   2. Orbiting — angle accumulates at omega = speed/radius, SPIRAL walks
--      altitude per tick, target is pushed every tick.
local function step_orbit_or_spiral(now_ms)
  if cmd_state.center == nil then return end
  local dt = (now_ms - cmd_state.last_step_ms) / 1000
  if dt <= 0 then return end
  cmd_state.last_step_ms = now_ms

  local r = math.abs(cmd_state.radius_m)
  if r < 1 then return end

  -- ── Approach phase ──────────────────────────────────────────────
  if not cmd_state.approach_done then
    local here = ahrs:get_location()
    if here == nil then return end

    local dist_to_center = cmd_state.center:get_distance(here) or 0
    if math.abs(dist_to_center - r) <= APPROACH_TOLERANCE_M then
      -- We're on the ring. Lock in the angular position we arrived at so the
      -- orbit picks up from here instead of snapping to angle=0.
      local bearing_rad = cmd_state.center:get_bearing(here)
      if bearing_rad ~= nil then cmd_state.angle_rad = bearing_rad end
      cmd_state.approach_done = true
      gcs:send_text(6, 'ArduDeck: on ring, beginning orbit')
      -- Fall through into orbital step so this tick still produces motion.
    else
      -- Still flying toward the ring. Command the closest ring point at
      -- the START altitude (current_alt_m, which is set in start_*).
      local bearing_rad = cmd_state.center:get_bearing(here)
      local bearing_deg = bearing_rad ~= nil and math.deg(bearing_rad) or 0
      local approach = cmd_state.center:copy()
      approach:offset_bearing(bearing_deg, r)
      approach:alt(math.floor(cmd_state.current_alt_m * 100))
      approach:relative_alt(true)
      safe_set_target_location(approach)
      return
    end
  end

  -- ── Orbital phase ──────────────────────────────────────────────
  local omega = cmd_state.speed_mps / r
  if cmd_state.radius_m < 0 then omega = -omega end
  cmd_state.angle_rad = cmd_state.angle_rad + omega * dt

  -- ORBIT-only: stop after max_angle_rad of accumulated rotation.
  if cmd_state.sub_id == SUB_CMD_ORBIT
     and cmd_state.max_angle_rad > 0
     and math.abs(cmd_state.angle_rad) >= cmd_state.max_angle_rad then
    cmd_state.active = false
    gcs:send_text(6, string.format('ArduDeck ORBIT: complete (%d revs)',
      math.floor(cmd_state.max_angle_rad / (2 * math.pi))))
    return
  end

  -- SPIRAL altitude walk happens ONLY while orbiting (after approach_done).
  if cmd_state.sub_id == SUB_CMD_SPIRAL and cmd_state.climb_mps > 0 then
    local remaining = cmd_state.target_alt_m - cmd_state.current_alt_m
    local step = cmd_state.climb_mps * dt
    if math.abs(step) >= math.abs(remaining) then
      cmd_state.current_alt_m = cmd_state.target_alt_m
      cmd_state.climb_mps = 0
      gcs:send_text(6, string.format('ArduDeck SPIRAL: target alt %.1fm reached, holding orbit',
        cmd_state.target_alt_m))
    else
      cmd_state.current_alt_m = cmd_state.current_alt_m
        + (remaining > 0 and step or -step)
    end
  end

  local target = cmd_state.center:copy()
  local bearing_deg = (math.deg(cmd_state.angle_rad) % 360 + 360) % 360
  target:offset_bearing(bearing_deg, r)
  target:alt(math.floor(cmd_state.current_alt_m * 100))
  target:relative_alt(true)
  safe_set_target_location(target)
end

-- Watchtower: hover at clicked center, yaw at yaw_rate_dps continuously.
-- Has the same approach-phase semantics as orbit/spiral: fly to the hover
-- point first, only THEN start spinning. Without this the vehicle starts
-- yawing en route and looks chaotic before it's even arrived.
local function step_watchtower(now_ms)
  if cmd_state.center == nil then return end
  local dt = (now_ms - cmd_state.last_step_ms) / 1000
  if dt <= 0 then return end
  cmd_state.last_step_ms = now_ms

  if not cmd_state.approach_done then
    local here = ahrs:get_location()
    if here == nil then return end
    local dist = cmd_state.center:get_distance(here) or 0
    if dist <= APPROACH_TOLERANCE_M then
      -- Arrived at the watch point. Initialize yaw to current heading so the
      -- spin starts from where the vehicle is facing rather than snapping.
      local yaw_rad = ahrs:get_yaw()
      if yaw_rad ~= nil then
        cmd_state.current_yaw_deg = (math.deg(yaw_rad) % 360 + 360) % 360
      end
      cmd_state.approach_done = true
      gcs:send_text(6, 'ArduDeck WATCHTOWER: at point, beginning rotation')
      -- Fall through to the rotation step.
    else
      -- Approach: just send the target location, no yaw command yet so the
      -- vehicle keeps its travel-direction heading on the way in.
      safe_set_target_location(cmd_state.center)
      return
    end
  end

  cmd_state.current_yaw_deg = (cmd_state.current_yaw_deg + cmd_state.yaw_rate_dps * dt) % 360
  safe_set_pos_ned_with_yaw(cmd_state.center, cmd_state.current_yaw_deg)
end

-- Climb-then-RTL: command vehicle to current lat/lon at target altitude.
-- Once reached (within 2 m), switch the FC to RTL mode.
local function step_climb_rtl(_now_ms)
  if cmd_state.center == nil then return end
  safe_set_target_location(cmd_state.center)
  -- Check if we've reached safe altitude.
  local here = ahrs:get_location()
  if here == nil then return end
  local home = ahrs:get_home()
  if home == nil then return end
  local current_rel_alt = (here:alt() - home:alt()) / 100
  if math.abs(current_rel_alt - cmd_state.target_alt_m) < 2 then
    -- Switch to RTL. vehicle:set_mode returns boolean.
    local ok = pcall(vehicle.set_mode, vehicle, COPTER_MODE_RTL)
    if ok then
      gcs:send_text(6, string.format('ArduDeck CLIMB_RTL: at %.1fm, switching to RTL', current_rel_alt))
      cmd_state.active = false
    end
  end
end

-- Reveal: snapshot vehicle pose, compute the "away-from-target" bearing once,
-- then walk the position along that bearing while climbing/descending and
-- keeping yaw locked to the click target. Cinematic "castle reveal" shot.
-- Note: yaw is recomputed every tick from the walked position toward the
-- target, so the camera tracks naturally as the vehicle pulls back.
local function step_reveal(now_ms)
  if cmd_state.center == nil or cmd_state.start_loc == nil then return end
  local dt = (now_ms - cmd_state.last_step_ms) / 1000
  if dt <= 0 then return end
  cmd_state.last_step_ms = now_ms

  cmd_state.walked_m = math.min(
    cmd_state.walked_m + cmd_state.speed_mps * dt,
    cmd_state.walk_total_m)
  local progress = cmd_state.walk_total_m > 0
    and (cmd_state.walked_m / cmd_state.walk_total_m) or 1

  local walked = cmd_state.start_loc:copy()
  walked:offset_bearing(cmd_state.bearing_deg, cmd_state.walked_m)
  local current_alt = cmd_state.start_alt_m
    + (cmd_state.target_alt_m - cmd_state.start_alt_m) * progress
  walked:alt(math.floor(current_alt * 100))
  walked:relative_alt(true)

  local yaw_rad = walked:get_bearing(cmd_state.center)
  local yaw_deg = yaw_rad ~= nil and math.deg(yaw_rad) or 0
  safe_set_pos_ned_with_yaw(walked, yaw_deg)

  if cmd_state.walked_m >= cmd_state.walk_total_m then
    gcs:send_text(6, 'ArduDeck REVEAL: complete, holding')
    cmd_state.active = false
  end
end

-- Strafe / dolly pass: fly along an axis perpendicular to the
-- target-to-vehicle bearing at a chosen offset, looking at the target the
-- whole way. Two phases: fly to the dolly start point (yaw locked already),
-- then walk along the axis to the end point.
local function step_strafe(now_ms)
  if cmd_state.center == nil or cmd_state.start_loc == nil then return end
  local dt = (now_ms - cmd_state.last_step_ms) / 1000
  if dt <= 0 then return end
  cmd_state.last_step_ms = now_ms

  if not cmd_state.approach_done then
    local here = ahrs:get_location()
    if here == nil then return end
    local d = cmd_state.start_loc:get_distance(here) or 0
    if d <= APPROACH_TOLERANCE_M then
      cmd_state.approach_done = true
      gcs:send_text(6, 'ArduDeck STRAFE: at start, beginning dolly')
    else
      local yaw_rad = here:get_bearing(cmd_state.center)
      local yaw_deg = yaw_rad ~= nil and math.deg(yaw_rad) or 0
      safe_set_pos_ned_with_yaw(cmd_state.start_loc, yaw_deg)
      return
    end
  end

  cmd_state.walked_m = math.min(
    cmd_state.walked_m + cmd_state.speed_mps * dt,
    cmd_state.walk_total_m)

  local walked = cmd_state.start_loc:copy()
  walked:offset_bearing(cmd_state.bearing_deg, cmd_state.walked_m)
  walked:alt(math.floor(cmd_state.target_alt_m * 100))
  walked:relative_alt(true)

  local yaw_rad = walked:get_bearing(cmd_state.center)
  local yaw_deg = yaw_rad ~= nil and math.deg(yaw_rad) or 0
  safe_set_pos_ned_with_yaw(walked, yaw_deg)

  if cmd_state.walked_m >= cmd_state.walk_total_m then
    gcs:send_text(6, 'ArduDeck STRAFE: complete, holding')
    cmd_state.active = false
  end
end

-- Land-at-point: native MAV_CMD_NAV_LAND in GUIDED mode just switches to LAND
-- which descends in place — it does NOT respect the lat/lon supplied. To land
-- AT a specific clicked point we fly there in GUIDED first, then switch to
-- LAND mode once close. Same pattern as CLIMB_RTL but reversed (move-then-
-- mode-change instead of climb-then-mode-change).
local function step_land_at(_now_ms)
  if cmd_state.center == nil then return end
  safe_set_target_location(cmd_state.center)
  local here = ahrs:get_location()
  if here == nil then return end
  local d = cmd_state.center:get_distance(here) or 0
  if d <= APPROACH_TOLERANCE_M then
    local ok = pcall(vehicle.set_mode, vehicle, COPTER_MODE_LAND)
    if ok then
      gcs:send_text(6, string.format('ArduDeck LAND_AT: at point (%.1fm), switching to LAND', d))
      cmd_state.active = false
    end
  end
end

-- Per-sub-command step dispatcher. Adding a new command: write start_X +
-- step_X, register start_X in `dispatch` below and step_X here.
local steppers = {
  [SUB_CMD_ORBIT]      = step_orbit_or_spiral,
  [SUB_CMD_SPIRAL]     = step_orbit_or_spiral,
  [SUB_CMD_WATCHTOWER] = step_watchtower,
  [SUB_CMD_CLIMB_RTL]  = step_climb_rtl,
  [SUB_CMD_REVEAL]     = step_reveal,
  [SUB_CMD_STRAFE]     = step_strafe,
  [SUB_CMD_LAND_AT]    = step_land_at,
}

-- plane_steppers is defined further down; looked up at call time
local plane_steppers_ref = nil

local function step_command(now_ms)
  if not cmd_state.active then return end
  local table_ = cmd_state.plane and plane_steppers_ref or steppers
  local stepper = table_ and table_[cmd_state.sub_id]
  if stepper then stepper(now_ms) end
end

-- Watchtower: hover at clicked center, slow yaw rotation. Useful for quick
-- 360° panoramas / "what's around me" surveys.
-- Params: x = lat*1e7, y = lon*1e7, z = altitude (m, relative)
--         p1 = yaw_rate (deg/s, signed: +CW, -CCW; default 30)
local function start_watchtower(c)
  local rate = c.param1
  if rate == nil or math.abs(rate) < 0.1 then rate = 30 end
  cmd_state.sub_id          = SUB_CMD_WATCHTOWER
  cmd_state.center          = build_center(c, c.z)
  cmd_state.yaw_rate_dps    = rate
  cmd_state.current_yaw_deg = 0
  cmd_state.last_step_ms    = millis():tofloat()
  cmd_state.approach_done   = false
  cmd_state.active          = true
  gcs:send_text(6, string.format('ArduDeck WATCHTOWER: alt=%.1f rate=%.1f°/s',
    c.z, rate))
end

-- Climb-then-RTL: command vehicle to climb in place to a safe altitude, then
-- the FC switches to RTL for the actual return. Solves "RTL into a tree"
-- when current alt is below RTL_ALT.
-- Params: z = target relative altitude (m). x/y are ignored - we use the
--         vehicle's current lat/lon as the climb anchor.
local function start_climb_rtl(c)
  local here = ahrs:get_location()
  if here == nil then
    gcs:send_text(4, 'ArduDeck CLIMB_RTL: ahrs:get_location returned nil')
    return
  end
  -- Climb anchor: vehicle's current lat/lon at the requested target altitude.
  local anchor = Location()
  anchor:lat(here:lat())
  anchor:lng(here:lng())
  anchor:alt(math.floor(c.z * 100))
  anchor:relative_alt(true)
  cmd_state.sub_id       = SUB_CMD_CLIMB_RTL
  cmd_state.center       = anchor
  cmd_state.target_alt_m = c.z
  cmd_state.last_step_ms = millis():tofloat()
  cmd_state.active       = true
  gcs:send_text(6, string.format('ArduDeck CLIMB_RTL: climbing to %.1fm then RTL', c.z))
end

-- Reveal: pull back from the vehicle's current position along the away-from-
-- target bearing while climbing/descending, yaw locked to the click target.
-- Params: x, y = target lat/lon (look-at point)
--         z    = target altitude (m, relative; informational, not used in
--                computation since yaw is purely horizontal)
--         p1   = pullback_distance_m  (how far to retreat)
--         p2   = climb_amount_m       (signed Δalt over the duration)
--         p3   = speed_mps            (default 3 m/s for cinematic feel)
local function start_reveal(c)
  local here = ahrs:get_location()
  if here == nil then
    gcs:send_text(4, 'ArduDeck REVEAL: ahrs:get_location nil')
    return
  end
  local target_loc = build_center(c, c.z)
  local back_bearing_rad = target_loc:get_bearing(here)
  if back_bearing_rad == nil then
    gcs:send_text(4, 'ArduDeck REVEAL: get_bearing nil')
    return
  end

  local pullback = math.max(1, c.param1 or 10)
  local climb    = c.param2 or 0
  local speed    = (c.param3 ~= nil and c.param3 > 0.1) and c.param3 or 3

  cmd_state.sub_id        = SUB_CMD_REVEAL
  cmd_state.center        = target_loc
  cmd_state.start_loc     = here:copy()
  cmd_state.start_alt_m   = current_relative_alt_m()
  cmd_state.target_alt_m  = cmd_state.start_alt_m + climb
  cmd_state.walk_total_m  = pullback
  cmd_state.walked_m      = 0
  cmd_state.bearing_deg   = math.deg(back_bearing_rad)
  cmd_state.speed_mps     = speed
  cmd_state.last_step_ms  = millis():tofloat()
  cmd_state.active        = true
  gcs:send_text(6, string.format('ArduDeck REVEAL: pullback=%.1f Δalt=%.1f v=%.1f',
    pullback, climb, speed))
end

-- Strafe: dolly past the click target at perpendicular offset, looking at it.
-- Picks the dolly side that's closest to the vehicle (so approach is short).
-- Params: x, y = target lat/lon
--         z    = dolly altitude (m, relative)
--         p1   = offset_distance_m (perpendicular distance the pass clears the target)
--         p2   = strafe_length_m   (total length of the pass; centered on closest pt)
--         p3   = speed_mps         (default 3 m/s)
local function start_strafe(c)
  local here = ahrs:get_location()
  if here == nil then
    gcs:send_text(4, 'ArduDeck STRAFE: ahrs:get_location nil')
    return
  end
  local target_loc = build_center(c, c.z)
  local target_to_vehicle_rad = target_loc:get_bearing(here)
  if target_to_vehicle_rad == nil then
    gcs:send_text(4, 'ArduDeck STRAFE: get_bearing nil')
    return
  end
  local target_to_vehicle_deg = math.deg(target_to_vehicle_rad)

  local offset = math.max(1, c.param1 or 15)
  local length = math.max(2, c.param2 or 30)
  local speed  = (c.param3 ~= nil and c.param3 > 0.1) and c.param3 or 3

  -- Closest point on the dolly axis (target offset toward the vehicle's side).
  local closest = target_loc:copy()
  closest:offset_bearing(target_to_vehicle_deg, offset)

  -- Two candidate axes (perpendicular to target→vehicle bearing). Pick the
  -- one whose start point is closer to the vehicle so the approach is short
  -- and the dolly direction matches operator intuition.
  local axis_a = (target_to_vehicle_deg + 90)  % 360
  local axis_b = (target_to_vehicle_deg + 270) % 360
  local start_a = closest:copy()
  start_a:offset_bearing((axis_a + 180) % 360, length / 2)
  local start_b = closest:copy()
  start_b:offset_bearing((axis_b + 180) % 360, length / 2)
  local dist_a = here:get_distance(start_a) or 1e9
  local dist_b = here:get_distance(start_b) or 1e9
  local axis_deg, start_loc
  if dist_a <= dist_b then
    axis_deg, start_loc = axis_a, start_a
  else
    axis_deg, start_loc = axis_b, start_b
  end
  start_loc:alt(math.floor(c.z * 100))
  start_loc:relative_alt(true)

  cmd_state.sub_id        = SUB_CMD_STRAFE
  cmd_state.center        = target_loc
  cmd_state.start_loc     = start_loc
  cmd_state.target_alt_m  = c.z
  cmd_state.walk_total_m  = length
  cmd_state.walked_m      = 0
  cmd_state.bearing_deg   = axis_deg
  cmd_state.speed_mps     = speed
  cmd_state.last_step_ms  = millis():tofloat()
  cmd_state.approach_done = false
  cmd_state.active        = true
  gcs:send_text(6, string.format('ArduDeck STRAFE: offset=%.1f length=%.1f v=%.1f',
    offset, length, speed))
end

-- Land-at-point: anchor on the clicked lat/lon at the vehicle's current
-- altitude (so we don't dive on the way over), then switch to LAND once close.
-- Params: x, y = land lat/lon  z = approach altitude (m, relative; if 0 or
-- missing we use current altitude so the vehicle just translates).
local function start_land_at(c)
  local here = ahrs:get_location()
  if here == nil then
    gcs:send_text(4, 'ArduDeck LAND_AT: ahrs:get_location nil')
    return
  end
  local approach_alt = (c.z and c.z > 0) and c.z or current_relative_alt_m()
  local anchor = Location()
  anchor:lat(c.x)
  anchor:lng(c.y)
  anchor:alt(math.floor(approach_alt * 100))
  anchor:relative_alt(true)
  cmd_state.sub_id        = SUB_CMD_LAND_AT
  cmd_state.center        = anchor
  cmd_state.target_alt_m  = approach_alt
  cmd_state.last_step_ms  = millis():tofloat()
  cmd_state.active        = true
  gcs:send_text(6, string.format('ArduDeck LAND_AT: flying to point @ %.1fm then LAND', approach_alt))
end


-- ── ArduPlane (fixed wing and quadplane) ────────────────────────────
-- A plane can't hover or chase a moving target point: it circles a guided loiter
-- (DO_REPOSITION) and climbs with GUIDED_CHANGE_ALTITUDE, both run on board via gcs:run_command_int.
local PLANE_MODE_GUIDED = 15  -- ArduPlane mode.h
local PLANE_MODE_RTL    = 11
local MAV_CMD_DO_REPOSITION          = 192
local MAV_CMD_GUIDED_CHANGE_ALTITUDE = 43001
local MAV_FRAME_GLOBAL_RELATIVE_ALT_INT = 6
local MAV_RESULT_ACCEPTED = 0
local PLANE_ALT_REACHED_M = 3

local function plane_run(cmd_id, params, what)
  local ok, res = pcall(gcs.run_command_int, gcs, cmd_id, params)
  if not ok or res ~= MAV_RESULT_ACCEPTED then
    stats.errors = stats.errors + 1
    gcs:send_text(4, string.format('ArduDeck: %s refused (%s)', what, tostring(ok and res or 'error')))
    return false
  end
  stats.set_target_ok = stats.set_target_ok + 1
  return true
end

-- radius 0 keeps the vehicle's loiter radius; negative radius = CCW
local function plane_loiter(lat_e7, lng_e7, alt_m, radius_signed)
  local r = radius_signed or 0
  return plane_run(MAV_CMD_DO_REPOSITION, {
    p1 = -1, p2 = 1, p3 = math.abs(r), p4 = r < 0 and 1 or 0,
    x = lat_e7, y = lng_e7, z = alt_m, frame = MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
  }, 'plane loiter')
end

-- rate 0 = the vehicle's maximum climb rate
local function plane_change_alt(alt_m, rate_mps)
  return plane_run(MAV_CMD_GUIDED_CHANGE_ALTITUDE, {
    p3 = math.abs(rate_mps or 0), z = alt_m, frame = MAV_FRAME_GLOBAL_RELATIVE_ALT_INT,
  }, 'plane altitude change')
end

-- The pilot switching modes ends the command; the script never fights a takeover
local function plane_still_guided()
  if vehicle:get_mode() == PLANE_MODE_GUIDED then return true end
  cmd_state.active = false
  gcs:send_text(6, 'ArduDeck: mode changed, releasing vehicle')
  return false
end

local function plane_start_orbit(c)
  local revolutions = math.max(0, math.floor((c.param3 or 0) + 0.5))
  if not plane_loiter(c.x, c.y, c.z, c.param1) then return end
  cmd_state.sub_id        = SUB_CMD_ORBIT
  cmd_state.center        = build_center(c, c.z)
  cmd_state.radius_m      = c.param1
  cmd_state.angle_rad     = 0
  cmd_state.last_bearing  = nil
  cmd_state.max_angle_rad = revolutions * 2 * math.pi
  -- Unlimited orbits need no stepping: the vehicle loiters on its own
  cmd_state.active        = revolutions > 0
  gcs:send_text(6, string.format('ArduDeck ORBIT (plane): r=%.0f alt=%.0f revs=%s',
    math.abs(c.param1 or 0), c.z, revolutions == 0 and 'inf' or tostring(revolutions)))
end

local function plane_step_orbit(_now_ms)
  if not plane_still_guided() then return end
  local here = ahrs:get_location()
  if here == nil or cmd_state.center == nil then return end
  local r = math.abs(cmd_state.radius_m or 0)
  local dist = cmd_state.center:get_distance(here) or 0
  -- Count rotation only once established on the circle
  if r > 0 and math.abs(dist - r) > math.max(15, r * 0.3) then
    cmd_state.last_bearing = nil
    return
  end
  local b = cmd_state.center:get_bearing(here)
  if b == nil then return end
  if cmd_state.last_bearing ~= nil then
    local d = b - cmd_state.last_bearing
    if d > math.pi then d = d - 2 * math.pi elseif d < -math.pi then d = d + 2 * math.pi end
    cmd_state.angle_rad = cmd_state.angle_rad + math.abs(d)
  end
  cmd_state.last_bearing = b
  if cmd_state.angle_rad >= cmd_state.max_angle_rad then
    cmd_state.active = false
    gcs:send_text(6, string.format('ArduDeck ORBIT: %d orbits done, still loitering',
      math.floor(cmd_state.max_angle_rad / (2 * math.pi) + 0.5)))
  end
end

local function plane_start_spiral(c)
  local start_alt = current_relative_alt_m()
  if not plane_loiter(c.x, c.y, start_alt, c.param1) then return end
  if not plane_change_alt(c.z, c.param3) then return end
  cmd_state.sub_id       = SUB_CMD_SPIRAL
  cmd_state.target_alt_m = c.z
  cmd_state.active       = true
  gcs:send_text(6, string.format('ArduDeck SPIRAL (plane): r=%.0f alt %.0f->%.0f climb=%.1f',
    math.abs(c.param1 or 0), start_alt, c.z, math.abs(c.param3 or 0)))
end

local function plane_step_spiral(_now_ms)
  if not plane_still_guided() then return end
  if math.abs(current_relative_alt_m() - cmd_state.target_alt_m) <= PLANE_ALT_REACHED_M then
    cmd_state.active = false
    gcs:send_text(6, string.format('ArduDeck SPIRAL: %.0fm reached, still loitering', cmd_state.target_alt_m))
  end
end

local function plane_start_climb_rtl(c)
  local here = ahrs:get_location()
  if here == nil then
    gcs:send_text(4, 'ArduDeck CLIMB_RTL: no position')
    return
  end
  cmd_state.sub_id       = SUB_CMD_CLIMB_RTL
  cmd_state.target_alt_m = c.z
  cmd_state.active       = true
  if current_relative_alt_m() >= c.z - PLANE_ALT_REACHED_M then
    return  -- already high enough: the first step hands over to RTL
  end
  if not plane_loiter(here:lat(), here:lng(), current_relative_alt_m(), 0) then cmd_state.active = false return end
  if not plane_change_alt(c.z, 0) then cmd_state.active = false return end
  gcs:send_text(6, string.format('ArduDeck CLIMB_RTL (plane): climbing to %.0fm then RTL', c.z))
end

local function plane_step_climb_rtl(_now_ms)
  local high_enough = current_relative_alt_m() >= cmd_state.target_alt_m - PLANE_ALT_REACHED_M
  if not high_enough and not plane_still_guided() then return end
  if not high_enough then return end
  cmd_state.active = false
  local ok = pcall(vehicle.set_mode, vehicle, PLANE_MODE_RTL)
  gcs:send_text(ok and 6 or 4, ok and 'ArduDeck CLIMB_RTL: altitude reached, RTL' or 'ArduDeck CLIMB_RTL: RTL refused')
end

local plane_dispatch = {
  [SUB_CMD_ORBIT]     = plane_start_orbit,
  [SUB_CMD_SPIRAL]    = plane_start_spiral,
  [SUB_CMD_CLIMB_RTL] = plane_start_climb_rtl,
}

plane_steppers_ref = {
  [SUB_CMD_ORBIT]     = plane_step_orbit,
  [SUB_CMD_SPIRAL]    = plane_step_spiral,
  [SUB_CMD_CLIMB_RTL] = plane_step_climb_rtl,
}

-- Dispatch table: sub-command id → starter function.
local dispatch = {
  [SUB_CMD_ORBIT]      = start_orbit,
  [SUB_CMD_SPIRAL]     = start_spiral,
  [SUB_CMD_WATCHTOWER] = start_watchtower,
  [SUB_CMD_CLIMB_RTL]  = start_climb_rtl,
  [SUB_CMD_REVEAL]     = start_reveal,
  [SUB_CMD_STRAFE]     = start_strafe,
  [SUB_CMD_LAND_AT]    = start_land_at,
}

local function handle_command_int(cmd, _chan)
  if cmd.command ~= MAV_CMD_USER_1 then return end
  stats.user_cmd = stats.user_cmd + 1
  local sub_id = math.floor(cmd.param4 or 0)

  -- STOP: deactivate any current command so the GCS can issue a native one
  -- (Move / Land / DO_REPOSITION / etc.) without the script's tick continuing
  -- to override the position target. This is what unblocks "I clicked POI,
  -- now my Move click does nothing".
  if sub_id == SUB_CMD_STOP then
    if cmd_state.active then
      gcs:send_text(6, 'ArduDeck: STOP — releasing vehicle')
    end
    cmd_state.active = false
    cmd_state.sub_id = -1
    return
  end

  local fw = FWVersion:type()
  if fw == APM_BUILD_ARDUPLANE then
    local plane_starter = plane_dispatch[sub_id]
    local looked_up, run_fn = pcall(function() return gcs.run_command_int end)
    local has_run = looked_up and run_fn ~= nil
    if plane_starter == nil or not has_run then
      stats.errors = stats.errors + 1
      gcs:send_text(4, plane_starter == nil
        and 'ArduDeck: this command needs a multicopter; ignored'
        or 'ArduDeck: plane commands need ArduPilot 4.5 or newer')
      return
    end
    cmd_state.active = false
    cmd_state.plane = true
    local ok, err = pcall(plane_starter, cmd)
    if not ok then
      stats.errors = stats.errors + 1
      gcs:send_text(4, 'ArduDeck: starter threw: ' .. tostring(err))
    end
    return
  end
  -- Copter mode numbers and hover moves: on anything but ArduCopter they mean other modes, so refuse
  if fw ~= APM_BUILD_ARDUCOPTER then
    stats.errors = stats.errors + 1
    gcs:send_text(4, 'ArduDeck: map commands need ArduCopter or ArduPlane; ignored on this vehicle')
    return
  end
  cmd_state.plane = false

  local starter = dispatch[sub_id]
  if starter == nil then
    stats.errors = stats.errors + 1
    gcs:send_text(4, 'ArduDeck: unknown sub-command id ' .. tostring(sub_id))
    return
  end
  -- Vehicle MUST be in GUIDED for set_target_location / set_target_pos_NED
  -- to do anything. We auto-switch here so the user doesn't have to manually
  -- flip modes between e.g. STABILIZE and a Lua command.
  if not ensure_guided() then return end
  local ok, err = pcall(starter, cmd)
  if not ok then
    stats.errors = stats.errors + 1
    gcs:send_text(4, 'ArduDeck: starter threw: ' .. tostring(err))
  end
end

local function publish_diagnostics()
  gcs:send_named_float('AD_HB',  SCRIPT_VERSION)
  gcs:send_named_float('AD_RX',  stats.rx)
  gcs:send_named_float('AD_USR', stats.user_cmd)
  gcs:send_named_float('AD_TGT', stats.set_target_ok)
  gcs:send_named_float('AD_ERR', stats.errors)
  gcs:send_named_float('AD_ANG', cmd_state.active and ((math.deg(cmd_state.angle_rad) % 360 + 360) % 360) or 0)
  gcs:send_named_float('AD_SUB', cmd_state.active and cmd_state.sub_id or -1)
end

local function update()
  hb_counter = hb_counter + 1
  if hb_counter >= HB_DIVIDER then
    hb_counter = 0
    publish_diagnostics()
  end

  if mavlink_ready then
    while true do
      local msg, chan = mavlink:receive_chan()
      if msg == nil then break end
      stats.rx = stats.rx + 1
      local cmd = parse_command_int(msg)
      if cmd ~= nil then
        handle_command_int(cmd, chan)
      end
    end
  end

  if cmd_state.active then
    step_command(millis():tofloat())
  end

  return update, UPDATE_INTERVAL_MS
end

return update, UPDATE_INTERVAL_MS
