/** T-221 AC1: the page behind "Forgot password?" renders the email form; not indexed. */
import { mountEl, text, unmountEl } from '@/components/auth/__tests__/t221-helpers';

import ForgotPasswordPage, { metadata } from '../page';

afterEach(unmountEl);

it('metadata: no-referrer and noindex', () => {
  expect(metadata.referrer).toBe('no-referrer');
  expect(metadata.robots).toEqual({ index: false, follow: false });
});

it('renders an email field and the send button', async () => {
  await mountEl(<ForgotPasswordPage />);
  expect(document.querySelector('input[type="email"]')).not.toBeNull();
  expect(text()).toContain('Send reset link');
});
