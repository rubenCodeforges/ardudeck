import { describe, it, expect } from 'vitest';
import { isSitlBinary, parseNetstatListeners, withPathPrepended } from './process-os';

const NETSTAT = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1012
  TCP    0.0.0.0:5760           0.0.0.0:0              LISTENING       8840
  TCP    0.0.0.0:5760           0.0.0.0:0              LISTENING       9120
  TCP    0.0.0.0:57600          0.0.0.0:0              LISTENING       4444
  TCP    127.0.0.1:5770         0.0.0.0:0              LISTENING       9300
  TCP    127.0.0.1:62895        127.0.0.1:5760         ESTABLISHED     7000
  TCP    [::]:5760              [::]:0                 LISTENING       8840
`;

describe('parseNetstatListeners', () => {
  it('finds every process listening on the port, including a second one bound alongside', () => {
    expect(parseNetstatListeners(NETSTAT, 5760).sort()).toEqual([8840, 9120]);
  });

  it('ignores clients connected to the port and ports that only start with the same digits', () => {
    expect(parseNetstatListeners(NETSTAT, 5760)).not.toContain(7000);
    expect(parseNetstatListeners(NETSTAT, 5760)).not.toContain(4444);
  });

  it('reads swarm instance ports', () => {
    expect(parseNetstatListeners(NETSTAT, 5770)).toEqual([9300]);
  });
});

describe('isSitlBinary', () => {
  it('matches ArduPilot SITL images from tasklist and ps, nothing else', () => {
    expect(isSitlBinary('"ArduCopter.exe","8840","Console","1","42,120 K"')).toBe(true);
    expect(isSitlBinary('/Users/x/ardupilot-sitl/stable/plane/arduplane -Mplane')).toBe(true);
    expect(isSitlBinary('"inav_SITL.exe","9120","Console","1","10,000 K"')).toBe(false);
    expect(isSitlBinary('INFO: No tasks are running which match the specified criteria.')).toBe(false);
  });
});

describe('withPathPrepended', () => {
  it('extends the existing Path variable instead of adding a second one', () => {
    const env = withPathPrepended({ Path: 'C:\\Windows' }, 'C:\\cygwin');
    expect(Object.keys(env).filter((k) => k.toLowerCase() === 'path')).toEqual(['Path']);
    expect(env.Path!.startsWith('C:\\cygwin')).toBe(true);
    expect(env.Path!.endsWith('C:\\Windows')).toBe(true);
  });

  it('works when there is no path at all', () => {
    expect(withPathPrepended({}, '/x').PATH).toBe('/x');
  });
});
