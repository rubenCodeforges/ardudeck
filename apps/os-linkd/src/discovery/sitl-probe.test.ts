import { describe, it, expect } from 'vitest';
import { busyLocalPorts } from './sitl-probe';

const TABLE = `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000:1680 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 1 1 0000000000000000 100 0 0 10 0
   1: 0100007F:1680 0100007F:D3A2 01 00000000:00000000 00:00000000 00000000  1000        0 2 1 0000000000000000 20 4 30 10 -1
   2: 0100007F:D3A2 0100007F:1680 01 00000000:00000000 00:00000000 00000000  1000        0 3 1 0000000000000000 20 4 30 10 -1`;

describe('busyLocalPorts', () => {
  it('reports server ports with an established client and ignores listeners', () => {
    const busy = busyLocalPorts(TABLE);
    expect(busy.has(5760)).toBe(true);
    expect(busy.has(0x1680)).toBe(true);
    expect([...busy].sort()).toEqual([5760, 54178].sort());
  });
});
