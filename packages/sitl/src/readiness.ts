import type { Readable } from 'node:stream';

const SERIAL0_ANNOUNCE = /\bSERIAL0 on TCP port \d+/;

type Stream = Readable | null | undefined;

// Never probes the port (Cygwin SITL exits on a SERIAL0 disconnect); native SITL announces on stderr.
export function waitForSerial0Announce(streams: Stream[], timeoutMs: number): Promise<boolean> {
  const live = streams.filter((s): s is Readable => !!s);
  if (live.length === 0) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    let open = live.length;
    const detach: Array<() => void> = [];
    const finish = (ready: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      // Only detach: pausing a stream would stall the log reader and block SITL on a full pipe.
      for (const off of detach) off();
      resolve(ready);
    };
    for (const stream of live) {
      let pending = '';
      const onData = (chunk: Buffer | string) => {
        pending += chunk.toString();
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? '';
        if (lines.some((line) => SERIAL0_ANNOUNCE.test(line))) finish(true);
        else if (pending.length > 4096) pending = pending.slice(-256);
      };
      const onClose = () => { if (--open === 0) finish(false); };
      stream.on('data', onData);
      stream.on('close', onClose);
      detach.push(() => { stream.off('data', onData); stream.off('close', onClose); });
    }
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}
