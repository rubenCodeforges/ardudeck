// processes.test.ts
import { describe, it, expect } from 'vitest';
import { listProcesses, isProtected } from './processes';

describe('processes', () => {
  it('returns current processes with required fields', async () => {
    const procs = await listProcesses(['ardudeck-agent']);
    expect(procs.length).toBeGreaterThan(0);
    const first = procs[0];
    expect(first).toHaveProperty('pid');
    expect(first).toHaveProperty('name');
    expect(first).toHaveProperty('cpu');
    expect(first).toHaveProperty('ram');
    expect(first).toHaveProperty('user');
    expect(first).toHaveProperty('command');
    expect(first).toHaveProperty('isProtected');
  });

  it('marks protected processes', () => {
    expect(isProtected('mavlink-router', ['mavlink-router', 'mavp2p'])).toBe(true);
    expect(isProtected('python3', ['mavlink-router', 'mavp2p'])).toBe(false);
  });
});
