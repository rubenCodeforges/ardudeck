#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { loadConfig } from './config.js';
import { LinkService } from './link-service.js';
import { createApi } from './api.js';
import type { LogFn } from './param-fetcher.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
const verbose = process.env.ARDUDECK_LINKD_DEBUG === '1';

const log: LogFn = (level, message) => {
  if (level === 'debug' && !verbose) return;
  // journald adds timestamps; keep lines short and greppable.
  console.log(`${level}: ${message}`);
};

async function main(): Promise<void> {
  const config = loadConfig();
  const link = new LinkService(config, log);
  await link.start();

  const api = createApi(link, pkg.version, undefined, log);
  await new Promise<void>((resolve) => api.listen(config.apiPort, '127.0.0.1', resolve));
  log('info', `api http://127.0.0.1:${config.apiPort}/v1/info`);

  const shutdown = async () => {
    api.close();
    await link.stop();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());
}

main().catch((err) => {
  console.error(`fatal: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
