// T-577: the 19 signed strings (AJ-577-M1, M4, M6, M8, M9), byte for byte. The expected values are
// typed here independently of paragraphCopy.ts and were checked against
// `git show origin/develop_staging:handoff/legal/T-511-copy-rulings-ajay.md` by script.
import { PARAGRAPH_COPY, PARAGRAPH_TEXT, fillParagraphCopy } from '../paragraphCopy';

const SIGNED_EN = {
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
};
const SIGNED_HI = {
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
};

describe('T-577 signed copy', () => {
  it('EN equals the signed strings exactly (10 strings)', () => {
    expect(PARAGRAPH_COPY.en).toStrictEqual(SIGNED_EN);
    expect(Object.keys(PARAGRAPH_COPY.en)).toHaveLength(10);
  });

  it('HI equals the signed strings exactly (9 signed; helpExact has none)', () => {
    expect(PARAGRAPH_COPY.hi).toStrictEqual(SIGNED_HI);
    expect(PARAGRAPH_COPY.hi.helpExact).toBeNull();
  });

  it('Unicode is not normalised away (NFC bytes compared)', () => {
    for (const k of Object.keys(SIGNED_HI) as (keyof typeof SIGNED_HI)[]) {
      const got = PARAGRAPH_COPY.hi[k];
      if (got === null) continue;
      expect(Buffer.from(got, 'utf8').equals(Buffer.from(SIGNED_HI[k] as string, 'utf8'))).toBe(
        true,
      );
    }
  });

  it('the rendered text is EN', () => {
    expect(PARAGRAPH_TEXT).toBe(PARAGRAPH_COPY.en);
  });

  it('fillParagraphCopy fills only the placeholders', () => {
    expect(fillParagraphCopy(SIGNED_EN.range, { min: 7 })).toBe(
      'Choose between 7 and 25 paragraphs.',
    );
    expect(fillParagraphCopy(SIGNED_EN.cost, { n: 3 })).toBe('Uses up to 3 Ink');
    expect(fillParagraphCopy(SIGNED_EN.lowerDebit, { n: 2.5 })).toBe(
      'This draft has fewer paragraphs than you asked for, so it used 2.5 Ink.',
    );
    expect(fillParagraphCopy('no {other} here', { n: 1 })).toBe('no {other} here');
  });
});
