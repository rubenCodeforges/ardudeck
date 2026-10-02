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
  serializeLogErase,
  LOG_ERASE_ID,
  LOG_ERASE_CRC_EXTRA,
  serializeCommandLong,
  COMMAND_LONG_ID,
  COMMAND_LONG_CRC_EXTRA,
  deserializeLogEntry,
  deserializeLogData,
  deserializeStorageInformation,
  STORAGE_INFORMATION_ID,
  type LogEntry,
} from '@ardudeck/mavlink-ts';

/** Total wait for the FIRST chunk of a burst - FC may need a moment to start. */
const LOG_TIMEOUT_MS = 5000;
/**
 * Inter-chunk inactivity timeout once a burst has started streaming. The FC
 * sends LOG_DATA packets back-to-back at sub-millisecond intervals on TCP/USB,
 * so 300 ms of silence reliably means "this burst is done" without burning
 * 5 s of pure waiting at the end of every burst. The previous behaviour was
 * the dominant cost of a multi-MB log download.
 */
const LOG_BURST_INACTIVITY_MS = 80;
const LOG_MAX_RETRIES = 10;
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

  private storageResolve: ((info: { totalBytes: number; usedBytes: number; availableBytes: number } | null) => void) | null = null;
  private storageTimer: ReturnType<typeof setTimeout> | null = null;

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
    } else if (msgid === STORAGE_INFORMATION_ID) {
      this.handleStorageInformation(payload);
    }
  }

  /** LOG_ERASE has no reply; re-request the log list to confirm. */
  async eraseAllLogs(): Promise<void> {
    const payload = serializeLogErase({
      targetSystem: this.targetSystem,
      targetComponent: this.targetComponent,
    });
    const packet = await this.sendPacket(LOG_ERASE_ID, payload, LOG_ERASE_CRC_EXTRA);
    await this.writeTransport(packet);
    this.log('warn', 'LOG_ERASE sent: erasing all logs on the vehicle SD card');
  }

  /** MAV_CMD_STORAGE_FORMAT reformats the SD card. param1=1 format, param2=1 reset. */
  async formatStorage(): Promise<void> {
    const MAV_CMD_STORAGE_FORMAT = 526;
    const payload = serializeCommandLong({
      targetSystem: this.targetSystem,
      targetComponent: this.targetComponent,
      command: MAV_CMD_STORAGE_FORMAT,
      confirmation: 0,
      param1: 1, param2: 1, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
    });
    const packet = await this.sendPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA);
    await this.writeTransport(packet);
    this.log('warn', 'STORAGE_FORMAT sent: reformatting the vehicle SD card');
  }

  /** null = firmware never answered; message capacities are MiB, returned as bytes. */
  async requestStorageInfo(): Promise<{ totalBytes: number; usedBytes: number; availableBytes: number } | null> {
    const MAV_CMD_REQUEST_MESSAGE = 512;
    const payload = serializeCommandLong({
      targetSystem: this.targetSystem,
      targetComponent: this.targetComponent,
      command: MAV_CMD_REQUEST_MESSAGE,
      confirmation: 0,
      param1: STORAGE_INFORMATION_ID,
      param2: 0, param3: 0, param4: 0, param5: 0, param6: 0, param7: 0,
    });
    return new Promise((resolve) => {
      this.storageResolve = resolve;
      this.storageTimer = setTimeout(() => this.resolveStorage(null), 3000);
      this.sendPacket(COMMAND_LONG_ID, payload, COMMAND_LONG_CRC_EXTRA).then(async (packet) => {
        await this.writeTransport(packet);
      }).catch(() => this.resolveStorage(null));
    });
  }

  private handleStorageInformation(payload: Uint8Array): void {
    if (!this.storageResolve) return;
    const info = deserializeStorageInformation(payload);
    const MIB = 1024 * 1024;
    this.resolveStorage({
      totalBytes: info.totalCapacity * MIB,
      usedBytes: info.usedCapacity * MIB,
      availableBytes: info.availableCapacity * MIB,
    });
  }

  private resolveStorage(
    value: { totalBytes: number; usedBytes: number; availableBytes: number } | null,
  ): void {
    if (this.storageTimer) {
      clearTimeout(this.storageTimer);
      this.storageTimer = null;
    }
    const resolve = this.storageResolve;
    this.storageResolve = null;
    resolve?.(value);
  }

  private handleLogEntry(entry: LogEntry): void {
    this.log('info', `LOG_ENTRY received: id=${entry.id} numLogs=${entry.numLogs} lastLogNum=${entry.lastLogNum} size=${entry.size}`);
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
    this.log('info', `Log list resolved: ${entries.length} entries${entries.length === 0 ? ' (timeout with no response from FC)' : ''}`);
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
      this.sendPacket(LOG_REQUEST_LIST_ID, payload, LOG_REQUEST_LIST_CRC_EXTRA).then(async (packet) => {
        await this.writeTransport(packet);
        this.log('info', 'Requesting log list from FC'); // i18n-exempt
      }).catch((err) => {
        this.log('error', `Failed to send log list request: ${err instanceof Error ? err.message : JSON.stringify(err)}`);
      });
    });
  }

  /** Download a specific log by ID using burst/streaming mode */
  async downloadLog(
    logId: number,
    logSize: number,
    onProgress: (bytesReceived: number, totalBytes: number) => void,
  ): Promise<Uint8Array | null> {
    this.cancelled = false;
    const fileData = new Uint8Array(logSize);
    const received = new Uint8Array(Math.ceil(logSize / LOG_CHUNK_SIZE)); // track which chunks arrived
    let highestOffset = 0;

    this.log('info', `Starting download of log ${logId} (${(logSize / 1024).toFixed(0)} KB)`);

    // Burst mode: request a large range, FC streams LOG_DATA packets back
    // We collect them and re-request any gaps.
    //
    // LOG_MAX_RETRIES caps consecutive *failed* bursts (no new bytes received),
    // not the total number of bursts. A 1+ MB log needs many bursts to cover
    // its full extent - counting each burst as a retry would truncate at
    // LOG_MAX_RETRIES * burstCount bytes (~180 KB at the defaults).
    let consecutiveFailedBursts = 0;
    let lastAttemptHighest = 0;
    for (let attempt = 0; consecutiveFailedBursts < LOG_MAX_RETRIES && !this.cancelled; attempt++) {
      // Find first missing chunk
      let requestOffset = 0;
      for (let i = 0; i < received.length; i++) {
        if (!received[i]) {
          requestOffset = i * LOG_CHUNK_SIZE;
          break;
        }
        if (i === received.length - 1) {
          // All chunks received
          await this.sendEndRequest();
          return fileData.subarray(0, highestOffset);
        }
      }

      // Request from the gap to end - FC will stream data back
      const remaining = logSize - requestOffset;
      const burstCount = Math.min(remaining, LOG_CHUNK_SIZE * 1000); // request up to ~90KB at a time

      this.log('debug', `Requesting log data: offset=${requestOffset} count=${burstCount} (attempt ${attempt + 1})`);

      // Send the request
      const payload = serializeLogRequestData({
        targetSystem: this.targetSystem,
        targetComponent: this.targetComponent,
        id: logId,
        ofs: requestOffset,
        count: burstCount,
      });
      const packet = await this.sendPacket(LOG_REQUEST_DATA_ID, payload, LOG_REQUEST_DATA_CRC_EXTRA);
      this.writeTransport(packet);

      // Collect streamed responses. Use the long timeout for the FIRST chunk
      // (FC may need a moment to start), then switch to the short inactivity
      // timeout - back-to-back chunks arrive in microseconds, so any gap >
      // LOG_BURST_INACTIVITY_MS reliably means the burst is finished.
      // We also exit immediately once we've received all the bytes we asked
      // for, sidestepping the inactivity wait entirely on a clean burst.
      const burstEndOffset = requestOffset + burstCount;
      let endOfLog = false;
      let firstChunk = true;

      while (!this.cancelled && !endOfLog) {
        const waitMs = firstChunk ? LOG_TIMEOUT_MS : LOG_BURST_INACTIVITY_MS;
        const chunk = await this.waitForData(waitMs);
        if (!chunk) break; // inactivity → burst done (or FC unresponsive)
        firstChunk = false;

        const chunkView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
        const respOfs = chunkView.getUint32(0, true);
        const respCount = chunkView.getUint32(4, true);

        if (respCount === 0) {
          endOfLog = true;
          break;
        }

        const data = chunk.subarray(8);
        fileData.set(data.subarray(0, respCount), respOfs);

        // Mark chunk as received
        const chunkIdx = Math.floor(respOfs / LOG_CHUNK_SIZE);
        if (chunkIdx < received.length) received[chunkIdx] = 1;

        if (respOfs + respCount > highestOffset) {
          highestOffset = respOfs + respCount;
        }

        onProgress(highestOffset, logSize);

        // We got everything we asked for in this burst - request the next
        // range immediately rather than waiting LOG_BURST_INACTIVITY_MS for
        // a packet that won't arrive.
        if (highestOffset >= burstEndOffset || highestOffset >= logSize) {
          break;
        }
      }

      if (endOfLog) {
        this.log('info', `Log ${logId} download complete (end marker)`);
        await this.sendEndRequest();
        return fileData.subarray(0, highestOffset);
      }

      // Check if we got everything
      if (highestOffset >= logSize) {
        await this.sendEndRequest();
        return fileData.subarray(0, highestOffset);
      }

      // Track progress between bursts. Failed = no new bytes received this
      // attempt. Successful bursts reset the consecutive-failure counter so
      // we keep going until either the log ends or we genuinely stall out.
      if (highestOffset > lastAttemptHighest) {
        consecutiveFailedBursts = 0;
        lastAttemptHighest = highestOffset;
      } else {
        consecutiveFailedBursts++;
        this.log('debug', `Log ${logId} burst ${attempt + 1} made no progress (${consecutiveFailedBursts}/${LOG_MAX_RETRIES} consecutive failures)`);
      }
    }

    if (this.cancelled) {
      await this.sendEndRequest();
      this.log('info', `Log ${logId} download cancelled`);
      return null;
    }

    // Partial download - return what we got if we have something
    if (highestOffset > 0) {
      this.log('warn', `Log ${logId} partially downloaded: ${highestOffset}/${logSize} bytes`);
      await this.sendEndRequest();
      return fileData.subarray(0, highestOffset);
    }

    this.log('error', `Failed to download log ${logId} after ${LOG_MAX_RETRIES} attempts`);
    await this.sendEndRequest();
    return null;
  }

  /** Wait for a single LOG_DATA response */
  private waitForData(timeoutMs: number): Promise<Uint8Array | null> {
    return new Promise<Uint8Array | null>((resolve) => {
      this.pendingResolve = resolve;
      this.pendingTimer = setTimeout(() => {
        this.pendingTimer = null;
        const r = this.pendingResolve;
        this.pendingResolve = null;
        r?.(null);
      }, timeoutMs);
    });
  }

  /** Cancel an in-progress download */
  cancel(): void {
    this.cancelled = true;
    this.resolvePending(null);
    this.resolveList();
  }

  private async sendEndRequest(): Promise<void> {
    const payload = serializeLogRequestEnd({
      targetSystem: this.targetSystem,
      targetComponent: this.targetComponent,
    });
    const packet = await this.sendPacket(LOG_REQUEST_END_ID, payload, LOG_REQUEST_END_CRC_EXTRA);
    this.writeTransport(packet);
  }
}
