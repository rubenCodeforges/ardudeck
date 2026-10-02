import { t } from '../../shared/i18n/index.js';
export const WFB_RX_TAG = 'wfb-rx-v0.1.0';
const RELEASE_BASE = 'https://github.com/rubenCodeforges/ardudeck/releases/download';

// Must match the matrix in .github/workflows/build-wfb-rx.yml.
const PUBLISHED: Record<string, readonly string[]> = {
  darwin: ['arm64', 'x64'],
  linux: ['x64'],
  win32: ['x64'],
};

const PLATFORM_LABEL: Record<string, string> = { darwin: 'macOS', linux: 'Linux', win32: 'Windows' };


export class HttpStatusError extends Error {
  constructor(readonly status: number, readonly url: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = 'HttpStatusError';
  }
}

/** Same arch folding as the other media downloads: anything not arm64 is x64. */
function archToken(arch: string): 'arm64' | 'x64' {
  return arch === 'arm64' ? 'arm64' : 'x64';
}

export function wfbRxAssetName(platform: string, arch: string): string {
  return `ardudeck-wfb-rx-${platform}-${archToken(arch)}${platform === 'win32' ? '.exe' : ''}`;
}

export function wfbRxAssetUrl(platform: string, arch: string): string {
  return `${RELEASE_BASE}/${WFB_RX_TAG}/${wfbRxAssetName(platform, arch)}`;
}

export function isWfbRxBuiltFor(platform: string, arch: string): boolean {
  return PUBLISHED[platform]?.includes(archToken(arch)) ?? false;
}

function platformLabel(platform: string, arch: string): string {
  return `${PLATFORM_LABEL[platform] ?? platform} (${archToken(arch)})`;
}

export function wfbRxNotBuiltMessage(platform: string, arch: string): string {
  return t('main:wfbng.receiverNotBuilt', { platform: platformLabel(platform, arch) });
}

/** Stream start without the receiver on disk: say whether Install can fix it. */
export function wfbRxMissingMessage(platform: string, arch: string): string {
  if (!isWfbRxBuiltFor(platform, arch)) return wfbRxNotBuiltMessage(platform, arch);
  return t('main:wfbng.receiverNotInstalled', { asset: wfbRxAssetName(platform, arch) });
}

/** Turn a failed receiver download into a sentence naming what is missing. */
export function describeWfbRxDownloadError(err: unknown, platform: string, arch: string): string {
  const asset = wfbRxAssetName(platform, arch);
  if (err instanceof HttpStatusError && err.status === 404) {
    return t('main:wfbng.receiverNotPublished', { platform: platformLabel(platform, arch), tag: WFB_RX_TAG, asset });
  }
  const reason = err instanceof HttpStatusError ? `HTTP ${err.status}` : err instanceof Error ? err.message : t('main:wfbng.downloadFailedReason');
  return t('main:wfbng.downloadFailed', { asset, reason });
}
