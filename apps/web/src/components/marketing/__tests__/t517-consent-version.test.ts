// T-517 AJ-517-M16: the consent line names two versions. The web copy cannot import the auth
// service, so this test reads the auth model file and pins the two numbers together.
import * as fs from 'fs';
import * as path from 'path';

import { CURRENT_PRIVACY_VERSION } from '@lawie/shared';

import { CONSENT_COPY, TERMS_VERSION } from '../nl-copy';

const REPO = path.resolve(__dirname, '../../../../../..');
const authModel = fs.readFileSync(path.join(REPO, 'apps/auth/src/models/User.model.ts'), 'utf8');

describe('consent line versions (AJ-517-M16)', () => {
  it('TERMS_VERSION equals CURRENT_TERMS_VERSION in the auth User model', () => {
    const m = authModel.match(/export const CURRENT_TERMS_VERSION\s*=\s*'([^']+)'/);
    expect(m).not.toBeNull();
    expect(TERMS_VERSION).toBe(m![1]);
    expect(CONSENT_COPY.termsVersion).toBe(m![1]);
  });

  it('the {privacy} value equals CURRENT_PRIVACY_VERSION (unchanged at 2026-10-15); TERMS_VERSION is 2026-10-22 (T-541)', () => {
    expect(CONSENT_COPY.version).toBe(CURRENT_PRIVACY_VERSION);
    expect(CURRENT_PRIVACY_VERSION).toBe('2026-10-15');
    expect(TERMS_VERSION).toBe('2026-10-22');
  });

  it('the pieces join to the signed line exactly, with no date', () => {
    const c = CONSENT_COPY;
    const line = c.before + c.terms + c.middle + c.privacy + c.after;
    expect(line).toBe(
      'I have read and agree to the Terms (version 2026-10-22) and the Privacy Policy (version 2026-10-15).',
    );
    expect(line).not.toMatch(/\b(Oct|October|2026,)\b.*\b(Oct|October)\b|\d{1,2} (Oct|October)/);
  });
});
