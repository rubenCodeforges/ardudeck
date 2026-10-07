import type { ConnectionState } from '../../shared/ipc-channels';

/**
 * True when the app's own connection is up. `isConnected` alone is also true while a
 * fleet vehicle is focused with no primary link, which is right for configuration
 * views but not for the controls that open and close the link.
 */
export function isPrimaryLinkUp(state: ConnectionState): boolean {
  return state.isConnected && (state.focus?.primaryLink ?? true);
}
