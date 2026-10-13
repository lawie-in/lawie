// T-371 round 3: the bulk tab shows the API's own message on a 413 (text over 20,000
// characters), and the generic message for any other failure.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import SectionConverterPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TOO_LONG = 'Text is too long. Paste up to 20,000 characters at a time.';
const GENERIC = 'Something went wrong. Please try again.';

let container: HTMLDivElement;
let root: Root;

function reply(status: number, json: () => Promise<unknown>) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json,
  }) as unknown as typeof fetch;
}

function button(label: RegExp): HTMLButtonElement {
  const b = Array.from(container.querySelectorAll('button')).find((x) =>
    label.test(x.textContent ?? ''),
  );
  if (!b) throw new Error(`no button ${label}`);
  return b;
}

async function submit() {
  await act(async () => root.render(<SectionConverterPage />));
  await act(async () => button(/Bulk Text Converter/).click());
  const ta = container.querySelector('#bulk-text') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(ta, 'Section 302 IPC');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    button(/Convert to New Law/).click();
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('T-371 bulk tab: 413 message', () => {
  it('shows the API message on a 413', async () => {
    reply(413, async () => ({ error: TOO_LONG }));
    await submit();
    expect(container.textContent).toContain(TOO_LONG);
    expect(container.textContent).not.toContain(GENERIC);
  });

  it('a 500 still shows the generic message, not the API text', async () => {
    reply(500, async () => ({ error: 'boom' }));
    await submit();
    expect(container.textContent).toContain(GENERIC);
    expect(container.textContent).not.toContain('boom');
  });

  it('a 413 with no readable body falls back to the generic message', async () => {
    reply(413, async () => {
      throw new Error('not json');
    });
    await submit();
    expect(container.textContent).toContain(GENERIC);
  });
});
