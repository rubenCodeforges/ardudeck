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

// Generate time-series data
for (let t = 0; t < FLIGHT_DURATION_S * 1000; t += SAMPLE_RATE_MS) {
  const timeUs = startTimeUs + t * 1000;
  const tS = t / 1000;

  // Simulate altitude profile: takeoff, cruise at 50m, descent
  let alt = 0;
  if (tS < 20) alt = (tS / 20) * 50;
  else if (tS < 250) alt = 50 + Math.sin(tS / 10) * 3;
  else alt = Math.max(0, 50 - ((tS - 250) / 50) * 50);

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
    v.setInt32(18, Math.floor((-35.3632 + Math.sin(tS / 60) * 0.001) * 1e7), true); // Lat
    v.setInt32(22, Math.floor((149.1652 + Math.cos(tS / 60) * 0.001) * 1e7), true); // Lng
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
