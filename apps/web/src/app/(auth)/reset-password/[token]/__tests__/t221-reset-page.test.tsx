/** T-221 AC5: the reset page sends no referrer, is not indexed, and renders the form. */
import { useParams } from 'next/navigation';

import { jsonResponse, mountEl, text, unmountEl } from '@/components/auth/__tests__/t221-helpers';

import ResetPasswordPage, { metadata } from '../page';

afterEach(unmountEl);

it('metadata: no-referrer and noindex', () => {
  expect(metadata.referrer).toBe('no-referrer');
  expect(metadata.robots).toEqual({ index: false, follow: false });
});

it('renders the reset form without taking the token as a prop', async () => {
  (useParams as jest.Mock).mockReturnValue({ token: 'cd'.repeat(32) });
  global.fetch = jest.fn().mockResolvedValue(jsonResponse(200, { valid: true })) as never;
  expect(ResetPasswordPage.length).toBe(0);
  await mountEl(<ResetPasswordPage />);
  expect(text()).toContain('Set a new password');
  expect(document.body.innerHTML).not.toContain('cd'.repeat(32));
});
