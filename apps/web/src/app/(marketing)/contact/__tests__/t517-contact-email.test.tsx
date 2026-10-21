// T-517 (AJ-517-M15): the contact page names contact@lawie.in only, in text and mailto links.
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import ContactPage from '../page';

jest.mock('@/components/marketing/SiteNav', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/SiteFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/marketing/FloatCta', () => ({ __esModule: true, default: () => null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('contact page email (AJ-517-M15)', () => {
  it('shows contact@lawie.in with mailto links and no privacy@lawie.in', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(<ContactPage />));
    expect(container.textContent).toContain('contact@lawie.in');
    expect(container.innerHTML).not.toContain('privacy@lawie.in');
    const hrefs = Array.from(container.querySelectorAll('a[href^="mailto:"]')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toContain('mailto:contact@lawie.in');
    expect(hrefs).not.toContain('mailto:privacy@lawie.in');
    act(() => root.unmount());
    container.remove();
  });
});
