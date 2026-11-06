import { net, protocol, type CustomScheme } from 'electron';
import { existsSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ASSET_SCHEME } from '../../shared/tile-source-types.js';
import { sceneMeshByKey } from './scene-mesh-registry.js';
import { resolveMeshAssetPath } from './mesh-asset-path.js';

export const ASSET_SCHEME_PRIVILEGES: CustomScheme = {
  scheme: ASSET_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
};

/** ardudeck-asset://mesh/<key>/<file> streams a registered mesh and the files beside it. Nothing else resolves. */
export function setupAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const url = new URL(request.url);
    if (url.hostname !== 'mesh') return new Response(null, { status: 404 });
    const hit = resolveMeshAssetPath(url.pathname, sceneMeshByKey);
    if (!hit || !existsSync(hit.path) || !statSync(hit.path).isFile()) return new Response(null, { status: 404 });
    const res = await net.fetch(pathToFileURL(hit.path).href);
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': hit.contentType } });
  });
}
