/**
 * @jest-environment node
 */
// T-601 (c): the server render of the hero folio is the finished state (spec 8: a slow script never
// shows an empty folio), with the flash guard and the noscript override.
import { renderToString } from 'react-dom/server';

import { HeroFolio } from '../HeroFolio';
import { LP } from '../landing-copy';

describe('HeroFolio on the server', () => {
  const html = renderToString(<HeroFolio lang="en" />);
  const hi = renderToString(<HeroFolio lang="hi" />);

  it('the three lines are written out, in the sr-only list and the written copy', () => {
    for (const l of [LP.folioLine1.en, LP.folioLine2.en, LP.folioLine3.en]) {
      expect(html.split(l).length - 1).toBe(2);
    }
    for (const l of [LP.folioLine1.hi, LP.folioLine2.hi, LP.folioLine3.hi]) {
      expect(hi.split(l).length - 1).toBe(2);
    }
  });

  it('is the finished state: 54%, phase done, nothing waiting', () => {
    expect(html).toContain('data-folio-phase="done"');
    expect(html).toContain('54');
    expect(html).not.toContain('data-folio-rest');
    expect(html).not.toContain('data-folio-phase="waiting"');
  });

  it('carries the flash guard, the scoped style and the noscript override', () => {
    expect(html).toContain('data-folio-initial=""');
    expect(html).toContain(
      '[data-folio-initial] .folio-hide{visibility:hidden;animation:folio-reveal 0s 2.5s forwards}',
    );
    expect(html).toContain(
      '<noscript><style>[data-folio-initial] .folio-hide{visibility:visible}</style></noscript>',
    );
  });

  it('has the watermark (aria-hidden) and the signed figure name', () => {
    expect(html).toMatch(/data-watermark=""[^>]*>SAMPLE</);
    expect(html).toContain('aria-label="Sample draft, fictional parties"');
    expect(hi).toContain('नमूना');
    expect(html).toMatch(
      /aria-hidden="true"[^>]*data-watermark|data-watermark=""[^>]*aria-hidden="true"/,
    );
  });
});
