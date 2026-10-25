// T-383 AC4: a not-found row shows the API's `display` ("Section 400"), never the raw
// token ("400-BNS" in quotes).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

import BailCheckerPage from '../page';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function reply(sections: unknown[]) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      sections,
      summary: {
        overallBailable: null,
        mostSeriousSection: null,
        maxPunishment: '',
        maxYears: null,
        bnssBailSection: null,
        bnssBailSectionTitle: '',
        courtLevel: '',
        courtLevelExplanation: '',
        recommendation: '',
      },
    }),
  }) as unknown as typeof fetch;
}

async function check(text: string) {
  await act(async () => root.render(<BailCheckerPage />));
  const ta = container.querySelector('input, textarea') as HTMLInputElement | HTMLTextAreaElement;
  const proto =
    ta instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const btn = Array.from(container.querySelectorAll('button')).find((b) =>
    /check/i.test(b.textContent ?? ''),
  );
  if (!btn) throw new Error('no check button');
  await act(async () => {
    btn.click();
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

describe('T-383 bail checker page: not-found row', () => {
  it('shows the display form, not the raw token', async () => {
    reply([
      {
        input: '400-BNS',
        bnsSection: '400',
        convertedFromIpc: false,
        offence: null,
        found: false,
        note: 'Not verified — check the Gazette',
        display: '400',
      },
    ]);
    await check('BNS 400');
    expect(container.textContent).toContain('Section 400');
    expect(container.textContent).toContain('Not verified — check the Gazette');
    expect(container.textContent).not.toContain('400-BNS');
    expect(container.textContent).not.toContain('“400');
  });

  it('shows "IPC 236" for an IPC row', async () => {
    reply([
      {
        input: '236-IPC',
        bnsSection: '',
        convertedFromIpc: true,
        ipcSection: '236',
        offence: null,
        found: false,
        display: 'IPC 236',
      },
    ]);
    await check('236 IPC');
    expect(container.textContent).toContain('Section IPC 236');
    expect(container.textContent).not.toContain('236-IPC');
  });
});
