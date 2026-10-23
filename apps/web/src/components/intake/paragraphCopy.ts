/**
 * T-577: every signed string of the paragraph-count stepper, EN and HI, keyed by language.
 * Byte for byte from handoff/legal/T-511-copy-rulings-ajay.md (Ajay); do not reword. Placeholders
 * (`{n}`, `{min}`) are kept as signed and filled by `fillParagraphCopy`. The web renders EN
 * only (the one flow sends language 'en'); HI is here for the locale layer.
 *
 * - label, fewer, more: AJ-577-M9.
 * - stepper (also the spinbutton's aria-label), help, cost: AJ-577-M6 (3), (1), (2). The ceiling
 *   path only.
 * - helpExact: AJ-577-M1 (1), the help line when the quote says `ceiling: false`. EN only: no HI
 *   is signed for it, so HI is null.
 * - range: AJ-577-M4 (server 400 and the on-blur clamp; {min} from the server).
 * - priceChanged: AJ-577-M8 (409 `price_changed`).
 * - lowerDebit: AJ-577-M1 (3) EN, AJ-577-M9 HI (draft ready, only for a real debit below the quote).
 */
export const PARAGRAPH_COPY = {
  en: {
    label: 'Paragraphs',
    fewer: 'Fewer paragraphs',
    more: 'More paragraphs',
    stepper: 'Up to {n} paragraphs',
    help: 'Up to this many body paragraphs. Headings, prayer and verification are not counted. You pay for what is drafted, never more than shown.',
    helpExact: 'Body paragraphs. Headings, prayer and verification are not counted.',
    cost: 'Uses up to {n} Ink',
    range: 'Choose between {min} and 25 paragraphs.',
    priceChanged: 'The Ink cost has changed. Check it and press Generate again.',
    lowerDebit: 'This draft has fewer paragraphs than you asked for, so it used {n} Ink.',
  },
  hi: {
    label: 'पैराग्राफ़',
    fewer: 'कम पैराग्राफ़',
    more: 'ज़्यादा पैराग्राफ़',
    stepper: 'अधिकतम {n} पैराग्राफ़',
    help: 'अधिकतम इतने मुख्य पैराग्राफ़। शीर्षक, प्रार्थना और सत्यापन नहीं गिने जाते। जितना ड्राफ़्ट बनेगा उतने का ही भुगतान, दिखाई गई राशि से ज़्यादा कभी नहीं।',
    helpExact: null,
    cost: 'अधिकतम {n} Ink लगेंगे',
    range: '{min} से 25 के बीच पैराग्राफ़ चुनिए।',
    priceChanged: 'Ink की लागत बदल गई है। उसे देखिए और फिर से Generate दबाइए।',
    lowerDebit: 'इस ड्राफ़्ट में आपके चुने हुए से कम पैराग्राफ़ हैं, इसलिए इसमें {n} Ink लगे।',
  },
} as const;

export type ParagraphCopyLanguage = keyof typeof PARAGRAPH_COPY;

/** The language the web renders today (the one flow hardcodes 'en'). */
export const PARAGRAPH_COPY_LANGUAGE: ParagraphCopyLanguage = 'en';

/** The EN strings, as rendered. */
export const PARAGRAPH_TEXT = PARAGRAPH_COPY.en;

/** Fills `{n}` / `{min}` in a signed template; nothing else in the text changes. */
export function fillParagraphCopy(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in values ? String(values[key]) : whole,
  );
}
