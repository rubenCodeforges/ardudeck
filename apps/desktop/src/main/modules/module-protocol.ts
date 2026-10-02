/**
 * Registers `ardudeck-module://<slug>/<path>` as a privileged protocol so
 * the renderer can dynamic-import module bundles without hitting Electron's
 * webSecurity restrictions around file:// URLs.
 *
 * Example: `ardudeck-module://ardudeck.internal.assistant/renderer.js`
 * resolves to
 * `<userData>/modules/ardudeck.internal.assistant/extracted/renderer.js`.
 */

import { protocol, app, net } from 'electron';
import { getDevModulePath } from './module-dev.js';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';

export const MODULE_SCHEME = 'ardudeck-module';

export function registerModuleSchemePrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MODULE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

export function setupModuleProtocol(): void {
  protocol.handle(MODULE_SCHEME, (request) => {
    try {
      const url = new URL(request.url);
      const slug = url.hostname;
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');

      if (!slug || /[\0]/.test(slug) || slug.includes('..')) {
        return new Response('Invalid module slug', { status: 400 }); // i18n-exempt
      }

      const devPath = getDevModulePath(slug);
      const baseDir = devPath
        ? resolve(devPath)
        : resolve(app.getPath('userData'), 'modules', slug, 'extracted');
      const target = resolve(baseDir, rel);
      if (!target.startsWith(baseDir)) {
        return new Response('Path traversal rejected', { status: 403 }); // i18n-exempt
      }

      return net.fetch(pathToFileURL(target).href);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(`Protocol error: ${msg}`, { status: 500 });
    }
  });
}
