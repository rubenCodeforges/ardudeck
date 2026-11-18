// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { LivePwmInput, useLiveParamWriter } from './LivePwmInput';
import { useParameterStore } from '../../../stores/parameter-store';

function Harness({ value }: { value: number }) {
  const writeLive = useLiveParamWriter();
  return (
    <LivePwmInput
      value={value}
      min={800}
      max={2200}
      onWrite={(v) => writeLive('SERVO1_TRIM', v)}
      className=""
    />
  );
}

describe('LivePwmInput (#170)', () => {
  let root: Root;
  let container: HTMLDivElement;
  let writes: number[];
  let resolvers: Array<() => void>;
  let deferred: boolean;

  const input = () => container.querySelector('input') as HTMLInputElement;
  const key = (k: string, shiftKey = false) =>
    act(() => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey, bubbles: true, cancelable: true }));
    });
  const render = (value: number) =>
    act(() => {
      root.render(<Harness value={value} />);
    });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    writes = [];
    resolvers = [];
    deferred = false;
    useParameterStore.setState({
      setParameterImmediate: vi.fn((_id: string, v: number) => {
        writes.push(v);
        if (!deferred) return Promise.resolve(true);
        return new Promise<boolean>((res) => resolvers.push(() => res(true)));
      }),
    });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('steps by 1 with the arrows and by 10 with Shift, writing each step at once', async () => {
    render(1500);
    act(() => input().focus());
    await key('ArrowUp');
    expect(writes).toEqual([1501]);
    await key('ArrowDown', true);
    expect(writes).toEqual([1501, 1491]);
    expect(input().value).toBe('1491');
  });

  it('never queues stale steps: only the newest value follows the write in flight', async () => {
    deferred = true;
    render(1500);
    act(() => input().focus());
    await key('ArrowUp');
    await key('ArrowUp');
    await key('ArrowUp');
    expect(writes).toEqual([1501]);
    await act(async () => {
      resolvers.shift()!();
    });
    expect(writes).toEqual([1501, 1503]);
  });

  it('steps with the wheel only while focused, and keeps the page from scrolling', () => {
    render(1500);
    const unfocused = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    act(() => {
      input().dispatchEvent(unfocused);
    });
    expect(writes).toEqual([]);
    expect(unfocused.defaultPrevented).toBe(false);

    act(() => input().focus());
    const focused = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
    act(() => {
      input().dispatchEvent(focused);
    });
    expect(writes).toEqual([1501]);
    expect(focused.defaultPrevented).toBe(true);
  });

  it('clamps to the range', async () => {
    render(2195);
    act(() => input().focus());
    await key('ArrowUp', true);
    expect(writes).toEqual([2200]);
  });

  it('Escape puts back the value from when the field was focused', async () => {
    render(1500);
    act(() => input().focus());
    await key('ArrowUp');
    await key('ArrowUp');
    render(1502);
    await key('Escape');
    expect(writes).toEqual([1501, 1502, 1500]);
  });
});
