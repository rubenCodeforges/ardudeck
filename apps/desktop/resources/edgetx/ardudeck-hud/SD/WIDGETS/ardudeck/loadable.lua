-- ArduDeck HUD: telemetry core + layout-driven branded tile UI.
-- Clean-room decode of ArduPilot passthrough telemetry over CRSF.
-- Bit layouts transcribed from ArduPilot source (protocol interop):
--   libraries/AP_Frsky_Telem/AP_Frsky_SPort_Passthrough.cpp (field offsets)
--   libraries/AP_Frsky_Telem/AP_Frsky_SPort.cpp (prep_number encoding)
-- CRSF wrapping: frametype 0x80, subtypes 0xF0 single passthrough,
-- 0xF1 status text, 0xF2 multi passthrough.
-- Visual identity: theme.lua (source-traced ArduDeck tokens).
-- Layout: tiles come from hud.cfg (tileN=type,x,y,w,h,variant), written by
-- the ArduDeck Radio HUD configurator. Top bar + message ticker are brand
-- invariants and not configurable.

local THEMES = loadScript('/WIDGETS/ardudeck/theme.lua', 'tcd')()

local band, rshift, btest = bit32.band, bit32.rshift, bit32.btest

-- T is a stable table the tile closures capture; applyTheme swaps its
-- contents so a cfg theme change takes effect without reloading the widget.
local T = {}
local function applyTheme(name)
  local src = THEMES[name] or THEMES.dark
  for k, v in pairs(src) do T[k] = v end
end
applyTheme('dark')

local STALE_AFTER = 200               -- 10ms ticks -> 2s

-- top-bar logos, loaded once in create: transparent jet for dark mode,
-- original dark-tile artwork for light mode (per brand direction)
local logoBmp = nil
local logoBmpLight = nil
-- runtime theme override from the tap toggle; switch/config still win/lose
-- per effectiveTheme()
local themeTap = nil
local currentTheme = 'dark'
-- runtime demo toggle from tapping the ladder banner (no menu diving);
-- config/widget-option demo still force it on
local demoTap = false
-- one page flip per drag, cleared when the finger comes off
local swipeLatched = false
-- current layout page (PAGE keys or a swipe cycle it; the Page widget option
-- pins an instance to one)
local curPage = 1
local pinnedPage = 0
local pageFlashT = -1000
local lastPageSw = nil
local pageTurnT = -100000
-- set the first time the pilot moves a page by hand, which releases the
-- starting-page option
local pageMoved = false
local fullScreen = false
local appMode = false
local lastEvent = nil
local lastTouch = nil

-- Voice alerts: ElevenLabs-generated wavs under snd/ (see ArduDeck repo
-- scripts/generate-hud-voice.mjs). Missing files are a silent no-op, the
-- tone fallback in pushMsg still covers statustext severity.
local function playAlert(name, muted)
  if muted then return end
  playFile('/WIDGETS/ardudeck/snd/' .. name .. '.wav')
end

-- Built-in tables per vehicle class (from ArduDeck's vehicle-core modes). The
-- live frame type picks one, so a rover reads right even when hud.cfg was
-- written with no vehicle connected.
local COPTER_MODES = {
  [0]='STABILIZE','ACRO','ALT HOLD','AUTO','GUIDED','LOITER','RTL','CIRCLE',
  [9]='LAND',[11]='DRIFT',[13]='SPORT',[14]='FLIP',[15]='AUTOTUNE',
  [16]='POSHOLD',[17]='BRAKE',[18]='THROW',[20]='GUIDED NOGPS',
  [21]='SMART RTL',[22]='FLOWHOLD',[24]='ZIGZAG',[27]='AUTO RTL',
}
local PLANE_MODES = {
  [0]='MANUAL','CIRCLE','STABILIZE','TRAINING','ACRO','FBWA','FBWB','CRUISE','AUTOTUNE',
  [10]='AUTO',[11]='RTL',[12]='LOITER',[13]='TAKEOFF',[14]='AVOID ADSB',[15]='GUIDED',
  [17]='QSTABILIZE',[18]='QHOVER',[19]='QLOITER',[20]='QLAND',[21]='QRTL',
  [22]='QAUTOTUNE',[23]='QACRO',[24]='THERMAL',[25]='LOITER QLAND',
}
local ROVER_MODES = {
  [0]='MANUAL','ACRO',[3]='STEERING',[4]='HOLD',[5]='LOITER',[6]='FOLLOW',
  [7]='SIMPLE',[8]='DOCK',[9]='CIRCLE',[10]='AUTO',[11]='RTL',[12]='SMART RTL',
  [15]='GUIDED',[16]='INITIALIZING',
}
local SUB_MODES = {
  [0]='STABILIZE','ACRO','ALT HOLD','AUTO','GUIDED',[7]='CIRCLE',[9]='SURFACE',
  [16]='POSHOLD',[19]='MANUAL',[20]='MOTOR DETECT',[21]='SURFTRAK',
}
local BUILTIN_MODES = { copter = COPTER_MODES, plane = PLANE_MODES, vtol = PLANE_MODES, rover = ROVER_MODES, boat = ROVER_MODES, sub = SUB_MODES }
-- the table ArduDeck wrote into hud.cfg (modes=num:NAME,...), for CFG.vehicle
local CFG_MODES = nil

-- Clip per mode number, written by ArduDeck for this vehicle (voice=num:clip,...).
-- Without it the mode_<n> clips speak the copter numbering.
local VOICE = nil

-- ============================ config ===================================
local CFG = {
  name = '', cells = 0, capacity = 0, low_cell = 3.6, crit_cell = 3.4,
  demo = 0, tiles = nil, theme = 'dark',
  -- Seconds each page is shown before the next one (0 = never rotate). The
  -- only page control that works in a normal widget slot, where EdgeTX hands
  -- the widget no keys and no touch.
  pageSecs = 0,
  -- 1 = print what the widget is actually being handed (event value, touch,
  -- fullscreen, page count). The only way to tell "key never arrived" from
  -- "key arrived and we ignored it".
  debugInput = 0,
  -- 'copter' until ArduDeck says otherwise; picks the ground wording and the
  -- tiles that make sense off the ground.
  vehicle = 'copter',
  -- pages[1..n] = tile arrays; page 1 uses plain tileN keys, page P>=2 uses
  -- pP_tileN. Swipe cycles pages; the Page widget option pins an instance.
  pages = nil,
}

-- A rover does not fly: the widget follows the vehicle ArduDeck wrote into
-- the config rather than calling everything a flight.
local liveClass -- defined with the vehicle state below

local function isGround()
  local c = liveClass() or CFG.vehicle
  return c == 'rover' or c == 'boat' or c == 'sub'
end

-- Layouts are authored on a reference canvas (hud.cfg screen=WxH, 480x320
-- when absent). Widget chrome is fixed-height: header ends at y=48, the
-- message ticker owns the bottom 72px. Tile geometry rescales into this
-- radio's actual LCD: x/w by width ratio, y/h inside the usable band.
local TILE_TOP, BOTTOM_CHROME = 48, 72
local function rescaleTiles(tiles, aw, ah)
  if (aw == LCD_W and ah == LCD_H) or ah - TILE_TOP - BOTTOM_CHROME <= 0 then return end
  local fx = LCD_W / aw
  local fy = (LCD_H - TILE_TOP - BOTTOM_CHROME) / (ah - TILE_TOP - BOTTOM_CHROME)
  for i = 1, #tiles do
    local t = tiles[i]
    t.x = math.floor(t.x * fx + 0.5)
    t.w = math.floor(t.w * fx + 0.5)
    t.y = math.floor(TILE_TOP + (t.y - TILE_TOP) * fy + 0.5)
    t.h = math.floor(t.h * fy + 0.5)
  end
end

-- Default layout is GENERATED for this radio's screen: more pixels = more
-- instruments at natural size, never inflated tiles (EdgeTX fonts don't
-- scale, so upscaled tiles are just emptier boxes). Last column is a
-- full-band attitude ball; the rest fill row-major by usefulness. On
-- 480x320 this reproduces the classic 5-tile TX15 default exactly.
-- 8px grid so configurator snapping lines up. KEEP IN SYNC with the
-- studio's gridLayout (RadioHudView.tsx).
local function gridDefault()
  local band = LCD_H - TILE_TOP - BOTTOM_CHROME
  local cols = math.max(2, math.floor((LCD_W - 8) / 152))
  local pitch = math.floor((LCD_W - 8) / cols)
  pitch = pitch - (pitch % 8)
  local tw = pitch - 8
  local rows = math.max(1, math.floor((band + 8) / 104 + 0.5))
  local th = math.floor((band - (rows - 1) * 8) / rows)
  th = th - (th % 8)
  local ids = { 'batt', 'home', 'alt', 'gps', 'spd', 'wind', 'link', 'timer',
    'thr', 'imu', 'wp', 'compass', 'rng', 'txbat' }
  local t = {}
  local n = 1
  for r = 1, rows do
    for c = 1, cols - 1 do
      local id = ids[n]
      if id then
        n = n + 1
        t[#t + 1] = { id = id, x = 8 + (c - 1) * pitch, y = TILE_TOP + (r - 1) * (th + 8),
          w = tw, h = th, variant = 'default' }
      end
    end
  end
  t[#t + 1] = { id = 'att', x = 8 + (cols - 1) * pitch, y = TILE_TOP,
    w = tw, h = band, variant = 'ball' }
  return t
end
local DEFAULT_LAYOUT = gridDefault()

-- Placed AFTER CFG/DEFAULT_LAYOUT declarations: locals referenced from a
-- function defined above their declaration silently resolve to nil globals.
local function activeLayout()
  local pages = CFG.pages
  if not pages or #pages == 0 then return CFG.tiles or DEFAULT_LAYOUT, 1, 1 end
  local n = #pages
  -- The Page option picks which page this instance opens on. It used to hold
  -- the widget there, which killed every key, swipe and switch the moment
  -- anyone used that field to change pages.
  local page = (pinnedPage > 0 and not pageMoved) and math.min(pinnedPage, n)
    or math.min(curPage, n)
  return pages[page], page, n
end

-- ========================= field maps manifest =========================
-- Offline field images prepared by ArduDeck (maps/maps.cfg):
--   mapN=lat,lon,metersPerPixel,widthPx,heightPx,file.png
-- One fixed image per zoom; the vehicle marker moves across it. Smallest
-- image containing the vehicle wins; tapping the tile cycles zoom.

local MAPS = {}
local mapBmp = nil
local mapBmpFile = nil
local mapTapIdx = nil
local trail = {}
local trailHead = 0
local lastTrailT = 0

local function loadMapsManifest()
  MAPS = {}
  local f = io.open('/WIDGETS/ardudeck/maps/maps.cfg', 'r')
  if not f then return end
  local raw = io.read(f, 2048)
  io.close(f)
  if type(raw) ~= 'string' then return end
  for _, v in string.gmatch(raw, '(map%d+)=([^\r\n]+)') do
    local lat, lon, mpp, mw, mh, file = string.match(v,
      '([%-%d%.]+),([%-%d%.]+),([%d%.]+),(%d+),(%d+),([%w%._%-]+)')
    if lat then
      MAPS[#MAPS + 1] = {
        lat = tonumber(lat), lon = tonumber(lon), mpp = tonumber(mpp),
        w = tonumber(mw), h = tonumber(mh), file = file,
      }
    end
  end
  table.sort(MAPS, function (a, b) return a.mpp < b.mpp end)
end

-- mission overlay for the map tile (maps/mission.cfg: wpN=seq,lat,lon)
local WPS = {}

local function loadMissionOverlay()
  WPS = {}
  local f = io.open('/WIDGETS/ardudeck/maps/mission.cfg', 'r')
  if not f then return end
  local raw = io.read(f, 4096)
  io.close(f)
  if type(raw) ~= 'string' then return end
  for _, v in string.gmatch(raw, '(wp%d+)=([^\r\n]+)') do
    local seq, lat, lon = string.match(v, '(%d+),([%-%d%.]+),([%-%d%.]+)')
    if seq then
      WPS[#WPS + 1] = { seq = tonumber(seq), lat = tonumber(lat), lon = tonumber(lon) }
    end
  end
end

-- Re-read every few seconds so ArduDeck applies (config, layout, demo) take
-- effect without rebooting the radio. A FAT read of a tiny file is cheap.
local CFG_RELOAD_TICKS = 300 -- 3s in 10ms ticks
local lastCfgLoadT = -CFG_RELOAD_TICKS

-- Per-model config: one radio flies several machines, and a rover has no use
-- for the plane's pages. models/<model name>.cfg wins when it exists; the
-- global file stays the default so cloning a model never loses the HUD.
local function cfgFileName()
  local ok, info = pcall(function () return model.getInfo() end)
  local name = ok and info and info.name or nil
  if type(name) ~= 'string' or name == '' then return nil end
  return '/WIDGETS/ardudeck/models/' .. string.gsub(name, '[^%w%-_ ]', '_') .. '.cfg'
end

local function readWhole(path)
  local f = io.open(path, 'r')
  if not f then return nil end
  -- Headroom for the mode table ArduDeck writes on top of the layouts.
  local raw = io.read(f, 8192)
  io.close(f)
  if type(raw) ~= 'string' or raw == '' then return nil end
  return raw
end

-- Shared config first, this model's on top: a per-model file overrides only the
-- keys it carries, so a model can own its layout while still following the
-- shared theme and battery setup.
local function readCfgFile()
  local shared = readWhole('/WIDGETS/ardudeck/hud.cfg')
  local perModel = cfgFileName()
  local own = perModel and readWhole(perModel) or nil
  if not own then return shared end
  if not shared then return own end
  -- Page keys are a set, not a value: a model that defines its own pages
  -- replaces them rather than inheriting stray tiles from the shared file.
  if string.match(own, '[%w_]*tile%d+=') then
    shared = string.gsub(shared, '[%w_]*tile%d+=[^\r\n]*', '')
  end
  return shared .. '\n' .. own
end

local function loadConfig()
  local raw = readCfgFile()
  if type(raw) ~= 'string' then return end
  local pages = {}
  local authW, authH = 480, 320
  local function addTile(page, v)
    local id, x, y, w, h, variant = string.match(v, '(%w+),(%d+),(%d+),(%d+),(%d+),?(%w*)')
    if id then
      pages[page] = pages[page] or {}
      local t = pages[page]
      t[#t + 1] = {
        id = id, x = tonumber(x), y = tonumber(y),
        w = tonumber(w), h = tonumber(h),
        variant = (variant ~= '' and variant) or 'default',
      }
    end
  end
  -- NOTE: %w does NOT match underscores; [%w_] is required or p2_tile1
  -- parses as tile1 and every page collapses onto page 1
  for k, v in string.gmatch(raw, '([%w_]+)=([^\r\n]+)') do
    if k == 'name' then CFG.name = v
    elseif k == 'theme' then CFG.theme = v
    elseif k == 'vehicle' then CFG.vehicle = v
    elseif k == 'modes' then
      local t = {}
      for num, label in string.gmatch(v, '(%d+):([^,]+)') do t[tonumber(num)] = label end
      if next(t) then CFG_MODES = t end
    elseif k == 'voice' then
      local t = {}
      for num, clip in string.gmatch(v, '(%d+):([%w_]+)') do t[tonumber(num)] = clip end
      if next(t) then VOICE = t end
    elseif k == 'screen' then
      local sw, sh = string.match(v, '(%d+)x(%d+)')
      if sw then authW, authH = tonumber(sw), tonumber(sh) end
    elseif string.match(k, '^tile%d+$') then
      addTile(1, v)
    elseif string.match(k, '^p%d+_tile%d+$') then
      addTile(tonumber(string.match(k, '^p(%d+)_')), v)
    else CFG[k] = tonumber(v) or CFG[k] end
  end
  if pages[1] then
    -- compact away any gaps so #CFG.pages is reliable
    local list = {}
    for i = 1, 8 do
      if pages[i] then
        rescaleTiles(pages[i], authW, authH)
        list[#list + 1] = pages[i]
      end
    end
    CFG.pages = list
    CFG.tiles = list[1]
  end
end

-- ============================ vehicle state ============================
local V = {
  lastFrameT = 0, lastStreamT = 0, everFrame = false,
  modeNum = -1, armed = false, flying = false,
  battFs = false, ekfBad = false, anyFs = false, fenceBreach = false,
  throttle = 0, imuTemp = 0, tImuTemp = 0, crsfTemp = nil, tCrsfTemp = 0,
  sats = 0, fix = 0, hdop = 0, gpsAltM = 0,
  voltV = 0, currA = 0, mah = 0,
  homeDistM = 0, homeAltM = 0, homeBearingDeg = 0,
  vspdMs = 0, hspdMs = 0, yawDeg = 0,
  rollDeg = 0, pitchDeg = 0, rangeM = 0,
  lat = nil, lon = nil,
  windDirDeg = 0, windMs = 0,
  autoCapacity = 0, maxVolt = 0, frameType = 0,
  wpNum = 0, wpDistM = 0, wpBearingDeg = 0, tWp = 0,
  odoM = 0, tOdo = -1, maxSpdMs = 0,
  -- depth once a second for the bottom profile, newest last
  depthHist = {}, tDepthHist = 0,
  -- echogram columns from the ArduDeck sonar script (32 levels 0..15 each), newest last
  echo = {}, echoSeq = -1, echoMask = 0, echoCur = {}, echoStartM = 0, echoLenM = 0, tEcho = 0,
  tAp = 0, tGps = 0, tBatt = 0, tHome = 0, tVel = 0, tAtt = 0, tWind = 0,
  armedAtT = nil, armedAccum = 0,
  msgs = {}, msgHead = 0, msgBuf = '', lastToneT = 0, muted = false,
}

-- MAV_TYPE from the passthrough frame-type param, mapped as ArduDeck's getVehicleClass does
function liveClass()
  local t = V.frameType
  if not t or t == 0 then return nil end
  if t == 1 then return 'plane' end
  if t >= 19 and t <= 25 then return 'vtol' end
  if t == 10 then return 'rover' end
  if t == 11 then return 'boat' end
  if t == 12 then return 'sub' end
  return 'copter'
end

local function sameFirmware(a, b)
  local fw = { vtol = 'plane', boat = 'rover' }
  return (fw[a] or a) == (fw[b] or b)
end

-- The vehicle on the link wins over a cfg written for another one.
local function modeTable()
  local live = liveClass()
  if live and not sameFirmware(live, CFG.vehicle) then return BUILTIN_MODES[live], false end
  return CFG_MODES or BUILTIN_MODES[CFG.vehicle] or COPTER_MODES, true
end

-- what is on the link, else what ArduDeck wrote into hud.cfg
local function vehicleKind()
  return liveClass() or CFG.vehicle
end

local function modeNameOf(num)
  return modeTable()[num] or ('MODE ' .. tostring(num))
end

-- ======================= prep_number decoders ==========================
local function dec_2_1(v)
  local n = band(rshift(v, 1), 0x7F)
  if btest(v, 0x01) then n = n * 10 end
  if btest(v, 0x100) then n = -n end
  return n
end
local function dec_2_2(v)
  local n = band(rshift(v, 2), 0x7F) * (10 ^ band(v, 0x03))
  if btest(v, 0x200) then n = -n end
  return n
end
local function dec_3_1(v)
  local n = band(rshift(v, 1), 0x3FF)
  if btest(v, 0x01) then n = n * 10 end
  if btest(v, 0x800) then n = -n end
  return n
end
local function dec_3_2(v)
  local n = band(rshift(v, 2), 0x3FF) * (10 ^ band(v, 0x03))
  if btest(v, 0x1000) then n = -n end
  return n
end
local function dec_2_0(v)
  local n = band(v, 0x3F)
  if btest(v, 0x40) then n = -n end
  return n
end

-- ========================= appid dispatch ==============================
local function now() return getTime() end

local decoders = {}

decoders[0x5001] = function (d)
  V.modeNum = band(d, 0x1F) - 1
  V.flying = btest(d, 2 ^ 7)
  V.armed = btest(d, 2 ^ 8)
  V.battFs = btest(d, 2 ^ 9)
  V.ekfBad = btest(d, 2 ^ 10)
  V.anyFs = btest(d, 2 ^ 12)
  V.fenceBreach = btest(d, 2 ^ 14)
  V.throttle = dec_2_0(band(rshift(d, 19), 0x7F))
  -- ELRS in MAVLink mode builds this frame from HEARTBEAT and leaves the temperature bits at 0.
  local rawTemp = band(rshift(d, 26), 0x3F)
  if rawTemp > 0 then
    V.imuTemp = rawTemp + 19
    V.tImuTemp = now()
  end
  V.tAp = now()
end

decoders[0x5002] = function (d)
  V.sats = band(d, 0x0F)
  -- bits 14-15 carry the fix beyond 3D (DGPS, RTK); they are not a sign on hdop
  V.fix = band(rshift(d, 4), 0x03) + band(rshift(d, 14), 0x03)
  V.hdop = band(rshift(d, 7), 0x7F) * (btest(d, 0x40) and 10 or 1) * 0.1
  V.gpsAltM = dec_2_2(band(rshift(d, 22), 0x3FF)) * 0.1
  V.tGps = now(); V.lastStreamT = V.tGps
end

decoders[0x5003] = function (d)
  V.voltV = band(d, 0x1FF) * 0.1
  V.currA = dec_2_1(band(rshift(d, 9), 0x1FF)) * 0.1
  V.mah = band(rshift(d, 17), 0x7FFF)
  if V.voltV > V.maxVolt then V.maxVolt = V.voltV end
  V.tBatt = now(); V.lastStreamT = V.tBatt
end

decoders[0x5007] = function (d)
  -- calc_param: id in [31:24], value in [23:0].
  -- FRAME_TYPE=1 (MAV_TYPE), BATT_CAPACITY_1=4 (mAh)
  local id = band(rshift(d, 24), 0xFF)
  local value = band(d, 0xFFFFFF)
  if id == 1 then V.frameType = value
  elseif id == 4 then V.autoCapacity = value end
end

decoders[0x5004] = function (d)
  V.homeDistM = dec_3_2(band(d, 0x1FFF))
  V.homeAltM = dec_3_2(band(rshift(d, 12), 0x1FFF)) * 0.1
  V.homeBearingDeg = band(rshift(d, 25), 0x7F) * 3
  V.tHome = now()
end

decoders[0x5005] = function (d)
  V.vspdMs = dec_2_1(band(d, 0x1FF)) * 0.1
  V.hspdMs = dec_2_1(band(rshift(d, 9), 0x1FF)) * 0.1
  V.yawDeg = band(rshift(d, 17), 0x7FF) * 0.2
  if V.hspdMs > V.maxSpdMs then V.maxSpdMs = V.hspdMs end
  local t = now()
  -- trip distance: ground speed over time while armed; a gap over 1s is a dropout, not travel
  if V.armed and V.tOdo >= 0 and t - V.tOdo <= 100 then V.odoM = V.odoM + V.hspdMs * (t - V.tOdo) / 100 end
  V.tOdo = t
  V.tVel = t; V.lastStreamT = V.tVel
end

decoders[0x5006] = function (d)
  V.rollDeg = band(d, 0x7FF) * 0.2 - 180
  V.pitchDeg = band(rshift(d, 11), 0x3FF) * 0.2 - 90
  V.rangeM = dec_3_1(band(rshift(d, 21), 0x7FF)) * 0.01
  local t = now()
  if V.rangeM > 0 and t - V.tDepthHist >= 100 then
    local h = V.depthHist
    h[#h + 1] = V.rangeM
    if #h > 240 then table.remove(h, 1) end
    V.tDepthHist = t
  end
  V.tAtt = now(); V.lastStreamT = V.tAtt
end

decoders[0x500D] = function (d)
  -- calc_waypoint: nav index [10:0], distance(3,2) m at 11, bearing/3deg at 23
  V.wpNum = band(d, 0x7FF)
  V.wpDistM = dec_3_2(band(rshift(d, 11), 0x1FFF))
  V.wpBearingDeg = band(rshift(d, 23), 0x7F) * 3
  V.tWp = now()
end

decoders[0x500C] = function (d)
  -- calc_wind (copter): angle(2,0) in 3-deg units at 0, speed(2,1) dm/s at 7
  V.windDirDeg = dec_2_0(band(d, 0x7F)) * 3
  V.windMs = dec_2_1(band(rshift(d, 7), 0x1FF)) * 0.1
  V.tWind = now()
end

decoders[0x800] = function (d)
  local coord = band(d, 0x3FFFFFFF) / 600000
  if btest(d, 0x80000000) then coord = -coord end
  if btest(d, 0x40000000) then V.lon = coord else V.lat = coord end
  V.lastStreamT = now()
end

-- ELRS MAVLink mode carries position in the native CRSF GPS frame (the
-- EdgeTX "GPS" sensor), NOT in passthrough 0x800; Yaapu reads
-- getValue("GPS") for the same reason. Keep 0x800 for FrSky SPort links.
-- Same story for battery remaining: the CRSF battery frame carries
-- ArduPilot's own remaining-% ("Bat%" sensor); 0x5007 BATT_CAPACITY may
-- never arrive over ELRS.
local lastSensorPollT = 0
local function pollSensors()
  if now() - lastSensorPollT < 50 then return end
  lastSensorPollT = now()
  local g = getValue('GPS')
  if type(g) == 'table' and g.lat and g.lon and (g.lat ~= 0 or g.lon ~= 0) then
    V.lat = g.lat
    V.lon = g.lon
  end
  if getFieldInfo and getFieldInfo('Bat%') then
    local p = getValue('Bat%')
    -- 0 doubles as "sensor exists but FC sent nothing"; a pack at a true
    -- 0% in flight is already on the ground
    if type(p) == 'number' and p >= 1 and p <= 100 then
      V.sensorPct = p
      V.tSensorPct = now()
    end
  end
end

local SEV_LABEL = { [0]='EMRG', 'ALRT', 'CRIT', 'ERR', 'WARN', 'NOTC', 'INFO', '' }

local lastPrearmT = -1000

-- Spoken vocabulary for common ArduPilot statustexts (plain-substring
-- match, first hit wins). Everything else falls back to severity tones -
-- the radio has no TTS, these are pre-generated phrases.
local MSG_SOUNDS = {
  { 'PreArm', 'arm_denied' },
  { 'AutoTune: Success', 'autotune_done' },
  { 'AutoTune: Failed', 'autotune_failed' },
  { 'GPS Glitch', 'gps_glitch' },
  { 'Glitch cleared', 'glitch_cleared' },
  { 'variance', 'ekf_variance' },
  { 'is using GPS', 'ekf_using_gps' },
  { 'EKF primary changed', 'ekf_lane' },
  { 'yaw alignment complete', 'yaw_aligned' },
  { 'yaw re-aligned', 'yaw_aligned' },
  { 'Radio Failsafe', 'rc_failsafe' },
  { 'Crash: Disarming', 'crash' },
  { 'Terrain data missing', 'terrain_missing' },
  { 'Mission complete', 'mission_complete' },
  { 'Vibration compensation ON', 'high_vibe' },
  { 'is low', 'batt_low' },        -- "Battery 1 is low" (FC-side failsafe text)
  { 'is critical', 'batt_crit' },
}

local function pushMsg(sev, text)
  V.msgHead = V.msgHead % 8 + 1
  V.msgs[V.msgHead] = { t = now(), sev = sev, text = text }
  for i = 1, #MSG_SOUNDS do
    if string.find(text, MSG_SOUNDS[i][1], 1, true) then
      -- rate-limit repeated spoken texts (PreArm spam is real)
      if now() - lastPrearmT > 500 then
        lastPrearmT = now()
        playAlert(MSG_SOUNDS[i][2], V.muted)
      end
      return
    end
  end
  if sev <= 4 and now() - V.lastToneT > 100 then
    V.lastToneT = now()
    if not V.muted then
      playTone(sev <= 3 and 1600 or 900, 200, 50, PLAY_NOW)
    end
  end
end

decoders[0x5000] = function (d)
  local done = false
  local sev = 0
  for i = 0, 3 do
    local b = band(rshift(d, i * 8), 0xFF)
    local c = band(b, 0x7F)
    if i < 3 and btest(b, 0x80) then sev = sev + 2 ^ i end
    if c == 0 then done = true break end
    V.msgBuf = V.msgBuf .. string.char(c)
  end
  if done then
    pushMsg(band(sev, 0x07), V.msgBuf)
    V.msgBuf = ''
  end
end

-- ========================== CRSF pump ==================================
local function bytesToU32(data, ofs)
  return (data[ofs] or 0) + (data[ofs + 1] or 0) * 256
    + (data[ofs + 2] or 0) * 65536 + (data[ofs + 3] or 0) * 16777216
end

-- Echogram from the ArduDeck sonar script (src/main/lua-scripts/ardudeck_sonar.lua):
-- column = 4 frames at 0x5200 | seq << 2 | segment, 8 nibbles each; range = 0x5240.
local ECHO_MAX_COLS = 160
local function decodeEcho(appid, d)
  if appid == 0x5240 then
    V.echoStartM = band(d, 0x3FFF) / 10
    V.echoLenM = band(rshift(d, 14), 0xFFFF) / 10
    return
  end
  local seq, segment = band(rshift(appid, 2), 0x0F), band(appid, 0x03)
  if seq ~= V.echoSeq then
    V.echoSeq, V.echoMask, V.echoCur = seq, 0, {}
  end
  for k = 0, 7 do V.echoCur[segment * 8 + k + 1] = band(rshift(d, 4 * k), 0x0F) end
  V.echoMask = V.echoMask + (btest(V.echoMask, 2 ^ segment) and 0 or 2 ^ segment)
  if V.echoMask == 15 then
    local col = V.echoCur
    V.echo[#V.echo + 1] = col
    if #V.echo > ECHO_MAX_COLS then table.remove(V.echo, 1) end
    V.echoMask, V.echoCur, V.tEcho = 16, {}, now() -- 16: this seq is done, wait for the next
  end
end

local function handlePassthrough(appid, value)
  V.everFrame = true
  V.lastFrameT = now()
  if appid >= 0x5200 and appid <= 0x5240 then decodeEcho(appid, value) return end
  local dec = decoders[appid]
  if dec then dec(value) end
end

local function pump()
  for _ = 1, 32 do
    if getUsage() > 70 then break end
    local cmd, data = crossfireTelemetryPop()
    if cmd == nil then break end
    -- Frame layout verified against Yaapu's decoder (proven on hardware):
    -- cmd 0x80 (0x7F legacy), data[1]=subtype; 0xF0 single: appid LE at
    -- data[2..3], value LE at data[4..7]; 0xF2 array: count data[2],
    -- 6-byte entries from data[3]; 0xF1 text: severity data[2], chars
    -- from data[3].
    if cmd == 0x0D and data ~= nil and #data >= 3 then
      local raw = data[2] * 256 + data[3]
      if raw >= 0x8000 then raw = raw - 0x10000 end
      V.crsfTemp = raw / 10
      V.tCrsfTemp = now()
    elseif (cmd == 0x80 or cmd == 0x7F) and data ~= nil then
      local sub = data[1]
      if sub == 0xF0 and #data >= 7 then
        handlePassthrough(data[2] + data[3] * 256, bytesToU32(data, 4))
      elseif sub == 0xF2 and #data >= 8 then
        local count = data[2]
        local ofs = 3
        for _ = 1, count do
          if #data < ofs + 5 then break end
          handlePassthrough(data[ofs] + data[ofs + 1] * 256, bytesToU32(data, ofs + 2))
          ofs = ofs + 6
        end
      elseif sub == 0xF1 and #data >= 3 then
        local text = ''
        for i = 3, #data do
          local c = band(data[i], 0x7F)
          if c == 0 then break end
          text = text .. string.char(c)
        end
        if #text > 0 then pushMsg(band(data[2], 0x07), text) end
        V.everFrame = true
        V.lastFrameT = now()
      end
    end
  end
end

-- ======================= diagnostic ladder =============================
-- Frames are the authority, RSSI is only a hint. getRSSI() reads a model
-- sensor, and a model whose CRSF sensors were never discovered (or an ELRS
-- link running MAVLink telemetry) answers 0 forever. Judging the link on that
-- declared NO LINK while telemetry was streaming, which flipped the state back
-- and forth and had the announcer calling the link lost and found on a loop.
local function ladderState()
  local t = now()
  local framesFresh = V.everFrame and (t - V.lastFrameT <= 300)
  if framesFresh then
    if t - V.lastStreamT > 300 then
      return 'STREAMS OFF', 'FC not streaming - connect ArduDeck to fix rates', T.WARN
    end
    return 'LIVE', nil, T.SUCCESS
  end
  local rssi = getRSSI()
  if rssi == nil or rssi == 0 then
    return 'NO LINK', 'radio link down - check RX power / binding', T.DANGER
  end
  return 'NO MAVLINK', 'link up, no telemetry frames - ELRS MAVLink mode?', T.WARN
end

-- =========================== demo mode =================================
-- Synthesizes an animated flight so users can evaluate layout on the radio
-- with nothing connected. Always visibly badged DEMO; never mistakable for
-- real telemetry.
local demoActive = false

local DEMO_MODES = { 5, 6, 2, 16 } -- Loiter, RTL, AltHold, PosHold

local function demoTick()
  local t = now() * 0.01 -- seconds
  -- scripted so the announcer gets exercised: disarm window every 90s,
  -- mode change every 25s, brief GPS dropout every 75s, battery ramp
  V.armed = (t % 90) >= 6
  V.flying = V.armed
  V.modeNum = DEMO_MODES[math.floor(t / 25) % #DEMO_MODES + 1]
  V.voltV = 23.0 + math.sin(t * 0.4) * 0.4
  V.currA = 7 + math.sin(t * 1.3) * 3
  V.mah = math.floor((t * 12) % (CFG.capacity > 0 and CFG.capacity or 2200))
  local gpsOut = (t % 75) < 5
  V.sats = gpsOut and 0 or 14
  V.fix = gpsOut and 0 or 3
  V.hdop = 0.8
  V.homeDistM = math.floor(150 + math.sin(t * 0.2) * 120)
  V.homeBearingDeg = math.floor((t * 9) % 360)
  V.homeAltM = 40 + math.sin(t * 0.3) * 25
  V.vspdMs = math.sin(t * 0.5) * 2.5
  V.hspdMs = 6 + math.sin(t * 0.35) * 5
  V.yawDeg = (t * 18) % 360
  V.rollDeg = math.sin(t * 0.8) * 25
  V.pitchDeg = math.sin(t * 0.6) * 12
  V.rangeM = 2 + math.sin(t) * 1.5
  V.throttle = math.floor(45 + math.sin(t * 0.7) * 15)
  V.imuTemp = 41
  V.windMs = 3 + math.sin(t * 0.15) * 2.5
  V.windDirDeg = math.floor((40 + t * 3) % 360)
  V.tWind = now()
  V.wpNum = math.floor(t / 30) % 7 + 1
  V.wpDistM = 400 - (t % 30) * 12
  V.wpBearingDeg = math.floor((V.homeBearingDeg + 120) % 360)
  V.tWp = now()
  local ts = now()
  V.tAp = ts; V.tGps = ts; V.tBatt = ts; V.tHome = ts; V.tVel = ts; V.tAtt = ts
  if #V.msgs == 0 then
    pushMsg(6, 'DEMO: EKF3 IMU0 is using GPS')
    pushMsg(4, 'DEMO: Terrain data missing')
  end
end

-- Effective battery setup: ArduDeck config overrides; otherwise
-- self-configured from telemetry (capacity via passthrough 0x5007,
-- cell count from peak voltage in 4.3V steps).
local function effBattery()
  local capacity = CFG.capacity > 0 and CFG.capacity or V.autoCapacity
  local cells = CFG.cells
  if cells <= 0 and V.maxVolt > 6 then
    cells = math.floor(V.maxVolt / 4.3) + 1
  end
  if demoActive then
    if capacity <= 0 then capacity = 2200 end
    if cells <= 0 then cells = 6 end
  end
  return capacity, cells
end

-- ========================= shared drawing ==============================
local function drawBackdrop()
  lcd.drawFilledRectangle(0, 0, LCD_W, LCD_H, T.BG_BASE)
  for x = 28, LCD_W - 1, 28 do lcd.drawLine(x, 0, x, LCD_H - 1, SOLID, T.GRID) end
  for y = 28, LCD_H - 1, 28 do lcd.drawLine(0, y, LCD_W - 1, y, SOLID, T.GRID) end
end

local function drawLadderBanner(state, hint, color)
  drawBackdrop()
  lcd.drawText(LCD_W / 2, 84, state, DBLSIZE + CENTER + color)
  if hint then
    lcd.drawText(LCD_W / 2, 148, hint, 0 + CENTER + T.TEXT_2)
  end
  lcd.drawText(LCD_W / 2, LCD_H - 60, 'tap screen for demo mode', SMLSIZE + CENTER + T.TEXT_3)
  lcd.drawText(LCD_W / 2, LCD_H - 34, 'ArduDeck', SMLSIZE + CENTER + T.ACCENT)
end

local function tileFrame(x, y, w, h, caption)
  lcd.drawFilledRectangle(x, y, w, h, T.SURFACE)
  lcd.drawRectangle(x, y, w, h, T.GAUGE_EDGE)
  lcd.drawText(x + 8, y + 3, caption, SMLSIZE + T.TEXT_3)
end

local FONT_H = {}
-- Measured once; the fallbacks cover firmware whose sizeText returns no height.
local function fontH(f)
  if not FONT_H[f] then
    local _, th = lcd.sizeText('0', f)
    FONT_H[f] = th or (f == DBLSIZE and 34 or f == MIDSIZE and 25 or f == SMLSIZE and 13 or 17)
  end
  return FONT_H[f]
end

-- Link lost after data arrived: the page keeps the last values (greyed as stale) and this bar replaces the top bar.
local function drawLinkLostBar(state, hint, color)
  lcd.drawFilledRectangle(0, 0, LCD_W, 38, color)
  local ago = math.max(0, math.floor((now() - V.lastFrameT) / 100))
  local agoTxt = ago < 60 and string.format('%ds', ago) or string.format('%d:%02d', math.floor(ago / 60), ago % 60)
  local line = state .. '   last data ' .. agoTxt .. ' ago'
  if hint and LCD_W >= 400 and lcd.sizeText(line .. '   ' .. hint, SMLSIZE) < LCD_W - 24 then
    line = line .. '   ' .. hint
  end
  lcd.drawText(LCD_W / 2, 19 - math.floor(fontH(SMLSIZE) / 2), line, SMLSIZE + CENTER + T.TEXT)
end

-- Big value over an optional sub line, fonts picked so they fit the tile without overlapping.
-- Returns valueY, valueFont, subY, subFont; subY is nil when there is no room for it.
-- First of `options` that fits `maxW` at `font`, else the shortest one.
local function fitText(maxW, font, options)
  for _, o in ipairs(options) do
    if lcd.sizeText(o, font) <= maxW then return o end
  end
  return options[#options]
end

local STACK_SUB = { { DBLSIZE, 0 }, { DBLSIZE, SMLSIZE }, { MIDSIZE, 0 }, { MIDSIZE, SMLSIZE }, { DBLSIZE }, { MIDSIZE } }
local STACK_ONE = { { DBLSIZE }, { MIDSIZE } }
local function stack(y, h, withSub)
  local top, room = y + 16, h - 18
  for _, t in ipairs(withSub and STACK_SUB or STACK_ONE) do
    local vh, sh = fontH(t[1]), t[2] and fontH(t[2]) or 0
    if vh + sh <= room then
      local vy = top + math.floor((room - vh - sh) / 2)
      return vy, t[1], t[2] and (vy + vh) or nil, t[2]
    end
  end
  return top, MIDSIZE
end

local function staleColor(t, liveColor)
  return (now() - t > STALE_AFTER) and T.STALE or liveColor
end

-- Largest font, from the one the layout picked, that keeps the text inside maxW:
-- a long value (123.4m, 100%) steps down instead of running into the tile's graphic.
local FIT_DOWN = { [DBLSIZE] = MIDSIZE, [MIDSIZE] = 0, [0] = SMLSIZE }
local function fitFont(text, f, maxW)
  for _ = 1, 3 do
    local nxt = FIT_DOWN[f]
    if nxt == nil or nxt == f or lcd.sizeText(text, f) <= maxW then break end
    f = nxt
  end
  return f
end

-- A value line drawn at the largest font that fits, kept on the same centre line.
local function valueText(x, vy, maxW, text, vf, color)
  local f = fitFont(text, vf, maxW)
  lcd.drawText(x, vy + math.floor((fontH(vf) - fontH(f)) / 2), text, f + color)
end

local function fmtSpeed(ms)
  if ms >= 10 then return string.format('%d', math.floor(ms + 0.5)) end
  return string.format('%.1f', ms)
end

-- =========================== tile drawers ==============================
local TILE = {}

TILE.batt = function (x, y, w, h, variant)
  tileFrame(x, y, w, h, 'BATTERY')
  local capacity, cells = effBattery()
  local cellV = cells > 0 and V.voltV / cells or nil
  local pct = nil
  if capacity > 0 then
    pct = math.max(0, math.min(100, (capacity - V.mah) / capacity * 100))
  elseif V.sensorPct and now() - V.tSensorPct < STALE_AFTER * 3 then
    pct = V.sensorPct -- FC's own reckoning via CRSF battery frame
  end
  local vColor = T.TEXT
  if pct then
    vColor = pct > 30 and T.SUCCESS or (pct > 15 and T.WARN_STRONG or T.DANGER)
  elseif cellV then
    if cellV <= CFG.crit_cell then vColor = T.DANGER
    elseif cellV <= CFG.low_cell then vColor = T.WARN
    else vColor = T.SUCCESS end
  end
  if pct and variant == 'icon' then
    -- battery glyph that grows with the tile: body + terminal nub, filled by what is left
    local pctTxt = string.format('%d%%', math.floor(pct + 0.5))
    local subTxt = string.format('%.1fV  %s%.0fA', V.voltV, cellV and string.format('%.2fV/c  ', cellV) or '', V.currA)
    local function glyph(bx, by, bw, bh)
      local t = math.max(1, math.floor(bh / 12))
      for k = 0, t - 1 do lcd.drawRectangle(bx + k, by + k, bw - 2 * k, bh - 2 * k, T.GAUGE_TICK) end
      local nub = math.max(3, math.floor(bw / 14))
      lcd.drawFilledRectangle(bx + bw, by + math.floor(bh * 0.28), nub, bh - 2 * math.floor(bh * 0.28), T.GAUGE_TICK)
      local pad = t + 1
      local fill = math.floor((bw - 2 * pad) * pct / 100 + 0.5)
      if fill > 0 then lcd.drawFilledRectangle(bx + pad, by + pad, fill, bh - 2 * pad, staleColor(V.tBatt, vColor)) end
    end
    if h >= 110 then
      -- tall: glyph centred, the percentage large under it, the details under that
      local fb = fitFont(pctTxt, DBLSIZE, w - 16)
      local room = h - 22 - fontH(fb) - fontH(SMLSIZE) - 12
      local bw = math.floor(math.min(w - 40, room / 0.45))
      local bh = math.floor(bw * 0.45)
      local top = y + 18 + math.floor((h - 18 - bh - fontH(fb) - fontH(SMLSIZE) - 12) / 2)
      glyph(x + math.floor((w - bw) / 2) - 2, top, bw, bh)
      lcd.drawText(x + math.floor(w / 2), top + bh + 6, pctTxt, fb + CENTER + staleColor(V.tBatt, vColor))
      lcd.drawText(x + math.floor(w / 2), top + bh + 6 + fontH(fb) + 6, fitText(w - 12, SMLSIZE, { subTxt, string.format('%.1fV', V.voltV) }),
        SMLSIZE + CENTER + staleColor(V.tBatt, T.TEXT_2))
      return
    end
    -- compact: glyph and percentage side by side, details under, block centred in the tile
    local bw, bh = 46, 22
    local fb = fitFont(pctTxt, DBLSIZE, w - 16 - bw - 16)
    local rowH = math.max(bh, fontH(fb))
    local top = y + 18 + math.floor((h - 18 - rowH - fontH(SMLSIZE) - 4) / 2)
    glyph(x + 8, top + math.floor((rowH - bh) / 2), bw, bh)
    lcd.drawText(x + 8 + bw + 12, top + math.floor((rowH - fontH(fb)) / 2), pctTxt, fb + staleColor(V.tBatt, vColor))
    lcd.drawText(x + 8, top + rowH + 4, fitText(w - 16, SMLSIZE, { subTxt, string.format('%.1fV', V.voltV) }), SMLSIZE + staleColor(V.tBatt, T.TEXT_2))
    return
  end
  if pct then
    -- value, then the bar, then the sub line: 12px of the tile goes to the bar
    local vy, vf, sy, sf = stack(y, h - 12, true)
    local vh = fontH(vf)
    lcd.drawText(x + 8, vy, string.format('%d%%', math.floor(pct + 0.5)),
      vf + staleColor(V.tBatt, vColor))
    lcd.drawText(x + w - 8, vy + vh - fontH(0), string.format('%.1fV', V.voltV),
      0 + RIGHT + staleColor(V.tBatt, T.TEXT_2))
    local bx, by, bw, bh = x + 8, vy + vh + 2, w - 16, 8
    lcd.drawFilledRectangle(bx, by, bw, bh, T.GAUGE_BEZEL_2)
    local fill = math.floor(bw * pct / 100 + 0.5)
    if fill > 0 then lcd.drawFilledRectangle(bx, by, fill, bh, vColor) end
    lcd.drawRectangle(bx, by, bw, bh, T.GAUGE_EDGE)
    if sy then
      local cv = cellV and string.format('%.2fV/c  ', cellV) or ''
      lcd.drawText(bx, sy + 12, fitText(bw, sf, {
        string.format('%s%.0fA  %dmAh used', cv, V.currA, V.mah),
        string.format('%s%.0fA  %dmAh', cv, V.currA, V.mah),
        string.format('%s%.0fA', cv, V.currA) }),
        sf + staleColor(V.tBatt, T.TEXT_2))
    end
  elseif cellV then
    -- no %, but cells known: keep the graphic, fill by per-cell voltage
    -- (crit_cell..4.2V), big number is the honest voltage
    local vfrac = math.max(0, math.min(1, (cellV - CFG.crit_cell) / (4.2 - CFG.crit_cell)))
    if variant == 'icon' then
      local bw, bh = 46, 22
      local bx, by = x + 8, y + 22
      lcd.drawRectangle(bx, by, bw, bh, T.GAUGE_TICK)
      lcd.drawFilledRectangle(bx + bw, by + 6, 4, bh - 12, T.GAUGE_TICK)
      local fill = math.floor((bw - 4) * vfrac + 0.5)
      if fill > 0 then lcd.drawFilledRectangle(bx + 2, by + 2, fill, bh - 4, vColor) end
      lcd.drawText(bx + bw + 12, by - 6, string.format('%.1fV', V.voltV),
        DBLSIZE + staleColor(V.tBatt, vColor))
      lcd.drawText(x + 8, by + bh + 6, string.format('%.2fV/c  %.0fA', cellV, V.currA),
        SMLSIZE + staleColor(V.tBatt, T.TEXT_2))
    else
      local vy, vf, sy, sf = stack(y, h - 12, true)
      lcd.drawText(x + 8, vy, string.format('%.1fV', V.voltV),
        vf + staleColor(V.tBatt, vColor))
      local bx, by, bw, bh = x + 8, vy + fontH(vf) + 2, w - 16, 8
      lcd.drawFilledRectangle(bx, by, bw, bh, T.GAUGE_BEZEL_2)
      local fill = math.floor(bw * vfrac + 0.5)
      if fill > 0 then lcd.drawFilledRectangle(bx, by, fill, bh, vColor) end
      lcd.drawRectangle(bx, by, bw, bh, T.GAUGE_EDGE)
      if sy then
        lcd.drawText(bx, sy + 12, fitText(bw, sf, {
          string.format('%.2fV/c  %.0fA  %dmAh used', cellV, V.currA, V.mah),
          string.format('%.2fV/c  %.0fA  %dmAh', cellV, V.currA, V.mah),
          string.format('%.2fV/c  %.0fA', cellV, V.currA) }),
          sf + staleColor(V.tBatt, T.TEXT_2))
      end
    end
  else
    local vy, vf, sy, sf = stack(y, h, true)
    lcd.drawText(x + 8, vy, string.format('%.1fV', V.voltV), vf + staleColor(V.tBatt, vColor))
    if sy then
      lcd.drawText(x + 8, sy, string.format('%.0fA  %dmAh', V.currA, V.mah),
        sf + staleColor(V.tBatt, T.TEXT_2))
    end
  end
end

TILE.home = function (x, y, w, h)
  tileFrame(x, y, w, h, 'HOME')
  local vy, vf, sy, sf = stack(y, h, true)
  valueText(x + 8, vy, w - 16 - 40, string.format('%dm', V.homeDistM), vf, staleColor(V.tHome, T.TEXT))
  if sy then
    lcd.drawText(x + 8, sy, string.format('brg %d', V.homeBearingDeg),
      sf + staleColor(V.tHome, T.TEXT_2))
  end
  -- relative home-direction arrow (amber, matches the home markers)
  if V.homeDistM > 0 then
    local a = math.rad(V.homeBearingDeg - V.yawDeg)
    local acx, acy, ar = x + w - 22, y + math.floor(h / 2), math.min(13, h / 2 - 8)
    local sa, ca = math.sin(a), math.cos(a)
    local tipX, tipY = acx + sa * ar, acy - ca * ar
    lcd.drawLine(acx - sa * ar, acy + ca * ar, tipX, tipY, SOLID, staleColor(V.tHome, T.WARN_STRONG))
    lcd.drawFilledCircle(tipX, tipY, 3, staleColor(V.tHome, T.WARN_STRONG))
  end
end

local function fmtDist(m)
  if m >= 1000 then return string.format('%.2fkm', m / 1000) end
  return string.format('%dm', math.floor(m + 0.5))
end

TILE.alt = function (x, y, w, h)
  local kind = vehicleKind()
  -- height means nothing to a rover or boat: the tile shows how far it has gone
  if kind == 'rover' or kind == 'boat' then
    tileFrame(x, y, w, h, 'TRIP')
    local vy, vf, sy, sf = stack(y, h, true)
    valueText(x + 8, vy, w - 16 - 20, fmtDist(V.odoM), vf, staleColor(V.tVel, T.TEXT))
    if sy then
      lcd.drawText(x + 8, sy, string.format('home %s', fmtDist(V.homeDistM)), sf + staleColor(V.tHome, T.TEXT_2))
    end
    return
  end
  local sub = kind == 'sub'
  tileFrame(x, y, w, h, sub and 'DEPTH / VSPD' or 'ALT / VSPD')
  local vy, vf, sy, sf = stack(y, h, true)
  valueText(x + 8, vy, w - 16 - 20, string.format('%.0fm', sub and math.max(0, -V.homeAltM) or V.homeAltM), vf, staleColor(V.tHome, T.TEXT))
  local vsColor = math.abs(V.vspdMs) > 3 and T.WARN_STRONG or T.SUCCESS
  if sy then
    lcd.drawText(x + 8, sy, string.format('%+.1f  %s spd', V.vspdMs, fmtSpeed(V.hspdMs)),
      sf + staleColor(V.tVel, math.abs(V.vspdMs) > 3 and T.WARN_STRONG or T.TEXT_2))
  end
  -- VSI: center-zero vertical bar, +/-5 m/s full scale
  local bx, bh2 = x + w - 16, h - 34
  local by = y + 20
  local mid = by + bh2 / 2
  lcd.drawFilledRectangle(bx, by, 8, bh2, T.GAUGE_BEZEL_2)
  local frac = math.max(-1, math.min(1, V.vspdMs / 5))
  local fill = math.floor(math.abs(frac) * (bh2 / 2) + 0.5)
  if fill > 0 then
    if frac >= 0 then
      lcd.drawFilledRectangle(bx, mid - fill, 8, fill, staleColor(V.tVel, vsColor))
    else
      lcd.drawFilledRectangle(bx, mid, 8, fill, staleColor(V.tVel, vsColor))
    end
  end
  lcd.drawRectangle(bx, by, 8, bh2, T.GAUGE_EDGE)
  lcd.drawLine(bx - 2, mid, bx + 9, mid, SOLID, T.GAUGE_TICK)
end

TILE.gps = function (x, y, w, h)
  tileFrame(x, y, w, h, 'GPS')
  local FIX_LABEL = { [0] = 'NO GPS', 'NO FIX', '2D', '3D', 'DGPS', 'RTK FLT', 'RTK FIX' }
  local gpsColor = V.fix >= 3 and T.SUCCESS or (V.fix == 2 and T.WARN_STRONG or T.DANGER)
  local vy, vf, sy, sf = stack(y, h, true)
  valueText(x + 8, vy, w - 16 - 72, string.format('%d', V.sats), vf, staleColor(V.tGps, gpsColor))
  if sy then
    lcd.drawText(x + 8, sy, string.format('%s  hdop %.1f', FIX_LABEL[V.fix] or '?', V.hdop),
      sf + staleColor(V.tGps, T.TEXT_2))
  end
  -- satellite segments: 8 cells, lit by sats/2, in fix color
  local segs = 8
  local lit = math.min(segs, math.floor(V.sats / 2 + 0.5))
  local sx = x + w - 8 - segs * 8
  local sy = y + 24
  for i = 1, segs do
    local sxi = sx + (i - 1) * 8
    if i <= lit then
      lcd.drawFilledRectangle(sxi, sy, 6, 14, staleColor(V.tGps, gpsColor))
    else
      lcd.drawFilledRectangle(sxi, sy, 6, 14, T.GAUGE_BEZEL_2)
      lcd.drawRectangle(sxi, sy, 6, 14, T.GAUGE_EDGE)
    end
  end
end

-- center-zero deflection bar: direction + magnitude in one glance
local function attBar(x, y, w, angle, maxAngle, warnAngle, t)
  local bh = 10
  lcd.drawFilledRectangle(x, y, w, bh, T.GAUGE_BEZEL_2)
  local half = w / 2
  local frac = math.max(-1, math.min(1, angle / maxAngle))
  local fill = math.floor(math.abs(frac) * half + 0.5)
  local color = math.abs(angle) >= warnAngle and T.WARN_STRONG or T.GAUGE_NEEDLE
  if fill > 0 then
    if frac >= 0 then
      lcd.drawFilledRectangle(x + half, y, fill, bh, staleColor(t, color))
    else
      lcd.drawFilledRectangle(x + half - fill, y, fill, bh, staleColor(t, color))
    end
  end
  lcd.drawRectangle(x, y, w, bh, T.GAUGE_EDGE)
  lcd.drawLine(x + half, y - 2, x + half, y + bh + 1, SOLID, T.GAUGE_TICK)
end

-- Sky/ground per the app's AttitudeIndicator (AttitudePanel.tsx gradients):
-- sky blue-600 #2563eb, ground amber-800 #92400e (the gradient's deep end;
-- the lighter amber-700 reads cartoonish as a flat fill), white horizon.
local SKY = lcd.RGB(0x2563eb)
local GROUND = lcd.RGB(0x92400e)

-- Circle-clipped ball: scanline fill, 2px rows; a 120px ball costs ~60
-- lines/frame which fits the widget instruction budget comfortably.
local function drawBall(cx, cy, r)
  local rollRad = math.rad(V.rollDeg)
  local s, c = math.sin(rollRad), math.cos(rollRad)
  local pitchPx = V.pitchDeg * (r / 45)
  for dy = -r, r, 2 do
    local half = math.floor(math.sqrt(r * r - dy * dy) + 0.5)
    local yy = cy + dy
    if math.abs(s) < 0.02 then
      -- level-ish: whole row is one side
      lcd.drawLine(cx - half, yy, cx + half, yy, SOLID, (dy * c >= pitchPx) and GROUND or SKY)
    else
      -- ground where x*sin + dy*cos >= pitchPx
      local xb = (pitchPx - dy * c) / s
      local xl, xr = -half, half
      local bound = math.max(xl, math.min(xr, math.floor(xb + 0.5)))
      if s > 0 then
        if bound > xl then lcd.drawLine(cx + xl, yy, cx + bound, yy, SOLID, SKY) end
        if bound < xr then lcd.drawLine(cx + bound, yy, cx + xr, yy, SOLID, GROUND) end
      else
        if bound > xl then lcd.drawLine(cx + xl, yy, cx + bound, yy, SOLID, GROUND) end
        if bound < xr then lcd.drawLine(cx + bound, yy, cx + xr, yy, SOLID, SKY) end
      end
    end
  end
  -- horizon line through the ball
  local hx, hy = -s * pitchPx, c * pitchPx
  lcd.drawLineWithClipping(cx + hx - c * r, cy + hy - s * r, cx + hx + c * r, cy + hy + s * r,
    cx - r, cx + r, cy - r, cy + r, SOLID, T.GAUGE_NEEDLE)
  -- pitch ladder: short marks at +/-10 and +/-20 deg, rotating with roll
  for _, p in ipairs({ -20, -10, 10, 20 }) do
    local off = (V.pitchDeg - p) * (r / 45)
    local mx, my = cx - s * off, cy + c * off
    local ml = p % 20 == 0 and 14 or 8
    lcd.drawLineWithClipping(mx - c * ml, my - s * ml, mx + c * ml, my + s * ml,
      cx - r + 4, cx + r - 4, cy - r + 4, cy + r - 4, SOLID, T.GAUGE_TICK)
  end
  -- crisp bezel ring
  lcd.drawCircle(cx, cy, r, T.GAUGE_EDGE)
  lcd.drawCircle(cx, cy, r + 1, T.GAUGE_BEZEL_2)
end

TILE.att = function (x, y, w, h, variant)
  if variant == 'ball' then
    lcd.drawFilledRectangle(x, y, w, h, T.SURFACE)
    lcd.drawRectangle(x, y, w, h, T.GAUGE_EDGE)
    local cx = x + w / 2
    local cy = y + (h - 24) / 2 + 2
    local r = math.min(w - 16, h - 34) / 2
    lcd.drawFilledCircle(cx, cy, r + 3, T.GAUGE_BEZEL)
    drawBall(cx, cy, r)
    -- fixed amber aircraft reference
    lcd.drawLine(cx - 18, cy, cx - 6, cy, SOLID, T.WARN_STRONG)
    lcd.drawLine(cx + 6, cy, cx + 18, cy, SOLID, T.WARN_STRONG)
    lcd.drawFilledCircle(cx, cy, 2, T.WARN_STRONG)
    local stale = now() - V.tAtt > STALE_AFTER
    local chip = string.format('%03d', math.floor(V.yawDeg + 0.5))
    local cw = lcd.sizeText(chip, 0) + 10
    lcd.drawFilledRectangle(cx - cw / 2, y + h - 20, cw, 17, T.GAUGE_BEZEL)
    lcd.drawText(cx, y + h - 19, chip, 0 + CENTER + (stale and T.STALE or T.GAUGE_TICK))
    return
  end
  if variant == 'bars' or variant == 'numeric' then -- 'numeric' migrated to bars
    tileFrame(x, y, w, h, 'ATTITUDE')
    local bx, bw = x + 8, w - 70
    local rowY = y + 26
    lcd.drawText(bx, rowY - 8, 'ROLL', SMLSIZE + T.TEXT_3)
    attBar(bx, rowY + 6, bw, V.rollDeg, 45, 30, V.tAtt)
    lcd.drawText(x + w - 8, rowY + 2, string.format('%+.0f', V.rollDeg),
      0 + RIGHT + staleColor(V.tAtt, T.TEXT))
    local rowY2 = rowY + math.max(34, (h - 60) / 2)
    lcd.drawText(bx, rowY2 - 8, 'PITCH', SMLSIZE + T.TEXT_3)
    attBar(bx, rowY2 + 6, bw, V.pitchDeg, 30, 20, V.tAtt)
    lcd.drawText(x + w - 8, rowY2 + 2, string.format('%+.0f', V.pitchDeg),
      0 + RIGHT + staleColor(V.tAtt, T.TEXT))
    lcd.drawText(bx, y + h - 18, string.format('yaw %03d', math.floor(V.yawDeg + 0.5)),
      SMLSIZE + staleColor(V.tVel, T.TEXT_2))
    return
  end
  -- 'line' variant: gauge-face horizon
  lcd.drawFilledRectangle(x, y, w, h, T.GAUGE_FACE)
  local cx, cy = x + w / 2, y + h / 2
  local pitchPx = V.pitchDeg * (h / 90)
  local rollRad = math.rad(V.rollDeg)
  local dx = math.cos(rollRad) * w
  local dy = math.sin(rollRad) * w
  local cyp = cy + pitchPx * math.cos(rollRad)
  local atCol = staleColor(V.tAtt, T.GAUGE_NEEDLE)
  lcd.drawLineWithClipping(cx - dx / 2, cyp - dy / 2, cx + dx / 2, cyp + dy / 2,
    x + 1, x + w - 2, y + 1, y + h - 2, SOLID, atCol)
  lcd.drawLine(cx - 18, cy, cx - 6, cy, SOLID, T.WARN_STRONG)
  lcd.drawLine(cx + 6, cy, cx + 18, cy, SOLID, T.WARN_STRONG)
  lcd.drawFilledCircle(cx, cy, 2, T.WARN_STRONG)
  lcd.drawRectangle(x, y, w, h, T.GAUGE_BEZEL)
  lcd.drawText(x + 6, y + h - 18, string.format('yaw %03d', math.floor(V.yawDeg + 0.5)),
    SMLSIZE + staleColor(V.tVel, T.GAUGE_TICK))
end

TILE.compass = function (x, y, w, h)
  -- circular rose per the app's gauge palette: bezel ring, rotating card
  -- with 30-deg ticks + cardinals, fixed lubber line, amber home marker,
  -- heading chip at the bottom
  lcd.drawFilledRectangle(x, y, w, h, T.SURFACE)
  lcd.drawRectangle(x, y, w, h, T.GAUGE_EDGE)
  local cx = x + w / 2
  local cy = y + (h - 18) / 2 + 2
  local r = math.min(w, h - 22) / 2 - 4
  lcd.drawFilledCircle(cx, cy, r + 3, T.GAUGE_BEZEL)
  lcd.drawFilledCircle(cx, cy, r, T.GAUGE_FACE)
  local yawRad = math.rad(V.yawDeg)
  local stale = now() - V.tVel > STALE_AFTER
  for deg = 0, 330, 30 do
    local a = math.rad(deg) - yawRad
    local sa, ca = math.sin(a), math.cos(a)
    local major = deg % 90 == 0
    local len = major and 9 or 5
    lcd.drawLine(cx + sa * (r - len), cy - ca * (r - len), cx + sa * (r - 1), cy - ca * (r - 1),
      SOLID, major and T.GAUGE_TICK or T.TEXT_3)
    -- a small dial only has room for N; E/S/W would pile onto it
    if major and (deg == 0 or r >= 34) then
      local L = ({ [0]='N', [90]='E', [180]='S', [270]='W' })[deg]
      local color = deg == 0 and (stale and T.STALE or T.DANGER) or (stale and T.STALE or T.GAUGE_TICK)
      lcd.drawText(cx + sa * (r - 17) - 4, cy - ca * (r - 17) - 8, L, SMLSIZE + color)
    end
  end
  -- fixed lubber line (top) and aircraft dot
  lcd.drawFilledTriangle(cx - 4, cy - r - 3, cx + 4, cy - r - 3, cx, cy - r + 5, T.GAUGE_NEEDLE)
  lcd.drawFilledCircle(cx, cy, 2, T.GAUGE_NEEDLE)
  -- home marker: amber triangle on the card rim
  if V.homeDistM > 0 then
    local ha = math.rad(V.homeBearingDeg) - yawRad
    local hx, hy = cx + math.sin(ha) * (r - 8), cy - math.cos(ha) * (r - 8)
    lcd.drawFilledCircle(hx, hy, 3, T.WARN_STRONG)
  end
  -- heading chip
  local chip = string.format('%03d', math.floor(V.yawDeg + 0.5))
  local cw = lcd.sizeText(chip, 0) + 10
  lcd.drawFilledRectangle(cx - cw / 2, y + h - 20, cw, 17, T.GAUGE_BEZEL)
  lcd.drawText(cx, y + h - 19, chip, 0 + CENTER + (stale and T.STALE or T.GAUGE_TICK))
end

TILE.spd = function (x, y, w, h)
  local vsColor = math.abs(V.vspdMs) > 3 and T.WARN or T.TEXT_2
  tileFrame(x, y, w, h, 'SPEED')
  local vy, vf, sy, sf = stack(y, h, true)
  valueText(x + 8, vy, w - 16, fmtSpeed(V.hspdMs) .. ' m/s', vf, staleColor(V.tVel, T.TEXT))
  if sy then
    lcd.drawText(x + 8, sy, string.format('vspd %+.1f', V.vspdMs),
      sf + staleColor(V.tVel, vsColor))
  end
end

TILE.timer = function (x, y, w, h)
  tileFrame(x, y, w, h, isGround() and 'RUN TIME' or 'FLIGHT TIME')
  local total = V.armedAccum + (V.armedAtT and (now() - V.armedAtT) or 0)
  local secs = math.floor(total / 100)
  local vy, vf, sy, sf = stack(y, h, true)
  lcd.drawText(x + 8, vy,
    string.format('%02d:%02d', math.floor(secs / 60), secs % 60), vf + T.TEXT)
  if sy then
    lcd.drawText(x + 8, sy,
      V.armed and (isGround() and 'running' or 'flying') or (secs > 0 and 'tap to reset' or 'total this session'),
      sf + (V.armed and T.SUCCESS or T.TEXT_3))
  end
  if V.armed then
    -- pulse dot: alive-and-counting cue
    if band(math.floor(now() / 50), 1) == 0 then
      lcd.drawFilledCircle(x + w - 16, y + 24, 4, T.SUCCESS)
    end
  end
end

TILE.wind = function (x, y, w, h)
  tileFrame(x, y, w, h, 'WIND')
  local vy, vf, sy, sf = stack(y, h, true)
  valueText(x + 8, vy, w - 16 - 30, string.format('%.1f m/s', V.windMs), vf, staleColor(V.tWind, V.windMs > 8 and T.WARN or T.TEXT))
  if sy then
    lcd.drawText(x + 8, sy, string.format('from %03d', V.windDirDeg % 360),
      sf + staleColor(V.tWind, T.TEXT_2))
  end
  -- arrow showing wind direction relative to aircraft heading
  local a = math.rad(V.windDirDeg - V.yawDeg)
  local acx, acy, ar = x + w - 22, y + math.floor(h / 2), math.min(14, h / 2 - 8)
  local sa, ca = math.sin(a), math.cos(a)
  lcd.drawLine(acx - sa * ar, acy + ca * ar, acx + sa * ar, acy - ca * ar, SOLID, staleColor(V.tWind, T.INFO))
  lcd.drawFilledCircle(acx + sa * ar, acy - ca * ar, 2, staleColor(V.tWind, T.INFO))
end

TILE.thr = function (x, y, w, h)
  tileFrame(x, y, w, h, 'THROTTLE')
  local thr = V.throttle
  local ground = isGround()
  local c = math.abs(thr) >= 80 and T.WARN_STRONG or T.TEXT
  -- the number gets the room above the bar, so the two never overlap
  local barH = 8
  local bx, by, bw2 = x + 8, y + h - barH - 8, w - 16
  local vy, vf = stack(y, h - barH - 10, false)
  local label = (ground and thr < 0) and string.format('R %d%%', -thr) or string.format('%d%%', thr)
  valueText(x + 8, vy, w - 16, label, vf, staleColor(V.tAp, c))
  lcd.drawFilledRectangle(bx, by, bw2, barH, T.GAUGE_BEZEL_2)
  local fc = staleColor(V.tAp, math.abs(thr) >= 80 and T.WARN_STRONG or T.SUCCESS)
  if ground then
    -- reverse grows left of centre, forward right
    local mid = bx + math.floor(bw2 / 2)
    local len = math.floor((bw2 / 2) * math.min(100, math.abs(thr)) / 100 + 0.5)
    if len > 0 then lcd.drawFilledRectangle(thr < 0 and mid - len or mid, by, len, barH, fc) end
    lcd.drawLine(mid, by - 3, mid, by + barH + 2, SOLID, T.GAUGE_TICK)
  else
    local fill = math.floor(bw2 * math.max(0, math.min(100, thr)) / 100 + 0.5)
    if fill > 0 then lcd.drawFilledRectangle(bx, by, fill, barH, fc) end
  end
  lcd.drawRectangle(bx, by, bw2, barH, T.GAUGE_EDGE)
end

-- ===================== driving and diving instruments =====================
local function kmh(ms) return ms * 3.6 end

-- Arc made of short segments (0 deg = up, clockwise); no arc call on every EdgeTX build.
local function arc(cx, cy, r, a0, a1, thick, color)
  if a1 <= a0 then return end
  local step = 6
  for k = 0, thick - 1 do
    local rr = r - k
    local px, py
    local a = a0
    while true do
      local rad = math.rad(a)
      local qx, qy = cx + math.sin(rad) * rr, cy - math.cos(rad) * rr
      if px then lcd.drawLine(px, py, qx, qy, SOLID, color) end
      px, py = qx, qy
      if a >= a1 then break end
      a = math.min(a1, a + step)
    end
  end
end

-- Rectangle in a rotated frame, as two filled triangles.
local function quad(cx, cy, ang, x0, y0, x1, y1, color)
  local s, c = math.sin(ang), math.cos(ang)
  local function p(px, py) return cx + px * c - py * s, cy + px * s + py * c end
  local ax, ay = p(x0, y0)
  local bx, by = p(x1, y0)
  local qx, qy = p(x1, y1)
  local dx, dy = p(x0, y1)
  lcd.drawFilledTriangle(ax, ay, bx, by, qx, qy, color)
  lcd.drawFilledTriangle(ax, ay, qx, qy, dx, dy, color)
end

local SPEED_STEPS = { 10, 20, 30, 40, 60, 80, 100, 150, 200, 300 }
local function speedScale(maxKmh)
  for _, v in ipairs(SPEED_STEPS) do
    if v >= maxKmh * 1.1 then return v end
  end
  return SPEED_STEPS[#SPEED_STEPS]
end

TILE.speedo = function (x, y, w, h)
  tileFrame(x, y, w, h, 'SPEED')
  local v = kmh(V.hspdMs)
  local top = speedScale(kmh(V.maxSpdMs))
  -- a 240 deg arc is 1.5 radii tall; caption above, max line below
  local r = math.floor(math.min((w - 16) / 2, (h - 34) / 1.5))
  if r < 12 then return end
  local cx, cy = x + math.floor(w / 2), y + 16 + r
  local thick = math.max(3, math.floor(r / 6))
  arc(cx, cy, r, -120, 120, thick, T.GAUGE_BEZEL_2)
  local frac = math.max(0, math.min(1, v / top))
  if frac > 0 then arc(cx, cy, r, -120, -120 + 240 * frac, thick, staleColor(V.tVel, frac > 0.9 and T.WARN_STRONG or T.SUCCESS)) end
  local num = string.format('%d', math.floor(v + 0.5))
  local f = fitFont(num, r >= 40 and DBLSIZE or MIDSIZE, 2 * (r - thick) - 6)
  lcd.drawText(cx, cy - math.floor(fontH(f) / 2) - 2, num, f + CENTER + staleColor(V.tVel, T.TEXT))
  local unitY = cy + math.floor(fontH(f) / 2) - 2
  lcd.drawText(cx, unitY, 'km/h', SMLSIZE + CENTER + T.TEXT_3)
  -- the max line only where it clears the unit; small tiles keep the gauge readable instead
  if unitY + fontH(SMLSIZE) + 2 <= y + h - 16 then
    lcd.drawText(cx, y + h - 16, string.format('max %d  of %d', math.floor(kmh(V.maxSpdMs) + 0.5), top), SMLSIZE + CENTER + T.TEXT_3)
  end
end

local CARDINAL = { [0] = 'N', [90] = 'E', [180] = 'S', [270] = 'W' }

TILE.heading = function (x, y, w, h)
  lcd.drawFilledRectangle(x, y, w, h, T.SURFACE)
  lcd.drawRectangle(x, y, w, h, T.GAUGE_EDGE)
  local hdg = V.yawDeg
  local cx = x + math.floor(w / 2)
  local ppd = w / 90 -- 90 degrees across the tile
  local base = y + h - 3
  local boxHalf = math.floor(lcd.sizeText('000', MIDSIZE) / 2) + 8
  local d0 = math.floor((hdg - 45) / 10) * 10
  for d = d0, d0 + 100, 10 do
    local px = math.floor(cx + (d - hdg) * ppd + 0.5)
    if px > x + 2 and px < x + w - 2 then
      local dd = d % 360
      local major = dd % 30 == 0
      lcd.drawLine(px, base, px, base - (major and 9 or 4), SOLID, T.GAUGE_TICK)
      if major and math.abs(px - cx) > boxHalf + 6 then
        local lbl = CARDINAL[dd] or tostring(dd)
        lcd.drawText(px, base - 9 - fontH(SMLSIZE), lbl, SMLSIZE + CENTER + (CARDINAL[dd] and T.TEXT or T.TEXT_3))
      end
    end
  end
  -- next waypoint: a mark on the tape, pinned to the edge when it is behind
  if V.wpNum > 0 and now() - V.tWp <= STALE_AFTER then
    local off = ((V.wpBearingDeg - hdg + 540) % 360) - 180
    local px = math.floor(cx + math.max(-44, math.min(44, off)) * ppd + 0.5)
    lcd.drawFilledTriangle(px - 6, y + 2, px + 6, y + 2, px, y + 10, T.INFO)
  end
  local txt = string.format('%03d', math.floor(hdg + 0.5) % 360)
  local tw = lcd.sizeText(txt, MIDSIZE)
  local fh = fontH(MIDSIZE)
  lcd.drawFilledRectangle(cx - math.floor(tw / 2) - 5, y + 1, tw + 10, fh + 2, T.SURFACE)
  lcd.drawRectangle(cx - math.floor(tw / 2) - 5, y + 1, tw + 10, fh + 2, T.GAUGE_TICK)
  lcd.drawText(cx, y + 2, txt, MIDSIZE + CENTER + staleColor(V.tAtt, T.TEXT))
  lcd.drawFilledTriangle(cx - 5, base + 2, cx + 5, base + 2, cx, base - 5, T.GAUGE_TICK)
end

-- Vehicle outlines for the tilt tile, in units of the drawing size, y down.
-- Each part is a convex polygon {x1,y1,x2,y2,...}, or a circle {'c',x,y,r};
-- the third field picks the colour: 'b' body, 'd' dark detail.
local function ellipse(rx, ry, n)
  local pts = {}
  for i = 0, n - 1 do
    local a = 2 * math.pi * i / n
    pts[#pts + 1] = math.cos(a) * rx
    pts[#pts + 1] = math.sin(a) * ry
  end
  return pts
end
-- the sub's long hull, as the first part of its side view
local SUB_HULL = ellipse(0.56, 0.16, 20)
table.insert(SUB_HULL, 1, 'b')
local SHAPES = {
  car = {
    rear = {
      { 'b', -0.48, -0.05, 0.48, -0.05, 0.5, 0.25, -0.5, 0.25 },
      { 'b', -0.32, -0.34, 0.32, -0.34, 0.42, -0.05, -0.42, -0.05 },
      { 'd', -0.26, -0.29, 0.26, -0.29, 0.34, -0.09, -0.34, -0.09 },
      { 'd', -0.52, 0.12, -0.3, 0.12, -0.3, 0.44, -0.52, 0.44 },
      { 'd', 0.3, 0.12, 0.52, 0.12, 0.52, 0.44, 0.3, 0.44 },
    },
    side = {
      { 'b', -0.6, -0.04, 0.58, -0.04, 0.62, 0.2, -0.6, 0.2 },
      { 'b', -0.42, -0.3, 0.12, -0.3, 0.36, -0.04, -0.5, -0.04 },
      { 'd', -0.36, -0.25, 0.1, -0.25, 0.27, -0.08, -0.4, -0.08 },
      { 'c', 'd', -0.36, 0.22, 0.15 }, { 'c', 'd', 0.36, 0.22, 0.15 },
      { 'c', 'b', -0.36, 0.22, 0.06 }, { 'c', 'b', 0.36, 0.22, 0.06 },
    },
  },
  boat = {
    rear = {
      { 'b', -0.52, -0.02, 0.52, -0.02, 0.24, 0.32, -0.24, 0.32 },
      { 'b', -0.26, -0.32, 0.26, -0.32, 0.32, -0.02, -0.32, -0.02 },
      { 'd', -0.2, -0.27, 0.2, -0.27, 0.25, -0.08, -0.25, -0.08 },
    },
    side = {
      { 'b', -0.55, -0.04, 0.42, -0.04, 0.64, -0.14, 0.4, 0.24, -0.5, 0.24 },
      { 'b', -0.32, -0.32, 0.08, -0.32, 0.2, -0.04, -0.36, -0.04 },
      { 'd', -0.26, -0.27, 0.06, -0.27, 0.13, -0.09, -0.29, -0.09 },
    },
  },
  sub = {
    rear = {
      { 'b', -0.56, -0.035, 0.56, -0.035, 0.56, 0.035, -0.56, 0.035 },
      { 'b', -0.08, -0.5, 0.08, -0.5, 0.1, -0.15, -0.1, -0.15 },
      { 'b', -0.035, 0.15, 0.035, 0.15, 0.035, 0.44, -0.035, 0.44 },
      { 'c', 'b', 0, 0, 0.27 },
      { 'c', 'd', 0, 0, 0.1 },
    },
    side = {
      SUB_HULL,
      { 'b', -0.14, -0.4, 0.08, -0.4, 0.14, -0.12, -0.18, -0.12 },
      { 'b', -0.66, -0.22, -0.5, -0.05, -0.5, 0.05, -0.66, 0.22 },
      { 'd', 0.3, -0.05, 0.42, -0.05, 0.42, 0.05, 0.3, 0.05 },
    },
  },
}

-- Convex polygon rotated by ang about (cx, cy), filled as a triangle fan.
local function poly(cx, cy, s, ang, part, first, color)
  local sn, cs = math.sin(ang), math.cos(ang)
  local px, py = {}, {}
  for i = first, #part, 2 do
    local x, y = part[i] * s, part[i + 1] * s
    px[#px + 1] = cx + x * cs - y * sn
    py[#py + 1] = cy + x * sn + y * cs
  end
  for i = 2, #px - 1 do
    lcd.drawFilledTriangle(px[1], py[1], px[i], py[i], px[i + 1], py[i + 1], color)
  end
end

local function drawShape(parts, cx, cy, s, ang, body)
  for _, part in ipairs(parts) do
    if part[1] == 'c' then
      local sn, cs = math.sin(ang), math.cos(ang)
      local x, y = part[3] * s, part[4] * s
      lcd.drawFilledCircle(cx + x * cs - y * sn, cy + x * sn + y * cs, math.max(1, part[5] * s), part[2] == 'd' and T.SURFACE or body)
    else
      poly(cx, cy, s, ang, part, 2, part[1] == 'd' and T.SURFACE or body)
    end
  end
end

-- Land-meter window face: sky over ground, the ground line turned by g degrees (y down,
-- positive = right end lower), filled by rows like the attitude ball.
local function meterFace(cx, cy, r, g)
  local rad = math.rad(g)
  local s, c = math.sin(rad), math.cos(rad)
  for dy = -r, r do
    local half = math.floor(math.sqrt(r * r - dy * dy) + 0.5)
    local yy = cy + dy
    if math.abs(s) < 0.02 then
      lcd.drawLine(cx - half, yy, cx + half, yy, SOLID, (dy * c >= 0) and GROUND or SKY)
    else
      -- ground where x * sin <= dy * cos
      local bound = math.max(-half, math.min(half, math.floor(dy * c / s + 0.5)))
      if s > 0 then
        if bound > -half then lcd.drawLine(cx - half, yy, cx + bound, yy, SOLID, GROUND) end
        if bound < half then lcd.drawLine(cx + bound, yy, cx + half, yy, SOLID, SKY) end
      else
        if bound > -half then lcd.drawLine(cx - half, yy, cx + bound, yy, SOLID, SKY) end
        if bound < half then lcd.drawLine(cx + bound, yy, cx + half, yy, SOLID, GROUND) end
      end
    end
  end
  lcd.drawLine(cx - c * r, cy - s * r, cx + c * r, cy + s * r, SOLID, T.GAUGE_NEEDLE)
end

-- One land-meter window: the vehicle stays upright, the ground tilts by g, the ends of the
-- ground line point into a green/amber/red scale on both sides.
local function meterWindow(cx, cy, r, g, parts, state)
  local th = math.max(2, math.floor(r / 7))
  local R = r + 2 + th
  for _, base in ipairs({ 90, 270 }) do
    arc(cx, cy, R, base - 40, base - 30, th, T.DANGER)
    arc(cx, cy, R, base - 30, base - 20, th, T.WARN_STRONG)
    arc(cx, cy, R, base - 20, base + 20, th, T.SUCCESS)
    arc(cx, cy, R, base + 20, base + 30, th, T.WARN_STRONG)
    arc(cx, cy, R, base + 30, base + 40, th, T.DANGER)
  end
  meterFace(cx, cy, r, g)
  lcd.drawCircle(cx, cy, r, T.GAUGE_EDGE)
  drawShape(parts, cx, cy + math.floor(r * 0.05), r * 1.1, 0, T.GAUGE_TICK)
  -- pointers just outside the scale where the ground line ends
  for _, base in ipairs({ 90, 270 }) do
    local a = math.rad(base + math.max(-44, math.min(44, g)))
    local sa, ca = math.sin(a), math.cos(a)
    local tx, ty = cx + sa * (R - th), cy - ca * (R - th)
    local ox, oy = cx + sa * (R + 6), cy - ca * (R + 6)
    lcd.drawFilledTriangle(tx, ty, ox + ca * 4, oy + sa * 4, ox - ca * 4, oy - sa * 4, state)
  end
end

-- Roll and pitch as one land-meter window each, the angle large beside it (or under it on a
-- tall tile). Colour follows the angle: green, amber from 20 deg, red from 30.
local function attitudeTile(x, y, w, h, caption, deg, ground, view, pos, neg)
  tileFrame(x, y, w, h, caption)
  local c = staleColor(V.tAtt, math.abs(deg) >= 30 and T.DANGER or (math.abs(deg) >= 20 and T.WARN_STRONG or T.SUCCESS))
  local kind = vehicleKind()
  local parts = SHAPES[kind == 'sub' and 'sub' or (kind == 'boat' and 'boat' or 'car')][view]
  -- direction in words rather than a sign: R 8, L 8, UP 4, DN 4
  local num = string.format('%s %d', deg >= 0 and pos or neg, math.floor(math.abs(deg) + 0.5))
  local tall = h > w * 0.9
  if tall then
    local r = math.floor(math.min(w / 2 - 17, (h - 30 - fontH(MIDSIZE)) / 2.3))
    if r < 8 then
      local vy, vf = stack(y, h, false)
      valueText(x + 8, vy, w - 16, num, vf, c)
      return
    end
    local cx, cy = x + math.floor(w / 2), y + 18 + r + 10
    meterWindow(cx, cy, r, ground, parts, c)
    local f = fitFont(num, MIDSIZE, w - 16)
    lcd.drawText(cx, y + h - 4 - fontH(f), num, f + CENTER + c)
    return
  end
  -- vertically the window only needs its ring (the markers stick out sideways): r * 2.3 + 4
  local r = math.floor(math.min((h - 26) / 2.3, w * 0.25))
  if r < 8 then
    -- no room for a window: the angle alone, as large as fits
    local vy, vf = stack(y, h, false)
    valueText(x + 8, vy, w - 16, num, vf, c)
    return
  end
  local cx, cy = x + 8 + r + 10, y + 18 + math.floor((h - 18) / 2)
  meterWindow(cx, cy, r, ground, parts, c)
  local tx = cx + r + 16
  local room = x + w - 6 - tx
  if room >= 14 then
    local f = fitFont(num, MIDSIZE, room)
    lcd.drawText(tx, cy - math.floor(fontH(f) / 2), num, f + c)
  end
end

-- a right roll lifts the ground on the right; nose up drops the ground ahead
TILE.roll = function (x, y, w, h) attitudeTile(x, y, w, h, 'ROLL', V.rollDeg, -V.rollDeg, 'rear', 'R', 'L') end
TILE.pitch = function (x, y, w, h) attitudeTile(x, y, w, h, 'PITCH', V.pitchDeg, V.pitchDeg, 'side', 'UP', 'DN') end

-- weak to strong echo, the fish-finder way: deep blue, cyan, green, yellow, red
local ECHO_PAL = {}
do
  local stops = { { 0, 0x10, 0x30, 0x90 }, { 4, 0x00, 0x9c, 0xd8 }, { 7, 0x22, 0xc5, 0x5e },
    { 10, 0xfa, 0xcc, 0x15 }, { 13, 0xf9, 0x73, 0x16 }, { 15, 0xdc, 0x26, 0x26 } }
  for lv = 1, 15 do
    local a, b = stops[1], stops[#stops]
    for i = 1, #stops - 1 do
      if lv >= stops[i][1] and lv <= stops[i + 1][1] then a, b = stops[i], stops[i + 1] break end
    end
    local f = b[1] > a[1] and (lv - a[1]) / (b[1] - a[1]) or 0
    local function mix(i) return math.floor(a[i] + (b[i] - a[i]) * f + 0.5) end
    ECHO_PAL[lv] = lcd.RGB(mix(2), mix(3), mix(4))
  end
end

local function depthLabel(x, y, text, flags)
  local tw = lcd.sizeText(text, flags)
  lcd.drawFilledRectangle(x - 2, y, tw + 4, fontH(flags), T.SURFACE)
  lcd.drawText(x, y, text, flags)
end

-- Fish-finder waterfall: newest column on the right, surface of the scan at the top.
TILE.echo = function (x, y, w, h)
  tileFrame(x, y, w, h, 'ECHOGRAM')
  -- experimental until it has run on real boats
  local tag = 'EXP'
  local tw = lcd.sizeText(tag, SMLSIZE)
  lcd.drawFilledRectangle(x + w - tw - 10, y + 3, tw + 4, fontH(SMLSIZE), T.WARN_STRONG)
  lcd.drawText(x + w - tw - 8, y + 3, tag, SMLSIZE + T.BG_BASE)
  local px, py = x + 4, y + 18
  local pw, rh = w - 8, math.max(1, math.floor((h - 22) / 32))
  local ph = rh * 32
  lcd.drawFilledRectangle(px, py, pw, ph, T.GAUGE_BEZEL_2)
  local cols = V.echo
  if #cols == 0 then
    lcd.drawText(x + math.floor(w / 2), py + math.floor(ph / 2) - fontH(SMLSIZE), fitText(w - 12, SMLSIZE, { 'no echogram', 'none' }), SMLSIZE + CENTER + T.TEXT_3)
    lcd.drawText(x + math.floor(w / 2), py + math.floor(ph / 2) + 2, fitText(w - 12, SMLSIZE, { 'needs the ArduDeck sonar script', 'needs sonar script', '' }), SMLSIZE + CENTER + T.TEXT_3)
    return
  end
  local cw = 3
  local n = math.min(#cols, math.floor(pw / cw))
  local stale = now() - V.tEcho > STALE_AFTER * 3
  for i = 0, n - 1 do
    local col = cols[#cols - i]
    local cx = px + pw - (i + 1) * cw
    for r = 1, 32 do
      local lv = col[r]
      if lv and lv > 0 then lcd.drawFilledRectangle(cx, py + (r - 1) * rh, cw, rh, stale and T.STALE or ECHO_PAL[lv]) end
    end
  end
  if V.echoLenM > 0 then
    depthLabel(px + 2, py + 1, string.format('%.0fm', V.echoStartM), SMLSIZE + T.TEXT_2)
    depthLabel(px + 2, py + ph - fontH(SMLSIZE) - 1, string.format('%.0fm', V.echoStartM + V.echoLenM), SMLSIZE + T.TEXT_2)
  end
  if V.rangeM > 0 then
    local txt = string.format('%.1fm', V.rangeM)
    local f = fitFont(txt, MIDSIZE, math.floor(pw / 2))
    local tw = lcd.sizeText(txt, f)
    depthLabel(px + pw - tw - 3, py + 1, txt, f + staleColor(V.tAtt, T.TEXT))
  end
end

-- Depth over the last minutes as a seabed line: what a sounding run looks like, no sonar script needed.
TILE.bottom = function (x, y, w, h)
  tileFrame(x, y, w, h, 'BOTTOM')
  local px, py, pw, ph = x + 4, y + 18, w - 8, h - 22
  lcd.drawFilledRectangle(px, py, pw, ph, T.GAUGE_BEZEL_2)
  local hist = V.depthHist
  if #hist < 2 then
    lcd.drawText(x + math.floor(w / 2), py + math.floor(ph / 2) - math.floor(fontH(SMLSIZE) / 2), fitText(w - 12, SMLSIZE, { 'no depth yet', 'no depth' }), SMLSIZE + CENTER + T.TEXT_3)
    return
  end
  local n = math.min(#hist, pw)
  local deepest = 0
  for i = #hist - n + 1, #hist do if hist[i] > deepest then deepest = hist[i] end end
  local scale = math.max(2, deepest * 1.2)
  for i = 0, n - 1 do
    local d = hist[#hist - i]
    local lx = px + pw - 1 - i
    local by = py + math.floor(ph * d / scale)
    lcd.drawLine(lx, by, lx, py + ph - 1, SOLID, T.GAUGE_EDGE)
    lcd.drawLine(lx, by, lx, by + 1, SOLID, T.WARN_STRONG)
  end
  local txt = string.format('%.1fm', hist[#hist])
  local f = fitFont(txt, MIDSIZE, math.floor(pw / 2))
  depthLabel(px + pw - lcd.sizeText(txt, f) - 3, py + 1, txt, f + staleColor(V.tAtt, T.TEXT))
  depthLabel(px + 2, py + ph - fontH(SMLSIZE) - 1, string.format('max %.1fm', deepest), SMLSIZE + T.TEXT_2)
end

-- Water column: surface at the top, the vehicle at its depth, the bottom from the rangefinder.
TILE.depth = function (x, y, w, h)
  local kind = vehicleKind()
  local sub = kind == 'sub'
  tileFrame(x, y, w, h, sub and 'DEPTH' or 'UNDER HULL')
  local depth = sub and math.max(0, -V.homeAltM) or 0
  local below = V.rangeM > 0 and V.rangeM or nil
  local total = depth + (below or 0)
  local scale = math.max(5, total * 1.2)
  local cx0, cy0 = x + 8, y + 18
  local cw, ch = math.floor(w * 0.42), h - 26
  lcd.drawFilledRectangle(cx0, cy0, cw, ch, T.GAUGE_BEZEL_2)
  lcd.drawLine(cx0, cy0, cx0 + cw - 1, cy0, SOLID, T.INFO)
  local vy = cy0 + math.floor(ch * depth / scale)
  local mid = cx0 + math.floor(cw / 2)
  if below then
    local by = cy0 + math.floor(ch * total / scale)
    lcd.drawFilledRectangle(cx0, by, cw, cy0 + ch - by, T.GAUGE_EDGE)
    lcd.drawFilledRectangle(cx0, by, cw, 3, T.WARN_STRONG)
    lcd.drawLine(mid, vy + 4, mid, by - 1, DOTTED, T.TEXT_3)
  end
  local vc = staleColor(V.tHome, T.TEXT)
  quad(mid, math.max(cy0 + 3, vy), 0, -cw * 0.3, -3, cw * 0.3, 3, vc)
  -- numbers to the right of the column
  local tx = cx0 + cw + 8
  local room = x + w - 6 - tx
  local value = sub and string.format('%.1fm', depth) or (below and string.format('%.1fm', below) or '--')
  local vf = fitFont(value, h >= 90 and DBLSIZE or MIDSIZE, room)
  lcd.drawText(tx, y + 18, value, vf + vc)
  local line = y + 18 + fontH(vf)
  if sub then
    lcd.drawText(tx, line, fitText(room, SMLSIZE, below and { string.format('bottom %.1fm', below), string.format('%.1fm', below) } or { 'no bottom', '' }), SMLSIZE + T.TEXT_2)
    local vs = V.vspdMs
    if math.abs(vs) >= 0.1 then
      lcd.drawText(tx, line + fontH(SMLSIZE), fitText(room, SMLSIZE, { string.format(vs > 0 and 'rising %.1f' or 'diving %.1f', math.abs(vs)), string.format('%+.1f', vs) }), SMLSIZE + T.TEXT_3)
    end
  else
    -- no reading means no sounder fitted (or not facing down), not a depth of zero
    lcd.drawText(tx, line, fitText(room, SMLSIZE, below and { 'below the hull', 'below hull', '' } or { 'no depth sensor', 'no sensor', '' }),
      SMLSIZE + (below and T.TEXT_2 or T.TEXT_3))
  end
end

TILE.imu = function (x, y, w, h)
  -- A real IMU reading wins; without one (ELRS MAVLink mode) show the baro temperature ELRS sends as a CRSF frame.
  local useBaro = V.crsfTemp ~= nil and (V.tImuTemp == 0 or now() - V.tImuTemp > STALE_AFTER * 3)
  local temp = useBaro and math.floor(V.crsfTemp + 0.5) or V.imuTemp
  local tStamp = useBaro and V.tCrsfTemp or V.tAp
  tileFrame(x, y, w, h, useBaro and 'BARO TEMP' or 'IMU TEMP')
  local c = temp >= 70 and T.DANGER or (temp >= 60 and T.WARN_STRONG or T.SUCCESS)
  local vy, vf, sy, sf = stack(y, h, false)
  valueText(x + 8, vy, w - 16 - 20, string.format('%dC', temp), vf, staleColor(tStamp, c))
  -- thermometer strip: 20..80C
  local bx, bh2 = x + w - 16, h - 30
  local by = y + 18
  lcd.drawFilledRectangle(bx, by, 8, bh2, T.GAUGE_BEZEL_2)
  local frac = math.max(0, math.min(1, (temp - 20) / 60))
  local fill = math.floor(bh2 * frac + 0.5)
  if fill > 0 then lcd.drawFilledRectangle(bx, by + bh2 - fill, 8, fill, staleColor(tStamp, c)) end
  lcd.drawRectangle(bx, by, 8, bh2, T.GAUGE_EDGE)
end

TILE.rng = function (x, y, w, h)
  -- on a boat the rangefinder points down at the bottom
  tileFrame(x, y, w, h, vehicleKind() == 'boat' and 'DEPTH' or 'RANGE')
  -- near-ground is what a rangefinder is for: amber inside 1m
  local c = (V.rangeM > 0 and V.rangeM < 1) and T.WARN_STRONG or T.TEXT
  local vy, vf, sy, sf = stack(y, h, false)
  valueText(x + 8, vy, w - 16 - 20, string.format('%.2fm', V.rangeM), vf, staleColor(V.tAtt, c))
  local bx, bh2 = x + w - 16, h - 30
  local by = y + 18
  lcd.drawFilledRectangle(bx, by, 8, bh2, T.GAUGE_BEZEL_2)
  local frac = math.max(0, math.min(1, V.rangeM / 5))
  local fill = math.floor(bh2 * frac + 0.5)
  if fill > 0 then lcd.drawFilledRectangle(bx, by + bh2 - fill, 8, fill, staleColor(V.tAtt, T.INFO)) end
  lcd.drawRectangle(bx, by, 8, bh2, T.GAUGE_EDGE)
end

-- geo -> image pixel for map m (equirectangular around image center;
-- fine at field scale)
local function mapProject(m, lat, lon)
  local dxM = (lon - m.lon) * 111320 * math.cos(math.rad(m.lat))
  local dyM = (lat - m.lat) * 110540
  return m.w / 2 + dxM / m.mpp, m.h / 2 - dyM / m.mpp
end

local function pickMap()
  if mapTapIdx and MAPS[mapTapIdx] then return mapTapIdx end
  if V.lat and V.lon then
    for i = 1, #MAPS do
      local px, py = mapProject(MAPS[i], V.lat, V.lon)
      if px >= MAPS[i].w * 0.05 and px <= MAPS[i].w * 0.95
        and py >= MAPS[i].h * 0.05 and py <= MAPS[i].h * 0.95 then
        return i
      end
    end
  end
  return #MAPS > 0 and #MAPS or nil
end

-- Lines that leave the map image are cut at its edge. EdgeTX 2.9+ clips for us;
-- older firmware gets a Cohen-Sutherland trim so a route to a distant waypoint
-- never paints over the tiles around it.
local function clippedLine(x1, y1, x2, y2, cx, cy, cw, ch, pat, flags)
  local xmax, ymax = cx + cw, cy + ch
  if lcd.drawLineWithClipping then
    lcd.drawLineWithClipping(x1, y1, x2, y2, cx, xmax, cy, ymax, pat, flags)
    return
  end
  local function code(x, y)
    local c = 0
    if x < cx then c = c + 1 elseif x > xmax then c = c + 2 end
    if y < cy then c = c + 4 elseif y > ymax then c = c + 8 end
    return c
  end
  local c1, c2 = code(x1, y1), code(x2, y2)
  for _ = 1, 8 do
    if c1 == 0 and c2 == 0 then break end
    if band(c1, c2) ~= 0 then return end
    local c = c1 ~= 0 and c1 or c2
    local nx, ny
    if band(c, 8) ~= 0 then
      nx, ny = x1 + (x2 - x1) * (ymax - y1) / (y2 - y1), ymax
    elseif band(c, 4) ~= 0 then
      nx, ny = x1 + (x2 - x1) * (cy - y1) / (y2 - y1), cy
    elseif band(c, 2) ~= 0 then
      nx, ny = xmax, y1 + (y2 - y1) * (xmax - x1) / (x2 - x1)
    else
      nx, ny = cx, y1 + (y2 - y1) * (cx - x1) / (x2 - x1)
    end
    if c == c1 then x1, y1, c1 = nx, ny, code(nx, ny)
    else x2, y2, c2 = nx, ny, code(nx, ny) end
  end
  lcd.drawLine(x1, y1, x2, y2, pat, flags)
end

TILE.map = function (x, y, w, h)
  tileFrame(x, y, w, h, 'MAP')
  local idx = pickMap()
  if not idx then
    lcd.drawText(x + w / 2, y + h / 2 - 10, 'no field maps', 0 + CENTER + T.TEXT_3)
    lcd.drawText(x + w / 2, y + h / 2 + 10, 'prepare in ArduDeck', SMLSIZE + CENTER + T.TEXT_3)
    return
  end
  local m = MAPS[idx]
  if mapBmpFile ~= m.file then
    mapBmp = Bitmap.open('/WIDGETS/ardudeck/maps/' .. m.file)
    mapBmpFile = m.file
  end
  local scale = math.min((w - 2) / m.w, (h - 20) / m.h)
  local dw, dh = m.w * scale, m.h * scale
  local ox = x + (w - dw) / 2
  local oy = y + 18 + (h - 20 - dh) / 2
  if mapBmp then
    lcd.drawBitmap(mapBmp, ox, oy, scale * 100)
  end
  -- mission route: legs then markers; active waypoint highlighted.
  -- A leg to a waypoint off the image must be cut at the image edge, not drawn
  -- across the neighbouring tiles.
  if #WPS > 0 then
    local prevX, prevY = nil, nil
    for i = 1, #WPS do
      local px, py = mapProject(m, WPS[i].lat, WPS[i].lon)
      local inside = px >= 0 and px <= m.w and py >= 0 and py <= m.h
      local sx, sy = ox + px * scale, oy + py * scale
      if prevX then
        clippedLine(prevX, prevY, sx, sy, ox, oy, dw, dh, DOTTED, T.TEXT_3)
      end
      prevX, prevY = sx, sy
      if inside then
        -- route markers are outlined; the ACTIVE wp is drawn from live
        -- telemetry below (authoritative even if this file is stale)
        lcd.drawCircle(sx, sy, 3, T.GAUGE_TICK)
      end
    end
  end
  -- trail
  for i = 1, #trail do
    local p = trail[i]
    local px, py = mapProject(m, p[1], p[2])
    if px >= 0 and px <= m.w and py >= 0 and py <= m.h then
      lcd.drawFilledCircle(ox + px * scale, oy + py * scale, 1, T.ACCENT)
    end
  end
  if V.lat and V.lon then
    local px, py = mapProject(m, V.lat, V.lon)
    local offMap = px < 0 or px > m.w or py < 0 or py > m.h
    px = math.max(0, math.min(m.w, px))
    py = math.max(0, math.min(m.h, py))
    local mx, my = ox + px * scale, oy + py * scale
    -- home marker (derived from vehicle position + home vector)
    if V.homeDistM > 0 then
      local brg = math.rad(V.homeBearingDeg)
      local hx = px + math.sin(brg) * V.homeDistM / m.mpp
      local hy = py - math.cos(brg) * V.homeDistM / m.mpp
      if hx >= 0 and hx <= m.w and hy >= 0 and hy <= m.h then
        lcd.drawFilledCircle(ox + hx * scale, oy + hy * scale, 3, T.WARN_STRONG)
      end
    end
    -- active waypoint from live telemetry (0x500D bearing+distance from
    -- the vehicle) - filled blue, needs no mission file
    if V.wpNum > 0 and V.wpDistM > 0 and now() - V.tWp < STALE_AFTER * 3 then
      local wb = math.rad(V.wpBearingDeg)
      local wx = px + math.sin(wb) * V.wpDistM / m.mpp
      local wy = py - math.cos(wb) * V.wpDistM / m.mpp
      if wx >= 0 and wx <= m.w and wy >= 0 and wy <= m.h then
        lcd.drawFilledCircle(ox + wx * scale, oy + wy * scale, 4, T.INFO)
      end
    end
    -- vehicle triangle rotated by yaw
    local a = math.rad(V.yawDeg)
    local sa, ca = math.sin(a), math.cos(a)
    local tipX, tipY = mx + sa * 8, my - ca * 8
    local blX, blY = mx - sa * 5 - ca * 5, my + ca * 5 - sa * 5
    local brX, brY = mx - sa * 5 + ca * 5, my + ca * 5 + sa * 5
    lcd.drawFilledTriangle(tipX, tipY, blX, blY, brX, brY,
      staleColor(V.tGps, offMap and T.WARN_STRONG or T.DANGER))
    if offMap then
      lcd.drawText(x + w - 6, y + 18, 'OFF MAP', SMLSIZE + RIGHT + T.WARN_STRONG)
    end
  else
    lcd.drawText(x + w - 6, y + 18, 'no position', SMLSIZE + RIGHT + T.TEXT_3)
  end
  -- span label
  lcd.drawText(x + 6, y + h - 16, string.format('%dm across', math.floor(m.w * m.mpp + 0.5)),
    SMLSIZE + T.GAUGE_TICK)
end

local function trailTick()
  if V.lat and V.lon and now() - lastTrailT > 100 then
    lastTrailT = now()
    trailHead = trailHead % 40 + 1
    trail[trailHead] = { V.lat, V.lon }
  end
end

-- Radio-side tiles: these read EdgeTX sensors directly and work with or
-- without the MAVLink stream (they are about the LINK and the HANDSET).

TILE.link = function (x, y, w, h)
  -- aviation color logic: state readable pre-attentively, numbers second.
  -- LQ green >=70, amber >=40, red below. RSSI green > -85dBm, amber
  -- > -100, red beyond. TPWR amber at >=250mW (link is shouting).
  tileFrame(x, y, w, h, 'SIGNAL')
  -- getValue reads the MODEL's sensor list, so a model that never discovered
  -- its CRSF sensors returns nil for all of them. Printing that as a red 0%
  -- says the link is dying when it is fine: no reading is not zero.
  local lq = getValue('RQly')
  local hasLq = type(lq) == 'number' and lq > 0
  -- No RQly sensor (never discovered, or an ELRS link in MAVLink mode) but the
  -- radio still has its own RSSI reading: better a real number than a dash.
  local fromRadio = false
  if not hasLq then
    local r = getRSSI()
    if type(r) == 'number' and r > 0 then
      lq = r
      hasLq = true
      fromRadio = true
    end
  end
  local rssi = getValue('1RSS') or 0
  local tpwr = getValue('TPWR') or 0
  local lqC = not hasLq and T.TEXT_3
    or (lq >= 70 and T.SUCCESS or (lq >= 40 and T.WARN_STRONG or T.DANGER))
  local vy, vf, sy, sf = stack(y, h, true)
  valueText(x + 8, vy, w - 16 - 50, hasLq and string.format('%d%%', lq) or '--', vf, lqC)
  if sy and not hasLq then
    lcd.drawText(x + 8, sy, 'no link sensor', sf + T.TEXT_3)
  elseif sy and fromRadio then
    lcd.drawText(x + 8, sy, 'radio RSSI', sf + T.TEXT_3)
  end
  -- ascending signal bars, phone-style: lit count by LQ, all in band color
  local bars = 5
  local lit = hasLq and math.floor(lq / 20 + 0.5) or 0
  local bx = x + w - 8 - bars * 8
  local baseY = y + math.min(h - 30, 58)
  for i = 1, bars do
    local bh2 = 6 + (i - 1) * 7
    local bxi = bx + (i - 1) * 8
    if i <= lit then
      lcd.drawFilledRectangle(bxi, baseY - bh2, 6, bh2, lqC)
    else
      lcd.drawFilledRectangle(bxi, baseY - bh2, 6, bh2, T.GAUGE_BEZEL_2)
      lcd.drawRectangle(bxi, baseY - bh2, 6, bh2, T.GAUGE_EDGE)
    end
  end
  if sy and hasLq and not fromRadio then
    local rssiC = rssi > -85 and T.SUCCESS or (rssi > -100 and T.WARN_STRONG or T.DANGER)
    lcd.drawText(x + 8, sy, string.format('%d dBm', rssi), sf + rssiC)
    if tpwr > 0 then
      local pwrC = tpwr >= 250 and T.WARN_STRONG or T.TEXT_2
      lcd.drawText(x + 8 + lcd.sizeText(string.format('%d dBm', rssi), sf) + 10, sy,
        string.format('%dmW', tpwr), sf + pwrC)
    end
  end
end

TILE.txbat = function (x, y, w, h)
  tileFrame(x, y, w, h, 'TX BATTERY')
  local v = getValue('tx-voltage') or 0
  local vMin, vMax = 6.6, 8.4
  local ok, gs = pcall(getGeneralSettings)
  if ok and gs then
    vMin = gs.battMin or vMin
    vMax = gs.battMax or vMax
  end
  local pct = vMax > vMin and math.max(0, math.min(100, (v - vMin) / (vMax - vMin) * 100)) or 0
  local c = pct > 30 and T.TEXT or (pct > 15 and T.WARN or T.DANGER)
  local vy, vf, sy, sf = stack(y, h, true)
  valueText(x + 8, vy, w - 16 - 20, string.format('%.1fV', v), vf, c)
  if sy then
    -- clear of the level strip on the right
    lcd.drawText(x + 8, sy, fitText(w - 36, sf, {
      string.format('%d%% of %.1f-%.1fV', math.floor(pct + 0.5), vMin, vMax),
      string.format('%d%%', math.floor(pct + 0.5)) }), sf + T.TEXT_2)
  end
  local bx, by, bw, bh = x + w - 14, y + 18, 6, h - 30
  lcd.drawFilledRectangle(bx, by, bw, bh, T.GAUGE_BEZEL_2)
  local fill = math.floor(bh * pct / 100 + 0.5)
  if fill > 0 then lcd.drawFilledRectangle(bx, by + bh - fill, bw, fill, c == T.TEXT and T.SUCCESS or c) end
  lcd.drawRectangle(bx, by, bw, bh, T.GAUGE_EDGE)
end

TILE.wp = function (x, y, w, h)
  tileFrame(x, y, w, h, 'MISSION')
  local vy, vf, sy, sf = stack(y, h, true)
  if V.wpNum <= 0 then
    valueText(x + 8, vy, w - 16 - 40, 'no mission', 0 + T.STALE)
    return
  end
  lcd.drawText(x + 8, vy, string.format('WP %d', V.wpNum), vf, staleColor(V.tWp, T.INFO))
  if sy then
    lcd.drawText(x + 8, sy, string.format('%dm to go', math.floor(V.wpDistM + 0.5)),
      sf + staleColor(V.tWp, T.TEXT_2))
  end
  -- relative bearing arrow to the waypoint (info blue; home stays amber)
  local a = math.rad(V.wpBearingDeg - V.yawDeg)
  local acx, acy, ar = x + w - 22, y + math.floor(h / 2), math.min(13, h / 2 - 8)
  local sa, ca = math.sin(a), math.cos(a)
  lcd.drawLine(acx - sa * ar, acy + ca * ar, acx + sa * ar, acy - ca * ar, SOLID, staleColor(V.tWp, T.INFO))
  lcd.drawFilledCircle(acx + sa * ar, acy - ca * ar, 3, staleColor(V.tWp, T.INFO))
end

TILE.pos = function (x, y, w, h)
  tileFrame(x, y, w, h, 'POSITION')
  if V.lat and V.lon then
    lcd.drawText(x + 8, y + 20, string.format('%.6f', V.lat), 0 + staleColor(V.tGps, T.TEXT))
    lcd.drawText(x + 8, y + 40, string.format('%.6f', V.lon), 0 + staleColor(V.tGps, T.TEXT))
  else
    lcd.drawText(x + 8, y + 20, 'no position', 0 + T.STALE)
  end
end

-- ========================= live screen =================================
local function drawLive()
  drawBackdrop()

  -- top bar (brand invariant)
  lcd.drawFilledRectangle(0, 0, LCD_W, 38, T.SURFACE)
  -- left margin clears the EdgeTX fullscreen corner affordance on touch UIs.
  -- What gives way when a long mode name needs room, in order: the wordmark,
  -- the logo, the mode's font size, LQ, then the word ARMED (the dot stays).
  -- The arm word and TX battery are what a pilot reads, so they go last.
  local narrow = LCD_W < 400
  local armColor = V.armed and T.DANGER or T.TEXT_2
  if V.armed then
    lcd.drawFilledCircle(52, 19, narrow and 7 or 5, T.DANGER)
  else
    lcd.drawCircle(52, 19, narrow and 7 or 5, T.TEXT_3)
  end
  local modeName = modeNameOf(V.modeNum)
  local armWord = V.armed and 'ARMED' or 'DISARMED'

  local lq = getValue('RQly')
  if not (lq and lq > 0) then lq = nil end
  local lqText = lq and ('LQ ' .. lq) or nil
  local txv = narrow and 0 or (getValue('tx-voltage') or 0)
  local txText = txv > 0 and string.format('%.1f', txv) or nil
  local tw = lcd.sizeText('ArduDeck', SMLSIZE)
  local bmp = currentTheme == 'light' and logoBmpLight or logoBmp

  local show = { mark = not narrow, logo = bmp ~= nil, lq = lqText ~= nil, tx = txText ~= nil, arm = not narrow }
  local fonts = { MIDSIZE, 0, SMLSIZE }
  local fontIx = 1
  local function rightStart()
    local x = LCD_W - 8
    if show.mark then x = x - tw - 8 end
    if show.logo then x = x - 20 - 10 end
    if show.lq then x = x - lcd.sizeText(lqText, SMLSIZE) - 14 end
    if show.tx then x = x - lcd.sizeText(txText, SMLSIZE) - 20 - 10 end
    return x
  end
  local function leftEnd()
    return show.arm and (64 + lcd.sizeText(armWord, MIDSIZE) + 10) or 64
  end
  local function pillW() return lcd.sizeText(modeName, fonts[fontIx]) + 20 end
  local function fits() return leftEnd() + pillW() <= rightStart() end
  local steps = {
    function () show.mark = false end,
    function () show.logo = false end,
    function () fontIx = 2 end,
    function () fontIx = 3 end,
    function () show.lq = false end,
    function () show.arm = false end,
    function () show.tx = false end,
  }
  for _, step in ipairs(steps) do
    if fits() then break end
    step()
  end

  if show.arm then lcd.drawText(64, 7, armWord, MIDSIZE + armColor) end
  -- the pill centres on the screen when there is room, else in the gap it has
  local mw, l, r = pillW(), leftEnd(), rightStart()
  local mx = math.floor((LCD_W - mw) / 2)
  if mx < l or mx + mw > r then mx = math.floor(l + math.max(0, (r - l - mw) / 2)) end
  local font = fonts[fontIx]
  lcd.drawFilledRectangle(mx, font == MIDSIZE and 5 or 8, mw, font == MIDSIZE and 28 or 22, T.PILL_ON)
  if font == MIDSIZE then
    lcd.drawText(mx + mw / 2, 7, modeName, MIDSIZE + CENTER + staleColor(V.tAp, T.SUCCESS))
  else
    lcd.drawText(mx + mw / 2, 19, modeName, font + CENTER + VCENTER + staleColor(V.tAp, T.SUCCESS))
  end

  -- right cluster, right to left: [TX batt] [LQ] [logo] [ArduDeck]. Everything
  -- centres on the bar's midline (y=19). Light mode uses the dark-tile logo;
  -- the corner is the theme tap target.
  local x = LCD_W - 8
  if show.mark then
    lcd.drawText(x, 19, 'ArduDeck', SMLSIZE + RIGHT + VCENTER + T.TEXT)
    x = x - tw - 8
  end
  if show.logo then
    lcd.drawBitmap(bmp, x - 20, 9)
    x = x - 20 - 10
  end
  if show.lq then
    lcd.drawText(x, 19, lqText, SMLSIZE + RIGHT + VCENTER + (lq > 70 and T.TEXT_2 or T.WARN))
    x = x - lcd.sizeText(lqText, SMLSIZE) - 14
  end
  if show.tx then
    local vMin, vMax = 6.6, 8.4
    local ok, gs = pcall(getGeneralSettings)
    if ok and gs then
      vMin = gs.battMin or vMin
      vMax = gs.battMax or vMax
    end
    local pct = vMax > vMin and math.max(0, math.min(100, (txv - vMin) / (vMax - vMin) * 100)) or 0
    local c = pct > 30 and T.TEXT_2 or (pct > 15 and T.WARN or T.DANGER)
    lcd.drawText(x, 19, txText, SMLSIZE + RIGHT + VCENTER + c)
    local gx = x - lcd.sizeText(txText, SMLSIZE) - 20
    lcd.drawRectangle(gx, 14, 14, 10, c)
    lcd.drawFilledRectangle(gx + 14, 17, 2, 4, c)
    local fill = math.floor(12 * pct / 100 + 0.5)
    if fill > 0 then
      local fc = pct > 30 and T.SUCCESS or (pct > 15 and T.WARN_STRONG or T.DANGER)
      lcd.drawFilledRectangle(gx + 1, 15, fill, 8, fc)
    end
  end

  if demoActive then
    -- badge doubles as the tap target to leave demo (when tap-started)
    lcd.drawText(LCD_W - 8, 42, demoTap and 'DEMO - tap to exit' or 'DEMO', SMLSIZE + RIGHT + T.ACCENT)
  end

  -- failsafe strip (brand invariant, below bar, never covers data)
  if V.battFs or V.ekfBad or V.fenceBreach or V.anyFs then
    local what = V.battFs and 'BATTERY FAILSAFE' or V.ekfBad and 'EKF UNHEALTHY'
      or V.fenceBreach and 'FENCE BREACH' or 'FAILSAFE'
    lcd.drawFilledRectangle(0, 38, LCD_W, 20, T.DANGER)
    lcd.drawText(LCD_W / 2, 40, what, SMLSIZE + CENTER + T.TEXT)
  end

  -- tiles from the active page
  local layout, page, pageCount = activeLayout()
  for i = 1, #layout do
    local tl = layout[i]
    local fn = TILE[tl.id]
    if fn then fn(tl.x, tl.y, tl.w, tl.h, tl.variant) end
  end
  -- page dots (multi-page only); brighter briefly after a swipe
  if pageCount > 1 then
    local dotsW = pageCount * 10
    local dx = (LCD_W - dotsW) / 2
    local flash = now() - pageFlashT < 150
    for i = 1, pageCount do
      if i == page then
        lcd.drawFilledCircle(dx + (i - 1) * 10 + 4, 42, flash and 4 or 3, T.ACCENT)
      else
        lcd.drawCircle(dx + (i - 1) * 10 + 4, 42, 2, T.TEXT_3)
      end
    end
    -- Until the widget is full screen the radio keeps every key and touch, so
    -- say so rather than leaving dots that nothing responds to. On an App mode
    -- screen one tap does it; on any other layout it is a long press.
    if not fullScreen and (CFG.pageSecs or 0) == 0 then
      lcd.drawText(dx + dotsW + 10, 42,
        appMode and 'long press = full screen' or 'hold, then tap = full screen',
        SMLSIZE + VCENTER + T.TEXT_3)
    end
  end

  if CFG.debugInput == 1 then
    -- Bottom left, above the ticker: the top bar is where EdgeTX draws its own
    -- logo button in app mode, and it covers anything put there.
    lcd.drawText(6, LCD_H - 80, string.format(
      'fs=%s app=%s evt=%s tch=%s pg=%d/%d pin=%d',
      fullScreen and 'Y' or 'N',
      appMode and 'Y' or 'N',
      tostring(lastEvent), tostring(lastTouch), page, pageCount, pinnedPage),
      SMLSIZE + T.WARN)
  end

  -- message ticker (brand invariant)
  local ty = LCD_H - 66
  lcd.drawText(6, ty, 'MESSAGES', SMLSIZE + T.TEXT_3)
  if CFG.name ~= '' then
    lcd.drawText(LCD_W - 6, ty, CFG.name, SMLSIZE + RIGHT + T.TEXT_3)
  end
  local y = ty + 16
  for i = 0, 2 do
    local idx = ((V.msgHead - 1 - i) % 8) + 1
    local m = V.msgs[idx]
    if m and y < LCD_H - 12 then
      local c = m.sev <= 3 and T.DANGER or (m.sev == 4 and T.WARN or T.TEXT_2)
      lcd.drawText(6, y, (SEV_LABEL[m.sev] or '') .. ' ' .. m.text, SMLSIZE + c)
      y = y + 15
    end
  end
end

-- ======================== event voice alerts ===========================
local prevArmed = nil
local prevLive = nil
local prevBattBand = nil
local prevFs = false
local prevMode = nil
local prevGpsGood = nil
local prevFence = false
local prevEkf = false
local prevFlying = nil
local homeAnnounced = false
local lqLow = false

-- ordered worst-last so "worsening" is a simple index comparison
local BAND_ORDER = { ok = 1, half = 2, low = 3, crit = 4 }
local BAND_SOUND = { half = 'batt_50', low = 'batt_low', crit = 'batt_crit' }

local function battBand()
  local capacity = effBattery()
  if capacity <= 0 then return nil end
  local pct = math.max(0, (capacity - V.mah) / capacity * 100)
  if pct > 50 then return 'ok' end
  if pct > 30 then return 'half' end
  if pct > 15 then return 'low' end
  return 'crit'
end

-- A state has to hold before it is worth speaking: telemetry gaps of a frame
-- or two are normal, and announcing each one is how an alert becomes noise.
local SETTLE_TICKS = 200
local pendingSince = {}
local function settled(key, value, prev)
  if value == prev then
    pendingSince[key] = nil
    return false
  end
  local since = pendingSince[key]
  if not since then
    pendingSince[key] = now()
    return false
  end
  if now() - since < SETTLE_TICKS then return false end
  pendingSince[key] = nil
  return true
end

local function announceTransitions(live)
  if prevArmed ~= nil and V.armed ~= prevArmed then
    playAlert(V.armed and 'armed' or 'disarmed', V.muted)
    -- flight timer bookkeeping
    if V.armed then
      V.armedAtT = now()
    elseif V.armedAtT then
      V.armedAccum = V.armedAccum + (now() - V.armedAtT)
      V.armedAtT = nil
    end
  end
  prevArmed = V.armed

  if prevLive ~= nil and settled('live', live, prevLive) then
    playAlert(live and 'telemetry_ok' or 'telemetry_lost', V.muted)
    prevLive = live
  elseif prevLive == nil then
    prevLive = live
  end

  -- announce battery bands only as they worsen; recovery stays silent
  local band = battBand()
  if band and prevBattBand and band ~= prevBattBand
    and BAND_ORDER[band] > BAND_ORDER[prevBattBand] then
    local snd = BAND_SOUND[band]
    if snd then playAlert(snd, V.muted) end
  end
  prevBattBand = band

  -- specific alarms first, generic failsafe only for the rest
  if V.fenceBreach and not prevFence then playAlert('fence_breach', V.muted) end
  prevFence = V.fenceBreach
  if V.ekfBad and not prevEkf then playAlert('ekf_warn', V.muted) end
  prevEkf = V.ekfBad
  local fs = V.battFs or V.anyFs
  if fs and not prevFs then playAlert('failsafe', V.muted) end
  prevFs = fs

  -- airborne / landed from the is-flying flag
  if prevFlying ~= nil and V.flying ~= prevFlying then
    playAlert(V.flying and 'airborne' or 'landed', V.muted)
  end
  prevFlying = V.flying

  -- first valid home vector after boot
  if not homeAnnounced and live and V.homeDistM > 0 then
    homeAnnounced = true
    playAlert('home_set', V.muted)
  end

  -- link quality with hysteresis (low under 50, recovered above 60)
  local lq = getValue('RQly')
  if lq and lq > 0 then
    if lqLow and lq >= 60 then
      lqLow = false
      playAlert('signal_ok', V.muted)
    elseif not lqLow and lq < 50 then
      lqLow = true
      playAlert('signal_low', V.muted)
    end
  end

  -- flight mode callouts: this vehicle's clip, else the copter-numbered one
  if prevMode ~= nil and V.modeNum ~= prevMode and V.modeNum >= 0 then
    local _, cfgVehicle = modeTable()
    local clip
    if not cfgVehicle then clip = 'mode_changed' -- the cfg clips name another vehicle's modes
    else clip = VOICE and (VOICE[V.modeNum] or 'mode_changed') or ('mode_' .. V.modeNum) end
    playAlert(clip, V.muted)
  end
  prevMode = V.modeNum

  -- 3D fix gained/lost
  local gpsGood = V.fix >= 3
  if prevGpsGood ~= nil and settled('gps', gpsGood, prevGpsGood) then
    playAlert(gpsGood and 'gps_ok' or 'gps_lost', V.muted)
    prevGpsGood = gpsGood
  elseif prevGpsGood == nil then
    prevGpsGood = gpsGood
  end
end

-- ============================ widget api ===============================
local M = {}

local greeted = false

function M.create(zone, options)
  loadConfig()
  applyTheme(CFG.theme)
  currentTheme = CFG.theme
  logoBmp = Bitmap.open('/WIDGETS/ardudeck/logo.png')
  logoBmpLight = Bitmap.open('/WIDGETS/ardudeck/logo_light.png')
  -- boot greeting, once per model load (create also fires on page/layout
  -- changes; the flag keeps her from re-greeting every navigation)
  if not greeted then
    greeted = true
    playAlert('welcome', false)
  end
  return { zone = zone, options = options }
end

function M.update(widget, options)
  widget.options = options
end

local function maybeReloadConfig()
  local t = getTime()
  if t - lastCfgLoadT >= CFG_RELOAD_TICKS then
    lastCfgLoadT = t
    loadConfig()
    loadMapsManifest()
    loadMissionOverlay()
  end
end

-- Read an option-assigned switch. SWITCH options store a source index;
-- getValue on it returns the mixer value (-1024..1024). getSwitchValue
-- stays as fallback for builds where the option really is a switch index.
local function switchPos(sw)
  if not sw or sw == 0 then return nil end
  local ok, v = pcall(getValue, sw)
  if ok and type(v) == 'number' then
    return v > 512 and 1 or (v < -512 and -1 or 0)
  end
  local ok2, b = pcall(getSwitchValue, sw)
  if ok2 then return b and 1 or -1 end
  return nil
end

-- Priority: DaySw switch (when assigned) > tap toggle > config
local function effectiveTheme(opts)
  local pos = switchPos(opts and opts.DaySw)
  if pos ~= nil then return pos == 1 and 'light' or 'dark' end
  return themeTap or CFG.theme
end

local function updateSwitches(widget)
  local opts = widget and widget.options
  local mutePos = switchPos(opts and opts.Mute)
  V.muted = mutePos == 1
  demoActive = (CFG.demo == 1) or ((opts and opts.Demo) == 1) or demoTap
  pinnedPage = (opts and opts.Page) or 0
  -- PageSw: any position change of the assigned switch advances one page
  -- (works with 2- and 3-position switches; every throw rotates)
  do
    local pos = switchPos(opts and opts.PageSw)
    if pos ~= nil then
      if lastPageSw ~= nil and pos ~= lastPageSw then
        local _, _, pageCount = activeLayout()
        if pageCount > 1 then
          if not pageMoved and pinnedPage > 0 then curPage = math.min(pinnedPage, pageCount) end
          pageMoved = true
          curPage = curPage % pageCount + 1
          pageFlashT = now()
          pageTurnT = now()
        end
      end
      lastPageSw = pos
    end
  end
  local theme = effectiveTheme(opts)
  if theme ~= currentTheme then
    currentTheme = theme
    applyTheme(theme)
  end
end

function M.background(widget)
  maybeReloadConfig()
  updateSwitches(widget)
  pump()
  pollSensors()
  trailTick()
end

function M.refresh(widget, event, touchState)
  maybeReloadConfig()
  -- EdgeTX passes `event` only to a FULL SCREEN widget; in a normal slot it is
  -- nil, along with every key and touch. That is what tells us which we are.
  -- `event` is nil outside fullscreen, but lvgl.isFullScreen() answers even
  -- then, and lvgl.isAppMode() says whether this screen is an App mode layout.
  if lvgl and lvgl.isFullScreen then
    local ok, fs = pcall(lvgl.isFullScreen)
    fullScreen = ok and fs or (event ~= nil)
  else
    fullScreen = event ~= nil
  end
  if lvgl and lvgl.isAppMode then
    local ok, am = pcall(lvgl.isAppMode)
    appMode = ok and am or false
  end
  if event ~= nil and event ~= 0 then lastEvent = event end
  if touchState then
    lastTouch = string.format('%d,%d%s', touchState.x or -1, touchState.y or -1,
      touchState.startX and (' s' .. touchState.startX) or '')
  end
  -- Page navigation. EdgeTX only hands a widget events in FULL SCREEN, and
  -- only there do the PAGE keys arrive at all.
  local _, _, pageCount = activeLayout()
  -- Timed rotation: the fallback for a widget in a slot, where nothing else
  -- can reach it.
  if pageCount > 1 and (CFG.pageSecs or 0) > 0 then
    if now() - pageTurnT > CFG.pageSecs * 100 then
      curPage = curPage % pageCount + 1
      pageTurnT = now()
      pageFlashT = now()
    end
  end
  if pageCount > 1 then
    local function flip(step)
      if not pageMoved and pinnedPage > 0 then curPage = math.min(pinnedPage, pageCount) end
      pageMoved = true
      curPage = (curPage - 1 + step) % pageCount + 1
      pageFlashT = now()
      pageTurnT = now()
    end
    -- PAGE> / PAGE< (and the rotary or +/- on radios without them). These are
    -- the buttons made for this: swiping is the alternative, not the only way.
    if event and event ~= 0 then
      if (EVT_VIRTUAL_NEXT_PAGE and event == EVT_VIRTUAL_NEXT_PAGE)
        or (EVT_VIRTUAL_NEXT and event == EVT_VIRTUAL_NEXT) then
        flip(1)
      elseif (EVT_VIRTUAL_PREV_PAGE and event == EVT_VIRTUAL_PREV_PAGE)
        or (EVT_VIRTUAL_PREV and event == EVT_VIRTUAL_PREV) then
        flip(-1)
      end
    end
    if touchState then
      -- EdgeTX's own swipeLeft/Right only fire on a fast flick (>60px in one
      -- slide event), which is why a normal drag did nothing. Measure the
      -- gesture ourselves from where the finger went down, and latch so one
      -- drag turns one page.
      -- Swiping left moves to the next page: the pages travel with the
      -- finger, like every page dot UI on a phone.
      if touchState.swipeRight then
        flip(1)
        swipeLatched = true
      elseif touchState.swipeLeft then
        flip(-1)
        swipeLatched = true
      elseif touchState.startX then
        local dx = touchState.x - touchState.startX
        local dy = (touchState.y or 0) - (touchState.startY or 0)
        if dy < 0 then dy = -dy end
        if not swipeLatched and dy < 60 and (dx > 50 or dx < -50) then
          flip(dx > 0 and 1 or -1)
          swipeLatched = true
        end
      else
        swipeLatched = false
      end
    else
      swipeLatched = false
    end
  end
  -- corner tap: flip light/dark. Banner tap: start demo. Badge tap: exit
  -- a tap-started demo.
  if EVT_TOUCH_TAP and event == EVT_TOUCH_TAP and touchState then
    if touchState.x > LCD_W - 120 and touchState.y < 38 then
      themeTap = (currentTheme == 'dark') and 'light' or 'dark'
    elseif demoTap and touchState.x > LCD_W - 130 and touchState.y >= 38 and touchState.y < 62 then
      demoTap = false
    else
      -- tap inside a map tile cycles zoom level; a tap on the flight timer while disarmed resets it
      local layout = activeLayout()
      local onMap = false
      for i = 1, #layout do
        local tl = layout[i]
        if tl.id == 'timer' and not V.armed and touchState.x >= tl.x and touchState.x <= tl.x + tl.w
          and touchState.y >= tl.y and touchState.y <= tl.y + tl.h then
          V.armedAccum = 0
          V.armedAtT = nil
          onMap = true
          break
        end
        if tl.id == 'map' and touchState.x >= tl.x and touchState.x <= tl.x + tl.w
          and touchState.y >= tl.y and touchState.y <= tl.y + tl.h then
          onMap = true
          if #MAPS > 0 then
            mapTapIdx = ((mapTapIdx or (pickMap() or 1)) % #MAPS) + 1
          end
          break
        end
      end
      if not onMap and not demoActive and touchState.y > 62 then
        local rssi = getRSSI()
        if rssi == nil or rssi == 0 or not V.everFrame then
          demoTap = true
        end
      end
    end
  end
  updateSwitches(widget)
  pump()
  local state, hint, color = ladderState()
  if state == 'LIVE' then
    demoActive = false
    announceTransitions(true)
    drawLive()
  elseif demoActive then
    -- tick before announcing so demo transitions speak the same frame;
    -- demo counts as live for the announcer (it is the audio rehearsal)
    demoTick()
    announceTransitions(true)
    drawLive()
  elseif V.everFrame then
    announceTransitions(false)
    drawLive()
    drawLinkLostBar(state, hint, color)
  else
    announceTransitions(false)
    drawLadderBanner(state, hint, color)
  end
end

return M
