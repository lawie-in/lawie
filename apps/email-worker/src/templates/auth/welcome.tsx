/**
 * STUB — Stage A welcome template. Real copy ships from Madhuri via
 * email-templates.md and replaces the body + subject below.
 *
 * Data shape (what auth.registerUser passes in):
 *   {
 *     name: string;      // advocate full name
 *     loginUrl: string;  // https://lawie.in/login
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

interface WelcomeData {
  name?: string;
  loginUrl?: string;
}

export const authWelcomeTemplate: TemplateDef<WelcomeData> = {
  subject: (data) => `Welcome to Lawie, ${data.name ?? 'Advocate'}`,
  Body: (data) => {
    const name = data.name ?? 'Advocate';
    const loginUrl = data.loginUrl ?? 'https://lawie.in/login';
    return (
      <Html>
        <Head />
        <Preview>Welcome to Lawie — your AI legal drafting workspace.</Preview>
        <Body
          style={{
            backgroundColor: '#EFE9DF',
            fontFamily: 'Helvetica, Arial, sans-serif',
            margin: 0,
            padding: 0,
          }}
        >
          <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 24px' }}>
            <Heading style={{ color: '#0D1F3C', fontSize: 24 }}>Welcome, {name}.</Heading>
            <Text style={{ color: '#0D1F3C', fontSize: 14, lineHeight: '22px' }}>
              You can now draft court-ready documents — bail applications, legal notices, rent
              agreements, and more — formatted to your court&apos;s rules, with the right BNS / BNSS
              sections, in under five minutes per document.
            </Text>
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
                Open your dashboard
              </Link>
            </Section>
            <Hr style={{ borderColor: '#0D1F3C20', margin: '32px 0 16px' }} />
            <Text style={{ color: '#0D1F3C99', fontSize: 11, lineHeight: '18px' }}>
              AI-assisted drafting — verify with applicable law before filing. Lawie does not
              provide legal advice.
            </Text>
          </Container>
        </Body>
      </Html>
    );
  },
};
