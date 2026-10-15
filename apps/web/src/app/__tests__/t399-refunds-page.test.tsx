import { act } from 'react';
import { createRoot } from 'react-dom/client';

import RefundsPage from '../(marketing)/refunds/page';

// T-399: Ajay's signed refund-page sentence ships with the yearly drip. The marketing
// chrome is stubbed; only the page body is under test.
jest.mock('@/components/marketing/FloatCta', () => () => null);
jest.mock('@/components/marketing/SiteFooter', () => () => null);
jest.mock('@/components/marketing/SiteNav', () => () => null);

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SIGNED =
  'If you cancel an annual plan, you keep your monthly Ink until the end of the year you paid for.';

describe('refund page (T-399)', () => {
  it("renders Ajay's annual-cancel sentence exactly, in the cancellation paragraph", async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<RefundsPage />));

    const text = (container.textContent ?? '').replace(/\s+/g, ' ');
    expect(text).toContain(SIGNED);
    const para = Array.from(container.querySelectorAll('p')).find((p) =>
      (p.textContent ?? '').replace(/\s+/g, ' ').includes(SIGNED),
    );
    expect(para).toBeDefined();
    expect(para!.textContent!.replace(/\s+/g, ' ')).toContain(
      'Cancellation does not refund payments already made.',
    );
    await act(async () => root.unmount());
    container.remove();
  });
});
