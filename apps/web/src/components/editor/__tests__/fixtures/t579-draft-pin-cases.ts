/**
 * T-579 pin: representative inputs of the draft's Word export (exportDocx). The
 * expected XML in t579-draft-pin-expected.json was captured from the code as it
 * stood on develop_staging 867c80ea, before the annexures converter was added.
 */
export interface PinCase {
  name: string;
  html: string;
  isFree: boolean;
  footer?: string | null;
}

export const PIN_CASES: PinCase[] = [
  {
    name: 'headings, paragraphs and inline formats',
    html:
      '<h1>IN THE COURT OF THE DISTRICT JUDGE</h1><h2>Bail Application</h2><h3>Facts</h3>' +
      '<p>Plain <strong>bold</strong> and <em>italic</em> and <u>underlined</u> text.</p>' +
      '<p><strong><em>Both</em></strong> and <b>b</b> <i>i</i>.</p><p></p><p>Line one<br>Line two</p>',
    isFree: false,
  },
  {
    name: 'lists',
    html:
      '<p>Grounds:</p><ul><li>First ground</li><li><strong>Second</strong> ground</li></ul>' +
      '<ol><li>One</li><li>Two</li></ol><p>After the lists.</p>',
    isFree: true,
  },
  {
    name: 'blank spans and missing markers',
    html:
      '<p>Name {{MISSING: father name}} of <span data-lawie-blank="">________</span> aged ____.</p>' +
      '<p>[To be confirmed: FIR number]</p><p>____________</p>',
    isFree: false,
  },
  {
    name: 'starting draft footer',
    html: '<h2>Starting draft</h2><p>Fill {{MISSING: place}}.</p>',
    isFree: false,
    footer: 'Starting draft only. Fill every blank and check it before you file.',
  },
  {
    name: 'plain text content',
    html: 'First paragraph with a blank ________.\n\nSecond paragraph.\nSame paragraph, new line.',
    isFree: false,
  },
  {
    name: 'devanagari and entities',
    html: '<p>श्री राम कुमार &amp; Co. &lt;x&gt; &nbsp;end</p>',
    isFree: true,
  },
  { name: 'empty content', html: '', isFree: false },
];
