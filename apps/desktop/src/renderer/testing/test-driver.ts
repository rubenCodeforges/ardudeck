// apps/desktop/src/renderer/testing/test-driver.ts

// --- Types ---

export interface FoundElement {
  tag: string;
  testId: string | null;
  text: string;
  value: string | null;
  rect: { x: number; y: number; width: number; height: number };
  visible: boolean;
  attributes: Record<string, string>;
}

export interface FindQuery {
  query: string;
  by?: 'testId' | 'role' | 'text' | 'css';
}

export interface ClickOptions {
  double?: boolean;
  right?: boolean;
}

export interface TypeOptions {
  clear?: boolean;
  delay?: number;
}

// --- Element Finding ---

function inferBy(query: string): 'testId' | 'text' {
  return /^[a-zA-Z0-9_-]+$/.test(query) ? 'testId' : 'text';
}

function findElementsByTestId(query: string): Element[] {
  return Array.from(document.querySelectorAll(`[data-testid="${query}"]`));
}

function findElementsByRole(query: string): Element[] {
  const [role, name] = query.includes(':') ? query.split(':', 2) : [query, undefined];
  const elements = Array.from(document.querySelectorAll(`[role="${role}"]`));
  if (name) {
    return elements.filter(
      (el) =>
        el.getAttribute('aria-label')?.includes(name) ||
        el.textContent?.trim().includes(name)
    );
  }
  return elements;
}

function findElementsByText(query: string): Element[] {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  const results: Element[] = [];
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node instanceof HTMLElement) {
      const directText = Array.from(node.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent?.trim())
        .join(' ');
      if (directText.includes(query)) {
        results.push(node);
      }
    }
    node = walker.nextNode();
  }
  return results;
}

function findElementsByCss(query: string): Element[] {
  return Array.from(document.querySelectorAll(query));
}

export function findElements(params: FindQuery): FoundElement[] {
  const by = params.by || inferBy(params.query);

  let elements: Element[];
  switch (by) {
    case 'testId':
      elements = findElementsByTestId(params.query);
      break;
    case 'role':
      elements = findElementsByRole(params.query);
      break;
    case 'text':
      elements = findElementsByText(params.query);
      break;
    case 'css':
      elements = findElementsByCss(params.query);
      break;
    default:
      elements = [];
  }

  return elements.map(elementToFound);
}

function elementToFound(el: Element): FoundElement {
  const rect = el.getBoundingClientRect();
  const attrs: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (!attr.name.startsWith('__')) {
      attrs[attr.name] = attr.value;
    }
  }

  return {
    tag: el.tagName.toLowerCase(),
    testId: el.getAttribute('data-testid'),
    text: (el as HTMLElement).innerText?.slice(0, 200) || '',
    value: (el as HTMLInputElement).value ?? null,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    visible: rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden',
    attributes: attrs,
  };
}

function resolveElement(selector: string, by?: string): Element {
  const byResolved = (by || inferBy(selector)) as 'testId' | 'role' | 'text' | 'css';
  let elements: Element[];
  switch (byResolved) {
    case 'testId':
      elements = findElementsByTestId(selector);
      break;
    case 'role':
      elements = findElementsByRole(selector);
      break;
    case 'text':
      elements = findElementsByText(selector);
      break;
    case 'css':
      elements = findElementsByCss(selector);
      break;
    default:
      elements = [];
  }
  if (elements.length === 0) {
    throw new Error(`Element not found: "${selector}" (by: ${byResolved})`);
  }
  return elements[0]!;
}

// --- Event Dispatch ---

export function click(selector: string, by?: string, options?: ClickOptions): void {
  const el = resolveElement(selector, by) as HTMLElement;
  el.scrollIntoView({ block: 'center' });

  const rect = el.getBoundingClientRect();
  const x = rect.x + rect.width / 2;
  const y = rect.y + rect.height / 2;

  const eventInit: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: options?.right ? 2 : 0,
  };

  if (options?.right) {
    el.dispatchEvent(new MouseEvent('contextmenu', eventInit));
  } else if (options?.double) {
    el.dispatchEvent(new MouseEvent('mousedown', eventInit));
    el.dispatchEvent(new MouseEvent('mouseup', eventInit));
    el.dispatchEvent(new MouseEvent('click', eventInit));
    el.dispatchEvent(new MouseEvent('mousedown', eventInit));
    el.dispatchEvent(new MouseEvent('mouseup', eventInit));
    el.dispatchEvent(new MouseEvent('click', eventInit));
    el.dispatchEvent(new MouseEvent('dblclick', eventInit));
  } else {
    el.dispatchEvent(new MouseEvent('mousedown', eventInit));
    el.dispatchEvent(new MouseEvent('mouseup', eventInit));
    el.dispatchEvent(new MouseEvent('click', eventInit));
  }
}

export function type(selector: string, text: string, by?: string, options?: TypeOptions): void {
  const el = resolveElement(selector, by) as HTMLInputElement;
  el.focus();

  if (options?.clear) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(el, (options?.clear ? '' : el.value) + text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export function selectOption(selector: string, value: string, by?: string): void {
  const el = resolveElement(selector, by) as HTMLSelectElement;
  const nativeSetter = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    'value'
  )?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

export function scroll(
  selector: string | undefined,
  direction: 'up' | 'down' | 'left' | 'right',
  amount: number = 300
): void {
  const el = selector ? (resolveElement(selector) as HTMLElement) : document.documentElement;
  const scrollMap = {
    up: { top: -amount },
    down: { top: amount },
    left: { left: -amount },
    right: { left: amount },
  };
  el.scrollBy({ ...scrollMap[direction], behavior: 'smooth' });
}

export function keyboard(key: string): void {
  const target = document.activeElement || document.body;
  const parts = key.split('+');
  const mainKey = parts.pop()!;
  const modifiers = {
    ctrlKey: parts.includes('Ctrl') || parts.includes('Control'),
    shiftKey: parts.includes('Shift'),
    altKey: parts.includes('Alt'),
    metaKey: parts.includes('Meta') || parts.includes('Cmd'),
  };

  target.dispatchEvent(
    new KeyboardEvent('keydown', { key: mainKey, bubbles: true, cancelable: true, ...modifiers })
  );
  target.dispatchEvent(
    new KeyboardEvent('keyup', { key: mainKey, bubbles: true, cancelable: true, ...modifiers })
  );
}

export function hover(selector: string, by?: string): void {
  const el = resolveElement(selector, by) as HTMLElement;
  const rect = el.getBoundingClientRect();
  const eventInit: MouseEventInit = {
    bubbles: true,
    clientX: rect.x + rect.width / 2,
    clientY: rect.y + rect.height / 2,
  };
  el.dispatchEvent(new MouseEvent('mouseenter', eventInit));
  el.dispatchEvent(new MouseEvent('mouseover', eventInit));
  el.dispatchEvent(new MouseEvent('mousemove', eventInit));
}

// --- State Reading ---

export function getPageState(): Record<string, any> {
  const loadingSpinners = document.querySelectorAll(
    '.animate-spin, [class*="loading"], [class*="spinner"]'
  );
  const errorElements = document.querySelectorAll(
    '[class*="error"], [class*="alert"], [role="alert"]'
  );

  return {
    title: document.title,
    url: window.location.href,
    windowSize: { width: window.innerWidth, height: window.innerHeight },
    loadingCount: loadingSpinners.length,
    errorMessages: Array.from(errorElements)
      .map((el) => (el as HTMLElement).innerText?.slice(0, 200))
      .filter(Boolean),
    activeElement: document.activeElement
      ? {
          tag: document.activeElement.tagName.toLowerCase(),
          testId: document.activeElement.getAttribute('data-testid'),
        }
      : null,
  };
}

export function getElementText(selector: string, by?: string): string {
  const el = resolveElement(selector, by) as HTMLElement;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    return el.value;
  }
  return el.innerText || el.textContent || '';
}

export function listTestIds(scope?: string): string[] {
  const root = scope ? document.querySelector(scope) || document.body : document.body;
  const elements = root.querySelectorAll('[data-testid]');
  return Array.from(elements).map((el) => el.getAttribute('data-testid')!);
}

// --- Waiting ---

export function waitForElement(
  selector: string,
  by?: string,
  options?: { visible?: boolean; hidden?: boolean; timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? 10000;
  const wantHidden = options?.hidden === true;

  return new Promise((resolve, reject) => {
    const found = findElements({ query: selector, by: by as any });
    const match = wantHidden ? found.length === 0 : found.some((f) => f.visible !== false);
    if (match) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(
        new Error(
          `Timeout (${timeout}ms) waiting for element: "${selector}" (${wantHidden ? 'hidden' : 'visible'})`
        )
      );
    }, timeout);

    const observer = new MutationObserver(() => {
      const found = findElements({ query: selector, by: by as any });
      const match = wantHidden ? found.length === 0 : found.some((f) => f.visible !== false);
      if (match) {
        clearTimeout(timer);
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'data-testid'],
    });
  });
}
