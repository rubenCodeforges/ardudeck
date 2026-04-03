import {
  serializeLogRequestList,
  LOG_REQUEST_LIST_ID,
  LOG_REQUEST_LIST_CRC_EXTRA,
  serializeLogRequestData,
  LOG_REQUEST_DATA_ID,
  LOG_REQUEST_DATA_CRC_EXTRA,
  serializeLogRequestEnd,
  LOG_REQUEST_END_ID,
  LOG_REQUEST_END_CRC_EXTRA,
  deserializeLogEntry,
  deserializeLogData,
  type LogEntry,
} from '@ardudeck/mavlink-ts';

const LOG_TIMEOUT_MS = 3000;
const LOG_MAX_RETRIES = 5;
const LOG_CHUNK_SIZE = 90;
const MSG_LOG_ENTRY = 118;
const MSG_LOG_DATA = 120;

export interface LogListEntry {
  id: number;
  numLogs: number;
  lastLogNum: number;
  timeUtc: number;
  size: number;
}

type SendPacketFn = (msgid: number, payload: Uint8Array, crcExtra: number) => Promise<Uint8Array>;
type WriteTransportFn = (data: Uint8Array) => void;
type LogFn = (level: string, message: string) => void;

export class LogDownloadManager {
  private pendingResolve: ((payload: Uint8Array | null) => void) | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private cancelled = false;

  private logEntries: LogListEntry[] = [];
  private listResolve: ((entries: LogListEntry[]) => void) | null = null;
  private listTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private sendPacket: SendPacketFn,
    private writeTransport: WriteTransportFn,
    private log: LogFn,
    private targetSystem: number = 1,
    private targetComponent: number = 1,
  ) {}

  /** Handle incoming MAVLink messages — route to pending request */
  handleMessage(msgid: number, payload: Uint8Array): void {
    if (msgid === MSG_LOG_ENTRY) {
      this.handleLogEntry(deserializeLogEntry(payload));
    } else if (msgid === MSG_LOG_DATA) {
      this.handleLogData(payload);
    }
  }

  private handleLogEntry(entry: LogEntry): void {
    this.logEntries.push({
      id: entry.id,
      numLogs: entry.numLogs,
      lastLogNum: entry.lastLogNum,
      timeUtc: entry.timeUtc,
      size: entry.size,
    });

    // Reset list timeout on each entry
    if (this.listTimer) {
      clearTimeout(this.listTimer);
      this.listTimer = setTimeout(() => this.resolveList(), LOG_TIMEOUT_MS);
    }

    // If we've received all entries, resolve immediately
    if (entry.id === entry.lastLogNum) {
      this.resolveList();
    }
  }

  private resolveList(): void {
    if (this.listTimer) {
      clearTimeout(this.listTimer);
      this.listTimer = null;
    }
    const resolve = this.listResolve;
    this.listResolve = null;
    const entries = [...this.logEntries];
    this.logEntries = [];
    resolve?.(entries);
  }

  private handleLogData(rawPayload: Uint8Array): void {
    const data = deserializeLogData(rawPayload);
    const bytes = new Uint8Array(data.count);
    for (let i = 0; i < data.count; i++) {
      bytes[i] = data.data[i] ?? 0;
    }

    // Pack offset + count + data for the consumer
    const result = new Uint8Array(8 + bytes.length);
    const view = new DataView(result.buffer);
    view.setUint32(0, data.ofs, true);
    view.setUint32(4, data.count, true);
    result.set(bytes, 8);

    this.resolvePending(result);
  }

  private resolvePending(data: Uint8Array | null): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer);
      this.pendingTimer = null;
    }
    const resolve = this.pendingResolve;
    this.pendingResolve = null;
    resolve?.(data);
  }

  /** Request list of available logs from FC */
  async requestLogList(): Promise<LogListEntry[]> {
    this.logEntries = [];
    this.cancelled = false;

    return new Promise<LogListEntry[]>((resolve) => {
      this.listResolve = resolve;
      this.listTimer = setTimeout(() => this.resolveList(), LOG_TIMEOUT_MS);

      const payload = serializeLogRequestList({
        targetSystem: this.targetSystem,
        targetComponent: this.targetComponent,
        start: 0,
        end: 0xFFFF,
      });
      this.sendPacket(LOG_REQUEST_LIST_ID, payload, LOG_REQUEST_LIST_CRC_EXTRA).then((packet) => {
        this.writeTransport(packet);
        this.log('info', 'Requesting log list from FC');
      });
    });
  }

  /** Download a specific log by ID */
  async downloadLog(
    logId: number,
    logSize: number,
    onProgress: (bytesReceived: number, totalBytes: number) => void,
  ): Promise<Uint8Array | null> {
    this.cancelled = false;
    const fileData = new Uint8Array(logSize);
    let offset = 0;

    this.log('info', `Starting download of log ${logId} (${(logSize / 1024).toFixed(0)} KB)`);

    while (offset < logSize && !this.cancelled) {
      const remaining = logSize - offset;
      const count = Math.min(LOG_CHUNK_SIZE, remaining);
      let received = false;

      for (let retry = 0; retry < LOG_MAX_RETRIES && !received && !this.cancelled; retry++) {
        const chunk = await this.requestChunk(logId, offset, count);
        if (!chunk) {
          this.log('debug', `Log chunk timeout at offset ${offset} (attempt ${retry + 1}/${LOG_MAX_RETRIES})`);
          continue;
        }

        const chunkView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        const respOfs = chunkView.getUint32(0, true);
        const respCount = chunkView.getUint32(4, true);

        if (respCount === 0) {
          this.log('info', `Log ${logId} download complete (end marker at offset ${offset})`);
          await this.sendEndRequest();
          return fileData.subarray(0, offset);
        }

        const data = chunk.subarray(8);
        fileData.set(data.subarray(0, respCount), respOfs);
        offset = respOfs + respCount;
        received = true;
        onProgress(offset, logSize);
      }

      if (!received && !this.cancelled) {
        this.log('error', `Failed to download log ${logId} at offset ${offset} after ${LOG_MAX_RETRIES} retries`);
        await this.sendEndRequest();
        return null;
      }
    }

    await this.sendEndRequest();

    if (this.cancelled) {
      this.log('info', `Log ${logId} download cancelled`);
      return null;
    }

    return fileData;
  }

  /** Cancel an in-progress download */
  cancel(): void {
    this.cancelled = true;
    this.resolvePending(null);
    this.resolveList();
  }

  private requestChunk(logId: number, offset: number, count: number): Promise<Uint8Array | null> {
    return new Promise<Uint8Array | null>((resolve) => {
      this.pendingResolve = resolve;
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        const r = this.pendingResolve;
        this.pendingResolve = null;
        r?.(null);
      }, LOG_TIMEOUT_MS);

      const payload = serializeLogRequestData({
        targetSystem: this.targetSystem,
        targetComponent: this.targetComponent,
        id: logId,
        ofs: offset,
        count,
      });
      this.sendPacket(LOG_REQUEST_DATA_ID, payload, LOG_REQUEST_DATA_CRC_EXTRA).then((packet) => {
        this.writeTransport(packet);
      });
    });
  }

  private async sendEndRequest(): Promise<void> {
    const payload = serializeLogRequestEnd({
      targetSystem: 1,
      targetComponent: 1,
    });
    const packet = await this.sendPacket(LOG_REQUEST_END_ID, payload, LOG_REQUEST_END_CRC_EXTRA);
    this.writeTransport(packet);
  }
}
