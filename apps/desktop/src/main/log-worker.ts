import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createDataFlashParser, HEALTH_CHECK_TYPES, runHealthChecks } from '@ardudeck/dataflash-parser';
import { createUlogParser, runPx4HealthChecks } from '@ardudeck/ulog-parser';
import { extractFlightSummary, SUMMARY_LOG_TYPES, type LogLike, type HealthLike } from './logs/fleet-log-summary.js';

if (!parentPort) {
  throw new Error('log-worker must be run as a worker thread');
}

// Detect log format from the leading magic bytes. ULog files start with the
// ASCII bytes 'U','L','o','g' (0x55 0x4C 0x6F 0x67). Everything else defaults
// to dataflash so any non-ULog file behaves exactly as before.
function detectLogFormat(buf: Uint8Array): 'dataflash' | 'ulog' {
  if (buf.length >= 4 && buf[0] === 0x55 && buf[1] === 0x4c && buf[2] === 0x6f && buf[3] === 0x67) {
    return 'ulog';
  }
  return 'dataflash';
}

interface Columns {
  count: number;
  timeUs: Float64Array;
  num: Record<string, Float64Array>;
  txt: Record<string, string[]>;
}

/** One typed array per numeric field; strings stay arrays (MSG text, modes). */
function toColumns(msgs: Array<{ timeUs: number; fields: Record<string, number | string> }>): Columns {
  const count = msgs.length;
  const timeUs = new Float64Array(count);
  const num: Record<string, Float64Array> = {};
  const txt: Record<string, string[]> = {};
  if (count === 0) return { count, timeUs, num, txt };

  // Dataflash and ULog both fix a type's schema, so the first message names the
  // fields; anything that appears later lands in whichever kind it matches.
  for (const [name, value] of Object.entries(msgs[0]!.fields)) {
    if (typeof value === 'number') num[name] = new Float64Array(count);
    else txt[name] = new Array<string>(count);
  }
  const numNames = Object.keys(num);
  const txtNames = Object.keys(txt);
  for (let i = 0; i < count; i++) {
    const m = msgs[i]!;
    timeUs[i] = m.timeUs;
    for (const name of numNames) {
      const v = m.fields[name];
      num[name]![i] = typeof v === 'number' ? v : Number.NaN;
    }
    for (const name of txtNames) {
      const v = m.fields[name];
      txt[name]![i] = typeof v === 'string' ? v : v === undefined ? '' : String(v);
    }
  }
  return { count, timeUs, num, txt };
}

interface ParseRequest {
  type: 'parse';
  /** Path to read here, so the file bytes never cross a thread boundary. */
  filePath?: string;
  /** Pre-read bytes (kept for callers that already hold the buffer). */
  data?: Uint8Array;
  /** Name shown in the fleet history entry. */
  fileName?: string;
}

function handleParse(msg: ParseRequest): void {
    try {
      const buffer = msg.filePath ? new Uint8Array(readFileSync(msg.filePath)) : new Uint8Array(msg.data ?? []);
      const totalBytes = buffer.length;
      const logFormat = detectLogFormat(buffer);
      // Dataflash builds columns while parsing: one object per record for a whole
      // flight runs into V8's 4 GB heap cap. Rows stay only for what the checks and summary read.
      const parser = logFormat === 'ulog'
        ? createUlogParser()
        : createDataFlashParser({ columnar: true, keepRows: new Set([...HEALTH_CHECK_TYPES, ...SUMMARY_LOG_TYPES]) });

      // Feed in chunks to report progress
      const CHUNK_SIZE = 256 * 1024;
      for (let offset = 0; offset < totalBytes; offset += CHUNK_SIZE) {
        const end = Math.min(offset + CHUNK_SIZE, totalBytes);
        parser.feed(buffer.subarray(offset, end));
        parentPort!.postMessage({
          type: 'progress',
          bytesConsumed: end,
          totalBytes,
        });
      }

      const log = parser.finalize();

      // Serialize Maps to plain objects for structured clone
      const formats: Record<number, unknown> = {};
      for (const [k, v] of log.formats) formats[k] = v;
      // Columns, not objects: a big log is millions of messages, and one object
      // each is gigabytes of heap that the renderer then stalls on cloning.
      const messages: Record<string, Columns> = {};
      const transfer: ArrayBuffer[] = [];
      const built = 'columns' in log && log.columns instanceof Map ? log.columns : null;
      for (const [k, v] of built ?? log.messages) {
        const cols = built ? (v as Columns) : toColumns(v as Parameters<typeof toColumns>[0]);
        messages[k] = cols;
        transfer.push(cols.timeUs.buffer as ArrayBuffer);
        for (const col of Object.values(cols.num)) transfer.push(col.buffer as ArrayBuffer);
      }

      // Maps don't structured-clone cheaply across worker boundary; convert
      // unitLabels / multValues to plain objects keyed by char. Guard against
      // a stale parser dist (these were added after the last build) — falling
      // back to empty maps keeps log loading working regardless.
      const unitLabels: Record<string, string> = {};
      if (log.unitLabels instanceof Map) {
        for (const [k, v] of log.unitLabels) unitLabels[k] = v;
      }
      const multValues: Record<string, number> = {};
      if (log.multValues instanceof Map) {
        for (const [k, v] of log.multValues) multValues[k] = v;
      }

      const serialized = {
        format: log.format,
        formats,
        messages,
        metadata: log.metadata,
        timeRange: log.timeRange,
        messageTypes: log.messageTypes,
        unitLabels,
        multValues,
      };

      // Run health checks while we have the parsed log with Maps
      const healthResults = logFormat === 'ulog' ? runPx4HealthChecks(log) : runHealthChecks(log);

      // Fleet Forensics summary, here rather than in main: it walks the whole
      // decoded log, which is exactly the work that must stay off that thread.
      let summary: unknown = null;
      if (msg.filePath) {
        try {
          let mtimeMs = Date.now();
          try { mtimeMs = statSync(msg.filePath).mtimeMs; } catch { /* keep now */ }
          summary = extractFlightSummary({
            log: log as unknown as LogLike,
            health: healthResults as unknown as HealthLike[],
            path: msg.filePath,
            fileName: msg.fileName ?? msg.filePath.split(/[\\/]/).pop() ?? msg.filePath,
            fileMtimeMs: mtimeMs,
            flightId: randomUUID(),
          });
        } catch {
          // A summary failure must never cost the operator the log itself.
        }
      }

      parentPort!.postMessage({ type: 'complete', log: serialized, healthResults, summary }, transfer);
    } catch (error) {
      parentPort!.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
}

// Either a request is handed over at construction (workerData) or posted later.
if (workerData && (workerData as ParseRequest).type === 'parse') {
  handleParse(workerData as ParseRequest);
}
parentPort.on('message', (msg: ParseRequest) => {
  if (msg.type === 'parse') handleParse(msg);
});
