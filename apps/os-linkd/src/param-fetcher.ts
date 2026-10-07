import {
  type MAVLinkPacket,
  PARAM_VALUE_ID, deserializeParamValue,
  PARAM_REQUEST_LIST_ID, PARAM_REQUEST_LIST_CRC_EXTRA, serializeParamRequestList,
  PARAM_REQUEST_READ_ID, PARAM_REQUEST_READ_CRC_EXTRA, serializeParamRequestRead,
  FILE_TRANSFER_PROTOCOL_ID, FILE_TRANSFER_PROTOCOL_CRC_EXTRA, serializeFileTransferProtocol,
} from '@ardudeck/mavlink-ts';
import { MavlinkFtpClient, parseParamPack, PARAM_PCK_PATH } from '@ardudeck/vehicle-core';
import type { CachedParam, ParamCache } from './param-cache.js';
import type { VehicleState } from './vehicle-state.js';

export type SendFn = (msgid: number, payload: Uint8Array, crcExtra: number) => Promise<void>;
export type LogFn = (level: 'info' | 'warn' | 'error' | 'debug', message: string) => void;

export type FetchStatus = 'idle' | 'ftp' | 'list' | 'complete' | 'failed';

/** Quiet time after which the streamed download switches to gap-fill (ELRS can stall for seconds). */
const LIST_INACTIVITY_MS = 5000;
/** Same pacing the desktop app uses so radio uplink FIFOs don't overflow. */
const GAP_CHUNK = 20;
const GAP_SEND_GAP_MS = 30;
const GAP_ROUND_MS = 4000;
const MAX_STALLED_ROUNDS = 6;
const FTP_TARGET_COMPONENT = 1; // MAV_COMP_ID_AUTOPILOT1

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Downloads a vehicle's full parameter set into the cache: MAVFTP param.pck
 * first (ArduPilot over MAVLink 2), PARAM_REQUEST_LIST with gap-fill
 * otherwise. Mirrors the desktop app's requestParamsViaFtp /
 * requestParamsTraditional strategy. PARAM_VALUE traffic is always applied to
 * the cache, whoever asked for it.
 */
export class ParamFetcher {
  status: FetchStatus = 'idle';
  progress = { received: 0, total: 0 };
  lastError: string | null = null;

  private ftp: MavlinkFtpClient | null = null;
  private listParams: Map<number, CachedParam> | null = null;
  private listTotal = 0;
  private lastListActivity = 0;
  private aborted = false;

  constructor(
    private readonly cache: ParamCache,
    private readonly send: SendFn,
    private readonly ownCompid: number,
    private readonly log: LogFn,
  ) {}

  get busy(): boolean {
    return this.status === 'ftp' || this.status === 'list';
  }

  /** Feed every parsed packet from the vehicle. */
  handlePacket(packet: MAVLinkPacket, vehicle: VehicleState | null): void {
    if (!vehicle || packet.sysid !== vehicle.sysid) return;

    if (packet.msgid === FILE_TRANSFER_PROTOCOL_ID && this.ftp) {
      // payload: targetNetwork, targetSystem, targetComponent, then 251 FTP bytes.
      // Only take replies addressed to us; the desktop app may be running its own session.
      if (packet.payload[2] === this.ownCompid) this.ftp.handleResponse(packet.payload.subarray(3, 254));
      return;
    }

    if (packet.msgid === PARAM_VALUE_ID) {
      const pv = deserializeParamValue(packet.payload);
      this.cache.applyValue(vehicle.uid, { ...pv }, vehicle.firmwareVersion);
      if (this.listParams && pv.paramIndex !== 0xffff) {
        this.listTotal = pv.paramCount;
        this.listParams.set(pv.paramIndex, {
          paramId: pv.paramId, paramValue: pv.paramValue, paramType: pv.paramType, paramIndex: pv.paramIndex,
        });
        this.lastListActivity = Date.now();
        this.progress = { received: this.listParams.size, total: this.listTotal };
      }
    }
  }

  async fetch(vehicle: VehicleState): Promise<boolean> {
    if (this.busy) return false;
    this.aborted = false;
    this.lastError = null;
    const started = Date.now();
    try {
      if (vehicle.mavlinkVersion === 2 && vehicle.firmware === 'ardupilot') {
        this.status = 'ftp';
        if (await this.fetchViaFtp(vehicle)) {
          this.status = 'complete';
          this.log('info', `params: ${this.progress.total} via MAVFTP in ${((Date.now() - started) / 1000).toFixed(1)}s`);
          return true;
        }
        if (this.aborted) throw new Error('aborted');
        this.log('warn', 'params: MAVFTP unavailable, falling back to PARAM_REQUEST_LIST');
      }
      this.status = 'list';
      if (await this.fetchViaList(vehicle)) {
        this.status = 'complete';
        this.log('info', `params: ${this.progress.total} via PARAM_REQUEST_LIST in ${((Date.now() - started) / 1000).toFixed(1)}s`);
        return true;
      }
      throw new Error(this.aborted ? 'aborted' : 'download stalled');
    } catch (err) {
      this.status = 'failed';
      this.lastError = err instanceof Error ? err.message : String(err);
      this.log('warn', `params: download failed (${this.lastError})`);
      return false;
    } finally {
      this.ftp = null;
      this.listParams = null;
    }
  }

  /** Stop an in-flight download (vehicle armed or link lost). */
  abort(): void {
    this.aborted = true;
  }

  private async fetchViaFtp(vehicle: VehicleState): Promise<boolean> {
    this.ftp = new MavlinkFtpClient({
      sendPacket: async (ftpPayload: Uint8Array) => {
        const msg = serializeFileTransferProtocol({
          targetNetwork: 0,
          targetSystem: vehicle.sysid,
          targetComponent: FTP_TARGET_COMPONENT,
          payload: Array.from(ftpPayload),
        });
        await this.send(FILE_TRANSFER_PROTOCOL_ID, msg, FILE_TRANSFER_PROTOCOL_CRC_EXTRA);
      },
      log: (level, message) => this.log(level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'debug', `ftp: ${message}`),
    });
    let data: Uint8Array | null;
    try {
      data = await this.ftp.downloadFile(PARAM_PCK_PATH);
    } catch {
      return false;
    }
    if (!data || data.length === 0) return false;
    const result = parseParamPack(data);
    // A truncated pck parses cleanly up to the cut; treat it as a failure (same rule as the app).
    if (!result || !result.complete || result.params.length < result.totalParams) return false;
    const params: CachedParam[] = result.params.map((p, i) => ({
      paramId: p.name, paramValue: p.value, paramType: p.type, paramIndex: i, defaultValue: p.defaultValue,
    }));
    this.cache.replaceAll(vehicle.uid, params, result.totalParams, 'ftp', vehicle.firmwareVersion);
    this.progress = { received: params.length, total: result.totalParams };
    return true;
  }

  private async fetchViaList(vehicle: VehicleState): Promise<boolean> {
    this.listParams = new Map();
    this.listTotal = 0;
    this.lastListActivity = Date.now();
    await this.send(PARAM_REQUEST_LIST_ID,
      serializeParamRequestList({ targetSystem: vehicle.sysid, targetComponent: 1 }),
      PARAM_REQUEST_LIST_CRC_EXTRA);

    // Let the stream run until it goes quiet.
    while (!this.aborted && Date.now() - this.lastListActivity < LIST_INACTIVITY_MS) {
      if (this.listTotal > 0 && this.listParams.size >= this.listTotal) break;
      await sleep(250);
    }

    // Gap-fill whatever the stream dropped.
    let stalled = 0;
    while (!this.aborted && this.listTotal > 0 && this.listParams.size < this.listTotal && stalled < MAX_STALLED_ROUNDS) {
      const before = this.listParams.size;
      const missing: number[] = [];
      for (let i = 0; i < this.listTotal && missing.length < GAP_CHUNK; i++) {
        if (!this.listParams.has(i)) missing.push(i);
      }
      for (const idx of missing) {
        if (this.aborted) break;
        await this.send(PARAM_REQUEST_READ_ID,
          serializeParamRequestRead({ targetSystem: vehicle.sysid, targetComponent: 1, paramId: '', paramIndex: idx }),
          PARAM_REQUEST_READ_CRC_EXTRA);
        await sleep(GAP_SEND_GAP_MS);
      }
      const roundEnd = Date.now() + GAP_ROUND_MS;
      while (!this.aborted && Date.now() < roundEnd && this.listParams.size < before + missing.length) await sleep(100);
      stalled = this.listParams.size > before ? 0 : stalled + 1;
    }

    if (this.aborted || this.listTotal === 0 || this.listParams.size < this.listTotal) return false;
    const params = [...this.listParams.values()].sort((a, b) => a.paramIndex - b.paramIndex);
    this.cache.replaceAll(vehicle.uid, params, this.listTotal, 'list', vehicle.firmwareVersion);
    return true;
  }
}
