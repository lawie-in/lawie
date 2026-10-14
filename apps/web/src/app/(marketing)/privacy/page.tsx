import { Calendar } from 'lucide-react';
import type { Metadata } from 'next';

import CookieSettingsButton from '@/components/CookieSettingsButton';
import FloatCta from '@/components/marketing/FloatCta';
import SiteFooter from '@/components/marketing/SiteFooter';
import SiteNav from '@/components/marketing/SiteNav';

export const metadata: Metadata = {
  title: 'Lawie — Privacy Policy',
  description:
    'What Lawie collects, why, who receives it, and your rights under the Digital Personal Data Protection Act, 2023.',
};

// Text signed by Ajay (CLO): handoff/legal/T-235-privacy-policy-signed.md, including the
// erase-runbook changes to §7 and §9. Apply word for word; any other wording goes back to him.
// T-308: §6 heading and body and the §5 Google row from handoff/legal/T-308-analytics-privacy-signed.md.
// T-310: §6 body is Ajay's "§6 text once T-310 ships" (handoff/legal/T-310-consent-notice-signed.md,
// SHA-256 of the block plus a final newline: ecd2b0be2d751d0e194c7fe5f81cb8edc3342aa2a5f28eb39d04d5976f66a4be);
// the §5 Google row is Addendum 1 of the T-308 file (fonts self-hosted).
// T-242: §6 body is Ajay's "§6 v3" and the §1 "How you found us" bullet is his new §1 bullet
// (handoff/legal/T-242-signup-source-signed.md, SHA-256 of the §6 block plus a final newline:
// a98bbde316ff1fd6e234beef685124be3cf70a48ca0bc2a8576df14909dc81e8). It replaces the T-310 block.
// T-115c: §7 paragraph and the §9 bullets are Ajay's, signed in handoff/legal/dpdp-v1-calls-signed.md
// (e13d474, "T-115c: erase list and Privacy Policy text"); T-115b has merged, so the
// single-document clause ships. The §5 Atlas row and the Atlas half of the §3 line say
// "India (Mumbai)" (Ajay's addendum ef06e89 in T-235-privacy-policy-signed.md; Redis unchanged).
// T-115c review (Ajay b26b017, dpdp-v1-calls-signed.md §7): the §7 Sentry sentence is out until
// a self-serve close alerts the operator; §9 adds the sent-emails bullet.

// T-310: set to the T-310 merge date at merge. Keep in step with CURRENT_PRIVACY_VERSION in
// apps/auth/src/models/User.model.ts (the same date as YYYY-MM-DD, plus a letter suffix when the
// policy changes more than once on one date, e.g. '2026-10-12b' for T-242).
const PRIVACY_LAST_UPDATED = '14 October 2026';

// Byte for byte; one string so the hash can be checked.
const SECTION_6_BODY =
  "To keep you signed in, we store a sign-in token in your browser's local storage; it carries your name and email. We also store your referral code, the campaign tags of the link that brought you to Lawie (until you close the tab), and small display settings in your browser. Signing out removes the sign-in token. On our public pages, the ones you can open without signing in, Google Analytics loads only if you accept it in the cookie notice; it then sets cookies whose names start with _ga so we can count visits. It does not run on the sign-in pages or anywhere inside your account. We keep a record of your choice (a random number, the choice, the version of the notice and the time, but not your name, email or IP address) for 12 months, and ask again after 12 months or when the notice changes. You can change your choice at any time with Cookie settings at the bottom of every public page. Lawie sets no other cookies. Clearing your browser's site data removes what is stored in your browser.";

const sections = [
  { id: 'collect', title: '1. Information We Collect' },
  { id: 'use', title: '2. How We Use Information' },
  { id: 'storage', title: '3. Where Data Is Stored, and Backups' },
  { id: 'encryption', title: '4. Encryption of Your Documents' },
  { id: 'third-party', title: '5. Who Else Receives Data' },
  { id: 'browser-storage', title: '6. Browser Storage and Cookies' },
  { id: 'rights', title: '7. Your Rights' },
  { id: 'clients', title: "8. Your Clients' Data" },
  { id: 'retention', title: '9. How Long We Keep Data' },
  { id: 'children', title: '10. Children' },
  { id: 'contact', title: '11. Contact and Grievances' },
];

const providers = [
  {
    provider: 'Anthropic',
    receives: 'Your form answers, description, brief and account name',
    why: 'Writes the draft',
    where: 'United States',
  },
  {
    provider: 'Amazon Web Services',
    receives: 'Everything we hold',
    why: 'Hosting; service emails (Amazon SES)',
    where: 'India (Mumbai)',
  },
  {
    provider: 'MongoDB Atlas',
    receives: 'Account data, case details, drafts',
    why: 'Database',
    where: 'India (Mumbai)',
  },
  {
    provider: 'Redis Cloud',
    receives: 'Name, email, plan, IP address and browser details for your session',
    why: 'Keeps you signed in',
    where: 'May be outside India',
  },
  {
    provider: 'Sentry',
    receives: 'Error reports, which may include your name, email and IP address',
    why: 'Finding and fixing errors',
    where: 'May be outside India',
  },
  {
    provider: 'Razorpay',
    receives: 'Your account ID, email and payment details',
    why: 'Payments',
    where: 'India',
  },
  {
    provider: 'Google',
    receives:
      'Your name, email and Google account ID (if you use Google sign-in); on our public pages only, and only if you accept analytics, your IP address, browser details and the address of the page you visit (Google Analytics)',
    why: 'Sign-in; counting visits to public pages',
    where: 'May be outside India',
  },
  {
    provider: 'Helicone',
    receives: 'Draft text sent before 9 October 2026',
    why: 'Monitoring of AI requests (no longer used)',
    where: 'United States',
  },
];

const cellStyle = {
  padding: '12px 16px 12px 0',
  borderBottom: '1px solid var(--border)',
  color: 'var(--text-2)',
  lineHeight: 1.6,
};

const headCellStyle = {
  ...cellStyle,
  color: 'var(--navy)',
  fontWeight: 600,
  borderBottom: '1px solid var(--border-strong)',
};

export default function PrivacyPage() {
  return (
    <>
      <SiteNav />

      <header className="page-hero page-hero--left">
        <div className="container">
          <span className="eyebrow" style={{ color: 'var(--gold-light)' }}>
            Legal
          </span>
          <h1 style={{ maxWidth: 'none' }}>Privacy Policy</h1>
          <p className="sub" style={{ marginLeft: 0 }}>
            What we collect, why, and your rights under the DPDP Act, 2023.
          </p>
        </div>
      </header>

      <section className="section bg-white">
        <div className="container">
          <div style={{ marginBottom: '44px' }}>
            <span className="legal-updated">
              <Calendar strokeWidth={1.5} /> Last updated: {PRIVACY_LAST_UPDATED}
            </span>
            <p
              style={{
                fontSize: '17px',
                lineHeight: 1.7,
                color: 'var(--text-2)',
                maxWidth: '720px',
              }}
            >
              This policy explains what Lawie collects, why, where it goes, and your rights under
              the Digital Personal Data Protection Act, 2023. We collect only what we need to create
              your drafts and run the Service. We do not sell personal data and we do not use it for
              advertising.
            </p>
          </div>
          <div className="legal-wrap">
            <aside className="legal-sidebar">
              <p className="toc-label">On this page</p>
              <ul className="legal-toc">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`}>{s.title}</a>
                  </li>
                ))}
              </ul>
            </aside>
            {/* minWidth 0 lets the §5 table scroll inside its own box instead of widening the page. */}
            <div className="legal-content" style={{ minWidth: 0 }}>
              <section id="collect">
                <h3>1. Information We Collect</h3>
                <ul>
                  <li>
                    Account details: your name and email; your password, stored only as a one-way
                    hash; and, if you sign in with Google, the name, email and Google account ID
                    Google shares with us. We do not receive or keep your Google password, your
                    profile picture or Google&apos;s sign-in tokens.
                  </li>
                  <li>
                    Professional details you choose to give: phone number, Bar Council, enrolment
                    number, state, practice areas and years of practice.
                  </li>
                  <li>Plan, Ink balance, payments and referrals.</li>
                  <li>
                    How you found us: if the link that brought you to Lawie carried campaign tags,
                    the source, medium and campaign named in it, saved with your account when you
                    sign up.
                  </li>
                  <li>
                    Case details you enter to create a draft: your answers to the form, your
                    description of the matter, the brief, the list of facts Lawie builds from it,
                    and the draft itself. These often contain personal data of your clients and of
                    other parties.
                  </li>
                  <li>
                    Technical data: IP address and browser details, kept with your sign-in session,
                    and server logs.
                  </li>
                  <li>
                    Waitlist details: if you join the waitlist, your name and email, the phone
                    number, city and practice area if you give them, and the link or campaign you
                    came from.
                  </li>
                </ul>
              </section>
              <section id="use">
                <h3>2. How We Use Information</h3>
                <p>
                  We use it to create the drafts you ask for, keep you signed in, take payments,
                  send you service emails, prevent misuse, and fix errors. We use case details only
                  to produce and show your drafts.
                </p>
              </section>
              <section id="storage">
                <h3>3. Where Data Is Stored, and Backups</h3>
                <ul>
                  <li>
                    Our servers run on Amazon Web Services in Mumbai, India. Our database is MongoDB
                    Atlas, in India (Mumbai). Our session store is Redis Cloud, which may store data
                    outside India.
                  </li>
                  <li>We protect data with access controls and encrypted connections (HTTPS).</li>
                  <li>
                    <strong style={{ color: 'var(--navy)', fontWeight: 600 }}>
                      We do not currently keep backups of your data.
                    </strong>{' '}
                    If our database is lost, your drafts may be lost with it. Download and keep your
                    own copy of every document you need.
                  </li>
                </ul>
              </section>
              <section id="encryption">
                <h3>4. Encryption of Your Documents</h3>
                <p>
                  Your drafts and briefs are encrypted in our database (AES-256). Your form answers
                  and the list of facts Lawie builds from your matter are not yet encrypted in the
                  same way; they are protected by the database&apos;s access controls. Enter only
                  the case details the draft needs.
                </p>
              </section>
              <section id="third-party">
                <h3 id="third-party-heading">5. Who Else Receives Data</h3>
                <p>
                  We share data only with these service providers, and only for the purpose shown:
                </p>
                <div
                  className="overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
                  style={{ marginBottom: '16px' }}
                  tabIndex={0}
                  role="region"
                  aria-labelledby="third-party-heading"
                >
                  <table
                    className="w-full text-left"
                    style={{ minWidth: '560px', fontSize: '15px', borderCollapse: 'collapse' }}
                  >
                    <thead>
                      <tr>
                        <th scope="col" style={headCellStyle}>
                          Provider
                        </th>
                        <th scope="col" style={headCellStyle}>
                          What it receives
                        </th>
                        <th scope="col" style={headCellStyle}>
                          Why
                        </th>
                        <th scope="col" style={headCellStyle}>
                          Where
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((p) => (
                        <tr key={p.provider} className="align-top">
                          <th
                            scope="row"
                            style={{ ...cellStyle, color: 'var(--navy)', fontWeight: 600 }}
                          >
                            {p.provider}
                          </th>
                          <td style={cellStyle}>{p.receives}</td>
                          <td style={cellStyle}>{p.why}</td>
                          <td style={cellStyle}>{p.where}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p>
                  Data sent abroad is transferred as the DPDP Act, 2023 allows. Each provider
                  handles it under its own terms; Helicone has the data sent to it before 9 October
                  2026 and we cannot have it deleted.
                </p>
              </section>
              <section id="browser-storage">
                <h3>6. Browser Storage and Cookies</h3>
                <p>{SECTION_6_BODY}</p>
                <CookieSettingsButton variant="privacy" />
              </section>
              <section id="rights">
                <h3>7. Your Rights</h3>
                <p>Under the DPDP Act, 2023 you may:</p>
                <ul>
                  <li>
                    ask for a summary of the personal data we hold about you and who we have shared
                    it with;
                  </li>
                  <li>ask us to correct, complete or update it;</li>
                  <li>ask us to erase your account, your documents, or both;</li>
                  <li>
                    nominate another person to exercise these rights if you die or cannot act;
                  </li>
                  <li>
                    raise a grievance with us, and, if we do not resolve it, complain to the Data
                    Protection Board of India.
                  </li>
                </ul>
                <p>
                  You can close your account and erase your data from Settings, and delete any
                  single document from the document itself. You can also write to{' '}
                  <a href="mailto:privacy@lawie.in">privacy@lawie.in</a> from your account email and
                  we will do it for you. Backup copies are erased within 7 days. We keep payment
                  records and tax invoices for as long as tax law requires; an invoice keeps the
                  name and State printed on it. Erasure cannot reach data already sent to Helicone
                  (see §5) or copies you have downloaded.
                </p>
              </section>
              <section id="clients">
                <h3>8. Your Clients&apos; Data</h3>
                <p>
                  The case details you enter are yours and your clients&apos;. You decide what to
                  enter and are responsible for having the right to share it with Lawie. We process
                  it only to create your drafts. Do not enter Aadhaar numbers, bank details, medical
                  records or other information a draft does not need.
                </p>
              </section>
              <section id="retention">
                <h3>9. How Long We Keep Data</h3>
                <ul>
                  <li>Sign-in sessions: about 24 hours (7 days if you stay signed in).</li>
                  <li>Records of changes to the fact list: 90 days.</li>
                  <li>
                    Everything else (account, case details, drafts): until you close your account or
                    delete the document. Backup copies are erased within 7 days after that.
                  </li>
                  <li>
                    Waitlist details: until you ask us to delete them, and in any case no more than
                    18 months after you joined or we last wrote to you, whichever is later.
                  </li>
                  <li>Server logs: until we delete them.</li>
                  <li>Emails we could not send: up to 30 days.</li>
                  <li>Emails we have sent: up to 7 days, even after you close your account.</li>
                  <li>
                    Payment records and tax invoices: for as long as GST law requires (72 months
                    from the due date of the annual return for the year of the invoice), even after
                    you close your account.
                  </li>
                </ul>
              </section>
              <section id="children">
                <h3>10. Children</h3>
                <p>
                  Lawie is for practising advocates. We do not knowingly collect data from anyone
                  under 18.
                </p>
              </section>
              <section id="contact">
                <h3>11. Contact and Grievances</h3>
                <p>
                  Privacy questions, rights requests and grievances:{' '}
                  <a href="mailto:privacy@lawie.in">privacy@lawie.in</a>. General support:{' '}
                  <a href="mailto:contact@lawie.in">contact@lawie.in</a>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
      <FloatCta />
    </>
  );
}
