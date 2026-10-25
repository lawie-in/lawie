/**
 * @jest-environment node
 */
// T-521 (WCAG 4.1.3): on the first render the BriefLoading status is mounted EMPTY (the effect that
// fills it has not run), so a screen reader hears the text arrive. Node env: server render only.
import { renderToString } from 'react-dom/server';

import { BriefLoading } from '../BriefStep';

jest.mock('@sentry/nextjs', () => ({ captureMessage: jest.fn() }));

it('first render: sr-only role=status is present and empty; the visible line is aria-hidden', () => {
  const html = renderToString(<BriefLoading />);
  const status = html.match(/<p class="sr-only" role="status">([^<]*)<\/p>/);
  expect(status).not.toBeNull();
  expect(status![1]).toBe('');
  expect(html).toMatch(/<p[^>]*aria-hidden="true"[^>]*>Reading your description…<\/p>/);
  // the text appears once in the markup, in the hidden line only
  expect(html.split('Reading your description…').length - 1).toBe(1);
});
