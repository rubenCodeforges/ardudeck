/**
 * Generate a synthetic DataFlash .bin log file for testing.
 * Run with: npx tsx src/__tests__/generate-test-log.ts
 * Outputs: test-flight.bin in the current directory
 */

import { writeFileSync } from 'fs';
import { join } from 'path';

const HEADER = [0xA3, 0x95];

function buildFmt(
  typeId: number,
  length: number,
  name: string,
  format: string,
  labels: string,
): Uint8Array {
  const msg = new Uint8Array(89);
  msg[0] = 0xA3;
  msg[1] = 0x95;
  msg[2] = 128;
  msg[3] = typeId;
  msg[4] = length;
  for (let i = 0; i < Math.min(name.length, 4); i++) msg[5 + i] = name.charCodeAt(i);
  for (let i = 0; i < Math.min(format.length, 16); i++) msg[9 + i] = format.charCodeAt(i);
  for (let i = 0; i < Math.min(labels.length, 64); i++) msg[25 + i] = labels.charCodeAt(i);
  return msg;
}

function buildMsg(typeId: number, payload: Uint8Array): Uint8Array {
  const msg = new Uint8Array(3 + payload.length);
  msg[0] = 0xA3;
  msg[1] = 0x95;
  msg[2] = typeId;
  msg.set(payload, 3);
  return msg;
}

function writeU64LE(buf: DataView, offset: number, val: number) {
  buf.setUint32(offset, val & 0xFFFFFFFF, true);
  buf.setUint32(offset + 4, Math.floor(val / 0x100000000), true);
}

const chunks: Uint8Array[] = [];

// FMT for FMT itself (type 128)
chunks.push(buildFmt(128, 89, 'FMT', 'BBnNZ', 'Type,Length,Name,Format,Columns'));

// Define message types
// MSG: QZ (TimeUS, Message) = 8+64 = 72 payload, 75 total
chunks.push(buildFmt(1, 75, 'MSG', 'QZ', 'TimeUS,Message'));

// GPS: QBIHBcLLefffB (TimeUS,Status,GMS,GWk,NSats,HDop,Lat,Lng,Alt,Spd,GCrs,VZ,Yaw)
// = 8+1+4+2+1+2+4+4+4+4+4+4+1 = 43 payload, 46 total
chunks.push(buildFmt(2, 46, 'GPS', 'QBIHBcLLefffB', 'TimeUS,Status,GMS,GWk,NSats,HDop,Lat,Lng,Alt,Spd,GCrs,VZ,Yaw'));

// ATT: Qcccccc (TimeUS,DesRoll,Roll,DesPitch,Pitch,DesYaw,Yaw) = 8+2*6=20 payload, 23 total
chunks.push(buildFmt(3, 23, 'ATT', 'Qcccccc', 'TimeUS,DesRoll,Roll,DesPitch,Pitch,DesYaw,Yaw'));

// VIBE: QfffIII (TimeUS,VibeX,VibeY,VibeZ,Clip0,Clip1,Clip2) = 8+4*3+4*3=32 payload, 35 total
chunks.push(buildFmt(4, 35, 'VIBE', 'QfffIII', 'TimeUS,VibeX,VibeY,VibeZ,Clip0,Clip1,Clip2'));

// BAT: QfffffB (TimeUS,Volt,VoltR,Curr,CurrTot,EnrgTot,Temp) = 8+4*5+1=29 payload, 32 total
chunks.push(buildFmt(5, 32, 'BAT', 'QfffffB', 'TimeUS,Volt,VoltR,Curr,CurrTot,EnrgTot,Temp'));

// MAG: QhhhhhhhhhBI (TimeUS,MagX,MagY,MagZ,OfsX,OfsY,OfsZ,MOfsX,MOfsY,MOfsZ,Health,S)
// = 8+2*9+1+4 = 31 payload, 34 total
chunks.push(buildFmt(6, 34, 'MAG', 'QhhhhhhhhhBI', 'TimeUS,MagX,MagY,MagZ,OfsX,OfsY,OfsZ,MOfsX,MOfsY,MOfsZ,Health,S'));

// MODE: QMBB (TimeUS,Mode,ModeNum,Rsn) = 8+1+1+1=11 payload, 14 total
chunks.push(buildFmt(7, 14, 'MODE', 'QMBB', 'TimeUS,Mode,ModeNum,Rsn'));

// EV: QB (TimeUS,Id) = 8+1=9 payload, 12 total
chunks.push(buildFmt(8, 12, 'EV', 'QB', 'TimeUS,Id'));

// POWR: QffBBI (TimeUS,Vcc,VServo,Flags,AccFlags,Safety) = 8+4+4+1+1+4=22 payload, 25 total
chunks.push(buildFmt(9, 25, 'POWR', 'QffBBI', 'TimeUS,Vcc,VServo,Flags,AccFlags,Safety'));

// NKF4: QBfffffffI (TimeUS,SV,SP,SH,SM,SVT,errRP,OFN,OFE,FS)
// = 8+1+4*7+4 = 41 payload, 44 total
chunks.push(buildFmt(10, 44, 'NKF4', 'QBfffffffI', 'TimeUS,SV,SP,SH,SM,SVT,errRP,OFN,OFE,FS'));

// CTUN: Qfffffffffff (TimeUS,ThI,ABst,ThO,ThH,DAlt,Alt,BAlt,DSAlt,SAlt,TAlt,DCRt)
// = 8+4*11=52 payload, 55 total
chunks.push(buildFmt(11, 55, 'CTUN', 'Qfffffffffff', 'TimeUS,ThI,ABst,ThO,ThH,DAlt,Alt,BAlt,DSAlt,SAlt,TAlt,DCRt'));

// ERR: QBB (TimeUS,Subsys,ECode) = 8+1+1=10 payload, 13 total
chunks.push(buildFmt(12, 13, 'ERR', 'QBB', 'TimeUS,Subsys,ECode'));

// PM: QIHIIIBB (TimeUS,NLon,NLoop,MaxT,Mem,Load,ErrL,IntE)
// = 8+4+2+4+4+4+1+1 = 28 payload, 31 total
chunks.push(buildFmt(13, 31, 'PM', 'QIHIIIBB', 'TimeUS,NLon,NLoop,MaxT,Mem,Load,ErrL,IntE'));

// ESC: QBfffff (TimeUS,Instance,RPM,Volt,Curr,Temp,CTot) — multi-instance.
// Quad with motor 2 deliberately running hot + slow + drawing more current
// so per-instance picker has something visually distinct to compare.
// = 8+1+4*5 = 29 payload, 32 total
chunks.push(buildFmt(14, 32, 'ESC', 'QBfffff', 'TimeUS,Instance,RPM,Volt,Curr,Temp,CTot'));

// RCIN: QHHHHHHHH (TimeUS,C1..C8) = 8+2*8 = 24 payload, 27 total
chunks.push(buildFmt(15, 27, 'RCIN', 'QHHHHHHHH', 'TimeUS,C1,C2,C3,C4,C5,C6,C7,C8'));

// RCOU: QHHHHHHHH (TimeUS,C1..C8) = 8+2*8 = 24 payload, 27 total
chunks.push(buildFmt(16, 27, 'RCOU', 'QHHHHHHHH', 'TimeUS,C1,C2,C3,C4,C5,C6,C7,C8'));

// RATE: Qffffff (TimeUS,RDes,R,PDes,P,YDes,Y) = 8+4*6 = 32 payload, 35 total
// Desired vs actual body rates - tracking error spikes during vibration window.
chunks.push(buildFmt(17, 35, 'RATE', 'Qffffff', 'TimeUS,RDes,R,PDes,P,YDes,Y'));

// CMD: QHHHBffffff + CName (16) — synthetic format with name field for
// event-marker testing. = 8+2*3+1+4*6+16 = 55 payload, 58 total.
chunks.push(buildFmt(18, 58, 'CMD', 'QHHHBffffffN', 'TimeUS,CTot,CNum,CId,COpt,Prm1,Prm2,Prm3,Prm4,Lat,Lng,CName'));

// ---- Now generate flight data ----

const FLIGHT_DURATION_S = 300; // 5 minute flight
const SAMPLE_RATE_MS = 100; // 10Hz for most messages
const startTimeUs = 1000000; // 1 second

// MSG messages — firmware info
function msgPayload(timeUs: number, message: string): Uint8Array {
  const p = new Uint8Array(72);
  const v = new DataView(p.buffer);
  writeU64LE(v, 0, timeUs);
  for (let i = 0; i < Math.min(message.length, 64); i++) p[8 + i] = message.charCodeAt(i);
  return p;
}

chunks.push(buildMsg(1, msgPayload(startTimeUs, 'ArduCopter V4.5.7 (7e8a2f1c)')));
chunks.push(buildMsg(1, msgPayload(startTimeUs + 1000, 'ChibiOS: d4fce843')));
chunks.push(buildMsg(1, msgPayload(startTimeUs + 2000, 'fmuv3 003F0034 31395106 35333532')));

// MODE changes
function modePayload(timeUs: number, mode: number, reason: number): Uint8Array {
  const p = new Uint8Array(11);
  const v = new DataView(p.buffer);
  writeU64LE(v, 0, timeUs);
  p[8] = mode;
  p[9] = mode;
  p[10] = reason;
  return p;
}

// Stabilize -> AltHold -> Loiter -> RTL -> Land
chunks.push(buildMsg(7, modePayload(startTimeUs, 0, 0)));       // STABILIZE
chunks.push(buildMsg(7, modePayload(startTimeUs + 30_000_000, 2, 1)));  // ALT_HOLD at 30s
chunks.push(buildMsg(7, modePayload(startTimeUs + 90_000_000, 5, 1)));  // LOITER at 90s
chunks.push(buildMsg(7, modePayload(startTimeUs + 240_000_000, 6, 1))); // RTL at 240s
chunks.push(buildMsg(7, modePayload(startTimeUs + 280_000_000, 9, 1))); // LAND at 280s

// CMD entries — sparse navigation commands so event markers have something
// to render. CName is the human-readable label that the event-marker layer
// surfaces above the chart.
function cmdPayload(timeUs: number, ctot: number, cnum: number, cid: number, cname: string): Uint8Array {
  const p = new Uint8Array(55);
  const v = new DataView(p.buffer);
  writeU64LE(v, 0, timeUs);
  v.setUint16(8, ctot, true);    // CTot
  v.setUint16(10, cnum, true);   // CNum
  v.setUint16(12, cid, true);    // CId
  p[14] = 0;                     // COpt
  v.setFloat32(15, 0, true);     // Prm1
  v.setFloat32(19, 0, true);     // Prm2
  v.setFloat32(23, 0, true);     // Prm3
  v.setFloat32(27, 0, true);     // Prm4
  v.setFloat32(31, 0, true);     // Lat
  v.setFloat32(35, 0, true);     // Lng
  // CName is N (char[16])
  for (let i = 0; i < Math.min(cname.length, 16); i++) p[39 + i] = cname.charCodeAt(i);
  return p;
}
chunks.push(buildMsg(18, cmdPayload(startTimeUs + 30_000_000,  4, 1, 22, 'NAV_TAKEOFF')));
chunks.push(buildMsg(18, cmdPayload(startTimeUs + 90_000_000,  4, 2, 16, 'NAV_WAYPOINT')));
chunks.push(buildMsg(18, cmdPayload(startTimeUs + 180_000_000, 4, 3, 16, 'NAV_WAYPOINT')));
chunks.push(buildMsg(18, cmdPayload(startTimeUs + 240_000_000, 4, 4, 20, 'NAV_RTL')));

// Generate time-series data
for (let t = 0; t < FLIGHT_DURATION_S * 1000; t += SAMPLE_RATE_MS) {
  const timeUs = startTimeUs + t * 1000;
  const tS = t / 1000;

  // Simulate altitude profile: takeoff, climb, vary, high pass, descend
  let alt = 0;
  if (tS < 20) alt = (tS / 20) * 30;                          // Takeoff to 30m
  else if (tS < 60) alt = 30 + ((tS - 20) / 40) * 70;        // Climb to 100m
  else if (tS < 120) alt = 100 + Math.sin(tS / 8) * 20;      // Vary 80-120m
  else if (tS < 180) alt = 100 + ((tS - 120) / 60) * 50 + Math.sin(tS / 5) * 10; // Climb to 150m
  else if (tS < 240) alt = 150 - ((tS - 180) / 60) * 80 + Math.sin(tS / 6) * 15; // Descend to 70m
  else if (tS < 280) alt = 70 - ((tS - 240) / 40) * 60;      // Final descent to 10m
  else alt = Math.max(0, 10 - ((tS - 280) / 20) * 10);       // Landing

  // GPS every 200ms
  if (t % 200 === 0) {
    const p = new Uint8Array(43);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    p[8] = 3; // Status: 3D fix
    v.setUint32(9, t, true); // GMS
    v.setUint16(13, 2300, true); // GWk
    p[15] = tS < 10 ? 8 : (12 + Math.floor(Math.random() * 4)); // NSats: low at start
    v.setInt16(16, Math.floor((tS < 10 ? 2.5 : 0.8 + Math.random() * 0.4) * 100), true); // HDop (centi)
    // Figure-8 flight pattern, ~500m radius
    const phase = tS / 120 * Math.PI * 2;
    const latOff = Math.sin(phase) * 0.004;              // ~440m N-S
    const lngOff = Math.sin(phase * 2) * 0.003;          // ~330m E-W (figure-8)
    v.setInt32(18, Math.floor((-35.3632 + latOff) * 1e7), true); // Lat
    v.setInt32(22, Math.floor((149.1652 + lngOff) * 1e7), true); // Lng
    v.setInt32(26, Math.floor(alt * 100), true); // Alt (centi, type 'e')
    v.setFloat32(30, 3 + Math.sin(tS / 5) * 2, true); // Spd
    v.setFloat32(34, (tS * 1.2) % 360, true); // GCrs
    v.setFloat32(38, tS < 20 ? 2.5 : (tS > 250 ? -1.0 : 0.1), true); // VZ
    p[42] = 0; // Yaw
    chunks.push(buildMsg(2, p));
  }

  // ATT every 100ms
  {
    const p = new Uint8Array(20);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    const desRoll = Math.sin(tS / 3) * 500; // centi-degrees
    const roll = desRoll + (Math.random() - 0.5) * 100;
    const desPitch = Math.cos(tS / 4) * 300;
    const pitch = desPitch + (Math.random() - 0.5) * 80;
    const desYaw = (tS * 120) % 36000;
    const yaw = desYaw + (Math.random() - 0.5) * 200;
    v.setInt16(8, Math.floor(desRoll), true);
    v.setInt16(10, Math.floor(roll), true);
    v.setInt16(12, Math.floor(desPitch), true);
    v.setInt16(14, Math.floor(pitch), true);
    v.setInt16(16, Math.floor(desYaw), true);
    v.setInt16(18, Math.floor(yaw), true);
    chunks.push(buildMsg(3, p));
  }

  // VIBE every 500ms
  if (t % 500 === 0) {
    const p = new Uint8Array(32);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    // Simulate vibration spike at 120-140s
    const vibeBase = (tS > 120 && tS < 140) ? 40 : 15;
    v.setFloat32(8, vibeBase + Math.random() * 5, true);  // VibeX
    v.setFloat32(12, vibeBase + Math.random() * 5, true);  // VibeY
    v.setFloat32(16, vibeBase * 1.2 + Math.random() * 5, true); // VibeZ
    v.setUint32(20, 0, true); // Clip0
    v.setUint32(24, 0, true); // Clip1
    v.setUint32(28, 0, true); // Clip2
    chunks.push(buildMsg(4, p));
  }

  // BAT every 500ms
  if (t % 500 === 0) {
    const p = new Uint8Array(29);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    // Voltage drops from 16.8 to 14.2 over flight, with sag under load
    const baseVolt = 16.8 - (tS / FLIGHT_DURATION_S) * 2.6;
    const loadSag = alt > 10 ? 0.5 : 0;
    v.setFloat32(8, baseVolt - loadSag, true); // Volt
    v.setFloat32(12, baseVolt, true); // VoltR (resting)
    v.setFloat32(16, alt > 10 ? 15 + Math.random() * 5 : 1, true); // Curr
    v.setFloat32(20, (tS / FLIGHT_DURATION_S) * 2200, true); // CurrTot (mAh)
    v.setFloat32(24, (tS / FLIGHT_DURATION_S) * 30, true); // EnrgTot
    p[28] = 35; // Temp
    chunks.push(buildMsg(5, p));
  }

  // MAG every 200ms
  if (t % 200 === 0) {
    const p = new Uint8Array(31);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    v.setInt16(8, Math.floor(200 + Math.sin(tS / 2) * 30), true);  // MagX
    v.setInt16(10, Math.floor(-50 + Math.cos(tS / 2) * 20), true); // MagY
    v.setInt16(12, Math.floor(350 + Math.sin(tS / 3) * 15), true); // MagZ
    v.setInt16(14, 120, true); // OfsX
    v.setInt16(16, -45, true); // OfsY
    v.setInt16(18, 80, true);  // OfsZ
    v.setInt16(20, 0, true);   // MOfsX
    v.setInt16(22, 0, true);   // MOfsY
    v.setInt16(24, 0, true);   // MOfsZ
    p[26] = 1; // Health
    v.setUint32(27, 0, true);  // S
    chunks.push(buildMsg(6, p));
  }

  // EV — failsafe at 200s
  if (t === 200_000) {
    const p = new Uint8Array(9);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    p[8] = 9; // FAILSAFE_SHORT
    chunks.push(buildMsg(8, p));
  }

  // POWR every 1000ms
  if (t % 1000 === 0) {
    const p = new Uint8Array(22);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    v.setFloat32(8, 5.02 + Math.random() * 0.05, true); // Vcc
    v.setFloat32(12, 5.1, true); // VServo
    p[16] = 0; // Flags
    p[17] = 0; // AccFlags
    v.setUint32(18, 0, true); // Safety
    chunks.push(buildMsg(9, p));
  }

  // NKF4 every 200ms
  if (t % 200 === 0) {
    const p = new Uint8Array(41);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    // SV=0 is healthy, occasional non-zero
    p[8] = (tS > 180 && tS < 185) ? 1 : 0; // SV innovation flags
    v.setFloat32(9, 0, true);  // SP
    v.setFloat32(13, 0, true); // SH
    v.setFloat32(17, 0, true); // SM
    v.setFloat32(21, 0, true); // SVT
    v.setFloat32(25, 0.5, true); // errRP
    v.setFloat32(29, 0, true); // OFN
    v.setFloat32(33, 0, true); // OFE
    v.setUint32(37, 0, true);  // FS
    chunks.push(buildMsg(10, p));
  }

  // CTUN every 200ms
  if (t % 200 === 0) {
    const p = new Uint8Array(52);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    v.setFloat32(8, 0.5, true);  // ThI
    v.setFloat32(12, 0, true);   // ABst
    v.setFloat32(16, alt > 10 ? 0.55 : 0, true); // ThO
    v.setFloat32(20, 0.5, true); // ThH
    v.setFloat32(24, alt, true); // DAlt
    v.setFloat32(28, alt + (Math.random() - 0.5) * 0.5, true); // Alt
    v.setFloat32(32, alt, true); // BAlt
    v.setFloat32(36, alt, true); // DSAlt
    v.setFloat32(40, alt, true); // SAlt
    v.setFloat32(44, alt, true); // TAlt
    v.setFloat32(48, tS < 20 ? 2.5 : (tS > 250 ? -1.0 : 0), true); // DCRt
    chunks.push(buildMsg(11, p));
  }

  // PM every 2000ms
  if (t % 2000 === 0) {
    const p = new Uint8Array(28);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    v.setUint32(8, Math.floor(Math.random() * 3), true); // NLon
    v.setUint16(12, 400, true); // NLoop
    v.setUint32(14, 1200 + Math.floor(Math.random() * 200), true); // MaxT (microseconds)
    v.setUint32(18, 100000, true); // Mem
    v.setUint32(22, 35, true); // Load (3.5%)
    p[26] = 0; // ErrL
    p[27] = 0; // IntE
    chunks.push(buildMsg(13, p));
  }

  // ERR — compass error at 150s
  if (t === 150_000) {
    const p = new Uint8Array(10);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    p[8] = 3;  // Subsys: Compass
    p[9] = 4;  // ECode: Unhealthy
    chunks.push(buildMsg(12, p));
  }

  // ESC × 4 motors @ 100ms — payload is base RPM scaled by throttle, with
  // per-motor offsets so users can spot motor 2 (the "bad" motor) running
  // hotter, slower, and drawing more current. Voltage tracks the battery
  // sag from BAT so the two views agree.
  {
    const baseRpm = alt > 5 ? 3500 + Math.sin(tS / 4) * 200 : (tS < 2 ? 0 : 1100);
    const baseVolt = 16.8 - (tS / FLIGHT_DURATION_S) * 2.6;
    const escVolt = baseVolt - (alt > 10 ? 0.5 : 0);
    for (let inst = 0; inst < 4; inst++) {
      const p = new Uint8Array(29);
      const v = new DataView(p.buffer);
      writeU64LE(v, 0, timeUs);
      p[8] = inst;
      // Per-motor variation. Motor 2 = unbalanced/failing motor.
      const isBad = inst === 2;
      const rpmOffset = isBad ? -250 : (inst - 1.5) * 30;
      const currBase = isBad ? 22 : 15;
      const tempBase = isBad ? 65 : 42 + inst * 1.5;
      v.setFloat32(9, baseRpm + rpmOffset + (Math.random() - 0.5) * 60, true); // RPM
      v.setFloat32(13, escVolt + (Math.random() - 0.5) * 0.05, true);          // Volt
      v.setFloat32(17, alt > 10 ? currBase + Math.random() * 3 : 0.4, true);   // Curr
      v.setFloat32(21, tempBase + Math.sin(tS / 30) * 4, true);                // Temp
      v.setFloat32(25, (tS / FLIGHT_DURATION_S) * (isBad ? 700 : 540), true);  // CTot (mAh)
      chunks.push(buildMsg(14, p));
    }
  }

  // RCIN @ 100ms — pilot stick inputs. C1=Roll, C2=Pitch, C3=Throttle, C4=Yaw.
  // Stays around 1500 (centered) with throttle following the altitude profile.
  {
    const p = new Uint8Array(24);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    const throttle = Math.max(1000, Math.min(2000, 1100 + alt * 7));
    v.setUint16(8, Math.floor(1500 + Math.sin(tS / 3) * 80), true);  // C1 Roll
    v.setUint16(10, Math.floor(1500 + Math.cos(tS / 4) * 60), true); // C2 Pitch
    v.setUint16(12, Math.floor(throttle), true);                     // C3 Throttle
    v.setUint16(14, Math.floor(1500 + Math.sin(tS / 7) * 100), true); // C4 Yaw
    v.setUint16(16, 1000, true); // C5 (mode switch)
    v.setUint16(18, 1500, true); // C6
    v.setUint16(20, 1500, true); // C7
    v.setUint16(22, 1500, true); // C8
    chunks.push(buildMsg(15, p));
  }

  // RCOU @ 100ms — motor outputs C1..C4 active for a quad. Throttle baseline
  // shared across motors with small per-motor trim so the chart shows 4
  // distinct lines bunched together. C2 (motor 2 in 1-based) trends higher
  // because the bad ESC needs more PWM to hold attitude.
  {
    const p = new Uint8Array(24);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    const baseOut = alt > 5 ? 1450 + alt * 2 + Math.sin(tS / 4) * 40 : (tS < 2 ? 1000 : 1200);
    v.setUint16(8,  Math.floor(baseOut + 5), true);   // C1
    v.setUint16(10, Math.floor(baseOut + 28), true);  // C2  (compensating for bad motor 2 — ESC index 2 = output 3 historically; we exaggerate on C2 too for visible spread)
    v.setUint16(12, Math.floor(baseOut + 60), true);  // C3 (output for ESC 2)
    v.setUint16(14, Math.floor(baseOut + 12), true);  // C4
    v.setUint16(16, 1500, true);
    v.setUint16(18, 1500, true);
    v.setUint16(20, 1500, true);
    v.setUint16(22, 1500, true);
    chunks.push(buildMsg(16, p));
  }

  // RATE @ 100ms — body-rate desired vs actual for tuning view. Baseline is
  // smooth tracking; during the 120-140s vibration window we inject extra
  // tracking error so the "Rate Tuning" preset shows a clear deviation.
  {
    const p = new Uint8Array(32);
    const v = new DataView(p.buffer);
    writeU64LE(v, 0, timeUs);
    const trackingNoise = (tS > 120 && tS < 140) ? 0.15 : 0.03;
    const rDes = Math.sin(tS / 3) * 0.4;
    const pDes = Math.cos(tS / 4) * 0.3;
    const yDes = Math.sin(tS / 6) * 0.2;
    v.setFloat32(8,  rDes, true);                                          // RDes
    v.setFloat32(12, rDes + (Math.random() - 0.5) * trackingNoise, true);  // R
    v.setFloat32(16, pDes, true);                                          // PDes
    v.setFloat32(20, pDes + (Math.random() - 0.5) * trackingNoise, true);  // P
    v.setFloat32(24, yDes, true);                                          // YDes
    v.setFloat32(28, yDes + (Math.random() - 0.5) * trackingNoise, true);  // Y
    chunks.push(buildMsg(17, p));
  }
}

// Concatenate all chunks
let totalSize = 0;
for (const c of chunks) totalSize += c.length;
const result = new Uint8Array(totalSize);
let offset = 0;
for (const c of chunks) {
  result.set(c, offset);
  offset += c.length;
}

const outPath = join(process.cwd(), 'test-flight.bin');
writeFileSync(outPath, result);
console.log(`Generated ${outPath} (${(result.length / 1024).toFixed(1)} KB, ${FLIGHT_DURATION_S}s flight, ${chunks.length} messages)`);
