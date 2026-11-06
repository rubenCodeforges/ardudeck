// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blurNumberInputOnWheel } from './number-wheel-guard';

describe('blurNumberInputOnWheel (#96)', () => {
  const input = (type: string) => {
    const el = document.createElement('input');
    el.type = type;
    document.body.appendChild(el);
    el.focus();
    return el;
  };

  it('blurs a focused number input the wheel is over', () => {
    const el = input('number');
    blurNumberInputOnWheel({ target: el });
    expect(document.activeElement).not.toBe(el);
  });
  it('leaves a focused number input alone when the wheel is elsewhere', () => {
    const el = input('number');
    blurNumberInputOnWheel({ target: document.body });
    expect(document.activeElement).toBe(el);
  });
  it('leaves text inputs alone', () => {
    const el = input('text');
    blurNumberInputOnWheel({ target: el });
    expect(document.activeElement).toBe(el);
  });
});
