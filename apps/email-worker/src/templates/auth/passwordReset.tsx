/**
 * T-221 — password reset. Two variants; every visible string is signed copy, word for word.
 * Do not edit a string here without a new sign-off.
 *
 *   link    E1, the account has a password: a 30-minute, single-use reset link.
 *           handoff/marketing/copy/forgot-password-t221.md ("Email: auth.passwordReset"),
 *           approved by Ajay, every variant (handoff/legal/T-221-forgot-password-signed.md).
 *           Main subject, preheader and button (variant A).
 *   google  E2, a Google-only account: no link, points to sign-in (AC6). Ticket section
 *           "Copy (Madhuri, final, 11 Oct 2026)" > "Email E2", unchanged per the signed file.
 *
 * Data shape: the worker builds this from auth's /internal/password-reset/mint response. It is
 * NEVER taken from job data (the job carries the userId only):
 *   {
 *     variant: 'link' | 'google';  // required
 *     resetUrl?: string;           // link: required. google: must be absent
 *     loginUrl?: string;           // google: required. link: must be absent
 *     streetAddress?: string;      // footer line 1; absent only in dry run
 *   }
 * Any other combination refuses to render (thrown messages name no value). No name, no address,
 * no greeting (AC1a of T-225; the copy has a heading instead).
 *
 * Footer: T-225 AC1c lines 2-4. Line 1 is Ajay's signed address with the supplier's registered
 * address (T-221-forgot-password-signed.md condition 1). `streetAddress` in the data is the
 * worker's GST_ADDRESS (billing's seller address), read at send time and never written here.
 * The city is not repeated: if the value already names Ranchi, line 1 is
 * "Lawie (Sole Proprietorship), <address>"; otherwise "Lawie (Sole Proprietorship), <address>,
 * Ranchi, Jharkhand". Without it (dry run only: the worker refuses a live send before minting)
 * line 1 shows STREET_ADDRESS_MARKER so a reviewer can see where it goes. Rendering itself
 * reads no env.
 *
 * Plain text: the same lines, with `{button}: {url}` in place of the button.
 */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

import type { TemplateDef } from '../index';

export type PasswordResetVariant = 'link' | 'google';

interface PasswordResetData {
  variant?: unknown;
  resetUrl?: unknown;
  loginUrl?: unknown;
  streetAddress?: unknown;
}

/** Shown in footer line 1 when no street address was supplied (dry run only). */
export const STREET_ADDRESS_MARKER = '[street address from config]';

/** Every user-facing string of both variants, in one place for copy edits. */
export const PASSWORD_RESET_STRINGS = {
  // E1 — account with a password.
  linkSubject: 'Reset your Lawie password',
  linkPreheader: 'This link works once and expires in 30 minutes.',
  linkHeading: 'Reset your password',
  linkIntro: 'We got a request to reset the password for your Lawie account.',
  linkButton: 'Set a new password',
  linkExpiry:
    'This link works once and expires in 30 minutes. After you set a new password, you will be signed out on your other devices.',
  linkNotYou: "Didn't ask for this? Ignore this email. Your password stays the same.",
  linkNeverShare:
    'Never share this link. Lawie will never ask for your password by email or phone.',
  // E2 — Google-only account.
  googleSubject: 'Sign in to Lawie with Google',
  googlePreheader: 'Your account uses Google sign-in. No password to reset.',
  googleHeading: 'Your account uses Google sign-in',
  googleIntro:
    'We got a request to reset the password for your Lawie account. Your account signs in with Google, so it has no Lawie password to reset.',
  googleHowTo: 'To get in, open Lawie and choose "Continue with Google".',
  googleButton: 'Go to sign in',
  googleNotYou: "Didn't ask for this? Ignore this email. Nothing has changed on your account.",
  // Both.
  signOff: 'Team Lawie',
  /** `{street}` is replaced with the supplier address (or STREET_ADDRESS_MARKER). */
  footer1: 'Lawie (Sole Proprietorship), {street}, Ranchi, Jharkhand',
  /** Line 1 when the supplier address already names the city (no "Ranchi, Jharkhand" twice). */
  footer1WithCity: 'Lawie (Sole Proprietorship), {street}',
  footer2: 'You are receiving this because you have a Lawie account.',
  footer3: 'Help, data and privacy requests: contact@lawie.in',
  footer4: 'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms',
} as const;

const S = PASSWORD_RESET_STRINGS;

type Resolved = { variant: 'link'; url: string } | { variant: 'google'; url: string };

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

function footer1(data: PasswordResetData): string {
  const street =
    typeof data.streetAddress === 'string' && data.streetAddress.trim().length > 0
      ? data.streetAddress.trim()
      : null;
  if (street === null) return S.footer1.replace('{street}', STREET_ADDRESS_MARKER);
  const line = /\branchi\b/i.test(street) ? S.footer1WithCity : S.footer1;
  return line.replace('{street}', street);
}

function resolve(data: PasswordResetData): Resolved {
  // Never render a reset email without its URL, or a Google email with a reset link.
  if (data.variant === 'link' && nonEmpty(data.resetUrl) && data.loginUrl === undefined) {
    return { variant: 'link', url: data.resetUrl };
  }
  if (data.variant === 'google' && nonEmpty(data.loginUrl) && data.resetUrl === undefined) {
    return { variant: 'google', url: data.loginUrl };
  }
  throw new Error('auth.passwordReset rendered without a valid variant and URL');
}

/** The lines of each variant, in order. `button` marks where the button (or its text line) goes. */
function lines(r: Resolved): {
  heading: string;
  before: string[];
  button: string;
  after: string[];
} {
  if (r.variant === 'link') {
    return {
      heading: S.linkHeading,
      before: [S.linkIntro],
      button: S.linkButton,
      after: [S.linkExpiry, S.linkNotYou, S.linkNeverShare],
    };
  }
  return {
    heading: S.googleHeading,
    before: [S.googleIntro, S.googleHowTo],
    button: S.googleButton,
    after: [S.googleNotYou],
  };
}

const textStyle = { color: '#0D1F3C', fontSize: 14, lineHeight: '22px' } as const;
const headingStyle = { ...textStyle, fontSize: 18, fontWeight: 700 } as const;
const smallStyle = { color: '#0D1F3C99', fontSize: 11, lineHeight: '18px', margin: 0 } as const;

export const authPasswordResetTemplate: TemplateDef<PasswordResetData> = {
  subject: (data) => (resolve(data).variant === 'link' ? S.linkSubject : S.googleSubject),
  text: (data) => {
    const r = resolve(data);
    const l = lines(r);
    const out: string[] = [l.heading, ''];
    for (const line of l.before) out.push(line, '');
    out.push(`${l.button}: ${r.url}`, '');
    for (const line of l.after) out.push(line, '');
    out.push(S.signOff, '', '--', footer1(data), S.footer2, S.footer3, S.footer4, '');
    return out.join('\n');
  },
  Body: (data) => {
    const r = resolve(data);
    const l = lines(r);
    return (
      <Html>
        <Head />
        <Preview>{r.variant === 'link' ? S.linkPreheader : S.googlePreheader}</Preview>
        <Body
          style={{
            backgroundColor: '#EFE9DF',
            fontFamily: 'Helvetica, Arial, sans-serif',
            margin: 0,
            padding: 0,
          }}
        >
          <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
            <Text style={headingStyle}>{l.heading}</Text>
            {l.before.map((line) => (
              <Text key={line} style={textStyle}>
                {line}
              </Text>
            ))}
            <Section style={{ marginTop: 24, marginBottom: 24 }}>
              <Link
                href={r.url}
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
                {l.button}
              </Link>
            </Section>
            {l.after.map((line) => (
              <Text key={line} style={textStyle}>
                {line}
              </Text>
            ))}
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
