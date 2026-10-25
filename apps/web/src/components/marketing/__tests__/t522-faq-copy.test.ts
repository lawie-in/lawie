// T-522: the two nl-copy FAQ answers pinned to Ajay's signed text. The strings are copied from
// handoff/legal/pre-anushka-legal-review-22-oct.md: A5-final (document list), A4 (refund clause)
// and A7 (where "Top-up Ink stays." goes).
import { FAQ_EN } from '../nl-copy';

const answer = (q: string) => FAQ_EN.find((f) => f.q === q)?.a;

describe('T-522 FAQ answers match the signed copy', () => {
  it('A5-final: "Which documents can I draft?" is the signed list, byte for byte', () => {
    expect(answer('Which documents can I draft?')).toBe(
      'Bail applications, legal notices, writ petitions, maintenance petitions, written statements, affidavits.',
    );
  });

  it('A5-final: plaints are off in v1 and stay out of the list', () => {
    expect(answer('Which documents can I draft?')).not.toMatch(/plaint/i);
  });

  it('A4: "Can I cancel anytime?" ends with the signed non-refundable clause', () => {
    const a = answer('Can I cancel anytime?') as string;
    expect(a).toContain('are non-refundable except as set out in the Refund Policy.');
    expect(a.endsWith('are non-refundable except as set out in the Refund Policy.')).toBe(true);
    expect(a).not.toContain('are not refunded');
  });

  it('A7: "Top-up Ink stays." comes straight after "Ink you already have stays until then."', () => {
    const a = answer('Can I cancel anytime?') as string;
    expect(a).toContain('Ink you already have stays until then. Top-up Ink stays.');
  });

  it('the whole cancel answer is the signed sentences in order', () => {
    expect(answer('Can I cancel anytime?')).toBe(
      'Yes. Cancel from your account settings. Cancelling stops future charges and takes effect at the end of your current billing period. Ink you already have stays until then. Top-up Ink stays. Subscriptions are billed in advance and are non-refundable except as set out in the Refund Policy.',
    );
  });
});
