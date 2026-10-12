/**
 * T-273: `{{missing: x}}` in any case is the same blank on the server as in the
 * shared finder and the web export. T-274 (server side): CRLF plain text breaks
 * into the same paragraphs as LF, and < > & in plain text print as text.
 */
import { blankText, findBlanks } from '@lawie/shared';

import { missingAsBlanks } from '../utils/missingAsBlanks';
import { blanksInContent, contentToHtml } from '../services/pdf-export.service';

const TBC = (label: string) => `[To be confirmed: ${label}]`;
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('T-273 missingAsBlanks: any case', () => {
  it.each([
    '{{missing: x}}',
    '{{MISSING: x}}',
    '{{Missing: x}}',
    '{{mIsSiNg:x}}',
    '{{ missing : x }}',
  ])('%s -> [To be confirmed: x]', (tok) => {
    expect(missingAsBlanks(tok)).toBe(TBC('x'));
  });

  it('other braces and near misses stay as written', () => {
    for (const t of ['{{foo}}', '{{missed: x}}', '{missing: x}', '{{missing x}}']) {
      expect(missingAsBlanks(t)).toBe(t);
    }
  });
});

describe('T-273 contentToHtml prints the label for any case', () => {
  it('lower and upper case give the same blank in the PDF body (plain text)', () => {
    const lower = contentToHtml('Date {{missing: Date of FIR}} here', false);
    const upper = contentToHtml('Date {{MISSING: Date of FIR}} here', false);
    expect(lower).toContain(TBC('Date of FIR'));
    expect(lower).not.toMatch(/\{\{/);
    expect(lower).toBe(upper);
  });

  it('same for HTML content', () => {
    const lower = contentToHtml('<p>Date {{missing: Court}}</p>', false);
    expect(lower).toContain(TBC('Court'));
    expect(lower).toBe(contentToHtml('<p>Date {{MISSING: Court}}</p>', false));
  });

  it('highlights a lower-case blank with the finder, as upper case', () => {
    const lower = contentToHtml('A {{missing: x}} B', false, false, { findBlanks });
    expect(lower).toContain(`<span class="tbc">${TBC('x')}</span>`);
    expect(lower).toBe(contentToHtml('A {{MISSING: x}} B', false, false, { findBlanks }));
  });
});

describe('T-273 blanksInContent: any case, same as the shared finder (parity)', () => {
  const upper = `Court {{MISSING: Court}}\n\nFIR ${TBC('FIR')} and {{MISSING: Place}}.`;
  const lower = `Court {{missing: Court}}\n\nFIR [to be confirmed: FIR] and {{missing: Place}}.`;
  const mixed = `Court {{Missing: Court}}\n\nFIR [TO BE CONFIRMED: FIR] and {{missing: Place}}.`;

  it('lower/mixed case count the same as upper', () => {
    expect(blanksInContent(upper)).toHaveLength(3);
    expect(blanksInContent(lower)).toHaveLength(3);
    expect(blanksInContent(mixed)).toHaveLength(3);
    expect(blanksInContent(lower).map((b) => b.label)).toEqual(
      blanksInContent(upper).map((b) => b.label),
    );
  });

  it('server count equals the shared (web) count on the same saved content', () => {
    for (const c of [upper, lower, mixed, `<p>${lower.replace('\n\n', '</p><p>')}</p>`]) {
      expect(blanksInContent(c)).toHaveLength(findBlanks(blankText(c)).length);
    }
  });

  it('a raw {{missing: x}} the server rewrites is still one blank, not two', () => {
    expect(blanksInContent('{{missing: x}}')).toHaveLength(1);
    expect(findBlanks('{{missing: x}}')).toHaveLength(1);
  });
});

describe('T-274 contentToHtml: plain text is escaped', () => {
  it('prints < > & as text and creates no element', () => {
    const plain = contentToHtml('Note: <script>alert(1)</script> a < b & c > d', false);
    expect(plain).toContain('Note: &lt;script&gt;alert(1)&lt;/script&gt; a &lt; b &amp; c &gt; d');
    expect(plain).not.toContain('<script>alert(1)');
  });

  it('a blank whose label contains <name> keeps its label, escaped, and is one blank', () => {
    const c = `Dear ${TBC('<name>')}, regards`;
    const html = contentToHtml(c, false, false, { findBlanks });
    expect(html).toContain('[To be confirmed: &lt;name&gt;]');
    expect(html).toContain('<span class="tbc">');
    expect(blanksInContent(c)).toHaveLength(1);
    expect(blanksInContent(c)[0].label).toBe('<name>');
  });
});

describe('T-274 CRLF plain text equals LF plain text', () => {
  const lf =
    'IN THE COURT OF PATNA\n\nThat the applicant a < b\nsecond line\n\nPRAYER\n\nGrant bail.\n\n\nLast.';
  const crlf = lf.replace(/\n/g, '\r\n');
  const cr = lf.replace(/\n/g, '\r');

  it('same body and same paragraph count and headings', () => {
    const a = contentToHtml(lf, false);
    const b = contentToHtml(crlf, false);
    const c = contentToHtml(cr, false);
    expect(count(b, /<p[ >]/g)).toBe(count(a, /<p[ >]/g));
    expect(count(b, /<p class="heading">/g)).toBe(count(a, /<p class="heading">/g));
    expect(count(a, /<p class="heading">/g)).toBe(2);
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(b).not.toContain('\r');
  });

  it('blank counts and highlights are equal for LF and CRLF', () => {
    const base = `COURT ${TBC('Court')}\n\nFIR {{missing: FIR}} and ____ and ${TBC('<name>')}.\n\nEnd.`;
    const crlfBase = base.replace(/\n/g, '\r\n');
    expect(blanksInContent(crlfBase)).toHaveLength(blanksInContent(base).length);
    expect(blanksInContent(crlfBase).map((x) => x.label)).toEqual(
      blanksInContent(base).map((x) => x.label),
    );
    const opt = { findBlanks };
    expect(contentToHtml(crlfBase, false, false, opt)).toBe(contentToHtml(base, false, false, opt));
    expect(count(contentToHtml(base, false, false, opt), /class="tbc"/g)).toBe(
      blanksInContent(base).length,
    );
  });
});

describe('T-274 three or more newlines split paragraphs like two', () => {
  const two = 'IN THE COURT OF PATNA\n\nThat the applicant\nsecond line\n\nPRAYER\n\nGrant bail.';
  it.each([3, 4, 6])(
    '%i newlines (LF and CRLF) equal 2: same paragraphs, no <p><br>, headings kept',
    (n) => {
      const many = two.replace(/\n\n/g, '\n'.repeat(n));
      const a = contentToHtml(two, false);
      expect(contentToHtml(many, false)).toBe(a);
      expect(contentToHtml(many.replace(/\n/g, '\r\n'), false)).toBe(a);
      expect(a).not.toMatch(/<p[^>]*><br>/);
      expect(contentToHtml(many, false)).not.toMatch(/<p[^>]*><br>/);
      expect(count(contentToHtml(many, false), /<p class="heading">/g)).toBe(2);
      expect(count(contentToHtml(many, false), /<p[ >]/g)).toBe(4);
    },
  );
});

describe('T-274 HTML content passes through unchanged', () => {
  it('HTML, also with leading whitespace, is embedded as-is', () => {
    const h = '<p>a &lt; b &amp; c</p><p>x<br>y</p>';
    expect(contentToHtml(h, false)).toContain(h);
    expect(contentToHtml(`  \r\n${h}`, false)).toContain(h);
  });
});
