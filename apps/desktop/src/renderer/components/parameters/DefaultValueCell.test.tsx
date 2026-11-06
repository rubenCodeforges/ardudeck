// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));

import { DefaultValueCell } from './DefaultValueCell';

describe('DefaultValueCell (#32)', () => {
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });
  const render = (node: JSX.Element) => act(() => root.render(node));

  it('shows the default and resets to it when the value differs', () => {
    const onReset = vi.fn();
    render(<DefaultValueCell value={1} defaultValue={0} onReset={onReset} />);
    expect(el.textContent).toContain('0');
    act(() => el.querySelector('button')!.click());
    expect(onReset).toHaveBeenCalledWith(0);
  });
  it('offers no reset when the value is the default, or the parameter is read-only', () => {
    render(<DefaultValueCell value={0.1} defaultValue={Math.fround(0.1)} onReset={() => {}} />);
    expect(el.querySelector('button')).toBeNull();
    render(<DefaultValueCell value={1} defaultValue={0} readOnly onReset={() => {}} />);
    expect(el.querySelector('button')).toBeNull();
  });
  it('stays empty while the board has not sent defaults', () => {
    render(<DefaultValueCell value={1} defaultValue={undefined} onReset={() => {}} />);
    expect(el.textContent).toBe('');
  });
});
