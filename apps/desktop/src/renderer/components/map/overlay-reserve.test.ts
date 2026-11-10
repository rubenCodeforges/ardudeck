import { describe, expect, it } from 'vitest';
import { avoidReserved } from './useDraggableOverlay';

const button = { x: 8, y: 8, w: 130, h: 26 };

describe('avoidReserved', () => {
  it('pushes an overlay that covers the Instruments button to just below it', () => {
    expect(avoidReserved({ x: 0, y: 0 }, { w: 600, h: 50 }, [button])).toEqual({ x: 0, y: 38 });
  });
  it('leaves an overlay clear of the button where it is', () => {
    expect(avoidReserved({ x: 200, y: 0 }, { w: 300, h: 50 }, [button])).toEqual({ x: 200, y: 0 });
    expect(avoidReserved({ x: 0, y: 60 }, { w: 300, h: 50 }, [button])).toEqual({ x: 0, y: 60 });
  });
});

describe('avoidReserved, column chrome', () => {
  const column = { x: 600, y: 8, w: 80, h: 220, side: 'left' as const };
  it('moves an overlay under the right-hand button column to its left', () => {
    expect(avoidReserved({ x: 450, y: 30 }, { w: 200, h: 50 }, [column])).toEqual({ x: 396, y: 30 });
  });
  it('leaves it where it is when there is no room to the left', () => {
    expect(avoidReserved({ x: 0, y: 30 }, { w: 690, h: 50 }, [column])).toEqual({ x: 0, y: 30 });
  });
});
