/**
 * T-522 (AJ-522-M5, Ajay; text from AJ-511-M3) — the mail to an EXISTING address when someone
 * submits the sign-up form with it. Sign-up attempts only; EN only. Subject and body are signed,
 * word for word. Do not edit a string here without a new sign-off.
 *
 * No other new copy: the two links render as their URLs (no button labels, no preheader; AJ-522-S9
 * approves bare URLs to the plain sign-in and forgot-password pages, no token).
 * AJ-522-S9 (Ajay, 22 Oct 2026): signOff (verify mail), footer2 (reset mail) and footer4 stay;
 * footer1 is the reset mail's line with the supplier street address (same rule as
 * passwordReset.tsx footer1(), built here from its exported strings); footer3 is the T-559 line
 * with no privacy@ address.
 *
 * Data shape: the worker builds this from auth's /internal/signup-attempt/prepare response. It
 * is NEVER taken from job data (the job carries the userId only, T-223 condition 1):
 *   {
 *     signInUrl: string;  // `${FRONTEND_URL}/login`
 *     resetUrl: string;   // `${FRONTEND_URL}/forgot-password` (a page, never a token)
 *     streetAddress?: string; // footer line 1, the worker's GST_ADDRESS; absent only in dry run
 *   }
 * No name, no address in the body.
 */
import { Body, Container, Head, Hr, Html, Link, Text } from '@react-email/components';

import type { TemplateDef } from '../index';

import { PASSWORD_RESET_STRINGS, STREET_ADDRESS_MARKER } from './passwordReset';
import { VERIFY_EMAIL_STRINGS } from './verifyEmail';

interface SignupAttemptData {
  signInUrl?: unknown;
  resetUrl?: unknown;
  streetAddress?: unknown;
}

export const SIGNUP_ATTEMPT_SUBJECT = 'About your Lawie account';
export const SIGNUP_ATTEMPT_STRINGS = {
  body: 'Someone tried to create a Lawie account with this email. If it was you, sign in or reset your password. If not, you can ignore this email.',
  signOff: VERIFY_EMAIL_STRINGS.signOff,
  /** `{street}` is replaced with the supplier address (or STREET_ADDRESS_MARKER). */
  footer1: PASSWORD_RESET_STRINGS.footer1,
  /** Line 1 when the supplier address already names the city (no "Ranchi, Jharkhand" twice). */
  footer1WithCity: PASSWORD_RESET_STRINGS.footer1WithCity,
  footer2: PASSWORD_RESET_STRINGS.footer2,
  footer3: 'Help, data and privacy requests: contact@lawie.in',
  footer4: VERIFY_EMAIL_STRINGS.footer4,
} as const;

const S = SIGNUP_ATTEMPT_STRINGS;

/** Footer line 1, as the reset mail builds it (AJ-522-S9). Rendering reads no env. */
function footer1(data: SignupAttemptData): string {
  const street =
    typeof data.streetAddress === 'string' && data.streetAddress.trim().length > 0
      ? data.streetAddress.trim()
      : null;
  if (street === null) return S.footer1.replace('{street}', STREET_ADDRESS_MARKER);
  const line = /\branchi\b/i.test(street) ? S.footer1WithCity : S.footer1;
  return line.replace('{street}', street);
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function requireUrls(data: SignupAttemptData): { signInUrl: string; resetUrl: string } {
  // Never render this mail without both links. The thrown message names no value.
  if (!nonEmpty(data.signInUrl) || !nonEmpty(data.resetUrl)) {
    throw new Error('auth.signupAttempt rendered without its links');
  }
  return { signInUrl: data.signInUrl, resetUrl: data.resetUrl };
}

const textStyle = { color: '#0D1F3C', fontSize: 14, lineHeight: '22px' } as const;
const smallStyle = { color: '#0D1F3C99', fontSize: 11, lineHeight: '18px', margin: 0 } as const;
const linkStyle = { color: '#0D1F3C', wordBreak: 'break-all' } as const;

export const authSignupAttemptTemplate: TemplateDef<SignupAttemptData> = {
  subject: () => SIGNUP_ATTEMPT_SUBJECT,
  text: (data) => {
    const { signInUrl, resetUrl } = requireUrls(data);
    return [
      S.body,
      '',
      signInUrl,
      resetUrl,
      '',
      S.signOff,
      '',
      '--',
      footer1(data),
      S.footer2,
      S.footer3,
      S.footer4,
      '',
    ].join('\n');
  },
  Body: (data) => {
    const { signInUrl, resetUrl } = requireUrls(data);
    return (
      <Html>
        <Head />
        <Body
          style={{
            backgroundColor: '#EFE9DF',
            fontFamily: 'Helvetica, Arial, sans-serif',
            margin: 0,
            padding: 0,
          }}
        >
          <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
            <Text style={textStyle}>{S.body}</Text>
            <Text style={textStyle}>
              <Link href={signInUrl} style={linkStyle}>
                {signInUrl}
              </Link>
              <br />
              <Link href={resetUrl} style={linkStyle}>
                {resetUrl}
              </Link>
            </Text>
            <Text style={textStyle}>{S.signOff}</Text>
            <Hr style={{ borderColor: '#0D1F3C20', margin: '32px 0 16px' }} />
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
