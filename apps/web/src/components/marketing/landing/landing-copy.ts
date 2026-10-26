// T-601: the new strings on the Reading Desk landing, EN and HI, each with its copy id.
// Sources, byte for byte (pasted, never parsed at runtime):
// - handoff/copy/T-584-landing-copy-v2.md (Madhuri), M-LP-01..15-15c;
// - handoff/legal/T-584-landing-copy-rulings-ajay.md (Ajay), which wins where they differ:
//   15-01, 15-06 and 15-08 are his changed text; 15-10 and 10c are signed on condition that the
//   Hindi caption track ships (the components drop Hindi without it);
// - handoff/copy/T-539-progress-copy-v1.md §1 for the stage name (Ajay signed it for T-601).
// Strings that already exist in components/marketing/nl-copy.ts (CTA, plan cards, prices, FAQ,
// footer, step titles, privacy link, grievance line) are imported from there, never retyped here.
// Priya: no "in English or Hindi" phrase (03, 04a, 11c, dropped in v2). Not shown: M-LP-11a..h
// (they are the video's captions, inside the caption files) and M-LP-14-05 (plaints are off).

import type { Lang } from '@/components/marketing/nl-copy';

/**
 * `signed`: Ajay signed the row, or ruled it a label with no legal objection (Meera approves the
 * tone). `unsigned` / `placeholder`: not cleared for production; nothing on the page uses one today.
 */
export type CopyStatus = 'signed' | 'unsigned' | 'placeholder';

export interface CopyRow {
  readonly id: string;
  readonly en: string;
  readonly hi: string;
  readonly status: CopyStatus;
  /** Where the text and its sign-off come from. */
  readonly source: string;
  /** A condition on the sign-off that the code enforces. */
  readonly condition?: string;
}

const V2 = 'copy v2';
const AJ = 'Ajay rulings (changed text)';
const FIXES_F5 = 'copy v2 fixes, AJ-601-F5 / S3';
const FIXES_F4 = 'copy v2 fixes, AJ-601-S1 / S2 (signed)';

function row(
  id: string,
  en: string,
  hi: string,
  source: string = V2,
  extra: { status?: CopyStatus; condition?: string } = {},
): CopyRow {
  return { id, en, hi, status: extra.status ?? 'signed', source, condition: extra.condition };
}

/** The row's text in the page language. */
export function tr(r: CopyRow, lang: Lang): string {
  return lang === 'hi' ? r.hi : r.en;
}

/** Fills `{name}` slots. Every slot must be given; a missing one stays visible as `{name}`. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export const LP = {
  // Hero (§2)
  heroEyebrow: row('M-LP-01', 'For district court advocates', 'ज़िला अदालतों के अधिवक्ता'),
  heroTitle: row('M-LP-02', 'Describe the matter. Read the draft.', 'मामला बताइए। ड्राफ़्ट पढ़िए।'),
  heroLead: row(
    'M-LP-03',
    'Describe the matter. Lawie writes a first draft; you review it, edit it and decide what is filed.',
    'मामला बताइए। Lawie पहला ड्राफ़्ट लिखता है; उसे पढ़िए, बदलिए और खुद तय कीजिए कि क्या फ़ाइल होगा।',
  ),

  // Hero folio (T-601 hero folio additions, Ajay (a) to (d))
  folioLine1: row(
    'M-LP-15-01',
    'The applicant is a first-time accused and has no earlier criminal case.',
    'आवेदक पहली बार का अभियुक्त है और उसके विरुद्ध कोई पूर्व आपराधिक मामला नहीं है।',
    AJ,
  ),
  folioLine2: row(
    'M-LP-15-02',
    'The applicant has a fixed home in the district and will attend every hearing.',
    'आवेदक का ज़िले में स्थायी निवास है और वह हर सुनवाई में उपस्थित रहेगा।',
  ),
  folioLine3: row(
    'M-LP-15-03',
    'The applicant is ready to follow any condition the Court sets.',
    'आवेदक न्यायालय द्वारा लगाई गई हर शर्त का पालन करने को तैयार है।',
  ),
  /** T-539 stage `draft` (copy T-539 §1, signed by Ajay for T-601 (b)). */
  folioStage: row('M-LP-15-04', 'Writing', 'ड्राफ़्ट लिखना', 'copy v2 + T-539 §1'),
  watermark: row('M-LP-15-05', 'SAMPLE', 'नमूना'),
  // Court heading, document title and cause title (fixes file 15-16..15-20), signed by Ajay in
  // AJ-601-S4..S6 ("Sample District", "Opposite Party"). The folio renders them only while every
  // one of these rows is `signed` (FOLIO_HEADING_ROWS).
  folioCourt: row(
    'M-LP-15-16',
    'In the Court of the Sessions Judge, Sample District',
    'सत्र न्यायाधीश के न्यायालय में, नमूना ज़िला',
    'copy v2 fixes, AJ-601-S4 (signed)',
  ),
  folioDocTitle: row(
    'M-LP-15-20',
    'Application for regular bail',
    'नियमित जमानत के लिए आवेदन',
    'copy v2 fixes, AJ-601-S5 (signed)',
  ),
  folioParty1: row(
    'M-LP-15-17',
    'Sample Person 1 … Applicant',
    'नमूना व्यक्ति 1 … आवेदक',
    'copy v2 fixes, AJ-601-S6 (signed)',
  ),
  folioVersus: row('M-LP-15-18', 'Versus', 'बनाम', 'copy v2 fixes, AJ-601-S6 (signed)'),
  folioParty2: row(
    'M-LP-15-19',
    'The State … Opposite Party',
    'राज्य … विपक्षी',
    'copy v2 fixes, AJ-601-S6 (signed)',
  ),
  /** Ajay T-601 (c): the folio's accessible name. No M-LP id in the copy file. */
  folioLabel: row(
    'AJ-T601-c',
    'Sample draft, fictional parties',
    'नमूना ड्राफ़्ट, काल्पनिक पक्षकार',
    'Ajay rulings, T-601 hero folio (c)',
  ),

  // How it works (§order; step titles are the signed T-511 §1.4 titles from nl-copy)
  step1: row(
    'M-LP-04a',
    'Tell Lawie the matter in your own words.',
    'अपने शब्दों में मामला बताइए।',
  ),
  step2: row(
    'M-LP-04b',
    'Lawie writes a first draft of the document you chose. A failed draft does not use Ink.',
    'आपके चुने दस्तावेज़ का पहला ड्राफ़्ट Lawie लिखता है। जो ड्राफ़्ट पूरा नहीं बनता, उसका Ink नहीं कटता।',
  ),
  step3: row(
    'M-LP-04c',
    'Read every paragraph, change what you need, and file only when you are satisfied.',
    'हर अनुच्छेद पढ़िए, जो बदलना हो बदलिए, और संतुष्ट होने पर ही फ़ाइल कीजिए।',
  ),

  // Coverage (§3)
  coverageEyebrow: row('M-LP-05e', 'What we draft', 'हम क्या ड्राफ़्ट करते हैं'),
  coverageTitle: row(
    'M-LP-05',
    'Open a drawer. See the templates.',
    'दराज़ खोलिए, टेम्पलेट देखिए।',
  ),
  /** {count} = total rounded down to ten with "+", live templates only. */
  coverageCount: row(
    'M-LP-15-06',
    '{count} document types in the library, shelved by subject.',
    'लाइब्रेरी में {count} प्रकार के दस्तावेज़, विषय के अनुसार दराज़ों में।',
    AJ,
  ),
  coverageLead: row(
    'M-LP-06',
    'This list is built from our template library and changes when the library does. Open any drawer to see what is in it today.',
    'यह सूची हमारी टेम्पलेट लाइब्रेरी से बनती है और उसके साथ बदलती है। कोई भी दराज़ खोलकर देखिए कि आज उसमें क्या है।',
    AJ,
  ),
  // AJ-601-F5: "document types" where the count means the template library (fixes file text).
  drawerCount: row('M-LP-15-07', '{n} document types', '{n} प्रकार के दस्तावेज़', FIXES_F5),
  drawerCountOne: row('M-LP-15-07b', '1 document type', '1 प्रकार का दस्तावेज़', FIXES_F5),
  drawerAria: row(
    'M-LP-15-12',
    '{name}, {n} document types',
    '{name}, {n} प्रकार के दस्तावेज़',
    FIXES_F5,
  ),
  drawerAriaOne: row(
    'M-LP-15-12b',
    '{name}, 1 document type',
    '{name}, 1 प्रकार का दस्तावेज़',
    FIXES_F5,
  ),
  panelAria: row('M-LP-15-13', 'Templates in {name}', '{name} के टेम्पलेट'),
  drawersAria: row('M-LP-15-14', 'Template drawers', 'टेम्पलेट दराज़'),
  coverageTotal: row(
    'M-LP-15-08',
    '{total} document types on {shelves} shelves today.',
    'आज {shelves} दराज़ों में {total} प्रकार के दस्तावेज़।',
    AJ,
  ),
  coverageFooter: row(
    'M-LP-07',
    'Each one is a first draft for you to review before anything is filed.',
    'हर एक पहला ड्राफ़्ट है, जिसे फ़ाइल करने से पहले आप जाँचते हैं।',
  ),

  // Sample drafts (§4)
  samplesEyebrow: row('M-LP-08e', 'Sample drafts', 'नमूना ड्राफ़्ट'),
  /**
   * AJ-601-F3: the count must match what ships, or carry no number. Madhuri's number-free form
   * (fixes file), byte-confirmed by Ajay (rulings follow-up, 26 Oct, origin 1e183079); wording
   * still approved by Meera.
   */
  samplesTitle: row(
    'M-LP-08a',
    'Drafts left on the desk for you to read.',
    'ड्राफ़्ट मेज़ पर रखे हैं, आपके पढ़ने के लिए।',
    'copy v2 fixes, Ajay byte-confirmed 26 Oct (1e183079); wording still approved by Meera',
  ),
  samplesLead: row(
    'M-LP-08b',
    'Prepared in advance with fictional parties, with a SAMPLE watermark on every page. They show how a first draft reads, not a filed document.',
    'पहले से तैयार, काल्पनिक पक्षकार, हर पन्ने पर SAMPLE वॉटरमार्क। ये पहले ड्राफ़्ट का नमूना हैं, दाख़िल दस्तावेज़ नहीं।',
    AJ,
    { condition: 'Ajay checks each sample PDF (watermark on every page) before it is served.' },
  ),
  sampleMeta: row(
    'M-LP-15-11',
    '{pages} pages · {language} · {format}',
    '{pages} पन्ने · {language} · {format}',
  ),

  // Demo video (§5)
  videoEyebrow: row('M-LP-10a', 'The long version', 'लंबा संस्करण'),
  videoTitle: row(
    'M-LP-10b',
    'Watch one draft from description to review.',
    'एक ड्राफ़्ट देखिए, मामले के विवरण से जाँच तक।',
  ),
  /** M-LP-10c, English track only (AJ-601-F2/F4: no "Loads on play", no Hindi line). */
  videoNote: row(
    'M-LP-10c',
    'Real product, fictional parties. Captions in English.',
    'असली प्रोडक्ट, काल्पनिक पक्षकार। अंग्रेज़ी कैप्शन।',
    FIXES_F4,
    { condition: 'Real footage (AJ M-LP-10c).' },
  ),
  /** M-LP-10c-hi, once the Hindi caption track ships. */
  videoNoteHindi: row(
    'M-LP-10c-hi',
    'Real product, fictional parties. Captions in English and Hindi.',
    'असली प्रोडक्ट, काल्पनिक पक्षकार। हिंदी और अंग्रेज़ी कैप्शन।',
    FIXES_F4,
    { condition: 'Real footage; only with the Hindi caption track.' },
  ),
  /** Poster-only state (reduced motion, or the loop has not started). */
  videoPlay: row('M-LP-15-09', 'Play the demo video', 'डेमो वीडियो चलाइए'),
  /** Loop state: the button unmutes (copy v2 addendum; a label, no sign-off needed). */
  videoPlaySound: row('M-LP-15-09b', 'Play with sound', 'आवाज़ के साथ चलाइए', 'copy v2 addendum'),
  /** M-LP-15-10a: English track only (fixes file; AJ-601-F2). */
  videoCaptionsEn: row('M-LP-15-10a', 'CC English', 'CC English', 'copy v2 fixes, AJ-601-F2'),
  videoCaptions: row('M-LP-15-10', 'CC English · हिंदी', 'CC English · हिंदी', V2, {
    condition: 'Only with the Hindi caption track; otherwise M-LP-15-10a.',
  }),

  // Trust (§6). M-LP-12a ("You stay in charge") is the signed T-511 §1.7 title, read from
  // landingCopy(lang).trust.title in nl-copy, not repeated here.
  trust1Body: row(
    'M-LP-12b',
    'Lawie writes a first draft. You read it, change it and decide what is filed.',
    'Lawie पहला ड्राफ़्ट लिखता है। उसे आप पढ़ते हैं, बदलते हैं और तय करते हैं कि क्या फ़ाइल होगा।',
  ),
  trust2Title: row('M-LP-12c', 'Checks for your review', 'आपकी जाँच के लिए'),
  trust2Body: row(
    'M-LP-12d',
    'A panel lists items for you to review. It helps you look; it does not replace your reading.',
    'एक पैनल उन बातों की सूची देता है जिन्हें आपको देखना है। वह आपके पढ़ने की जगह नहीं लेता।',
  ),
  trust3Title: row('M-LP-12e', 'Privacy and complaints', 'निजता और शिकायत'),
  trust3Body: row(
    'M-LP-12f',
    'What you describe goes to an AI service to write the draft. The privacy policy says who receives it.',
    'आपका बताया विवरण ड्राफ़्ट लिखने के लिए एक AI सेवा को जाता है। गोपनीयता नीति बताती है कि उसे कौन पाता है।',
  ),

  // Final call to action (§6)
  finalTitle: row('M-LP-13', 'Sit down. Describe the matter.', 'बैठिए। मामला बताइए।'),
} as const satisfies Record<string, CopyRow>;

/** The part of M-LP-15-10 that M-LP-15-10a leaves out (no Hindi caption track). */
export const CAPTIONS_HINDI_PART = ' · हिंदी';

/** M-LP-15-10 with the Hindi track, M-LP-15-10a without it (AJ-601-F2). */
export function captionsChip(hindiTrack: boolean): string {
  return hindiTrack ? LP.videoCaptions.en : LP.videoCaptionsEn.en;
}

/** M-LP-10c-hi with the Hindi track, M-LP-10c without it. */
export function videoNote(hindiTrack: boolean, lang: Lang): string {
  return tr(hindiTrack ? LP.videoNoteHindi : LP.videoNote, lang);
}

/** M-LP-15-07 / 15-07b: the n = 1 form when n is 1. */
export function drawerCountLabel(n: number, lang: Lang): string {
  return n === 1 ? tr(LP.drawerCountOne, lang) : fill(tr(LP.drawerCount, lang), { n });
}

/** M-LP-15-12 / 15-12b (label in name: begins with the visible text). */
export function drawerAriaLabel(name: string, n: number, lang: Lang): string {
  if (n === 1) return fill(tr(LP.drawerAriaOne, lang), { name });
  return fill(tr(LP.drawerAria, lang), { name, n });
}

/** Sample folio summaries (M-LP-09a..c, Ajay's names). 09a (bail) is not rendered while bail is out. */
export const SAMPLE_SUMMARIES = {
  bail: row(
    'M-LP-09a',
    'Fictional parties: Sample Person 1 and the State. A first-time accused; the draft sets out the facts and grounds from the description given.',
    'काल्पनिक पक्षकार: नमूना व्यक्ति 1 और राज्य। पहली बार का अभियुक्त; ड्राफ़्ट दिए गए विवरण से तथ्य और आधार रखता है।',
    AJ,
  ),
  notice: row(
    'M-LP-09b',
    'Fictional parties: Sample Traders and Sample Packaging Works. The notice sets out the agreement, the alleged breach and the demand, as described.',
    'काल्पनिक पक्षकार: सैंपल ट्रेडर्स और सैंपल पैकेजिंग वर्क्स। नोटिस विवरण के अनुसार करार, कथित उल्लंघन और माँग रखता है।',
    AJ,
  ),
  maintenance: row(
    'M-LP-09c',
    'Fictional parties: Sample Person 2 and Sample Person 3. A maintenance petition, with the facts and relief laid out from the description.',
    'काल्पनिक पक्षकार: नमूना व्यक्ति 2 और नमूना व्यक्ति 3। भरण-पोषण याचिका, जिसमें विवरण से तथ्य और राहत रखी गई है।',
    AJ,
  ),
} as const satisfies Record<string, CopyRow>;

/**
 * M-LP-14: category names by catalogue id (Ajay: signed; 14-06 HI changed). The sample eyebrows
 * M-LP-15-15a..c reuse 14-01, 14-23 and 14-08 byte for byte, so they read from here. No 14-05:
 * plaints are off in v1 and the catalogue hides the shelf. The EN text is the catalogue name.
 */
export const CATEGORY_NAMES: Readonly<Record<string, CopyRow>> = {
  criminal_bail_custody: row(
    'M-LP-14-01',
    'Criminal: bail and custody',
    'आपराधिक: जमानत और हिरासत',
  ),
  criminal_complaints_police_trial: row(
    'M-LP-14-02',
    'Criminal: complaints, police, trial applications',
    'आपराधिक: शिकायतें, पुलिस और ट्रायल आवेदन',
  ),
  criminal_appeals_revisions_quashing: row(
    'M-LP-14-03',
    'Criminal: appeals, revisions, quashing',
    'आपराधिक: अपील, पुनरीक्षण, निरस्तीकरण',
  ),
  cheque_bounce_ni_act: row(
    'M-LP-14-04',
    'Cheque bounce / NI Act',
    'चेक बाउंस / परक्राम्य लिखत अधिनियम',
  ),
  civil_defence_interlocutory: row(
    'M-LP-14-06',
    'Civil: defence and interlocutory',
    'सिविल: बचाव और अंतरिम आवेदन',
    AJ,
  ),
  civil_appeals_revision_review_execution: row(
    'M-LP-14-07',
    'Civil: appeals, revision, review, execution',
    'सिविल: अपील, पुनरीक्षण, पुनर्विलोकन, निष्पादन',
  ),
  family_matrimonial: row('M-LP-14-08', 'Family and matrimonial', 'परिवार और वैवाहिक'),
  property_conveyancing: row(
    'M-LP-14-10',
    'Property and conveyancing',
    'संपत्ति और अंतरण दस्तावेज़',
  ),
  rent_control_tenancy: row(
    'M-LP-14-11',
    'Rent control and tenancy',
    'किराया नियंत्रण और किरायेदारी',
  ),
  consumer: row('M-LP-14-13', 'Consumer', 'उपभोक्ता'),
  service_labour: row('M-LP-14-14', 'Service and labour', 'सेवा और श्रम'),
  company_insolvency: row('M-LP-14-15', 'Company and insolvency', 'कंपनी और दिवाला'),
  contracts_agreements: row('M-LP-14-16', 'Contracts and agreements', 'संविदा और करार'),
  writs_constitutional: row('M-LP-14-17', 'Writs and constitutional', 'रिट और संवैधानिक'),
  tax: row('M-LP-14-18', 'Tax', 'कर'),
  rera: row('M-LP-14-21', 'RERA', 'रेरा (RERA)'),
  mact: row('M-LP-14-22', 'MACT', 'मोटर दुर्घटना दावे (MACT)'),
  notices_replies: row('M-LP-14-23', 'Notices and replies', 'नोटिस और उत्तर'),
  affidavits_court_forms: row(
    'M-LP-14-24',
    'Affidavits and court forms',
    'शपथ-पत्र और न्यायालय प्रपत्र',
  ),
};

/**
 * A category's display name: the signed M-LP-14 Hindi in Hindi mode, else the catalogue's own
 * name (the JSON `name` is the source of the English, so a renamed category follows the catalogue).
 * A category without a signed Hindi name shows its English name; `isHindi` says which one it is.
 */
export function categoryName(
  id: string,
  catalogueName: string,
  lang: Lang,
): { text: string; isHindi: boolean } {
  const signed = CATEGORY_NAMES[id];
  if (lang === 'hi' && signed) return { text: signed.hi, isHindi: true };
  return { text: catalogueName, isHindi: false };
}

/** The folio's heading block ships only when all five rows are signed (AJ-601-F6). */
export const FOLIO_HEADING_ROWS = [
  LP.folioCourt,
  LP.folioDocTitle,
  LP.folioParty1,
  LP.folioVersus,
  LP.folioParty2,
] as const;

export function folioHeadingSigned(rows: readonly CopyRow[] = FOLIO_HEADING_ROWS): boolean {
  return rows.every((r) => r.status === 'signed');
}

/** Every row in this file, for the tester's listing (status, id, text). */
export const LANDING_COPY_ROWS: readonly CopyRow[] = [
  ...Object.values(LP),
  ...Object.values(SAMPLE_SUMMARIES),
  ...Object.values(CATEGORY_NAMES),
];
