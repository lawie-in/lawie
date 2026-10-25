/**
 * T-358 — notice before an unverified account is deleted. Two variants, every visible string
 * Ajay's signed text, word for word (handoff/legal/dpdp-v1-calls-signed.md). Do not edit a
 * string here without a new sign-off.
 *
 *   A  active account, WITH a verify link (lasting 7 days). Body from "Update (14 Oct 2026)"
 *      (a84e298); subject, preheader, greeting, button and footer lines 1-2 from §8 row 3
 *      (08a0d09); footer lines 3-4 are the invoice email's (gst-tax-invoice-signed.md
 *      Addendum 5).
 *   B  deactivated account, NO link (§9, 3f94ce9). Footer the same as A.
 *
 * Data shape: the worker builds this from auth's /internal/unverified-notice/prepare response.
 * It is NEVER taken from job data (the job carries the userId only):
 *   {
 *     variant: 'A' | 'B';    // explicit; required
 *     name: string;          // greeting only; empty gives "Hello,"
 *     verifyUrl?: string;    // A: required. B: must be absent (a link we know cannot work
 *                            // must not be sent, Arjun 23:32)
 *     deletionDate: string;  // already formatted by auth: "21 October 2026" (IST)
 *   }
 * Any other combination refuses to render (thrown messages name no value).
 *
 * Subjects are fixed strings: no name, no address, no date.
 * Plain text (A): the same lines, with `Verify email address: {verifyUrl}` in place of the
 * button (the invoice email's "{button}: {url}" pattern). (B) has no button.
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

export type UnverifiedNoticeVariant = 'A' | 'B';

interface UnverifiedDeletionNoticeData {
  variant?: unknown;
  name?: string;
  verifyUrl?: string;
  deletionDate?: string;
}

// ── Variant A (unchanged from round 1) ──────────────────────────────────────

export const UNVERIFIED_DELETION_NOTICE_SUBJECT = 'Verify your email to keep your Lawie account';
export const UNVERIFIED_DELETION_NOTICE_STRINGS = {
  /** `{date}` is replaced with the formatted deletion date. */
  preheader: 'We will delete your account on {date} unless you verify your email address.',
  /** `{name}` is replaced with the name; an empty name uses greetingNoName. */
  greeting: 'Hello {name},',
  greetingNoName: 'Hello,',
  /** `{date}` is replaced with the formatted deletion date. */
  body: 'Please verify your email address. If it is not verified by {date}, we will delete your Lawie account and everything in it.',
  button: 'Verify email address',
  footer1: 'Lawie (Sole Proprietorship), Ranchi, Jharkhand',
  footer2: 'You are receiving this because this email address was used to sign up for Lawie.',
  footer3: 'Help, data and privacy requests: contact@lawie.in',
  footer4: 'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms',
} as const;

// ── Variant B (Ajay §9, 3f94ce9) ────────────────────────────────────────────

export const UNVERIFIED_DELETION_NOTICE_B_SUBJECT =
  'Your deactivated Lawie account will be deleted';
export const UNVERIFIED_DELETION_NOTICE_B_STRINGS = {
  /** `{date}` is replaced with the formatted deletion date. */
  preheader: 'We will delete it on {date} unless you write to us before then.',
  /** As in A. */
  greeting: 'Hello {name},',
  greetingNoName: 'Hello,',
  /** `{date}` is replaced with the formatted deletion date. */
  body: 'This Lawie account was deactivated and its email address was never verified. We will delete the account and everything in it on {date}. If you want to keep it, write to contact@lawie.in from this email address before then.',
  /** The same as A. */
  footer1: 'Lawie (Sole Proprietorship), Ranchi, Jharkhand',
  footer2: 'You are receiving this because this email address was used to sign up for Lawie.',
  footer3: 'Help, data and privacy requests: contact@lawie.in',
  footer4: 'Privacy Policy: https://lawie.in/privacy · Terms: https://lawie.in/terms',
} as const;

const A = UNVERIFIED_DELETION_NOTICE_STRINGS;
const B = UNVERIFIED_DELETION_NOTICE_B_STRINGS;

interface Resolved {
  variant: UnverifiedNoticeVariant;
  subject: string;
  /** Variant A only. */
  url?: string;
  greeting: string;
  preheader: string;
  body: string;
  footer: readonly string[];
}

function resolve(data: UnverifiedDeletionNoticeData): Resolved {
  // Never render an invalid combination. Thrown messages name no value.
  const variant = data.variant;
  if (variant !== 'A' && variant !== 'B') {
    throw new Error('auth.unverifiedDeletionNotice rendered without a valid variant');
  }
  if (typeof data.deletionDate !== 'string' || data.deletionDate.length === 0) {
    throw new Error('auth.unverifiedDeletionNotice rendered without a deletionDate');
  }
  const hasUrl = typeof data.verifyUrl === 'string' && data.verifyUrl.length > 0;
  if (variant === 'A' && !hasUrl) {
    throw new Error('auth.unverifiedDeletionNotice variant A rendered without a verifyUrl');
  }
  if (variant === 'B' && data.verifyUrl !== undefined) {
    throw new Error('auth.unverifiedDeletionNotice variant B rendered with a verifyUrl');
  }
  const S = variant === 'A' ? A : B;
  // Replacement callbacks, not strings: a name or date holding $&, $', $` or $$ is inserted
  // literally (String.replace would otherwise expand them).
  const date = data.deletionDate;
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  return {
    variant,
    subject:
      variant === 'A' ? UNVERIFIED_DELETION_NOTICE_SUBJECT : UNVERIFIED_DELETION_NOTICE_B_SUBJECT,
    url: variant === 'A' ? (data.verifyUrl as string) : undefined,
    greeting: name.length > 0 ? S.greeting.replace('{name}', () => name) : S.greetingNoName,
    preheader: S.preheader.replace('{date}', () => date),
    body: S.body.replace('{date}', () => date),
    footer: [S.footer1, S.footer2, S.footer3, S.footer4],
  };
}

const textStyle = { color: '#0D1F3C', fontSize: 14, lineHeight: '22px' } as const;
const smallStyle = { color: '#0D1F3C99', fontSize: 11, lineHeight: '18px', margin: 0 } as const;

export const authUnverifiedDeletionNoticeTemplate: TemplateDef<UnverifiedDeletionNoticeData> = {
  subject: (data) => resolve(data).subject,
  text: (data) => {
    const r = resolve(data);
    return [
      r.greeting,
      '',
      r.body,
      '',
      ...(r.url ? [`${A.button}: ${r.url}`, ''] : []),
      '--',
      ...r.footer,
      '',
    ].join('\n');
  },
  Body: (data) => {
    const r = resolve(data);
    return (
      <Html>
        <Head />
        <Preview>{r.preheader}</Preview>
        <Body
          style={{
            backgroundColor: '#EFE9DF',
            fontFamily: 'Helvetica, Arial, sans-serif',
            margin: 0,
            padding: 0,
          }}
        >
          <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
            <Text style={textStyle}>{r.greeting}</Text>
            <Text style={textStyle}>{r.body}</Text>
            {r.url ? (
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
                  {A.button}
                </Link>
              </Section>
            ) : null}
            <Hr style={{ borderColor: '#0D1F3C20', margin: '32px 0 16px' }} />
            {r.footer.map((line) => (
              <Text key={line} style={smallStyle}>
                {line}
              </Text>
            ))}
          </Container>
        </Body>
      </Html>
    );
  },
};
