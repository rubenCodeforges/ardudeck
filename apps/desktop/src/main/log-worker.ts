import { parentPort } from 'node:worker_threads';
import { createDataFlashParser, runHealthChecks } from '@ardudeck/dataflash-parser';

if (!parentPort) {
  throw new Error('log-worker must be run as a worker thread');
}

parentPort.on('message', (msg: { type: string; data: Uint8Array }) => {
  if (msg.type === 'parse') {
    try {
      const parser = createDataFlashParser();
      const buffer = new Uint8Array(msg.data);
      const totalBytes = buffer.length;

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

      const serialized = {
        formats,
        messages,
        metadata: log.metadata,
        timeRange: log.timeRange,
        messageTypes: log.messageTypes,
      };

      // Run health checks while we have the parsed log with Maps
      const healthResults = runHealthChecks(log);

      parentPort!.postMessage({ type: 'complete', log: serialized, healthResults });
    } catch (error) {
      parentPort!.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
});
