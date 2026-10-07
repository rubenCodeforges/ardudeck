import { describe, it, expect } from 'vitest';
import { decodeAutopilotVersion } from './autopilot-version';

function payload(opts: { uid?: bigint; uid2?: number[]; fw?: number; board?: number; len?: number }): Uint8Array {
  const p = new Uint8Array(78);
  const v = new DataView(p.buffer);
  v.setBigUint64(8, opts.uid ?? 0n, true);
  v.setUint32(16, opts.fw ?? 0, true);
  v.setUint32(28, opts.board ?? 0, true);
  if (opts.uid2) p.set(opts.uid2, 60);
  return p.subarray(0, opts.len ?? 78);
}

describe('decodeAutopilotVersion', () => {
  it('prefers uid2 over uid', () => {
    const id = decodeAutopilotVersion(payload({ uid: 0xabcn, uid2: [1, 2, 3] }));
    expect(id.boardUid).toBe('010203' + '00'.repeat(15));
  });

  it('falls back to uid and survives a zero-trimmed payload', () => {
    const id = decodeAutopilotVersion(payload({ uid: 0x1234n, fw: (4 << 24) | (5 << 16) | (7 << 8) | 255, board: 140 << 16, len: 32 }));
    expect(id.boardUid).toBe('1234');
    expect(id.firmwareVersion).toBe('4.5.7');
    expect(id.boardVersion >>> 16).toBe(140);
  });

  it('reports no identity when the board has none', () => {
    expect(decodeAutopilotVersion(payload({ len: 20 })).boardUid).toBeNull();
  });
});
