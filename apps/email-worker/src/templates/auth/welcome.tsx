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
              You can now describe your matter and get a first draft of a bail application, notice,
              writ or maintenance petition to review and edit before you file. Criminal drafts use
              BNS, BNSS and BSA section numbers, or IPC, CrPC and the Evidence Act where the old law
              applies.
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
              Lawie is a drafting assistant. The advocate is responsible for legal accuracy and
              filing.
            </Text>
          </Container>
        </Body>
      </Html>
    );
  },
};
