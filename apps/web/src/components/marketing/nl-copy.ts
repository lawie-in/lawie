// T-517: every user-facing string on the Night Library landing, pricing (shared parts) and
// sign-up / login pages, in one place. Sources, byte for byte:
// - handoff/copy/T-511-copy-v1.md (Ajay-signed c3301bb9), sections cited per string as "§n".
// - handoff/legal/T-511-copy-rulings-ajay.md: AJ-511-M1..M19 and AJ-517-M1..M10 (8d6407d9).
// - handoff/legal/T-398-pro-card-signed.md for the Pro card (pricing page only).
// Never add a line here that is not signed. Where no signed text exists, the existing signed
// string in code is reused and marked "EXISTING"; where no signed Hindi exists, the English is
// reused and marked "NO SIGNED HI". Do not translate those yourself.
//
// Lines about unused plan Ink: AJ-509-M1 limits them to the pricing page, the terms page and
// components/billing/planCopy.ts; AJ-517-M12 (Ajay, 7106f573) adds this file's two landing lines
// (the §1.6 note and FAQ Q1). See t433-ink-expiry-copy.test.tsx.

import { CURRENT_PRIVACY_VERSION, PLANS } from '@lawie/shared';

export type Lang = 'en' | 'hi';

// ── Shared links ───────────────────────────────────────────────────────────────

/** The one primary call to action (§1.3 button 1; Priya's decision 1). */
export const SIGNUP_HREF = '/login?mode=signup';
/** Explicit ?mode=signin, never bare /login (Next 16 router-cache workaround, login page). */
export const SIGNIN_HREF = '/login?mode=signin';

// ── Prices (PLANS from @lawie/shared is the only price source, T-364) ───────────

const inr = (n: number): string => `₹${n.toLocaleString('en-IN')}`;

/** `₹799 a month` (§1.6, §4.1) / `₹799 प्रति माह` (§1.6 Hindi plan strings). */
export function monthlyPrice(priceInr: number, lang: Lang = 'en'): string {
  return lang === 'hi' ? `${inr(priceInr)} प्रति माह` : `${inr(priceInr)} a month`;
}

/** `50 Ink a month` (§1.6, §4.1) / `50 Ink प्रति माह` (§1.6 Hindi plan strings). */
export function monthlyInk(ink: number, lang: Lang = 'en'): string {
  return lang === 'hi' ? `${ink} Ink प्रति माह` : `${ink} Ink a month`;
}

/** Free and Solo cards (§1.6). Used on the landing and the pricing page. */
export function planCards(lang: Lang) {
  const hi = lang === 'hi';
  return {
    free: {
      name: 'Free',
      price: '₹0',
      // §1.6 with AJ-511-M7 "(one time)"; HI §1.6 Hindi plan strings.
      ink: hi
        ? 'साइन-अप पर 5 Ink, ईमेल सत्यापित होने के बाद (एक बार)'
        : '5 Ink on sign-up, once your email is verified (one time)',
      // §1.6. NO SIGNED HI for these three.
      // "Every document type on Lawie": T-398 (Free is not gated by type, per Tanvi).
      // "PDF / DOCX export": shown on the pricing page before T-517; AJ-511-M16 product fact.
      includes: [
        'Every document type on Lawie',
        'Every line of the draft is yours to change',
        'PDF / DOCX export',
      ],
      button: hi ? '5 मुफ़्त Ink के साथ शुरू कीजिए' : 'Start with 5 free Ink',
    },
    solo: {
      name: 'Solo',
      price: monthlyPrice(PLANS.solo_monthly.priceInr, lang),
      ink: monthlyInk(PLANS.solo_monthly.inkPerCycle, lang),
      // §1.6 includes; the first item ("50 Ink a month") is the Ink line above, not repeated.
      // NO SIGNED HI for "Everything in Free" and "Ink refills every month".
      includes: ['Everything in Free', 'Ink refills every month'],
      // §1.6. NO SIGNED HI.
      button: 'Sign up to choose Solo',
    },
  };
}

/** §1.6 intro, with AJ-511-M2/M5 (failed draft) and M1/M4 (cost before). HI: AJ-511-M5, M19. */
export const PRICES_INTRO: Record<Lang, string> = {
  en: 'Ink is what a draft costs. You see the Ink cost before you generate. If a draft fails to generate, no Ink is used.',
  hi: 'Ink वह इकाई है जिसमें ड्राफ़्ट की लागत गिनी जाती है। ड्राफ़्ट बनाने से पहले लागत दिखती है। जो ड्राफ़्ट पूरा नहीं बनता, उसका Ink नहीं कटता।',
};

/** §1.6 top-up line, with AJ-511-M8. */
export const TOP_UP_LINE: Record<Lang, string> = {
  en: 'Need more? Top-up packs: ₹65 for 3 Ink, ₹199 for 10 Ink, ₹499 for 28 Ink. Top-up Ink does not expire while your account is open.',
  hi: 'और चाहिए? टॉप-अप पैक: 3 Ink ₹65 में, 10 Ink ₹199 में, 28 Ink ₹499 में। खाता चालू रहने तक टॉप-अप Ink समाप्त नहीं होता।',
};

/** §1.6 note under the cards, both sentences (AJ-517-M12 lifts the earlier hold). */
export const PRICES_GST_NOTE: Record<Lang, string> = {
  en: 'Prices include GST. Plan Ink does not carry over to the next month.',
  hi: 'कीमतों में GST शामिल है। प्लान का बचा हुआ Ink अगले महीने में नहीं जुड़ता।',
};

// ── Landing (§1.1 to §1.10) ────────────────────────────────────────────────────

/** §1.1 SEO. The root layout title equals this (Priya, 21 Oct). */
export const SEO_TITLE = 'Lawie: drafting assistant for advocates in India';
export const SEO_DESCRIPTION =
  'Describe your matter and get a first draft of a bail application, notice, writ or maintenance petition to review and edit. Start with 5 free Ink.';

export const SECTION_IDS = {
  how: 'how-it-works',
  documents: 'documents',
  prices: 'prices',
  faq: 'faq',
} as const;

const CTA: Record<Lang, string> = {
  en: 'Start with 5 free Ink', // §1.3 button 1 (Priya's decision 1)
  hi: '5 मुफ़्त Ink के साथ शुरू कीजिए',
};

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * §1.8 FAQ, English. Q1, Q2, Q4, Q6 as signed (Q1's plan-Ink sentence shown under AJ-517-M12).
 * Conditional sentences (AJ-511-M13, M16):
 * - Q3: "You will see a message and can try again." ships (failed generation shows the error with
 *   Try again, app/dashboard/new + GeneratingStep). "Your description stays where you typed it."
 *   is OMITTED: not confirmed for every drafting path in the build.
 * - Q5: "You can ask to access, correct or erase your data from Settings, or write to our
 *   Grievance Officer." is OMITTED: Settings has no access / correct / erase request today, and
 *   AJ-517-M8 says there is no signed Grievance Officer name or email.
 */
export const FAQ_EN: FaqItem[] = [
  {
    q: 'What is Ink?',
    a: "Ink is Lawie's credit unit. You see the Ink cost before you generate. If a draft fails to generate, no Ink is used. The Free plan gives you 5 Ink on sign-up, once your email is verified (one time). Paid plans give you fresh Ink every month. Plan Ink left unused at the end of the month does not carry over. Top-up packs can be bought anytime, and top-up Ink does not expire while your account is open.",
  },
  {
    q: 'Who is responsible for the draft?',
    a: 'You are. Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. Read the whole draft, edit it as you see fit, and use the checks panel as a prompt for your own review.',
  },
  {
    q: 'What if a draft fails to generate?',
    a: 'If a draft fails to generate, no Ink is used. You will see a message and can try again.',
  },
  {
    q: 'Which documents can I draft?',
    a: 'Bail applications, legal notices, writ petitions, maintenance petitions, plaints, written statements, affidavits.',
  },
  {
    q: 'What happens to what I type?',
    a: 'To write a draft, your description is sent to an AI service. The Privacy Policy lists what we collect, why, and who receives it.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Cancel from your account settings. Cancelling stops future charges and takes effect at the end of your current billing period. Ink you already have stays until then. Subscriptions are billed in advance and are not refunded; see the Refund Policy.',
  },
];

/** AJ-517-M11 (Ajay, e568d0e5): the complaints / grievance email (footer, §1.7 via AJ-517-M13,
 *  and the privacy page §11). */
export const GRIEVANCE_EMAIL = 'contact@lawie.in';

/**
 * AJ-517-M11: the Grievance Officer's name comes ONLY from config, never from repo files.
 * NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME, trimmed; empty or missing means unset. Read with the full
 * literal name so Next inlines it at build time.
 */
export function grievanceOfficerName(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME;
  const name = typeof raw === 'string' ? raw.trim() : '';
  return name || undefined;
}

/**
 * AJ-517-M11 footer line, split around the mailto link. NO SIGNED HI (English in Hindi mode).
 * - name configured: `Grievance Officer: {name}. Email: contact@lawie.in. We acknowledge every
 *   complaint within 24 hours and resolve it within 15 days.`
 * - not configured: `For complaints, write to contact@lawie.in.`
 */
export function grievanceLine(name: string | undefined = grievanceOfficerName()): {
  before: string;
  email: string;
  after: string;
} {
  return name
    ? {
        before: `Grievance Officer: ${name}. Email: `,
        email: GRIEVANCE_EMAIL,
        after: '. We acknowledge every complaint within 24 hours and resolve it within 15 days.',
      }
    : { before: 'For complaints, write to ', email: GRIEVANCE_EMAIL, after: '.' };
}

export function landingCopy(lang: Lang) {
  const hi = lang === 'hi';
  const en = !hi;
  return {
    lang,
    nav: {
      // §1.2. "How it works" HI = the §1.4 section title HI (same string). NO SIGNED HI for
      // Documents, Prices, FAQ, Sign in.
      how: en ? 'How it works' : 'यह कैसे काम करता है',
      documents: 'Documents',
      prices: 'Prices',
      faq: 'FAQ',
      signIn: 'Sign in',
      // EXISTING (SiteNav): the accessible name of the small-screen menu row.
      mobileMenu: 'Mobile menu',
    },
    // §1.2
    language: { en: 'English', hi: 'हिन्दी' },
    cta: CTA[lang],
    hero: {
      // §1.3 headline option A (AJ-517-M6; final choice Meera's).
      headline: en
        ? 'Describe the matter. Lawie writes the first draft.'
        : 'मामला बताइए। पहला ड्राफ़्ट Lawie लिखेगा।',
      sub: en
        ? 'Lawie is a drafting assistant for advocates. Tell it about your matter in plain words, get a first draft of a bail application, notice, writ or maintenance petition, then read it, edit it and decide.'
        : 'Lawie अधिवक्ताओं के लिए एक ड्राफ़्टिंग सहायक है। अपना मामला सरल शब्दों में बताइए, जमानत आवेदन, नोटिस, रिट या भरण-पोषण याचिका का पहला ड्राफ़्ट पाइए, फिर उसे पढ़िए, बदलिए और खुद तय कीजिए।',
      noCard: en ? 'No card needed.' : 'कार्ड की ज़रूरत नहीं।',
      verify: en
        ? 'Verify your email to receive your 5 Ink.'
        : '5 Ink पाने के लिए अपना ईमेल सत्यापित कीजिए।',
      secondary: en ? 'See how it works' : 'यह कैसे काम करता है',
    },
    demo: {
      // §1.3 demo; AJ-517-M7: the signed prompt, the caption and an empty folio.
      prompt: en
        ? 'A bail application for a client arrested on Tuesday. First offence. Lives with family in the district.'
        : 'मंगलवार को गिरफ़्तार मुवक्किल के लिए जमानत आवेदन। पहला मामला है। परिवार के साथ ज़िले में रहता है।',
      caption: en
        ? 'Example only. Not a real matter.'
        : 'केवल उदाहरण। यह कोई वास्तविक मामला नहीं है।',
      replay: en ? 'Replay' : 'फिर से चलाइए',
    },
    steps: {
      // §1.4
      title: en ? 'How it works' : 'यह कैसे काम करता है',
      items: en
        ? [
            {
              title: 'Describe',
              body: 'Tell Lawie about the matter in your own words. If something is missing, it asks a few short questions.',
            },
            {
              title: 'Draft',
              body: 'Lawie writes a first draft of the document you chose. You see the Ink cost before you generate.',
            },
            {
              title: 'Review',
              body: 'Read every paragraph and edit what you need. A checks panel lists items for you to review. Finalise when you are satisfied.',
            },
          ]
        : [
            {
              title: 'बताइए',
              body: 'अपने शब्दों में मामला बताइए। कुछ कम हो तो Lawie कुछ छोटे सवाल पूछता है।',
            },
            {
              title: 'ड्राफ़्ट',
              body: 'आपके चुने हुए दस्तावेज़ का पहला ड्राफ़्ट Lawie लिखता है। शुरू होने से पहले आपको Ink की लागत दिख जाती है।',
            },
            {
              title: 'जाँचिए',
              body: 'हर अनुच्छेद पढ़िए और जो बदलना हो बदलिए। जाँच पैनल उन बातों की सूची देता है जिन्हें आपको देखना है। संतुष्ट हों तभी अंतिम कीजिए।',
            },
          ],
    },
    documents: {
      // §1.5
      title: en ? 'Documents you can draft' : 'जो दस्तावेज़ आप बना सकते हैं',
      line: en
        ? 'Bail applications, legal notices, writ petitions, maintenance petitions, plaints, written statements, affidavits and more.'
        : 'जमानत आवेदन, कानूनी नोटिस, रिट याचिका, भरण-पोषण याचिका, वाद-पत्र, लिखित कथन, शपथ-पत्र और भी बहुत कुछ।',
      spines: en
        ? ['Bail application', 'Legal notice', 'Written statement', 'Plaint', 'Affidavit']
        : ['जमानत आवेदन', 'कानूनी नोटिस', 'लिखित कथन', 'वाद-पत्र', 'शपथ-पत्र'],
    },
    prices: {
      // §1.6
      title: en ? 'Ink and prices' : 'Ink और कीमतें',
      intro: PRICES_INTRO[lang],
      cards: planCards(lang),
      seeAll: en ? 'See all plans' : 'सभी प्लान देखिए',
      note: PRICES_GST_NOTE[lang],
      topUp: TOP_UP_LINE[lang],
    },
    trust: {
      // §1.7 (AJ-511-M13, M15). {grievance email} = the privacy page's grievance email.
      title: en ? 'You stay in charge' : 'ज़िम्मेदारी आपकी रहती है',
      items: [
        {
          heading: en ? 'The advocate is responsible' : 'अधिवक्ता ज़िम्मेदार है',
          body: en
            ? 'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing. Every draft is yours to read, change or discard.'
            : 'Lawie एक ड्राफ़्टिंग सहायक है। कानूनी सटीकता और फ़ाइलिंग की ज़िम्मेदारी अधिवक्ता की है। हर ड्राफ़्ट को पढ़ना, बदलना या हटाना आपके हाथ में है।',
        },
        {
          heading: en ? 'A checks panel for your review' : 'आपकी जाँच के लिए एक पैनल',
          body: en
            ? 'After a draft is written, a panel lists items for you to review. Each item takes you to its paragraph. The panel helps you look. It does not replace your reading.'
            : 'ड्राफ़्ट बनने के बाद एक पैनल उन बातों की सूची देता है जिन्हें आपको देखना है। हर बात आपको उसके अनुच्छेद तक ले जाती है। पैनल देखने में मदद करता है। आपके पढ़ने की जगह नहीं लेता।',
        },
      ],
      privacy: {
        heading: en ? 'Your privacy' : 'आपकी निजता',
        // Split around the "Privacy Policy" link text so the link sits inside the sentence. The
        // last sentence ("For a complaint … write to our Grievance Officer at {grievance email}." /
        // its HI) is replaced by `grievance` (AJ-517-M13): `For complaints, write to
        // contact@lawie.in.` with no officer name configured, the AJ-517-M11 line with one.
        // NO SIGNED HI for either, so it shows in English (lang="en") in Hindi mode.
        before: en
          ? 'To write a draft, what you describe is sent to an AI service. Read the '
          : 'ड्राफ़्ट लिखने के लिए आपका बताया हुआ विवरण एक AI सेवा को भेजा जाता है। हम क्या एकत्र करते हैं, क्यों, और किसे भेजते हैं, यह जानने के लिए ',
        link: en ? 'Privacy Policy' : 'गोपनीयता नीति',
        after: en ? ' to see what we collect, why, and who receives it.' : ' पढ़िए।',
        grievance: grievanceLine(),
      },
    },
    faq: {
      // §1.8 has no section title; the §1.2 nav label is used. NO SIGNED HI.
      title: 'FAQ',
      // TODO(T-517, AJ-511-M18): Hindi FAQ pending Ajay sign-off. Until then the English FAQ
      // shows in Hindi mode (AJ-517-M10).
      items: FAQ_EN,
    },
    final: {
      // §1.9 (heading, not the variant)
      heading: en
        ? 'Start with a matter you already know.'
        : 'ऐसे मामले से शुरू कीजिए जिसे आप पहले से जानते हैं।',
      body: en
        ? 'Create an account, verify your email and use your 5 Ink on a real document.'
        : 'खाता बनाइए, ईमेल सत्यापित कीजिए और अपने 5 Ink किसी असली दस्तावेज़ पर आज़माइए।',
    },
    footer: footerCopy(lang),
    theme: themeCopy(lang),
  };
}

export type LandingCopy = ReturnType<typeof landingCopy>;

// ── Footer (§1.10) and theme toggle (§6.4) ──────────────────────────────────────

export function footerCopy(lang: Lang) {
  const en = lang === 'en';
  return {
    disclaimer: en
      ? 'Lawie is a drafting assistant. The advocate is responsible for legal accuracy and filing.'
      : 'Lawie एक ड्राफ़्टिंग सहायक है। कानूनी सटीकता और फ़ाइलिंग की ज़िम्मेदारी अधिवक्ता की है।',
    links: {
      privacy: en ? 'Privacy' : 'गोपनीयता',
      terms: en ? 'Terms' : 'शर्तें',
      refunds: en ? 'Refunds' : 'रिफ़ंड',
      // "Grievance Officer" / "शिकायत अधिकारी" (§1.10) link is NOT rendered (AJ-517-M8): the
      // AJ-517-M11 grievance line replaces it (grievanceLine()).
    },
    grievance: grievanceLine(),
  };
}

/** §6.4 theme toggle. */
export function themeCopy(lang: Lang) {
  return lang === 'hi'
    ? { legend: 'थीम', labels: { night: 'रात', daylight: 'दिन', system: 'सिस्टम' } }
    : { legend: 'Theme', labels: { night: 'Night', daylight: 'Daylight', system: 'System' } };
}

// ── Sign-up and login (§2.1, §2.2, §2.4; AJ-517-M1..M4, M9) ───────────────────

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `15 Oct 2026` from a privacy version id like '2026-10-15' (or '2026-10-12b'). Display only:
 * the id stays an opaque string everywhere else. Empty when the id has no date prefix.
 */
export function privacyVersionDate(version: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(version);
  if (!m) return '';
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return '';
  return `${Number(m[3])} ${month} ${m[1]}`;
}

export const AUTH_COPY = {
  // §2.1. Tab order per Priya: Create account first, then Sign in.
  tabs: { signup: 'Create account', signin: 'Sign in' },
  // EXISTING (T-234): the tablist's accessible name.
  tablistLabel: 'Sign in or create account',
  heading: { signup: 'Create your account', signin: 'Welcome back' },
  subline: { signup: 'Verify your email to receive your 5 Ink.', signin: 'Sign in to your shelf.' },
  // §2.2
  nameLabel: 'Full name',
  nameHelp: 'As you want it on your documents',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  passwordLabel: 'Password',
  show: 'Show',
  hide: 'Hide',
  showAria: 'Show password',
  hideAria: 'Hide password',
  forgot: 'Forgot password?',
  submit: { signup: 'Create account', signin: 'Sign in' },
  loading: 'Please wait',
  // AJ-517-M4: the existing signed checklist (T-234), not "At least 8 characters" alone. Mirrors
  // apps/auth/src/validators/auth.validator.ts registerSchema.password.
  passwordNeeds: 'Your password needs:',
  passwordRules: {
    length: 'At least 8 characters',
    upper: 'One capital letter (A–Z)',
    lower: 'One small letter (a–z)',
    digit: 'One number (0–9)',
  },
  ruleDone: '(done)',
  ruleNotYet: '(not yet)',
  // EXISTING (T-234) field errors; §2.4 for the email format.
  errName: 'Enter your full name.',
  errEmailEmpty: 'Enter your email.',
  errEmailFormat: 'Enter a valid email address.',
  errPassword: 'Enter your password.',
  // §2.4 (AJ-517-M2: never "Verify your email to sign in…"; login does not block unverified).
  wrongPassword: 'That email and password do not match. Try again, or reset your password.',
  // EXISTING (T-234), kept under the §2.4 line: true and still useful.
  googleHint: 'Signed up with Google? Use Continue with Google above.',
  network: 'Could not reach Lawie. Check your connection and try again.',
  serverError: 'Could not sign you in. Try again.',
  retry: 'Retry',
  // EXISTING (T-208 / T-234): the 422 list heading and the 409 link (AJ-517-M1: today's 409
  // handling stays, the server's text plus "Sign in instead").
  checkFollowing: 'Please check the following:',
  signInInstead: 'Sign in instead',
  // EXISTING (T-234 / AJ-517-M9)
  google: 'Continue with Google',
  orEmail: 'or with email',
  haveAccount: 'Already have an account? ',
  newToLawie: 'New to Lawie? ',
  switchToSignin: 'Sign in',
  switchToSignup: 'Create an account',
  continue: 'Continue',
  // EXISTING (T-234, Ajay 11 Oct 2026): the "By continuing" line, kept on the Sign in tab only.
  // A Google sign-in from that tab can still create an account, and it gets no checkbox.
  byContinuing: {
    before: "By continuing, you agree to Lawie's ",
    terms: 'Terms of Service',
    middle: ' and confirm you have read our ',
    privacy: 'Privacy Policy',
    after: '.',
  },
};

/**
 * Consent on Create account (AJ-511-M11, AJ-517-M3). The web has no Terms version source (the
 * Terms version CURRENT_TERMS_VERSION lives only in apps/auth), so the M11 line is used with the
 * Privacy Policy version and date only. Unticked by default; it gates Create account and Google.
 * The register body is unchanged: the server stamps the version.
 */
export const CONSENT_COPY = {
  version: CURRENT_PRIVACY_VERSION,
  date: privacyVersionDate(CURRENT_PRIVACY_VERSION),
  // "I have read and agree to the Terms and the Privacy Policy (version {version}, {date})."
  before: 'I have read and agree to the ',
  terms: 'Terms',
  middle: ' and the ',
  privacy: 'Privacy Policy',
  after: ` (version ${CURRENT_PRIVACY_VERSION}, ${privacyVersionDate(CURRENT_PRIVACY_VERSION)}).`,
  // AJ-517-M3, signed.
  required: 'Please accept the Privacy Policy and Terms to continue.',
};
