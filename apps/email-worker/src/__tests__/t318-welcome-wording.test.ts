/**
 * T-318: the welcome email disclaimer is Ajay's signed line (T-317 file,
 * Addendum 4), read from the signed file at test time.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

import { renderToStaticMarkup } from 'react-dom/server';

import { authWelcomeTemplate } from '../templates/auth/welcome';

const SIGNED_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'handoff',
  'legal',
  'T-317-home-faq-footer-signed.md',
);

function signedWelcome(): string {
  const file = readFileSync(SIGNED_PATH, 'utf8').replace(/\r\n/g, '\n');
  const rows = file
    .slice(file.indexOf('## Addendum 4'))
    .split('\n')
    .filter((l) => l.startsWith('|') && l.includes('welcome.tsx'));
  if (rows.length !== 1) throw new Error('expected one welcome row');
  const m = rows[0].split('|')[2].match(/^\s*`([^`]+)`/);
  if (!m) throw new Error('no signed welcome text');
  return m[1];
}

describe('T-318 welcome email wording', () => {
  it('renders the exact signed line and no AI-assisted', () => {
    // renderToStaticMarkup, not @react-email/render: that one needs a dynamic
    // import that Jest's CommonJS VM does not allow.
    const html = renderToStaticMarkup(
      authWelcomeTemplate.Body({ name: 'Test', loginUrl: 'https://lawie.in/login' }),
    );
    const text = html
      .replace(/<!--.*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/\s+/g, ' ');
    expect(text).toContain(signedWelcome());
    expect(html).not.toMatch(/AI-assisted/i);
  });
});
