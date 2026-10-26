/**
 * T-587 (AJ-587-M1, Ajay; body AJ-556-M1) — the welcome email, sent once after the address is
 * verified (or on the first Google sign-in). EN only. Every string below is signed, word for
 * word. Do not edit a string here without a new sign-off (legal-content path).
 *
 *  - Subject `Welcome to Lawie, {name}`; with no name `Welcome to Lawie` (no "Advocate"
 *    fallback: Lawie does not verify enrolment, review item 47).
 *  - Heading `Welcome, {name}.`; with no name `Welcome.`
 *  - Preheader `Your Lawie account is ready.` (review item 25).
 *  - Body AJ-556-M1, button `Open your dashboard`, the responsibility line (T-557).
 *  - Footer (review item 25): footer1 is the reset mail's line with the supplier street address
 *    (built as passwordReset.tsx footer1() does, from its exported strings), footer2 the reset
 *    mail's, footer3 the T-559 line, footer4 the verify mail's.
 *
 * Data shape: the worker builds this from auth's /internal/welcome/prepare response. It is NEVER
 * taken from job data (the job carries the userId only, T-587 option A):
 *   {
 *     name?: string;           // display name; blank or absent → the no-name forms
 *     loginUrl?: string;       // `${FRONTEND_URL}/login`
 *     streetAddress?: string;  // footer line 1, the worker's GST_ADDRESS; absent only in dry run
 *   }
 */
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

import type { TemplateDef } from '../index';

import { PASSWORD_RESET_STRINGS, STREET_ADDRESS_MARKER } from './passwordReset';
import { VERIFY_EMAIL_STRINGS } from './verifyEmail';

interface WelcomeData {
  name?: unknown;
  loginUrl?: unknown;
  streetAddress?: unknown;
}

export const WELCOME_STRINGS = {
  /** `{name}` is replaced with the display name. */
  subject: 'Welcome to Lawie, {name}',
  subjectNoName: 'Welcome to Lawie',
  heading: 'Welcome, {name}.',
  headingNoName: 'Welcome.',
  preheader: 'Your Lawie account is ready.',
  body: 'You can now describe your matter and get a first draft of a bail application, notice, writ or maintenance petition to review and edit before you file. Criminal drafts use BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law applies.',
  button: 'Open your dashboard',
  disclaimer:
    'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.',
  /** `{street}` is replaced with the supplier address (or STREET_ADDRESS_MARKER). */
  footer1: PASSWORD_RESET_STRINGS.footer1,
  /** Line 1 when the supplier address already names the city (no "Ranchi, Jharkhand" twice). */
  footer1WithCity: PASSWORD_RESET_STRINGS.footer1WithCity,
  footer2: PASSWORD_RESET_STRINGS.footer2,
  footer3: 'Help, data and privacy requests: contact@lawie.in',
  footer4: VERIFY_EMAIL_STRINGS.footer4,
} as const;

const S = WELCOME_STRINGS;

const DEFAULT_LOGIN_URL = 'https://lawie.in/login';

/** The display name, trimmed; null when absent or blank (the no-name forms are used). */
function displayName(data: WelcomeData): string | null {
  if (typeof data.name !== 'string') return null;
  const name = data.name.trim();
  return name.length > 0 ? name : null;
}

/** Footer line 1, as the reset mail builds it. Rendering reads no env. */
function footer1(data: WelcomeData): string {
  const street =
    typeof data.streetAddress === 'string' && data.streetAddress.trim().length > 0
      ? data.streetAddress.trim()
      : null;
  if (street === null) return S.footer1.replace('{street}', STREET_ADDRESS_MARKER);
  const line = /\branchi\b/i.test(street) ? S.footer1WithCity : S.footer1;
  return line.replace('{street}', street);
}

function loginUrlOf(data: WelcomeData): string {
  return typeof data.loginUrl === 'string' && data.loginUrl.length > 0
    ? data.loginUrl
    : DEFAULT_LOGIN_URL;
}

const smallStyle = { color: '#0D1F3C99', fontSize: 11, lineHeight: '18px', margin: 0 } as const;

export const authWelcomeTemplate: TemplateDef<WelcomeData> = {
  subject: (data) => {
    const name = displayName(data);
    return name === null ? S.subjectNoName : S.subject.replace('{name}', name);
  },
  Body: (data) => {
    const name = displayName(data);
    const heading = name === null ? S.headingNoName : S.heading.replace('{name}', name);
    const loginUrl = loginUrlOf(data);
    return (
      <Html>
        <Head />
        <Preview>{S.preheader}</Preview>
        <Body
          style={{
            backgroundColor: '#EFE9DF',
            fontFamily: 'Helvetica, Arial, sans-serif',
            margin: 0,
            padding: 0,
          }}
        >
          <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
            <Heading style={{ color: '#0D1F3C', fontSize: 24 }}>{heading}</Heading>
            <Text style={{ color: '#0D1F3C', fontSize: 14, lineHeight: '22px' }}>{S.body}</Text>
            <Section style={{ marginTop: 24 }}>
              <Link
                href={loginUrl}
                style={{
                  backgroundColor: '#E63E2C',
                  color: '#FFFFFF',
                  borderRadius: 6,
                  padding: '12px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {S.button}
              </Link>
            </Section>
            <Hr style={{ borderColor: '#0D1F3C20', margin: '32px 0 16px' }} />
            <Text style={{ color: '#0D1F3C99', fontSize: 11, lineHeight: '18px' }}>
              {S.disclaimer}
            </Text>
            <Text style={smallStyle}>{footer1(data)}</Text>
            <Text style={smallStyle}>{S.footer2}</Text>
            <Text style={smallStyle}>{S.footer3}</Text>
            <Text style={smallStyle}>{S.footer4}</Text>
          </Container>
        </Body>
      </Html>
    );
  },
};
