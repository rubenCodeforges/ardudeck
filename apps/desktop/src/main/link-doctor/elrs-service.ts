/**
 * ELRS TX module service: detect and configure an ExpressLRS transmitter
 * module over its USB port using the CRSF parameter protocol - the same
 * protocol a handset's ELRS Lua script speaks, so no radio is needed.
 *
 * Field-proven flow (RadioMaster Ranger, ELRS 4.0.0):
 *  - broadcast DEVICE_PING with sync 0xC8 -> DEVICE_INFO ("RM Ranger", 33 fields)
 *  - chunked PARAM_READ walks the field list ("Link Mode" = Normal/MAVLink)
 *  - PARAM_WRITE flips Link Mode, but ONLY sticks while no receiver is
 *    linked ("link mode cannot be changed when connected"), so the caller
 *    retries until the user unpowers the receiver.
 *  - once MAVLink mode takes effect the USB port stops speaking CRSF
 *    entirely (it becomes a MAVLink port), so a readback timeout right
 *    after writes is itself the success signal for Normal->MAVLink.
 */

import { SerialTransport } from '@ardudeck/comms';
import {
  buildDevicePing,
  buildParamRead,
  buildParamWrite,
  extractCrsfFrames,
  parseDeviceInfo,
  parseParamEntryChunk,
  decodeField,
  CRSF_FRAMETYPE_DEVICE_INFO,
  CRSF_FRAMETYPE_PARAM_ENTRY,
  CRSF_FIELD_TEXT_SELECTION,
  CRSF_FIELD_INFO,
  type CrsfSelectField,
  type CrsfFrame,
} from './crsf-protocol.js';

import {
  ELRS_USB_BAUD,
  type ElrsFieldSummary,
  type ElrsModuleInfo,
  type ElrsSetModeResult,
  type ElrsProgressEvent,
} from '../../shared/link-doctor-types.js';
import { t } from '../../shared/i18n/index.js';

export { ELRS_USB_BAUD };
export type { ElrsFieldSummary, ElrsModuleInfo, ElrsSetModeResult, ElrsProgressEvent };

class CrsfSession {
  private transport: SerialTransport;
  private rx: Uint8Array = new Uint8Array(0);
  private pending: CrsfFrame[] = [];

  constructor(port: string) {
    this.transport = new SerialTransport(port, { baudRate: ELRS_USB_BAUD });
  }

  async open(): Promise<void> {
    await this.transport.open();
    this.transport.on('data', (data: Uint8Array) => {
      const merged = new Uint8Array(this.rx.length + data.length);
      merged.set(this.rx);
      merged.set(data, this.rx.length);
      const { frames, consumed } = extractCrsfFrames(merged);
      this.pending.push(...frames);
      this.rx = merged.slice(consumed);
      // Hard cap so a MAVLink or garbage stream can't grow the tail forever.
      if (this.rx.length > 4096) this.rx = this.rx.slice(-256);
      if (this.pending.length > 512) this.pending.splice(0, this.pending.length - 128);
    });
  }

  async close(): Promise<void> {
    try {
      await this.transport.close();
    } catch {
      // best effort - port may already be gone (module rebooted)
    }
  }

  async write(frame: Uint8Array): Promise<void> {
    await this.transport.write(frame);
  }

  /** Wait for the next frame matching `match`, or null on timeout. */
  async waitFrame(match: (f: CrsfFrame) => boolean, timeoutMs: number): Promise<CrsfFrame | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const idx = this.pending.findIndex(match);
      if (idx >= 0) {
        const [frame] = this.pending.splice(idx, 1);
        return frame!;
      }
      if (Date.now() >= deadline) return null;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

async function readField(session: CrsfSession, index: number): Promise<CrsfSelectField | null> {
  let data = new Uint8Array(0);
  let chunk = 0;
  for (let guard = 0; guard < 10; guard++) {
    await session.write(buildParamRead(index, chunk));
    const frame = await session.waitFrame(
      (f) => f.type === CRSF_FRAMETYPE_PARAM_ENTRY && parseParamEntryChunk(f.body)?.fieldIndex === index,
      500,
    );
    if (!frame) return null;
    const parsed = parseParamEntryChunk(frame.body)!;
    const merged = new Uint8Array(data.length + parsed.data.length);
    merged.set(data);
    merged.set(parsed.data, data.length);
    data = merged;
    if (parsed.chunksRemaining === 0) return decodeField(index, data);
    chunk++;
  }
  return null;
}

function summarize(field: CrsfSelectField): ElrsFieldSummary {
  return {
    index: field.index,
    name: field.name,
    value: field.options[field.value] ?? '',
    options: field.options,
  };
}

/**
 * Detect an ELRS TX module on a serial port. Returns null when nothing
 * answers the CRSF device ping (e.g. the port speaks MAVLink because the
 * module is already in MAVLink link mode, or it's not an ELRS device).
 */
export async function detectElrsModule(port: string): Promise<ElrsModuleInfo | null> {
  const session = new CrsfSession(port);
  await session.open();
  try {
    let info = null;
    for (let attempt = 0; attempt < 3 && !info; attempt++) {
      await session.write(buildDevicePing());
      const frame = await session.waitFrame((f) => f.type === CRSF_FRAMETYPE_DEVICE_INFO, 600);
      if (frame) info = parseDeviceInfo(frame.body);
    }
    if (!info) return null;

    const result: ElrsModuleInfo = {
      name: info.name,
      firmware: null,
      fieldCount: info.fieldCount,
      linkMode: null,
      packetRate: null,
      txPower: null,
    };

    for (let idx = 1; idx <= info.fieldCount; idx++) {
      const field = await readField(session, idx);
      if (!field || field.hidden) continue;
      if (field.type === CRSF_FIELD_TEXT_SELECTION) {
        if (field.name === 'Link Mode') result.linkMode = summarize(field); // i18n-exempt
        else if (field.name === 'Packet Rate') result.packetRate = summarize(field); // i18n-exempt
        else if (field.name === 'Max Power') result.txPower = summarize(field); // i18n-exempt
      } else if (field.type === CRSF_FIELD_INFO && /^\d+\.\d+\.\d+/.test(field.name)) {
        // ELRS exposes its version as a root INFO field named e.g. "4.0.0 ISM2G4"
        result.firmware = field.name;
      }
    }
    return result;
  } finally {
    await session.close();
  }
}

let cancelRequested = false;

export function cancelElrsOperation(): void {
  cancelRequested = true;
}

/**
 * Set the module's Link Mode, retrying until it sticks. ELRS refuses the
 * change while a receiver is linked, so this loops while the UI tells the
 * user to unpower the receiver. Reports progress via `onProgress`.
 */
export async function setElrsLinkMode(
  port: string,
  targetMode: string,
  timeoutMs: number,
  onProgress: (e: ElrsProgressEvent) => void,
): Promise<ElrsSetModeResult> {
  cancelRequested = false;
  const session = new CrsfSession(port);
  await session.open();
  try {
    const fieldIndex = await findLinkModeIndex(session);
    const initial = await readField(session, fieldIndex);
    let lastSeen = initial ? (initial.options[initial.value] ?? 'unknown') : 'unknown';
    if (initial && initial.options[initial.value] === targetMode) {
      return { status: 'confirmed', mode: targetMode };
    }
    const targetIdx = (initial?.options.length ? initial.options : ['Normal', 'MAVLink']).indexOf(targetMode);
    if (targetIdx < 0) return { status: 'timeout', lastSeen };

    const deadline = Date.now() + timeoutMs;
    let attempt = 0;
    let silentReads = 0;
    while (Date.now() < deadline) {
      if (cancelRequested) return { status: 'cancelled' };
      attempt++;
      onProgress({ attempt, currentMode: lastSeen, phase: 'writing' });
      await session.write(buildParamWrite(fieldIndex, targetIdx));
      await new Promise((r) => setTimeout(r, 700));
      onProgress({ attempt, currentMode: lastSeen, phase: 'verifying' });
      const field = await readField(session, fieldIndex);
      if (field) {
        silentReads = 0;
        lastSeen = field.options[field.value] ?? 'unknown';
        if (lastSeen === targetMode) return { status: 'confirmed', mode: targetMode };
      } else {
        // Once MAVLink mode takes effect, the USB port stops answering CRSF
        // reads entirely. Two consecutive silent reads after our writes is
        // the observed success signature for the Normal -> MAVLink switch.
        silentReads++;
        if (targetMode === 'MAVLink' && silentReads >= 2) {
          return {
            status: 'probable',
            mode: targetMode,
            reason: t('main:elrs.switchedToMavlink'),
          };
        }
      }
      await new Promise((r) => setTimeout(r, 800));
    }
    return { status: 'timeout', lastSeen };
  } finally {
    await session.close();
  }
}

async function findLinkModeIndex(session: CrsfSession): Promise<number> {
  await session.write(buildDevicePing());
  const frame = await session.waitFrame((f) => f.type === CRSF_FRAMETYPE_DEVICE_INFO, 800);
  if (!frame) throw new Error(t('main:elrs.noModule'));
  const info = parseDeviceInfo(frame.body);
  if (!info) throw new Error('Malformed DEVICE_INFO from module'); // i18n-exempt
  for (let idx = 1; idx <= info.fieldCount; idx++) {
    const field = await readField(session, idx);
    if (field?.name === 'Link Mode') return field.index; // i18n-exempt
  }
  throw new Error(t('main:elrs.noLinkModeSetting'));
}
