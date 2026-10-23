// T-578 focus (full-screen) mode of the document editor. Real Tiptap in jsdom.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { SECTION_FINDER_OPEN_EVENT } from '../../sections/SectionFinderPanel';
import DocumentEditor from '../DocumentEditor';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DISCLAIMER = 'This draft is a starting point. Check every detail before you file it.';

let reduced = false;
function installMatchMedia() {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reduced : false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

let container: HTMLDivElement;
let root: Root;

const flush = () =>
  act(async () => {
    for (let i = 0; i < 15; i += 1) await Promise.resolve();
  });

interface MountOpts {
  footer?: string | null;
  onFocusModeChange?: (open: boolean) => void;
  withSave?: boolean;
}
async function mount({ footer = DISCLAIMER, onFocusModeChange, withSave = true }: MountOpts = {}) {
  await act(async () =>
    root.render(
      <DocumentEditor
        initialContent="<p>Hello</p>"
        onUpdate={() => undefined}
        saveState={withSave ? <span data-testid="save">Saved</span> : undefined}
        focusFooter={footer}
        onFocusModeChange={onFocusModeChange}
      />,
    ),
  );
  await flush();
}

const toggle = () => container.querySelector<HTMLButtonElement>('button[aria-pressed]')!;
const layer = () => container.querySelector<HTMLElement>('[data-focus-mode]');
const html = () => document.documentElement;

beforeEach(() => {
  jest.useFakeTimers();
  reduced = false;
  installMatchMedia();
  html().style.overflow = '';
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const open = async () => {
  await act(async () => toggle().click());
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
};
const keyEscape = async (target: Element) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  await act(async () => {
    jest.advanceTimersByTime(200);
  });
};

describe('T-578 AC1: the control', () => {
  it('is a 44px Focus mode button, not pressed, in the normal view', async () => {
    await mount();
    const b = toggle();
    expect(b).toHaveAttribute('aria-label', 'Focus mode');
    expect(b).toHaveAttribute('title', 'Focus mode');
    expect(b).toHaveAttribute('aria-pressed', 'false');
    expect(b.className).toContain('min-h-[44px]');
    expect(b.className).toContain('min-w-[44px]');
    expect(layer()).toBeNull();
  });

  it('swaps label, title and aria-pressed when open, and back on a second press', async () => {
    await mount();
    await open();
    // Rajesh's updated note: the name is fixed; aria-pressed and the title carry the state.
    expect(toggle()).toHaveAttribute('aria-label', 'Focus mode');
    expect(toggle()).toHaveAttribute('title', 'Exit focus mode');
    expect(toggle()).toHaveAttribute('aria-pressed', 'true');
    expect(layer()!.className).toContain('fixed inset-0');
    await open(); // second press closes
    expect(toggle()).toHaveAttribute('aria-label', 'Focus mode');
    expect(toggle()).toHaveAttribute('aria-pressed', 'false');
    expect(layer()).toBeNull();
  });

  it('tells the page when it opens and closes', async () => {
    const spy = jest.fn();
    await mount({ onFocusModeChange: spy });
    await open();
    expect(spy).toHaveBeenLastCalledWith(true);
    await open();
    expect(spy).toHaveBeenLastCalledWith(false);
  });
});

describe('T-578 AC1: Escape and focus return', () => {
  it('Escape inside the layer closes it and focus returns to the toggle', async () => {
    await mount();
    await open();
    const pm = container.querySelector('.ProseMirror')!;
    (pm as HTMLElement).focus();
    await keyEscape(pm);
    expect(layer()).toBeNull();
    expect(document.activeElement).toBe(toggle());
    expect(toggle()).toHaveAttribute('aria-label', 'Focus mode');
  });

  it('Escape outside the layer does nothing', async () => {
    await mount();
    await open();
    const outside = document.createElement('button');
    document.body.appendChild(outside);
    await keyEscape(outside);
    expect(layer()).not.toBeNull();
    outside.remove();
  });

  it('Escape in the normal view does nothing and does not move focus', async () => {
    await mount();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    pm.focus();
    await keyEscape(pm);
    expect(layer()).toBeNull();
    expect(document.activeElement).toBe(pm);
  });

  it('other keys do not close it', async () => {
    await mount();
    await open();
    const pm = container.querySelector('.ProseMirror')!;
    await act(async () => {
      pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    });
    expect(layer()).not.toBeNull();
  });
});

describe('T-578 AC1: scroll lock', () => {
  it('locks html scroll while open and restores the previous value on exit', async () => {
    html().style.overflow = 'auto';
    await mount();
    expect(html().style.overflow).toBe('auto');
    await open();
    expect(html().style.overflow).toBe('hidden');
    await open();
    expect(html().style.overflow).toBe('auto');
  });

  it('restores the previous value when unmounted while open', async () => {
    html().style.overflow = 'scroll';
    await mount();
    await open();
    expect(html().style.overflow).toBe('hidden');
    await act(async () => root.render(<div />));
    expect(html().style.overflow).toBe('scroll');
  });
});

describe('T-578 AC1: edits are unaffected (no remount)', () => {
  it('keeps the same editor, canvas and sheet nodes and the typed text across open and close', async () => {
    await mount();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    const rootNode = layer() ?? (pm.closest('div.flex') as HTMLElement);
    const canvas = pm.parentElement!.parentElement!.parentElement!;
    pm.textContent = 'Hello typed';
    await open();
    expect(container.querySelector('.ProseMirror')).toBe(pm);
    expect(pm.parentElement!.parentElement!.parentElement).toBe(canvas);
    expect(layer()).not.toBeNull();
    expect(pm.textContent).toContain('Hello');
    await open();
    expect(container.querySelector('.ProseMirror')).toBe(pm);
    expect(pm.parentElement!.parentElement!.parentElement).toBe(canvas);
    expect(rootNode).toBeTruthy();
  });

  it('does not call onUpdate just by toggling', async () => {
    const onUpdate = jest.fn();
    await act(async () =>
      root.render(<DocumentEditor initialContent="<p>Hi</p>" onUpdate={onUpdate} />),
    );
    await flush();
    await open();
    await open();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('the control is hidden from nobody: without a page prop the editor still renders the control', async () => {
    await mount({ footer: null, withSave: false });
    expect(toggle()).toBeInTheDocument();
  });
});

describe('T-578 AC1: sticky disclaimer footer', () => {
  it('is absent in the normal view', async () => {
    await mount();
    expect(container.textContent).not.toContain(DISCLAIMER);
  });

  it('is present in focus mode, equal to the prop, as a role=note after the canvas', async () => {
    await mount();
    await open();
    const notes = container.querySelectorAll('[role="note"]');
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toBe(DISCLAIMER);
    expect(notes[0].className).toContain('shrink-0');
    expect(notes[0].className).toContain('border-t');
    // Last child of the layer: a flex child after the scroll area, never inside it.
    expect(layer()!.lastElementChild).toBe(notes[0]);
    await open();
    expect(container.querySelector('[role="note"]')).toBeNull();
  });

  it('is not rendered when there is no disclaimer', async () => {
    await mount({ footer: null });
    await open();
    expect(container.querySelector('[role="note"]')).toBeNull();
  });
});

describe('T-578: save state in the toolbar', () => {
  it('shows the page save state in the toolbar only in focus mode', async () => {
    await mount();
    expect(container.querySelector('[data-testid="save"]')).toBeNull();
    await open();
    const save = container.querySelector('[data-testid="save"]')!;
    expect(save).not.toBeNull();
    expect(save.compareDocumentPosition(toggle()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await open();
    expect(container.querySelector('[data-testid="save"]')).toBeNull();
  });
});

describe('T-578 AC3: motion', () => {
  it('fades in and out over 150ms with motion allowed', async () => {
    await mount();
    await act(async () => toggle().click());
    expect(layer()!.className).toContain('nl-fade-in_150ms');
    await act(async () => {
      jest.advanceTimersByTime(160);
    });
    expect(layer()!.className).not.toContain('nl-fade-in');
    await act(async () => toggle().click());
    // Fading out: still open, transparent, until the 150ms pass.
    expect(layer()).not.toBeNull();
    expect(layer()!.className).toContain('opacity-0');
    await act(async () => {
      jest.advanceTimersByTime(160);
    });
    expect(layer()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('under reduced motion there is no fade in or out: open and close are immediate', async () => {
    reduced = true;
    installMatchMedia();
    await mount();
    await act(async () => toggle().click());
    expect(layer()).not.toBeNull();
    expect(layer()!.className).not.toContain('nl-fade-in');
    expect(layer()!.className).not.toContain('opacity-0');
    expect(layer()!.className).toContain('motion-reduce:transition-none');
    await act(async () => toggle().click());
    expect(layer()).toBeNull(); // no timer advanced
    expect(document.activeElement).toBe(toggle());
  });
});

// T-578 review round 1, must-fix 1: the section finder (z-40) opens under the layer (z-45), so
// both ways of opening it from inside the layer close focus mode first, at once, without a fade
// and without moving focus (the finder records the editor as where to return to).
describe('T-578 review: the section finder closes focus mode first', () => {
  it('a citation pill click closes the layer before the finder open event, with no fade', async () => {
    const spy = jest.fn();
    await mount({ onFocusModeChange: spy });
    await open();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    pm.focus();
    let closedBeforeOpen: boolean | null = null;
    let detail: unknown = null;
    const onOpen = (e: Event) => {
      closedBeforeOpen = spy.mock.calls.at(-1)?.[0] === false;
      detail = (e as CustomEvent).detail;
    };
    window.addEventListener(SECTION_FINDER_OPEN_EVENT, onOpen);
    // ProseMirror reads the injected node back and measures a Range, which jsdom lacks.
    const proto = Range.prototype as unknown as Record<string, unknown>;
    const hadRects = 'getClientRects' in proto;
    const hadRect = 'getBoundingClientRect' in proto;
    if (!hadRects) proto.getClientRects = () => [];
    if (!hadRect)
      proto.getBoundingClientRect = () => ({
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        x: 0,
        y: 0,
      });
    try {
      // A pill in the editor's DOM; the click is delegated from the editor root.
      const pill = document.createElement('span');
      pill.setAttribute('data-lawie-citation', 'BNS:103');
      pill.textContent = 'BNS 103';
      pm.appendChild(pill);
      await act(async () => {
        pill.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      await flush();
    } finally {
      window.removeEventListener(SECTION_FINDER_OPEN_EVENT, onOpen);
      if (!hadRects) delete proto.getClientRects;
      if (!hadRect) delete proto.getBoundingClientRect;
    }
    expect(closedBeforeOpen).toBe(true);
    expect(detail).toEqual({ preload: { code: 'BNS', section: '103' } });
    // No timer advanced: the layer is already gone (no fade out).
    expect(layer()).toBeNull();
    expect(html().style.overflow).toBe('');
    // Focus is not moved to the toggle, so the finder returns focus to the editor.
    expect(document.activeElement).not.toBe(toggle());
  });

  it('Ctrl+K closes the layer at once and lets the event reach the window listener', async () => {
    await mount();
    await open();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    pm.focus();
    const seen: { prevented: boolean }[] = [];
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') seen.push({ prevented: e.defaultPrevented });
    };
    window.addEventListener('keydown', onKey);
    try {
      await act(async () => {
        pm.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'k',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
    } finally {
      window.removeEventListener('keydown', onKey);
    }
    expect(seen).toEqual([{ prevented: false }]);
    expect(layer()).toBeNull();
    expect(document.activeElement).toBe(pm);
  });

  it('Cmd+K does the same', async () => {
    await mount();
    await open();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    await act(async () => {
      pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }));
    });
    expect(layer()).toBeNull();
  });

  it('Ctrl+K in the normal view changes nothing', async () => {
    const spy = jest.fn();
    await mount({ onFocusModeChange: spy });
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    await act(async () => {
      pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

// T-578 review round 1, must-fix 2: Tab never leaves the layer while it is open (WCAG 2.4.11).
describe('T-578 review: Tab stays inside the focus-mode layer', () => {
  const tab = async (target: Element, shiftKey = false) => {
    let ev: KeyboardEvent | null = null;
    await act(async () => {
      ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      target.dispatchEvent(ev);
    });
    return ev as unknown as KeyboardEvent;
  };
  const firstButton = () => layer()!.querySelector<HTMLButtonElement>('button')!;

  it('Shift+Tab on the first control goes to the editor, the last stop in the layer', async () => {
    await mount();
    await open();
    const first = firstButton();
    first.focus();
    const ev = await tab(first, true);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('.ProseMirror'));
  });

  it('Tab on the editor (the last stop) wraps to the first control', async () => {
    await mount();
    await open();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    pm.focus();
    const ev = await tab(pm);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstButton());
  });

  it('Tab between two controls inside the layer is left to the browser', async () => {
    await mount();
    await open();
    const first = firstButton();
    first.focus();
    const ev = await tab(first);
    expect(ev.defaultPrevented).toBe(false);
  });

  // T-578 round 3: a click on a blank part of the layer (the Wall beside the sheet, a toolbar
  // gap, the footer text) must leave focus inside the layer. A browser focuses the nearest
  // focusable ancestor of the click target on mousedown; jsdom does not, so this does that one
  // step itself, then sends each key from that element as a browser would.
  const clickBlank = async (target: Element) => {
    await act(async () => {
      target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      target.closest<HTMLElement>('[tabindex]')?.focus();
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };
  const key = async (target: Element, init: KeyboardEventInit) => {
    let ev: KeyboardEvent | null = null;
    await act(async () => {
      ev = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(ev);
    });
    return ev as unknown as KeyboardEvent;
  };

  it('a click on a blank part of the layer focuses the layer root, outside the tab order', async () => {
    await mount();
    const root = layer();
    expect(root).toBeNull(); // normal view: no layer, no tabindex on the editor root
    expect(container.firstElementChild).not.toHaveAttribute('tabindex');
    await open();
    expect(layer()).toHaveAttribute('tabindex', '-1');
    expect(layer()!.className).toContain('outline-none');
    // The canvas beside the sheet, and the footer text: neither is focusable.
    const canvas = layer()!.querySelector('.ProseMirror')!.closest('.overflow-y-auto')!;
    await clickBlank(canvas);
    expect(document.activeElement).toBe(layer());
    (document.activeElement as HTMLElement).blur();
    await clickBlank(layer()!.querySelector('p[role="note"]')!);
    expect(document.activeElement).toBe(layer());
  });

  it('from the focused root, Tab goes to the first control and Shift+Tab to the last stop', async () => {
    await mount();
    await open();
    await clickBlank(layer()!.querySelector('p[role="note"]')!);
    const root = layer()!;
    // Without the tabindex fix focus would not be on the root; send the key where focus is.
    expect(document.activeElement).toBe(root);
    const fwd = await key(document.activeElement!, { key: 'Tab' });
    expect(fwd.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(firstButton());
    await clickBlank(layer()!.querySelector('p[role="note"]')!);
    expect(document.activeElement).toBe(root);
    const back = await key(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(container.querySelector('.ProseMirror'));
  });

  it('from the focused root, Escape closes the layer and focus returns to the toggle', async () => {
    await mount();
    await open();
    await clickBlank(layer()!.querySelector('p[role="note"]')!);
    expect(document.activeElement).toBe(layer());
    await keyEscape(document.activeElement!);
    expect(layer()).toBeNull();
    expect(document.activeElement).toBe(toggle());
  });

  it('from the focused root, Ctrl+K closes the layer at once and reaches the window', async () => {
    await mount();
    await open();
    await clickBlank(layer()!.querySelector('p[role="note"]')!);
    const root = layer()!;
    expect(document.activeElement).toBe(root);
    const seen: boolean[] = [];
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') seen.push(e.defaultPrevented);
    };
    window.addEventListener('keydown', onKey);
    try {
      await key(document.activeElement!, { key: 'k', ctrlKey: true });
    } finally {
      window.removeEventListener('keydown', onKey);
    }
    expect(seen).toEqual([false]);
    expect(layer()).toBeNull();
  });

  it('leaves a Tab that the editor already used (defaultPrevented) alone', async () => {
    await mount();
    await open();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    pm.focus();
    // Tiptap handles Tab (list indent) at the editor, before the event reaches the layer.
    const stop = (e: Event) => e.preventDefault();
    pm.addEventListener('keydown', stop);
    try {
      await tab(pm);
    } finally {
      pm.removeEventListener('keydown', stop);
    }
    expect(document.activeElement).toBe(pm);
  });

  it('in the normal view Tab is never trapped', async () => {
    await mount();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    pm.focus();
    const ev = await tab(pm);
    expect(ev.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(pm);
  });
});

// T-578 round 3 should-fix: Ctrl/Cmd+K during the 150ms fade-out still closes the layer, and
// the fade's end never pulls focus back to the toggle once it has moved elsewhere.
describe('T-578 review: Ctrl+K and focus during the fade-out', () => {
  it('Ctrl+K during the fade-out closes the layer at once and focus is not pulled back', async () => {
    const spy = jest.fn();
    await mount({ onFocusModeChange: spy });
    await open();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    // Start the fade-out with the control; the layer is still there for 150ms.
    await act(async () => toggle().click());
    expect(layer()).not.toBeNull();
    const seen: boolean[] = [];
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'k') seen.push(e.defaultPrevented);
    };
    window.addEventListener('keydown', onKey);
    const outside = document.createElement('input'); // stands in for the finder's search box
    document.body.appendChild(outside);
    try {
      pm.focus();
      await act(async () => {
        pm.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'k',
            ctrlKey: true,
            bubbles: true,
            cancelable: true,
          }),
        );
      });
      expect(seen).toEqual([false]);
      expect(layer()).toBeNull();
      expect(spy).toHaveBeenLastCalledWith(false);
      outside.focus(); // the finder moves focus into itself
      await act(async () => {
        jest.advanceTimersByTime(500);
      });
      expect(document.activeElement).toBe(outside);
    } finally {
      window.removeEventListener('keydown', onKey);
      outside.remove();
    }
  });

  it('when focus leaves the layer during the fade-out, its end does not pull it to the toggle', async () => {
    await mount();
    await open();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    pm.focus();
    await act(async () => {
      pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(layer()).not.toBeNull(); // fading out
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    try {
      outside.focus();
      await act(async () => {
        jest.advanceTimersByTime(200);
      });
      expect(layer()).toBeNull();
      expect(document.activeElement).toBe(outside);
    } finally {
      outside.remove();
    }
  });

  it('when focus is still inside (or on body) at the end of the fade, it goes to the toggle', async () => {
    await mount();
    await open();
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    pm.focus();
    await keyEscape(pm);
    expect(document.activeElement).toBe(toggle());
  });
});
