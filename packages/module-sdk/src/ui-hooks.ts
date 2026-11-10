// Theme hooks for hand-rolled controls in core and cargo views; selectors are listed on ThemeRegistration.
export type UiPart = 'tabs' | 'tab' | 'segmented' | 'segment' | 'button' | 'icon-button' | 'chip' | 'option' | 'card' | 'input';
export type UiVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type UiStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface UiHookAttrs {
  'data-ui': UiPart;
  'data-active'?: 'true';
  'data-variant'?: UiVariant;
  'data-status'?: UiStatus;
}

export function ui(part: UiPart, opts: { active?: boolean; variant?: UiVariant; status?: UiStatus } = {}): UiHookAttrs {
  const attrs: UiHookAttrs = { 'data-ui': part };
  if (opts.active) attrs['data-active'] = 'true';
  if (opts.variant) attrs['data-variant'] = opts.variant;
  if (opts.status) attrs['data-status'] = opts.status;
  return attrs;
}
