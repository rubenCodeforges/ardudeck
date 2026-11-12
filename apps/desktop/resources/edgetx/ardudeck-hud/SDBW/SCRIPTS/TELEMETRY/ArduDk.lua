-- ArduDeck HUD mini: monochrome EdgeTX radios (128x64 / 212x64).
-- Telemetry SCRIPT (these radios have no widget API): 1-bit, two pages,
-- same diagnostic ladder and voice pack as the color widget.
--
-- DECODER CORE COPIED FROM ../../WIDGETS/ardudeck/loadable.lua - the
-- harness (scripts/test-hud-bw.lua) feeds both the same frames; if you
-- touch a decoder here or there, keep them identical or the test fails.
-- Frame layout verified against Yaapu's decoder + real hardware:
-- cmd 0x80/0x7F, data[1]=subtype; 0xF0 single: appid LE data[2..3],
-- value LE data[4..7]; 0xF1 text: severity data[2], chars data[3+];
-- 0xF2 array: count data[2], 6-byte entries from data[3].

local band, rshift, btest = bit32.band, bit32.rshift, bit32.btest

local MODES = {
  [0]='STABILIZE','ACRO','ALT HOLD','AUTO','GUIDED','LOITER','RTL','CIRCLE',
  [9]='LAND',[11]='DRIFT',[13]='SPORT',[14]='FLIP',[15]='AUTOTUNE',
  [16]='POSHOLD',[17]='BRAKE',[18]='THROW',[20]='GUIDED NOGPS',
  [21]='SMART RTL',[22]='FLOWHOLD',[24]='ZIGZAG',[27]='AUTO RTL',
}
-- picked by the live frame type, so a rover or plane is not read with copter numbers
local OTHER_MODES = {
  plane = {
    [0]='MANUAL','CIRCLE','STABILIZE','TRAINING','ACRO','FBWA','FBWB','CRUISE','AUTOTUNE',
    [10]='AUTO',[11]='RTL',[12]='LOITER',[13]='TAKEOFF',[14]='AVOID ADSB',[15]='GUIDED',
    [17]='QSTABILIZE',[18]='QHOVER',[19]='QLOITER',[20]='QLAND',[21]='QRTL',
    [22]='QAUTOTUNE',[23]='QACRO',[24]='THERMAL',[25]='LOITER QLAND',
  },
  rover = {
    [0]='MANUAL','ACRO',[3]='STEERING',[4]='HOLD',[5]='LOITER',[6]='FOLLOW',
    [7]='SIMPLE',[8]='DOCK',[9]='CIRCLE',[10]='AUTO',[11]='RTL',[12]='SMART RTL',
    [15]='GUIDED',[16]='INITIALIZING',
  },
  sub = {
    [0]='STABILIZE','ACRO','ALT HOLD','AUTO','GUIDED',[7]='CIRCLE',[9]='SURFACE',
    [16]='POSHOLD',[19]='MANUAL',[20]='MOTOR DETECT',[21]='SURFTRAK',
  },
}

-- MAV_TYPE as ArduDeck's getVehicleClass maps it
local function modeTableFor(t)
  if t == 1 or (t and t >= 19 and t <= 25) then return OTHER_MODES.plane end
  if t == 10 or t == 11 then return OTHER_MODES.rover end
  if t == 12 then return OTHER_MODES.sub end
  return MODES
end

-- Everything between the strips is a slot, editable from ArduDeck via
-- hud.cfg: bw_big (large top-left readout), bw_l1..4 (left rows),
-- bw_center (horizon | slots), bw_c1..10 (center data columns when
-- bw_center=slots), bw_slot1..5 (right column), bw_wslot1..5 (212px
-- second column). Only the top/bottom strips are fixed (honesty chrome).
local CFG = { name = '', cells = 0, capacity = 0, low_cell = 3.6, crit_cell = 3.4,
  big = 'volt',
  left = { 'cellpct', 'curr', 'mah', 'thr' },
  center = 'horizon',
  cslots = { 'alt', 'spd', 'vspd', 'sat', 'home', 'wind', 'hdop', 'rng', 'wp', 'yaw' },
  slots = { 'alt', 'spd', 'vspd', 'sat', 'home' },
  wslots = { 'wind', 'hdop', 'rng', 'imu', 'wp' } }

local V = {
  lastFrameT = 0, lastStreamT = 0, everFrame = false,
  modeNum = -1, armed = false, flying = false,
  battFs = false, ekfBad = false, anyFs = false, fenceBreach = false,
  throttle = 0, imuTemp = 0, tImuTemp = 0, crsfTemp = nil,
  sats = 0, fix = 0, hdop = 0, gpsAltM = 0,
  voltV = 0, currA = 0, mah = 0,
  homeDistM = 0, homeAltM = 0, homeBearingDeg = 0,
  vspdMs = 0, hspdMs = 0, yawDeg = 0,
  rollDeg = 0, pitchDeg = 0, rangeM = 0,
  lat = nil, lon = nil,
  windDirDeg = 0, windMs = 0,
  autoCapacity = 0, maxVolt = 0,
  wpNum = 0, wpDistM = 0, wpBearingDeg = 0, tWp = 0,
  sensorPct = nil, tSensorPct = 0,
  armedAtT = nil, armedAccum = 0,
  msgs = {}, msgHead = 0, msgBuf = '', lastToneT = 0,
  -- EdgeTX sensor source (ELRS MAVLink2 links have no passthrough frames)
  src = 'pass', lastSensorT = 0, modeText = nil, armedKnown = false,
  homeLat = nil, homeLon = nil,
}

local function now() return getTime() end

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

-- ============================ voice ====================================
local function playAlert(name)
  playFile('/WIDGETS/ardudeck/snd/' .. name .. '.wav')
end

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
  { 'is low', 'batt_low' },
  { 'is critical', 'batt_crit' },
}

local lastSpokenT = -1000
local function pushMsg(sev, text)
  V.msgHead = V.msgHead % 4 + 1
  V.msgs[V.msgHead] = { t = now(), sev = sev, text = text }
  for i = 1, #MSG_SOUNDS do
    if string.find(text, MSG_SOUNDS[i][1], 1, true) then
      if now() - lastSpokenT > 500 then
        lastSpokenT = now()
        playAlert(MSG_SOUNDS[i][2])
      end
      return
    end
  end
  if sev <= 4 and now() - V.lastToneT > 100 then
    V.lastToneT = now()
    playTone(sev <= 3 and 1600 or 900, 200, 50, PLAY_NOW)
  end
end

-- ========================= appid dispatch ==============================
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
  -- ELRS in MAVLink mode builds this frame without the temperature bits (0)
  local rawTemp = band(rshift(d, 26), 0x3F)
  if rawTemp > 0 then
    V.imuTemp = rawTemp + 19
    V.tImuTemp = now()
  end
  V.tAp = now(); V.lastStreamT = V.tAp
end

decoders[0x5002] = function (d)
  V.sats = band(d, 0x0F)
  -- bits 14-15 carry the fix beyond 3D (DGPS, RTK); they are not a sign on hdop
  V.fix = band(rshift(d, 4), 0x03) + band(rshift(d, 14), 0x03)
  V.hdop = band(rshift(d, 7), 0x7F) * (btest(d, 0x40) and 10 or 1) * 0.1
  V.gpsAltM = dec_2_2(band(rshift(d, 22), 0x3FF)) * 0.1
  V.lastStreamT = now()
end

decoders[0x5003] = function (d)
  V.voltV = band(d, 0x1FF) * 0.1
  V.currA = dec_2_1(band(rshift(d, 9), 0x1FF)) * 0.1
  V.mah = band(rshift(d, 17), 0x7FFF)
  if V.voltV > V.maxVolt then V.maxVolt = V.voltV end
  V.lastStreamT = now()
end

decoders[0x5004] = function (d)
  V.homeDistM = dec_3_2(band(d, 0x1FFF))
  V.homeAltM = dec_3_2(band(rshift(d, 12), 0x1FFF)) * 0.1
  V.homeBearingDeg = band(rshift(d, 25), 0x7F) * 3
end

decoders[0x5005] = function (d)
  V.vspdMs = dec_2_1(band(d, 0x1FF)) * 0.1
  V.hspdMs = dec_2_1(band(rshift(d, 9), 0x1FF)) * 0.1
  V.yawDeg = band(rshift(d, 17), 0x7FF) * 0.2
  V.lastStreamT = now()
end

decoders[0x5006] = function (d)
  V.rollDeg = band(d, 0x7FF) * 0.2 - 180
  V.pitchDeg = band(rshift(d, 11), 0x3FF) * 0.2 - 90
  V.rangeM = dec_3_1(band(rshift(d, 21), 0x7FF)) * 0.01
  V.lastStreamT = now()
end

decoders[0x5007] = function (d)
  local id = band(rshift(d, 24), 0xFF)
  if id == 1 then V.frameType = band(d, 0xFFFFFF)
  elseif id == 4 then V.autoCapacity = band(d, 0xFFFFFF) end
end

decoders[0x500D] = function (d)
  V.wpNum = band(d, 0x7FF)
  V.wpDistM = dec_3_2(band(rshift(d, 11), 0x1FFF))
  V.wpBearingDeg = band(rshift(d, 23), 0x7F) * 3
  V.tWp = now()
end

decoders[0x500C] = function (d)
  V.windDirDeg = dec_2_0(band(d, 0x7F)) * 3
  V.windMs = dec_2_1(band(rshift(d, 7), 0x1FF)) * 0.1
end

decoders[0x800] = function (d)
  local coord = band(d, 0x3FFFFFFF) / 600000
  if btest(d, 0x80000000) then coord = -coord end
  if btest(d, 0x40000000) then V.lon = coord else V.lat = coord end
  V.lastStreamT = now()
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

local function handlePassthrough(appid, data)
  V.everFrame = true
  V.lastFrameT = now()
  local dec = decoders[appid]
  if dec then dec(data) end
end

local function bytesToU32(data, ofs)
  return data[ofs] + data[ofs + 1] * 256 + data[ofs + 2] * 65536 + data[ofs + 3] * 16777216
end

local function pump()
  for _ = 1, 32 do
    if getUsage() > 70 then break end
    local cmd, data = crossfireTelemetryPop()
    if cmd == nil then break end
    if cmd == 0x0D and data ~= nil and #data >= 3 then
      -- CRSF temperature: source id, big-endian int16 in tenths (ELRS sends the baro temperature here)
      local raw = data[2] * 256 + data[3]
      if raw >= 0x8000 then raw = raw - 0x10000 end
      V.crsfTemp = raw / 10
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

-- ===================== EdgeTX sensor source ============================
-- On an ELRS MAVLink2 link no ArduPilot passthrough frame ever arrives:
-- EdgeTX decodes the telemetry itself and publishes plain sensors, so the
-- HUD reads those instead. The names and units below are the ones a radio
-- actually created on such a link (read back from MODELS/*.yml on the
-- card), never guessed: FM Ptch Roll Yaw VSpd GPS GSpd Hdg GAlt Sats RxBt
-- Curr Capa Bat%, plus the link statistics.
local UNIT_KMH, UNIT_MPH, UNIT_FEET, UNIT_RAD = 7, 8, 10, 21
local atan2 = math.atan2 or math.atan
local sensorUnit = {}
local scanIdx, scanDone, lastScanT = 0, false, 0
local starSeen = false

-- 60 slot reads is too much for one callback, so spread them over frames -
-- and never stop for good: sensors appear as the vehicle boots, so the
-- list is re-read every few seconds.
local function scanSensors()
  if model == nil or model.getSensor == nil then return end
  if scanDone then
    if now() - lastScanT < 500 then return end
    scanIdx, scanDone = 0, false
  end
  for _ = 1, 6 do
    if scanIdx >= 60 then
      scanDone = true
      lastScanT = now()
      return
    end
    local ok, sensor = pcall(model.getSensor, scanIdx)
    if ok and type(sensor) == 'table' and sensor.name ~= nil and sensor.name ~= '' then
      sensorUnit[sensor.name] = sensor.unit or 0
    end
    scanIdx = scanIdx + 1
  end
end

-- A sensor that returns a number exists; the unit table is only needed
-- where the reading has to be converted.
local function sNum(name)
  local v = getValue(name)
  if type(v) == 'number' then return v end
  return nil
end

-- Conversions wait for the scan rather than guessing a unit: a wrong guess
-- would put a plausible-looking lie on the screen.
local function sAngle(name)
  local u = sensorUnit[name]
  if u == nil then return nil end
  local v = sNum(name)
  if v == nil then return nil end
  if u == UNIT_RAD then return math.deg(v) end
  return v
end

local function sMetres(name)
  local u = sensorUnit[name]
  if u == nil then return nil end
  local v = sNum(name)
  if v == nil then return nil end
  if u == UNIT_FEET then return v * 0.3048 end
  return v
end

local function sSpeedMs(name)
  local u = sensorUnit[name]
  if u == nil then return nil end
  local v = sNum(name)
  if v == nil then return nil end
  if u == UNIT_KMH then return v / 3.6 end
  if u == UNIT_MPH then return v * 0.44704 end
  return v
end

-- equirectangular is accurate well past any RC range and costs one cos
local function distanceM(lat1, lon1, lat2, lon2)
  local dLat = math.rad(lat2 - lat1)
  local dLon = math.rad(lon2 - lon1) * math.cos(math.rad((lat1 + lat2) / 2))
  return math.sqrt(dLat * dLat + dLon * dLon) * 6371000
end

local function bearingDeg(lat1, lon1, lat2, lon2)
  local dLat = lat2 - lat1
  local dLon = (lon2 - lon1) * math.cos(math.rad((lat1 + lat2) / 2))
  return math.deg(atan2(dLon, dLat)) % 360
end

-- ArduPilot appends '*' to the mode name while disarmed, but only when
-- that option is enabled: armed stays UNKNOWN until a star has been seen,
-- rather than claiming DISARMED on a vehicle that may be armed.
local function readMode()
  local v = getValue('FM')
  if type(v) ~= 'string' or v == '' then return false end
  local star = string.sub(v, -1) == '*'
  if star then starSeen = true end
  V.modeText = star and string.sub(v, 1, -2) or v
  if starSeen then
    V.armed = not star
    V.armedKnown = true
  end
  return true
end

local lastPollT = 0
local function pollSensors()
  scanSensors()
  if now() - lastPollT < 50 then return end
  lastPollT = now()

  local g = getValue('GPS')
  if type(g) == 'table' and g.lat and g.lon and (g.lat ~= 0 or g.lon ~= 0) then
    V.lat = g.lat
    V.lon = g.lon
  end
  if getFieldInfo and getFieldInfo('Bat%') then
    local p = getValue('Bat%')
    if type(p) == 'number' and p >= 1 and p <= 100 then
      V.sensorPct = p
      V.tSensorPct = now()
    end
  end

  -- passthrough carries more (statustext, EKF, fence, waypoints): when it
  -- is flowing it owns every field and the sensors stay out of the way
  if V.everFrame and now() - V.lastFrameT <= 300 then
    V.src = 'pass'
    V.armedKnown = true
    return
  end

  local got = readMode()
  local v = sNum('RxBt')
  if v then V.voltV = v got = true end
  v = sNum('Curr')
  if v then V.currA = v got = true end
  v = sNum('Capa')
  if v then V.mah = v got = true end
  v = sAngle('Roll')
  if v then V.rollDeg = v got = true end
  v = sAngle('Ptch')
  if v then V.pitchDeg = v got = true end
  v = sAngle('Yaw')
  if v then V.yawDeg = v % 360 got = true end
  v = sSpeedMs('GSpd')
  if v then V.hspdMs = v got = true end
  v = sNum('VSpd')
  if v then V.vspdMs = v got = true end
  v = sMetres('GAlt')
  if v then V.gpsAltM = v got = true end
  v = sNum('Sats')
  if v then
    V.sats = v
    -- no fix-type sensor exists; satellite count is the honest stand-in
    V.fix = v >= 5 and 3 or (v >= 4 and 2 or 0)
    got = true
  end

  -- home is not published either: latch the first fixed position and do
  -- the range and bearing here
  if V.lat and V.lon then
    if V.homeLat == nil and V.fix >= 3 then
      V.homeLat, V.homeLon = V.lat, V.lon
    end
    if V.homeLat then
      V.homeDistM = distanceM(V.homeLat, V.homeLon, V.lat, V.lon)
      V.homeBearingDeg = bearingDeg(V.lat, V.lon, V.homeLat, V.homeLon)
      got = true
    end
  end

  if got then
    V.lastSensorT = now()
    V.src = 'snsr'
  end
end

-- ====================== transitions -> voice ===========================
local prevArmed, prevLive = nil, nil
local prevBattBand = nil
local BAND_ORDER = { ok = 1, half = 2, low = 3, crit = 4 }
local BAND_SOUND = { half = 'batt_50', low = 'batt_low', crit = 'batt_crit' }
local prevFence, prevEkf = false, false

local function effBattery()
  local capacity = CFG.capacity > 0 and CFG.capacity or V.autoCapacity
  local cells = CFG.cells
  if cells <= 0 and V.maxVolt > 6 then
    cells = math.floor(V.maxVolt / 4.3) + 1
  end
  return capacity, cells
end

local function battBand()
  local capacity, cells = effBattery()
  local pct = nil
  if capacity > 0 then
    pct = math.max(0, math.min(100, (capacity - V.mah) / capacity * 100))
  elseif V.sensorPct and now() - V.tSensorPct < 600 then
    pct = V.sensorPct
  end
  if pct then
    if pct <= 15 then return 'crit' end
    if pct <= 30 then return 'low' end
    if pct <= 50 then return 'half' end
    return 'ok'
  end
  local cellV = cells > 0 and V.voltV / cells or nil
  if not cellV or V.voltV < 6 then return nil end
  if cellV <= CFG.crit_cell then return 'crit' end
  if cellV <= CFG.low_cell then return 'low' end
  return 'ok'
end

local function announceTransitions(live)
  if V.armedKnown and prevArmed ~= nil and V.armed ~= prevArmed then
    playAlert(V.armed and 'armed' or 'disarmed')
    if V.armed then
      V.armedAtT = now()
    elseif V.armedAtT then
      V.armedAccum = V.armedAccum + (now() - V.armedAtT)
      V.armedAtT = nil
    end
  end
  if V.armedKnown then prevArmed = V.armed end
  -- announce the first LIVE too, not just later transitions; staying mute
  -- at power-up is indistinguishable from a broken voice pack
  if live ~= prevLive and (live or prevLive ~= nil) then
    playAlert(live and 'telemetry_ok' or 'telemetry_lost')
  end
  prevLive = live
  local b = battBand()
  if b and prevBattBand and b ~= prevBattBand and BAND_ORDER[b] > BAND_ORDER[prevBattBand] then
    local snd = BAND_SOUND[b]
    if snd then playAlert(snd) end
  end
  prevBattBand = b
  if V.fenceBreach and not prevFence then playAlert('fence_breach') end
  prevFence = V.fenceBreach
  if V.ekfBad and not prevEkf then playAlert('ekf_warn') end
  prevEkf = V.ekfBad
end

-- ======================= diagnostic ladder =============================
local function ladderState()
  local rssi = getRSSI()
  if rssi == nil or rssi == 0 then
    return 'NO LINK', 'check RX power / binding'
  end
  local t = now()
  if V.everFrame and t - V.lastFrameT <= 300 then
    if t - V.lastStreamT > 300 then
      return 'STREAMS OFF', 'connect ArduDeck once'
    end
    return 'LIVE', nil
  end
  -- no passthrough: EdgeTX's own sensors are a first-class source
  if V.lastSensorT > 0 and t - V.lastSensorT <= 500 then
    return 'LIVE', nil
  end
  return 'NO DATA', 'no telemetry sensors yet'
end

-- =========================== config ====================================
local function loadCfg()
  local f = io.open('/WIDGETS/ardudeck/hud.cfg', 'r')
  if not f then return end
  local raw = io.read(f, 2048)
  io.close(f)
  if type(raw) ~= 'string' then return end
  for k, v in string.gmatch(raw, '([%w_]+)=([^\r\n]+)') do
    if k == 'name' then CFG.name = v
    elseif k == 'cells' or k == 'capacity' or k == 'low_cell' or k == 'crit_cell' then
      CFG[k] = tonumber(v) or CFG[k]
    elseif k == 'bw_big' then CFG.big = v
    elseif k == 'bw_center' then CFG.center = v
    else
      local n = string.match(k, '^bw_slot(%d)$')
      local wn = string.match(k, '^bw_wslot(%d)$')
      local ln = string.match(k, '^bw_l(%d)$')
      local cn = string.match(k, '^bw_c(%d+)$')
      if n then CFG.slots[tonumber(n)] = v
      elseif wn then CFG.wslots[tonumber(wn)] = v
      elseif ln then CFG.left[tonumber(ln)] = v
      elseif cn then CFG.cslots[tonumber(cn)] = v end
    end
  end
end

-- ============================ drawing ==================================
local page = 1
local PAGES = 2

local function fmtTimer()
  local t = V.armedAccum + (V.armedAtT and (now() - V.armedAtT) or 0)
  local s = math.floor(t / 100)
  return string.format('%02d:%02d', math.floor(s / 60), s % 60)
end

local function drawLadder(state, hint)
  lcd.drawText(LCD_W / 2 - #state * 5, 18, state, DBLSIZE + BLINK)
  lcd.drawText(LCD_W / 2 - #hint * 2, 42, hint, SMLSIZE)
  lcd.drawText(0, 56, 'ArduDeck', SMLSIZE)
end

local function battPct()
  local capacity, cells = effBattery()
  if capacity > 0 then
    return math.max(0, math.min(100, (capacity - V.mah) / capacity * 100))
  end
  return V.sensorPct
end

-- Slot fields: each returns a compact row string (and an optional BLINK).
-- KEEP IDS IN SYNC with BW_FIELDS in RadioHudView.tsx.
local FIELDS = {
  volt = function () return string.format('%.1fV', V.voltV) end,
  cellv = function ()
    local _, cells = effBattery()
    if cells <= 0 then return '--v/c' end
    return string.format('%.2fv/c', V.voltV / cells)
  end,
  pct = function ()
    local p = battPct()
    if not p then return '--%' end
    return string.format('%d%%', math.floor(p + 0.5)), p <= 15
  end,
  cellpct = function ()
    local _, cells = effBattery()
    local p = battPct()
    local t = cells > 0 and string.format('%.2fv/c', V.voltV / cells) or ''
    if p then t = t .. string.format(' %d%%', math.floor(p + 0.5)) end
    return t ~= '' and t or '--'
  end,
  curr = function () return string.format('%.1fA', V.currA) end,
  mah = function () return string.format('%dmAh', V.mah) end,
  alt = function () return string.format('A%dm', math.floor(V.gpsAltM + 0.5)) end,
  spd = function () return string.format('S%.1f', V.hspdMs) end,
  vspd = function () return string.format('V%+.1f', V.vspdMs) end,
  sat = function ()
    return string.format('%ds%s', V.sats, V.fix >= 3 and '3D' or (V.fix == 2 and '2D' or '--')),
      V.fix < 3
  end,
  home = function () return string.format('H%dm', math.floor(V.homeDistM + 0.5)) end,
  wind = function () return string.format('w%.1fm', V.windMs) end,
  hdop = function () return string.format('hd%.1f', V.hdop), V.hdop > 2 end,
  rng = function () return string.format('r%.1fm', V.rangeM) end,
  imu = function ()
    if V.tImuTemp == 0 and V.crsfTemp then
      local c = math.floor(V.crsfTemp + 0.5)
      return string.format('b%dC', c), c > 60
    end
    return string.format('i%dC', V.imuTemp), V.imuTemp > 60
  end,
  wp = function ()
    if V.wpNum <= 0 then return 'wp--' end
    return string.format('wp%d %dm', V.wpNum, math.floor(V.wpDistM + 0.5))
  end,
  thr = function () return string.format('t%d%%', V.throttle) end,
  yaw = function () return string.format('%03d', math.floor(V.yawDeg + 0.5) % 360) end,
  none = function () return '' end,
}

-- Slots the EdgeTX sensor source can actually fill. Anything else would be
-- a stale passthrough value, so it reads '--' while that source is live.
local SENSOR_FIELDS = {
  volt = 1, cellv = 1, pct = 1, cellpct = 1, curr = 1, mah = 1, alt = 1,
  spd = 1, vspd = 1, sat = 1, home = 1, yaw = 1, none = 1,
}

local function fieldText(id)
  local f = FIELDS[id]
  if f == nil then return nil end
  if V.src == 'snsr' and SENSOR_FIELDS[id] == nil then return '--' end
  return f()
end

-- Rows are 8px; an emptied row is free space, so the surviving neighbour
-- grows into it at DBLSIZE rather than leaving a hole. Growth is refused
-- when the double-height text would reach the bottom strip or run into the
-- next column, since a readable row beats a bigger broken one.
local BOTTOM_CHROME_Y = 56

local function isEmptySlot(id)
  if id == nil or id == 'none' then return true end
  local text = fieldText(id)
  return text == nil or text == ''
end

-- Growing is about using the free HEIGHT, so a value that would be too wide
-- at the bigger font drops its tag letter and unit rather than refusing to
-- grow: '100' at MIDSIZE beats 'H100m' in tiny type when the row below it
-- is empty anyway.
local COMPACT = {
  volt = function () return string.format('%.1f', V.voltV) end,
  curr = function () return string.format('%.1f', V.currA) end,
  mah = function () return string.format('%d', V.mah) end,
  alt = function () return string.format('%d', math.floor(V.gpsAltM + 0.5)) end,
  spd = function () return string.format('%.0f', V.hspdMs) end,
  vspd = function () return string.format('%+.0f', V.vspdMs) end,
  sat = function () return string.format('%d', V.sats) end,
  home = function () return string.format('%d', math.floor(V.homeDistM + 0.5)) end,
  wind = function () return string.format('%.0f', V.windMs) end,
  rng = function () return string.format('%.1f', V.rangeM) end,
  thr = function () return string.format('%d', V.throttle) end,
  yaw = function () return string.format('%03d', math.floor(V.yawDeg + 0.5) % 360) end,
  wp = function () return string.format('%d', math.floor(V.wpDistM + 0.5)) end,
}

-- Yaapu's hardware-proven 128x64 layouts use MIDSIZE and never DBLSIZE for
-- column data; measuring the widths here reaches the same conclusion.
local function fitSize(text, room)
  if #text * 11 <= room then return DBLSIZE end
  if #text * 8 <= room then return MIDSIZE end
  return nil
end

-- Returns the text and font a grown row should use, or nil when even the
-- compact form cannot fit.
local function grown(id, text, room)
  local size = fitSize(text, room)
  if size then return text, size end
  local compact = COMPACT[id]
  if compact then
    local short = compact()
    size = fitSize(short, room)
    if size then return short, size end
  end
  return nil, nil
end

local function drawSlots(list, x, y0, count, w)
  local n = count or #list
  local room = w or (LCD_W - x)
  local i = 1
  -- row after the last row that actually drew something: trailing empties
  -- are free space for whatever the caller wants to put there
  local last = 1
  while i <= n do
    local y = y0 + (i - 1) * 8
    local fits = (y + 16) <= BOTTOM_CHROME_Y
    local here = list[i]
    local below = list[i + 1]
    if isEmptySlot(here) then
      -- gap above a filled row: that row moves up and takes both
      if i < n and not isEmptySlot(below) then
        local text, blink = fieldText(below)
        local big, size = nil, nil
        if fits then big, size = grown(below, text, room) end
        lcd.drawText(x, size and y or (y + 8), big or text, (size or SMLSIZE) + (blink and BLINK or 0))
        i = i + 2
        last = i
      else
        i = i + 1
      end
    else
      local text, blink = fieldText(here)
      local big, size = nil, nil
      if i < n and isEmptySlot(below) and fits then big, size = grown(here, text, room) end
      lcd.drawText(x, y, big or text, (size or SMLSIZE) + (blink and BLINK or 0))
      i = i + (size and 2 or 1)
      last = i
    end
  end
  return y0 + (last - 1) * 8
end

-- Large top-left readout (DBLSIZE number + unit tag)
local BIG = {
  volt = function () return string.format('%.1f', V.voltV), 'V' end,
  pct = function ()
    local p = battPct()
    return p and string.format('%d', math.floor(p + 0.5)) or '--', '%'
  end,
  alt = function () return string.format('%d', math.floor(V.gpsAltM + 0.5)), 'm' end,
  spd = function () return string.format('%.1f', V.hspdMs), 'm/s' end,
}

-- Dense Yaapu-class layout: every pixel works. Top+bottom inverse strips,
-- left battery block, center artificial horizon with heading, right data
-- column(s). 212-wide radios get a second data column. Data rows come
-- from CFG.slots/wslots.
local function drawTopBar()
  lcd.drawFilledRectangle(0, 0, LCD_W, 8, FORCE)
  local mode = V.modeText or modeTableFor(V.frameType)[V.modeNum] or (V.modeNum >= 0 and ('M' .. V.modeNum) or '---')
  lcd.drawText(1, 1, mode, SMLSIZE + INVERS + ((V.armed and V.armedKnown) and BLINK or 0))
  lcd.drawText(LCD_W / 2 - 12, 1, fmtTimer(), SMLSIZE + INVERS)
  if V.anyFs or V.battFs then
    lcd.drawText(LCD_W - 46, 1, 'FS!', SMLSIZE + INVERS + BLINK)
  end
  -- 'S' marks data coming from EdgeTX's sensors rather than passthrough
  lcd.drawText(LCD_W - 1, 1, (V.src == 'snsr' and 'S' or '') .. 'RS' .. (getRSSI() or 0),
    SMLSIZE + INVERS + RIGHT)
end

local function drawBottomBar()
  lcd.drawFilledRectangle(0, 56, LCD_W, 8, FORCE)
  local m = V.msgs[V.msgHead]
  if m then
    lcd.drawText(1, 57, string.sub(m.text, 1, math.floor(LCD_W / 5)), SMLSIZE + INVERS + (m.sev <= 4 and BLINK or 0))
  else
    local arm = '  ARM?'
    if V.armedKnown then arm = V.armed and '  ARMED' or '  DISARMED' end
    lcd.drawText(1, 57, (CFG.name ~= '' and CFG.name or 'ArduDeck') .. arm, SMLSIZE + INVERS)
  end
end

local function drawArrow(cx, cy, r, deg)
  local a = math.rad(deg)
  local tx, ty = cx + math.sin(a) * r, cy - math.cos(a) * r
  lcd.drawLine(cx + math.sin(a + 2.6) * r, cy - math.cos(a + 2.6) * r, tx, ty, SOLID, FORCE)
  lcd.drawLine(cx + math.sin(a - 2.6) * r, cy - math.cos(a - 2.6) * r, tx, ty, SOLID, FORCE)
  lcd.drawLine(cx, cy, tx, ty, SOLID, FORCE)
end

local function drawHorizon(x, y, w, h)
  lcd.drawRectangle(x, y, w, h)
  local cx, cy = x + w / 2, y + h / 2
  local a = math.rad(V.rollDeg)
  local ca, sa = math.cos(a), math.sin(a)
  local len = w / 2 - 3
  -- pitch offset, clamped so the line stays inside the box
  local pmax = math.max(0, h / 2 - 2 - math.abs(sa) * len)
  local p = math.max(-pmax, math.min(pmax, V.pitchDeg / 60 * (h / 2)))
  lcd.drawLine(cx - ca * len + sa * p, cy + sa * len + ca * p,
    cx + ca * len + sa * p, cy - sa * len + ca * p, SOLID, FORCE)
  -- aircraft reference: fixed center mark
  lcd.drawLine(cx - 5, cy, cx - 2, cy, SOLID, FORCE)
  lcd.drawLine(cx + 2, cy, cx + 5, cy, SOLID, FORCE)
  lcd.drawFilledRectangle(cx - 1, cy - 1, 2, 2, FORCE)
  -- heading, inverse chip at the box's bottom edge
  local hdg = string.format('%03d', math.floor(V.yawDeg + 0.5) % 360)
  lcd.drawFilledRectangle(cx - 10, y + h - 8, 20, 8, FORCE)
  lcd.drawText(cx - 8, y + h - 7, hdg, SMLSIZE + INVERS)
end

local function drawFly()
  drawTopBar()
  drawBottomBar()
  local wide = LCD_W > 150
  -- big readout (no lcd.sizeText on bw targets: fixed unit spot)
  local big = BIG[CFG.big] or BIG.volt
  local num, unit = big()
  lcd.drawText(0, 10, num, DBLSIZE)
  lcd.drawText(44, 10, unit, SMLSIZE)
  -- center panel geometry decides how wide the left column may grow
  local hx = wide and 62 or 50
  local hw = wide and 64 or 42
  -- left rows
  drawSlots(CFG.left, 0, 27, 3, hx - 2)
  local t4 = fieldText(CFG.left[4])
  if t4 then lcd.drawText(0, 49, t4, SMLSIZE) end -- last row hugs the strip
  if CFG.center == 'slots' then
    local half = math.floor(hw / 2)
    drawSlots(CFG.cslots, hx, 9, 5, half)
    local c2 = {}
    for i = 6, 10 do c2[#c2 + 1] = CFG.cslots[i] end
    drawSlots(c2, hx + half + 2, 9, nil, half)
  else
    drawHorizon(hx, 9, hw, 46)
  end
  -- right column(s)
  local rx = hx + hw + 4
  local freeY = drawSlots(CFG.slots, rx, 9, nil, wide and 44 or (LCD_W - rx))
  -- the home arrow owns whatever height the column did not use: emptying
  -- slots makes it bigger rather than leaving a hole
  if V.homeDistM > 0 then
    local band = BOTTOM_CHROME_Y - freeY
    if band >= 14 then
      local r = math.min(math.floor(band / 2) - 1, 16)
      drawArrow(rx + 10, freeY + math.floor(band / 2), r, V.homeBearingDeg - V.yawDeg)
    else
      drawArrow(rx + 8, 52, 5, V.homeBearingDeg - V.yawDeg)
    end
  end
  if wide then
    drawSlots(CFG.wslots, rx + 46, 9, nil, LCD_W - (rx + 46))
  end
end

local function drawNav()
  drawTopBar()
  drawBottomBar()
  if V.lat then
    lcd.drawText(0, 10, string.format('%.6f', V.lat), 0)
    lcd.drawText(0, 20, string.format('%.6f', V.lon), 0)
  else
    lcd.drawText(0, 10, 'no position', 0 + BLINK)
  end
  lcd.drawText(0, 30, string.format('home %dm brg %d', math.floor(V.homeDistM + 0.5), V.homeBearingDeg), SMLSIZE)
  lcd.drawText(0, 38, V.wpNum > 0
    and string.format('wp %d  %dm brg %d', V.wpNum, math.floor(V.wpDistM + 0.5), V.wpBearingDeg)
    or 'no mission wp', SMLSIZE)
  lcd.drawText(0, 46, string.format('wind %.1fm/s %d  thr %d%%', V.windMs, V.windDirDeg, V.throttle), SMLSIZE)
  local rx = LCD_W - 50
  lcd.drawText(rx, 10, string.format('alt %dm', math.floor(V.gpsAltM + 0.5)), SMLSIZE)
  lcd.drawText(rx, 18, string.format('hdp %.1f', V.hdop), SMLSIZE)
  lcd.drawText(rx, 26, string.format('vsp %+.1f', V.vspdMs), SMLSIZE)
  if V.homeDistM > 0 then
    drawArrow(rx + 10, 40, 6, V.homeBearingDeg - V.yawDeg)
  end
end

-- ========================== script API =================================
-- EdgeTX calls background() whether or not the telemetry screen is on
-- display, and run() only while it is: the callouts belong here, otherwise
-- the HUD is mute exactly when you are looking at the aircraft instead of
-- the radio.
local function background()
  pump()
  pollSensors()
  announceTransitions(ladderState() == 'LIVE')
end

local function init()
  loadCfg()
end

local function run(event)
  background()
  lcd.clear()
  -- any key/rotary step flips the page (guard: unset EVT_ globals are nil)
  if event and event ~= 0 then
    if (EVT_VIRTUAL_NEXT and event == EVT_VIRTUAL_NEXT)
      or (EVT_VIRTUAL_PREV and event == EVT_VIRTUAL_PREV)
      or (EVT_PLUS_BREAK and event == EVT_PLUS_BREAK)
      or (EVT_MINUS_BREAK and event == EVT_MINUS_BREAK)
      or (EVT_ROT_RIGHT and event == EVT_ROT_RIGHT)
      or (EVT_ROT_LEFT and event == EVT_ROT_LEFT) then
      page = page % PAGES + 1
    end
  end
  local state, hint = ladderState()
  if state == 'LIVE' then
    if page == 1 then drawFly() else drawNav() end
  elseif V.everFrame then
    -- link lost after data: keep the last values, flag it on an inverted top line
    if page == 1 then drawFly() else drawNav() end
    local ago = math.max(0, math.floor((now() - V.lastFrameT) / 100))
    lcd.drawFilledRectangle(0, 0, LCD_W, 9, SOLID)
    lcd.drawText(1, 1, string.format('%s %ds ago', state, ago), SMLSIZE + INVERS + BLINK)
  else
    drawLadder(state, hint)
  end
  return 0
end

return { init = init, background = background, run = run }
