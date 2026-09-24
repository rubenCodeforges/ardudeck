import { describe, it, expect } from 'vitest';
import { syncErrorMessage } from './sync-error';

describe('sync error messages', () => {
  it('turns the empty-remote TypeError into something actionable', () => {
    const message = syncErrorMessage(new TypeError("Cannot read properties of null (reading 'length')"));
    expect(message).not.toContain('Cannot read properties');
    expect(message).toMatch(/remote repository/i);
  });

  it('keeps the conflict case, which needs a different fix from the user', () => {
    expect(syncErrorMessage(new Error('Automatic merge failed'))).toMatch(/conflict/i);
  });

  it('names an auth failure as one', () => {
    expect(syncErrorMessage(new Error('HTTP Error: 401 Unauthorized'))).toMatch(/token/i);
  });

  it('passes an ordinary message through', () => {
    expect(syncErrorMessage(new Error('connect ECONNREFUSED'))).toBe('connect ECONNREFUSED');
  });

  it('never returns an empty string', () => {
    expect(syncErrorMessage(new Error(''))).toBe('Sync failed');
  });
});
