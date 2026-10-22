/**
 * T-223 — verify-your-email. Every visible string is Ajay's signed text, word for word
 * (handoff/legal/T-223-verify-email-signed.md, part A; main subject and button only, never
 * the unsigned alternates B and C). Do not edit a string here without a new sign-off.
 * T-522: the preheader, body (two variants) and expiry line are AJ-522-S1 (Ajay, 22 Oct 2026,
 * handoff/legal/T-511-copy-rulings-ajay.md), for the 30-minute `signin` link. EN only.
 *
 * Data shape: the worker builds this from auth's /internal/verify-email/mint response. It is
 * NEVER taken from job data (the job carries the userId only):
 *   {
 *     name: string;       // greeting only
 *     verifyUrl: string;  // `${FRONTEND_URL}/verify-email?token=<token>`
 *     signupInkGranted?: boolean; // T-522: from the mint response; picks the body variant
 *   }
 *
 * The subject is a fixed string: it carries no name and no address.
 *
 * Footer: T-225 AC1c, except line 2, which Ajay changed for this email only (the recipient
 * may not be the person who signed up). Line 1 is Ajay's signed address
 * (handoff/legal/gst-tax-invoice-signed.md, Addendum 4 point 3, T-436): no street line and no
 * bracketed placeholders. placeholders.ts still refuses a live send if one ever comes back.
 *
 * Plain text: the signed body with `Verify email: {verifyUrl}` in place of the button, built
 * by `text()` below rather than derived from the HTML.
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

interface VerifyEmailData {
  name?: string;
  verifyUrl?: string;
  /** T-522 (AJ-522-S1): true once the sign-up Ink was granted; picks the shorter body. */
  signupInkGranted?: boolean;
}

export const VERIFY_EMAIL_SUBJECT = 'Verify your Lawie email';
export const VERIFY_EMAIL_STRINGS = {
  preheader: 'This link works once and expires in 30 minutes.',
  body: 'Please verify your email address for your Lawie account. You need a verified email to start drafting, buy Ink and receive your 5 sign-up Ink.',
  // T-522 (AJ-522-S1): the body for an account that has already had its sign-up Ink.
  bodyInkGranted:
    'Please verify your email address for your Lawie account. You need a verified email to start drafting and buy Ink.',
  button: 'Verify email',
  expiry:
    'This link works once, expires in 30 minutes and signs you in, so do not forward it. If it no longer works, sign in and ask for a new one.',
  fallback: "If the button doesn't work, copy this link into your browser:",
  notYou:
    "Didn't create a Lawie account? Ignore this email: without this link, nothing is verified. To have the account removed, write to contact@lawie.in.",
  help: 'Need help? Write to contact@lawie.in.',
  disclaimer:
    'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.',
  signOff: 'Team Lawie',
  footer1: 'Lawie (Sole Proprietorship), Ranchi, Jharkhand',
  footer2: 'You are receiving this because this address was used to create a Lawie account.',
  footer3: 'Help, data and privacy requests: contact@lawie.in',
  footer4: 'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms',
} as const;

const S = VERIFY_EMAIL_STRINGS;

/** T-522 (AJ-522-S1): drop the sign-up Ink clause once that grant has been made. */
function bodyFor(data: VerifyEmailData): string {
  return data.signupInkGranted === true ? S.bodyInkGranted : S.body;
}

function requireUrl(data: VerifyEmailData): string {
  // Never render a verify email without its link. The thrown message names no value.
  if (typeof data.verifyUrl !== 'string' || data.verifyUrl.length === 0) {
    throw new Error('auth.verifyEmail rendered without a verifyUrl');
  }
  return data.verifyUrl;
}

const textStyle = { color: '#0D1F3C', fontSize: 14, lineHeight: '22px' } as const;
const smallStyle = { color: '#0D1F3C99', fontSize: 11, lineHeight: '18px', margin: 0 } as const;

export const authVerifyEmailTemplate: TemplateDef<VerifyEmailData> = {
  subject: () => VERIFY_EMAIL_SUBJECT,
  text: (data) => {
    const url = requireUrl(data);
    const name = data.name ?? '';
    return [
      `Hello ${name},`,
      '',
      bodyFor(data),
      '',
      `Verify email: ${url}`,
      '',
      S.expiry,
      '',
      S.fallback,
      url,
      '',
      S.notYou,
      S.help,
      '',
      S.disclaimer,
      '',
      S.signOff,
      '',
      '--',
      S.footer1,
      S.footer2,
      S.footer3,
      S.footer4,
      '',
    ].join('\n');
  },
  Body: (data) => {
    const url = requireUrl(data);
    const name = data.name ?? '';
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
            <Text style={textStyle}>{`Hello ${name},`}</Text>
            <Text style={textStyle}>{bodyFor(data)}</Text>
            <Section style={{ marginTop: 24, marginBottom: 24 }}>
              <Link
                href={url}
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
            <Text style={textStyle}>{S.expiry}</Text>
            <Text style={textStyle}>
              {S.fallback}
              <br />
              <Link href={url} style={{ color: '#0D1F3C', wordBreak: 'break-all' }}>
                {url}
              </Link>
            </Text>
            <Text style={textStyle}>
              {S.notYou}
              <br />
              {S.help}
            </Text>
            <Text style={textStyle}>{S.disclaimer}</Text>
            <Text style={textStyle}>{S.signOff}</Text>
            <Hr style={{ borderColor: '#0D1F3C20', margin: '32px 0 16px' }} />
            <Text style={smallStyle}>{S.footer1}</Text>
            <Text style={smallStyle}>{S.footer2}</Text>
            <Text style={smallStyle}>{S.footer3}</Text>
            <Text style={smallStyle}>{S.footer4}</Text>
          </Container>
        </Body>
      </Html>
    );
  },
};
