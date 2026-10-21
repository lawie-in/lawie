import { PLANS } from '@lawie/shared';

import { NightFaq } from '@/components/landing/NightFaq';
import { NightFooter } from '@/components/marketing/NightFooter';
import { NightPlanCard } from '@/components/marketing/NightPlanCard';
import { NightTopBar } from '@/components/marketing/NightTopBar';
import {
  monthlyInk,
  monthlyPrice,
  planCards,
  PRICES_INTRO,
  SIGNUP_HREF,
  TOP_UP_LINE,
} from '@/components/marketing/nl-copy';

// T-517: the Night Library pricing page. AJ-517-M5: only copy §1.6, §4.1, the T-398 Pro card
// strings (handoff/legal/T-398-pro-card-signed.md) and the GST FAQ. No "2 Ink" lines. Failed
// drafts and top-up Ink use AJ-511-M2 and M8. Prices and Ink come from PLANS (T-364).
// T-398: every yearly line is held by Ajay until the yearly Ink grant is settled, so there is no
// Monthly/Yearly toggle and no yearly price or text on this page.

/** Pricing-only strings. The §4.1 line stays in this file: AJ-509-M1 allows its plan-Ink
 *  sentence only on the pricing page, the terms page and components/billing/planCopy.ts. */
const PRICING_COPY = {
  // §1.6 section title, used as the page title.
  title: 'Ink and prices',
  // T-398 Pro card (monthly view). Price and Ink in the §4.1 "a month" form; the T-398 bullet 1
  // ("150 Ink/month") is the Ink line.
  pro: {
    name: 'Pro',
    subline: 'More Ink each month',
    price: monthlyPrice(PLANS.pro_monthly.priceInr),
    ink: monthlyInk(PLANS.pro_monthly.inkPerCycle),
    includes: ['Everything in Solo', 'Ink refills every month', 'Top-up packs available anytime'],
    button: 'Sign up to choose Pro',
  },
  // §4.1, under the cards (with AJ-511-M8).
  underCards:
    'Prices include GST. Plan Ink does not carry over. Top-up Ink does not expire while your account is open.',
  // No signed FAQ section title; the §1.2 nav label.
  faqTitle: 'FAQ',
  faq: [
    {
      q: 'Is GST included?',
      // Ajay, handoff/legal/gst-tax-invoice-signed.md 5a, byte for byte. "and you can download
      // it from your account" ships because the Invoices card (/dashboard/settings) has the PDF.
      a: 'Yes. Prices shown include GST. After each payment we email you a GST tax invoice from Lawie, and you can download it from your account.',
    },
  ],
};

const SECTION = 'px-nl-4 py-nl-12 min-[900px]:px-nl-8 min-[900px]:py-nl-16';
/** T-528 (Rajesh): one Wall ground; the next section opens with the 1px Line hairline (Wood is
 *  for the shelf edge, skeletons and dividers, never a section band). */
const RULED = 'border-t border-nl-line';

export default function PricingPage() {
  const cards = planCards('en');
  return (
    <div lang="en" className="nl nl-root min-h-[100svh] overflow-x-clip">
      <NightTopBar showNav anchorBase="/" />
      <main>
        <section className={SECTION} aria-labelledby="pricing-heading">
          <div className="mx-auto w-full max-w-[1180px]">
            <h1 id="pricing-heading" className="nl-h1 text-nl-text">
              {PRICING_COPY.title}
            </h1>
            <p className="nl-body text-nl-soft mt-nl-3 max-w-[65ch]">{PRICES_INTRO.en}</p>
            {/* T-528: three columns from 1024px. At 900 a column is too narrow for "₹1,999 a month" in
                Tiro 34px, and the Pro price wrapped out of line with the other two. */}
            <div className="mt-nl-8 gap-nl-4 grid grid-cols-1 min-[640px]:grid-cols-2 min-[1024px]:grid-cols-3">
              <NightPlanCard
                testId="free"
                name={cards.free.name}
                price={cards.free.price}
                ink={cards.free.ink}
                includes={cards.free.includes}
                button={cards.free.button}
                href={SIGNUP_HREF}
                headingLevel="h2"
              />
              <NightPlanCard
                testId="solo"
                name={cards.solo.name}
                price={cards.solo.price}
                ink={cards.solo.ink}
                includes={cards.solo.includes}
                button={cards.solo.button}
                href={SIGNUP_HREF}
                headingLevel="h2"
              />
              <NightPlanCard
                testId="pro"
                name={PRICING_COPY.pro.name}
                subline={PRICING_COPY.pro.subline}
                price={PRICING_COPY.pro.price}
                ink={PRICING_COPY.pro.ink}
                includes={PRICING_COPY.pro.includes}
                button={PRICING_COPY.pro.button}
                href={SIGNUP_HREF}
                headingLevel="h2"
              />
            </div>
            <p className="nl-body-sm text-nl-soft mt-nl-4 max-w-[65ch]">
              {PRICING_COPY.underCards}
            </p>
            <p className="nl-body text-nl-soft mt-nl-6 max-w-[65ch]">{TOP_UP_LINE.en}</p>
          </div>
        </section>

        <section className={`${SECTION} ${RULED}`} aria-labelledby="pricing-faq-heading">
          <div className="mx-auto w-full max-w-[1180px]">
            <h2 id="pricing-faq-heading" className="nl-h1 text-nl-text">
              {PRICING_COPY.faqTitle}
            </h2>
            <div className="mt-nl-6">
              <NightFaq items={PRICING_COPY.faq} />
            </div>
          </div>
        </section>
      </main>
      <NightFooter />
    </div>
  );
}
