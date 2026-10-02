import { t } from '../../shared/i18n/index.js';
/**
 * A remote branch that does not exist yet is the normal state right after
 * setup, and isomorphic-git's merge path dies on it with a bare TypeError
 * ("Cannot read properties of null"). Nothing about that is useful to a pilot,
 * so the first sync checks for the branch instead of pulling blind.
 */
export function syncErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/merge|conflict/i.test(msg)) {
    return t('main:syncError.conflict');
  }
  if (/cannot read properties|undefined is not an object|null \(reading/i.test(msg)) {
    return t('main:syncError.unreadable');
  }
  if (/401|403|auth/i.test(msg)) {
    return t('main:syncError.tokenRefused');
  }
  return msg || t('main:syncError.failed');
}

