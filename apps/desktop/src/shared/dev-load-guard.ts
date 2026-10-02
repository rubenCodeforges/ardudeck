import { RESERVED_CARGO_SLUGS } from './reserved-slugs.js';
import { t } from './i18n/index.js';

export type DevLoadCheck = { ok: true } | { ok: false; error: string };

export function checkDevSlug(
  slug: string,
  installedSlugs: readonly string[],
  reserved: ReadonlySet<string> = RESERVED_CARGO_SLUGS,
): DevLoadCheck {
  if (!slug) return { ok: false, error: t('shared:devLoadGuard.noSlug') };
  if (reserved.has(slug)) {
    return { ok: false, error: t('shared:devLoadGuard.reserved', { slug }) };
  }
  if (installedSlugs.includes(slug)) {
    return { ok: false, error: t('shared:devLoadGuard.alreadyInstalled', { slug }) };
  }
  return { ok: true };
}
