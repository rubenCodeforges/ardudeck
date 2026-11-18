// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../../hooks/useTheme', () => ({ useThemePalette: () => ({}) }));
vi.mock('../../modules/module-theme-registry', () => ({ themedTrackColour: (c: string) => c }));

import { DraggableSlider } from './DraggableSlider';

describe('DraggableSlider text field (#157)', () => {
  let root: Root;
  let container: HTMLDivElement;
  let onChange: ReturnType<typeof vi.fn>;

  const input = () => container.querySelector('input[type="text"]') as HTMLInputElement;
  const type = (text: string) =>
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input(), text);
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  const key = (k: string) =>
    act(() => {
      input().dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    });

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    onChange = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(<DraggableSlider value={10.5} onChange={onChange} min={0} max={101} step={0.1} label="V" />);
    });
    act(() => input().focus());
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('lets a multi-digit value be typed and commits it on Enter', () => {
    type('2');
    expect(input().value).toBe('2');
    type('20');
    expect(input().value).toBe('20');
    expect(onChange).not.toHaveBeenCalled();
    key('Enter');
    expect(onChange).toHaveBeenCalledWith(20);
  });

  it('accepts a comma as the decimal separator', () => {
    type('14,8');
    key('Enter');
    expect(onChange).toHaveBeenCalledWith(14.8);
  });

  it('clamps to the range', () => {
    type('500');
    key('Enter');
    expect(onChange).toHaveBeenCalledWith(101);
  });

  it('Escape and empty text change nothing', () => {
    type('33');
    key('Escape');
    expect(onChange).not.toHaveBeenCalled();
    expect(input().value).toBe('10.5');
    act(() => input().focus());
    type('');
    key('Enter');
    expect(onChange).not.toHaveBeenCalled();
  });
});
