import { parentPort } from 'node:worker_threads';
import { createDataFlashParser, runHealthChecks } from '@ardudeck/dataflash-parser';
import { createUlogParser, runPx4HealthChecks } from '@ardudeck/ulog-parser';

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

parentPort.on('message', (msg: { type: string; data: Uint8Array }) => {
  if (msg.type === 'parse') {
    try {
      const buffer = new Uint8Array(msg.data);
      const totalBytes = buffer.length;
      const logFormat = detectLogFormat(buffer);
      const parser = logFormat === 'ulog' ? createUlogParser() : createDataFlashParser();

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
      const messages: Record<string, unknown> = {};
      for (const [k, v] of log.messages) messages[k] = v;

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

      parentPort!.postMessage({ type: 'complete', log: serialized, healthResults });
    } catch (error) {
      parentPort!.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});
