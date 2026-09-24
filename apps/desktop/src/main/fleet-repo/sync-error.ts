/**
 * A remote branch that does not exist yet is the normal state right after
 * setup, and isomorphic-git's merge path dies on it with a bare TypeError
 * ("Cannot read properties of null"). Nothing about that is useful to a pilot,
 * so the first sync checks for the branch instead of pulling blind.
 */
export function syncErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/merge|conflict/i.test(msg)) {
    return 'Sync conflict: this vault and the remote changed the same files. Resolve in the repo folder with a git client, then sync again.';
  }
  if (/cannot read properties|undefined is not an object|null \(reading/i.test(msg)) {
    return 'The remote repository could not be read. Check the repository still exists and the token has access, then try again.';
  }
  if (/401|403|auth/i.test(msg)) {
    return 'The remote refused the token. Reconnect the account in Backup & Sync.';
  }
  return msg || 'Sync failed';
}

