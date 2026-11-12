-- Round-trip test: encode fields exactly as ArduPilot's calc_* / prep_number
-- do, then decode with the widget's decoders and compare.
-- Runs under Lua 5.4 with a bit32 shim (EdgeTX itself is 5.2).

-- ---- bit32 shim for 5.4 ----
bit32 = {
  band = function (a, b) return a & b end,
  rshift = function (a, n) return a >> n end,
  btest = function (a, b) return (a & b) ~= 0 end,
}

-- ---- EdgeTX API stubs ----
local stubTime = 0
function getTime() return stubTime end
function getRSSI() return 80 end
function getUsage() return 0 end
function crossfireTelemetryPop() return nil end
function loadScript(path)
  if path:find('theme') then
    return function ()
      -- palette stub: plain tables with a few keys; applyTheme pairs() over them
      local function palette()
        return { BG_BASE = 0, SURFACE = 0, TEXT = 0, TEXT_2 = 0, TEXT_3 = 0,
          SUCCESS = 0, WARN = 0, WARN_STRONG = 0, DANGER = 0, INFO = 0,
          ACCENT = 0, GAUGE_FACE = 0, GAUGE_BEZEL = 0, GAUGE_BEZEL_2 = 0,
          GAUGE_EDGE = 0, GAUGE_TICK = 0, GAUGE_NEEDLE = 0, STALE = 0,
          GRID = 0, PILL_ON = 0 }
      end
      return { dark = palette(), light = palette() }
    end
  end
end
function Bitmap_open() return nil end
Bitmap = { open = function () return nil end }
function playFile() end
function getSwitchValue() return false end
lcd = setmetatable({
  RGB = function (v) return v end,
  sizeText = function () return 50 end,
}, { __index = function () return function () end end })
LCD_W, LCD_H = 480, 320
SMLSIZE, MIDSIZE, DBLSIZE, CENTER, RIGHT, VCENTER, SOLID = 0, 0, 0, 0, 0, 0, 0
PLAY_NOW = 0
function playTone() end
function getGeneralSettings() return { battMin = 6.6, battMax = 8.4 } end
function getValue() return nil end

-- Load the widget core by reading the file directly
local chunk = assert(loadfile('resources/edgetx/ardudeck-hud/SD/WIDGETS/ardudeck/loadable.lua'))
-- loadable.lua calls loadScript for theme; our stub handles it.
local M = chunk()

-- Access internals through the decode path: we re-parse the file to grab V.
-- Simpler: drive handlePassthrough via the CRSF pump by faking pop frames.
local frames = {}
function crossfireTelemetryPop()
  local f = table.remove(frames, 1)
  if f then return f[1], f[2] end
  return nil
end

-- Frame layout VERIFIED against Yaapu's decoder + real hardware
-- (2026-08-07): data[1]=0xF0 subtype, appid LE at data[2..3], value LE at
-- data[4..7]. Do NOT change this to match the pump - the pump must match
-- THIS (a previous self-consistent-but-wrong pair shipped NO MAVLINK to
-- the field).
local function pushSingle(appid, value)
  local d = {
    0xF0,
    appid & 0xFF, (appid >> 8) & 0xFF,
    value & 0xFF, (value >> 8) & 0xFF, (value >> 16) & 0xFF, (value >> 24) & 0xFF,
  }
  frames[#frames + 1] = { 0x80, d }
end

-- ---- ArduPilot-side encoders (ported from AP_Frsky_SPort.cpp) ----
local function prep_number(number, digits, power)
  local res = 0
  local abs_number = math.abs(number)
  local function round(x) return math.floor(x + 0.5) end
  if digits == 2 and power == 0 then
    local max_value = number < 0 and ((1 << 6) - 1) or ((1 << 7) - 1)
    res = math.min(abs_number, max_value)
    if number < 0 then res = res | (1 << 6) end
  elseif digits == 2 and power == 1 then
    if abs_number < 100 then res = abs_number << 1
    elseif abs_number < 1270 then res = (round(abs_number * 0.1) << 1) | 0x1
    else res = 0xFF end
    if number < 0 then res = res | (0x1 << 8) end
  elseif digits == 2 and power == 2 then
    if abs_number < 100 then res = abs_number << 2
    elseif abs_number < 1000 then res = (round(abs_number * 0.1) << 2) | 0x1
    elseif abs_number < 10000 then res = (round(abs_number * 0.01) << 2) | 0x2
    elseif abs_number < 127000 then res = (round(abs_number * 0.001) << 2) | 0x3
    else res = 0x1FF end
    if number < 0 then res = res | (0x1 << 9) end
  elseif digits == 3 and power == 1 then
    if abs_number < 1000 then res = abs_number << 1
    elseif abs_number < 10240 then res = (round(abs_number * 0.1) << 1) | 0x1
    else res = 0x7FF end
    if number < 0 then res = res | (0x1 << 11) end
  elseif digits == 3 and power == 2 then
    if abs_number < 1000 then res = abs_number << 2
    elseif abs_number < 10000 then res = (round(abs_number * 0.1) << 2) | 0x1
    elseif abs_number < 100000 then res = (round(abs_number * 0.01) << 2) | 0x2
    elseif abs_number < 1024000 then res = (round(abs_number * 0.001) << 2) | 0x3
    else res = 0xFFF end
    if number < 0 then res = res | (0x1 << 12) end
  end
  return res
end

local failures = 0
local function check(name, got, want, tol)
  tol = tol or 0
  if math.abs(got - want) > tol then
    print(string.format('FAIL %-24s got %-10s want %-10s', name, tostring(got), tostring(want)))
    failures = failures + 1
  else
    print(string.format('ok   %-24s %s', name, tostring(got)))
  end
end

-- Build a widget instance and a helper to run one frame through the pump
local w = M.create({ x = 0, y = 0, w = 480, h = 320 }, {})
local function feed(appid, value)
  pushSingle(appid, value)
  M.background(w)
end

-- ---- 0x5003 battery: 23.4V, 12.6A, 2892 mAh ----
local batt = (234 & 0x1FF) | (prep_number(126, 2, 1) << 9) | ((2892 & 0x7FFF) << 17)
feed(0x5003, batt)

-- ---- 0x5001 ap_status: mode 5 (Loiter), armed, flying, throttle 41% ----
local ap = ((5 + 1) & 0x1F) | (1 << 7) | (1 << 8)
ap = ap | (prep_number(math.floor(41 * 0.63), 2, 0) << 19)
ap = ap | ((45 - 19) << 26) -- imu temp 45C
feed(0x5001, ap)

-- ---- 0x5002 gps: 14 sats, 3D fix, hdop 0.8, alt 587.4m ----
local gps = 14 | (3 << 4) | (prep_number(8, 2, 1) << 6) | (prep_number(5874, 2, 2) << 22)
feed(0x5002, gps)

-- ---- 0x5004 home: 229m away, 63.5m up, bearing 156deg ----
local home = prep_number(229, 3, 2) | (prep_number(635, 3, 2) << 12) | ((math.floor(156 / 3) & 0x7F) << 25)
feed(0x5004, home)

-- ---- 0x5005 velandyaw: vspd -2.5m/s, hspd 12.4m/s, yaw 244deg ----
local vy = prep_number(-25, 2, 1) | (prep_number(124, 2, 1) << 9) | ((math.floor(244 / 0.2 + 0.5) & 0x7FF) << 17)
feed(0x5005, vy)

-- ---- 0x5006 attitude: roll -32.4, pitch 12.6, range 1.34m ----
local att = (math.floor((-32.4 + 180) / 0.2 + 0.5) & 0x7FF)
att = att | ((math.floor((12.6 + 90) / 0.2 + 0.5) & 0x3FF) << 11)
att = att | (prep_number(134, 3, 1) << 21)
feed(0x5006, att)

-- ---- 0x800 GPS coords: 42.4411, 19.2632 ----
local latv = math.floor(42.4411 * 600000 + 0.5)
feed(0x800, latv)
local lonv = math.floor(19.2632 * 600000 + 0.5) | (0x1 << 30)
feed(0x800, lonv)

-- ---- read back through the module's state via its render path ----
-- loadable.lua keeps V as an upvalue; expose via a debug hook: we re-run
-- ladder/draw and capture drawText calls instead. Simpler: the module was
-- written with V as a local; for the test we reach it through the debug
-- library.
local Vfound
for i = 1, 200 do
  local name, val = debug.getupvalue(M.background, i)
  if not name then break end
  if name == 'pump' then
    for j = 1, 200 do
      local n2, v2 = debug.getupvalue(val, j)
      if not n2 then break end
      if n2 == 'handlePassthrough' then
        for k = 1, 200 do
          local n3, v3 = debug.getupvalue(v2, k)
          if not n3 then break end
          if n3 == 'V' then Vfound = v3 break end
        end
      end
    end
  end
end
assert(Vfound, 'could not locate V state table')
local V = Vfound

check('batt voltage', V.voltV, 23.4, 0.05)
check('batt current', V.currA, 12.6, 0.5)
check('batt mah', V.mah, 2892)
check('mode num', V.modeNum, 5)
check('armed', V.armed and 1 or 0, 1)
check('flying', V.flying and 1 or 0, 1)
check('throttle', V.throttle, math.floor(41 * 0.63))
check('imu temp', V.imuTemp, 45)
check('sats', V.sats, 14)
check('fix', V.fix, 3)
check('hdop', V.hdop, 0.8, 0.05)
check('gps alt (2-digit quantized)', V.gpsAltM, 590, 0.1)
check('home dist', V.homeDistM, 229)
check('home alt', V.homeAltM, 63.5, 0.1)
check('home bearing', V.homeBearingDeg, 156, 3)
check('vspd', V.vspdMs, -2.5, 0.05)
check('hspd (2-digit quantized)', V.hspdMs, 12.0, 0.05)
check('yaw', V.yawDeg, 244, 0.2)
check('roll', V.rollDeg, -32.4, 0.2)
check('pitch', V.pitchDeg, 12.6, 0.2)
check('range', V.rangeM, 1.34, 0.01)
check('lat', V.lat, 42.4411, 0.0001)
check('lon', V.lon, 19.2632, 0.0001)

-- DGPS: ArduPilot puts the status beyond 3D in bits 14-15; it is not a sign on hdop
feed(0x5002, 12 | (3 << 4) | (prep_number(5, 2, 1) << 6) | (1 << 14) | (prep_number(5874, 2, 2) << 22))
check('dgps fix', V.fix, 4)
check('dgps hdop stays positive', V.hdop, 0.5, 0.05)
feed(0x5002, 12 | (3 << 4) | (prep_number(150, 2, 1) << 6) | (3 << 14))
check('rtk fixed', V.fix, 6)
check('hdop over 10 (x10 flag)', V.hdop, 15, 0.5)

-- rover: the frame type picks the rover names even with a copter hud.cfg
local function findUp(fn, want, depth, seen)
  seen = seen or {}
  if depth == 0 or seen[fn] then return nil end
  seen[fn] = true
  for i = 1, 255 do
    local n, v = debug.getupvalue(fn, i)
    if not n then break end
    if n == want then return v end
    if type(v) == 'function' then
      local r = findUp(v, want, depth - 1, seen)
      if r then return r end
    end
  end
end
local modeNameOf
for _, f in pairs(M) do
  if type(f) == 'function' then modeNameOf = modeNameOf or findUp(f, 'modeNameOf', 6) end
end
assert(modeNameOf, 'could not locate modeNameOf')
check('copter mode 11 before frame type', modeNameOf(11) == 'DRIFT' and 1 or 0, 1)
feed(0x5007, (1 << 24) | 10)
check('rover mode 0', modeNameOf(0) == 'MANUAL' and 1 or 0, 1)
check('rover mode 9', modeNameOf(9) == 'CIRCLE' and 1 or 0, 1)
check('rover mode 11', modeNameOf(11) == 'RTL' and 1 or 0, 1)
-- trip distance: speed over time while armed; a gap over 1s is a dropout
do
  feed(0x5001, (1 << 8))           -- armed
  V.odoM, V.tOdo = 0, -1
  local function vel(ms) return prep_number(math.floor(ms * 10), 2, 1) << 9 end
  feed(0x5005, vel(5))             -- starts the clock
  for _ = 1, 10 do stubTime = stubTime + 10; feed(0x5005, vel(5)) end
  check('trip 1s at 5 m/s', V.odoM, 5, 0.01)
  stubTime = stubTime + 500; feed(0x5005, vel(5))
  check('5s dropout adds nothing', V.odoM, 5, 0.01)
  feed(0x5001, 0)                  -- disarmed
  for _ = 1, 10 do stubTime = stubTime + 10; feed(0x5005, vel(5)) end
  check('no trip while disarmed', V.odoM, 5, 0.01)
end

-- tile captions follow the vehicle on the link
local TILE = findUp(M.refresh, 'TILE', 6)
assert(TILE, 'could not locate TILE')
local function caption(id)
  local seen = {}
  local real = lcd.drawText
  lcd.drawText = function (x, y, text) seen[#seen + 1] = tostring(text) end
  TILE[id](8, 48, 144, 96, 'default')
  lcd.drawText = real
  return table.concat(seen, '|')
end
feed(0x5007, (1 << 24) | 10)
check('rover alt tile is TRIP', caption('alt'):find('TRIP') and 1 or 0, 1)
check('rover range stays RANGE', caption('rng'):find('RANGE') and 1 or 0, 1)
feed(0x5007, (1 << 24) | 11)
check('boat range tile is DEPTH', caption('rng'):find('DEPTH') and 1 or 0, 1)
check('boat mode 11 is RTL', modeNameOf(11) == 'RTL' and 1 or 0, 1)
feed(0x5007, (1 << 24) | 12)
check('sub alt tile is DEPTH', caption('alt'):find('DEPTH') and 1 or 0, 1)
-- new driving and diving tiles draw without error for every vehicle, at small and large sizes
for _, mav in ipairs({ 2, 10, 11, 12 }) do
  feed(0x5007, (1 << 24) | mav)
  for _, id in ipairs({ 'speedo', 'heading', 'roll', 'pitch', 'depth', 'thr' }) do
    for _, size in ipairs({ { 144, 96 }, { 296, 200 }, { 120, 56 }, { 144, 72 }, { 128, 152 } }) do
      local ok, err = pcall(TILE[id], 8, 48, size[1], size[2], 'default')
      check(string.format('%s draws (mav %d, %dx%d)', id, mav, size[1], size[2]), ok and 1 or 0, 1)
      if not ok then print(err) end
    end
  end
end
check('throttle reverse label', caption('thr'):find('%%') and 1 or 0, 1)
check('sub depth caption', (function () feed(0x5007, (1 << 24) | 12); return caption('depth'):find('DEPTH') and 1 or 0 end)(), 1)
check('boat depth caption', (function () feed(0x5007, (1 << 24) | 11); return caption('depth'):find('UNDER HULL') and 1 or 0 end)(), 1)
feed(0x5007, (1 << 24) | 2)
check('copter alt tile is ALT', caption('alt'):find('ALT / VSPD') and 1 or 0, 1)
feed(0x5007, (1 << 24) | 2)
check('copter frame type back to copter names', modeNameOf(11) == 'DRIFT' and 1 or 0, 1)
-- frame type unknown again, so the cfg tests below read the table they write
feed(0x5007, (1 << 24) | 0)

-- ELRS MAVLink mode: position arrives as the EdgeTX "GPS" sensor (native
-- CRSF GPS frame), not passthrough 0x800. The widget must poll it.
function getValue(name)
  if name == 'GPS' then return { lat = 47.51234, lon = 8.54321 } end
  return nil
end
stubTime = stubTime + 100 -- get past the poll throttle
M.background(w)
check('lat via GPS sensor', V.lat, 47.51234, 0.0001)
check('lon via GPS sensor', V.lon, 8.54321, 0.0001)

-- FC remaining-% via the CRSF battery frame ("Bat%" sensor): the battery
-- tile's pct source when no capacity is configured and 0x5007 never came
function getFieldInfo(name) return name == 'Bat%' and {} or nil end
function getValue(name)
  if name == 'Bat%' then return 76 end
  return nil
end
stubTime = stubTime + 100
M.background(w)
check('remaining %% via Bat%% sensor', V.sensorPct, 76)
function getValue() return nil end
function getFieldInfo() return nil end

-- Render-path smoke test: with frames fed, ladder is LIVE and refresh runs
-- drawLive over the full default layout. Catches forward-reference nils and
-- draw-time crashes that a parse check cannot (this exact class shipped a
-- "attempt to index nil" to the radio once).
local okLive, errLive = pcall(function () M.refresh(w, nil, nil) end)
check('refresh (LIVE path) runs', okLive and 1 or 0, 1)
if not okLive then print('  refresh error: ' .. tostring(errLive)) end

-- Resolution independence: a TX16S-class LCD (480x272) must load and render
-- the default (480x320-authored) layout without crashing - layouts rescale
-- into the fixed-chrome band (header 48 / ticker 72).
LCD_W, LCD_H = 480, 272
local M272 = assert(loadfile('resources/edgetx/ardudeck-hud/SD/WIDGETS/ardudeck/loadable.lua'))()
local w272 = M272.create({ x = 0, y = 0, w = 480, h = 272 }, {})
local ok272, err272 = pcall(function () M272.refresh(w272, nil, nil) end)
check('refresh @480x272 runs', ok272 and 1 or 0, 1)
if not ok272 then print('  refresh error: ' .. tostring(err272)) end
LCD_W, LCD_H = 480, 320

-- ---- mode names come from hud.cfg, not the built-in copter table ----
-- A rover in HOLD is mode 4, which the copter table calls GUIDED. ArduDeck
-- writes the connected vehicle's own table, so the bar has to follow it.
local cfgText = table.concat({
  'name=rover',
  'theme=dark',
  'vehicle=rover',
  'modes=0:MANUAL,1:ACRO,3:STEERING,4:HOLD,10:AUTO,11:RTL',
}, '\n')
io = {
  open = function () return 1 end,
  read = function () return cfgText end,
  close = function () end,
}
local drawn = {}
local realDrawText = lcd.drawText
lcd.drawText = function (x, y, text, flags) drawn[#drawn + 1] = tostring(text) end
-- Past the 3s cfg reload window, then a fresh frame so the HUD (not the
-- diagnostic ladder) is what gets drawn: mode 4 = HOLD on a rover.
stubTime = stubTime + 400
feed(0x5006, att)
feed(0x5005, vy)
feed(0x5001, ((4 + 1) & 0x1F) | (1 << 7) | (1 << 8))
M.refresh(w, nil, nil)
local sawHold, sawGuided = 0, 0
for _, t in ipairs(drawn) do
  if t == 'HOLD' then sawHold = 1 end
  if t == 'GUIDED' then sawGuided = 1 end
end
lcd.drawText = realDrawText
check('mode name from cfg table', sawHold, 1)
check('copter name not used',     sawGuided, 0)

-- ---- a per-model config wins over the global one ----
-- One radio, several machines: models/<name>.cfg is what makes the rover's
-- pages stay the rover's. The name is sanitised the same way ArduDeck writes
-- it, so a mismatch here means the radio silently reads the global file.
model = { getInfo = function () return { name = 'Rover 1' } end }
local opened = {}
io = {
  open = function (path)
    opened[#opened + 1] = path
    if path == '/WIDGETS/ardudeck/models/Rover 1.cfg' then return 2 end
    return 1
  end,
  read = function (handle)
    if handle == 2 then return 'name=per-model\nmodes=4:HOLD' end
    return 'name=global\nmodes=4:GUIDED'
  end,
  close = function () end,
}
local drawn2 = {}
local realDrawText2 = lcd.drawText
lcd.drawText = function (x, y, text) drawn2[#drawn2 + 1] = tostring(text) end
stubTime = stubTime + 400
feed(0x5006, att)
feed(0x5005, vy)
feed(0x5001, ((4 + 1) & 0x1F) | (1 << 7) | (1 << 8))
M.refresh(w, nil, nil)
lcd.drawText = realDrawText2
local sawPerModel = 0
for _, t in ipairs(drawn2) do if t == 'HOLD' then sawPerModel = 1 end end
check('per-model cfg preferred', sawPerModel, 1)

-- ---- a missing RQly sensor is not a dead link ----
-- getValue only sees sensors in the model's list, so a model whose CRSF
-- sensors were never discovered returns nil. Printing 0% there tells the
-- pilot their link is failing while it is perfectly healthy.
local drawn3 = {}
local realDrawText3 = lcd.drawText
lcd.drawText = function (x, y, text) drawn3[#drawn3 + 1] = tostring(text) end
function getValue() return nil end
local realRssi = getRSSI
function getRSSI() return 0 end   -- no sensor at all, not even the radio's own
local okLink = pcall(function ()
  -- TILE is an upvalue of whichever draw function the refresh chain closes
  -- over; walk one level down to find it.
  local linkTile = nil
  local function scan(fn, depth)
    if linkTile or depth > 2 or type(fn) ~= 'function' then return end
    for i = 1, 200 do
      local name, val = debug.getupvalue(fn, i)
      if not name then break end
      if name == 'TILE' and type(val) == 'table' and val.link then linkTile = val.link return end
      if type(val) == 'function' then scan(val, depth + 1) end
    end
  end
  scan(M.refresh, 0)
  assert(linkTile, 'link tile not reachable')
  linkTile(0, 48, 144, 96)
end)
lcd.drawText = realDrawText3
local sawDash, sawZero = 0, 0
for _, t in ipairs(drawn3) do
  if t == '--' then sawDash = 1 end
  if t == '0%' then sawZero = 1 end
end
check('no sensor renders as unknown', okLink and sawDash or 0, 1)
check('no sensor is not 0%',          sawZero, 0)
-- With no RQly but a working radio-side reading, show that instead of a dash.
getRSSI = function () return 72 end
local drawn4 = {}
local realDrawText4 = lcd.drawText
lcd.drawText = function (x, y, text) drawn4[#drawn4 + 1] = tostring(text) end
pcall(function ()
  local linkTile = nil
  local function scan(fn, depth)
    if linkTile or depth > 2 or type(fn) ~= 'function' then return end
    for i = 1, 200 do
      local name, val = debug.getupvalue(fn, i)
      if not name then break end
      if name == 'TILE' and type(val) == 'table' and val.link then linkTile = val.link return end
      if type(val) == 'function' then scan(val, depth + 1) end
    end
  end
  scan(M.refresh, 0)
  if linkTile then linkTile(0, 48, 144, 96) end
end)
lcd.drawText = realDrawText4
local sawRadio = 0
for _, t in ipairs(drawn4) do if t == '72%' then sawRadio = 1 end end
check('falls back to the radio reading', sawRadio, 1)
getRSSI = realRssi

-- ---- map route legs stay inside the map image ----
-- A waypoint off the edge used to draw a line straight across the neighbouring
-- tiles. Old firmware has no clipping call, so the trim has to hold on its own.
local clip = nil
do
  local function scanFor(fn, want, depth, seen)
    if depth > 3 or type(fn) ~= 'function' or seen[fn] then return nil end
    seen[fn] = true
    for i = 1, 200 do
      local name, val = debug.getupvalue(fn, i)
      if not name then break end
      if name == want and type(val) == 'function' then return val end
      if type(val) == 'function' then
        local hit = scanFor(val, want, depth + 1, seen)
        if hit then return hit end
      elseif type(val) == 'table' then
        for _, v in pairs(val) do
          if type(v) == 'function' then
            local hit = scanFor(v, want, depth + 1, seen)
            if hit then return hit end
          end
        end
      end
    end
    return nil
  end
  clip = scanFor(M.refresh, 'clippedLine', 0, {})
end
check('clipped line reachable', clip and 1 or 0, 1)
if clip then
  local segs = {}
  local realLine = lcd.drawLine
  -- the lcd stub answers every key with a no-op, which would hide the absence
  -- of drawLineWithClipping: drop the catch-all so the fallback really runs
  local realMeta = getmetatable(lcd)
  setmetatable(lcd, nil)
  lcd.drawLine = function (x1, y1, x2, y2) segs[#segs + 1] = { x1, y1, x2, y2 } end
  -- rect x 10..110, y 10..110; a leg running well outside both ends
  clip(-200, 60, 400, 60, 10, 10, 100, 100, 0, 0)
  -- and one that misses the rect entirely
  clip(-200, -200, -150, -150, 10, 10, 100, 100, 0, 0)
  lcd.drawLine = realLine
  setmetatable(lcd, realMeta)
  local inside = 1
  for _, sg in ipairs(segs) do
    for i = 1, 4, 2 do
      if sg[i] < 9 or sg[i] > 111 or sg[i + 1] < 9 or sg[i + 1] > 111 then inside = 0 end
    end
  end
  check('leg trimmed to the image', inside, 1)
  check('leg fully outside is dropped', #segs, 1)
end

-- ---- PAGE keys and drags turn the page ----
-- EdgeTX hands a widget key events only in full screen, and its own swipe flags
-- need a fast flick; neither was wired up, so the buttons made for this did
-- nothing at all.
EVT_VIRTUAL_NEXT_PAGE = 9001
EVT_VIRTUAL_PREV_PAGE = 9002
local pagedCfg = 'name=x\ntile1=batt,8,48,144,96,default\np2_tile1=gps,8,48,144,96,default'
io = {
  open = function () return 1 end,
  read = function () return pagedCfg end,
  close = function () end,
}
model = nil
local function currentPage()
  for i = 1, 200 do
    local name, val = debug.getupvalue(M.refresh, i)
    if not name then break end
    if name == 'curPage' then return val end
  end
  return nil
end
stubTime = stubTime + 400
M.refresh(w, nil, nil)          -- picks up the two-page config
local startPage = currentPage()
check('two-page config loaded', startPage ~= nil and 1 or 0, 1)
M.refresh(w, EVT_VIRTUAL_NEXT_PAGE, nil)
check('PAGE next moves on', currentPage() ~= startPage and 1 or 0, 1)
M.refresh(w, EVT_VIRTUAL_PREV_PAGE, nil)
check('PAGE prev comes back', currentPage(), startPage)
-- a plain drag, well under EdgeTX's flick threshold per event
M.refresh(w, 0, { x = 60, y = 150, startX = 260, startY = 150 })
check('drag turns the page', currentPage() ~= startPage and 1 or 0, 1)
-- still the same drag: one gesture must not run through every page
M.refresh(w, 0, { x = 20, y = 150, startX = 260, startY = 150 })
check('one page per drag', currentPage() ~= startPage and 1 or 0, 1)

-- ---- pages turn on their own when nothing can reach the widget ----
-- In a widget slot EdgeTX passes neither event nor touch, so a timed rotation
-- is the only page control there.
io = {
  open = function () return 1 end,
  read = function () return pagedCfg .. '\npageSecs=2' end,
  close = function () end,
}
stubTime = stubTime + 400
M.refresh(w, nil, nil)
local rotStart = currentPage()
stubTime = stubTime + 100   -- 1s: too soon
M.refresh(w, nil, nil)
check('page holds before the interval', currentPage(), rotStart)
stubTime = stubTime + 150   -- past 2s
M.refresh(w, nil, nil)
check('page turns after the interval', currentPage() ~= rotStart and 1 or 0, 1)

-- ---- the Page option must not disable navigation ----
-- Anyone who used that field to change pages (the only way to do it from a
-- widget zone) then found every key, swipe and switch dead.
io = {
  open = function () return 1 end,
  read = function () return pagedCfg end,
  close = function () end,
}
local pinned = { zone = { x = 0, y = 0, w = 480, h = 320 }, options = { Page = 2 } }
stubTime = stubTime + 400
M.background(pinned)
M.refresh(pinned, nil, nil)
local pinnedStart = currentPage()
M.refresh(pinned, EVT_VIRTUAL_NEXT_PAGE, nil)
check('PAGE works with a starting page set', currentPage() ~= pinnedStart and 1 or 0, 1)

-- ---- a per-model config overrides only what it carries ----
-- Giving a model its own layout must not silently strip the theme, battery
-- setup and vehicle name it was inheriting from the shared file.
model = { getInfo = function () return { name = 'Rover 1' } end }
io = {
  open = function (path) return path end,
  read = function (handle)
    if handle == '/WIDGETS/ardudeck/models/Rover 1.cfg' then
      return 'theme=light\np2_tile1=gps,8,48,144,96,default\ntile1=batt,8,48,144,96,default'
    end
    return 'name=SharedCraft\ntheme=dark\ncells=6\ntile1=att,8,48,144,96,ball'
  end,
  close = function () end,
}
stubTime = stubTime + 400
M.refresh(w, nil, nil)
local cfgTable = nil
do
  local function scanFor(fn, want, depth, seen)
    if depth > 3 or type(fn) ~= 'function' or seen[fn] then return nil end
    seen[fn] = true
    for i = 1, 200 do
      local name, val = debug.getupvalue(fn, i)
      if not name then break end
      if name == want then return val end
      if type(val) == 'function' then
        local hit = scanFor(val, want, depth + 1, seen)
        if hit then return hit end
      end
    end
    return nil
  end
  cfgTable = scanFor(M.refresh, 'CFG', 0, {})
end
check('shared keys survive', cfgTable and cfgTable.cells or 0, 6)
check('model keys win', (cfgTable and cfgTable.theme == 'light') and 1 or 0, 1)
check('model pages replace shared ones', cfgTable and #(cfgTable.pages or {}) or 0, 2)

-- top bar on a 480-wide colour radio: the arm word and TX battery survive every
-- mode name; the brand and the mode's font size give way first
do
  io = { open = function () return nil end, read = function () return '' end, close = function () end }
  SMLSIZE, MIDSIZE = 0x100, 0x200
  local per = { [0x100] = 7, [0] = 10, [0x200] = 14 }
  local realSize = lcd.sizeText
  lcd.sizeText = function (text, flags)
    local f = (flags or 0) & 0x300
    return #tostring(text) * per[f]
  end
  local realGet = getValue
  getValue = function (name)
    if name == 'tx-voltage' then return 7.4 end
    if name == 'RQly' then return 100 end
    return nil
  end
  local worst = { arm = 1, tx = 1, overlap = 0 }
  for _, num in ipairs({ 0, 2, 6, 20, 21, 27 }) do
    local texts = {}
    local realDraw, realRect = lcd.drawText, lcd.drawFilledRectangle
    local pill
    lcd.drawText = function (x, y, text) texts[#texts + 1] = tostring(text) end
    lcd.drawFilledRectangle = function (x, y, w2, h2) if y >= 5 and y <= 8 and h2 >= 22 and h2 <= 28 then pill = { x, w2 } end end
    stubTime = stubTime + 400
    feed(0x5006, att)
    feed(0x5005, vy)
    feed(0x5001, ((num + 1) & 0x1F))
    M.refresh(w, nil, nil)
    lcd.drawText, lcd.drawFilledRectangle = realDraw, realRect
    local sawArm, sawTx = 0, 0
    for _, t in ipairs(texts) do
      if t == 'DISARMED' then sawArm = 1 end
      if t == '7.4' then sawTx = 1 end
    end
    worst.arm = math.min(worst.arm, sawArm)
    worst.tx = math.min(worst.tx, sawTx)
    -- pill must start right of the arm word: 64 + 8 chars * 11 + 10
    if not pill or pill[1] < 64 + 8 * 14 + 10 then worst.overlap = 1 end
  end
  check('DISARMED shown for every mode name', worst.arm, 1)
  check('TX battery shown for every mode name', worst.tx, 1)
  check('mode pill clear of the arm word', worst.overlap, 0)
  lcd.sizeText, getValue = realSize, realGet
  SMLSIZE, MIDSIZE = 0, 0
end

-- echogram: the boat script's frames come back out of the widget as the same column
do
  ARDUDECK_SONAR_TEST = true
  local S = assert(loadfile('src/main/lua-scripts/ardudeck_sonar.lua'))()
  local levels = {}
  for r = 1, 32 do levels[r] = (r * 7) % 16 end
  levels[32] = 15 -- top nibble set: the value travels as a negative int32 on the autopilot side
  V.echo = {}
  local r = S.range_frame(0.5, 20.0)
  feed(r[1], r[2] & 0xFFFFFFFF)
  for _, f in ipairs(S.column_frames(levels, 9)) do feed(f[1], f[2] & 0xFFFFFFFF) end
  check('echogram column assembled', #V.echo, 1)
  local same = 1
  for i = 1, 32 do if V.echo[1][i] ~= levels[i] then same = 0 end end
  check('echogram column matches the script', same, 1)
  check('echogram range start', V.echoStartM, 0.5)
  check('echogram range length', V.echoLenM, 20)
  -- a column missing a segment is not shown
  local frames = S.column_frames(levels, 10)
  for i = 1, 3 do feed(frames[i][1], frames[i][2] & 0xFFFFFFFF) end
  for _, f in ipairs(S.column_frames(levels, 11)) do feed(f[1], f[2] & 0xFFFFFFFF) end
  check('incomplete column dropped', #V.echo, 2)
  for _, id in ipairs({ 'echo', 'bottom' }) do
    for _, size in ipairs({ { 296, 200 }, { 144, 96 }, { 120, 56 } }) do
      local ok, err = pcall(TILE[id], 8, 48, size[1], size[2], 'default')
      check(string.format('%s draws %dx%d', id, size[1], size[2]), ok and 1 or 0, 1)
      if not ok then print(err) end
    end
  end
  V.echo, V.depthHist = {}, {}
  for _, id in ipairs({ 'echo', 'bottom' }) do
    local ok = pcall(TILE[id], 8, 48, 144, 96, 'default')
    check(id .. ' draws with no data', ok and 1 or 0, 1)
  end
end

-- values step down a font instead of running into the tile's graphic
do
  local saved = { SMLSIZE, MIDSIZE, DBLSIZE }
  SMLSIZE, MIDSIZE, DBLSIZE = 0x100, 0x200, 0x300
  local M2 = assert(loadfile('resources/edgetx/ardudeck-hud/SD/WIDGETS/ardudeck/loadable.lua'))()
  local TILE2 = findUp(M2.refresh, 'TILE', 6)
  local fitFont = TILE2 and findUp(TILE2.depth, 'fitFont', 2)
  assert(fitFont, 'could not locate fitFont')
  local realSize = lcd.sizeText
  local per = { [0x300] = 16, [0x200] = 12, [0] = 9, [0x100] = 7 }
  lcd.sizeText = function (text, f) return #tostring(text) * (per[f] or 7) end
  check('short value keeps the big font', fitFont('15', 0x300, 60) == 0x300 and 1 or 0, 1)
  check('long value steps down', fitFont('123.4m', 0x300, 60) ~= 0x300 and 1 or 0, 1)
  check('it stops at the smallest font', fitFont('123456789.0m', 0x300, 10) == 0x100 and 1 or 0, 1)
  lcd.sizeText = realSize
  SMLSIZE, MIDSIZE, DBLSIZE = saved[1], saved[2], saved[3]
end

-- ELRS in MAVLink mode sends 0x5001 with the temperature bits at 0, and the baro temperature as CRSF frame 0x0D
do
  local before = V.imuTemp
  feed(0x5001, (5 + 1) | (1 << 8))
  check('zero temperature field keeps the last IMU reading', V.imuTemp, before)
  frames[#frames + 1] = { 0x0D, { 1, 0x01, 0x0E } } -- 27.0 C in tenths, big-endian
  M.background(w)
  check('CRSF temperature frame decoded', V.crsfTemp, 27.0, 0.05)
  frames[#frames + 1] = { 0x0D, { 1, 0xFF, 0x9C } } -- -10.0 C
  M.background(w)
  check('negative CRSF temperature', V.crsfTemp, -10.0, 0.05)
  local TILE3 = findUp(M.refresh, 'TILE', 6)
  local ok = pcall(TILE3.imu, 8, 48, 144, 96, 'default')
  check('temperature tile draws', ok and 1 or 0, 1)
end

-- a lost link keeps the page: the full-screen notice is only for "never had data"
do
  local drawLive = findUp(M.refresh, 'drawLive', 2)
  local drawLinkLostBar = findUp(M.refresh, 'drawLinkLostBar', 2)
  check('link-lost bar exists', drawLinkLostBar and 1 or 0, 1)
  check('live page reachable from refresh', drawLive and 1 or 0, 1)
  V.everFrame = true
  V.lastFrameT = stubTime
  stubTime = stubTime + 2500 -- 25 s without frames
  local ok, err = pcall(M.refresh, w, nil, nil)
  check('refresh after the link drops', ok and 1 or 0, 1)
  if not ok then print(err) end
end

print(failures == 0 and 'ALL PASS' or (failures .. ' FAILURES'))
os.exit(failures == 0 and 0 or 1)
