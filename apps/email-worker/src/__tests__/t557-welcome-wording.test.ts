/**
 * T-557 (Ajay, M1): the welcome email paragraph on the old and new criminal codes.
 * The signed strings are inline, not read from handoff/, which is stripped from the main snapshot.
 */
import { renderToStaticMarkup } from 'react-dom/server';

import { authWelcomeTemplate } from '../templates/auth/welcome';

const M1 =
  'You can now describe your matter and get a first draft of a bail application, notice, writ or maintenance petition to review and edit before you file. Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.';

const DISCLAIMER =
  'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.';

function renderText(): string {
  // renderToStaticMarkup, not @react-email/render: that one needs a dynamic import that
  // Jest's CommonJS VM does not allow.
  const html = renderToStaticMarkup(
    authWelcomeTemplate.Body({ name: 'Test', loginUrl: 'https://lawie.in/login' }),
  );
  return html
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ');
}

describe('T-557 welcome email wording (M1)', () => {
  const text = renderText();

  it('carries the signed paragraph byte for byte', () => {
    expect(text).toContain(M1);
  });

  it('no longer carries the old claims', () => {
    expect(text).not.toMatch(/court-ready/i);
    expect(text).not.toMatch(/right BNS/i);
    expect(text).not.toMatch(/under five minutes/i);
  });

  it('keeps the drafting disclaimer', () => {
    expect(text).toContain(DISCLAIMER);
  });

  it('has no Devanagari characters', () => {
    expect(text).not.toMatch(/[ऀ-ॿ]/);
  });
});
